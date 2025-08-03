import { v4 as uuidv4 } from 'uuid'
import { ConversionSession, ProgressClient, ProgressEvent, ProgressEventType, ProgressEventFactory, ProgressEventData } from './progress-types'

export class ProgressSessionManager {
  private static instance: ProgressSessionManager
  private sessions: Map<string, ConversionSession> = new Map()
  private clients: Map<string, ProgressClient> = new Map()
  private sessionClients: Map<string, Set<string>> = new Map()
  
  private readonly SESSION_TIMEOUT = 1000 * 60 * 30 // 30 minutes
  private readonly CLIENT_TIMEOUT = 1000 * 60 * 5   // 5 minutes
  private readonly CLEANUP_INTERVAL = 1000 * 60     // 1 minute
  
  private cleanupInterval?: NodeJS.Timeout

  private constructor() {
    this.startCleanup()
  }

  static getInstance(): ProgressSessionManager {
    if (!ProgressSessionManager.instance) {
      ProgressSessionManager.instance = new ProgressSessionManager()
    }
    return ProgressSessionManager.instance
  }

  // Session Management
  createSession(totalFiles: number = 0): string {
    const sessionId = uuidv4()
    const session: ConversionSession = {
      id: sessionId,
      startTime: Date.now(),
      status: 'active',
      totalFiles,
      completedFiles: 0,
      errors: [],
      warnings: [],
      results: [],
      lastUpdate: Date.now(),
      clientCount: 0
    }
    
    this.sessions.set(sessionId, session)
    this.sessionClients.set(sessionId, new Set())
    
    console.log(`📊 Created session ${sessionId} for ${totalFiles} files`)
    return sessionId
  }

  getSession(sessionId: string): ConversionSession | undefined {
    return this.sessions.get(sessionId)
  }

  updateSession(sessionId: string, updates: Partial<ConversionSession>): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      Object.assign(session, updates, { lastUpdate: Date.now() })
      this.sessions.set(sessionId, session)
    }
  }

  completeSession(sessionId: string, results: any = []): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = 'completed'
      session.results = results
      session.lastUpdate = Date.now()
      
      this.broadcastToSession(sessionId, ProgressEventFactory.create(
        sessionId,
        'conversion_complete',
        {
          totalFiles: session.totalFiles,
          completedFiles: session.completedFiles,
          results,
          overallPercentage: 100
        }
      ))
      
      console.log(`✅ Completed session ${sessionId}`)
    }
  }

  errorSession(sessionId: string, error: string, errorStack?: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = 'error'
      session.errors.push(error)
      session.lastUpdate = Date.now()
      
      this.broadcastToSession(sessionId, ProgressEventFactory.create(
        sessionId,
        'conversion_error',
        { error, errorStack }
      ))
      
      console.error(`❌ Session ${sessionId} error: ${error}`)
    }
  }

  // Client Management
  addClient(sessionId: string, controller: ReadableStreamDefaultController): string {
    const clientId = uuidv4()
    const client: ProgressClient = {
      id: clientId,
      sessionId,
      controller,
      lastPing: Date.now()
    }
    
    this.clients.set(clientId, client)
    
    const sessionClientSet = this.sessionClients.get(sessionId)
    if (sessionClientSet) {
      sessionClientSet.add(clientId)
    }
    
    // Update session client count
    const session = this.sessions.get(sessionId)
    if (session) {
      session.clientCount = sessionClientSet?.size || 0
    }
    
    console.log(`🔗 Client ${clientId} connected to session ${sessionId}`)
    
    // Send initial session state
    const sessionData = this.getSession(sessionId)
    if (sessionData) {
      this.sendToClient(clientId, ProgressEventFactory.create(
        sessionId,
        'connection_established',
        {
          totalFiles: sessionData.totalFiles,
          completedFiles: sessionData.completedFiles,
          currentFile: sessionData.currentFile,
          overallPercentage: sessionData.totalFiles > 0 
            ? (sessionData.completedFiles / sessionData.totalFiles) * 100 
            : 0
        }
      ))
    }
    
    return clientId
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId)
    if (client) {
      const sessionClientSet = this.sessionClients.get(client.sessionId)
      if (sessionClientSet) {
        sessionClientSet.delete(clientId)
        
        // Update session client count
        const session = this.sessions.get(client.sessionId)
        if (session) {
          session.clientCount = sessionClientSet.size
        }
      }
      
      this.clients.delete(clientId)
      console.log(`🔌 Client ${clientId} disconnected from session ${client.sessionId}`)
    }
  }

  // Progress Broadcasting
  broadcastProgress(
    sessionId: string, 
    type: ProgressEventType, 
    data: ProgressEventData = {}
  ): void {
    const event = ProgressEventFactory.create(sessionId, type, data)
    
    // Update session state based on progress
    this.updateSessionFromProgress(sessionId, event)
    
    // Broadcast to all clients for this session
    this.broadcastToSession(sessionId, event)
  }

  private broadcastToSession(sessionId: string, event: ProgressEvent): void {
    const sessionClientSet = this.sessionClients.get(sessionId)
    if (sessionClientSet) {
      for (const clientId of sessionClientSet) {
        this.sendToClient(clientId, event)
      }
    }
  }

  private sendToClient(clientId: string, event: ProgressEvent): void {
    const client = this.clients.get(clientId)
    if (client) {
      try {
        const sseData = ProgressEventFactory.toSSE(event)
        client.controller.enqueue(new TextEncoder().encode(sseData))
        client.lastPing = Date.now()
      } catch (error) {
        console.error(`Failed to send to client ${clientId}:`, error)
        this.removeClient(clientId)
      }
    }
  }

  private updateSessionFromProgress(sessionId: string, event: ProgressEvent): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    
    const { data } = event
    
    switch (event.type) {
      case 'conversion_start':
        session.status = 'active'
        session.startTime = Date.now()
        if (data.totalFiles) session.totalFiles = data.totalFiles
        break
        
      case 'file_start':
        if (data.currentFile) session.currentFile = data.currentFile
        break
        
      case 'file_complete':
        session.completedFiles += 1
        if (data.message) session.warnings.push(data.message)
        break
        
      case 'file_error':
        if (data.error) session.errors.push(data.error)
        break
        
      case 'conversion_complete':
        session.status = 'completed'
        if (data.results) session.results = data.results
        break
        
      case 'conversion_error':
        session.status = 'error'
        if (data.error) session.errors.push(data.error)
        break
    }
    
    // Calculate estimated completion time
    if (session.completedFiles > 0 && session.totalFiles > 0) {
      const elapsed = Date.now() - session.startTime
      const avgTimePerFile = elapsed / session.completedFiles
      const remainingFiles = session.totalFiles - session.completedFiles
      session.estimatedCompletionTime = Date.now() + (avgTimePerFile * remainingFiles)
    }
    
    session.lastUpdate = Date.now()
  }

  // Cleanup and Maintenance
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, this.CLEANUP_INTERVAL)
  }

  private cleanup(): void {
    const now = Date.now()
    
    // Clean up expired sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastUpdate > this.SESSION_TIMEOUT) {
        this.cleanupSession(sessionId)
      }
    }
    
    // Clean up stale clients
    for (const [clientId, client] of this.clients.entries()) {
      if (now - client.lastPing > this.CLIENT_TIMEOUT) {
        this.removeClient(clientId)
      }
    }
  }

  private cleanupSession(sessionId: string): void {
    // Notify clients of session expiration
    this.broadcastToSession(sessionId, ProgressEventFactory.create(
      sessionId,
      'session_expired'
    ))
    
    // Remove all clients for this session
    const sessionClientSet = this.sessionClients.get(sessionId)
    if (sessionClientSet) {
      for (const clientId of sessionClientSet) {
        this.removeClient(clientId)
      }
    }
    
    // Remove session data
    this.sessions.delete(sessionId)
    this.sessionClients.delete(sessionId)
    
    console.log(`🧹 Cleaned up expired session ${sessionId}`)
  }

  // Utility methods
  getActiveSessionCount(): number {
    return Array.from(this.sessions.values())
      .filter(session => session.status === 'active').length
  }

  getClientCount(): number {
    return this.clients.size
  }

  getSessionStats(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    
    const elapsed = Date.now() - session.startTime
    const filesPerSecond = session.completedFiles > 0 
      ? session.completedFiles / (elapsed / 1000) 
      : 0
    
    return {
      ...session,
      elapsed,
      filesPerSecond,
      completionPercentage: session.totalFiles > 0 
        ? (session.completedFiles / session.totalFiles) * 100 
        : 0
    }
  }

  // Cleanup on shutdown
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    
    // Close all client connections
    for (const client of this.clients.values()) {
      try {
        client.controller.close()
      } catch (error) {
        // Ignore errors when closing
      }
    }
    
    this.sessions.clear()
    this.clients.clear()
    this.sessionClients.clear()
  }
}
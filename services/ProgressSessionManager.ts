import { ConversionSession, ProgressClient, ProgressEvent, ProgressEventType, ProgressEventFactory, ProgressEventData } from './progress-types'
import { randomUUID } from 'crypto'
import { SessionReadyManager } from './SessionReadyManager'

export class ProgressSessionManager {
  private static instance: ProgressSessionManager
  private static instancePromise: Promise<ProgressSessionManager> | null = null
  private sessions: Map<string, ConversionSession> = new Map()
  private clients: Map<string, ProgressClient> = new Map()
  private sessionClients: Map<string, Set<string>> = new Map()
  
  private readonly SESSION_TIMEOUT = 1000 * 60 * 30 // 30 minutes
  private readonly CLIENT_TIMEOUT = 1000 * 60 * 5   // 5 minutes
  private readonly CLEANUP_INTERVAL = 1000 * 60     // 1 minute
  
  private cleanupInterval?: NodeJS.Timeout
  private isInitialized = false

  private constructor() {
    console.log('📊 [SessionManager] Initializing ProgressSessionManager')
    this.initialize()
  }

  private async initialize() {
    try {
      await this.startCleanup()
      this.isInitialized = true
      console.log('📊 [SessionManager] ProgressSessionManager initialized successfully')
    } catch (error) {
      console.error('❌ [SessionManager] Failed to initialize ProgressSessionManager:', error)
      throw error
    }
  }

  static getInstance(): ProgressSessionManager {
    try {
      if (!ProgressSessionManager.instance) {
        console.log('📊 [SessionManager] Creating new singleton instance')
        ProgressSessionManager.instance = new ProgressSessionManager()
      } else {
        console.log('📊 [SessionManager] Returning existing singleton instance')
      }
      
      // Verify instance is properly initialized
      if (!ProgressSessionManager.instance.isInitialized) {
        console.warn('⚠️ [SessionManager] Instance not fully initialized yet')
      }
      
      return ProgressSessionManager.instance
    } catch (error) {
      console.error('❌ [SessionManager] Failed to get singleton instance:', error)
      throw new Error(`Singleton initialization failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Health check method for serverless environments
  public isHealthy(): boolean {
    return this.isInitialized && 
           this.sessions !== undefined && 
           this.clients !== undefined && 
           this.sessionClients !== undefined
  }

  // UUID generation with fallback
  private generateUUID(): string {
    try {
      // Use Node.js built-in crypto.randomUUID (Node 19+)
      return randomUUID()
    } catch (error) {
      console.warn('crypto.randomUUID not available, using fallback UUID generation')
      // Fallback to simple UUID v4 implementation
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    }
  }

  // Session Management
  createSession(totalFiles: number = 0): string {
    try {
      const sessionId = this.generateUUID()
      console.log(`📊 Generating session ID: ${sessionId}`)
      
      // Register session as pending with SessionReadyManager
      const sessionReadyManager = SessionReadyManager.getInstance()
      sessionReadyManager.registerPendingSession(sessionId)
      
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
      
      // Mark session as ready for connections
      sessionReadyManager.markSessionReady(sessionId)
      
      console.log(`📊 Successfully created session ${sessionId} for ${totalFiles} files`)
      console.log(`📊 Total active sessions: ${this.sessions.size}`)
      
      return sessionId
    } catch (error) {
      console.error('❌ Failed to create session:', error)
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        totalFiles,
        timestamp: new Date().toISOString()
      })
      throw new Error(`Session creation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  getSession(sessionId: string): ConversionSession | undefined {
    return this.sessions.get(sessionId)
  }
  
  sessionExists(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }
  
  getSessionStatus(sessionId: string): string | null {
    const session = this.sessions.get(sessionId)
    return session ? session.status : null
  }

  updateSession(sessionId: string, updates: Partial<ConversionSession>): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      Object.assign(session, updates, { lastUpdate: Date.now() })
      this.sessions.set(sessionId, session)
    }
  }

  completeSession(sessionId: string, results: any = []): void {
    console.log(`🔔 [SessionManager] Completing session ${sessionId} with results:`, results);
    const session = this.sessions.get(sessionId)
    if (session) {
      const sessionClientSet = this.sessionClients.get(sessionId);
      const connectionCount = sessionClientSet?.size || 0;
      console.log(`📊 [SessionManager] Session found: ${connectionCount} connections`);
      session.status = 'completed'
      session.results = results
      session.lastUpdate = Date.now()
      
      console.log(`📡 [SessionManager] Broadcasting conversion_complete to ${connectionCount} connections`);
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
      
      console.log(`✅ [SessionManager] Completed session ${sessionId}`)
    } else {
      console.log(`⚠️ [SessionManager] Session ${sessionId} not found for completion!`);
    }
      
    // Keep session alive for 30 seconds after completion to allow final SSE connections
    setTimeout(() => {
      this.cleanupSession(sessionId)
    }, 30000)
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
    const clientId = this.generateUUID()
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
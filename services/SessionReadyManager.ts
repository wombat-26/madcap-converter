/**
 * SessionReadyManager - Manages session readiness state to prevent race conditions
 * between session creation and SSE connection establishment
 */
export class SessionReadyManager {
  private static instance: SessionReadyManager
  private sessionReadyPromises: Map<string, Promise<void>> = new Map()
  private sessionReadyResolvers: Map<string, () => void> = new Map()
  
  private constructor() {}
  
  static getInstance(): SessionReadyManager {
    if (!SessionReadyManager.instance) {
      SessionReadyManager.instance = new SessionReadyManager()
    }
    return SessionReadyManager.instance
  }
  
  /**
   * Register a session as pending initialization
   */
  registerPendingSession(sessionId: string): void {
    if (this.sessionReadyPromises.has(sessionId)) {
      return // Already registered
    }
    
    const promise = new Promise<void>((resolve) => {
      this.sessionReadyResolvers.set(sessionId, resolve)
    })
    
    this.sessionReadyPromises.set(sessionId, promise)
    
    // Auto-cleanup after 30 seconds to prevent memory leaks
    setTimeout(() => {
      this.cleanup(sessionId)
    }, 30000)
  }
  
  /**
   * Mark a session as ready for connections
   */
  markSessionReady(sessionId: string): void {
    const resolver = this.sessionReadyResolvers.get(sessionId)
    if (resolver) {
      resolver()
      this.sessionReadyResolvers.delete(sessionId)
    }
  }
  
  /**
   * Wait for a session to be ready (with timeout)
   */
  async waitForSession(sessionId: string, timeoutMs: number = 5000): Promise<boolean> {
    const readyPromise = this.sessionReadyPromises.get(sessionId)
    
    if (!readyPromise) {
      // Session not in pending state - assume it's ready
      return true
    }
    
    try {
      await Promise.race([
        readyPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session ready timeout')), timeoutMs)
        )
      ])
      return true
    } catch (error) {
      console.error(`Session ${sessionId} readiness timeout after ${timeoutMs}ms`)
      return false
    } finally {
      // Cleanup after waiting
      this.cleanup(sessionId)
    }
  }
  
  /**
   * Clean up session readiness tracking
   */
  private cleanup(sessionId: string): void {
    this.sessionReadyPromises.delete(sessionId)
    this.sessionReadyResolvers.delete(sessionId)
  }
  
  /**
   * Check if a session is pending initialization
   */
  isSessionPending(sessionId: string): boolean {
    return this.sessionReadyPromises.has(sessionId)
  }
}
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let body: any = null
  
  try {
    console.log('📊 [Progress API] Starting session creation request')
    
    // Parse request body with detailed logging
    try {
      body = await request.json()
      console.log('📊 [Progress API] Request body parsed:', body)
    } catch (parseError) {
      console.error('❌ [Progress API] Failed to parse request body:', parseError)
      throw new Error(`Invalid JSON in request body: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
    }
    
    const { totalFiles = 0 } = body
    console.log(`📊 [Progress API] Creating session for ${totalFiles} files`)
    
    // Import ProgressSessionManager with error handling
    let ProgressSessionManager: any
    try {
      const module = await import('../../../services/ProgressSessionManager')
      ProgressSessionManager = module.ProgressSessionManager
      console.log('📊 [Progress API] ProgressSessionManager imported successfully')
    } catch (importError) {
      console.error('❌ [Progress API] Failed to import ProgressSessionManager:', importError)
      throw new Error(`Module import failed: ${importError instanceof Error ? importError.message : String(importError)}`)
    }
    
    // Get singleton instance and create session
    let sessionManager: any
    let sessionId: string
    
    try {
      sessionManager = ProgressSessionManager.getInstance()
      console.log('📊 [Progress API] SessionManager instance obtained')
      
      // Health check for serverless environments
      if (typeof sessionManager.isHealthy === 'function' && !sessionManager.isHealthy()) {
        console.warn('⚠️ [Progress API] SessionManager health check failed, will continue with existing instance')
        // Note: Cannot create new instance due to private constructor
        // Will rely on the existing singleton pattern and error handling
      }
      
      // Ensure proper initialization before creating session
      await new Promise(resolve => setTimeout(resolve, 10))
      
      sessionId = sessionManager.createSession(totalFiles)
      console.log(`📊 [Progress API] Session created successfully: ${sessionId}`)
      
      // Verify session was created successfully
      const createdSession = sessionManager.getSession(sessionId)
      if (!createdSession) {
        throw new Error('Session creation verification failed')
      }
    } catch (sessionError) {
      console.error('❌ [Progress API] Session creation failed:', sessionError)
      throw new Error(`Session creation error: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`)
    }
    
    const duration = Date.now() - startTime
    console.log(`📊 [Progress API] Request completed successfully in ${duration}ms`)
    
    return NextResponse.json({ 
      sessionId,
      message: 'Progress session created successfully',
      debug: {
        totalFiles,
        duration,
        timestamp: new Date().toISOString()
      }
    })
    
  } catch (error) {
    const duration = Date.now() - startTime
    
    console.error('❌ [Progress API] Request failed:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration,
      body,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      contentType: request.headers.get('content-type')
    })
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return new NextResponse(`Failed to create progress session: ${errorMessage}`, { 
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'X-Error-Timestamp': new Date().toISOString(),
        'X-Request-Duration': duration.toString()
      }
    })
  }
}

export async function GET() {
  try {
    // Use dynamic import to avoid ES module issues
    const { ProgressSessionManager } = await import('../../../services/ProgressSessionManager')
    const sessionManager = ProgressSessionManager.getInstance()
    
    const stats = {
      activeSessions: sessionManager.getActiveSessionCount(),
      totalClients: sessionManager.getClientCount(),
    }
    
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Failed to get progress stats:', error)
    console.error('Error details:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new NextResponse(`Failed to get progress stats: ${errorMessage}`, { status: 500 })
  }
}
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params
  
  if (!sessionId) {
    return new NextResponse('Session ID is required', { status: 400 })
  }

  // Use dynamic imports to avoid ES module issues
  const { ProgressSessionManager } = await import('../../../../services/ProgressSessionManager')
  const { ProgressEventFactory } = await import('../../../../services/progress-types')
  const { SessionReadyManager } = await import('../../../../services/SessionReadyManager')
  
  // Get the session manager instance
  const sessionManager = ProgressSessionManager.getInstance()
  const sessionReadyManager = SessionReadyManager.getInstance()
  
  // Check if session is pending and wait for it to be ready
  if (sessionReadyManager.isSessionPending(sessionId)) {
    console.log(`⏳ Session ${sessionId} is pending initialization, waiting...`)
    const isReady = await sessionReadyManager.waitForSession(sessionId, 5000)
    if (!isReady) {
      console.error(`❌ Session ${sessionId} initialization timeout`)
      return new NextResponse('Session initialization timeout', { status: 408 })
    }
  }
  
  // Check if session exists
  console.log(`🔍 Looking for session ${sessionId}`)
  console.log(`📊 Active sessions: ${sessionManager.getActiveSessionCount()}`)
  console.log(`👥 Total clients: ${sessionManager.getClientCount()}`)
  
  const session = sessionManager.getSession(sessionId)
  if (!session) {
    console.error(`❌ Session ${sessionId} not found. Available sessions:`, Array.from(sessionManager['sessions'].keys()))
    return new NextResponse('Session not found', { status: 404 })
  }
  
  console.log(`✅ Found session ${sessionId}:`, session.status)
  
  // If session is already completed, send completion event immediately and close
  if (session.status === 'completed') {
    console.log(`📋 Session ${sessionId} already completed, sending completion event`)
    const completionStream = new ReadableStream({
      start(controller) {
        const completionEvent = ProgressEventFactory.create(sessionId, 'conversion_complete', {
          totalFiles: session.totalFiles,
          completedFiles: session.completedFiles,
          results: session.results,
          overallPercentage: 100
        })
        controller.enqueue(new TextEncoder().encode(ProgressEventFactory.toSSE(completionEvent)))
        setTimeout(() => controller.close(), 100)
      }
    })
    
    return new NextResponse(completionStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  // Create a ReadableStream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      console.log(`📡 Client connecting to session ${sessionId}`)
      
      // Add client to session manager
      const clientId = sessionManager.addClient(sessionId, controller)
      
      // Send initial heartbeat
      const heartbeat = ProgressEventFactory.heartbeat(sessionId)
      controller.enqueue(new TextEncoder().encode(heartbeat))
      
      // Set up heartbeat interval to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = ProgressEventFactory.heartbeat(sessionId)
          controller.enqueue(new TextEncoder().encode(heartbeat))
        } catch (error) {
          console.error('Heartbeat failed:', error)
          clearInterval(heartbeatInterval)
          sessionManager.removeClient(clientId)
        }
      }, 30000) // Send heartbeat every 30 seconds
      
      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        console.log(`📡 Client disconnected from session ${sessionId}`)
        clearInterval(heartbeatInterval)
        sessionManager.removeClient(clientId)
        controller.close()
      })
    },
    
    cancel() {
      console.log(`📡 Stream cancelled for session ${sessionId}`)
    }
  })

  // Return SSE response
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { totalFiles = 0 } = body
    
    // Use dynamic import to avoid ES module issues
    const { ProgressSessionManager } = await import('../../../services/ProgressSessionManager')
    const sessionManager = ProgressSessionManager.getInstance()
    const sessionId = sessionManager.createSession(totalFiles)
    
    return NextResponse.json({ 
      sessionId,
      message: 'Progress session created successfully'
    })
  } catch (error) {
    console.error('Failed to create progress session:', error)
    console.error('Error details:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new NextResponse(`Failed to create progress session: ${errorMessage}`, { status: 500 })
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
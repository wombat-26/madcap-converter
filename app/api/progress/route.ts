import { NextRequest, NextResponse } from 'next/server'
import { ProgressSessionManager } from '../../../services/ProgressSessionManager'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { totalFiles = 0 } = body
    
    const sessionManager = ProgressSessionManager.getInstance()
    const sessionId = sessionManager.createSession(totalFiles)
    
    return NextResponse.json({ 
      sessionId,
      message: 'Progress session created successfully'
    })
  } catch (error) {
    console.error('Failed to create progress session:', error)
    return new NextResponse('Failed to create progress session', { status: 500 })
  }
}

export async function GET() {
  try {
    const sessionManager = ProgressSessionManager.getInstance()
    
    const stats = {
      activeSessions: sessionManager.getActiveSessionCount(),
      totalClients: sessionManager.getClientCount(),
    }
    
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Failed to get progress stats:', error)
    return new NextResponse('Failed to get progress stats', { status: 500 })
  }
}
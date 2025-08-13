import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
  }

  try {
    const { ProgressSessionManager } = await import('../../../../../services/ProgressSessionManager')
    const sessionManager = ProgressSessionManager.getInstance()

    const session = sessionManager.getSession(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({ session })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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


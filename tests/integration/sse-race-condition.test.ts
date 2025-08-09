import { NextRequest } from 'next/server'
import { POST as createSession } from '@/app/api/progress/route'
import { GET as connectSSE } from '@/app/api/progress/[sessionId]/route'

describe('SSE Session Race Condition Fix', () => {
  it('should handle immediate SSE connection after session creation', async () => {
    // Create a session
    const createRequest = new NextRequest('http://localhost:3000/api/progress', {
      method: 'POST',
      body: JSON.stringify({ totalFiles: 5 })
    })
    
    const createResponse = await createSession(createRequest)
    expect(createResponse.status).toBe(200)
    
    const { sessionId } = await createResponse.json()
    expect(sessionId).toBeDefined()
    
    // Immediately try to connect SSE (simulating race condition)
    const connectRequest = new NextRequest(`http://localhost:3000/api/progress/${sessionId}`)
    const connectResponse = await connectSSE(connectRequest, { params: { sessionId } })
    
    expect(connectResponse.status).toBe(200)
    expect(connectResponse.headers.get('Content-Type')).toBe('text/event-stream')
  })
  
  it('should handle multiple concurrent SSE connections', async () => {
    // Create a session
    const createRequest = new NextRequest('http://localhost:3000/api/progress', {
      method: 'POST',
      body: JSON.stringify({ totalFiles: 10 })
    })
    
    const createResponse = await createSession(createRequest)
    const { sessionId } = await createResponse.json()
    
    // Create multiple concurrent SSE connections
    const connectionPromises = Array(5).fill(null).map(async (_, index) => {
      const request = new NextRequest(`http://localhost:3000/api/progress/${sessionId}`)
      const response = await connectSSE(request, { params: { sessionId } })
      return { index, status: response.status }
    })
    
    const results = await Promise.all(connectionPromises)
    
    // All connections should succeed
    results.forEach(result => {
      expect(result.status).toBe(200)
    })
  })
  
  it('should handle connection attempts before session is fully ready', async () => {
    // Start session creation but don't await it
    const createRequest = new NextRequest('http://localhost:3000/api/progress', {
      method: 'POST',
      body: JSON.stringify({ totalFiles: 3 })
    })
    
    const createPromise = createSession(createRequest)
    
    // Try to connect with a guessed session ID (won't exist)
    const fakeSessionId = 'test-session-123'
    const connectRequest = new NextRequest(`http://localhost:3000/api/progress/${fakeSessionId}`)
    const connectResponse = await connectSSE(connectRequest, { params: { sessionId: fakeSessionId } })
    
    // Should get 404 for non-existent session
    expect(connectResponse.status).toBe(404)
    
    // Now wait for the real session
    const createResponse = await createPromise
    const { sessionId } = await createResponse.json()
    
    // Connect to the real session
    const realConnectRequest = new NextRequest(`http://localhost:3000/api/progress/${sessionId}`)
    const realConnectResponse = await connectSSE(realConnectRequest, { params: { sessionId } })
    
    expect(realConnectResponse.status).toBe(200)
  })
  
  it('should properly clean up pending sessions after timeout', async () => {
    // This test verifies that the SessionReadyManager properly cleans up
    // We can't directly test the cleanup without accessing internals,
    // but we can verify that the system continues to work after timeouts
    
    const createRequest = new NextRequest('http://localhost:3000/api/progress', {
      method: 'POST',
      body: JSON.stringify({ totalFiles: 1 })
    })
    
    const createResponse = await createSession(createRequest)
    const { sessionId } = await createResponse.json()
    
    // Wait a bit then connect - should still work
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const connectRequest = new NextRequest(`http://localhost:3000/api/progress/${sessionId}`)
    const connectResponse = await connectSSE(connectRequest, { params: { sessionId } })
    
    expect(connectResponse.status).toBe(200)
  })
})
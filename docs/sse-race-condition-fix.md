# SSE Session Race Condition Fix

> Note: Early prototype — only working and tested with macOS and Linux file paths. Windows paths are not yet supported/verified.

## Problem

The MadCap Converter experienced race conditions when establishing Server-Sent Events (SSE) connections for progress tracking. The issue occurred when:

1. Client creates a session via `POST /api/progress`
2. Client immediately connects to SSE endpoint `/api/progress/{sessionId}`
3. SSE connection sometimes arrived before session was fully initialized in memory
4. Result: 404 errors or connection failures despite successful session creation

## Root Cause

The race condition was caused by:
- Asynchronous session creation without proper synchronization
- No mechanism to ensure session readiness before allowing connections
- Client-side artificial delays that were insufficient and unreliable
- Aggressive retry logic that could overwhelm the server

## Solution

### 1. SessionReadyManager

Created a new synchronization service that:
- Tracks pending session initialization
- Provides promise-based waiting mechanism
- Ensures sessions are ready before SSE connections proceed
- Auto-cleanup to prevent memory leaks

```typescript
// Register session as pending during creation
sessionReadyManager.registerPendingSession(sessionId)

// Create session...

// Mark as ready when initialization complete
sessionReadyManager.markSessionReady(sessionId)
```

### 2. SSE Endpoint Enhancement

The SSE endpoint now:
- Checks if session is pending initialization
- Waits up to 5 seconds for session to be ready
- Returns appropriate error codes (408 Timeout) if initialization fails
- Provides better logging for debugging

```typescript
if (sessionReadyManager.isSessionPending(sessionId)) {
  const isReady = await sessionReadyManager.waitForSession(sessionId, 5000)
  if (!isReady) {
    return new NextResponse('Session initialization timeout', { status: 408 })
  }
}
```

### 3. Client-Side Improvements

Enhanced the progress stream hook with:
- Exponential backoff for reconnection attempts
- Better error detection and handling
- Distinction between temporary and permanent errors
- Reduced noise from expected transient failures

```typescript
// Exponential backoff calculation
const backoffDelay = Math.min(reconnectDelay * Math.pow(1.5, reconnectAttempt), 10000)
```

### 4. Session Creation Verification

Added verification step after session creation:
- Confirms session exists in memory after creation
- Provides early failure detection
- Ensures data consistency

## Benefits

1. **Reliability**: Eliminates race conditions completely
2. **Performance**: Removes artificial delays, faster connection establishment
3. **Scalability**: Better suited for serverless environments
4. **Debugging**: Improved logging and error messages
5. **User Experience**: Fewer connection errors and retries

## Testing

Created comprehensive integration tests that verify:
- Immediate SSE connections after session creation
- Multiple concurrent connections
- Proper error handling for non-existent sessions
- System resilience after timeouts

## Migration Notes

No API changes required. The fix is backward compatible and transparent to clients. Existing retry logic will continue to work but should encounter fewer errors.

## Monitoring

Key metrics to monitor:
- SSE connection success rate (should be near 100%)
- Session initialization timeout events (should be rare)
- Average time to establish SSE connection (should be < 100ms)

## Future Improvements

1. Consider using Redis or similar for distributed session state
2. Implement session pre-warming for predictable workloads
3. Add metrics collection for session lifecycle events

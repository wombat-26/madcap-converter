# Server Stability Guide

## Overview

The MadCap Converter uses a Next.js frontend that communicates with an MCP (Model Context Protocol) server backend via an API route. This guide covers common issues and solutions for stable server operation.

## Quick Start

### Recommended Development Setup

```bash
# Option 1: Use the safe startup script (recommended)
npm run dev:ui:safe

# Option 2: Use standard Next.js dev server
npm run dev:ui
```

The `dev:ui:safe` script includes:
- Port availability checking
- Health check verification
- Automatic retry logic
- MCP API testing

## Common Issues and Solutions

### 1. "MCP request failed: Load failed"

**Cause**: The UI server is running but cannot communicate with the MCP backend.

**Solutions**:
- Ensure the MCP server binary is built: `npm run build`
- Check if `/api/mcp` route is accessible: `curl http://localhost:3000/api/health`
- Clear Next.js cache: `npm run clean:cache`

### 2. Port Already in Use

**Cause**: Another process is using port 3000.

**Solutions**:
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev:ui
```

### 3. Server Startup Failures

**Cause**: Cached build files or dependency issues.

**Solutions**:
```bash
# Full cleanup and restart
npm run clean
npm install
npm run build
npm run dev:ui:safe
```

## Architecture Details

### Request Flow
1. UI Component → MCP Client (browser)
2. MCP Client → `/api/mcp` route (HTTP POST)
3. API Route → MCP Server Process (stdio)
4. MCP Server → Response → API Route → Client

### Key Components

- **MCP Client** (`lib/mcp-client.ts`): 
  - Handles HTTP communication with API
  - Includes retry logic (3 attempts)
  - 5-minute timeout for long operations
  - Health check on initialization

- **API Route** (`app/api/mcp/route.ts`):
  - Spawns MCP server process per request
  - Manages process lifecycle
  - Garbage collection for stale processes
  - Error handling and logging

- **Health Endpoint** (`app/api/health/route.ts`):
  - Verifies MCP server availability
  - Checks file permissions
  - Reports system status

## Monitoring

### Health Check
```bash
# Check server health
curl http://localhost:3000/api/health | jq .

# Expected response:
{
  "status": "ok",
  "timestamp": "2024-06-23T10:00:00.000Z",
  "environment": "development",
  "mcpServer": {
    "path": "/path/to/build/index.js",
    "exists": true,
    "executable": true
  }
}
```

### Test MCP API
```bash
# Test MCP tools listing
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq .
```

## Production Considerations

1. **Environment Variables**:
   ```bash
   # Set custom MCP server path if needed
   export MCP_SERVER_PATH=/custom/path/to/mcp-server
   ```

2. **Process Management**: 
   - Consider using PM2 or similar for production
   - Enable process monitoring and auto-restart

3. **Timeouts**:
   - API route timeout: 5 minutes (configurable via `maxDuration`)
   - MCP client timeout: 5 minutes (hardcoded)
   - Adjust for large batch operations

## Troubleshooting Checklist

- [ ] MCP server binary exists and is executable
- [ ] No port conflicts on 3000
- [ ] Next.js cache cleared if needed
- [ ] Dependencies installed correctly
- [ ] TypeScript compiled successfully
- [ ] Health endpoint returns OK
- [ ] MCP API responds to test requests
- [ ] No stale processes running

## Development Scripts

```bash
# Build everything
npm run build:all

# Clean everything
npm run clean

# Clear caches
npm run clean:cache

# Run health check
npm run health

# Safe development mode
npm run dev:ui:safe
```
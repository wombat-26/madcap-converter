#!/usr/bin/env node

import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFileSync } from 'fs';

const MAX_RETRIES = 5;
const RETRY_DELAY = 2000;
const PORT = process.env.PORT || 3000;

// Simple health check server for testing
function checkPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️  Port ${port} is already in use`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function waitForServer(url, maxRetries = MAX_RETRIES) {
  console.log(`⏳ Waiting for server at ${url}...`);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log('✅ Server is ready!');
        return true;
      }
    } catch (err) {
      // Server not ready yet
    }
    
    if (i < maxRetries - 1) {
      console.log(`   Retry ${i + 1}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
  
  console.error('❌ Server failed to start');
  return false;
}

async function startNextServer() {
  // Check if port is available
  const portAvailable = await checkPort(PORT);
  if (!portAvailable) {
    console.error(`❌ Port ${PORT} is already in use. Please stop the existing server or use a different port.`);
    process.exit(1);
  }

  console.log('🚀 Starting Next.js development server...');
  
  const nextProcess = spawn('npx', ['next', 'dev', '-p', PORT], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PORT) },
    shell: true
  });

  nextProcess.on('error', (err) => {
    console.error('❌ Failed to start Next.js:', err.message);
    process.exit(1);
  });

  nextProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ Next.js exited with code ${code}`);
      process.exit(code);
    }
  });

  // Wait for server to be ready
  setTimeout(async () => {
    const ready = await waitForServer(`http://localhost:${PORT}/api/health`);
    if (ready) {
      console.log(`\n🎉 Development server is running at http://localhost:${PORT}\n`);
      
      // Test MCP API endpoint
      try {
        const testResponse = await fetch(`http://localhost:${PORT}/api/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {}
          })
        });
        
        if (testResponse.ok) {
          const data = await testResponse.json();
          if (data.result && data.result.tools) {
            console.log(`✅ MCP API is working! Found ${data.result.tools.length} tools`);
          }
        } else {
          console.warn('⚠️  MCP API returned non-OK response');
        }
      } catch (err) {
        console.warn('⚠️  Could not test MCP API:', err.message);
      }
    }
  }, 3000);
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

// Start the server
startNextServer().catch(console.error);
import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';

// Configure API route timeout for long-running conversions
export const maxDuration = 300; // 5 minutes

// Global process tracking and garbage collection
class MCPProcessManager {
  private processes = new Set<ChildProcess>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Run garbage collection every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.garbageCollect();
    }, 30000);

    // Cleanup on process exit
    process.on('exit', () => {
      this.cleanup();
    });
    process.on('SIGTERM', () => {
      this.cleanup();
    });
    process.on('SIGINT', () => {
      this.cleanup();
    });
  }

  addProcess(child: ChildProcess): void {
    this.processes.add(child);
    
    // Auto-remove when process ends
    child.on('close', () => {
      this.processes.delete(child);
    });
    child.on('exit', () => {
      this.processes.delete(child);
    });
    child.on('error', () => {
      this.processes.delete(child);
    });
  }

  garbageCollect(): void {
    console.log(`[GC] Checking ${this.processes.size} MCP processes for cleanup`);
    
    for (const child of Array.from(this.processes)) {
      if (child.killed || child.exitCode !== null) {
        console.log(`[GC] Removing dead process PID ${child.pid}`);
        this.processes.delete(child);
      }
    }
    
    console.log(`[GC] ${this.processes.size} processes remaining after cleanup`);
  }

  killStaleProcesses(): void {
    console.log(`[GC] Force killing ${this.processes.size} stale processes`);
    
    for (const child of Array.from(this.processes)) {
      if (!child.killed) {
        console.log(`[GC] Force killing process PID ${child.pid}`);
        child.kill('SIGKILL');
      }
    }
    
    this.processes.clear();
  }

  cleanup(): void {
    console.log('[GC] Cleaning up all MCP processes');
    clearInterval(this.cleanupInterval);
    this.killStaleProcesses();
  }

  getActiveCount(): number {
    return this.processes.size;
  }
}

// Global instance
const processManager = new MCPProcessManager();

export async function POST(request: NextRequest) {
  let mcpRequest: any;
  
  try {
    mcpRequest = await request.json();
    console.log(`[${Date.now()}] Received MCP request:`, JSON.stringify(mcpRequest, null, 2));
    console.log(`[GC] Active processes: ${processManager.getActiveCount()}`);
    
    // Get server path from environment or use default
    const serverPath = process.env.MCP_SERVER_PATH || '/Users/meckardt/mecode/madcap-converter/build/index.js';
    console.log('Using MCP server path:', serverPath);
    
    // Check if server file exists
    const fs = await import('fs');
    if (!fs.existsSync(serverPath)) {
      console.error(`MCP server not found at: ${serverPath}`);
      
      // Try to build the server if it doesn't exist
      console.log('Attempting to build MCP server...');
      const { execSync } = await import('child_process');
      try {
        execSync('npm run build', { cwd: process.cwd(), stdio: 'inherit' });
        console.log('Build completed, checking server again...');
        
        if (!fs.existsSync(serverPath)) {
          throw new Error(`MCP server still not found after build at: ${serverPath}`);
        }
      } catch (buildError) {
        throw new Error(`Failed to build MCP server: ${buildError}`);
      }
    }
    console.log(`MCP server found at: ${serverPath}`);
    
    // Check if the server file is readable
    try {
      await fs.promises.access(serverPath, fs.constants.R_OK);
      console.log('MCP server file is readable');
    } catch (error) {
      console.error('MCP server file is not readable:', error);
      throw new Error(`MCP server file is not readable: ${serverPath}`);
    }
    
    const result = await sendMCPRequest(mcpRequest, serverPath);
    console.log(`[${Date.now()}] MCP response received, length:`, JSON.stringify(result).length);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error(`[${Date.now()}] MCP API error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal error';
    console.error('Error details:', errorMessage);
    
    return NextResponse.json(
      { 
        jsonrpc: "2.0", 
        id: mcpRequest?.id || 1, 
        error: { 
          code: -32603, 
          message: errorMessage 
        } 
      },
      { status: 500 }
    );
  }
}

async function sendMCPRequest(request: any, serverPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    let isResolved = false;
    
    // Set a timeout for the request (5 minutes for folder conversions)
    const timeout = setTimeout(() => {
      if (!isResolved && child && !child.killed) {
        console.log(`[GC] Killing timed out process PID ${child.pid}`);
        child.kill('SIGKILL');
        isResolved = true;
        reject(new Error('MCP request timed out after 5 minutes'));
      }
    }, 300000);

    const cleanup = () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
      }
    };

    console.log(`[${Date.now()}] Spawning MCP server with path:`, serverPath);
    child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      detached: false
    });
    
    if (!child.pid) {
      cleanup();
      reject(new Error('Failed to spawn MCP server process'));
      return;
    }
    
    console.log(`[${Date.now()}] MCP server process spawned with PID:`, child.pid);
    
    // Register with process manager for garbage collection
    processManager.addProcess(child);

    let stdout = '';
    let stderr = '';
    let responseReceived = false;

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      console.log(`[${Date.now()}] Received stdout chunk length:`, chunk.length);
      
      // Try to parse JSON only if we have a complete JSON object
      if (!isResolved) {
        try {
          const trimmed = stdout.trim();
          // Only try parsing if it looks like complete JSON (starts with { and ends with })
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            const response = JSON.parse(trimmed);
            console.log(`[${Date.now()}] Successfully parsed response, letting process exit naturally...`);
            
            cleanup();
            resolve(response);
            
            // Allow MCP server to exit gracefully
            if (child.stdin && !child.stdin.destroyed) {
              child.stdin.end();
            }
          }
        } catch (e) {
          // Not complete JSON yet, continue collecting
          console.log(`[${Date.now()}] Partial JSON received, continuing...`);
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      console.log('Received stderr chunk:', chunk);
    });

    child.on('close', (code: number | null) => {
      console.log(`[${Date.now()}] MCP server process PID ${child.pid} closed with code: ${code}`);
      
      if (isResolved) {
        console.log('[GC] Response already handled, ignoring close event');
        return;
      }
      
      cleanup();
      
      if (code === 0) {
        if (!stdout.trim()) {
          reject(new Error('MCP server returned empty response'));
          return;
        }
        
        try {
          const response = JSON.parse(stdout.trim());
          console.log(`[${Date.now()}] Parsed response from close event, resolving...`);
          resolve(response);
        } catch (error) {
          console.error('Parse error:', error);
          console.error('Raw stdout:', stdout);
          reject(new Error(`Failed to parse MCP response: ${error}\nStdout: ${stdout.substring(0, 500)}...`));
        }
      } else {
        reject(new Error(`MCP server failed (code ${code}): ${stderr || 'No error output'}`));
      }
    });

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      console.log(`[${Date.now()}] MCP server PID ${child.pid} exited with code ${code} and signal ${signal}`);
    });

    child.on('error', (error: Error) => {
      console.error(`[${Date.now()}] Child process error for PID ${child.pid}:`, error);
      if (!isResolved) {
        cleanup();
        reject(new Error(`Failed to spawn MCP server: ${error.message}`));
      }
    });

    // Send the request
    try {
      const requestJson = JSON.stringify(request) + '\n';
      console.log(`[${Date.now()}] Sending request to MCP server PID ${child.pid}:`, request.method || 'unknown method');
      
      if (!child.stdin || child.stdin.destroyed) {
        cleanup();
        reject(new Error('MCP server stdin is not available'));
        return;
      }
      
      child.stdin.write(requestJson, 'utf8', (error) => {
        if (error) {
          console.error(`[${Date.now()}] Error writing to MCP server:`, error);
          if (!isResolved) {
            cleanup();
            reject(new Error(`Failed to write to MCP server: ${error.message}`));
          }
        } else {
          console.log(`[${Date.now()}] Request sent successfully to PID ${child.pid}`);
        }
      });
      
      child.stdin.end();
    } catch (error) {
      console.error(`[${Date.now()}] Exception writing to MCP server:`, error);
      cleanup();
      reject(new Error(`Failed to write to MCP server: ${error}`));
    }
  });
}
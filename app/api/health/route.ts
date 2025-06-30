import { NextResponse } from 'next/server';
import { existsSync } from 'fs';

export async function GET() {
  const serverPath = process.env.MCP_SERVER_PATH || '/Users/meckardt/mecode/madcap-converter/build/index.js';
  const mcpServerExists = existsSync(serverPath);
  
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mcpServer: {
      path: serverPath,
      exists: mcpServerExists,
      executable: mcpServerExists ? 'checking...' : false
    },
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };

  // Check if MCP server is executable
  if (mcpServerExists) {
    try {
      const { access, constants } = await import('fs/promises');
      await access(serverPath, constants.X_OK);
      health.mcpServer.executable = true;
    } catch {
      health.mcpServer.executable = false;
    }
  }

  return NextResponse.json(health);
}
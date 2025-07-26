import { NextRequest, NextResponse } from 'next/server';
import { SimpleBatchService } from '../../../src/core/simple-batch-service';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  const sessionId = randomUUID();
  const tempDir = join(tmpdir(), `discover-tocs-${sessionId}`);
  
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided' },
        { status: 400 }
      );
    }
    
    // Create temp directory
    const inputDir = join(tempDir, 'input');
    await mkdir(inputDir, { recursive: true });
    
    // Save uploaded files
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Use webkitRelativePath for folder uploads, otherwise use file.name
      const relativePath = (file as any).webkitRelativePath || file.name;
      const filePath = join(inputDir, relativePath);
      
      // Create subdirectories if needed
      const fileDir = join(inputDir, relativePath.substring(0, relativePath.lastIndexOf('/')));
      if (fileDir !== inputDir && relativePath.includes('/')) {
        await mkdir(fileDir, { recursive: true });
      }
      
      await writeFile(filePath, buffer);
    }
    
    // Discover TOCs
    const batchService = new SimpleBatchService();
    const tocDiscovery = await batchService.discoverTocs(inputDir);
    
    // Clean up temp directory
    const { rm } = await import('fs/promises');
    await rm(tempDir, { recursive: true, force: true });
    
    return NextResponse.json({
      success: true,
      tocFiles: tocDiscovery.tocFiles,
      tocStructures: tocDiscovery.tocStructures.map(toc => ({
        path: toc.path,
        title: toc.structure.title,
        entryCount: countEntries(toc.structure.entries)
      })),
      totalEntries: tocDiscovery.totalEntries
    });
    
  } catch (error) {
    // Clean up temp directory on error
    try {
      const { rm } = await import('fs/promises');
      await rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}

function countEntries(entries: any[]): number {
  let count = 0;
  for (const entry of entries) {
    count++;
    if (entry.children && entry.children.length > 0) {
      count += countEntries(entry.children);
    }
  }
  return count;
}
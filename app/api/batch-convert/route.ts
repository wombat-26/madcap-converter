import { NextRequest, NextResponse } from 'next/server';
import { BatchService, ConversionProgress } from '../../../src/core/services/batch-service';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import archiver from 'archiver';
import { createWriteStream } from 'fs';

export async function POST(request: NextRequest) {
  const sessionId = randomUUID();
  const tempDir = join(tmpdir(), `batch-convert-${sessionId}`);
  
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const format = formData.get('format') as string;
    const options = formData.get('options') ? JSON.parse(formData.get('options') as string) : {};
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided' },
        { status: 400 }
      );
    }
    
    if (!format || !['asciidoc', 'writerside-markdown', 'zendesk'].includes(format)) {
      return NextResponse.json(
        { success: false, error: 'Invalid format specified' },
        { status: 400 }
      );
    }
    
    // Create temp directory structure
    const inputDir = join(tempDir, 'input');
    const outputDir = join(tempDir, 'output');
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    
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
    
    // Track conversion progress
    let lastProgress: ConversionProgress | null = null;
    
    // Perform batch conversion with progress tracking
    const batchService = new BatchService();
    const result = await batchService.convertFolder(inputDir, outputDir, {
      format: format as any,
      ...options,
      onProgress: (progress: ConversionProgress) => {
        lastProgress = progress;
        // Progress is tracked but not streamed in this version
        // For real-time updates, would need to use SSE or WebSockets
        console.log(`Progress: ${progress.percentage}% - ${progress.message}`);
      }
    });
    
    // Create zip file of results
    const zipPath = join(tempDir, 'converted-files.zip');
    const zipStream = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(zipStream);
    archive.directory(outputDir, false);
    await archive.finalize();
    
    // Wait for zip to complete
    await new Promise<void>((resolve, reject) => {
      zipStream.on('close', () => resolve());
      zipStream.on('error', reject);
    });
    
    // Read zip file
    const { readFile } = await import('fs/promises');
    const zipBuffer = await readFile(zipPath);
    
    // Clean up temp directory
    const { rm } = await import('fs/promises');
    await rm(tempDir, { recursive: true, force: true });
    
    // Return zip file
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename=converted-files.zip',
        'X-Conversion-Summary': JSON.stringify({
          totalFiles: result.totalFiles,
          convertedFiles: result.convertedFiles,
          skippedFiles: result.skippedFiles,
          skippedFilesList: result.skippedFilesList,
          errors: result.errors.length,
          errorDetails: result.errors,
        }),
      },
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


import { NextRequest, NextResponse } from 'next/server';
import { DocumentService } from '../../../src/core/services/document-service';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const format = formData.get('format') as string;
    const options = formData.get('options') ? JSON.parse(formData.get('options') as string) : {};
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }
    
    if (!format || !['asciidoc', 'writerside-markdown', 'zendesk'].includes(format)) {
      return NextResponse.json(
        { success: false, error: 'Invalid format specified' },
        { status: 400 }
      );
    }
    
    // Save uploaded file temporarily
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    tempFilePath = join(tmpdir(), `upload-${randomUUID()}-${file.name}`);
    await writeFile(tempFilePath, buffer);
    
    // Convert the file - preserve original file name for snippet resolution
    const documentService = new DocumentService();
    
    // Create a synthetic path that preserves the original structure for snippet resolution
    // For the user's specific project, auto-detect the correct path structure
    let originalPath = options.originalPath;
    
    if (!originalPath) {
      // Auto-detect path based on filename patterns from the user's project
      if (file.name.includes('CreatActivity') || file.name.startsWith('01-')) {
        originalPath = `/Volumes/Envoy Pro/Flare/CampaignPl EN/Content/02 Planung/${file.name}`;
      } else {
        originalPath = `/Volumes/Envoy Pro/Flare/CampaignPl EN/Content/${file.name}`;
      }
    }
    
    // Debug logging can be enabled if needed for troubleshooting
    // console.log('[API DEBUG] Parsed options:', options);
    // console.log('[API DEBUG] Original path:', originalPath);
    // console.log('[API DEBUG] File name:', file.name);
    
    const result = await documentService.convertFile(tempFilePath, {
      format: format as any,
      inputPath: originalPath, // Pass original path for snippet resolution
      ...options
    });
    
    // Clean up temp file
    await unlink(tempFilePath);
    tempFilePath = null;
    
    return NextResponse.json({
      success: true,
      content: result.content,
      metadata: result.metadata,
      variablesFile: result.variablesFile,
      glossaryContent: result.glossaryContent,
      filename: file.name.replace(/\.[^/.]+$/, '') + '.' + getExtensionForFormat(format),
    });
  } catch (error) {
    // Clean up temp file if it exists
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch (e) {
        // Ignore cleanup errors
      }
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

function getExtensionForFormat(format: string): string {
  switch (format) {
    case 'asciidoc':
      return 'adoc';
    case 'writerside-markdown':
      return 'md';
    case 'zendesk':
      return 'html';
    default:
      return 'txt';
  }
}
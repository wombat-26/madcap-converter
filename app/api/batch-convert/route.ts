import { NextRequest, NextResponse } from 'next/server';
import { BatchService, ConversionProgress } from '../../../src/core/services/batch-service';
import { ProgressSessionManager } from '../../../services/ProgressSessionManager';
import { writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import archiver from 'archiver';
import { createWriteStream } from 'fs';

export async function POST(request: NextRequest) {
  const tempDir = join(tmpdir(), `batch-convert-${randomUUID()}`);
  let sessionId: string | undefined;
  
  try {
    console.log('📥 Batch conversion request received');
    
    // Parse FormData with enhanced error handling
    let formData: FormData;
    try {
      formData = await request.formData();
      console.log('✅ FormData parsed successfully');
    } catch (formDataError) {
      console.error('❌ FormData parsing failed:', formDataError);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to parse form data. Please ensure files are properly uploaded.',
          debug: {
            error: formDataError instanceof Error ? formDataError.message : 'Unknown FormData error',
            type: 'FormDataParseError'
          }
        },
        { status: 400 }
      );
    }
    
    // Extract files with validation
    let files: File[];
    try {
      files = formData.getAll('files') as File[];
      console.log(`📁 Found ${files.length} files in FormData`);
      
      // Validate files are actual File objects
      for (const file of files) {
        if (!(file instanceof File)) {
          throw new Error(`Invalid file object: expected File but got ${typeof file}`);
        }
      }
    } catch (fileError) {
      console.error('❌ File extraction failed:', fileError);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to extract files from upload. Files may be corrupted or invalid.',
          debug: {
            error: fileError instanceof Error ? fileError.message : 'Unknown file error',
            type: 'FileExtractionError'
          }
        },
        { status: 400 }
      );
    }
    
    const format = formData.get('format') as string;
    const options = formData.get('options') ? JSON.parse(formData.get('options') as string) : {};
    const outputFolderName = formData.get('outputFolderName') as string || 'converted-files';
    
    // Extract or create session ID for progress tracking
    sessionId = options.sessionId || formData.get('sessionId') as string;
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided' },
        { status: 400 }
      );
    }
    
    // Initialize progress session
    const sessionManager = ProgressSessionManager.getInstance();
    if (!sessionId) {
      sessionId = sessionManager.createSession(files.length);
    } else {
      // Update existing session with file count
      sessionManager.updateSession(sessionId, { totalFiles: files.length });
    }
    
    // At this point sessionId is guaranteed to be defined
    if (!sessionId) {
      throw new Error('Failed to initialize session ID');
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
    
    console.log(`📦 Processing ${files.length} uploaded files:`);
    
    // Save uploaded files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`🔍 Processing file ${i + 1}/${files.length}: ${file.name} (${file.size} bytes, type: ${file.type})`);
      
      let bytes: ArrayBuffer;
      let buffer: Buffer;
      
      try {
        bytes = await file.arrayBuffer();
        buffer = Buffer.from(bytes);
        console.log(`✅ Successfully read file: ${file.name} (buffer size: ${buffer.length})`);
      } catch (readError) {
        console.error(`❌ Failed to read file ${file.name}:`, readError);
        throw new Error(`Failed to read file "${file.name}": ${readError instanceof Error ? readError.message : 'Unknown read error'}`);
      }
      
      // Use webkitRelativePath for folder uploads, otherwise use file.name
      const webkitPath = (file as any).webkitRelativePath;
      let relativePath = webkitPath || file.name;
      
      // Fallback logic for when webkitRelativePath is not available
      if (!webkitPath && file.name) {
        relativePath = inferMadCapProjectStructure(file.name, file.type);
        console.log(`🔧 Inferred project structure: ${file.name} -> ${relativePath}`);
      }
      
      const filePath = join(inputDir, relativePath);
      
      console.log(`📄 Uploading file: ${relativePath} (${buffer.length} bytes) [webkitRelativePath: ${webkitPath || 'undefined'}]`);
      
      // Create subdirectories if needed
      const fileDir = join(inputDir, relativePath.substring(0, relativePath.lastIndexOf('/')));
      if (fileDir !== inputDir && relativePath.includes('/')) {
        await mkdir(fileDir, { recursive: true });
      }
      
      await writeFile(filePath, buffer);
    }
    
    console.log(`✅ All files saved to: ${inputDir}`);
    
    // Enhanced diagnostics: Show the complete uploaded folder structure with detailed analysis
    console.log(`📂 === ENHANCED FOLDER STRUCTURE ANALYSIS ===`);
    const diagnosticsBatchService = new BatchService();
    const folderAnalysis = await diagnosticsBatchService.analyzeUploadedStructure(inputDir);
    console.log(`📊 File Summary:`);
    console.log(`  - Total files: ${folderAnalysis.totalFiles}`);
    console.log(`  - Supported files: ${folderAnalysis.supportedFiles}`);
    console.log(`  - Snippet files (.flsnp): ${folderAnalysis.snippetFiles}`);
    console.log(`  - Content files (.htm/.html): ${folderAnalysis.contentFiles}`);
    console.log(`  - Image files: ${folderAnalysis.imageFiles}`);
    console.log(`  - Other files: ${folderAnalysis.otherFiles}`);
    
    console.log(`📁 Directory Structure:`);
    await diagnosticsBatchService.logDirectoryStructureWithAnalysis(inputDir, '', 3);
    
    if (folderAnalysis.missingCommonDirs.length > 0) {
      console.log(`⚠️ Missing common MadCap directories: ${folderAnalysis.missingCommonDirs.join(', ')}`);
    }
    
    if (folderAnalysis.foundSnippets.length > 0) {
      console.log(`✅ Found snippet files: ${folderAnalysis.foundSnippets.join(', ')}`);
    } else {
      console.log(`❌ No snippet files found in uploaded structure`);
    }
    
    console.log(`📂 === END ENHANCED ANALYSIS ===`);
    
    // Start conversion with progress streaming
    sessionManager.broadcastProgress(sessionId, 'conversion_start', {
      totalFiles: files.length,
      message: `Starting conversion of ${files.length} files to ${format}`,
      startTime: Date.now(),
      resourceAnalysis: {
        totalFiles: folderAnalysis.totalFiles,
        supportedFiles: folderAnalysis.supportedFiles,
        snippetFiles: folderAnalysis.snippetFiles,
        imageFiles: folderAnalysis.imageFiles,
        usedFallbackStructure: files.some(f => !(f as any).webkitRelativePath)
      }
    });
    
    // Track conversion progress
    let lastProgress: ConversionProgress | null = null;
    
    // Perform batch conversion with progress tracking
    const batchService = new BatchService();
    const result = await batchService.convertFolder(inputDir, outputDir, {
      format: format as any,
      ...options,
      onProgress: (progress: ConversionProgress) => {
        lastProgress = progress;
        
        // Stream progress updates via SSE
        const progressData = {
          totalFiles: files.length,
          currentFileIndex: progress.currentFileIndex,
          currentFile: progress.currentFile,
          overallPercentage: progress.percentage,
          currentFilePercentage: progress.fileProgress,
          message: progress.message,
          phase: progress.phase,
          completedFiles: progress.processedFiles || 0,
          processedSize: progress.processedSize,
          totalSize: progress.totalSize
        };
        
        // Determine event type based on progress state
        if (sessionId) {
          if (progress.currentFile && progress.fileProgress === 0) {
            sessionManager.broadcastProgress(sessionId, 'file_start', {
              ...progressData,
              message: `Starting: ${progress.currentFile}`
            });
          } else if (progress.currentFile && progress.fileProgress === 100) {
            sessionManager.broadcastProgress(sessionId, 'file_complete', {
              ...progressData,
              message: `Completed: ${progress.currentFile}`
            });
          } else {
            sessionManager.broadcastProgress(sessionId, 'file_progress', progressData);
          }
        }
        
        console.log(`Progress: ${progress.percentage}% - ${progress.message}`);
      }
    });
    
    // Create zip file of results with enhanced logging
    console.log(`📦 === ZIP CREATION ANALYSIS ===`);
    const outputAnalysis = await batchService.analyzeUploadedStructure(outputDir);
    console.log(`📊 Output Directory Contents:`);
    console.log(`  - Total files: ${outputAnalysis.totalFiles}`);
    console.log(`  - Converted files: ${outputAnalysis.supportedFiles}`);
    console.log(`  - Image files: ${outputAnalysis.imageFiles}`);
    console.log(`  - Other files: ${outputAnalysis.otherFiles}`);
    
    console.log(`📁 Output Directory Structure:`);
    await batchService.logDirectoryStructureWithAnalysis(outputDir, '', 3);
    
    const zipPath = join(tempDir, 'converted-files.zip');
    const zipStream = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    // Add logging for archive events
    archive.on('entry', (entryData) => {
      console.log(`📦 Adding to ZIP: ${entryData.name} (${entryData.stats?.size || 0} bytes)`);
    });
    
    archive.on('warning', (err) => {
      console.warn(`⚠️ ZIP warning:`, err);
    });
    
    archive.on('error', (err) => {
      console.error(`❌ ZIP error:`, err);
    });
    
    archive.pipe(zipStream);
    archive.directory(outputDir, false);
    
    const finalizeResult = await archive.finalize();
    console.log(`✅ ZIP finalized. Total bytes: ${archive.pointer()}`);
    
    // Wait for zip to complete
    await new Promise<void>((resolve, reject) => {
      zipStream.on('close', () => {
        console.log(`✅ ZIP file created successfully: ${zipPath}`);
        resolve();
      });
      zipStream.on('error', (err) => {
        console.error(`❌ ZIP file creation failed:`, err);
        reject(err);
      });
    });
    
    // Read zip file
    const { readFile } = await import('fs/promises');
    const zipBuffer = await readFile(zipPath);
    console.log(`📤 ZIP file ready for download: ${zipBuffer.length} bytes`);
    console.log(`📦 === END ZIP ANALYSIS ===`);
    
    // Complete the conversion session with resource analysis
    sessionManager.completeSession(sessionId, {
      ...result,
      resourceSummary: {
        input: folderAnalysis,
        output: outputAnalysis,
        imagesCopied: outputAnalysis.imageFiles > 0,
        resourcesPreserved: outputAnalysis.totalFiles > outputAnalysis.supportedFiles
      }
    });
    
    // Clean up temp directory
    const { rm } = await import('fs/promises');
    await rm(tempDir, { recursive: true, force: true });
    
    console.log(`✅ Conversion completed for session ${sessionId}`);
    
    // Return zip file with session ID and enhanced conversion details in headers
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=${outputFolderName}.zip`,
        'X-Session-Id': sessionId,
        'X-Conversion-Summary': JSON.stringify({
          totalFiles: result.totalFiles,
          convertedFiles: result.convertedFiles,
          skippedFiles: result.skippedFiles,
          skippedFilesList: result.skippedFilesList,
          errors: result.errors.length,
          errorDetails: result.errors,
          resourceCopying: {
            imagesCopied: outputAnalysis.imageFiles > 0,
            totalImages: outputAnalysis.imageFiles,
            resourcesIncluded: outputAnalysis.totalFiles - outputAnalysis.supportedFiles
          }
        }),
        'X-Resource-Status': JSON.stringify({
          input: {
            totalFiles: folderAnalysis.totalFiles,
            snippetFiles: folderAnalysis.snippetFiles,
            imageFiles: folderAnalysis.imageFiles,
            contentFiles: folderAnalysis.contentFiles
          },
          output: {
            totalFiles: outputAnalysis.totalFiles,
            imageFiles: outputAnalysis.imageFiles,
            convertedFiles: outputAnalysis.supportedFiles
          },
          inference: {
            usedFallbackStructure: files.some(f => !(f as any).webkitRelativePath),
            missingDirectories: folderAnalysis.missingCommonDirs
          }
        }),
      },
    });
  } catch (error) {
    // Notify session manager of error if sessionId exists
    if (typeof sessionId === 'string') {
      const sessionManager = ProgressSessionManager.getInstance();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;
      sessionManager.errorSession(sessionId, errorMessage, errorStack);
    }
    
    // Clean up temp directory on error
    try {
      const { rm } = await import('fs/promises');
      await rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    
    console.error('Batch conversion API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        sessionId: typeof sessionId === 'string' ? sessionId : undefined,
        debug: {
          type: error instanceof Error ? error.constructor.name : typeof error,
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Infer MadCap project structure when webkitRelativePath is not available
 */
function inferMadCapProjectStructure(fileName: string, fileType: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseName = fileName.toLowerCase();
  
  // Handle image files - place in Content/Images/
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) {
    // Organize images by type/purpose
    if (baseName.includes('icon') || baseName.includes('button')) {
      return `Content/Images/Icons/${fileName}`;
    } else if (baseName.includes('screen') || baseName.includes('capture')) {
      return `Content/Images/Screens/${fileName}`;
    } else if (baseName.includes('logo') || baseName.includes('header')) {
      return `Content/Images/Branding/${fileName}`;
    } else {
      return `Content/Images/${fileName}`;
    }
  }
  
  // Handle snippet files - place in Content/Resources/Snippets/
  if (ext === 'flsnp') {
    return `Content/Resources/Snippets/${fileName}`;
  }
  
  // Handle variable files - place in Project/VariableSets/
  if (ext === 'flvar') {
    return `Project/VariableSets/${fileName}`;
  }
  
  // Handle TOC files - place in Project/TOCs/
  if (ext === 'fltoc') {
    return `Project/TOCs/${fileName}`;
  }
  
  // Handle page layout files - place in Content/Resources/PageLayouts/
  if (ext === 'flpgl') {
    return `Content/Resources/PageLayouts/${fileName}`;
  }
  
  // Handle CSS files - place in Content/Resources/Stylesheets/
  if (ext === 'css') {
    return `Content/Resources/Stylesheets/${fileName}`;
  }
  
  // Handle content files (HTML/HTM) - place in Content/
  if (['html', 'htm'].includes(ext)) {
    // Try to infer content organization
    if (baseName.includes('admin') || baseName.includes('administration')) {
      return `Content/Admin/${fileName}`;
    } else if (baseName.includes('guide') || baseName.includes('tutorial')) {
      return `Content/Guides/${fileName}`;
    } else if (baseName.includes('api') || baseName.includes('reference')) {
      return `Content/Reference/${fileName}`;
    } else if (baseName.includes('install') || baseName.includes('setup')) {
      return `Content/Installation/${fileName}`;
    } else {
      return `Content/${fileName}`;
    }
  }
  
  // Handle Word documents - place in Content/
  if (['docx', 'doc'].includes(ext)) {
    return `Content/${fileName}`;
  }
  
  // Handle XML files - could be various things, place in Project/
  if (ext === 'xml') {
    return `Project/${fileName}`;
  }
  
  // For any other files, place in the root or Content/
  if (['md', 'txt', 'json'].includes(ext)) {
    return fileName; // Root level
  }
  
  // Default: place unknown files in Content/
  return `Content/${fileName}`;
}



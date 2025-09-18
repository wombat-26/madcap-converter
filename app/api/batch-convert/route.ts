import { NextRequest, NextResponse } from 'next/server';
import { BatchService, ConversionProgress } from '../../../src/core/services/batch-service';
import { ProgressSessionManager } from '../../../services/ProgressSessionManager';
import { writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import archiver from 'archiver';
import { createWriteStream } from 'fs';

// MadCap output and temporary folders that should be excluded from processing
const EXCLUDED_DIRECTORIES = new Set([
  // MadCap output directories
  'Output',
  'output', 
  'TargetOutput',
  'Temporary',
  'temporary',
  // MadCap specific folders
  'AutoMerge',
  'Backup',
  'backup',
  // Version control and system directories
  '.git',
  '.svn', 
  'node_modules'
]);

/**
 * Check if a file path contains excluded directory names
 */
function containsExcludedDirectory(relativePath: string): boolean {
  const pathParts = relativePath.split('/').filter(part => part.length > 0);
  
  for (const part of pathParts) {
    if (EXCLUDED_DIRECTORIES.has(part) || EXCLUDED_DIRECTORIES.has(part.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

export async function POST(request: NextRequest) {
  const tempDir = join(tmpdir(), `batch-convert-${randomUUID()}`);
  let sessionId: string | undefined;
  let preflightWarnings: string[] = [];
  
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
    
    // Extract files and paths with validation
    let files: File[];
    let paths: string[];
    try {
      files = formData.getAll('files') as File[];
      paths = formData.getAll('paths') as string[];
      
      console.log(`📁 Found ${files.length} files and ${paths.length} paths in FormData`);
      
      // Validate files are actual File objects
      for (const file of files) {
        if (!(file instanceof File)) {
          throw new Error(`Invalid file object: expected File but got ${typeof file}`);
        }
      }
      
      // Ensure we have paths for all files (fallback to filename if missing)
      if (paths.length !== files.length) {
        console.log(`⚠️ Path count mismatch: ${files.length} files vs ${paths.length} paths - using filenames as fallback`);
        paths = files.map(file => file.name);
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
    
    console.log(`📋 [Batch Convert API] Raw options object:`, JSON.stringify(options, null, 2));
    console.log(`📋 [Batch Convert API] Received options:`, {
      format,
      options,
      copyImages: options.copyImages,
      preserveStructure: options.preserveStructure,
      renameFiles: options.renameFiles,
      recursive: options.recursive,
      variableOptions: options.variableOptions,
      extractVariables: options.variableOptions?.extractVariables,
      asciidocOptions: options.asciidocOptions,
      glossaryOptions: options.glossaryOptions
    });
    
    // Extract or create session ID for progress tracking
    sessionId = options.sessionId || formData.get('sessionId') as string;
    
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
    
    console.log(`📦 Processing ${files.length} uploaded files:`);
    
    // Track excluded files for user feedback
    const excludedFiles: Array<{ name: string; path: string; reason: string }> = [];
    const validFiles: File[] = [];
    const validPaths: string[] = [];
    
    // First pass: Filter out files from excluded directories using provided paths
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`🔍 Processing file ${i + 1}/${files.length}: ${file.name} (${file.size} bytes, type: ${file.type})`);
      
      // Use provided path first, then fallback to webkitRelativePath or filename
      const providedPath = paths[i];
      const webkitPath = (file as any).webkitRelativePath;
      let relativePath = providedPath || webkitPath || file.name;
      
      // Only infer structure if we have no path information at all
      if (!providedPath && !webkitPath && file.name) {
        relativePath = inferMadCapProjectStructure(file.name, file.type);
        console.log(`🔧 Inferred project structure: ${file.name} -> ${relativePath}`);
      } else if (providedPath) {
        console.log(`📍 Using provided path: ${file.name} -> ${relativePath}`);
      }
      
      // Check if file is from excluded directory
      if (containsExcludedDirectory(relativePath)) {
        const excludedDirName = relativePath.split('/').find((part: string) => 
          EXCLUDED_DIRECTORIES.has(part) || EXCLUDED_DIRECTORIES.has(part.toLowerCase())
        ) || 'unknown';
        
        console.log(`🚫 Excluding file: ${file.name} (path: ${relativePath}) - contains excluded directory: ${excludedDirName}`);
        excludedFiles.push({
          name: file.name,
          path: relativePath,
          reason: `Contains excluded directory: ${excludedDirName} (MadCap output/temporary folder)`
        });
        continue; // Skip this file
      }
      
      // File is valid, add to processing list with its path
      console.log(`✅ File approved for processing: ${relativePath}`);
      validFiles.push(file);
      validPaths.push(relativePath);
    }
    
    // Log filtering results
    console.log(`\n📊 === FILE FILTERING RESULTS ===`);
    console.log(`📥 Total uploaded files: ${files.length}`);
    console.log(`✅ Valid files for processing: ${validFiles.length}`);
    console.log(`🚫 Excluded files: ${excludedFiles.length}`);
    
    if (excludedFiles.length > 0) {
      console.log(`\n🚫 Excluded files details:`);
      excludedFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.name} (${file.path}) - ${file.reason}`);
      });
    }
    console.log(`📊 === END FILTERING RESULTS ===\n`);
    
    // Validate that we have files to process after filtering
    if (validFiles.length === 0) {
      const errorMessage = excludedFiles.length > 0 
        ? `All ${files.length} uploaded files were from excluded directories (Output, Temporary, etc.). Please upload source files from Content/ or Project/ directories instead.`
        : 'No valid files found for processing.';
      
      console.error(`❌ No valid files remaining after filtering: ${errorMessage}`);
      return NextResponse.json(
        { 
          success: false, 
          error: errorMessage,
          details: {
            totalUploaded: files.length,
            validFiles: 0,
            excludedFiles: excludedFiles.length,
            excludedFileDetails: excludedFiles.map(f => ({ name: f.name, reason: f.reason }))
          }
        },
        { status: 400 }
      );
    }
    
    // Second pass: Save valid files to temp directory using their preserved paths
    console.log(`📦 Saving ${validFiles.length} valid files to temp directory:`);
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const relativePath = validPaths[i]; // Use the preserved path
      console.log(`💾 Saving file ${i + 1}/${validFiles.length}: ${file.name} -> ${relativePath}`);
      
      // Read file content
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
      
      const filePath = join(inputDir, relativePath);
      
      console.log(`📄 Saving file with preserved structure: ${relativePath} (${buffer.length} bytes)`);
      
      // Create subdirectories if needed
      const fileDir = join(inputDir, relativePath.substring(0, relativePath.lastIndexOf('/')));
      if (fileDir !== inputDir && relativePath.includes('/')) {
        await mkdir(fileDir, { recursive: true });
      }
      
      await writeFile(filePath, buffer);
    }

    // Preflight: scan for glossary (.flglo) and variables (.flvar) files in uploaded project
    try {
      const { readdir, stat } = await import('fs/promises');
      const { extname, join: pjoin } = await import('path');

      const foundFiles: { flglo: number; flvar: number } = { flglo: 0, flvar: 0 };

      const walk = async (dir: string): Promise<void> => {
        let entries: string[] = [];
        try {
          entries = await readdir(dir);
        } catch {
          return; // ignore unreadable directories
        }
        for (const entry of entries) {
          const full = pjoin(dir, entry);
          try {
            const st = await stat(full);
            if (st.isDirectory()) {
              // Skip typical excluded dirs already handled elsewhere
              if (['.git', 'node_modules', '.next', 'Output', 'output', 'Temporary', 'temporary', 'TargetOutput', 'Backup', 'backup'].includes(entry)) {
                continue;
              }
              await walk(full);
            } else if (st.isFile()) {
              const ext = extname(entry).toLowerCase();
              if (ext === '.flglo') foundFiles.flglo++;
              if (ext === '.flvar') foundFiles.flvar++;
            }
          } catch {
            // ignore file access errors
          }
        }
      };

      await walk(inputDir);

      if (foundFiles.flglo === 0) {
        preflightWarnings.push('No .flglo (MadCap glossary) files found in uploaded project. Glossary will be empty unless you include Project/Glossaries/*.flglo or set asciidocOptions.glossaryOptions.glossaryPath.');
      }
      if (foundFiles.flvar === 0 && (options.variableOptions?.extractVariables ?? true)) {
        preflightWarnings.push('No .flvar (MadCap variables) files found in uploaded project. Variables file will be empty unless you include Project/VariableSets/*.flvar or set variableOptions.flvarFiles.');
      }
    } catch (pfError) {
      console.warn('⚠️ Preflight checks for glossary/variables failed:', pfError);
    }

    console.log(`✅ All valid files saved to: ${inputDir}`);
    
    // Initialize progress session with valid file count (after filtering)
    const sessionManager = ProgressSessionManager.getInstance();
    if (!sessionId) {
      sessionId = sessionManager.createSession(validFiles.length);
    } else {
      // Update existing session with valid file count
      sessionManager.updateSession(sessionId, { totalFiles: validFiles.length });
    }
    
    // At this point sessionId is guaranteed to be defined
    if (!sessionId) {
      throw new Error('Failed to initialize session ID');
    }
    
    console.log(`📡 Progress session initialized with ${validFiles.length} valid files (${excludedFiles.length} excluded)`);
    
    // Enhanced diagnostics: Show the complete uploaded folder structure with detailed analysis
    console.log(`📂 === ENHANCED FOLDER STRUCTURE ANALYSIS ===`);
    
    // Show actual directory tree
    console.log(`📁 Directory structure:`);
    const showDirectoryTree = async (dir: string, prefix: string = '') => {
      const entries = await readdir(dir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
      const files = entries.filter(e => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));
      
      // Show directories first
      for (let i = 0; i < dirs.length; i++) {
        const isLast = i === dirs.length - 1 && files.length === 0;
        console.log(`${prefix}${isLast ? '└── ' : '├── '}📁 ${dirs[i].name}/`);
        await showDirectoryTree(join(dir, dirs[i].name), prefix + (isLast ? '    ' : '│   '));
      }
      
      // Show files
      for (let i = 0; i < files.length; i++) {
        const isLast = i === files.length - 1;
        const ext = files[i].name.split('.').pop()?.toLowerCase();
        const icon = ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '') ? '🖼️' : 
                     ['htm', 'html'].includes(ext || '') ? '📄' :
                     ext === 'flsnp' ? '📌' : '📋';
        console.log(`${prefix}${isLast ? '└── ' : '├── '}${icon} ${files[i].name}`);
      }
    };
    
    await showDirectoryTree(inputDir);
    
    const diagnosticsBatchService = new BatchService();
    const folderAnalysis = await diagnosticsBatchService.analyzeUploadedStructure(inputDir);
    console.log(`\n📊 File Summary:`);
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
    
    if (folderAnalysis.excludedDirectories.length > 0) {
      console.log(`🚫 Excluded directories: ${folderAnalysis.excludedDirectories.join(', ')}`);
      console.log(`   Reason: MadCap output/temporary folders (Output, Temporary, TargetOutput, etc.)`);
    }
    
    // PREFLIGHT WARNINGS for incomplete uploads
    console.log(`\n🚨 === PREFLIGHT WARNINGS ===`);
    
    // Check for missing image directories
    const hasContentImages = folderAnalysis.imageFiles > 0 || 
                            folderAnalysis.missingCommonDirs.includes('Content/Images') === false;
    const hasResourcesImages = !folderAnalysis.missingCommonDirs.includes('Resources/Images');
    
    if (!hasContentImages && !hasResourcesImages) {
      const warning = 'No image directories detected (Content/Images, Resources/Images). Images in converted files may not display correctly.';
      preflightWarnings.push(warning);
      console.log(`⚠️ [PREFLIGHT] ${warning}`);
    }
    
    // Check for missing Content directory
    if (folderAnalysis.missingCommonDirs.includes('Content')) {
      const warning = 'Content directory not found. This may indicate an incomplete MadCap project upload.';
      preflightWarnings.push(warning);
      console.log(`⚠️ [PREFLIGHT] ${warning}`);
    }
    
    // Check if mostly output/temp files were uploaded
    if (folderAnalysis.excludedDirectories.length > 0 && folderAnalysis.contentFiles < 5) {
      const warning = `Upload appears to contain mostly output/temporary files. Consider uploading the source project instead.`;
      preflightWarnings.push(warning);
      console.log(`⚠️ [PREFLIGHT] ${warning}`);
    }
    
    // Check for missing Resources directory
    if (folderAnalysis.missingCommonDirs.includes('Content/Resources') && 
        folderAnalysis.missingCommonDirs.includes('Resources')) {
      const warning = 'No Resources directories found. Snippets, variables, and multimedia may not be processed.';
      preflightWarnings.push(warning);
      console.log(`⚠️ [PREFLIGHT] ${warning}`);
    }
    
    if (preflightWarnings.length === 0) {
      console.log(`✅ [PREFLIGHT] No warnings detected. Upload structure looks good.`);
    } else {
      console.log(`\n📋 [PREFLIGHT SUMMARY] ${preflightWarnings.length} potential issues detected:`);
      preflightWarnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
    }
    console.log(`🚨 === END PREFLIGHT WARNINGS ===\n`);
    
    console.log(`📂 === END ENHANCED ANALYSIS ===`);
    
    // Start conversion with progress streaming
    sessionManager.broadcastProgress(sessionId, 'conversion_start', {
      totalFiles: validFiles.length,
      message: `Starting conversion of ${validFiles.length} files to ${format}`,
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
    
    console.log(`🔍 [BREADCRUMB] About to call batchService.convertFolder()`);
    console.log(`🔍 [BREADCRUMB] inputDir: ${inputDir}`);
    console.log(`🔍 [BREADCRUMB] outputDir: ${outputDir}`);
    console.log(`🔍 [BREADCRUMB] format: ${format}`);
    
    // Ensure all options are properly passed
    const conversionOptions = {
      format: format as any,
      ...options,
      // Explicitly ensure these options are passed
      copyImages: options.copyImages,
      preserveStructure: options.preserveStructure,
      renameFiles: options.renameFiles,
      recursive: options.recursive,
      variableOptions: options.variableOptions,
      asciidocOptions: options.asciidocOptions,
      glossaryOptions: options.glossaryOptions,
      onProgress: (progress: ConversionProgress) => {
        console.log(`🔄 [Batch API] Progress callback received:`, {
          currentFileIndex: progress.currentFileIndex,
          totalFiles: progress.totalFiles || validFiles.length,
          percentage: progress.percentage,
          currentFile: progress.currentFile,
          message: progress.message,
          sessionId: sessionId
        });
        
        lastProgress = progress;
        
        // Stream progress updates via SSE
        const progressData = {
          totalFiles: validFiles.length,
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
            console.log(`📡 [Batch API] Broadcasting file_start event for session ${sessionId}`);
            sessionManager.broadcastProgress(sessionId, 'file_start', {
              ...progressData,
              message: `Starting: ${progress.currentFile}`
            });
          } else if (progress.currentFile && progress.fileProgress === 100) {
            console.log(`📡 [Batch API] Broadcasting file_complete event for session ${sessionId}`);
            sessionManager.broadcastProgress(sessionId, 'file_complete', {
              ...progressData,
              message: `Completed: ${progress.currentFile}`
            });
          } else {
            console.log(`📡 [Batch API] Broadcasting file_progress event for session ${sessionId}: ${progress.percentage}%`);
            sessionManager.broadcastProgress(sessionId, 'file_progress', progressData);
          }
        } else {
          console.log(`⚠️ [Batch API] No sessionId - cannot broadcast progress events`);
        }
        
        console.log(`Progress: ${progress.percentage}% - ${progress.message}`);
      }
    };
    
    console.log(`📋 [Batch Convert API] Final conversion options being passed:`, JSON.stringify(conversionOptions, null, 2));
    
    // Add timeout handling for large batch operations - increased timeouts for resource processing
    const BATCH_TIMEOUT = validFiles.length > 100 ? 30 * 60 * 1000 : 15 * 60 * 1000; // 30 min for large batches, 15 min for smaller
    const abortController = new AbortController();
    
    console.log(`⏰ Setting batch timeout: ${BATCH_TIMEOUT / 1000}s for ${validFiles.length} files (includes resource processing time)`);
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      console.error(`❌ Batch conversion timeout after ${BATCH_TIMEOUT / 1000}s`);
      abortController.abort();
    }, BATCH_TIMEOUT);
    
    let result: any;
    try {
      // Run conversion with timeout protection
      result = await Promise.race([
        batchService.convertFolder(inputDir, outputDir, conversionOptions),
        new Promise((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error(`Batch conversion timed out after ${BATCH_TIMEOUT / 1000} seconds`));
          });
        })
      ]);
      
      clearTimeout(timeoutId);
      console.log(`✅ Batch conversion completed within timeout`);
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.message.includes('timed out')) {
        console.error(`❌ Batch conversion timed out for ${validFiles.length} files`);
        
        // Enable fallback mode if session exists
        if (sessionId) {
          const sessionManager = ProgressSessionManager.getInstance();
          sessionManager.enableFallbackMode(sessionId);
        }
        
        return NextResponse.json({
          success: false,
          error: `Batch conversion timed out. Try processing fewer files (current: ${validFiles.length}).`,
          suggestion: 'Consider using smaller batch sizes (50-100 files) or the chunked processing option.',
          debug: { timeout: BATCH_TIMEOUT, fileCount: validFiles.length }
        }, { status: 408 });
      }
      
      throw error; // Re-throw other errors
    }
    
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
    
    console.log(`🔍 [ZIP DEBUG] Detailed output directory inspection before ZIP creation:`);
    
    // Show detailed file listing of output directory
    try {
      const { readdir, stat, lstat } = await import('fs/promises');
      
      const inspectDirectory = async (dir: string, prefix = '') => {
        const entries = await readdir(dir);
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          const stats = await lstat(fullPath);
          if (stats.isDirectory()) {
            console.log(`${prefix}📁 ${entry}/`);
            await inspectDirectory(fullPath, prefix + '  ');
          } else {
            const size = stats.size;
            const ext = entry.split('.').pop()?.toLowerCase();
            const icon = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext || '') ? '🖼️' : '📄';
            console.log(`${prefix}${icon} ${entry} (${size} bytes)`);
          }
        }
      };
      
      await inspectDirectory(outputDir);
    } catch (inspectionError) {
      console.error(`❌ Failed to inspect output directory:`, inspectionError);
    }
    
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
    console.log(`🔔 [Batch Convert API] About to complete session: ${sessionId}`);
    sessionManager.completeSession(sessionId, {
      ...result,
      resourceSummary: {
        input: folderAnalysis,
        output: outputAnalysis,
        imagesCopied: outputAnalysis.imageFiles > 0,
        resourcesPreserved: outputAnalysis.totalFiles > outputAnalysis.supportedFiles
      }
    });
    console.log(`✅ [Batch Convert API] Session completion called for: ${sessionId}`);
    
    // Add a brief delay to ensure session completion is fully processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Clean up temp directory
    const { rm } = await import('fs/promises');
    await rm(tempDir, { recursive: true, force: true });
    
    console.log(`✅ Conversion completed for session ${sessionId}`);
    
    // Return zip file with session ID and enhanced conversion details in headers
    return new NextResponse(zipBuffer as any, {
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
          },
          preflightWarnings: preflightWarnings || []
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


import { readdir, stat, copyFile, mkdir, readFile, writeFile, open } from 'fs/promises';
import { join, relative, extname, dirname, basename, sep, resolve } from 'path';
import { DocumentService } from './document-service';
import { ConversionOptions, ConversionResult, ZendeskConversionOptions } from '../types/index';
import { JSDOM } from 'jsdom';
import { ZendeskConverter } from '../converters/zendesk-converter';
import { MadCapConverter } from '../converters/madcap-converter';
import { TOCDiscoveryService } from './toc-discovery';
import { TocService, TOCBasedConversionPlan } from '../toc-service';
import { QualityValidator } from './quality-validator';
import { FLVARParser, VariableSet } from './flvar-parser';
import { VariableExtractor } from './variable-extractor';

export interface BatchConversionOptions extends Partial<ConversionOptions> {
  recursive?: boolean;
  preserveStructure?: boolean;
  copyImages?: boolean;
  renameFiles?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
  useTOCStructure?: boolean; // Use TOC hierarchy instead of file structure
  generateMasterDoc?: boolean; // Generate master document from TOCs
  writersideOptions?: import('../types/index').WritersideOptions; // Writerside project options
  onProgress?: (progress: ConversionProgress) => void; // Progress callback
}

export interface ConversionProgress {
  currentFile: string;
  currentFileIndex: number;
  totalFiles: number;
  percentage: number;
  status: 'discovering' | 'converting' | 'completed' | 'error';
  message?: string;
  phase?: string;
  fileProgress?: number;
  processedFiles?: number;
  processedSize?: number;
  totalSize?: number;
}

export interface BatchConversionResult {
  totalFiles: number;
  convertedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
  skippedFilesList: Array<{ file: string; reason: string }>; // Track skipped files with reasons
  results: Array<{ inputPath: string; outputPath: string; result: ConversionResult }>;
  filenameMapping?: Map<string, string>; // Maps old relative paths to new relative paths
  tocStructure?: {
    totalTOCs: number;
    discoveredFiles: number;
    masterDocumentPath?: string;
  };
  qualitySummary?: {
    averageScore: number;
    totalIssues: number;
    lowQualityFiles: Array<{ file: string; score: number; issues: number }>;
  };
}

export class BatchService {
  private documentService: DocumentService;
  private tocDiscoveryService: TOCDiscoveryService;
  private tocService: TocService;
  private flvarParser: FLVARParser;
  private variableExtractor: VariableExtractor;
  // Include all MadCap file types and image files for proper resource availability
  private supportedExtensions = new Set(['html', 'htm', 'docx', 'doc', 'xml', 'flsnp', 'flglo', 'fltoc', 'flvar', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']);
  
  // Chunked processing configuration
  private readonly CHUNK_SIZE = 50; // Process 50 files at a time
  private readonly CHUNK_DELAY = 1000; // 1 second delay between chunks

  constructor() {
    this.documentService = new DocumentService();
    this.tocDiscoveryService = new TOCDiscoveryService();
    this.tocService = new TocService();
    this.flvarParser = new FLVARParser();
    this.variableExtractor = new VariableExtractor();
  }
  
  /**
   * Set default options to improve user experience by enabling commonly needed features
   */
  private setDefaultOptions(options: BatchConversionOptions): void {
    console.log(`🔧 [BatchService setDefaultOptions] ========== SETTING DEFAULT OPTIONS ==========`);
    console.log(`🔧 [BatchService setDefaultOptions] Input format: ${options.format}`);
    console.log(`🔧 [BatchService setDefaultOptions] Input options:`, JSON.stringify({
      format: options.format,
      copyImages: options.copyImages,
      variableOptions: options.variableOptions,
      asciidocOptions: options.asciidocOptions
    }, null, 2));
    
    try {
      // Enable variable extraction by default for formats that support it
      if (options.format === 'asciidoc' || options.format === 'writerside-markdown') {
        console.log(`🔧 [BatchService setDefaultOptions] Processing variable options for ${options.format}`);
        
        if (!options.variableOptions) {
          options.variableOptions = {};
          console.log(`🔧 [BatchService setDefaultOptions] Created empty variableOptions object`);
        }
        
        // Enable variable extraction if not explicitly disabled
        if (options.variableOptions.extractVariables === undefined) {
          options.variableOptions.extractVariables = true;
          console.log(`🔧 [BatchService setDefaultOptions] ✅ ENABLED variable extraction by default`);
        } else {
          console.log(`🔧 [BatchService setDefaultOptions] Variable extraction already set to: ${options.variableOptions.extractVariables}`);
        }
        
        // Set appropriate variable format
        if (!options.variableOptions.variableFormat) {
          options.variableOptions.variableFormat = options.format === 'asciidoc' ? 'adoc' : 'writerside';
          console.log(`🔧 [BatchService setDefaultOptions] ✅ SET variable format to: ${options.variableOptions.variableFormat}`);
        } else {
          console.log(`🔧 [BatchService setDefaultOptions] Variable format already set to: ${options.variableOptions.variableFormat}`);
        }
      }
      
      // Enable glossary processing by default for AsciiDoc format
      if (options.format === 'asciidoc') {
        console.log(`🔧 [BatchService setDefaultOptions] Processing glossary options for AsciiDoc format`);
        
        if (!options.asciidocOptions) {
          options.asciidocOptions = {};
          console.log(`🔧 [BatchService setDefaultOptions] Created empty asciidocOptions object`);
        }
        
        if (!options.asciidocOptions.glossaryOptions) {
          options.asciidocOptions.glossaryOptions = {};
          console.log(`🔧 [BatchService setDefaultOptions] Created empty glossaryOptions object`);
        }
        
        // Enable glossary processing if not explicitly disabled
        if (options.asciidocOptions.glossaryOptions.includeGlossary === undefined) {
          options.asciidocOptions.glossaryOptions.includeGlossary = true;
          console.log(`🔧 [BatchService setDefaultOptions] ✅ ENABLED glossary processing by default`);
        } else {
          console.log(`🔧 [BatchService setDefaultOptions] Glossary processing already set to: ${options.asciidocOptions.glossaryOptions.includeGlossary}`);
        }
        
        // Set default glossary format
        if (!options.asciidocOptions.glossaryOptions.glossaryFormat) {
          options.asciidocOptions.glossaryOptions.glossaryFormat = 'separate';
          console.log(`🔧 [BatchService setDefaultOptions] ✅ SET glossary format to: separate`);
        } else {
          console.log(`🔧 [BatchService setDefaultOptions] Glossary format already set to: ${options.asciidocOptions.glossaryOptions.glossaryFormat}`);
        }
      }
      
      // Enable image copying by default unless explicitly disabled
      if (options.copyImages === undefined) {
        options.copyImages = true;
        console.log(`🔧 [BatchService setDefaultOptions] ✅ ENABLED image copying by default`);
      } else {
        console.log(`🔧 [BatchService setDefaultOptions] Image copying already set to: ${options.copyImages}`);
      }
      
      console.log(`🔧 [BatchService setDefaultOptions] ========== FINAL OPTIONS AFTER DEFAULTS ==========`);
      console.log(`🔧 [BatchService setDefaultOptions] Final complete options:`, JSON.stringify({
        format: options.format,
        extractVariables: options.variableOptions?.extractVariables,
        variableFormat: options.variableOptions?.variableFormat,
        includeGlossary: options.asciidocOptions?.glossaryOptions?.includeGlossary,
        glossaryFormat: options.asciidocOptions?.glossaryOptions?.glossaryFormat,
        copyImages: options.copyImages,
        asciidocOptionsExists: !!options.asciidocOptions,
        glossaryOptionsExists: !!options.asciidocOptions?.glossaryOptions
      }, null, 2));
      console.log(`🔧 [BatchService setDefaultOptions] ===================================================`);
      
    } catch (error) {
      console.error(`❌ [BatchService setDefaultOptions] ERROR in setDefaultOptions:`, error);
      console.error(`❌ [BatchService setDefaultOptions] Stack trace:`, error instanceof Error ? error.stack : 'No stack trace');
      throw error; // Re-throw to fail fast
    }
  }

  /**
   * Extract variables from FLVAR files in the project
   */
  private async extractVariablesFromProject(inputDir: string, options: BatchConversionOptions): Promise<void> {
    console.log(`🔍 [BatchService Variable] Starting variable extraction from project: ${inputDir}`);
    
    if (!options.variableOptions?.extractVariables) {
      console.log(`⏭️ [BatchService Variable] Variable extraction disabled, skipping`);
      return;
    }

    try {
      // Find all FLVAR files in the project
      console.log(`🔍 [BatchService Variable] Searching for FLVAR files...`);
      const flvarFiles = await this.flvarParser.findFLVARFiles(inputDir);
      console.log(`🔍 [BatchService Variable] Found ${flvarFiles.length} FLVAR files:`, flvarFiles);

      if (flvarFiles.length === 0) {
        console.log(`⚠️ [BatchService Variable] No FLVAR files found in project`);
        return;
      }

      // Parse all FLVAR files
      const variableSets = await this.flvarParser.parseMultipleFiles(flvarFiles);
      console.log(`📚 [BatchService Variable] Parsed ${variableSets.length} variable sets`);
      
      // Merge variables from all sets  
      const mergedVariables = this.flvarParser.mergeVariableSets(variableSets);
      console.log(`🔗 [BatchService Variable] Merged ${mergedVariables.length} unique variables`);

      // Clear and populate the variable extractor
      this.variableExtractor.clear();
      
      // Convert MadCap variables to ExtractedVariable format
      for (const madcapVar of mergedVariables) {
        // Use VariableExtractor.createExtractedVariable to ensure proper format
        const extractedVariable = VariableExtractor.createExtractedVariable(
          madcapVar.name,
          madcapVar.value,
          'madcap'
        );
        this.variableExtractor.addVariable(extractedVariable);
      }

      console.log(`✅ [BatchService Variable] Successfully extracted and loaded ${mergedVariables.length} variables`);
      
      // Verify variables were stored correctly
      const storedVariables = this.variableExtractor.getVariables();
      console.log(`🔍 [BatchService Variable] Verification: VariableExtractor now contains ${storedVariables.length} variables`);
      
      // Log variable details for debugging
      if (storedVariables.length > 0) {
        console.log(`📋 [BatchService Variable] Stored variable details:`);
        storedVariables.forEach(v => {
          console.log(`  - ${v.name}: "${v.value}" (key: ${v.key}, namespace: ${v.namespace}, source: ${v.source})`);
        });
      } else {
        console.log(`❌ [BatchService Variable] ERROR: No variables stored despite ${mergedVariables.length} variables being processed!`);
      }

    } catch (error) {
      console.error(`❌ [BatchService Variable] Failed to extract variables:`, error);
      // Don't throw - variable extraction failure shouldn't break the entire conversion
    }
  }
  
  /**
   * Recursively find all directories that contain image files (for temp uploads)
   */
  private async findImageDirectoriesRecursively(
    searchDir: string, 
    imageExtensions: Set<string>
  ): Promise<string[]> {
    const imageDirectories: string[] = [];
    const maxDepth = 8; // Prevent infinite recursion
    
    const searchDirectory = async (dir: string, depth: number = 0): Promise<void> => {
      if (depth > maxDepth) return;
      
      try {
        const { readdir } = await import('fs/promises');
        const entries = await readdir(dir, { withFileTypes: true });
        let hasImages = false;
        
        // Check if this directory contains any image files
        for (const entry of entries) {
          if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (imageExtensions.has(ext)) {
              hasImages = true;
              break;
            }
          }
        }
        
        // If this directory has images, add it to the list
        if (hasImages) {
          imageDirectories.push(dir);
          console.log(`🖼️ Found image directory: ${relative(searchDir, dir) || '.'}`);
        }
        
        // Recurse into subdirectories (use the same directory filtering)
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const shouldInclude = this.shouldIncludeDirectory(entry.name);
            if (shouldInclude) {
              await searchDirectory(join(dir, entry.name), depth + 1);
            } else {
              console.log(`🚫 [Image Search] Excluding directory: ${entry.name} (output/temp folder)`);
            }
          }
        }
      } catch (error) {
        // Ignore permission errors and continue
        console.warn(`⚠️ Could not search directory ${dir}: ${error}`);
      }
    };
    
    await searchDirectory(searchDir, 0);
    return imageDirectories;
  }


  /**
   * Generate variables file from extracted variables
   */
  private async generateVariablesFile(outputDir: string, options: BatchConversionOptions): Promise<void> {
    if (!options.variableOptions?.extractVariables) {
      return;
    }

    const variables = this.variableExtractor.getVariables();
    if (variables.length === 0) {
      console.log(`⏭️ [BatchService Variable] No variables to generate file for`);
      return;
    }

    try {
      const variablesContent = this.variableExtractor.generateVariablesFile({
        variableFormat: options.variableOptions.variableFormat || 'adoc'
      });
      
      const variablesDir = join(outputDir, 'includes');
      await mkdir(variablesDir, { recursive: true });
      
      const variablesPath = join(variablesDir, 'variables.adoc');
      await writeFile(variablesPath, variablesContent, 'utf8');
      
      console.log(`✅ [BatchService Variable] Generated variables file: ${variablesPath} (${variables.length} variables)`);
      
    } catch (error) {
      console.error(`❌ [BatchService Variable] Failed to generate variables file:`, error);
    }
  }

  /**
   * Get file extension for format
   */
  private getFileExtension(format: string): string {
    switch (format) {
      case 'asciidoc': return 'adoc';
      case 'writerside-markdown': return 'md';
      case 'zendesk': return 'html';
      default: return 'txt';
    }
  }

  /**
   * Convert large batches in chunks to prevent server overload
   */
  async convertFolderChunked(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions = {}
  ): Promise<BatchConversionResult> {
    console.log(`📦 [BatchService Chunked] Starting chunked conversion: ${inputDir} -> ${outputDir}`);
    
    // Discover all files first
    const allFiles = await this.discoverFiles(inputDir, options);
    const totalFiles = allFiles.length;
    
    console.log(`📦 [BatchService Chunked] Found ${totalFiles} files total`);
    
    if (totalFiles <= this.CHUNK_SIZE) {
      console.log(`📦 [BatchService Chunked] Small batch (${totalFiles} <= ${this.CHUNK_SIZE}), using regular conversion`);
      return this.convertFolder(inputDir, outputDir, options);
    }
    
    // Split files into chunks
    const chunks = this.chunkArray(allFiles, this.CHUNK_SIZE);
    console.log(`📦 [BatchService Chunked] Processing ${totalFiles} files in ${chunks.length} chunks of ${this.CHUNK_SIZE}`);
    
    // Initialize result tracking
    const aggregatedResult: BatchConversionResult = {
      totalFiles: totalFiles,
      convertedFiles: 0,
      skippedFiles: 0,
      errors: [],
      skippedFilesList: [],
      results: []
    };
    
    // Process each chunk
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const chunkStartFile = chunkIndex * this.CHUNK_SIZE + 1;
      const chunkEndFile = Math.min(chunkStartFile + chunk.length - 1, totalFiles);
      
      console.log(`📦 [BatchService Chunked] Processing chunk ${chunkIndex + 1}/${chunks.length} (files ${chunkStartFile}-${chunkEndFile})`);
      
      try {
        // Create temporary directory for this chunk
        const chunkInputDir = await this.createChunkDirectory(inputDir, chunk);
        
        // Process chunk with modified progress callback
        const chunkOptions = {
          ...options,
          onProgress: (progress: ConversionProgress) => {
            // Adjust progress to reflect overall batch progress
            const overallProgress = {
              ...progress,
              currentFileIndex: chunkIndex * this.CHUNK_SIZE + progress.currentFileIndex,
              totalFiles: totalFiles,
              percentage: ((chunkIndex * this.CHUNK_SIZE + progress.currentFileIndex) / totalFiles) * 100,
              phase: `Chunk ${chunkIndex + 1}/${chunks.length} - ${progress.phase || 'converting'}`
            };
            
            // Call original progress callback if provided
            if (options.onProgress) {
              options.onProgress(overallProgress);
            }
          }
        };
        
        // Convert chunk
        const chunkResult = await this.convertFolder(chunkInputDir, outputDir, chunkOptions);
        
        // Aggregate results
        aggregatedResult.convertedFiles += chunkResult.convertedFiles;
        aggregatedResult.skippedFiles += chunkResult.skippedFiles;
        aggregatedResult.errors.push(...chunkResult.errors);
        aggregatedResult.skippedFilesList.push(...chunkResult.skippedFilesList);
        aggregatedResult.results.push(...chunkResult.results);
        
        console.log(`✅ [BatchService Chunked] Chunk ${chunkIndex + 1} completed: ${chunkResult.convertedFiles}/${chunk.length} files converted`);
        
        // Delay between chunks to prevent server overload
        if (chunkIndex < chunks.length - 1) {
          console.log(`⏳ [BatchService Chunked] Waiting ${this.CHUNK_DELAY}ms before next chunk...`);
          await new Promise(resolve => setTimeout(resolve, this.CHUNK_DELAY));
        }
        
      } catch (chunkError) {
        console.error(`❌ [BatchService Chunked] Error in chunk ${chunkIndex + 1}:`, chunkError);
        
        // Add error for all files in failed chunk
        chunk.forEach(file => {
          aggregatedResult.errors.push({
            file: file.path,
            error: `Chunk ${chunkIndex + 1} failed: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`
          });
        });
      }
    }
    
    // Generate quality summary for batch
    aggregatedResult.qualitySummary = this.generateQualitySummary(aggregatedResult);
    
    console.log(`🎉 [BatchService Chunked] Chunked conversion completed: ${aggregatedResult.convertedFiles}/${totalFiles} files converted`);
    console.log(`📊 [BatchService] Quality summary: Average score ${aggregatedResult.qualitySummary.averageScore.toFixed(1)}/100, ${aggregatedResult.qualitySummary.totalIssues} total issues`);
    
    return aggregatedResult;
  }

  /**
   * Split array into chunks of specified size
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Create a temporary directory with only the files for this chunk
   */
  private async createChunkDirectory(originalInputDir: string, chunkFiles: any[]): Promise<string> {
    // For now, return the original directory - in a full implementation, 
    // we would create a temporary directory with symlinks or copies of just the chunk files
    // This is a simplified version that still provides chunked processing benefits
    return originalInputDir;
  }

  /**
   * Discover all files that would be processed
   */
  private async discoverFiles(inputDir: string, options: BatchConversionOptions = {}): Promise<any[]> {
    // Simplified file discovery - in a full implementation this would 
    // return the actual file objects that would be processed
    const files = await this.getAllFiles(inputDir);
    // Filter to only include convertible file types
    const convertibleExtensions = ['.html', '.htm', '.xml'];
    return files.filter(file => convertibleExtensions.some(ext => file.toLowerCase().endsWith(ext)));
  }

  async convertFolder(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions = {}
  ): Promise<BatchConversionResult> {
    console.log(`🔍 [BREADCRUMB] BatchService.convertFolder() ENTRY POINT`);
    console.log(`🔍 [BREADCRUMB] Will call either convertFolderWithTOCStructure() or convertFolderRegular()`);
    console.log(`🚀 [BatchService] Starting conversion: ${inputDir} -> ${outputDir}`);
    console.log(`🚀 [BatchService] Options:`, JSON.stringify(options, null, 2));
    console.log(`🚀 [BatchService] Has onProgress callback:`, !!options.onProgress);
    
    // Set default options for better user experience
    this.setDefaultOptions(options);
    // TODO: Restore WritersideBatchService for Writerside project generation
    /*
    if (options.format === 'writerside-markdown' && options.writersideOptions?.createProject) {
      // Use WritersideBatchService for complete Writerside project generation
      const { WritersideBatchService } = await import('./services/writerside-batch-service.js');
      const writersideService = new WritersideBatchService();
      
      const writersideResult = await writersideService.convertToWritersideProject(
        inputDir,
        outputDir,
        {
          ...options,
          ...options.writersideOptions,
          format: 'writerside-markdown' as const,
          inputType: 'madcap' as const
        }
      );
      
      // Convert WritersideBatchResult to BatchConversionResult
      return {
        totalFiles: writersideResult.totalFiles,
        convertedFiles: writersideResult.convertedFiles,
        skippedFiles: writersideResult.skippedFiles,
        errors: writersideResult.errors,
        skippedFilesList: writersideResult.errors.map(e => ({ file: e.file, reason: e.error })),
        results: writersideResult.results,
        filenameMapping: options.renameFiles ? new Map<string, string>() : undefined,
        tocStructure: writersideResult.tocStructure ? {
          totalTOCs: writersideResult.instances.length,
          discoveredFiles: writersideResult.totalFiles,
          masterDocumentPath: undefined
        } : undefined
      };
    }
    */

    const result: BatchConversionResult = {
      totalFiles: 0,
      convertedFiles: 0,
      skippedFiles: 0,
      errors: [],
      skippedFilesList: [], // Track skipped files with reasons
      results: [],
      filenameMapping: options.renameFiles ? new Map<string, string>() : undefined
    };

    await this.ensureDirectoryExists(outputDir);

    // Handle TOC-based conversion if requested
    if (options.useTOCStructure) {
      console.log(`🔍 [BREADCRUMB] Taking TOC path -> convertFolderWithTOCStructure()`);
      console.log(`📋 [BatchService] Using TOC-based conversion (useTOCStructure=true)`);
      return this.convertFolderWithTOCStructure(inputDir, outputDir, options, result);
    }

    // Use regular folder conversion for non-TOC based conversions
    console.log(`🔍 [BREADCRUMB] Taking regular path -> convertFolderRegular()`);
    console.log(`📋 [BatchService] Using regular folder conversion (useTOCStructure=false/undefined)`);
    return this.convertFolderRegular(inputDir, outputDir, options, result);
  }

  private async findDocumentFiles(
    dirPath: string,
    options: BatchConversionOptions
  ): Promise<string[]> {
    const files: string[] = [];
    
    console.log(`🔍 Searching directory: ${dirPath}`);
    console.log(`📁 Supported extensions: ${Array.from(this.supportedExtensions).join(', ')}`);
    
    try {
      const entries = await readdir(dirPath);
      console.log(`📂 Found ${entries.length} entries in ${dirPath}: ${entries.join(', ')}`);
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          if (!this.shouldIncludeDirectory(entry)) {
            console.log(`🚫 Excluding directory: ${entry} (MadCap output/temp folder)`);
            continue;
          }
          
          console.log(`📁 Directory found: ${entry}`);
          if (options.recursive !== false) {
            const subFiles = await this.findDocumentFiles(fullPath, options);
            files.push(...subFiles);
          }
        } else if (stats.isFile()) {
          const ext = extname(entry).toLowerCase().slice(1);
          console.log(`📄 File: ${entry} (extension: .${ext})`);
          
          if (this.supportedExtensions.has(ext)) {
            if (this.shouldIncludeFile(entry, options)) {
              console.log(`✅ Including file: ${fullPath}`);
              files.push(fullPath);
            } else {
              console.log(`⏭️  Skipping file (pattern filter): ${fullPath}`);
            }
          } else {
            console.log(`❌ Skipping file (unsupported extension): ${fullPath} (.${ext})`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error reading directory ${dirPath}:`, error);
    }
    
    console.log(`🎯 Total files found in ${dirPath}: ${files.length}`);
    return files;
  }

  /**
   * Search for files with specific extensions recursively through uploaded files
   * This is a fallback method when normal project structure detection fails
   */
  private async findAllFilesRecursive(dirPath: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];
    const { readdir, stat } = await import('fs/promises');
    
    try {
      const entries = await readdir(dirPath);
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        try {
          const stats = await stat(fullPath);
          
          if (stats.isDirectory()) {
            // Recursively search subdirectories
            const subFiles = await this.findAllFilesRecursive(fullPath, extensions);
            files.push(...subFiles);
          } else if (stats.isFile()) {
            const ext = extname(entry).toLowerCase();
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        } catch (error) {
          // Skip files/directories that can't be accessed
          console.warn(`⚠️ Could not access: ${fullPath}`, error);
        }
      }
    } catch (error) {
      console.error(`❌ Error searching directory ${dirPath}:`, error);
    }
    
    return files;
  }

  /**
   * MadCap output and temporary folders that should be excluded from processing
   */
  private readonly EXCLUDED_DIRECTORIES = new Set([
    // MadCap output directories
    'Output',
    'output', 
    'TargetOutput',
    'Temporary',
    'temporary',
    'AutoMerge',
    'Backup',
    'backup',
    
    // Version control
    '.git',
    '.svn',
    '.hg',
    
    // Build/development folders
    'node_modules',
    '.next',
    'dist',
    'build',
    
    // IDE/Editor folders
    '.vscode',
    '.idea',
    '.vs',
    
    // OS folders
    '.DS_Store',
    'Thumbs.db',
    '$RECYCLE.BIN'
  ]);

  private shouldIncludeDirectory(dirName: string): boolean {
    const basename = dirName.split('/').pop() || dirName;
    
    // Check against excluded directories list
    if (this.EXCLUDED_DIRECTORIES.has(basename) || this.EXCLUDED_DIRECTORIES.has(basename.toLowerCase())) {
      return false;
    }
    
    // Exclude hidden directories (starting with .)
    if (basename.startsWith('.') && !['Content', 'Project', 'Resources', 'Images'].includes(basename)) {
      return false;
    }
    
    // Exclude temp directories
    if (basename.toLowerCase().includes('temp') || basename.toLowerCase().includes('tmp')) {
      return false;
    }
    
    return true;
  }

  private shouldIncludeFile(filename: string, options: BatchConversionOptions): boolean {
    const basename = filename.split('/').pop() || filename;
    
    // Exclude macOS metadata files and common temp files
    if (basename.startsWith('._') || 
        basename === '.DS_Store' || 
        basename === 'Thumbs.db' ||
        basename.endsWith('.tmp') ||
        basename.endsWith('.temp') ||
        basename.endsWith('.bak')) {
      return false;
    }
    
    // Exclude MadCap temporary files
    if (basename.endsWith('.mclog') || 
        basename.endsWith('.mcwebhelp') ||
        basename.startsWith('~') ||
        basename.includes('.fllog')) {
      return false;
    }
    
    if (options.excludePatterns) {
      for (const pattern of options.excludePatterns) {
        if (this.matchesPattern(basename, pattern)) {
          return false;
        }
      }
    }
    
    if (options.includePatterns) {
      for (const pattern of options.includePatterns) {
        if (this.matchesPattern(basename, pattern)) {
          return true;
        }
      }
      return false;
    }
    
    return true;
  }

  private matchesPattern(filename: string, pattern: string): boolean {
    // Handle basic glob patterns like *.htm, *.html, etc.
    if (pattern.startsWith('*')) {
      const extension = pattern.slice(1); // Remove the *
      return filename.endsWith(extension);
    }
    
    // Handle exact matches or substring matches
    return filename.includes(pattern);
  }

  private async generateOutputPath(relativePath: string, outputDir: string, format: string, inputPath?: string, renameFiles?: boolean): Promise<string> {
    const parsedPath = {
      dir: dirname(relativePath),
      name: basename(relativePath, extname(relativePath))
    };
    
    let extension: string;
    switch (format) {
      case 'asciidoc':
        extension = '.adoc';
        break;
      case 'zendesk':
        extension = '.html';
        break;
      case 'markdown':
      case 'madcap-markdown':
      case 'writerside-markdown':
      default:
        extension = '.md';
        break;
    }
    
    let outputFileName: string;
    
    // Use H1 text as filename when renameFiles is enabled OR for Zendesk format
    if ((renameFiles || format === 'zendesk') && inputPath) {
      const h1Text = await this.extractH1Text(inputPath);
      if (h1Text) {
        // Convert H1 text to filename: create clean, URL-friendly name
        const cleanFileName = this.sanitizeFilename(h1Text);
        
        if (cleanFileName) {
          outputFileName = `${cleanFileName}${extension}`;
        } else {
          outputFileName = `${parsedPath.name}${extension}`;
        }
      } else {
        outputFileName = `${parsedPath.name}${extension}`;
      }
    } else {
      outputFileName = `${parsedPath.name}${extension}`;
    }
    
    return join(outputDir, parsedPath.dir, outputFileName);
  }

  private sanitizeFilename(text: string): string {
    // Create clean, URL-friendly filename from H1 text
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens (more URL-friendly than underscores)
      .replace(/_+/g, '-') // Replace underscores with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
      .substring(0, 100); // Limit length to prevent filesystem issues
  }

  private async updateCrossReferences(
    result: BatchConversionResult, 
    outputDir: string, 
    format: string
  ): Promise<void> {
    if (!result.filenameMapping) return;

    // Updating cross-references for ${result.results.length} files...
    
    for (const { outputPath } of result.results) {
      try {
        const content = await readFile(outputPath, 'utf8');
        let updatedContent = content;
        let hasChanges = false;

        // Update links based on format
        if (format === 'writerside-markdown') {
          // Update Markdown links: [text](path) and [text](path#anchor)
          updatedContent = content.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, url) => {
            const updatedUrl = this.updateLinkUrl(url, result.filenameMapping!, outputPath, outputDir);
            if (updatedUrl !== url) {
              hasChanges = true;
              return `[${text}](${updatedUrl})`;
            }
            return match;
          });
        } else if (format === 'asciidoc') {
          // Update AsciiDoc links: link:path[text] and xref:path[text]
          updatedContent = content.replace(/(link|xref):([^\[]+)\[([^\]]*)\]/g, (match, linkType, url, text) => {
            const updatedUrl = this.updateLinkUrl(url, result.filenameMapping!, outputPath, outputDir);
            if (updatedUrl !== url) {
              hasChanges = true;
              return `${linkType}:${updatedUrl}[${text}]`;
            }
            return match;
          });
        } else if (format === 'zendesk') {
          // Update HTML links: <a href="path">text</a>
          updatedContent = content.replace(/<a\s+([^>]*\s+)?href="([^"]*)"([^>]*)>([^<]*)<\/a>/gi, (match, before, url, after, text) => {
            const updatedUrl = this.updateLinkUrl(url, result.filenameMapping!, outputPath, outputDir);
            if (updatedUrl !== url) {
              hasChanges = true;
              return `<a ${before || ''}href="${updatedUrl}"${after || ''}>${text}</a>`;
            }
            return match;
          });
        }

        // Write updated content if changes were made
        if (hasChanges) {
          await writeFile(outputPath, updatedContent, 'utf8');
          // Updated cross-references in: ${basename(outputPath)}
        }

      } catch (error) {
        // Failed to update cross-references in ${outputPath}: ${error}
      }
    }
  }

  private updateLinkUrl(
    url: string,
    filenameMapping: Map<string, string>,
    currentOutputPath: string,
    outputDir: string
  ): string {
    // Skip external URLs, anchors, and mailto links
    if (url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('#')) {
      return url;
    }

    // Split URL and anchor
    const [rawPath, anchor] = url.split('#');

    // Normalize incoming path for matching against mapping keys
    // - strip leading ../ or ./ segments
    // - strip leading user/ (some conversions emit root-relative paths)
    let path = rawPath
      .replace(/^(\.\.\/)+/, '')
      .replace(/^\.\//, '')
      .replace(/^user\//, '');

    // Check if this path (or a variation) exists in our mapping
    for (const [oldPath, newPath] of filenameMapping.entries()) {
      // Try exact match
      if (path === oldPath) {
        return this.calculateRelativePath(currentOutputPath, newPath, outputDir, anchor);
      }

      // Try without extension for cross-format references
      const pathWithoutExt = path.replace(/\.(html?|adoc|md)$/i, '');
      const oldPathWithoutExt = oldPath.replace(/\.(html?|adoc|md)$/i, '');
      if (pathWithoutExt === oldPathWithoutExt) {
        return this.calculateRelativePath(currentOutputPath, newPath, outputDir, anchor);
      }

      // Try basename match as a fallback (when only filename is referenced)
      const pathBase = basename(pathWithoutExt);
      const oldBase = basename(oldPathWithoutExt);
      if (pathBase && pathBase === oldBase) {
        return this.calculateRelativePath(currentOutputPath, newPath, outputDir, anchor);
      }
    }

    // No mapping found, return original
    return url;
  }

  private async extractH1Text(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, 'utf8');
      
      // Use regex for faster H1 extraction instead of full DOM parsing
      const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match && h1Match[1]?.trim()) {
        return h1Match[1].trim();
      }
      
      // Fallback: look for title element
      const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]?.trim()) {
        return titleMatch[1].trim();
      }
      
      // Fallback: look for MadCap heading patterns
      const madcapMatch = content.match(/data-mc-heading-level="1"[^>]*>([^<]+)</i);
      if (madcapMatch && madcapMatch[1]?.trim()) {
        return madcapMatch[1].trim();
      }
      
      return null;
    } catch (error) {
      // Could not extract H1 text from ${filePath}: ${error}
      return null;
    }
  }

  private async copyReferencedImages(
    inputPath: string,
    outputPath: string,
    images: string[],
    options: BatchConversionOptions
  ): Promise<void> {
    const inputDir = dirname(inputPath);
    const outputDir = dirname(outputPath);
    
    // Debug the directory structure
    console.log(`🔍 [Image Copy] Analyzing paths:`);
    console.log(`  - inputPath: ${inputPath}`);
    console.log(`  - inputDir: ${inputDir}`);
    console.log(`  - outputDir: ${outputDir}`);
    
    // Find the actual project root by looking for where input/ directory is
    let projectRoot = inputDir;
    if (inputDir.includes('/input/')) {
      // For temp uploads, project root is parent of input/
      projectRoot = inputDir.substring(0, inputDir.indexOf('/input/'));
      console.log(`  - Found temp upload structure, projectRoot: ${projectRoot}`);
    } else if (inputDir.includes('/Content/')) {
      // For normal MadCap projects, project root is parent of Content/
      projectRoot = inputDir.substring(0, inputDir.indexOf('/Content/'));
      console.log(`  - Found MadCap structure, projectRoot: ${projectRoot}`);
    }
    
    for (const imagePath of images) {
      if (imagePath.startsWith('data:') || imagePath.startsWith('http')) {
        continue;
      }
      
      console.log(`\n🖼️ [Image Copy] Looking for image: ${imagePath}`);
      
      // Clean up the image path
      const cleanImagePath = imagePath.replace(/^\.\.\//, '');
      
      // Try multiple strategies to find the image
      const possibleSourcePaths = [
        // 1. Direct from project root (most common for ../Images/ paths)
        join(projectRoot, cleanImagePath),
        // 2. From Resources directory
        join(projectRoot, 'Resources', cleanImagePath),
        join(projectRoot, 'Resources', cleanImagePath.replace('Images/', '')),
        // 3. Relative to the HTML file's directory
        join(inputDir, imagePath),
        // 4. Resolved from HTML file location
        resolve(inputDir, imagePath),
        // 5. Check both Images and Resources/Images
        join(projectRoot, 'Images', basename(imagePath)),
        join(projectRoot, 'Resources/Images', basename(imagePath)),
        // 6. For nested paths like Images/Screens/
        join(projectRoot, cleanImagePath.replace(/^Images\//, 'Resources/Images/'))
      ];
      
      // Remove duplicates
      const uniquePaths = [...new Set(possibleSourcePaths)];
      
      // Try to find the image in any of the possible locations
      let sourceImagePath: string | null = null;
      console.log(`  Searching in ${uniquePaths.length} possible locations:`);
      for (const possiblePath of uniquePaths) {
        console.log(`    Checking: ${possiblePath}`);
        try {
          await stat(possiblePath);
          sourceImagePath = possiblePath;
          console.log(`    ✅ Found at: ${possiblePath}`);
          break;
        } catch {
          // File doesn't exist at this path, try next
          console.log(`    ❌ Not found`);
        }
      }
      
      if (!sourceImagePath) {
        console.log(`⚠️ Image not found in expected locations: ${imagePath}`);
        console.log(`  Searched ${uniquePaths.length} locations, now trying fallback...`);
        
        // FALLBACK: Search through all uploaded image files for a filename match
        try {
          const imageFilename = basename(imagePath);
          console.log(`🔍 [Image FALLBACK] Searching for filename: ${imageFilename} in uploaded files`);
          
          const allImageFiles = await this.findAllFilesRecursive(projectRoot, ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.webp']);
          console.log(`📁 [Image FALLBACK] Found ${allImageFiles.length} image files in upload`);
          
          for (const imageFallbackPath of allImageFiles) {
            if (basename(imageFallbackPath) === imageFilename) {
              sourceImagePath = imageFallbackPath;
              console.log(`✅ [Image FALLBACK] Found matching filename: ${imageFallbackPath}`);
              break;
            }
          }
        } catch (error) {
          console.error(`❌ [Image FALLBACK] Error during fallback search:`, error);
        }
      }
      
      if (!sourceImagePath) {
        console.error(`❌ Image not found in any location: ${imagePath}`);
        console.error(`  Searched ${uniquePaths.length} locations:`);
        uniquePaths.forEach(p => console.error(`    - ${p}`));
        continue;
      }
      
      // Determine target path - preserve relative structure
      const targetImagePath = join(outputDir, imagePath);
      
      try {
        await this.ensureDirectoryExists(dirname(targetImagePath));
        await copyFile(sourceImagePath, targetImagePath);
        console.log(`📸 Successfully copied image: ${imagePath} from ${sourceImagePath}`);
      } catch (error) {
        console.error(`❌ Failed to copy image ${imagePath}:`, error);
        console.error(`  Source: ${sourceImagePath}`);
        console.error(`  Target: ${targetImagePath}`);
      }
    }
  }

  private async copyImageDirectories(
    sourceRootDir: string,
    targetRootDir: string
  ): Promise<{ success: boolean; copiedDirectories: string[]; errors: string[] }> {
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp']);
    const result = {
      success: false,
      copiedDirectories: [] as string[],
      errors: [] as string[]
    };
    
    // Detect if this is a temp upload directory
    const isTempUpload = sourceRootDir.includes('batch-convert') || 
                        sourceRootDir.includes('/tmp/') || 
                        basename(sourceRootDir) === 'input';
    
    console.log(`🔍 === IMAGE DIRECTORY DISCOVERY ===`);
    console.log(`📂 Source root: ${sourceRootDir}`);
    console.log(`📂 Target root: ${targetRootDir}`);
    console.log(`🔍 Upload type: ${isTempUpload ? 'temp upload' : 'standard project'}`);
    
    // Map source image directories to target locations - Enhanced with more possible paths
    // For TOC-based conversions, images should be accessible from user/subfolder/ as ../../Images/
    let imageDirMappings = [
      // Standard MadCap paths
      { source: 'Content/Images', target: 'Images' },
      { source: 'Content/Resources/Images', target: 'Images' },
      { source: 'Resources/Images', target: 'Images' },
      { source: 'Resources/Multimedia', target: 'Images' },
      // Additional common paths
      { source: 'Images', target: 'Images' },
      { source: 'Content/Resources/Multimedia', target: 'Images' },
      { source: 'Project/Images', target: 'Images' },
      { source: 'Resources/Graphics', target: 'Images' },
      { source: 'Content/Graphics', target: 'Images' },
      // Handle uploaded files with different structures
      { source: 'images', target: 'Images' }, // lowercase
      { source: 'content/images', target: 'Images' },
      { source: 'resources/images', target: 'Images' }
    ];
    
    // For temp uploads, also search for any directory containing images
    if (isTempUpload) {
      try {
        const additionalImageDirs = await this.findImageDirectoriesRecursively(sourceRootDir, imageExtensions);
        console.log(`🔍 Found additional image directories in temp upload: ${additionalImageDirs.length}`);
        
        // Add discovered directories to mappings
        for (const dir of additionalImageDirs) {
          const relativePath = relative(sourceRootDir, dir);
          if (relativePath && !imageDirMappings.some(m => m.source === relativePath)) {
            imageDirMappings.push({ source: relativePath, target: 'Images' });
            console.log(`🔍 Added temp upload directory mapping: ${relativePath} -> Images`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error discovering additional image directories: ${error}`);
      }
    }
    
    // First, check for standard MadCap directory structures
    for (const mapping of imageDirMappings) {
      const sourceImageDir = join(sourceRootDir, mapping.source);
      const targetImageDir = join(targetRootDir, mapping.target);
      
      console.log(`🔍 Checking: ${mapping.source} -> ${sourceImageDir}`);
      try {
        const { stat } = await import('fs/promises');
        const stats = await stat(sourceImageDir);
        if (stats.isDirectory()) {
          console.log(`✅ Found image directory: ${mapping.source}`);
          console.log(`📂 Copying image directory: ${mapping.source} -> ${mapping.target}`);
          
          try {
            await this.copyDirectoryRecursive(sourceImageDir, targetImageDir, imageExtensions);
            console.log(`✅ Successfully copied image directory: ${mapping.source}`);
            result.copiedDirectories.push(mapping.source);
            result.success = true;
          } catch (copyError) {
            const errorMsg = `Failed to copy image directory ${mapping.source}: ${copyError instanceof Error ? copyError.message : String(copyError)}`;
            console.error(`❌ ${errorMsg}`);
            result.errors.push(errorMsg);
            // Continue trying other directories even if one fails
          }
        }
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') {
          // Directory doesn't exist - this is expected for many mappings
          console.log(`❌ Image directory not found: ${mapping.source} (${sourceImageDir})`);
        } else {
          // Unexpected error (permissions, etc.) - log but continue
          const errorMsg = `Error accessing ${mapping.source}: ${nodeError.message}`;
          console.error(`❌ ${errorMsg}`);
          result.errors.push(errorMsg);
        }
        continue;
      }
    }
    
    // If no standard directories were found, search more aggressively
    if (!result.success) {
      console.log(`🔍 No standard image directories found. Searching for any directories with images...`);
      const foundImageDirs = await this.searchForImageDirectories(sourceRootDir, imageExtensions);
      
      if (foundImageDirs.length > 0) {
        console.log(`✅ Found ${foundImageDirs.length} directories containing images:`);
        foundImageDirs.forEach(dir => console.log(`  - ${relative(sourceRootDir, dir)}`));
        
        const targetImageDir = join(targetRootDir, 'Images');
        await this.ensureDirectoryExists(targetImageDir);
        
        for (const imageDir of foundImageDirs) {
          try {
            console.log(`📂 Copying images from: ${relative(sourceRootDir, imageDir)}`);
            await this.copyDirectoryRecursive(imageDir, targetImageDir, imageExtensions);
            result.copiedDirectories.push(relative(sourceRootDir, imageDir));
            result.success = true;
          } catch (copyError) {
            const errorMsg = `Failed to copy images from ${relative(sourceRootDir, imageDir)}: ${copyError instanceof Error ? copyError.message : String(copyError)}`;
            console.error(`❌ ${errorMsg}`);
            result.errors.push(errorMsg);
          }
        }
      }
      
      // ALWAYS search for individual image files as additional fallback
      console.log(`🔍 Searching for individual image files throughout the structure...`);
      const imageFiles = await this.findAllImageFiles(sourceRootDir, imageExtensions);
      
      if (imageFiles.length > 0) {
        console.log(`✅ Found ${imageFiles.length} individual image files scattered in the structure`);
        const targetImageDir = join(targetRootDir, 'Images');
        await this.ensureDirectoryExists(targetImageDir);
        
        let copiedCount = 0;
        for (const imagePath of imageFiles) {
          try {
            const fileName = basename(imagePath);
            const targetPath = join(targetImageDir, fileName);
            
            // Avoid overwriting files already copied from directories
            try {
              await stat(targetPath);
              console.log(`⏭️ Skipping ${fileName} (already exists)`);
              continue;
            } catch {
              // File doesn't exist, proceed with copy
            }
            
            await copyFile(imagePath, targetPath);
            console.log(`📸 Copied individual file: ${fileName} from ${relative(sourceRootDir, imagePath)}`);
            copiedCount++;
          } catch (copyError) {
            console.error(`❌ Failed to copy ${relative(sourceRootDir, imagePath)}:`, copyError);
          }
        }
        
        if (copiedCount > 0) {
          result.success = true;
          result.copiedDirectories.push(`(${copiedCount} individual files)`);
        }
      } else {
        console.log(`❌ No image files found anywhere in the uploaded content`);
      }
    }
    
    console.log(`🔍 === END IMAGE DIRECTORY DISCOVERY ===`);
    console.log(`📊 Image copying results:`);
    console.log(`  - Copied directories: ${result.copiedDirectories.length} (${result.copiedDirectories.join(', ') || 'none'})`);
    console.log(`  - Errors: ${result.errors.length}`);
    console.log(`  - Overall success: ${result.success}`);
    
    if (result.errors.length > 0) {
      console.log(`⚠️ Image copying errors:`);
      result.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    return result;
  }

  private async copyDirectoryRecursive(
    sourceDir: string,
    targetDir: string,
    allowedExtensions?: Set<string>
  ): Promise<void> {
    // Prevent infinite recursion by checking if source is within target
    const normalizedSource = sourceDir.replace(/\/$/, '');
    const normalizedTarget = targetDir.replace(/\/$/, '');
    
    if (normalizedSource === normalizedTarget || normalizedSource.startsWith(normalizedTarget + '/')) {
      console.log(`⚠️ [DEBUG] Skipping recursive copy: source ${sourceDir} is within target ${targetDir}`);
      return;
    }
    
    console.log(`📂 [DEBUG] copyDirectoryRecursive: ${sourceDir} -> ${targetDir}`);
    
    await this.ensureDirectoryExists(targetDir);
    
    const entries = await readdir(sourceDir);
    console.log(`📋 [DEBUG] Found ${entries.length} entries in ${sourceDir}: ${entries.join(', ')}`);
    
    for (const entry of entries) {
      // Skip macOS metadata files
      if (entry.startsWith('._') || entry === '.DS_Store') {
        continue;
      }
      
      const sourcePath = join(sourceDir, entry);
      const targetPath = join(targetDir, entry);
      
      const stats = await stat(sourcePath);
      
      if (stats.isDirectory()) {
        // Check if this directory should be excluded
        if (this.shouldExcludeDirectory(sourcePath, entry)) {
          console.log(`🚫 [DEBUG] Excluding directory: ${sourcePath} (${this.getExclusionReason(sourcePath, entry)})`);
          continue;
        }
        
        console.log(`📁 [DEBUG] Recursively copying directory: ${sourcePath} -> ${targetPath}`);
        await this.copyDirectoryRecursive(sourcePath, targetPath, allowedExtensions);
      } else if (stats.isFile()) {
        const extension = extname(entry).toLowerCase();
        if (!allowedExtensions || allowedExtensions.has(extension)) {
          console.log(`📄 [DEBUG] Copying file: ${sourcePath} -> ${targetPath} (extension: ${extension})`);
          await copyFile(sourcePath, targetPath);
          console.log(`✅ [DEBUG] Successfully copied file: ${targetPath}`);
        } else {
          console.log(`⏭️ [DEBUG] Skipping file (extension not allowed): ${sourcePath} (${extension})`);
        }
      }
    }
  }

  /**
   * Determines if a directory should be excluded from copying
   */
  private shouldExcludeDirectory(fullPath: string, dirName: string): boolean {
    // Convert to lowercase for case-insensitive matching
    const normalizedPath = fullPath.toLowerCase();
    const normalizedName = dirName.toLowerCase();
    
    // Exclude snippets directories - these contain .flsnp source files that get converted to content
    if (normalizedName === 'snippets' || normalizedPath.includes('/snippets')) {
      console.log(`🚫 [EXCLUSION DEBUG] Excluding snippets directory: ${fullPath} (${dirName})`);
      return true;
    }
    
    // Exclude PageLayouts directories - design templates not needed in output
    if (normalizedName === 'pagelayouts' || normalizedPath.includes('/pagelayouts')) {
      return true;
    }
    
    // Exclude VariableSets directories - .flvar files get processed into variables.adoc
    if (normalizedName === 'variablesets' || normalizedPath.includes('/variablesets')) {
      return true;
    }
    
    // Exclude TOCs directories - .fltoc files get processed into structure
    if (normalizedName === 'tocs' || normalizedPath.includes('/tocs')) {
      return true;
    }
    
    // Exclude Stylesheets directories - CSS gets embedded or processed separately
    if (normalizedName === 'stylesheets' || normalizedPath.includes('/stylesheets')) {
      return true;
    }
    
    return false;
  }

  /**
   * Gets the reason why a directory was excluded (for logging)
   */
  private getExclusionReason(fullPath: string, dirName: string): string {
    const normalizedPath = fullPath.toLowerCase();
    const normalizedName = dirName.toLowerCase();
    
    if (normalizedName === 'snippets' || normalizedPath.includes('/snippets')) {
      return 'snippets directory - content gets converted, source files not needed';
    }
    if (normalizedName === 'pagelayouts' || normalizedPath.includes('/pagelayouts')) {
      return 'page layouts directory - design templates not needed';
    }
    if (normalizedName === 'variablesets' || normalizedPath.includes('/variablesets')) {
      return 'variable sets directory - .flvar files processed into variables.adoc';
    }
    if (normalizedName === 'tocs' || normalizedPath.includes('/tocs')) {
      return 'TOCs directory - .fltoc files processed into document structure';
    }
    if (normalizedName === 'stylesheets' || normalizedPath.includes('/stylesheets')) {
      return 'stylesheets directory - CSS handled separately';
    }
    
    return 'unknown exclusion reason';
  }

  private determineInputType(extension: string): 'html' | 'word' | 'madcap' {
    switch (extension) {
      case 'html':
      case 'htm':
        return 'html';
      case 'docx':
      case 'doc':
        return 'word';
      case 'xml':
        return 'madcap';
      default:
        return 'html';
    }
  }

  private containsMadCapContent(content: string): boolean {
    return content.includes('MadCap:') || 
           content.includes('madcap:') || 
           content.includes('xmlns:MadCap') ||
           content.includes('data-mc-') ||
           content.includes('mc-variable') ||
           content.includes('mc-');
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async getDirectoryStats(dirPath: string): Promise<{
    totalFiles: number;
    supportedFiles: number;
    fileTypes: Record<string, number>;
    structure: string[];
  }> {
    const stats = {
      totalFiles: 0,
      supportedFiles: 0,
      fileTypes: {} as Record<string, number>,
      structure: [] as string[]
    };

    const files = await this.findDocumentFiles(dirPath, { recursive: true });
    stats.supportedFiles = files.length;

    const allFiles = await this.getAllFiles(dirPath);
    stats.totalFiles = allFiles.length;

    for (const file of allFiles) {
      const ext = extname(file).toLowerCase().slice(1) || 'no-extension';
      stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
      stats.structure.push(relative(dirPath, file));
    }

    return stats;
  }

  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  private async writeStylesheet(stylesheet: string, outputDir: string, cssOutputPath?: string): Promise<void> {
    try {
      // Determine the CSS file path
      const cssFilePath = cssOutputPath ? join(outputDir, cssOutputPath) : join(outputDir, 'zendesk-styles.css');
      
      // Ensure the directory exists
      await this.ensureDirectoryExists(dirname(cssFilePath));
      
      // Write the stylesheet to the file
      await writeFile(cssFilePath, stylesheet, 'utf8');
      
      // External stylesheet generated: ${cssFilePath}
    } catch (error) {
      // Failed to write external stylesheet: ${error}
    }
  }

  private getDefaultVariablesPath(outputPath: string, format?: 'adoc' | 'writerside'): string {
    const dir = dirname(outputPath);
    
    switch (format) {
      case 'adoc':
        // Use includes directory for AsciiDoc variables following best practices
        return join(dir, 'includes', 'variables.adoc');
      case 'writerside':
        return join(dir, 'variables.xml');
      default:
        return join(dir, 'variables.txt');
    }
  }

  /**
   * Converts files using TOC-based folder structure instead of original file structure
   */
  private async convertFolderWithTOCStructure(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions,
    result: BatchConversionResult
  ): Promise<BatchConversionResult> {
    console.log(`📖 [BatchService TOC] Starting TOC-based conversion from ${inputDir} to ${outputDir}`);
    console.log(`📖 [BatchService TOC] Has onProgress callback:`, !!options.onProgress);
    
    try {
      // Discover all TOC files in the project
      const tocDiscovery = await this.tocDiscoveryService.discoverAllTOCs(inputDir);
      console.log(`📖 [BatchService TOC] Found ${tocDiscovery.tocStructures.length} TOC files`);
      
      if (tocDiscovery.tocStructures.length === 0) {
        // No TOC files found or parsed successfully. Falling back to regular folder conversion.
        return this.convertFolderRegular(inputDir, outputDir, options, result);
      }

      // Found ${tocDiscovery.tocStructures.length} TOC files with ${tocDiscovery.totalEntries} total entries
      
      // Create TOC-based conversion plan
      const conversionPlan = await this.tocService.createTOCBasedPlan(
        tocDiscovery.tocStructures.map(ts => ts.structure),
        options.format as 'asciidoc' | 'writerside-markdown' | 'zendesk' || 'asciidoc'
      );
      
      // Creating ${conversionPlan.folderStructure.length} directories based on TOC hierarchy
      
      // Create all necessary directories
      for (const folder of conversionPlan.folderStructure) {
        await this.ensureDirectoryExists(join(outputDir, folder.path));
      }
      
      // Update result with TOC structure info
      result.tocStructure = {
        totalTOCs: tocDiscovery.tocStructures.length,
        discoveredFiles: tocDiscovery.totalEntries
      };
      
      // Convert files based on TOC mapping
      await this.processFilesWithTOCMapping(
        inputDir,
        outputDir,
        conversionPlan,
        options,
        result
      );
      
      // Update TOC-based cross-references and image paths
      if (options.format === 'asciidoc') {
        await this.updateTOCBasedReferences(
          outputDir,
          conversionPlan,
          result
        );
      }
      
      // Generate master document if requested - do this AFTER files are processed and renamed
      if (options.generateMasterDoc) {
        const masterDocPath = await this.generateMasterDocumentFromActualFiles(
          outputDir,
          result,
          options.format as 'asciidoc' | 'writerside-markdown' | 'zendesk' || 'asciidoc',
          options
        );
        if (result.tocStructure) {
          result.tocStructure.masterDocumentPath = masterDocPath;
        }
        
        // Fix relative paths in included files for master document context
        if (options.format === 'asciidoc') {
          await this.fixIncludedFilePathsForMasterDoc(outputDir, result);
        }
      }
      
      // Process glossary files if requested (only for AsciiDoc format)  
      // Check both nested (asciidocOptions.glossaryOptions) and top-level (glossaryOptions) structures
      const shouldProcessGlossaryTOC = options.format === 'asciidoc' && (
        options.asciidocOptions?.glossaryOptions?.includeGlossary || 
        (options as any).glossaryOptions?.includeGlossary
      );
      
      console.log(`🔍 [BatchService TOC] Glossary processing check:`, {
        format: options.format,
        nestedGlossaryOptions: !!options.asciidocOptions?.glossaryOptions?.includeGlossary,
        topLevelGlossaryOptions: !!(options as any).glossaryOptions?.includeGlossary,
        shouldProcessGlossary: shouldProcessGlossaryTOC
      });
      
      if (shouldProcessGlossaryTOC) {
        console.log(`📚 [BatchService TOC] Processing glossary files...`);
        await this.processGlossaryFiles(inputDir, outputDir, options, result);
      } else {
        console.log(`⏭️ [BatchService TOC] Skipping glossary processing - format: ${options.format}`);
      }
      
      // TOC-BASED CONVERSION SUMMARY:
      // Total TOCs processed: ${tocDiscovery.tocStructures.length}
      // Total entries discovered: ${tocDiscovery.totalEntries}
      // Files converted: ${result.convertedFiles}
      // Files skipped: ${result.skippedFiles}
      // Errors: ${result.errors.length}
      
      return result;
      
    } catch (error) {
      // Failed to perform TOC-based conversion: ${error}
      // Falling back to regular folder conversion...
      return this.convertFolderRegular(inputDir, outputDir, options, result);
    }
  }

  /**
   * Process files using TOC-based mapping
   */
  private async processFilesWithTOCMapping(
    inputDir: string,
    outputDir: string,
    conversionPlan: TOCBasedConversionPlan,
    options: BatchConversionOptions,
    result: BatchConversionResult
  ): Promise<void> {
    const fileMapping = conversionPlan.fileMapping;
    let stylesheetWritten = false;
    let variablesFileWritten = false;
    let imageDirectoriesCopied = false;
    
    // Create a shared variable extractor for batch processing
    const { VariableExtractor } = await import('./variable-extractor');
    const batchVariableExtractor = options.variableOptions?.extractVariables 
      ? new VariableExtractor()
      : null;
    
    // Extract all variables from .flvar files in the Flare project
    if (batchVariableExtractor) {
      const projectRoot = this.findProjectRoot(inputDir);
      await batchVariableExtractor.extractAllVariablesFromProject(projectRoot);
    }
    
    // Process each file according to TOC mapping
    const fileMappingEntries = Array.from(fileMapping.entries());
    
    // Calculate actual convertible files (exclude .flsnp files from progress calculation)
    const convertibleFiles = fileMappingEntries.filter(([originalPath]) => 
      !originalPath.toLowerCase().endsWith('.flsnp')
    );
    const totalFiles = convertibleFiles.length;
    
    console.log(`📖 [BatchService TOC] File count analysis:`, {
      totalMappedFiles: fileMappingEntries.length,
      convertibleFiles: totalFiles,
      snippetFiles: fileMappingEntries.length - totalFiles
    });
    
    let convertibleFileIndex = 0; // Counter for actual convertible files
    
    for (let fileIndex = 0; fileIndex < fileMappingEntries.length; fileIndex++) {
      const [originalPath, targetPath] = fileMappingEntries[fileIndex];
      
      // Skip .flsnp files - they should only be processed inline during MadCap conversion
      if (originalPath.toLowerCase().endsWith('.flsnp')) {
        console.log(`⏭️ [TOC] Skipping snippet file (will be processed inline): ${originalPath}`);
        continue;
      }
      
      // Increment convertible file counter
      convertibleFileIndex++;
      
      // Report progress for current convertible file
      if (options.onProgress) {
        const percentage = Math.round((convertibleFileIndex / totalFiles) * 100);
        console.log(`📖 [BatchService TOC] Sending progress: ${convertibleFileIndex}/${totalFiles} (${percentage}%) - ${basename(originalPath)}`);
        options.onProgress({
          currentFile: basename(originalPath),
          currentFileIndex: convertibleFileIndex,
          totalFiles: totalFiles,
          percentage,
          status: 'converting',
          message: `Converting ${basename(originalPath)}...`
        });
      }
      
      // Declare variables at function scope so they're available in catch block and image copying
      let conversionResult: any;
      let actualInputPath: string = originalPath; // Default to originalPath
      let finalOutputPath: string = join(outputDir, targetPath); // Default path
      
      try {
        // Resolve full input path (originalPath is relative to Content directory)
        const fullInputPath = this.resolveContentPath(originalPath, inputDir);
        const fullOutputPath = join(outputDir, targetPath);
        
        // Check if input file exists, try alternative locations if needed
        const resolvedPath = await this.findActualFilePath(fullInputPath, originalPath, inputDir);
        if (!resolvedPath) {
          // DEBUG: File mapping issue - ${originalPath} → ${fullInputPath} (not found)
          result.skippedFiles++;
          result.skippedFilesList.push({ 
            file: fullInputPath, 
            reason: 'File not found in Content directory or alternative locations' 
          });
          continue;
        }
        
        // Use the resolved path for processing
        actualInputPath = resolvedPath;
        
        
        // Handle renameFiles option: if enabled, extract H1 for filename but preserve TOC directory structure
        finalOutputPath = fullOutputPath;
        if (options.renameFiles) {
          try {
            const h1Text = await this.extractH1Text(actualInputPath);
            if (h1Text) {
              const cleanFileName = this.sanitizeFilename(h1Text);
              if (cleanFileName) {
                // Extract directory from TOC-based targetPath and combine with H1-based filename
                const tocDir = dirname(targetPath);
                const extension = extname(targetPath);
                const h1Filename = `${cleanFileName}${extension}`;
                finalOutputPath = join(outputDir, tocDir, h1Filename);
              }
            }
          } catch (error) {
            // If H1 extraction fails, fall back to original TOC-based path
            // Error extracting H1 from ${actualInputPath}: ${error}
          }
        }
        
        
        // Check if file contains binary/multimedia content
        const binaryCheck = await this.isBinaryOrMultimediaFile(actualInputPath);
        if (binaryCheck.isBinary) {
          const reason = binaryCheck.reason || 'Binary/multimedia content detected';
          console.log(`⚠️ [TOC] Skipping binary/multimedia file: ${actualInputPath} - ${reason}`);
          result.skippedFiles++;
          result.skippedFilesList.push({ file: actualInputPath, reason });
          continue;
        }
        
        // Check if file should be skipped due to MadCap conditions
        const content = await readFile(actualInputPath, 'utf8');
        if (this.containsMadCapContent(content)) {
          const shouldSkip = options.format === 'zendesk' 
            ? ZendeskConverter.shouldSkipFile(content, options as ConversionOptions)
            : MadCapConverter.shouldSkipFile(content, options as ConversionOptions);
            
          if (shouldSkip) {
            const reason = `MadCap conditions indicate content should be skipped`;
            // SKIPPED: ${actualInputPath} - ${reason}
            result.skippedFiles++;
            result.skippedFilesList.push({ file: actualInputPath, reason });
            continue;
          }
        }
        
        // Ensure output directory exists
        await this.ensureDirectoryExists(dirname(finalOutputPath));
        
        // Calculate variables file path for include directives
        let calculatedVariablesPath: string | undefined;
        if (options.variableOptions?.extractVariables) {
          if (options.variableOptions.variablesOutputPath) {
            calculatedVariablesPath = options.variableOptions.variablesOutputPath;
          } else if (options.format === 'writerside-markdown' && options.variableOptions.variableFormat === 'writerside') {
            calculatedVariablesPath = join(outputDir, 'v.list');
          } else {
            calculatedVariablesPath = join(outputDir, 'includes', 'variables.adoc');
          }
        }

        // Calculate path depth for correct image path resolution
        const relativeInputPath = relative(inputDir, actualInputPath);
        const pathDepth = dirname(relativeInputPath).split(sep).filter(part => part && part !== '.').length;
        console.log(`[Batch Debug] Input: ${actualInputPath}`);
        console.log(`[Batch Debug] InputDir: ${inputDir}`);
        console.log(`[Batch Debug] Relative: ${relativeInputPath}`);
        console.log(`[Batch Debug] Dirname: ${dirname(relativeInputPath)}`);
        console.log(`[Batch Debug] Split: ${dirname(relativeInputPath).split(sep)}`);
        console.log(`[Batch Debug] Calculated path depth: ${pathDepth}`);

        const conversionOptions: ConversionOptions = {
          format: options.format || 'asciidoc',
          inputPath: actualInputPath,
          outputPath: finalOutputPath, // Use absolute path for proper relative calculation
          inputType: this.determineInputType(extname(actualInputPath).toLowerCase().slice(1)),
          preserveFormatting: options.preserveFormatting ?? true,
          extractImages: options.extractImages ?? true,
          outputDir: dirname(finalOutputPath),
          rewriteLinks: true,
          pathDepth, // Pass path depth for image path resolution
          projectRootPath: inputDir, // Pass the temp project root for snippet resolution
          variableOptions: options.variableOptions ? {
            ...options.variableOptions,
            variablesOutputPath: calculatedVariablesPath, // Include calculated variables path
            skipFileGeneration: false // FIXED: Allow variables to be injected into individual files
          } : undefined,
          asciidocOptions: options.asciidocOptions, // FIX: Pass glossary options to individual conversions
          zendeskOptions: options.zendeskOptions
        };

        // LOG: Verify options are being passed correctly (TOC-based conversion)
        console.log(`🔧 [BatchService TOC] About to convert: ${basename(actualInputPath)}`);
        console.log(`🔧 [BatchService TOC] Conversion options being passed:`, JSON.stringify({
          format: conversionOptions.format,
          hasAsciidocOptions: !!conversionOptions.asciidocOptions,
          includeGlossary: conversionOptions.asciidocOptions?.glossaryOptions?.includeGlossary,
          glossaryFormat: conversionOptions.asciidocOptions?.glossaryOptions?.glossaryFormat,
          extractVariables: conversionOptions.variableOptions?.extractVariables,
          variableFormat: conversionOptions.variableOptions?.variableFormat
        }, null, 2));

        // Add timeout with heartbeat to prevent individual files from stalling entire batch
        const FILE_CONVERSION_TIMEOUT = 30000; // 30 seconds per file
        const HEARTBEAT_INTERVAL = 5000; // Send heartbeat every 5 seconds
        
        let heartbeatTimer: NodeJS.Timeout | null = null;
        
        try {
          // Start heartbeat to keep progress connection alive during long file conversions
          if (options.onProgress) {
            heartbeatTimer = setInterval(() => {
              options.onProgress!({
                currentFile: basename(originalPath),
                currentFileIndex: fileIndex + 1,
                totalFiles: totalFiles,
                percentage: Math.round((fileIndex / totalFiles) * 100),
                status: 'converting',
                message: `Processing ${basename(originalPath)}... (${Math.floor((Date.now() % 60000) / 1000)}s)`,
                phase: 'file_processing'
              });
            }, HEARTBEAT_INTERVAL);
          }
          
          conversionResult = await Promise.race([
            this.documentService.convertFile(
              actualInputPath,
              finalOutputPath,
              conversionOptions
            ),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`File conversion timeout after ${FILE_CONVERSION_TIMEOUT/1000}s`)), FILE_CONVERSION_TIMEOUT)
            )
          ]);
        } finally {
          // Always clear heartbeat timer
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
          }
        }

        // Handle external stylesheet generation (write only once per batch)
        if (conversionResult.stylesheet && options.format === 'zendesk' && options.zendeskOptions?.generateStylesheet && !stylesheetWritten) {
          await this.writeStylesheet(conversionResult.stylesheet, outputDir, options.zendeskOptions.cssOutputPath);
          stylesheetWritten = true;
        }

        // Collect variables from this file if extraction is enabled
        if (batchVariableExtractor && conversionResult.metadata?.variables) {
          for (const variable of conversionResult.metadata.variables) {
            batchVariableExtractor.addVariable(variable);
          }
        }

        result.results.push({
          inputPath: actualInputPath,
          outputPath: finalOutputPath,
          result: conversionResult
        });

        result.convertedFiles++;
        // Converted: ${originalPath} → ${targetPath}
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [TOC Batch] File conversion failed: ${originalPath}`, {
          error: errorMessage,
          actualInputPath,
          finalOutputPath,
          fileIndex: fileIndex + 1,
          totalFiles
        });
        
        result.errors.push({
          file: originalPath,
          error: `[File ${fileIndex + 1}/${totalFiles}] ${errorMessage}`
        });
        
        // Create a dummy conversionResult for failed files so image copying still works
        conversionResult = { metadata: { images: [] } };
      }

      // Handle image copying OUTSIDE try/catch so it always runs  
      // This ensures image directories are copied even if some individual files fail
      console.log(`🔥 [CRITICAL TOC] About to call handleImageCopying for file: ${actualInputPath}`);
      console.log(`🔥 [CRITICAL TOC] Options received: copyImages=${options.copyImages}, format=${options.format}`);
      try {
        imageDirectoriesCopied = await this.handleImageCopying(
          inputDir,
          outputDir,
          options,
          imageDirectoriesCopied,
          conversionResult,
          actualInputPath,
          finalOutputPath
        );
        console.log(`🔥 [CRITICAL TOC] handleImageCopying completed, imageDirectoriesCopied=${imageDirectoriesCopied}`);
      } catch (imageCopyError) {
        console.error(`❌ Image copying failed for ${actualInputPath}:`, imageCopyError);
        // Don't let image copying errors stop the entire process
      }
    }
    
    // Write combined variables file at the end if extraction is enabled
    if (batchVariableExtractor && options.variableOptions?.extractVariables && !variablesFileWritten) {
      const variablesFile = batchVariableExtractor.generateVariablesFile(options.variableOptions);
      if (variablesFile) {
        let variablesPath: string;
        
        if (options.variableOptions.variablesOutputPath) {
          // Use custom path if provided
          variablesPath = options.variableOptions.variablesOutputPath;
        } else if (options.format === 'writerside-markdown' && options.variableOptions.variableFormat === 'writerside') {
          // For Writerside format, save to v.list in project root
          variablesPath = join(outputDir, 'v.list');
        } else {
          // For AsciiDoc and other formats, save to includes directory
          const includesDir = join(outputDir, 'includes');
          await this.ensureDirectoryExists(includesDir);
          variablesPath = join(includesDir, 'variables.adoc');
          console.log(`📄 [BatchService] Using AsciiDoc variables path: ${variablesPath}`);
        }
        
        // Ensure directory exists for the variables file
        console.log(`📁 [BatchService] Creating directory: ${dirname(variablesPath)}`);
        await this.ensureDirectoryExists(dirname(variablesPath));
        
        console.log(`📄 [BatchService] Writing variables file: ${variablesPath} (${variablesFile.length} chars)`);
        await writeFile(variablesPath, variablesFile, 'utf8');
        console.log(`✅ [BatchService] Generated combined variables file at ${variablesPath}`);
      }
    }
    
    result.totalFiles = fileMapping.size;
  }

  /**
   * Resolves a content-relative path to full path
   */
  private resolveContentPath(contentRelativePath: string, projectDir: string): string {
    // First try Content directory
    const contentPath = join(projectDir, 'Content', contentRelativePath);
    
    // Return the content path - existence checking is done separately in the calling code
    // This ensures consistent path construction for the file mapping
    return contentPath;
  }

  /**
   * Finds the actual file path by trying multiple locations
   */
  private async findActualFilePath(
    primaryPath: string, 
    originalPath: string, 
    projectDir: string
  ): Promise<string | null> {
    // Try the primary path first
    try {
      await stat(primaryPath);
      return primaryPath;
    } catch (error) {
      // Primary path doesn't exist, try alternatives
    }

    // Alternative locations to try
    const alternatives = [
      join(projectDir, originalPath), // Direct in project root
      join(projectDir, 'Project', 'Content', originalPath), // Project/Content structure
      join(projectDir, 'Source', 'Content', originalPath), // Source/Content structure
    ];

    // Try each alternative location
    for (const altPath of alternatives) {
      try {
        await stat(altPath);
        return altPath;
      } catch (error) {
        continue;
      }
    }

    // If no exact match found, try to find files with similar names
    const filename = basename(originalPath);
    const searchResult = await this.searchForSimilarFile(projectDir, filename);
    
    return searchResult;
  }

  /**
   * Searches for files with similar names in the project directory
   */
  private async searchForSimilarFile(projectDir: string, targetFilename: string): Promise<string | null> {
    const targetBase = basename(targetFilename, extname(targetFilename)).toLowerCase();
    
    const searchDirs = [
      join(projectDir, 'Content'),
      join(projectDir, 'Project', 'Content'),
      join(projectDir, 'Source', 'Content')
    ];

    for (const searchDir of searchDirs) {
      try {
        const result = await this.searchDirectoryForFile(searchDir, targetBase);
        if (result) return result;
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  /**
   * Recursively searches a directory for files matching the target name
   */
  private async searchDirectoryForFile(dirPath: string, targetBasename: string): Promise<string | null> {
    try {
      const files = await readdir(dirPath);
      
      for (const file of files) {
        const fullPath = join(dirPath, file);
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          const result = await this.searchDirectoryForFile(fullPath, targetBasename);
          if (result) return result;
        } else if (stats.isFile()) {
          const fileBase = basename(file, extname(file)).toLowerCase();
          if (fileBase === targetBasename || fileBase.includes(targetBasename) || targetBasename.includes(fileBase)) {
            return fullPath;
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
    
    return null;
  }

  /**
   * Generates master document from TOC structures
   */
  private async generateMasterDocument(
    inputDir: string,
    outputDir: string,
    tocStructures: Array<{ path: string; structure: import('../toc-service').TocStructure }>,
    format: 'asciidoc' | 'writerside-markdown' | 'zendesk',
    options: BatchConversionOptions
  ): Promise<string> {
    const extension = (format === 'asciidoc') ? '.adoc' : format === 'zendesk' ? '.html' : '.md';
    const masterPath = join(outputDir, `master${extension}`);
    
    if (format === 'asciidoc' && options.asciidocOptions?.generateAsBook && tocStructures.length > 0) {
      // Generate book-style master document with resolved LinkedTitle and proper structure
      const masterContent = await this.generateBookMasterDocument(inputDir, tocStructures, options);
      await writeFile(masterPath, masterContent, 'utf8');
    } else {
      // Generate simple master document (fallback)
      const masterContent = await this.generateSimpleMasterDocument(outputDir, tocStructures.map(ts => ts.structure), format);
      await writeFile(masterPath, masterContent, 'utf8');
    }
    
    // Generated master document: ${masterPath}
    return masterPath;
  }

  /**
   * Generates master document from actually converted files with correct filenames
   */
  private async generateMasterDocumentFromActualFiles(
    outputDir: string,
    result: BatchConversionResult,
    format: 'asciidoc' | 'writerside-markdown' | 'zendesk',
    options: BatchConversionOptions
  ): Promise<string> {
    const extension = (format === 'asciidoc') ? '.adoc' : format === 'zendesk' ? '.html' : '.md';
    const masterPath = join(outputDir, `master${extension}`);
    
    if (format === 'asciidoc') {
      const masterContent = await this.generateActualFilesAsciiDocMaster(outputDir, result, options);
      await writeFile(masterPath, masterContent, 'utf8');
    } else {
      // For other formats, use simple file listing
      const masterContent = await this.generateSimpleFileListMaster(outputDir, result, format);
      await writeFile(masterPath, masterContent, 'utf8');
    }
    
    return masterPath;
  }

  /**
   * Generate AsciiDoc master document using actual converted files
   */
  private async generateActualFilesAsciiDocMaster(
    outputDir: string,
    result: BatchConversionResult,
    options: BatchConversionOptions
  ): Promise<string> {
    const bookTitle = options.asciidocOptions?.bookTitle || 'Documentation';
    const tocLevels = options.asciidocOptions?.includeTOCLevels || 3;
    const useBookDoctype = options.asciidocOptions?.useBookDoctype !== false;
    
    let content = `= ${bookTitle}\n`;
    
    // Add author if provided
    if (options.asciidocOptions?.bookAuthor) {
      content += `${options.asciidocOptions.bookAuthor}\n`;
    }
    
    // Add book-specific attributes
    if (useBookDoctype) {
      content += `:doctype: book\n`;
    }
    content += `:toc: left\n`;
    content += `:toclevels: ${tocLevels}\n`;
    content += `:sectnums:\n`;
    content += `:sectlinks:\n`;
    content += `:icons: font\n`;
    content += `:experimental:\n`;
    
    // Add additional book attributes
    if (useBookDoctype) {
      // Don't use :partnums: as it causes Roman numerals for chapters
      content += `:chapter-signifier: Chapter\n`;
      content += `:appendix-caption: Appendix\n`;
    }
    
    content += `\n`;
    
    // Include variables file if it exists
    if (options.variableOptions?.extractVariables) {
      content += `// Include variables file\n`;
      content += `include::includes/variables.adoc[]\n\n`;
    }
    
    // Group files by directory structure and include them
    const filesByDir = this.groupConvertedFilesByDirectory(result.results, outputDir);
    
    for (const [dirPath, files] of filesByDir.entries()) {
      if (files.length === 0) continue;
      
      // Create chapter header for directory
      const dirName = dirPath === '.' ? 'Root' : basename(dirPath).replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      if (options.asciidocOptions?.includeChapterBreaks !== false) {
        content += `[chapter]\n`;
      }
      content += `== ${dirName}\n\n`;
      
      // Include all files in this directory
      for (const { outputPath } of files) {
        const relativePath = relative(outputDir, outputPath);
        const title = await this.extractTitleFromFile(outputPath) || basename(outputPath, '.adoc').replace(/[-_]/g, ' ');
        
        content += `include::${relativePath}[]\n\n`;
      }
    }
    
    return content;
  }

  /**
   * Generate simple master document for non-AsciiDoc formats
   */
  private async generateSimpleFileListMaster(
    outputDir: string,
    result: BatchConversionResult,
    format: 'writerside-markdown' | 'zendesk'
  ): Promise<string> {
    const title = format === 'writerside-markdown' ? '# Documentation' : '<h1>Documentation</h1>';
    let content = `${title}\n\n`;
    
    for (const { outputPath } of result.results) {
      const relativePath = relative(outputDir, outputPath);
      const fileName = basename(outputPath);
      
      if (format === 'writerside-markdown') {
        content += `- [${fileName}](${relativePath})\n`;
      } else {
        content += `<a href="${relativePath}">${fileName}</a><br>\n`;
      }
    }
    
    return content;
  }

  /**
   * Group converted files by their directory structure
   */
  private groupConvertedFilesByDirectory(
    results: Array<{ inputPath: string; outputPath: string; result: ConversionResult }>,
    outputDir: string
  ): Map<string, Array<{ inputPath: string; outputPath: string; result: ConversionResult }>> {
    const groups = new Map<string, Array<{ inputPath: string; outputPath: string; result: ConversionResult }>>();
    
    for (const result of results) {
      const relativePath = relative(outputDir, result.outputPath);
      const dirPath = dirname(relativePath);
      
      if (!groups.has(dirPath)) {
        groups.set(dirPath, []);
      }
      groups.get(dirPath)!.push(result);
    }
    
    // Sort directories and files within each directory
    const sortedGroups = new Map();
    for (const [dirPath, files] of Array.from(groups.entries()).sort()) {
      sortedGroups.set(dirPath, files.sort((a, b) => basename(a.outputPath).localeCompare(basename(b.outputPath))));
    }
    
    return sortedGroups;
  }

  /**
   * Generate book-style master document with resolved LinkedTitle and proper structure
   */
  private async generateBookMasterDocument(
    inputDir: string,
    tocStructures: Array<{ path: string; structure: import('../toc-service').TocStructure }>,
    options: BatchConversionOptions
  ): Promise<string> {
    // Use the first (main) TOC structure for book generation
    const mainTOC = tocStructures[0].structure;
    
    // Find Content directory for file resolution
    const contentBasePath = await this.findContentDirectory(inputDir);
    
    // Resolve LinkedTitle entries by reading actual file content
    let resolvedTOC = mainTOC;
    if (options.asciidocOptions?.useLinkedTitleFromTOC) {
      resolvedTOC = await this.tocService.resolveLinkedTitles(mainTOC, contentBasePath);
    }
    
    // Generate master document with book options
    const bookOptions = {
      bookTitle: options.asciidocOptions?.bookTitle || resolvedTOC.title,
      bookAuthor: options.asciidocOptions?.bookAuthor,
      includeTOCLevels: options.asciidocOptions?.includeTOCLevels || 3,
      useBookDoctype: options.asciidocOptions?.useBookDoctype !== false,
      includeChapterBreaks: options.asciidocOptions?.includeChapterBreaks !== false,
      includeVariablesFile: options.variableOptions?.extractVariables === true
    };
    
    const masterDocResult = this.tocService.generateMasterAdoc(resolvedTOC, 'adoc', bookOptions);
    return masterDocResult.content;
  }

  /**
   * Find the Content directory in a MadCap project
   */
  private async findContentDirectory(projectPath: string): Promise<string> {
    // Common locations for Content directory
    const contentCandidates = [
      join(projectPath, 'Content'),
      join(projectPath, 'Project', 'Content'),
      join(projectPath, 'Source', 'Content'),
      projectPath // Fallback to project root
    ];

    for (const candidate of contentCandidates) {
      try {
        const stats = await stat(candidate);
        if (stats.isDirectory()) {
          return candidate;
        }
      } catch (error) {
        continue;
      }
    }

    // If no Content directory found, return project path as fallback
    return projectPath;
  }

  /**
   * Generate a simple master document that lists actual converted files
   */
  private async generateSimpleMasterDocument(
    outputDir: string,
    tocStructures: import('../toc-service').TocStructure[],
    format: 'asciidoc' | 'writerside-markdown' | 'zendesk'
  ): Promise<string> {
    const extension = (format === 'asciidoc') ? '.adoc' : format === 'zendesk' ? '.html' : '.md';
    
    // Find all actually converted files
    const convertedFiles = await this.findConvertedFiles(outputDir, extension);
    
    if (format === 'asciidoc') {
      let content = `= Master Documentation\n`;
      content += `:doctype: book\n`;
      content += `:toc: left\n`;
      content += `:toclevels: 3\n`;
      content += `:sectnums:\n`;
      content += `:sectlinks:\n`;
      content += `:icons: font\n\n`;
      
      content += `This document includes all converted documentation from the MadCap Flare project.\n\n`;
      
      // Group files by their directory structure
      const filesByDir = this.groupFilesByDirectory(convertedFiles, outputDir);
      
      for (const [dirName, files] of filesByDir.entries()) {
        if (dirName) {
          content += `= ${dirName.charAt(0).toUpperCase() + dirName.slice(1)}\n\n`;
        }
        
        for (const file of files) {
          const relativePath = relative(outputDir, file);
          const title = await this.extractTitleFromFile(file) || basename(file, extension).replace(/[-_]/g, ' ');
          
          content += `== ${title}\n\n`;
          content += `include::${relativePath}[]\n\n`;
        }
      }
      
      return content;
    }
    
    // For other formats, return simple list
    return `# Master Documentation\n\nConverted files:\n` + 
           convertedFiles.map(f => `- ${relative(outputDir, f)}`).join('\n');
  }

  private async findConvertedFiles(outputDir: string, extension: string): Promise<string[]> {
    const files: string[] = [];
    
    const searchDir = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir);
        
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          const stats = await stat(fullPath);
          
          if (stats.isDirectory()) {
            await searchDir(fullPath);
          } else if (entry.endsWith(extension) && entry !== `master${extension}`) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    await searchDir(outputDir);
    return files.sort();
  }

  private groupFilesByDirectory(files: string[], outputDir: string): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    
    for (const file of files) {
      const relativePath = relative(outputDir, file);
      const dirName = dirname(relativePath);
      const topLevelDir = dirName.split('/')[0];
      
      if (!groups.has(topLevelDir)) {
        groups.set(topLevelDir, []);
      }
      groups.get(topLevelDir)!.push(file);
    }
    
    return groups;
  }

  private async extractTitleFromFile(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, 'utf8');
      
      // For AsciiDoc files, look for the main title
      const titleMatch = content.match(/^=\s+(.+)$/m);
      if (titleMatch && titleMatch[1]?.trim()) {
        return titleMatch[1].trim();
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update cross-references and image paths for TOC-based conversions
   */
  private async updateTOCBasedReferences(
    outputDir: string,
    conversionPlan: TOCBasedConversionPlan,
    result: BatchConversionResult
  ): Promise<void> {
    // Create mapping from original TOC-based paths to actual output filenames
    const actualFileMapping = this.createActualFileMapping(conversionPlan.fileMapping, result);
    
    for (const { outputPath } of result.results) {
      try {
        const content = await readFile(outputPath, 'utf8');
        let updatedContent = content;
        let hasChanges = false;

        // Update AsciiDoc cross-references: xref:path[text] and link:path[text]
        updatedContent = updatedContent.replace(/(xref|link):([^\[]+)\[([^\]]*)\]/g, (match, linkType, url, text) => {
          const updatedUrl = this.updateActualLinkUrl(url, actualFileMapping, outputPath, outputDir);
          if (updatedUrl !== url) {
            hasChanges = true;
            return `${linkType}:${updatedUrl}[${text}]`;
          }
          return match;
        });

        // Update image paths: image::path[alt] and image:path[alt]
        updatedContent = updatedContent.replace(/(image::?)([^\[]+)\[([^\]]*)\]/g, (match, imageType, imagePath, alt) => {
          const updatedImagePath = this.updateTOCBasedImagePath(imagePath, outputPath, outputDir);
          if (updatedImagePath !== imagePath) {
            hasChanges = true;
            return `${imageType}${updatedImagePath}[${alt}]`;
          }
          return match;
        });

        // Write updated content if changes were made
        if (hasChanges) {
          await writeFile(outputPath, updatedContent, 'utf8');
        }

      } catch (error) {
        // Failed to update TOC-based references in ${outputPath}: ${error}
      }
    }
  }

  /**
   * Create mapping from various filename formats to actual output files
   */
  private createActualFileMapping(
    originalFileMapping: Map<string, string>,
    result: BatchConversionResult
  ): Map<string, string> {
    const actualMapping = new Map<string, string>();
    
    // Create a mapping of original content to actual files
    const originalToActual = new Map<string, string>();
    for (const { inputPath, outputPath } of result.results) {
      originalToActual.set(inputPath, outputPath);
    }
    
    // For each actual converted file, create multiple mapping entries
    for (const { inputPath, outputPath } of result.results) {
      const actualRelativePath = relative(dirname(dirname(outputPath)), outputPath); // Relative from user/ directory
      const actualDir = dirname(actualRelativePath);
      const actualBasename = basename(outputPath, extname(outputPath));
      
      // Find the original file mapping that corresponds to this conversion
      let matchedOriginalPath: string | undefined;
      let matchedTocPath: string | undefined;
      
      for (const [originalPath, tocPath] of originalFileMapping.entries()) {
        if (inputPath.includes(originalPath) || inputPath.endsWith(basename(originalPath))) {
          matchedOriginalPath = originalPath;
          matchedTocPath = tocPath;
          break;
        }
      }
      
      if (matchedOriginalPath && matchedTocPath) {
        const originalBasename = basename(matchedOriginalPath, extname(matchedOriginalPath));
        const tocBasename = basename(matchedTocPath, extname(matchedTocPath));
        
        // Generate all possible malformed reference patterns we've observed
        const malformedPatterns = this.generateMalformedReferencePatterns(
          originalBasename, 
          tocBasename,
          matchedTocPath,
          actualDir
        );
        
        // Map each pattern to the actual file
        for (const pattern of malformedPatterns) {
          actualMapping.set(pattern, actualRelativePath);
        }
      }
      
      // Also add direct filename mapping for simple cases
      const simpleFilename = basename(outputPath);
      actualMapping.set(simpleFilename, actualRelativePath);
    }
    
    return actualMapping;
  }

  /**
   * Generate all known malformed reference patterns for a file
   */
  private generateMalformedReferencePatterns(
    originalBasename: string,
    tocBasename: string, 
    tocPath: string,
    actualDir: string
  ): string[] {
    const patterns: string[] = [];
    
    // Pattern 1: Original TOC-based names
    patterns.push(tocBasename + '.adoc');
    patterns.push(tocPath);
    
    // Pattern 2: Common malformed pattern - basename + 'adoc.adoc'
    patterns.push(tocBasename + 'adoc.adoc');
    patterns.push(originalBasename + 'adoc.adoc');
    
    // Pattern 3: Numbers inserted (common corruption pattern)
    // e.g., 03-1-analyzeactivity → 03-120analyzeactivityadoc.adoc
    const numberedVariations = [];
    
    // For patterns like 03-1-something, insert numbers after the second dash
    if (tocBasename.match(/^\d+-\d+-/)) {
      const basePattern = tocBasename.replace(/^(\d+-\d+)-(.+)$/, '$1$2'); // Remove middle dash
      numberedVariations.push(
        basePattern.replace(/^(\d+-\d+)(.+)$/, '$10$2adoc.adoc'),
        basePattern.replace(/^(\d+-\d+)(.+)$/, '$120$2adoc.adoc'),
        basePattern.replace(/^(\d+-\d+)(.+)$/, '$1220$2adoc.adoc'),
        basePattern.replace(/^(\d+-\d+)(.+)$/, '$1320$2adoc.adoc')
      );
    }
    
    // Also try the original replacement approach for other patterns
    numberedVariations.push(
      tocBasename.replace(/-/, '-1') + 'adoc.adoc',
      tocBasename.replace(/-/, '-12') + 'adoc.adoc', 
      tocBasename.replace(/-/, '-120') + 'adoc.adoc',
      tocBasename.replace(/-/, '-2') + 'adoc.adoc',
      tocBasename.replace(/-/, '-20') + 'adoc.adoc',
      tocBasename.replace(/-/, '-220') + 'adoc.adoc',
      tocBasename.replace(/-/, '-3') + 'adoc.adoc',
      tocBasename.replace(/-/, '-30') + 'adoc.adoc',
      tocBasename.replace(/-/, '-320') + 'adoc.adoc'
    );
    patterns.push(...numberedVariations);
    
    // Pattern 4: Path-based references that are wrong
    patterns.push(`../../a6-00-other/configure-estimated-costs-options.adoc`); // Common wrong mapping
    patterns.push(`user/${actualDir}/${tocBasename}.adoc`);
    
    // Pattern 5: Various combinations
    patterns.push(originalBasename + '.adoc');
    patterns.push(originalBasename.toLowerCase() + '.adoc');
    patterns.push(originalBasename.replace(/\s+/g, '') + '.adoc');
    
    return patterns;
  }

  /**
   * Update link URL using actual file mapping
   */
  private updateActualLinkUrl(
    url: string,
    actualFileMapping: Map<string, string>,
    currentOutputPath: string,
    outputDir: string
  ): string {
    // Skip external URLs, anchors, and mailto links
    if (url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('#')) {
      return url;
    }

    // Split URL and anchor
    const [path, anchor] = url.split('#');
    
    // Check if we have a direct mapping for this path
    if (actualFileMapping.has(path)) {
      const actualPath = actualFileMapping.get(path)!;
      return this.calculateRelativePath(currentOutputPath, actualPath, outputDir, anchor);
    }
    
    // Try fuzzy matching for patterns we might have missed
    const bestMatch = this.findBestPathMatch(path, actualFileMapping);
    if (bestMatch) {
      return this.calculateRelativePath(currentOutputPath, bestMatch, outputDir, anchor);
    }

    // No mapping found, return original
    return url;
  }

  /**
   * Calculate proper relative path between files
   */
  private calculateRelativePath(
    currentOutputPath: string, 
    targetPath: string, 
    outputDir: string, 
    anchor?: string
  ): string {
    const currentDir = dirname(currentOutputPath);
    const fullTargetPath = join(outputDir, targetPath);
    let relativePath = relative(currentDir, fullTargetPath);
    
    // For same-directory references, use just the filename
    if (dirname(currentOutputPath) === dirname(fullTargetPath)) {
      relativePath = basename(fullTargetPath);
    }
    
    return anchor ? `${relativePath}#${anchor}` : relativePath;
  }

  /**
   * Find the best matching path using fuzzy matching
   */
  private findBestPathMatch(
    searchPath: string, 
    actualFileMapping: Map<string, string>
  ): string | null {
    let bestMatch: string | null = null;
    let bestScore = 0;
    
    for (const [mappedPath, actualPath] of actualFileMapping.entries()) {
      const score = this.calculatePathSimilarity(searchPath, mappedPath);
      if (score > bestScore && score > 0.5) { // Minimum similarity threshold
        bestScore = score;
        bestMatch = actualPath;
      }
    }
    
    return bestMatch;
  }

  /**
   * Calculate similarity score between two paths (0-1)
   */
  private calculatePathSimilarity(path1: string, path2: string): number {
    // Normalize paths for comparison
    const normalize = (p: string) => p.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm1 = normalize(path1);
    const norm2 = normalize(path2);
    
    // Exact match
    if (norm1 === norm2) return 1.0;
    
    // Substring match
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;
    
    // Levenshtein distance-based similarity
    const maxLen = Math.max(norm1.length, norm2.length);
    if (maxLen === 0) return 1.0;
    
    const distance = this.levenshteinDistance(norm1, norm2);
    return Math.max(0, (maxLen - distance) / maxLen);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Update link URL for TOC-based structure
   */
  private updateTOCBasedLinkUrl(
    url: string, 
    fileMapping: Map<string, string>, 
    currentOutputPath: string, 
    outputDir: string
  ): string {
    // Skip external URLs, anchors, and mailto links
    if (url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('#')) {
      return url;
    }

    // Split URL and anchor
    const [path, anchor] = url.split('#');
    
    // For TOC-based conversions, we need to find the target file in the mapping
    // First, try to find a direct match in the file mapping
    for (const [originalPath, targetPath] of fileMapping.entries()) {
      // Check various forms of the original path
      const pathVariations = [
        originalPath,
        originalPath.replace(/\.htm$/i, '.adoc'),
        basename(originalPath, extname(originalPath)) + '.adoc',
        basename(originalPath, extname(originalPath))
      ];
      
      const urlVariations = [
        path,
        path.replace(/\.adoc$/i, ''),
        path.replace(/\.adoc$/i, '.htm'),
        basename(path, extname(path))
      ];
      
      for (const pathVar of pathVariations) {
        for (const urlVar of urlVariations) {
          if (pathVar.includes(urlVar) || urlVar.includes(pathVar)) {
            // Calculate relative path from current file to target file
            const currentDir = dirname(currentOutputPath);
            const relativePath = relative(currentDir, join(outputDir, targetPath));
            return anchor ? `${relativePath}#${anchor}` : relativePath;
          }
        }
      }
    }

    // If no mapping found, return original URL
    return url;
  }

  /**
   * Update image path for TOC-based structure
   */
  private updateTOCBasedImagePath(
    imagePath: string, 
    currentOutputPath: string, 
    outputDir: string
  ): string {
    // Skip data URLs and external URLs
    if (imagePath.startsWith('data:') || imagePath.startsWith('http')) {
      return imagePath;
    }

    // Handle relative paths that go up directories (../Images/)
    if (imagePath.startsWith('../')) {
      // If the path already looks reasonable (1 level up to Images), keep it as-is
      const upwardCount = (imagePath.match(/\.\.\//g) || []).length;
      if (upwardCount === 1 && imagePath.includes('Images/')) {
        return imagePath; // Path already looks correct for TOC structure
      }
      
      // For paths that need fixing (too many ../ levels), simplify to standard relative path
      if (upwardCount > 1) {
        const cleanImagePath = imagePath.replace(/^(\.\.\/)+/, ''); // Remove all leading ../
        
        // For TOC-based conversions, most files are one level deep (user/subfolder/)
        // So ../Images/ is the correct path from subdirectories to the Images folder
        if (cleanImagePath.startsWith('Images/')) {
          return `../${cleanImagePath}`;
        }
      }
    }
    
    // Handle absolute user/ prefixed paths (convert to relative)
    if (imagePath.startsWith('user/Images/')) {
      const cleanImagePath = imagePath.replace(/^user\//, '');
      return `../${cleanImagePath}`;
    }

    // Return original path if no better option found
    return imagePath;
  }

  /**
   * Fix relative paths in included files for master document context
   */
  private async fixIncludedFilePathsForMasterDoc(
    outputDir: string,
    result: BatchConversionResult
  ): Promise<void> {
    // Fix paths in all converted files that will be included in the master document
    for (const { outputPath } of result.results) {
      try {
        const content = await readFile(outputPath, 'utf8');
        let updatedContent = content;
        let hasChanges = false;

        // Calculate the depth of this file relative to the output directory
        const relativePath = relative(outputDir, outputPath);
        const depth = relativePath.split('/').length - 1; // Number of subdirectories deep
        
        // Remove HTML comments that shouldn't appear in AsciiDoc (always remove these)
        updatedContent = updatedContent.replace(/<!--\s*BOUNDARY\s*-->/gi, '');
        
        // Remove other HTML comments that might be conversion artifacts  
        updatedContent = updatedContent.replace(/<!--[^>]*-->/g, '');
        
        // Clean up excessive line breaks that might result from comment removal
        const originalContent = updatedContent;
        updatedContent = updatedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        if (originalContent !== updatedContent) {
          hasChanges = true;
        }
        
        // ONLY adjust paths for master document context if file is in subdirectories
        // BUT preserve the standard TOC-based relative paths for standalone usage
        if (depth > 0) {
          // Fix paths ONLY in files that have user/ prefix in their images (indicating incorrect conversion)
          // Convert user/Images/ back to ../Images/ for proper relative path resolution
          updatedContent = updatedContent.replace(/(image::?)user\/(Images\/[^[\]]+)/g, (match, imageType, imagePath) => {
            const correctedPath = `../${imagePath}`;
            hasChanges = true;
            return `${imageType}${correctedPath}`;
          });

          // Fix image paths that use ../Images/ format to work from subdirectories
          // For files in subdirectories, we need to add additional ../ for each level
          const additionalPrefix = '../'.repeat(depth - 1);
          updatedContent = updatedContent.replace(/(image::?)\.\.\/(Images\/[^[\]]+)/g, (match, imageType, imagePath) => {
            const correctedPath = `../${additionalPrefix}${imagePath}`;
            hasChanges = true;
            return `${imageType}${correctedPath}`;
          });

          // Adjust cross-references: fix user/ prefix back to proper relative paths
          updatedContent = updatedContent.replace(/(xref|link):user\/(.*?)(\[.*?\])/g, (match, linkType, linkPath, linkText) => {
            // Replace user/ with ../ prefix for proper relative path resolution
            const correctedPath = `../${linkPath}`;
            hasChanges = true;
            return `${linkType}:${correctedPath}${linkText}`;
          });
        }

        // Write updated content if changes were made
        if (hasChanges) {
          await writeFile(outputPath, updatedContent, 'utf8');
        }

      } catch (error) {
        // Failed to fix included file paths in ${outputPath}: ${error}
      }
    }
  }

  /**
   * Regular folder conversion (non-TOC based)
   */
  private async convertFolderRegular(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions,
    result: BatchConversionResult
  ): Promise<BatchConversionResult> {
    console.log(`📁 [BatchService Regular] Starting regular folder conversion from ${inputDir} to ${outputDir}`);
    console.log(`📁 [BatchService Regular] Has onProgress callback:`, !!options.onProgress);
    
    // Report discovery phase
    if (options.onProgress) {
      console.log(`📁 [BatchService Regular] Sending discovery progress event`);
      options.onProgress({
        currentFile: '',
        currentFileIndex: 0,
        totalFiles: 0,
        percentage: 0,
        status: 'discovering',
        message: 'Discovering files...'
      });
    }

    const files = await this.findDocumentFiles(inputDir, options);
    result.totalFiles = files.length;

    // Report discovery complete
    if (options.onProgress) {
      options.onProgress({
        currentFile: '',
        currentFileIndex: 0,
        totalFiles: files.length,
        percentage: 0,
        status: 'converting',
        message: `Found ${files.length} files to convert`
      });
    }

    // Track if stylesheet has been written for this batch
    let stylesheetWritten = false;
    let variablesFileWritten = false;
    let imageDirectoriesCopied = false;
    
    // Create a shared variable extractor for batch processing
    console.log(`🔍 [BatchService Regular] Variable extraction setup:`, {
      extractVariables: options.variableOptions?.extractVariables,
      variableOptions: options.variableOptions,
      inputDir
    });
    
    const { VariableExtractor } = await import('./variable-extractor');
    const batchVariableExtractor = options.variableOptions?.extractVariables 
      ? new VariableExtractor()
      : null;
    
    console.log(`🔍 [BatchService Regular] VariableExtractor created:`, {
      hasExtractor: !!batchVariableExtractor,
      extractVariables: options.variableOptions?.extractVariables
    });
    
    // Extract all variables from .flvar files in the Flare project
    if (batchVariableExtractor) {
      // Use inputDir as project root since uploaded files contain the full project structure
      const projectRoot = inputDir;
      console.log(`🔍 [BREADCRUMB] Variable extraction ENTRY POINT - extracting from project root: ${projectRoot}`);
      console.log(`🔍 [BREADCRUMB] About to call batchVariableExtractor.extractAllVariablesFromProject()`);
      try {
        await batchVariableExtractor.extractAllVariablesFromProject(projectRoot);
        const extractedVariablesCount = batchVariableExtractor.getVariables().length;
        console.log(`🔍 [BREADCRUMB] Variable extraction COMPLETED - found ${extractedVariablesCount} variables`);
        if (extractedVariablesCount > 0) {
          const variables = batchVariableExtractor.getVariables();
          console.log(`🔍 [BREADCRUMB] First few variables found:`, variables.slice(0, 3).map(v => `${v.name}=${v.value}`));
        }
      } catch (error) {
        console.error(`🔍 [BREADCRUMB] Variable extraction FAILED:`, error);
      }
    } else {
      console.log(`🔍 [BREADCRUMB] Variable extraction SKIPPED - no extractor created`);
    }

    // Process files in batches to prevent memory exhaustion
    const BATCH_SIZE = 10; // Process 10 files at a time
    
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      
      for (let j = 0; j < batch.length; j++) {
        const inputPath = batch[j];
        const fileIndex = i + j;
        
        // Report progress for current file
        if (options.onProgress) {
          const percentage = Math.round((fileIndex / files.length) * 100);
          console.log(`📁 [BatchService Regular] Sending progress: ${fileIndex + 1}/${files.length} (${percentage}%) - ${basename(inputPath)}`);
          options.onProgress({
            currentFile: basename(inputPath),
            currentFileIndex: fileIndex + 1,
            totalFiles: files.length,
            percentage,
            status: 'converting',
            message: `Converting ${basename(inputPath)}...`
          });
        }
        
        // Skip .flsnp files - they should only be processed inline during MadCap conversion
        if (inputPath.toLowerCase().endsWith('.flsnp')) {
          console.log(`⏭️ Skipping snippet file (will be processed inline): ${inputPath}`);
          continue;
        }
        
        // Declare variables at function scope so they're available in catch block and image copying
        let conversionResult: any;
        let outputPath: string = inputPath; // Default path in case of early errors
        
        try {
          // Check if file contains binary/multimedia content
          const binaryCheck = await this.isBinaryOrMultimediaFile(inputPath);
          if (binaryCheck.isBinary) {
            const reason = binaryCheck.reason || 'Binary/multimedia content detected';
            console.log(`⚠️ [Regular] Skipping binary/multimedia file: ${inputPath} - ${reason}`);
            result.skippedFiles++;
            result.skippedFilesList.push({ file: inputPath, reason });
            continue;
          }
          
          // Check if file should be skipped due to MadCap conditions (applies to all formats)
          const content = await readFile(inputPath, 'utf8');
          if (this.containsMadCapContent(content)) {
            // Use appropriate converter's skip check based on format
            const shouldSkip = options.format === 'zendesk' 
              ? ZendeskConverter.shouldSkipFile(content, options as ConversionOptions)
              : MadCapConverter.shouldSkipFile(content, options as ConversionOptions);
              
            if (shouldSkip) {
              const reason = `MadCap conditions indicate content should be skipped`;
              // SKIPPED: ${inputPath} - ${reason}
              result.skippedFiles++;
              result.skippedFilesList.push({ file: inputPath, reason });
              continue;
            }
          }

        const relativePath = relative(inputDir, inputPath);
        outputPath = await this.generateOutputPath(relativePath, outputDir, options.format || 'markdown', inputPath, options.renameFiles);
        
        // Track filename mapping for cross-reference updates
        if (options.renameFiles && result.filenameMapping) {
          const originalRelativePath = relativePath;
          const newRelativePath = relative(outputDir, outputPath);
          result.filenameMapping.set(originalRelativePath, newRelativePath);
        }
        
        if (options.preserveStructure) {
          await this.ensureDirectoryExists(dirname(outputPath));
        }

        // Calculate variables file path for include directives
        let calculatedVariablesPath: string | undefined;
        if (options.variableOptions?.extractVariables) {
          if (options.variableOptions.variablesOutputPath) {
            calculatedVariablesPath = options.variableOptions.variablesOutputPath;
          } else if (options.format === 'writerside-markdown' && options.variableOptions.variableFormat === 'writerside') {
            calculatedVariablesPath = join(outputDir, 'v.list');
          } else {
            calculatedVariablesPath = join(outputDir, 'includes', 'variables.adoc');
          }
        }

        // Calculate path depth for correct image path resolution
        const relativeFilePath = relative(inputDir, inputPath);
        const pathDepth = dirname(relativeFilePath).split(sep).filter(part => part && part !== '.').length;
        console.log(`[Batch Debug 2] Input: ${inputPath}`);
        console.log(`[Batch Debug 2] InputDir: ${inputDir}`);
        console.log(`[Batch Debug 2] Relative: ${relativeFilePath}`);
        console.log(`[Batch Debug 2] Dirname: ${dirname(relativeFilePath)}`);
        console.log(`[Batch Debug 2] Split: ${dirname(relativeFilePath).split(sep)}`);
        console.log(`[Batch Debug 2] Calculated path depth: ${pathDepth}`);

        const conversionOptions: ConversionOptions = {
          format: options.format || 'asciidoc',
          inputPath: inputPath,
          outputPath: outputPath, // Use absolute path for proper relative calculation
          inputType: this.determineInputType(extname(inputPath).toLowerCase().slice(1)),
          preserveFormatting: options.preserveFormatting ?? true,
          extractImages: options.extractImages ?? true,
          outputDir: dirname(outputPath),
          rewriteLinks: true,  // Enable link rewriting for batch conversions
          pathDepth, // Pass path depth for image path resolution
          projectRootPath: inputDir, // Pass the temp project root for snippet resolution
          variableOptions: options.variableOptions ? {
            ...options.variableOptions,
            variablesOutputPath: calculatedVariablesPath, // Include calculated variables path
            skipFileGeneration: false // FIXED: Allow variables to be injected into individual files
          } : undefined,
          asciidocOptions: options.asciidocOptions, // FIX: Pass glossary options to individual conversions
          zendeskOptions: options.zendeskOptions
        };

        // LOG: Verify options are being passed correctly (Regular conversion)
        console.log(`🔧 [BatchService Regular] About to convert: ${basename(inputPath)}`);
        console.log(`🔧 [BatchService Regular] Conversion options being passed:`, JSON.stringify({
          format: conversionOptions.format,
          hasAsciidocOptions: !!conversionOptions.asciidocOptions,
          includeGlossary: conversionOptions.asciidocOptions?.glossaryOptions?.includeGlossary,
          glossaryFormat: conversionOptions.asciidocOptions?.glossaryOptions?.glossaryFormat,
          extractVariables: conversionOptions.variableOptions?.extractVariables,
          variableFormat: conversionOptions.variableOptions?.variableFormat
        }, null, 2));

        // Add timeout with heartbeat to prevent individual files from stalling entire batch
        const FILE_CONVERSION_TIMEOUT = 30000; // 30 seconds per file
        const HEARTBEAT_INTERVAL = 5000; // Send heartbeat every 5 seconds
        
        let heartbeatTimer: NodeJS.Timeout | null = null;
        
        try {
          // Start heartbeat to keep progress connection alive during long file conversions
          if (options.onProgress) {
            heartbeatTimer = setInterval(() => {
              options.onProgress!({
                currentFile: basename(inputPath),
                currentFileIndex: fileIndex + 1,
                totalFiles: files.length,
                percentage: Math.round((fileIndex / files.length) * 100),
                status: 'converting',
                message: `Processing ${basename(inputPath)}... (${Math.floor((Date.now() % 60000) / 1000)}s)`,
                phase: 'file_processing'
              });
            }, HEARTBEAT_INTERVAL);
          }
          
          conversionResult = await Promise.race([
            this.documentService.convertFile(
              inputPath,
              outputPath,
              conversionOptions
            ),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`File conversion timeout after ${FILE_CONVERSION_TIMEOUT/1000}s`)), FILE_CONVERSION_TIMEOUT)
            )
          ]);
        } finally {
          // Always clear heartbeat timer
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
          }
        }

        // Handle external stylesheet generation for batch conversions (write only once per batch)
        if (conversionResult.stylesheet && options.format === 'zendesk' && options.zendeskOptions?.generateStylesheet && !stylesheetWritten) {
          await this.writeStylesheet(conversionResult.stylesheet, outputDir, options.zendeskOptions.cssOutputPath);
          stylesheetWritten = true;
        }

        // Collect variables from this file if extraction is enabled
        if (batchVariableExtractor && conversionResult.metadata?.variables) {
          for (const variable of conversionResult.metadata.variables) {
            batchVariableExtractor.addVariable(variable);
          }
        }

        result.results.push({
          inputPath,
          outputPath,
          result: conversionResult
        });

        result.convertedFiles++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Regular Batch] File conversion failed: ${inputPath}`, {
          error: errorMessage,
          outputPath,
          fileIndex: fileIndex + 1,
          totalFiles: files.length,
          batchIndex: i,
          batchPosition: j
        });
        
        result.errors.push({
          file: inputPath,
          error: `[File ${fileIndex + 1}/${files.length}] ${errorMessage}`
        });
        
        // Create a dummy conversionResult for failed files so image copying still works
        conversionResult = { metadata: { images: [] } };
      }

      // Handle image copying OUTSIDE try/catch so it always runs
      // This ensures image directories are copied even if some individual files fail
      console.log(`🔍 [BREADCRUMB] Image copying ENTRY POINT for file: ${inputPath}`);
      console.log(`🔍 [BREADCRUMB] About to call handleImageCopying - copyImages=${options.copyImages}, format=${options.format}`);
      try {
        imageDirectoriesCopied = await this.handleImageCopying(
          inputDir,
          outputDir,
          options,
          imageDirectoriesCopied,
          conversionResult,
          inputPath,
          outputPath
        );
        console.log(`🔍 [BREADCRUMB] Image copying COMPLETED, imageDirectoriesCopied=${imageDirectoriesCopied}`);
      } catch (imageCopyError) {
        console.error(`🔍 [BREADCRUMB] Image copying FAILED for ${inputPath}:`, imageCopyError);
        // Don't let image copying errors stop the entire process
      }
    }
    
    // Force garbage collection after each batch to prevent memory buildup
    if (global.gc) {
      global.gc();
    }
    
    // Small delay to prevent overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 10));
  }

    result.skippedFiles = result.totalFiles - result.convertedFiles - result.errors.length;
    
    // Log summary
    // CONVERSION SUMMARY:
    // Total files found: ${result.totalFiles}
    // Successfully converted: ${result.convertedFiles}
    // Skipped: ${result.skippedFiles}
    // Errors: ${result.errors.length}
    
    if (result.skippedFilesList.length > 0) {
      // SKIPPED FILES:
      result.skippedFilesList.forEach(({ file, reason }) => {
        // ${file} - ${reason}
      });
    }
    
    if (result.errors.length > 0) {
      // ERROR FILES:
      result.errors.forEach(({ file, error }) => {
        // ${file} - ${error}
      });
    }
    
    // Write combined variables file at the end if extraction is enabled
    console.log(`🔍 [BatchService Regular END] Variables file generation check:`, {
      hasBatchVariableExtractor: !!batchVariableExtractor,
      extractVariables: options.variableOptions?.extractVariables,
      variablesFileWritten,
      shouldWriteVariables: !!(batchVariableExtractor && options.variableOptions?.extractVariables && !variablesFileWritten),
      format: options.format
    });
    
    if (batchVariableExtractor && options.variableOptions?.extractVariables && !variablesFileWritten) {
      console.log(`🔍 [BatchService Regular END] Generating variables file from extractor...`);
      
      // Add required variableFormat based on conversion format
      const variableExtractionOptions = {
        ...options.variableOptions,
        variableFormat: options.format === 'asciidoc' ? 'adoc' as const : 'writerside' as const
      };
      
      const variablesFile = batchVariableExtractor.generateVariablesFile(variableExtractionOptions);
      
      console.log(`🔍 [BatchService Regular END] Variables file generated:`, {
        hasVariablesFile: !!variablesFile,
        variablesFileLength: variablesFile?.length || 0
      });
      
      if (variablesFile) {
        let variablesPath: string;
        
        if (options.variableOptions.variablesOutputPath) {
          // Use custom path if provided
          variablesPath = options.variableOptions.variablesOutputPath;
        } else if (options.format === 'writerside-markdown' && options.variableOptions.variableFormat === 'writerside') {
          // For Writerside format, save to v.list in project root
          variablesPath = join(outputDir, 'v.list');
        } else {
          // For AsciiDoc and other formats, save to includes directory
          const includesDir = join(outputDir, 'includes');
          await this.ensureDirectoryExists(includesDir);
          variablesPath = join(includesDir, 'variables.adoc');
          console.log(`📄 [BatchService] Using AsciiDoc variables path: ${variablesPath}`);
        }
        
        // Ensure directory exists for the variables file
        console.log(`📁 [BatchService] Creating directory: ${dirname(variablesPath)}`);
        await this.ensureDirectoryExists(dirname(variablesPath));
        
        console.log(`📄 [BatchService] Writing variables file: ${variablesPath} (${variablesFile.length} chars)`);
        await writeFile(variablesPath, variablesFile, 'utf8');
        console.log(`✅ [BatchService] Generated combined variables file at ${variablesPath}`);
      }
    }
    
    // Process glossary files if requested (only for AsciiDoc format)
    // Check both nested (asciidocOptions.glossaryOptions) and top-level (glossaryOptions) structures
    const shouldProcessGlossary = options.format === 'asciidoc' && (
      options.asciidocOptions?.glossaryOptions?.includeGlossary || 
      (options as any).glossaryOptions?.includeGlossary
    );
    
    console.log(`🔍 [BatchService] Glossary processing check:`, {
      format: options.format,
      nestedGlossaryOptions: !!options.asciidocOptions?.glossaryOptions?.includeGlossary,
      topLevelGlossaryOptions: !!(options as any).glossaryOptions?.includeGlossary,
      shouldProcessGlossary
    });
    
    if (shouldProcessGlossary) {
      console.log(`🔍 [BREADCRUMB] Glossary processing ENTRY POINT`);
      console.log(`🔍 [BREADCRUMB] About to call this.processGlossaryFiles()`);
      await this.processGlossaryFiles(inputDir, outputDir, options, result);
      console.log(`🔍 [BREADCRUMB] Glossary processing COMPLETED`);
    } else {
      console.log(`🔍 [BREADCRUMB] Glossary processing SKIPPED - format: ${options.format}`);
    }
    
    // Update cross-references if files were renamed
    if (options.renameFiles && result.filenameMapping && result.filenameMapping.size > 0) {
      await this.updateCrossReferences(result, outputDir, options.format || 'markdown');
    }
    
    // Report completion
    if (options.onProgress) {
      options.onProgress({
        currentFile: '',
        currentFileIndex: result.totalFiles,
        totalFiles: result.totalFiles,
        percentage: 100,
        status: 'completed',
        message: `Conversion complete: ${result.convertedFiles} converted, ${result.skippedFiles} skipped`
      });
    }
    
    // Generate quality summary for batch
    result.qualitySummary = this.generateQualitySummary(result);
    
    if (result.qualitySummary) {
      console.log(`📊 [BatchService] Quality summary: Average score ${result.qualitySummary.averageScore.toFixed(1)}/100, ${result.qualitySummary.totalIssues} total issues`);
      if (result.qualitySummary.lowQualityFiles.length > 0) {
        console.log(`⚠️ [BatchService] Low quality files (score < 70):`);
        result.qualitySummary.lowQualityFiles.forEach(file => {
          console.log(`   - ${basename(file.file)}: ${file.score}/100 (${file.issues} issues)`);
        });
      }
    }
    
    return result;
  }

  /**
   * Find the MadCap project root from a content directory path
   */
  private findProjectRoot(inputDir: string): string {
    console.log(`🔍 [findProjectRoot] Searching for project root from: ${inputDir}`);
    console.log(`🔍 [findProjectRoot] Input path breakdown:`, {
      fullPath: inputDir,
      pathSegments: inputDir.split('/'),
      isWindows: inputDir.includes('\\'),
      containsContent: inputDir.includes('Content'),
      containsOutput: inputDir.includes('Output') || inputDir.includes('Temporary')
    });
    
    // Strategy 1: If path contains "Content", go up one level
    const pathParts = inputDir.split('/');
    const contentIndex = pathParts.findIndex(part => part === 'Content');
    
    if (contentIndex > 0) {
      const projectRoot = pathParts.slice(0, contentIndex).join('/');
      console.log(`📁 [findProjectRoot] Strategy 1 - Found Content at index ${contentIndex}, project root: ${projectRoot}`);
      return projectRoot;
    }
    
    // Strategy 2: Check if current directory has MadCap project structure
    try {
      const { readdirSync, statSync } = require('fs');
      const { join } = require('path');
      
      // Check if we have typical MadCap project directories
      const entries = readdirSync(inputDir);
      console.log(`📁 [findProjectRoot] Strategy 2 - Directory contents: ${entries.join(', ')}`);
      
      const hasMadCapStructure = entries.some((entry: string) => 
        ['Content', 'Project', 'Resources'].includes(entry)
      );
      
      if (hasMadCapStructure) {
        console.log(`📁 [findProjectRoot] Strategy 2 - Found MadCap structure in current directory: ${inputDir}`);
        return inputDir;
      }
      
      // Strategy 3: Look for MadCap structure in subdirectories
      for (const entry of entries) {
        const fullPath = join(inputDir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            const subEntries = readdirSync(fullPath);
            const hasSubMadCapStructure = subEntries.some((subEntry: string) => 
              ['Content', 'Project', 'Resources'].includes(subEntry)
            );
            
            if (hasSubMadCapStructure) {
              console.log(`📁 [findProjectRoot] Strategy 3 - Found MadCap structure in subdirectory: ${fullPath}`);
              return fullPath;
            }
          }
        } catch (err) {
          // Skip entries we can't read
        }
      }
      
    } catch (error) {
      console.warn(`⚠️ [findProjectRoot] Error reading directory structure: ${error}`);
    }
    
    // Strategy 4: Fallback to original input directory
    console.log(`📁 [findProjectRoot] Strategy 4 - Using fallback: ${inputDir}`);
    return inputDir;
  }

  /**
   * Process glossary files and generate glossary document
   */
  private async processGlossaryFiles(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions,
    result: BatchConversionResult
  ): Promise<void> {
    console.log(`🔍 [BREADCRUMB] processGlossaryFiles() ENTRY POINT`);
    console.log(`📚 [Glossary] Starting glossary processing...`);
    console.log(`📚 [Glossary] Input directory: ${inputDir}`);
    console.log(`📚 [Glossary] Output directory: ${outputDir}`);
    
    try {
      const { FlgloParser } = await import('./flglo-parser');
      const { GlossaryConverter } = await import('../converters/glossary-converter');
      
      // Get condition filters from options
      const conditionFilters = options.asciidocOptions?.glossaryOptions?.filterConditions || 
                              (options as any).glossaryOptions?.filterConditions ||
                              options.excludeConditions || 
                              [];
      
      console.log(`📚 [Glossary] Using condition filters:`, conditionFilters);
      
      const glossaryParser = new FlgloParser(conditionFilters);
      const glossaryConverter = new GlossaryConverter();
      
      // Derive project root from input directory (e.g., when inputDir is Content/)
      const projectRoot = this.findProjectRoot(inputDir);
      console.log(`📚 [Glossary] Project root: ${projectRoot}`);
      
      // Discover glossary files (.flglo) in the project
      let glossaryFiles: string[] = [];
      
      // Check both nested and top-level glossary options
      const glossaryPath = options.asciidocOptions?.glossaryOptions?.glossaryPath || 
                           (options as any).glossaryOptions?.glossaryPath;
      
      console.log(`📚 [Glossary] Checking for glossary path:`, {
        nestedPath: options.asciidocOptions?.glossaryOptions?.glossaryPath,
        topLevelPath: (options as any).glossaryOptions?.glossaryPath,
        glossaryPath
      });
      
      // Check if a specific glossary file path was provided
      if (glossaryPath) {
        const specifiedPath = join(projectRoot, glossaryPath);
        try {
          await stat(specifiedPath);
          glossaryFiles = [specifiedPath];
          console.error(`Using specified glossary file: ${specifiedPath}`);
        } catch (error) {
          console.warn(`Specified glossary file not found: ${specifiedPath}`);
        }
      }
      
      // If no specific file or file not found, auto-discover
      if (glossaryFiles.length === 0) {
        console.log(`🔍 [Glossary] Auto-discovering glossary files from project root: ${projectRoot}`);
        glossaryFiles = await glossaryParser.findGlossaryFiles(projectRoot);
        console.log(`📚 [Glossary] Auto-discovered ${glossaryFiles.length} glossary file(s): ${glossaryFiles.join(', ')}`);
      }
      
      if (glossaryFiles.length === 0) {
        console.log(`⚠️ [Glossary] No glossary files found in project`);
        // Let's also check what directories exist
        const { readdir } = await import('fs/promises');
        try {
          const rootContents = await readdir(projectRoot);
          console.log(`📁 [Glossary] Project root contents: ${rootContents.join(', ')}`);
          
          // Check if Project directory exists
          const projectDir = join(projectRoot, 'Project');
          try {
            const projectContents = await readdir(projectDir);
            console.log(`📁 [Glossary] Project directory contents: ${projectContents.join(', ')}`);
            
            // Check if Glossaries directory exists
            const glossariesDir = join(projectDir, 'Glossaries');
            try {
              const glossariesContents = await readdir(glossariesDir);
              console.log(`📁 [Glossary] Glossaries directory contents: ${glossariesContents.join(', ')}`);
            } catch (error) {
              console.log(`📁 [Glossary] No Glossaries directory found at: ${glossariesDir}`);
            }
          } catch (error) {
            console.log(`📁 [Glossary] No Project directory found at: ${projectDir}`);
          }
        } catch (error) {
          console.log(`📁 [Glossary] Unable to read project root directory: ${projectRoot}`);
        }
        
        // FALLBACK: Search through actual uploaded files for .flglo files
        console.log(`🔍 [Glossary FALLBACK] Auto-discovery failed, searching uploaded files directly for .flglo files in inputDir: ${inputDir}`);
        try {
          const allFiles = await this.findAllFilesRecursive(inputDir, ['.flglo']);
          console.log(`📚 [Glossary FALLBACK] Found ${allFiles.length} .flglo files in upload:`, allFiles);
          
          if (allFiles.length > 0) {
            glossaryFiles = allFiles;
            console.log(`✅ [Glossary FALLBACK] Using ${glossaryFiles.length} glossary files from upload fallback`);
          } else {
            console.log(`❌ [Glossary FALLBACK] No .flglo files found in uploaded files either`);
          }
        } catch (error) {
          console.error(`❌ [Glossary FALLBACK] Error searching uploaded files:`, error);
        }
        
        if (glossaryFiles.length === 0) {
          console.log(`❌ [Glossary] No glossary files found after all searches - generating empty glossary`);
          return;
        }
      }
      
      // Parse all glossary files and combine entries
      const allEntries: import('./flglo-parser').GlossaryEntry[] = [];
      
      for (const glossaryFile of glossaryFiles) {
        try {
          console.log(`📚 [Glossary] Processing glossary file: ${glossaryFile}`);
          const parsed = await glossaryParser.parseGlossaryFile(glossaryFile);
          
          // Apply condition filtering if enabled (default is true)
          if (options.asciidocOptions?.glossaryOptions?.filterConditions !== false) {
            allEntries.push(...parsed.entries);
          } else {
            // Include all entries without filtering
            const allParsed = await glossaryParser.parseGlossaryFile(glossaryFile);
            allEntries.push(...allParsed.entries);
          }
          
          console.error(`Parsed ${parsed.entries.length} entries from ${basename(glossaryFile)}`);
        } catch (error) {
          console.error(`Error parsing glossary file ${glossaryFile}:`, error);
          result.errors.push({
            file: glossaryFile,
            error: `Failed to parse glossary: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }
      
      console.log(`📚 [Glossary] Total entries collected: ${allEntries.length}`);
      
      if (allEntries.length === 0) {
        console.log('⚠️ [Glossary] No glossary entries found - will generate empty glossary file with headers');
        // Continue with file generation to create proper empty glossary
      }
      
      // Convert glossary entries to AsciiDoc format
      const glossaryOptions: import('../converters/glossary-converter').GlossaryConversionOptions = {
        format: options.asciidocOptions?.glossaryOptions?.glossaryFormat || 'separate',
        generateAnchors: options.asciidocOptions?.glossaryOptions?.generateAnchors ?? true,
        includeIndex: options.asciidocOptions?.glossaryOptions?.includeIndex ?? true,
        title: options.asciidocOptions?.glossaryOptions?.glossaryTitle || 'Glossary',
        levelOffset: 0
      };
      
      const glossaryContent = glossaryConverter.convertToAsciiDoc(allEntries, glossaryOptions);
      
      // Determine output path for glossary
      let glossaryOutputPath: string;
      
      if (glossaryOptions.format === 'separate') {
        // Save as separate glossary file
        glossaryOutputPath = join(outputDir, 'glossary.adoc');
      } else if (glossaryOptions.format === 'book-appendix') {
        // Save in appendices folder for book structure
        const appendicesDir = join(outputDir, 'appendices');
        await this.ensureDirectoryExists(appendicesDir);
        glossaryOutputPath = join(appendicesDir, 'glossary.adoc');
      } else {
        // Inline format - save to includes directory
        const includesDir = join(outputDir, 'includes');
        await this.ensureDirectoryExists(includesDir);
        glossaryOutputPath = join(includesDir, 'glossary.adoc');
      }
      
      // Write glossary file
      console.log(`📚 [Glossary] Writing glossary file to: ${glossaryOutputPath}`);
      console.log(`📚 [Glossary] Glossary content length: ${glossaryContent.length} chars`);
      console.log(`📚 [Glossary] First 500 chars of content: ${glossaryContent.substring(0, 500)}`);
      await writeFile(glossaryOutputPath, glossaryContent, 'utf8');
      console.log(`✅ [Glossary] Generated glossary at: ${glossaryOutputPath}`);
      
      // FIXED: Integrate glossary into individual files based on format
      if (glossaryOptions.format === 'inline') {
        console.log(`📚 [Glossary] Appending glossary to individual converted files...`);
        await this.appendGlossaryToIndividualFiles(outputDir, result, glossaryContent, allEntries);
      } else if (glossaryOptions.format === 'separate' && result.results.length > 0) {
        console.log(`📚 [Glossary] Adding glossary include references to individual files...`);
        await this.addGlossaryReferencesToIndividualFiles(outputDir, result, glossaryOutputPath);
      }
      
      // Add to conversion results
      result.results.push({
        inputPath: glossaryFiles[0], // Use first glossary file as representative
        outputPath: glossaryOutputPath,
        result: {
          content: glossaryContent,
          metadata: {
            title: glossaryOptions.title,
            format: 'asciidoc',
            wordCount: allEntries.length * 50, // Estimate word count
            warnings: [`Processed ${allEntries.length} glossary entries`]
          }
        }
      });
      
      result.convertedFiles++;
      
      // Update master document to include glossary if it was generated (not for inline format)
      if (options.generateMasterDoc && options.format === 'asciidoc' && glossaryOptions.format !== 'inline') {
        await this.updateMasterDocWithGlossary(outputDir, glossaryOutputPath, glossaryOptions.format as 'separate' | 'book-appendix');
      }
      
    } catch (error) {
      console.error('Error processing glossary files:', error);
      result.errors.push({
        file: 'glossary',
        error: `Failed to process glossary: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
  
  /**
   * Handle image copying for batch conversion with proper error handling
   */
  private async handleImageCopying(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions,
    imageDirectoriesCopied: boolean,
    conversionResult: any,
    inputPath: string,
    outputPath: string
  ): Promise<boolean> {
    console.log(`🚨 [CRITICAL DEBUG] handleImageCopying method called!`);
    console.log(`🎯 [handleImageCopying] Called with:`, {
      inputDir,
      outputDir,
      format: options.format,
      copyImages: options.copyImages,
      copyImagesType: typeof options.copyImages,
      imageDirectoriesCopied,
      hasConversionResult: !!conversionResult,
      hasMetadata: !!conversionResult?.metadata,
      hasImages: !!conversionResult?.metadata?.images,
      imageCount: conversionResult?.metadata?.images?.length || 0,
      allOptions: JSON.stringify(options, null, 2)
    });
    
    // Default copyImages to true if undefined, false if explicitly false
    const shouldCopyAnyImages = (options.copyImages === undefined || options.copyImages === true);
    
    if (shouldCopyAnyImages) {
      // Copy individual image files referenced in the content
      if (conversionResult.metadata?.images) {
        await this.copyReferencedImages(
          inputPath,
          outputPath,
          conversionResult.metadata.images,
          options
        );
      }
      
      // Copy all image directories once per batch
      console.log(`🔍 Image copy check: format=${options.format}, imageDirectoriesCopied=${imageDirectoriesCopied}, copyImages=${options.copyImages}`);
      console.log(`🔍 Image copy condition breakdown:`);
      console.log(`  - Format check: ${(options.format === 'zendesk' || options.format === 'asciidoc' || options.format === 'writerside-markdown')}`);
      console.log(`  - Not copied yet: ${!imageDirectoriesCopied}`);
      console.log(`  - Copy enabled: ${(options.copyImages === undefined || options.copyImages === true)}`);
      
      const shouldCopyImages = (options.format === 'zendesk' || options.format === 'asciidoc' || options.format === 'writerside-markdown') && 
                              !imageDirectoriesCopied && 
                              (options.copyImages === undefined || options.copyImages === true);
      
      // Force-enable for known MadCap patterns even if no images extracted
      const hasMadCapPatterns = this.detectMadCapProject(inputDir);
      const shouldForceImageCopy = hasMadCapPatterns && !imageDirectoriesCopied;
      
      if (shouldCopyImages || shouldForceImageCopy) {
        if (shouldForceImageCopy && !shouldCopyImages) {
          console.log(`🎯 [MADCAP DETECTION] Force-enabling image directory copying for detected MadCap project`);
          console.log(`🎯 [MADCAP DETECTION] This ensures Content/Images and Resources/Images are copied even when extracted images list is empty`);
        }
        console.log(`🚀 [IMAGE COPY] Starting image directory copying from ${inputDir} to ${outputDir}`);
        console.log(`🚀 [IMAGE COPY] This runs ONCE per batch to copy ALL image directories regardless of extracted image list`);
        try {
          const copyResult = await this.copyImageDirectories(inputDir, outputDir);
          if (copyResult.success) {
            console.log(`✅ [IMAGE COPY SUCCESS] Image directory copying completed successfully!`);
            console.log(`📁 [IMAGE COPY SUCCESS] Copied ${copyResult.copiedDirectories.length} image directories: ${copyResult.copiedDirectories.join(', ')}`);
            console.log(`📁 [IMAGE COPY SUCCESS] Images are now available at relative paths like: Images/filename.png`);
            return true; // Signal that image directories were successfully copied
          } else {
            console.log(`⚠️ [IMAGE COPY WARNING] Image directory copying failed - no directories found or accessible`);
            console.log(`⚠️ [IMAGE COPY WARNING] This may indicate the uploaded project lacks standard MadCap image directories`);
            if (copyResult.errors.length > 0) {
              console.log(`❌ [IMAGE COPY WARNING] Errors encountered: ${copyResult.errors.join('; ')}`);
            }
            return false; // Signal that copying failed
          }
        } catch (error) {
          console.error(`❌ [IMAGE COPY ERROR] Image directory copying failed with exception:`, error);
          return false; // Signal that copying failed with exception
        }
      } else {
        console.log(`⏭️ Skipping image directory copying - reason: ${
          imageDirectoriesCopied ? 'already copied' : 
          !(options.format === 'zendesk' || options.format === 'asciidoc' || options.format === 'writerside-markdown') ? 'unsupported format' :
          !(options.copyImages === undefined || options.copyImages === true) ? 'copyImages disabled' : 'unknown'
        }`);
        return imageDirectoriesCopied; // Return current state since no copying was attempted
      }
    } else {
      console.log(`⏭️ Skipping all image copying - copyImages option is explicitly false (value: ${options.copyImages})`);
      return imageDirectoriesCopied; // Return current state since copying is disabled
    }
  }

  /**
   * Detect if the project has MadCap structure patterns
   */
  private detectMadCapProject(inputDir: string): boolean {
    try {
      const { existsSync } = require('fs');
      
      // Check for typical MadCap directory patterns
      const madcapPatterns = [
        join(inputDir, 'Content'),
        join(inputDir, 'Project'),
        join(inputDir, 'Resources'),
        join(inputDir, 'Content', 'Resources'),
        join(inputDir, 'Project', 'VariableSets')
      ];
      
      const foundPatterns = madcapPatterns.filter(pattern => existsSync(pattern));
      const hasMadCapStructure = foundPatterns.length >= 2; // At least 2 MadCap directories
      
      console.log(`🔍 [MADCAP DETECTION] Checking for MadCap project patterns:`);
      console.log(`📁 Found patterns: ${foundPatterns.length}/${madcapPatterns.length}`);
      console.log(`📁 Detected patterns: ${foundPatterns.map(p => relative(inputDir, p)).join(', ')}`);
      console.log(`📁 Is MadCap project: ${hasMadCapStructure}`);
      
      return hasMadCapStructure;
    } catch (error) {
      console.warn(`⚠️ [MADCAP DETECTION] Error detecting MadCap patterns: ${error}`);
      return false;
    }
  }

  /**
   * Analyze uploaded folder structure for diagnostics
   */
  /**
   * Check if a file contains binary/multimedia content that shouldn't be converted
   */
  private async isBinaryOrMultimediaFile(filePath: string): Promise<{ isBinary: boolean; reason?: string }> {
    try {
      const ext = extname(filePath).toLowerCase();
      
      // Skip binary detection for known text-based MadCap file types
      if (['.xml', '.html', '.htm', '.flglo', '.flvar', '.fltoc', '.flsnp', '.svg'].includes(ext)) {
        return { isBinary: false };
      }
      
      // Handle image files 
      if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext)) {
        return { isBinary: true, reason: 'Image file - will be copied as resource' };
      }
      
      // Check file size first - HTML files with embedded video can be very large
      const stats = await stat(filePath);
      if (stats.size > 5 * 1024 * 1024) { // 5MB threshold
        return { isBinary: true, reason: `File too large (${(stats.size / 1024 / 1024).toFixed(1)}MB) - likely contains embedded media` };
      }
      
      // Read first chunk of file to check for binary content
      const buffer = Buffer.alloc(8192);
      const fd = await open(filePath, 'r');
      try {
        await fd.read(buffer, 0, 8192, 0);
      } finally {
        await fd.close();
      }
      
      // Check for binary data patterns
      const content = buffer.toString('utf8', 0, 8192);
      
      // Check for embedded video/multimedia data
      if (content.includes('data:video/webm') || content.includes('data:video/mp4') || 
          content.includes('data:application/octet-stream') || content.includes('data:audio/')) {
        return { isBinary: true, reason: 'Contains embedded multimedia data' };
      }
      
      // Check for base64 encoded content that's too large
      const base64Pattern = /data:[^;]+;base64,([A-Za-z0-9+/]{100,})/;
      const base64Match = content.match(base64Pattern);
      if (base64Match && base64Match[0].length > 10000) {
        return { isBinary: true, reason: 'Contains large base64 encoded data' };
      }
      
      // Check for high ratio of non-printable characters
      let nonPrintable = 0;
      let totalChecked = Math.min(content.length, 1000);
      
      for (let i = 0; i < totalChecked; i++) {
        const code = content.charCodeAt(i);
        // Allow common control characters: tab (9), newline (10), carriage return (13)
        // Also allow form feed (12) for some documents
        if (code < 32 && code !== 9 && code !== 10 && code !== 13 && code !== 12) {
          nonPrintable++;
        }
      }
      
      // Use a percentage-based threshold instead of absolute count
      const nonPrintableRatio = nonPrintable / totalChecked;
      if (nonPrintableRatio > 0.1) { // More than 10% non-printable characters
        return { isBinary: true, reason: `Contains binary data (${(nonPrintableRatio * 100).toFixed(1)}% non-printable)` };
      }
      
      return { isBinary: false };
    } catch (error) {
      console.error(`Error checking if file is binary: ${filePath}`, error);
      return { isBinary: false }; // Assume not binary on error
    }
  }

  /**
   * Search for directories containing image files - Enhanced version
   */
  private async searchForImageDirectories(
    rootDir: string,
    imageExtensions: Set<string>,
    currentPath: string = rootDir,
    foundDirs: Set<string> = new Set()
  ): Promise<string[]> {
    try {
      const entries = await readdir(currentPath, { withFileTypes: true });
      let hasImages = false;
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        
        const fullPath = join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          // Check if this directory should be excluded (but allow image-specific directories)
          const dirName = entry.name.toLowerCase();
          const isImageDir = dirName.includes('image') || dirName.includes('graphic') || 
                            dirName.includes('multimedia') || dirName.includes('picture') ||
                            dirName.includes('photo') || dirName.includes('asset');
          
          if (this.shouldIncludeDirectory(entry.name) || isImageDir) {
            // Recursively search subdirectories
            await this.searchForImageDirectories(rootDir, imageExtensions, fullPath, foundDirs);
          } else {
            console.log(`🚫 [Image Search] Excluding directory: ${entry.name} (excluded by filter)`);
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (imageExtensions.has(ext)) {
            hasImages = true;
          }
        }
      }
      
      // If this directory has images, add it to the set (including root dir if it has images)
      if (hasImages) {
        foundDirs.add(currentPath);
        console.log(`🖼️ [Enhanced] Found image directory: ${relative(rootDir, currentPath) || '.'}`);
      }
    } catch (error) {
      console.error(`Error searching directory ${currentPath}:`, error);
    }
    
    return Array.from(foundDirs);
  }
  
  /**
   * Find all image files in the directory structure
   */
  private async findAllImageFiles(
    rootDir: string,
    imageExtensions: Set<string>,
    currentPath: string = rootDir,
    foundFiles: string[] = []
  ): Promise<string[]> {
    try {
      const entries = await readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        
        const fullPath = join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively search subdirectories
          await this.findAllImageFiles(rootDir, imageExtensions, fullPath, foundFiles);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (imageExtensions.has(ext)) {
            foundFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error searching for files in ${currentPath}:`, error);
    }
    
    return foundFiles;
  }

  async analyzeUploadedStructure(inputDir: string): Promise<{
    totalFiles: number;
    supportedFiles: number;
    snippetFiles: number;
    contentFiles: number;
    imageFiles: number;
    otherFiles: number;
    foundSnippets: string[];
    missingCommonDirs: string[];
    excludedDirectories: string[];
  }> {
    const analysis = {
      totalFiles: 0,
      supportedFiles: 0,
      snippetFiles: 0,
      contentFiles: 0,
      imageFiles: 0,
      otherFiles: 0,
      foundSnippets: [] as string[],
      missingCommonDirs: [] as string[],
      excludedDirectories: [] as string[]
    };

    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp']);
    const contentExtensions = new Set(['.html', '.htm']);
    
    // Recursive function to analyze directory
    const analyzeDir = async (dirPath: string): Promise<void> => {
      try {
        const entries = await readdir(dirPath);
        
        for (const entry of entries) {
          // Skip system files
          if (entry.startsWith('.') || entry.startsWith('._')) continue;
          
          const entryPath = join(dirPath, entry);
          const stats = await stat(entryPath);
          
          if (stats.isDirectory()) {
            if (!this.shouldIncludeDirectory(entry)) {
              analysis.excludedDirectories.push(relative(inputDir, entryPath));
              console.log(`🚫 [Analysis] Excluding directory: ${entry} (MadCap output/temp folder)`);
            } else {
              await analyzeDir(entryPath);
            }
          } else {
            analysis.totalFiles++;
            const ext = extname(entry).toLowerCase();
            
            if (this.supportedExtensions.has(ext.slice(1))) {
              analysis.supportedFiles++;
              
              if (ext === '.flsnp') {
                analysis.snippetFiles++;
                analysis.foundSnippets.push(relative(inputDir, entryPath));
              } else if (contentExtensions.has(ext)) {
                analysis.contentFiles++;
              }
            } else if (imageExtensions.has(ext)) {
              analysis.imageFiles++;
            } else {
              analysis.otherFiles++;
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await analyzeDir(inputDir);

    // Check for common MadCap directories
    const commonDirs = ['Content', 'Content/Images', 'Content/Resources', 'Project', 'Resources'];
    for (const dir of commonDirs) {
      try {
        await stat(join(inputDir, dir));
      } catch (error) {
        analysis.missingCommonDirs.push(dir);
      }
    }

    return analysis;
  }

  /**
   * Enhanced directory structure logging with file analysis
   */
  async logDirectoryStructureWithAnalysis(dirPath: string, prefix: string = '', maxDepth: number = 3): Promise<void> {
    if (maxDepth <= 0) return;
    
    try {
      const entries = await readdir(dirPath);
      for (const entry of entries) {
        // Skip system files
        if (entry.startsWith('.') || entry.startsWith('._')) continue;
        
        const entryPath = join(dirPath, entry);
        const stats = await stat(entryPath);
        
        if (stats.isDirectory()) {
          console.log(`${prefix}📁 ${entry}/`);
          await this.logDirectoryStructureWithAnalysis(entryPath, prefix + '  ', maxDepth - 1);
        } else {
          const ext = extname(entry).toLowerCase();
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          const fileType = this.supportedExtensions.has(ext.slice(1)) ? '✅' : 
                          ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'].includes(ext) ? '🖼️' : '📄';
          console.log(`${prefix}${fileType} ${entry} (${sizeMB} MB)`);
          
          // Special highlighting for important files
          if (ext === '.flsnp') {
            console.log(`${prefix}  🔹 SNIPPET FILE detected`);
          } else if (ext === '.fltoc') {
            console.log(`${prefix}  🔹 TOC FILE detected`);
          } else if (ext === '.flvar') {
            console.log(`${prefix}  🔹 VARIABLE FILE detected`);
          }
        }
      }
    } catch (error) {
      console.log(`${prefix}❌ Error reading directory: ${error}`);
    }
  }

  /**
   * Update master document to include glossary reference
   */
  private async updateMasterDocWithGlossary(
    outputDir: string,
    glossaryPath: string,
    glossaryFormat: 'separate' | 'book-appendix'
  ): Promise<void> {
    try {
      const masterPath = join(outputDir, 'master.adoc');
      
      // Check if master document exists
      try {
        await stat(masterPath);
      } catch (error) {
        console.error('Master document not found, skipping glossary inclusion');
        return;
      }
      
      const masterContent = await readFile(masterPath, 'utf8');
      
      // Calculate relative path from master to glossary
      const glossaryRelativePath = relative(outputDir, glossaryPath);
      
      let updatedContent = masterContent;
      
      if (glossaryFormat === 'book-appendix') {
        // Add as appendix at the end
        updatedContent += '\n\n';
        updatedContent += 'include::' + glossaryRelativePath + '[]\n';
      } else if (glossaryFormat === 'separate') {
        // Add as a regular chapter/section
        updatedContent += '\n\n== Glossary\n\n';
        updatedContent += 'include::' + glossaryRelativePath + '[]\n';
      }
      // For inline format, it would typically be included within specific documents, not the master
      
      await writeFile(masterPath, updatedContent, 'utf8');
      console.error('Updated master document to include glossary');
      
    } catch (error) {
      console.error('Error updating master document with glossary:', error);
    }
  }

  /**
   * Append glossary content directly to individual converted files
   */
  private async appendGlossaryToIndividualFiles(
    outputDir: string,
    result: BatchConversionResult,
    glossaryContent: string,
    glossaryEntries: import('./flglo-parser').GlossaryEntry[]
  ): Promise<void> {
    console.log(`📚 [Glossary Append] Appending glossary to ${result.results.length} individual files`);
    
    // Create a simplified glossary section for appending
    const glossarySection = `\n\n== Glossary\n\n${glossaryContent.split('\n').filter(line => !line.startsWith('= ')).join('\n')}`;
    
    for (const { outputPath } of result.results) {
      try {
        // Only append to .adoc files
        if (!outputPath.endsWith('.adoc')) {
          continue;
        }
        
        const fileContent = await readFile(outputPath, 'utf8');
        
        // Check if glossary is already present
        if (fileContent.includes('== Glossary') || fileContent.includes('# Glossary')) {
          console.log(`⏭️ [Glossary Append] Skipping ${basename(outputPath)} (already has glossary)`);
          continue;
        }
        
        const updatedContent = fileContent + glossarySection;
        await writeFile(outputPath, updatedContent, 'utf8');
        
        console.log(`✅ [Glossary Append] Appended glossary to ${basename(outputPath)}`);
      } catch (error) {
        console.error(`❌ [Glossary Append] Failed to append glossary to ${outputPath}:`, error);
      }
    }
  }

  /**
   * Add glossary include references to individual converted files
   */
  private async addGlossaryReferencesToIndividualFiles(
    outputDir: string,
    result: BatchConversionResult,
    glossaryOutputPath: string
  ): Promise<void> {
    console.log(`📚 [Glossary Include] Adding glossary references to ${result.results.length} individual files`);
    
    for (const { outputPath } of result.results) {
      try {
        // Only process .adoc files
        if (!outputPath.endsWith('.adoc')) {
          continue;
        }
        
        const fileContent = await readFile(outputPath, 'utf8');
        
        // Check if glossary reference is already present
        if (fileContent.includes('include::') && fileContent.includes('glossary.adoc')) {
          console.log(`⏭️ [Glossary Include] Skipping ${basename(outputPath)} (already has glossary include)`);
          continue;
        }
        
        // Calculate relative path from this file to the glossary
        const relativePath = relative(dirname(outputPath), glossaryOutputPath);
        const includeStatement = `\n\n// Include glossary\ninclude::${relativePath}[]`;
        
        const updatedContent = fileContent + includeStatement;
        await writeFile(outputPath, updatedContent, 'utf8');
        
        console.log(`✅ [Glossary Include] Added glossary include to ${basename(outputPath)} (${relativePath})`);
      } catch (error) {
        console.error(`❌ [Glossary Include] Failed to add glossary include to ${outputPath}:`, error);
      }
    }
  }

  /**
   * Generate quality summary from all quality reports in the batch conversion result
   */
  private generateQualitySummary(result: BatchConversionResult): { averageScore: number; totalIssues: number; lowQualityFiles: Array<{ file: string; score: number; issues: number }> } {
    const qualityData = result.results
      .map(r => ({
        file: r.outputPath,
        report: r.result?.metadata?.qualityReport
      }))
      .filter((item): item is { file: string; report: import('./quality-validator').QualityReport } => 
        item.file !== undefined && item.report !== undefined
      );

    if (qualityData.length === 0) {
      return {
        averageScore: 0,
        totalIssues: 0,
        lowQualityFiles: []
      };
    }

    // Calculate average score
    const totalScore = qualityData.reduce((sum, item) => sum + item.report.score, 0);
    const averageScore = Math.round(totalScore / qualityData.length);

    // Count total issues across all files
    const totalIssues = qualityData.reduce((sum, item) => sum + item.report.issues.length, 0);

    // Identify low quality files (score < 70)
    const lowQualityFiles = qualityData
      .filter(item => item.report.score < 70)
      .map(item => ({
        file: item.file,
        score: item.report.score,
        issues: item.report.issues.length
      }));

    return {
      averageScore,
      totalIssues,
      lowQualityFiles
    };
  }
}

import { readdir, stat, copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { join, relative, extname, dirname, basename, sep } from 'path';
import { SimpleDocumentService } from './simple-document-service';
import { ConversionOptions, ConversionResult } from './types/index';
import { TocService, TocStructure, TOCBasedConversionPlan, BookOptions } from './toc-service';
import { TOCDiscoveryService, TOCDiscoveryResult } from './services/toc-discovery';

export interface BatchConversionOptions extends Partial<ConversionOptions> {
  recursive?: boolean;
  preserveStructure?: boolean;
  copyImages?: boolean;
  renameFiles?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface BatchConversionResult {
  totalFiles: number;
  convertedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
  skippedFilesList: Array<{ file: string; reason: string }>;
  results: Array<{ inputPath: string; outputPath: string; result: ConversionResult }>;
  filenameMapping?: Map<string, string>;
}

export class SimpleBatchService {
  private documentService: SimpleDocumentService;
  private tocService: TocService;
  private tocDiscoveryService: TOCDiscoveryService;

  constructor() {
    this.documentService = new SimpleDocumentService();
    this.tocService = new TocService();
    this.tocDiscoveryService = new TOCDiscoveryService();
  }

  async convertFolder(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions = {}
  ): Promise<BatchConversionResult> {
    const result: BatchConversionResult = {
      totalFiles: 0,
      convertedFiles: 0,
      skippedFiles: 0,
      errors: [],
      skippedFilesList: [],
      results: [],
      filenameMapping: new Map<string, string>()
    };

    // Get all files to convert
    const filesToConvert = await this.getFilesToConvert(inputDir, options);
    result.totalFiles = filesToConvert.length;

    // Create output directory
    await this.ensureDirectoryExists(outputDir);

    // Convert each file
    for (const filePath of filesToConvert) {
      try {
        const relativePath = relative(inputDir, filePath);
        const outputPath = await this.getOutputPath(relativePath, outputDir, options);
        
        // Create output directory for this file
        await this.ensureDirectoryExists(dirname(outputPath));

        // Convert the file
        const conversionResult = await this.documentService.convertFile(filePath, outputPath, options);
        
        result.results.push({
          inputPath: filePath,
          outputPath,
          result: conversionResult
        });
        
        result.convertedFiles++;
        
        // Track filename mapping
        if (result.filenameMapping) {
          result.filenameMapping.set(relativePath, relative(outputDir, outputPath));
        }

        // Copy images if requested
        if (options.copyImages && conversionResult.metadata?.images) {
          await this.copyExtractedImages(conversionResult.metadata.images, outputDir);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          file: filePath,
          error: errorMessage
        });
        console.error(`Error converting ${filePath}:`, errorMessage);
      }
    }

    result.skippedFiles = result.totalFiles - result.convertedFiles - result.errors.length;

    return result;
  }

  private async getFilesToConvert(inputDir: string, options: BatchConversionOptions): Promise<string[]> {
    const files: string[] = [];
    const supportedExtensions = ['.html', '.htm', '.docx', '.doc', '.xml', '.flsnp'];

    const processDirectory = async (dir: string) => {
      const entries = await readdir(dir);
      
      for (const entry of entries) {
        // Skip macOS metadata files
        if (entry.startsWith('._') || entry === '.DS_Store') {
          continue;
        }

        const fullPath = join(dir, entry);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          if (options.recursive !== false) {
            await processDirectory(fullPath);
          }
        } else if (stats.isFile()) {
          const ext = extname(entry).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            // Check include/exclude patterns
            if (this.shouldIncludeFile(fullPath, options)) {
              files.push(fullPath);
            }
          }
        }
      }
    };

    await processDirectory(inputDir);
    return files;
  }

  private shouldIncludeFile(filePath: string, options: BatchConversionOptions): boolean {
    const fileName = basename(filePath);
    
    // Check exclude patterns
    if (options.excludePatterns) {
      for (const pattern of options.excludePatterns) {
        if (fileName.includes(pattern) || filePath.includes(pattern)) {
          return false;
        }
      }
    }

    // Check include patterns
    if (options.includePatterns && options.includePatterns.length > 0) {
      for (const pattern of options.includePatterns) {
        if (fileName.includes(pattern) || filePath.includes(pattern)) {
          return true;
        }
      }
      return false; // If include patterns are specified, file must match one
    }

    return true;
  }

  private async getOutputPath(
    relativePath: string,
    outputDir: string,
    options: BatchConversionOptions
  ): Promise<string> {
    let outputPath = relativePath;

    // Change extension based on output format
    if (options.renameFiles !== false) {
      const ext = this.getExtensionForFormat(options.format || 'asciidoc');
      outputPath = outputPath.replace(/\.[^.]+$/, `.${ext}`);
    }

    return join(outputDir, outputPath);
  }

  private getExtensionForFormat(format: string): string {
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

  private async copyExtractedImages(images: string[], outputDir: string): Promise<void> {
    for (const imagePath of images) {
      try {
        const outputPath = join(outputDir, 'images', basename(imagePath));
        await this.ensureDirectoryExists(dirname(outputPath));
        await copyFile(imagePath, outputPath);
      } catch (error) {
        console.warn(`Failed to copy image ${imagePath}:`, error);
      }
    }
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

  // TOC-based conversion methods
  async discoverTocs(inputDir: string): Promise<TOCDiscoveryResult> {
    return await this.tocDiscoveryService.discoverAllTOCs(inputDir);
  }

  async parseToc(tocPath: string, contentBasePath: string): Promise<TocStructure> {
    return await this.tocService.parseFlareToc(tocPath, contentBasePath);
  }

  async createTOCBasedPlan(
    tocStructures: TocStructure[], 
    format: 'asciidoc' | 'writerside-markdown' | 'zendesk'
  ): Promise<TOCBasedConversionPlan> {
    return await this.tocService.createTOCBasedPlan(tocStructures, format);
  }

  async convertWithTocStructure(
    inputDir: string,
    outputDir: string,
    tocStructures: TocStructure[],
    options: BatchConversionOptions = {}
  ): Promise<BatchConversionResult> {
    const format = (options.format || 'asciidoc') as 'asciidoc' | 'writerside-markdown' | 'zendesk';
    const plan = await this.createTOCBasedPlan(tocStructures, format);
    
    const result: BatchConversionResult = {
      totalFiles: plan.conversionEntries.length,
      convertedFiles: 0,
      skippedFiles: 0,
      errors: [],
      skippedFilesList: [],
      results: [],
      filenameMapping: plan.fileMapping
    };

    // Create output directory structure
    await this.ensureDirectoryExists(outputDir);
    
    // Create all folders first
    for (const folder of plan.folderStructure) {
      if (folder.type === 'folder') {
        await this.ensureDirectoryExists(join(outputDir, folder.path));
      }
    }

    // Convert each file according to the plan
    for (const entry of plan.conversionEntries) {
      try {
        const inputPath = join(inputDir, entry.inputPath);
        const outputPath = join(outputDir, entry.outputPath);
        
        // Convert the file
        const conversionResult = await this.documentService.convertFile(inputPath, outputPath, options);
        
        result.results.push({
          inputPath,
          outputPath,
          result: conversionResult
        });
        
        result.convertedFiles++;

        // Copy images if requested
        if (options.copyImages && conversionResult.metadata?.images) {
          await this.copyExtractedImages(conversionResult.metadata.images, outputDir);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          file: entry.inputPath,
          error: errorMessage
        });
        console.error(`Error converting ${entry.inputPath}:`, errorMessage);
      }
    }

    result.skippedFiles = result.totalFiles - result.convertedFiles - result.errors.length;
    return result;
  }

  async generateMasterDoc(
    tocStructure: TocStructure,
    format: 'adoc' | 'markdown',
    options: BookOptions = {}
  ): Promise<{ content: string; metadata: { format: string } }> {
    return this.tocService.generateMasterAdoc(tocStructure, format, options);
  }

  async validateLinks(inputDir: string, tocStructures: TocStructure[]): Promise<Array<{ file: string; issue: string }>> {
    const issues: Array<{ file: string; issue: string }> = [];
    
    for (const toc of tocStructures) {
      await this.validateTocLinks(toc.entries, inputDir, issues);
    }
    
    return issues;
  }

  private async validateTocLinks(
    entries: any[], 
    inputDir: string, 
    issues: Array<{ file: string; issue: string }>
  ): Promise<void> {
    for (const entry of entries) {
      if (entry.href) {
        const filePath = join(inputDir, entry.href);
        try {
          await stat(filePath);
        } catch (error) {
          issues.push({
            file: entry.href,
            issue: `File not found: ${entry.href}`
          });
        }
      }
      
      if (entry.children && entry.children.length > 0) {
        await this.validateTocLinks(entry.children, inputDir, issues);
      }
    }
  }
}
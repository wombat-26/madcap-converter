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

        // Copy images if requested, preserving relative paths as referenced in content
        if (options.copyImages) {
          const images = conversionResult.metadata?.images?.length
            ? conversionResult.metadata.images
            : await this.extractImageRefsFromFile(filePath);
          if (images.length) {
            await this.copyExtractedImages(
              images,
              filePath,
              outputPath,
              outputDir
            );
          }
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

  private async copyExtractedImages(
    images: string[],
    inputPath: string,
    convertedOutputPath: string,
    batchOutputRoot: string
  ): Promise<void> {
    const inputDir = dirname(inputPath);
    const targetDocDir = dirname(convertedOutputPath);
    
    for (const ref of images) {
      try {
        // Skip external or inline images
        if (!ref || ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('data:')) {
          continue;
        }

        // Resolve the source image on disk relative to the input file location
        // Many MadCap projects use ../Images/... from topic files
        const { resolve, join } = await import('path');
        const sourceCandidates = [
          resolve(inputDir, ref),
        ];

        // Attempt a few common MadCap layouts if the first candidate doesn't exist
        const { stat } = await import('fs/promises');
        let sourceImagePath: string | undefined;
        for (const candidate of sourceCandidates) {
          try {
            await stat(candidate);
            sourceImagePath = candidate;
            break;
          } catch {
            // try next
          }
        }

        // If still not found, try project-root based fallbacks
        if (!sourceImagePath) {
          // Heuristic project root: up from inputDir to a Content/ parent if present; else batch root
          const contentIndex = inputDir.lastIndexOf(`${sep}Content${sep}`);
          const projectRoot = contentIndex !== -1 ? inputDir.slice(0, contentIndex) : batchOutputRoot;
          const normalized = ref.replace(/^\.\.\//, '');
          const extraCandidates = [
            join(projectRoot, normalized),
            join(projectRoot, 'Content', normalized),
            join(projectRoot, 'Resources', normalized),
            join(projectRoot, 'Images', basename(ref)),
            join(projectRoot, 'Resources', 'Images', basename(ref))
          ];
          for (const candidate of extraCandidates) {
            try {
              await stat(candidate);
              sourceImagePath = candidate;
              break;
            } catch {
              // continue searching
            }
          }
        }

        if (!sourceImagePath) {
          console.warn(`Failed to locate image on disk for reference: ${ref}`);
          continue;
        }

        // Compute target path preserving the same relative reference used in content
        const targetPath = resolve(targetDocDir, ref);
        
        // Safety: ensure we don't escape the batch output root
        const normalizedTargetRoot = resolve(batchOutputRoot);
        if (!targetPath.startsWith(normalizedTargetRoot)) {
          // Clamp to an Images folder at batch root if path escapes
          const clampedTarget = join(batchOutputRoot, 'Images', basename(ref));
          await this.ensureDirectoryExists(dirname(clampedTarget));
          await copyFile(sourceImagePath, clampedTarget);
          continue;
        }

        await this.ensureDirectoryExists(dirname(targetPath));
        await copyFile(sourceImagePath, targetPath);
      } catch (error) {
        console.warn(`Failed to copy image reference ${ref}:`, error);
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

  private async extractImageRefsFromFile(filePath: string): Promise<string[]> {
    try {
      const content = await readFile(filePath, 'utf8');
      const matches = content.matchAll(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi);
      const refs = Array.from(matches).map(m => m[1]);
      return refs.filter(src => src && !src.startsWith('data:'));
    } catch {
      return [];
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
        if (options.copyImages) {
          const images = conversionResult.metadata?.images?.length
            ? conversionResult.metadata.images
            : await this.extractImageRefsFromFile(inputPath);
          if (images.length) {
            await this.copyExtractedImages(
              images,
              inputPath,
              outputPath,
              outputDir
            );
          }
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

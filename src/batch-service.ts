import { readdir, stat, copyFile, mkdir, readFile } from 'fs/promises';
import { join, relative, extname, dirname, basename } from 'path';
import { DocumentService } from './document-service.js';
import { ConversionOptions, ConversionResult, ZendeskConversionOptions } from './types/index.js';
import { JSDOM } from 'jsdom';

export interface BatchConversionOptions extends Partial<ConversionOptions> {
  recursive?: boolean;
  preserveStructure?: boolean;
  copyImages?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface BatchConversionResult {
  totalFiles: number;
  convertedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
  results: Array<{ inputPath: string; outputPath: string; result: ConversionResult }>;
}

export class BatchService {
  private documentService: DocumentService;
  private supportedExtensions = new Set(['html', 'htm', 'docx', 'doc', 'xml']);

  constructor() {
    this.documentService = new DocumentService();
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
      results: []
    };

    await this.ensureDirectoryExists(outputDir);

    const files = await this.findDocumentFiles(inputDir, options);
    result.totalFiles = files.length;

    for (const inputPath of files) {
      try {
        const relativePath = relative(inputDir, inputPath);
        const outputPath = await this.generateOutputPath(relativePath, outputDir, options.format || 'markdown', inputPath);
        
        if (options.preserveStructure) {
          await this.ensureDirectoryExists(dirname(outputPath));
        }

        const conversionOptions: ConversionOptions = {
          format: options.format || 'markdown',
          inputType: this.determineInputType(extname(inputPath).toLowerCase().slice(1)),
          preserveFormatting: options.preserveFormatting ?? true,
          extractImages: options.extractImages ?? true,
          outputDir: dirname(outputPath),
          rewriteLinks: true,  // Enable link rewriting for batch conversions
          zendeskOptions: options.zendeskOptions
        };

        const conversionResult = await this.documentService.convertFile(
          inputPath,
          outputPath,
          conversionOptions
        );

        if (options.copyImages) {
          if (conversionResult.metadata?.images) {
            await this.copyReferencedImages(
              inputPath,
              outputPath,
              conversionResult.metadata.images,
              options
            );
          }
          
          // For Zendesk conversions, also copy all image directories
          if (options.format === 'zendesk') {
            await this.copyImageDirectories(inputDir, outputDir);
          }
        }

        result.results.push({
          inputPath,
          outputPath,
          result: conversionResult
        });

        result.convertedFiles++;
      } catch (error) {
        result.errors.push({
          file: inputPath,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    result.skippedFiles = result.totalFiles - result.convertedFiles - result.errors.length;
    return result;
  }

  private async findDocumentFiles(
    dirPath: string,
    options: BatchConversionOptions
  ): Promise<string[]> {
    const files: string[] = [];
    
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        if (options.recursive !== false) {
          const subFiles = await this.findDocumentFiles(fullPath, options);
          files.push(...subFiles);
        }
      } else if (stats.isFile()) {
        const ext = extname(entry).toLowerCase().slice(1);
        
        if (this.supportedExtensions.has(ext)) {
          if (this.shouldIncludeFile(entry, options)) {
            files.push(fullPath);
          }
        }
      }
    }
    
    return files;
  }

  private shouldIncludeFile(filename: string, options: BatchConversionOptions): boolean {
    if (options.excludePatterns) {
      for (const pattern of options.excludePatterns) {
        if (filename.includes(pattern)) {
          return false;
        }
      }
    }
    
    if (options.includePatterns) {
      for (const pattern of options.includePatterns) {
        if (filename.includes(pattern)) {
          return true;
        }
      }
      return false;
    }
    
    return true;
  }

  private async generateOutputPath(relativePath: string, outputDir: string, format: string, inputPath?: string): Promise<string> {
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
      default:
        extension = '.md';
        break;
    }
    
    let outputFileName: string;
    
    // For Zendesk format, use H1 text as filename
    if (format === 'zendesk' && inputPath) {
      const h1Text = await this.extractH1Text(inputPath);
      if (h1Text) {
        // Convert H1 text to filename: lowercase, replace spaces with underscores, remove special chars
        const cleanFileName = h1Text
          .toLowerCase()
          .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, hyphens
          .replace(/\s+/g, '_') // Replace spaces with underscores
          .replace(/-+/g, '_') // Replace hyphens with underscores
          .replace(/_+/g, '_') // Collapse multiple underscores
          .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
        
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
      console.warn(`Could not extract H1 text from ${filePath}:`, error);
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
    
    for (const imagePath of images) {
      try {
        if (imagePath.startsWith('data:') || imagePath.startsWith('http')) {
          continue;
        }
        
        const sourceImagePath = join(inputDir, imagePath);
        const targetImagePath = join(outputDir, imagePath);
        
        await this.ensureDirectoryExists(dirname(targetImagePath));
        await copyFile(sourceImagePath, targetImagePath);
      } catch (error) {
        console.warn(`Failed to copy image ${imagePath}:`, error);
      }
    }
  }

  private async copyImageDirectories(
    sourceRootDir: string,
    targetRootDir: string
  ): Promise<void> {
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp']);
    
    try {
      // Find common image directories in MadCap Flare projects
      const imageDirCandidates = [
        'Images',
        'Resources/Images', 
        'Resources/Multimedia',
        'Content/Images',
        'Content/Resources/Images'
      ];
      
      for (const imageDir of imageDirCandidates) {
        const sourceImageDir = join(sourceRootDir, imageDir);
        const targetImageDir = join(targetRootDir, imageDir);
        
        try {
          await this.copyDirectoryRecursive(sourceImageDir, targetImageDir, imageExtensions);
        } catch (error) {
          // Directory might not exist, continue with next candidate
          continue;
        }
      }
    } catch (error) {
      console.warn('Failed to copy image directories:', error);
    }
  }

  private async copyDirectoryRecursive(
    sourceDir: string,
    targetDir: string,
    allowedExtensions?: Set<string>
  ): Promise<void> {
    await this.ensureDirectoryExists(targetDir);
    
    const entries = await readdir(sourceDir);
    
    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry);
      const targetPath = join(targetDir, entry);
      
      const stats = await stat(sourcePath);
      
      if (stats.isDirectory()) {
        await this.copyDirectoryRecursive(sourcePath, targetPath, allowedExtensions);
      } else if (stats.isFile()) {
        if (!allowedExtensions || allowedExtensions.has(extname(entry).toLowerCase())) {
          await copyFile(sourcePath, targetPath);
        }
      }
    }
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
}
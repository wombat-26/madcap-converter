import { readdir, stat, copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { join, relative, extname, dirname, basename } from 'path';
import { DocumentService } from './document-service.js';
import { ConversionOptions, ConversionResult, ZendeskConversionOptions } from './types/index.js';
import { JSDOM } from 'jsdom';
import { ZendeskConverter } from './converters/zendesk-converter.js';
import { MadCapConverter } from './converters/madcap-converter.js';

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
  results: Array<{ inputPath: string; outputPath: string; result: ConversionResult }>;
  filenameMapping?: Map<string, string>; // Maps old relative paths to new relative paths
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
      results: [],
      filenameMapping: options.renameFiles ? new Map<string, string>() : undefined
    };

    await this.ensureDirectoryExists(outputDir);

    const files = await this.findDocumentFiles(inputDir, options);
    result.totalFiles = files.length;

    // Track if stylesheet has been written for this batch
    let stylesheetWritten = false;

    for (const inputPath of files) {
      try {
        // Check if file should be skipped due to MadCap conditions (applies to all formats)
        const content = await readFile(inputPath, 'utf8');
        if (this.containsMadCapContent(content)) {
          // Use appropriate converter's skip check based on format
          const shouldSkip = options.format === 'zendesk' 
            ? ZendeskConverter.shouldSkipFile(content)
            : MadCapConverter.shouldSkipFile(content);
            
          if (shouldSkip) {
            // Skipping file with excluded MadCap conditions: ${inputPath}
            result.skippedFiles++;
            continue;
          }
        }

        const relativePath = relative(inputDir, inputPath);
        const outputPath = await this.generateOutputPath(relativePath, outputDir, options.format || 'markdown', inputPath, options.renameFiles);
        
        // Track filename mapping for cross-reference updates
        if (options.renameFiles && result.filenameMapping) {
          const originalRelativePath = relativePath;
          const newRelativePath = relative(outputDir, outputPath);
          result.filenameMapping.set(originalRelativePath, newRelativePath);
        }
        
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

        // Handle external stylesheet generation for batch conversions (write only once per batch)
        if (conversionResult.stylesheet && options.format === 'zendesk' && options.zendeskOptions?.generateStylesheet && !stylesheetWritten) {
          await this.writeStylesheet(conversionResult.stylesheet, outputDir, options.zendeskOptions.cssOutputPath);
          stylesheetWritten = true;
        }

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
    
    // Update cross-references if files were renamed
    if (options.renameFiles && result.filenameMapping && result.filenameMapping.size > 0) {
      await this.updateCrossReferences(result, outputDir, options.format || 'markdown');
    }
    
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

    console.log(`Updating cross-references for ${result.results.length} files...`);
    
    for (const { outputPath } of result.results) {
      try {
        const content = await readFile(outputPath, 'utf8');
        let updatedContent = content;
        let hasChanges = false;

        // Update links based on format
        if (format === 'markdown') {
          // Update Markdown links: [text](path) and [text](path#anchor)
          updatedContent = content.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, url) => {
            const updatedUrl = this.updateLinkUrl(url, result.filenameMapping!);
            if (updatedUrl !== url) {
              hasChanges = true;
              return `[${text}](${updatedUrl})`;
            }
            return match;
          });
        } else if (format === 'asciidoc') {
          // Update AsciiDoc links: link:path[text] and xref:path[text]
          updatedContent = content.replace(/(link|xref):([^\[]+)\[([^\]]*)\]/g, (match, linkType, url, text) => {
            const updatedUrl = this.updateLinkUrl(url, result.filenameMapping!);
            if (updatedUrl !== url) {
              hasChanges = true;
              return `${linkType}:${updatedUrl}[${text}]`;
            }
            return match;
          });
        } else if (format === 'zendesk') {
          // Update HTML links: <a href="path">text</a>
          updatedContent = content.replace(/<a\s+([^>]*\s+)?href="([^"]*)"([^>]*)>([^<]*)<\/a>/gi, (match, before, url, after, text) => {
            const updatedUrl = this.updateLinkUrl(url, result.filenameMapping!);
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
          console.log(`Updated cross-references in: ${basename(outputPath)}`);
        }

      } catch (error) {
        console.warn(`Failed to update cross-references in ${outputPath}:`, error);
      }
    }
  }

  private updateLinkUrl(url: string, filenameMapping: Map<string, string>): string {
    // Skip external URLs, anchors, and mailto links
    if (url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('#')) {
      return url;
    }

    // Split URL and anchor
    const [path, anchor] = url.split('#');
    
    // Check if this path (or a variation) exists in our mapping
    for (const [oldPath, newPath] of filenameMapping.entries()) {
      // Try exact match
      if (path === oldPath) {
        return anchor ? `${newPath}#${anchor}` : newPath;
      }
      
      // Try without extension for cross-format references
      const pathWithoutExt = path.replace(/\.(html?|adoc|md)$/i, '');
      const oldPathWithoutExt = oldPath.replace(/\.(html?|adoc|md)$/i, '');
      
      if (pathWithoutExt === oldPathWithoutExt) {
        const newPathWithoutExt = newPath.replace(/\.(html?|adoc|md)$/i, '');
        const extension = path.match(/\.(html?|adoc|md)$/i)?.[0] || '';
        return anchor ? `${newPathWithoutExt}${extension}#${anchor}` : `${newPathWithoutExt}${extension}`;
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
    // Prevent infinite recursion by checking if source is within target
    const normalizedSource = sourceDir.replace(/\/$/, '');
    const normalizedTarget = targetDir.replace(/\/$/, '');
    
    if (normalizedSource === normalizedTarget || normalizedSource.startsWith(normalizedTarget + '/')) {
      console.warn(`Skipping recursive copy: source ${sourceDir} is within target ${targetDir}`);
      return;
    }
    
    await this.ensureDirectoryExists(targetDir);
    
    const entries = await readdir(sourceDir);
    
    for (const entry of entries) {
      // Skip macOS metadata files
      if (entry.startsWith('._') || entry === '.DS_Store') {
        continue;
      }
      
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
      
      console.log(`External stylesheet generated: ${cssFilePath}`);
    } catch (error) {
      console.warn('Failed to write external stylesheet:', error);
    }
  }
}
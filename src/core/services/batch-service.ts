import { readdir, stat, copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { join, relative, extname, dirname, basename, sep } from 'path';
import { DocumentService } from './document-service';
import { ConversionOptions, ConversionResult, ZendeskConversionOptions } from '../types/index';
import { JSDOM } from 'jsdom';
import { ZendeskConverter } from '../converters/zendesk-converter';
import { MadCapConverter } from '../converters/madcap-converter';
import { TOCDiscoveryService } from './toc-discovery';
import { TocService, TOCBasedConversionPlan } from '../toc-service';

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
}

export class BatchService {
  private documentService: DocumentService;
  private tocDiscoveryService: TOCDiscoveryService;
  private tocService: TocService;
  private supportedExtensions = new Set(['html', 'htm', 'docx', 'doc', 'xml']);

  constructor() {
    this.documentService = new DocumentService();
    this.tocDiscoveryService = new TOCDiscoveryService();
    this.tocService = new TocService();
  }

  async convertFolder(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions = {}
  ): Promise<BatchConversionResult> {
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
      return this.convertFolderWithTOCStructure(inputDir, outputDir, options, result);
    }

    // Use regular folder conversion for non-TOC based conversions
    return this.convertFolderRegular(inputDir, outputDir, options, result);
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
          } else {
            // SKIPPED: ${fullPath} - Excluded by filename pattern
          }
        } else {
          // SKIPPED: ${fullPath} - Unsupported file extension (.${ext})
        }
      }
    }
    
    return files;
  }

  private shouldIncludeFile(filename: string, options: BatchConversionOptions): boolean {
    const basename = filename.split('/').pop() || filename;
    
    // Exclude macOS metadata files
    if (basename.startsWith('._') || basename === '.DS_Store') {
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
          // Updated cross-references in: ${basename(outputPath)}
        }

      } catch (error) {
        // Failed to update cross-references in ${outputPath}: ${error}
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
        // Failed to copy image ${imagePath}: ${error}
      }
    }
  }

  private async copyImageDirectories(
    sourceRootDir: string,
    targetRootDir: string
  ): Promise<void> {
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp']);
    
    try {
      // Map source image directories to target locations
      // For TOC-based conversions, images should be accessible from user/subfolder/ as ../../Images/
      const imageDirMappings = [
        // Source path -> Target path
        { source: 'Content/Images', target: 'Images' },
        { source: 'Content/Resources/Images', target: 'Images' },
        { source: 'Images', target: 'Images' },
        { source: 'Resources/Images', target: 'Images' },
        { source: 'Resources/Multimedia', target: 'Images' }
      ];
      
      for (const mapping of imageDirMappings) {
        const sourceImageDir = join(sourceRootDir, mapping.source);
        const targetImageDir = join(targetRootDir, mapping.target);
        
        try {
          await this.copyDirectoryRecursive(sourceImageDir, targetImageDir, imageExtensions);
        } catch (error) {
          // Directory might not exist, continue with next candidate
          continue;
        }
      }
    } catch (error) {
      // Failed to copy image directories: ${error}
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
      // Skipping recursive copy: source ${sourceDir} is within target ${targetDir}
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
    // Starting TOC-based conversion from ${inputDir} to ${outputDir}
    
    try {
      // Discover all TOC files in the project
      const tocDiscovery = await this.tocDiscoveryService.discoverAllTOCs(inputDir);
      
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
      if (options.format === 'asciidoc' && options.asciidocOptions?.glossaryOptions?.includeGlossary) {
        await this.processGlossaryFiles(inputDir, outputDir, options, result);
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
    for (const [originalPath, targetPath] of fileMapping.entries()) {
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
        const actualInputPath = resolvedPath;
        
        // Handle renameFiles option: if enabled, extract H1 for filename but preserve TOC directory structure
        let finalOutputPath = fullOutputPath;
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
        
        
        // Check if file should be skipped due to MadCap conditions
        const content = await readFile(actualInputPath, 'utf8');
        if (this.containsMadCapContent(content)) {
          const shouldSkip = options.format === 'zendesk' 
            ? ZendeskConverter.shouldSkipFile(content)
            : MadCapConverter.shouldSkipFile(content);
            
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
          variableOptions: options.variableOptions ? {
            ...options.variableOptions,
            variablesOutputPath: calculatedVariablesPath, // Include calculated variables path
            skipFileGeneration: true // Prevent individual files from generating variables files
          } : undefined,
          zendeskOptions: options.zendeskOptions
        };

        const conversionResult = await this.documentService.convertFile(
          actualInputPath,
          finalOutputPath,
          conversionOptions
        );

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

        if (options.copyImages) {
          if (conversionResult.metadata?.images) {
            await this.copyReferencedImages(
              actualInputPath,
              finalOutputPath,
              conversionResult.metadata.images,
              options
            );
          }
          
          // For Zendesk and AsciiDoc conversions, copy all image directories once per batch
          if ((options.format === 'zendesk' || options.format === 'asciidoc' || options.format === 'writerside-markdown') && !imageDirectoriesCopied) {
            await this.copyImageDirectories(inputDir, outputDir);
            imageDirectoriesCopied = true;
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
        // ERROR: ${originalPath} - ${errorMessage}
        result.errors.push({
          file: originalPath,
          error: errorMessage
        });
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
        }
        
        // Ensure directory exists for the variables file
        await this.ensureDirectoryExists(dirname(variablesPath));
        await writeFile(variablesPath, variablesFile, 'utf8');
        // Generated combined variables file at ${variablesPath}
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
    const files = await this.findDocumentFiles(inputDir, options);
    result.totalFiles = files.length;

    // Track if stylesheet has been written for this batch
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

    // Process files in batches to prevent memory exhaustion
    const BATCH_SIZE = 10; // Process 10 files at a time
    
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      
      for (const inputPath of batch) {
        try {
          // Check if file should be skipped due to MadCap conditions (applies to all formats)
          const content = await readFile(inputPath, 'utf8');
          if (this.containsMadCapContent(content)) {
            // Use appropriate converter's skip check based on format
            const shouldSkip = options.format === 'zendesk' 
              ? ZendeskConverter.shouldSkipFile(content)
              : MadCapConverter.shouldSkipFile(content);
              
            if (shouldSkip) {
              const reason = `MadCap conditions indicate content should be skipped (Black, Red, Gray, deprecated, paused, print-only, etc.)`;
              // SKIPPED: ${inputPath} - ${reason}
              result.skippedFiles++;
              result.skippedFilesList.push({ file: inputPath, reason });
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
          variableOptions: options.variableOptions ? {
            ...options.variableOptions,
            variablesOutputPath: calculatedVariablesPath, // Include calculated variables path
            skipFileGeneration: true // Prevent individual files from generating variables files
          } : undefined,
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

        // Collect variables from this file if extraction is enabled
        if (batchVariableExtractor && conversionResult.metadata?.variables) {
          for (const variable of conversionResult.metadata.variables) {
            batchVariableExtractor.addVariable(variable);
          }
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
          
          // For Zendesk and AsciiDoc conversions, copy all image directories once per batch
          if ((options.format === 'zendesk' || options.format === 'asciidoc' || options.format === 'writerside-markdown') && !imageDirectoriesCopied) {
            await this.copyImageDirectories(inputDir, outputDir);
            imageDirectoriesCopied = true;
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
        // ERROR: ${inputPath} - ${errorMessage}
        result.errors.push({
          file: inputPath,
          error: errorMessage
        });
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
        }
        
        // Ensure directory exists for the variables file
        await this.ensureDirectoryExists(dirname(variablesPath));
        await writeFile(variablesPath, variablesFile, 'utf8');
        // Generated combined variables file at ${variablesPath}
      }
    }
    
    // Process glossary files if requested (only for AsciiDoc format)
    if (options.format === 'asciidoc' && options.asciidocOptions?.glossaryOptions?.includeGlossary) {
      await this.processGlossaryFiles(inputDir, outputDir, options, result);
    }
    
    // Update cross-references if files were renamed
    if (options.renameFiles && result.filenameMapping && result.filenameMapping.size > 0) {
      await this.updateCrossReferences(result, outputDir, options.format || 'markdown');
    }
    
    return result;
  }

  /**
   * Find the MadCap project root from a content directory path
   */
  private findProjectRoot(inputDir: string): string {
    // Find the project root by looking for the Content directory in the path
    const pathParts = inputDir.split('/');
    const contentIndex = pathParts.findIndex(part => part === 'Content');
    
    if (contentIndex > 0) {
      // Return the path before the Content directory
      return pathParts.slice(0, contentIndex).join('/');
    }
    
    // If no Content directory found, assume the input is already the project root
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
    try {
      const { FlgloParser } = await import('./flglo-parser');
      const { GlossaryConverter } = await import('../converters/glossary-converter');
      
      const glossaryParser = new FlgloParser();
      const glossaryConverter = new GlossaryConverter();
      
      // Find project root to search for glossary files
      const projectRoot = this.findProjectRoot(inputDir);
      
      // Discover glossary files (.flglo) in the project
      let glossaryFiles: string[] = [];
      
      // Check if a specific glossary file path was provided
      if (options.asciidocOptions?.glossaryOptions?.glossaryPath) {
        const specifiedPath = join(projectRoot, options.asciidocOptions.glossaryOptions.glossaryPath);
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
        glossaryFiles = await glossaryParser.findGlossaryFiles(projectRoot);
        console.error(`Auto-discovered ${glossaryFiles.length} glossary file(s)`);
      }
      
      if (glossaryFiles.length === 0) {
        console.error('No glossary files found in project');
        return;
      }
      
      // Parse all glossary files and combine entries
      const allEntries: import('./flglo-parser').GlossaryEntry[] = [];
      
      for (const glossaryFile of glossaryFiles) {
        try {
          console.error(`Processing glossary file: ${glossaryFile}`);
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
      
      if (allEntries.length === 0) {
        console.error('No glossary entries to process');
        return;
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
      await writeFile(glossaryOutputPath, glossaryContent, 'utf8');
      console.error(`Generated glossary at: ${glossaryOutputPath}`);
      
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
      
      // Update master document to include glossary if it was generated
      if (options.generateMasterDoc && options.format === 'asciidoc') {
        await this.updateMasterDocWithGlossary(outputDir, glossaryOutputPath, glossaryOptions.format);
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
   * Update master document to include glossary reference
   */
  private async updateMasterDocWithGlossary(
    outputDir: string,
    glossaryPath: string,
    glossaryFormat: 'inline' | 'separate' | 'book-appendix'
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
}
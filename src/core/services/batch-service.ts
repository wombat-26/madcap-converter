import { readdir, stat, copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { join, relative, extname, dirname, basename, sep } from 'path';
import { DocumentService } from './document-service.js';
import { ConversionOptions, ConversionResult, ZendeskConversionOptions } from '../types/index.js';
import { JSDOM } from 'jsdom';
import { ZendeskConverter } from '../converters/zendesk-converter.js';
import { MadCapConverter } from '../converters/madcap-converter.js';
import { TOCDiscoveryService } from './toc-discovery.js';
import { TocService, TOCBasedConversionPlan } from '../toc-service.js';

export interface BatchConversionOptions extends Partial<ConversionOptions> {
  recursive?: boolean;
  preserveStructure?: boolean;
  copyImages?: boolean;
  renameFiles?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
  useTOCStructure?: boolean; // Use TOC hierarchy instead of file structure
  generateMasterDoc?: boolean; // Generate master document from TOCs
  writersideOptions?: import('../types/index.js').WritersideOptions; // Writerside project options
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

export interface BatchTOCConversionPlan {
  tocFile: string;
  filesToConvert: Array<{ inputPath: string; outputPath: string; tocEntry: any }>;
  conversionEntries: Array<{ inputPath: string; outputPath: string; tocEntry: any }>;
  folderStructure: Array<{ path: string; type: 'folder' | 'file' }>;
  fileMapping: Map<string, string>;
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
    console.log(`Starting batch conversion from ${inputDir} to ${outputDir}`);

    const defaultOptions: BatchConversionOptions = {
      recursive: true,
      preserveStructure: true,
      copyImages: true,
      renameFiles: false,
      includePatterns: [],
      excludePatterns: [],
      useTOCStructure: false,
      generateMasterDoc: false,
      format: 'asciidoc'
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    const result: BatchConversionResult = {
      totalFiles: 0,
      convertedFiles: 0,
      skippedFiles: 0,
      errors: [],
      skippedFilesList: [],
      results: [],
      filenameMapping: new Map(),
      tocStructure: undefined
    };

    try {
      await mkdir(outputDir, { recursive: true });

      // Decide conversion strategy based on options
      if (finalOptions.useTOCStructure) {
        return await this.convertWithTOCStructure(inputDir, outputDir, finalOptions, result);
      } else {
        return await this.convertWithFileStructure(inputDir, outputDir, finalOptions, result);
      }
    } catch (error) {
      throw new Error(`Batch conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Convert using file system structure
   */
  private async convertWithFileStructure(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions,
    result: BatchConversionResult
  ): Promise<BatchConversionResult> {
    const files = await this.discoverFiles(inputDir, options);
    result.totalFiles = files.length;

    console.log(`Found ${files.length} files to process`);

    // Process files in parallel with limited concurrency
    const CONCURRENCY_LIMIT = 5;
    const chunks: string[][] = [];
    for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
      chunks.push(files.slice(i, i + CONCURRENCY_LIMIT));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(inputPath => this.processFile(inputPath, inputDir, outputDir, options, result))
      );
    }

    // Copy images if requested
    if (options.copyImages) {
      await this.copyImages(inputDir, outputDir, options);
    }

    // Update cross-references if files were renamed
    if (options.renameFiles && result.filenameMapping && result.filenameMapping.size > 0) {
      await this.updateCrossReferences(outputDir, result.filenameMapping, options);
    }

    console.log(`Batch conversion completed: ${result.convertedFiles}/${result.totalFiles} files converted`);
    return result;
  }

  /**
   * Convert using TOC structure for organization
   */
  private async convertWithTOCStructure(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions,
    result: BatchConversionResult
  ): Promise<BatchConversionResult> {
    console.log('Using TOC-based conversion strategy');

    // Discover TOCs in the project
    const tocDiscoveryResult = await this.tocDiscoveryService.discoverAllTOCs(inputDir);
    const tocFiles = tocDiscoveryResult.tocFiles;
    console.log(`Found ${tocFiles.length} TOC files`);

    if (tocFiles.length === 0) {
      console.log('No TOC files found, falling back to file structure conversion');
      return await this.convertWithFileStructure(inputDir, outputDir, options, result);
    }

    result.tocStructure = {
      totalTOCs: tocFiles.length,
      discoveredFiles: 0,
      masterDocumentPath: undefined
    };

    // Create conversion plan based on TOC structure  
    let totalDiscoveredFiles = 0;
    let allConversionPlans: any[] = [];
    
    try {
      // Create a single plan from all discovered TOC structures
      const tocBasedPlan = await this.tocService.createTOCBasedPlan(tocDiscoveryResult.tocStructures.map(ts => ts.structure), options.format || 'asciidoc');
      
      // Convert the plan format to what the rest of the code expects
      allConversionPlans = tocFiles.map((tocFile, index) => {
        const relevantEntries = tocBasedPlan.conversionEntries.filter((_, i) => 
          Math.floor(i / (tocBasedPlan.conversionEntries.length / tocFiles.length)) === index
        );
        
        return {
          tocFile,
          filesToConvert: relevantEntries.map(entry => ({
            inputPath: entry.inputPath,
            outputPath: entry.outputPath,
            tocEntry: entry.tocEntry
          })),
          conversionEntries: relevantEntries,
          folderStructure: tocBasedPlan.folderStructure,
          fileMapping: tocBasedPlan.fileMapping
        };
      });
      
      totalDiscoveredFiles = tocBasedPlan.conversionEntries.length;
      
      for (const plan of allConversionPlans) {
        console.log(`TOC ${basename(plan.tocFile)}: ${plan.filesToConvert.length} files to convert`);
      }
      
    } catch (error) {
      result.errors.push({
        file: 'TOC Processing',
        error: `Failed to create conversion plan: ${error instanceof Error ? error.message : String(error)}`
      });
      return result;
    }

    result.tocStructure.discoveredFiles = totalDiscoveredFiles;
    result.totalFiles = totalDiscoveredFiles;

    // Execute conversion plans
    for (const plan of allConversionPlans) {
      await this.executeTOCConversionPlan(plan, options, result);
    }

    // Generate master document if requested
    if (options.generateMasterDoc) {
      const masterDocPath = await this.generateMasterDocument(allConversionPlans, outputDir, options);
      if (masterDocPath) {
        result.tocStructure.masterDocumentPath = masterDocPath;
      }
    }

    // Copy images if requested
    if (options.copyImages) {
      await this.copyImages(inputDir, outputDir, options);
    }

    return result;
  }

  /**
   * Execute a single TOC-based conversion plan
   */
  private async executeTOCConversionPlan(
    plan: BatchTOCConversionPlan,
    options: BatchConversionOptions,
    result: BatchConversionResult
  ): Promise<void> {
    console.log(`Executing conversion plan for ${plan.tocFile} (${plan.filesToConvert.length} files)`);

    for (const fileEntry of plan.filesToConvert) {
      const inputPath = fileEntry.inputPath;
      const outputPath = fileEntry.outputPath;

      try {
        // Ensure output directory exists
        await mkdir(dirname(outputPath), { recursive: true });

        // Convert the file
        const conversionOptions: ConversionOptions = {
          ...options,
          format: options.format || 'asciidoc',
          inputType: 'html', // TOC-based conversion typically processes HTML files
          inputPath,
          outputPath
        };

        const conversionResult = await this.documentService.convertFile(
          inputPath,
          conversionOptions
        );

        result.results.push({
          inputPath,
          outputPath,
          result: conversionResult
        });

        result.convertedFiles++;

        // Write converted content
        await writeFile(outputPath, conversionResult.content, 'utf-8');

        console.log(`✓ Converted: ${relative(process.cwd(), inputPath)} → ${relative(process.cwd(), outputPath)}`);

      } catch (error) {
        result.errors.push({
          file: inputPath,
          error: error instanceof Error ? error.message : String(error)
        });
        console.error(`✗ Failed: ${inputPath} - ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Generate a master document that includes all converted files
   */
  private async generateMasterDocument(
    plans: BatchTOCConversionPlan[],
    outputDir: string,
    options: BatchConversionOptions
  ): Promise<string | undefined> {
    if (plans.length === 0) return undefined;

    const format = options.format || 'asciidoc';
    const extension = this.getExtensionForFormat(format);
    const masterDocPath = join(outputDir, `master.${extension}`);

    let masterContent = '';

    if (format === 'asciidoc') {
      masterContent = this.generateAsciiDocMaster(plans, outputDir);
    } else if (format === 'writerside-markdown') {
      masterContent = this.generateMarkdownMaster(plans, outputDir);
    } else {
      console.warn(`Master document generation not supported for format: ${format}`);
      return undefined;
    }

    await writeFile(masterDocPath, masterContent, 'utf-8');
    console.log(`Generated master document: ${masterDocPath}`);

    return masterDocPath;
  }

  /**
   * Generate AsciiDoc master document
   */
  private generateAsciiDocMaster(plans: BatchTOCConversionPlan[], outputDir: string): string {
    const lines: string[] = [];
    
    lines.push('= Documentation Master');
    lines.push(':toc: left');
    lines.push(':toclevels: 3');
    lines.push(':source-highlighter: highlight.js');
    lines.push('');

    for (const plan of plans) {
      if (plan.filesToConvert.length === 0) continue;

      // Add section for this TOC
      const tocName = basename(plan.tocFile, '.fltoc');
      lines.push(`== ${tocName}`);
      lines.push('');

      // Include all files from this TOC
      for (const fileEntry of plan.filesToConvert) {
        const relativePath = relative(outputDir, fileEntry.outputPath);
        lines.push(`include::${relativePath}[]`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate Markdown master document
   */
  private generateMarkdownMaster(plans: BatchTOCConversionPlan[], outputDir: string): string {
    const lines: string[] = [];
    
    lines.push('# Documentation Master');
    lines.push('');

    for (const plan of plans) {
      if (plan.filesToConvert.length === 0) continue;

      // Add section for this TOC
      const tocName = basename(plan.tocFile, '.fltoc');
      lines.push(`## ${tocName}`);
      lines.push('');

      // Add links to all files from this TOC
      for (const fileEntry of plan.filesToConvert) {
        const relativePath = relative(outputDir, fileEntry.outputPath);
        const fileName = basename(fileEntry.outputPath, '.md');
        lines.push(`- [${fileName}](${relativePath})`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Process a single file in the batch conversion
   */
  private async processFile(
    inputPath: string,
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions,
    result: BatchConversionResult
  ): Promise<void> {
    try {
      const relativePath = relative(inputDir, inputPath);
      console.log(`Processing: ${relativePath}`);

      // Check if file should be skipped
      const skipReason = await this.shouldSkipFile(inputPath, options);
      if (skipReason) {
        result.skippedFiles++;
        result.skippedFilesList.push({ file: relativePath, reason: skipReason });
        console.log(`⏭ Skipped: ${relativePath} (${skipReason})`);
        return;
      }

      // Determine output path
      let outputPath = await this.determineOutputPath(inputPath, inputDir, outputDir, options);
      
      // Handle file renaming based on H1 content
      if (options.renameFiles) {
        const renamedPath = await this.generateFileNameFromH1(inputPath, outputPath, options);
        if (renamedPath !== outputPath) {
          // Track the filename mapping for cross-reference updates
          const oldRelativePath = relative(outputDir, outputPath);
          const newRelativePath = relative(outputDir, renamedPath);
          result.filenameMapping?.set(oldRelativePath, newRelativePath);
          outputPath = renamedPath;
        }
      }

      // Ensure output directory exists
      await mkdir(dirname(outputPath), { recursive: true });

      // Convert the document
      const conversionOptions: ConversionOptions = {
        ...options,
        format: options.format || 'asciidoc',
        inputType: 'html', // Standard file processing typically handles HTML files
        inputPath,
        outputPath
      };

      const conversionResult = await this.documentService.convertFile(
        inputPath,
        conversionOptions
      );

      // Write the converted content
      await writeFile(outputPath, conversionResult.content, 'utf-8');

      result.convertedFiles++;
      result.results.push({
        inputPath,
        outputPath,
        result: conversionResult
      });

      console.log(`✓ Converted: ${relativePath} → ${relative(outputDir, outputPath)}`);

    } catch (error) {
      result.errors.push({
        file: relative(inputDir, inputPath),
        error: error instanceof Error ? error.message : String(error)
      });
      console.error(`✗ Failed: ${relative(inputDir, inputPath)} - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a file should be skipped and return the reason
   */
  private async shouldSkipFile(filePath: string, options: BatchConversionOptions): Promise<string | null> {
    const fileName = basename(filePath);
    const fileExt = extname(filePath).slice(1).toLowerCase();

    // Skip unsupported file types
    if (!this.supportedExtensions.has(fileExt)) {
      return `Unsupported file type: ${fileExt}`;
    }

    // Skip files that match exclude patterns
    if (options.excludePatterns && options.excludePatterns.length > 0) {
      for (const pattern of options.excludePatterns) {
        if (fileName.includes(pattern) || filePath.includes(pattern)) {
          return `Matches exclude pattern: ${pattern}`;
        }
      }
    }

    // Skip if doesn't match include patterns (when specified)
    if (options.includePatterns && options.includePatterns.length > 0) {
      const matches = options.includePatterns.some(pattern => 
        fileName.includes(pattern) || filePath.includes(pattern)
      );
      if (!matches) {
        return 'Does not match include patterns';
      }
    }

    // Check for MadCap conditional content that should be excluded
    try {
      const content = await readFile(filePath, 'utf-8');
      const excludeReason = this.checkMadCapConditions(content);
      if (excludeReason) {
        return excludeReason;
      }
    } catch (error) {
      return `Failed to read file: ${error instanceof Error ? error.message : String(error)}`;
    }

    return null;
  }

  /**
   * Check MadCap conditions and determine if file should be excluded
   */
  private checkMadCapConditions(content: string): string | null {
    // Define conditions that should exclude entire files
    const excludeConditions = [
      'deprecated', 'obsolete', 'legacy', 'old',
      'hidden', 'internal', 'private', 'draft',
      'print-only', 'printonly', 'print only',
      'cancelled', 'canceled', 'abandoned', 'shelved',
      'paused', 'halted', 'stopped', 'discontinued', 'retired',
      'Black', 'Red', 'Gray', 'Grey'
    ];

    // Check for MadCap conditions using various patterns
    const conditionPatterns = [
      /data-mc-conditions="([^"]+)"/gi,
      /MadCap:conditionalText[^>]+conditions="([^"]+)"/gi,
      /<html[^>]+data-mc-conditions="([^"]+)"/gi
    ];

    for (const pattern of conditionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const conditions = match[1].toLowerCase();
        
        for (const excludeCondition of excludeConditions) {
          if (conditions.includes(excludeCondition.toLowerCase())) {
            return `Contains excluded MadCap condition: ${excludeCondition}`;
          }
        }
      }
    }

    return null;
  }

  /**
   * Determine the output path for a file
   */
  private async determineOutputPath(
    inputPath: string,
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions
  ): Promise<string> {
    const relativePath = relative(inputDir, inputPath);
    const parsedPath = {
      dir: dirname(relativePath),
      name: basename(relativePath, extname(relativePath)),
      ext: extname(relativePath)
    };

    // Determine the output extension based on format
    const outputExt = this.getExtensionForFormat(options.format || 'asciidoc');

    let outputPath: string;

    if (options.preserveStructure) {
      // Preserve directory structure
      outputPath = join(outputDir, parsedPath.dir, `${parsedPath.name}.${outputExt}`);
    } else {
      // Flatten structure
      const flatName = relativePath.replace(/[/\\]/g, '_').replace(/\.[^.]+$/, '');
      outputPath = join(outputDir, `${flatName}.${outputExt}`);
    }

    return outputPath;
  }

  /**
   * Generate filename from H1 heading in the document
   */
  private async generateFileNameFromH1(
    inputPath: string,
    originalOutputPath: string,
    options: BatchConversionOptions
  ): Promise<string> {
    try {
      const content = await readFile(inputPath, 'utf-8');
      const h1Text = this.extractH1Text(content);
      
      if (h1Text) {
        const sanitizedName = this.sanitizeFilename(h1Text);
        const outputDir = dirname(originalOutputPath);
        const outputExt = extname(originalOutputPath);
        return join(outputDir, `${sanitizedName}${outputExt}`);
      }
    } catch (error) {
      console.warn(`Failed to extract H1 from ${inputPath}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return originalOutputPath;
  }

  /**
   * Extract H1 text from HTML content
   */
  private extractH1Text(content: string): string | null {
    try {
      const dom = new JSDOM(content);
      const h1 = dom.window.document.querySelector('h1');
      if (h1) {
        return h1.textContent?.trim() || null;
      }

      // Try to find MadCap-style title
      const titleElement = dom.window.document.querySelector('[data-mc-generated="True"]');
      if (titleElement) {
        return titleElement.textContent?.trim() || null;
      }

      // Look for title in head
      const title = dom.window.document.querySelector('title');
      if (title && title.textContent && title.textContent.trim().length > 0) {
        return title.textContent.trim();
      }

    } catch (error) {
      console.warn(`Failed to parse HTML for H1 extraction: ${error instanceof Error ? error.message : String(error)}`);
    }

    return null;
  }

  /**
   * Sanitize filename to be filesystem-safe
   */
  private sanitizeFilename(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-')         // Replace spaces with hyphens
      .replace(/-+/g, '-')          // Collapse multiple hyphens
      .replace(/^-|-$/g, '')        // Remove leading/trailing hyphens
      .substring(0, 50);            // Limit length
  }

  /**
   * Get file extension for output format
   */
  private getExtensionForFormat(format: string): string {
    switch (format) {
      case 'asciidoc':
        return 'adoc';
      case 'writerside-markdown':
      case 'markdown':
        return 'md';
      case 'zendesk':
        return 'html';
      default:
        return 'txt';
    }
  }

  /**
   * Discover all convertible files in a directory
   */
  private async discoverFiles(
    dir: string,
    options: BatchConversionOptions
  ): Promise<string[]> {
    const files: string[] = [];

    const processDirectory = async (currentDir: string): Promise<void> => {
      const entries = await readdir(currentDir);
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          if (options.recursive) {
            await processDirectory(fullPath);
          }
        } else if (stats.isFile()) {
          const ext = extname(entry).slice(1).toLowerCase();
          if (this.supportedExtensions.has(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    await processDirectory(dir);
    return files.sort();
  }

  /**
   * Copy image files from input to output directory
   */
  private async copyImages(
    inputDir: string,
    outputDir: string,
    options: BatchConversionOptions
  ): Promise<void> {
    console.log('Copying images...');

    const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp']);
    const imageFiles: string[] = [];

    const findImages = async (dir: string): Promise<void> => {
      const entries = await readdir(dir);
      
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          if (options.recursive) {
            await findImages(fullPath);
          }
        } else if (stats.isFile()) {
          const ext = extname(entry).slice(1).toLowerCase();
          if (imageExtensions.has(ext)) {
            imageFiles.push(fullPath);
          }
        }
      }
    };

    await findImages(inputDir);

    let copiedCount = 0;
    for (const imagePath of imageFiles) {
      try {
        const relativePath = relative(inputDir, imagePath);
        const outputPath = options.preserveStructure
          ? join(outputDir, relativePath)
          : join(outputDir, 'images', basename(imagePath));

        await mkdir(dirname(outputPath), { recursive: true });
        await copyFile(imagePath, outputPath);
        copiedCount++;
      } catch (error) {
        console.warn(`Failed to copy image ${imagePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log(`Copied ${copiedCount} image files`);
  }

  /**
   * Update cross-references in converted files when filenames have changed
   */
  private async updateCrossReferences(
    outputDir: string,
    filenameMapping: Map<string, string>,
    options: BatchConversionOptions
  ): Promise<void> {
    if (filenameMapping.size === 0) return;

    console.log('Updating cross-references...');

    const outputExtension = this.getExtensionForFormat(options.format || 'asciidoc');
    const outputFiles: string[] = [];

    const findOutputFiles = async (dir: string): Promise<void> => {
      const entries = await readdir(dir);
      
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          await findOutputFiles(fullPath);
        } else if (stats.isFile() && entry.endsWith(`.${outputExtension}`)) {
          outputFiles.push(fullPath);
        }
      }
    };

    await findOutputFiles(outputDir);

    let updatedCount = 0;
    for (const filePath of outputFiles) {
      try {
        let content = await readFile(filePath, 'utf-8');
        let hasChanges = false;

        // Update references based on format
        if (options.format === 'asciidoc') {
          content = this.updateAsciiDocReferences(content, filenameMapping, hasChanges);
        } else if (options.format === 'writerside-markdown') {
          content = this.updateMarkdownReferences(content, filenameMapping, hasChanges);
        }

        if (hasChanges) {
          await writeFile(filePath, content, 'utf-8');
          updatedCount++;
        }
      } catch (error) {
        console.warn(`Failed to update references in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log(`Updated cross-references in ${updatedCount} files`);
  }

  /**
   * Update AsciiDoc cross-references
   */
  private updateAsciiDocReferences(
    content: string,
    filenameMapping: Map<string, string>,
    hasChanges: boolean
  ): string {
    // Update xref and link references
    for (const [oldPath, newPath] of filenameMapping) {
      const oldPathWithoutExt = oldPath.replace(/\.[^.]+$/, '');
      const newPathWithoutExt = newPath.replace(/\.[^.]+$/, '');

      // Update xref references
      const xrefPattern = new RegExp(`xref:${oldPathWithoutExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      if (xrefPattern.test(content)) {
        content = content.replace(xrefPattern, `xref:${newPathWithoutExt}`);
        hasChanges = true;
      }

      // Update link references
      const linkPattern = new RegExp(`link:${oldPathWithoutExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      if (linkPattern.test(content)) {
        content = content.replace(linkPattern, `link:${newPathWithoutExt}`);
        hasChanges = true;
      }
    }

    return content;
  }

  /**
   * Update Markdown cross-references
   */
  private updateMarkdownReferences(
    content: string,
    filenameMapping: Map<string, string>,
    hasChanges: boolean
  ): string {
    // Update markdown link references
    for (const [oldPath, newPath] of filenameMapping) {
      // Update relative links
      const linkPattern = new RegExp(`\\]\\(${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
      if (linkPattern.test(content)) {
        content = content.replace(linkPattern, `](${newPath})`);
        hasChanges = true;
      }
    }

    return content;
  }

  /**
   * Analyze a directory and provide conversion statistics
   */
  async analyzeFolder(
    inputDir: string,
    options: BatchConversionOptions = {}
  ): Promise<{
    totalFiles: number;
    supportedFiles: number;
    unsupportedFiles: number;
    estimatedSize: number;
    fileTypes: Map<string, number>;
    issues: string[];
  }> {
    const files = await this.discoverFiles(inputDir, { ...options, recursive: true });
    const fileTypes = new Map<string, number>();
    const issues: string[] = [];
    let supportedFiles = 0;
    let estimatedSize = 0;

    for (const file of files) {
      try {
        const ext = extname(file).slice(1).toLowerCase();
        fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);

        if (this.supportedExtensions.has(ext)) {
          supportedFiles++;
          const stats = await stat(file);
          estimatedSize += stats.size;
        }

        // Check for potential issues
        const skipReason = await this.shouldSkipFile(file, options);
        if (skipReason) {
          issues.push(`${relative(inputDir, file)}: ${skipReason}`);
        }
      } catch (error) {
        issues.push(`${relative(inputDir, file)}: Failed to analyze - ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      totalFiles: files.length,
      supportedFiles,
      unsupportedFiles: files.length - supportedFiles,
      estimatedSize,
      fileTypes,
      issues
    };
  }
}
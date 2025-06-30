import { promises as fs } from 'fs';
import { join, resolve, dirname, extname, basename } from 'path';
import { errorHandler } from './error-handler.js';

export interface LinkValidationResult {
  isValid: boolean;
  path: string;
  resolvedPath?: string;
  error?: string;
  linkType: 'internal' | 'external' | 'anchor' | 'image' | 'unknown';
}

export interface ValidationReport {
  totalLinks: number;
  validLinks: number;
  brokenLinks: number;
  warnings: number;
  results: LinkValidationResult[];
  summary: {
    internal: { valid: number; broken: number };
    external: { valid: number; broken: number };
    images: { valid: number; broken: number };
    anchors: { valid: number; broken: number };
  };
}

export class LinkValidator {
  private baseDir: string;
  private outputFormat: string;
  private fileExtensionMap: Map<string, string> = new Map();

  constructor(baseDir: string, outputFormat: 'markdown' | 'asciidoc' | 'enhanced-asciidoc' | 'optimized-asciidoc' | 'zendesk' | 'pandoc-asciidoc' | 'pandoc-markdown' | 'enhanced-markdown' | 'madcap-markdown' | 'writerside-markdown' = 'markdown') {
    this.baseDir = resolve(baseDir);
    this.outputFormat = outputFormat;
    
    // Set up file extension mapping based on output format
    this.setupExtensionMap();
  }

  /**
   * Validate all links in converted files
   */
  async validateDirectory(outputDir: string): Promise<ValidationReport> {
    const results: LinkValidationResult[] = [];
    const files = await this.findConvertedFiles(outputDir);

    console.log(`🔍 Validating links in ${files.length} files...`);

    for (const file of files) {
      try {
        const fileResults = await this.validateFile(file);
        results.push(...fileResults);
      } catch (error) {
        console.error(`Failed to validate links in ${file}:`, error);
        results.push({
          isValid: false,
          path: file,
          error: `Failed to read file: ${(error as Error).message}`,
          linkType: 'unknown'
        });
      }
    }

    return this.generateReport(results);
  }

  /**
   * Validate links in a single file
   */
  async validateFile(filePath: string): Promise<LinkValidationResult[]> {
    const content = await errorHandler.safeReadFile(filePath);
    const links = this.extractLinks(content, filePath);
    const results: LinkValidationResult[] = [];

    for (const link of links) {
      const result = await this.validateLink(link, filePath);
      results.push(result);
    }

    return results;
  }

  /**
   * Extract links from file content based on format
   */
  private extractLinks(content: string, filePath: string): { url: string; text?: string; line?: number }[] {
    const links: { url: string; text?: string; line?: number }[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      
      if (this.outputFormat === 'markdown') {
        // Markdown links: [text](url) and ![alt](image)
        const markdownLinks = line.matchAll(/!?\[([^\]]*)\]\(([^)]+)\)/g);
        for (const match of markdownLinks) {
          links.push({
            url: match[2],
            text: match[1],
            line: lineNum
          });
        }
        
        // Reference-style links: [text]: url
        const refLinks = line.matchAll(/^\s*\[([^\]]+)\]:\s*(.+)$/g);
        for (const match of refLinks) {
          links.push({
            url: match[2],
            text: match[1],
            line: lineNum
          });
        }
      } else if (this.outputFormat === 'asciidoc') {
        // AsciiDoc links: link:url[text], xref:file[text], image::path[alt]
        const asciidocLinks = line.matchAll(/(link|xref|image::?):\s*([^\[\s]+)(?:\[([^\]]*)\])?/g);
        for (const match of asciidocLinks) {
          links.push({
            url: match[2],
            text: match[3],
            line: lineNum
          });
        }
        
        // Include directives: include::file.adoc[]
        const includes = line.matchAll(/include::([^\[\s]+)(?:\[[^\]]*\])?/g);
        for (const match of includes) {
          links.push({
            url: match[1],
            text: 'include',
            line: lineNum
          });
        }
      } else if (this.outputFormat === 'zendesk') {
        // HTML links: <a href="url">text</a>
        const htmlLinks = line.matchAll(/<a\s+(?:[^>]*\s+)?href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/g);
        for (const match of htmlLinks) {
          links.push({
            url: match[1],
            text: match[2],
            line: lineNum
          });
        }
        
        // Images: <img src="url" alt="text">
        const htmlImages = line.matchAll(/<img\s+(?:[^>]*\s+)?src=["']([^"']+)["'](?:[^>]*\s+alt=["']([^"']*)["'])?[^>]*>/g);
        for (const match of htmlImages) {
          links.push({
            url: match[1],
            text: match[2] || 'image',
            line: lineNum
          });
        }
      }
    });

    return links;
  }

  /**
   * Validate a single link
   */
  private async validateLink(link: { url: string; text?: string; line?: number }, sourceFile: string): Promise<LinkValidationResult> {
    const url = link.url.trim();
    
    // Determine link type
    const linkType = this.determineLinkType(url);
    
    const result: LinkValidationResult = {
      isValid: false,
      path: `${sourceFile}:${link.line || 0} -> ${url}`,
      linkType,
      resolvedPath: undefined
    };

    try {
      if (linkType === 'external') {
        // For external links, just check if they look valid
        result.isValid = this.isValidExternalUrl(url);
        if (!result.isValid) {
          result.error = 'Invalid external URL format';
        }
      } else if (linkType === 'anchor') {
        // Anchor links (#section) - these are always valid in the context of the same document
        result.isValid = true;
      } else if (linkType === 'internal' || linkType === 'image') {
        // Internal file links and images
        const resolvedPath = await this.resolveInternalPath(url, sourceFile);
        result.resolvedPath = resolvedPath || undefined;
        
        if (resolvedPath) {
          const exists = await errorHandler.fileExists(resolvedPath);
          result.isValid = exists;
          if (!exists) {
            result.error = `File not found: ${resolvedPath}`;
          }
        } else {
          result.error = 'Could not resolve relative path';
        }
      } else {
        result.error = 'Unknown link type';
      }
    } catch (error) {
      result.error = `Validation error: ${(error as Error).message}`;
    }

    return result;
  }

  /**
   * Determine the type of link
   */
  private determineLinkType(url: string): 'internal' | 'external' | 'anchor' | 'image' | 'unknown' {
    if (url.startsWith('#')) {
      return 'anchor';
    }
    
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('ftp://') || url.startsWith('mailto:')) {
      return 'external';
    }
    
    // Check if it's an image based on extension
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];
    const ext = extname(url.split('#')[0]).toLowerCase();
    if (imageExtensions.includes(ext)) {
      return 'image';
    }
    
    // Check if it's an internal document
    const docExtensions = ['.md', '.adoc', '.html', '.htm'];
    if (docExtensions.includes(ext) || !ext) {
      return 'internal';
    }
    
    return 'unknown';
  }

  /**
   * Check if external URL has valid format
   */
  private isValidExternalUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve internal file path relative to source file
   */
  private async resolveInternalPath(url: string, sourceFile: string): Promise<string | null> {
    try {
      // Remove anchor fragment if present
      const pathPart = url.split('#')[0];
      
      if (!pathPart) {
        return null; // Just an anchor
      }
      
      // Resolve relative to source file directory
      const sourceDir = dirname(sourceFile);
      let resolvedPath = resolve(sourceDir, pathPart);
      
      // Check if the file exists as-is
      if (await errorHandler.fileExists(resolvedPath)) {
        return resolvedPath;
      }
      
      // Try with converted extension if needed
      const originalExt = extname(pathPart);
      const convertedExt = this.fileExtensionMap.get(originalExt);
      
      if (convertedExt && convertedExt !== originalExt) {
        const convertedPath = resolvedPath.replace(new RegExp(`\\${originalExt}$`), convertedExt);
        if (await errorHandler.fileExists(convertedPath)) {
          return convertedPath;
        }
      }
      
      // Try common variations
      const variations = [
        resolvedPath + '.md',
        resolvedPath + '.adoc',
        resolvedPath + '.html',
        resolvedPath.replace(/\.html?$/, this.getDefaultExtension()),
        resolvedPath.replace(/\.htm?$/, this.getDefaultExtension())
      ];
      
      for (const variation of variations) {
        if (await errorHandler.fileExists(variation)) {
          return variation;
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`Error resolving path ${url} from ${sourceFile}:`, error);
      return null;
    }
  }

  /**
   * Find all converted files in directory
   */
  private async findConvertedFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const extension = this.getDefaultExtension();
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.findConvertedFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith(extension)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Could not read directory ${dir}:`, error);
    }
    
    return files;
  }

  /**
   * Set up file extension mapping based on output format
   */
  private setupExtensionMap(): void {
    const targetExt = this.getDefaultExtension();
    
    // Map common source extensions to target extension
    this.fileExtensionMap.set('.htm', targetExt);
    this.fileExtensionMap.set('.html', targetExt);
    
    if (this.outputFormat === 'markdown' || this.outputFormat === 'pandoc-markdown' || this.outputFormat === 'enhanced-markdown' || this.outputFormat === 'madcap-markdown' || this.outputFormat === 'writerside-markdown') {
      this.fileExtensionMap.set('.adoc', '.md');
    } else if (this.outputFormat === 'asciidoc' || this.outputFormat === 'enhanced-asciidoc' || this.outputFormat === 'optimized-asciidoc' || this.outputFormat === 'pandoc-asciidoc') {
      this.fileExtensionMap.set('.md', '.adoc');
    } else if (this.outputFormat === 'zendesk') {
      this.fileExtensionMap.set('.md', '.html');
      this.fileExtensionMap.set('.adoc', '.html');
    }
  }

  /**
   * Get default file extension for output format
   */
  private getDefaultExtension(): string {
    switch (this.outputFormat) {
      case 'markdown':
      case 'pandoc-markdown':
      case 'enhanced-markdown':
      case 'madcap-markdown':
      case 'writerside-markdown':
        return '.md';
      case 'asciidoc':
      case 'enhanced-asciidoc':
      case 'optimized-asciidoc':
      case 'pandoc-asciidoc':
        return '.adoc';
      case 'zendesk':
        return '.html';
      default:
        return '.md';
    }
  }

  /**
   * Generate validation report
   */
  private generateReport(results: LinkValidationResult[]): ValidationReport {
    const summary = {
      internal: { valid: 0, broken: 0 },
      external: { valid: 0, broken: 0 },
      images: { valid: 0, broken: 0 },
      anchors: { valid: 0, broken: 0 }
    };

    let validLinks = 0;
    let brokenLinks = 0;

    results.forEach(result => {
      if (result.isValid) {
        validLinks++;
      } else {
        brokenLinks++;
      }

      const category = result.linkType === 'image' ? 'images' : 
                     result.linkType === 'anchor' ? 'anchors' :
                     result.linkType === 'external' ? 'external' : 'internal';

      if (result.isValid) {
        summary[category].valid++;
      } else {
        summary[category].broken++;
      }
    });

    return {
      totalLinks: results.length,
      validLinks,
      brokenLinks,
      warnings: results.filter(r => !r.isValid && r.linkType === 'external').length,
      results,
      summary
    };
  }

  /**
   * Format validation report for display
   */
  static formatReport(report: ValidationReport): string {
    const { totalLinks, validLinks, brokenLinks, summary } = report;
    
    let output = `🔗 Link Validation Report\n`;
    output += `========================\n\n`;
    output += `📊 Summary:\n`;
    output += `- Total links: ${totalLinks}\n`;
    output += `- Valid links: ${validLinks} (${totalLinks > 0 ? Math.round((validLinks / totalLinks) * 100) : 0}%)\n`;
    output += `- Broken links: ${brokenLinks}\n\n`;
    
    output += `📋 By Type:\n`;
    output += `- Internal: ${summary.internal.valid} valid, ${summary.internal.broken} broken\n`;
    output += `- External: ${summary.external.valid} valid, ${summary.external.broken} broken\n`;
    output += `- Images: ${summary.images.valid} valid, ${summary.images.broken} broken\n`;
    output += `- Anchors: ${summary.anchors.valid} valid, ${summary.anchors.broken} broken\n\n`;

    if (brokenLinks > 0) {
      output += `❌ Broken Links:\n`;
      const brokenLinksList = report.results
        .filter(r => !r.isValid)
        .slice(0, 20) // Show first 20 broken links
        .map(r => `  - ${r.path}: ${r.error || 'Unknown error'}`)
        .join('\n');
      
      output += brokenLinksList;
      
      if (brokenLinks > 20) {
        output += `\n  ... and ${brokenLinks - 20} more broken links`;
      }
    } else {
      output += `✅ All links are valid!`;
    }

    return output;
  }
}
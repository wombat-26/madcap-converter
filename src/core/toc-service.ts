import { readFile } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { JSDOM } from 'jsdom';

export interface TocEntry {
  title: string;
  href?: string;
  linkedTitle?: boolean; // [%=System.LinkedTitle%]
  children: TocEntry[];
  level: number;
}

export interface TocStructure {
  title: string;
  entries: TocEntry[];
  filePath: string;
}

export interface TOCBasedConversionPlan {
  folderStructure: Array<{ path: string; type: 'folder' | 'file' }>;
  conversionEntries: Array<{ inputPath: string; outputPath: string; tocEntry: TocEntry }>;
  fileMapping: Map<string, string>; // Maps old relative paths to new relative paths
}

export interface BookOptions {
  bookTitle?: string;
  bookAuthor?: string;
  includeTOCLevels?: number;
  useBookDoctype?: boolean;
  includeChapterBreaks?: boolean;
  includeVariablesFile?: boolean;
}

export class TocService {
  /**
   * Parse a MadCap Flare TOC (.fltoc) file
   */
  async parseFlareToc(tocPath: string, contentBasePath: string): Promise<TocStructure> {
    try {
      const tocContent = await readFile(tocPath, 'utf-8');
      const dom = new JSDOM(tocContent, { contentType: 'text/xml' });
      const doc = dom.window.document;
      
      // Get the root TOC book element
      const bookElement = doc.querySelector('CatapultToc') || doc.querySelector('toc');
      if (!bookElement) {
        throw new Error(`No TOC root element found in ${tocPath}`);
      }
      
      // Extract title from the first TocEntry or use filename
      const firstEntry = bookElement.querySelector('TocEntry');
      const title = firstEntry?.getAttribute('Title') || 
                   firstEntry?.getAttribute('title') || 
                   basename(tocPath, '.fltoc');
      
      // Parse all TOC entries
      const entries = this.parseTocEntries(bookElement, contentBasePath, 0);
      
      return {
        title,
        entries,
        filePath: tocPath
      };
    } catch (error) {
      throw new Error(`Failed to parse TOC file ${tocPath}: ${error}`);
    }
  }

  /**
   * Parse TOC entries recursively
   */
  private parseTocEntries(element: Element, contentBasePath: string, level: number): TocEntry[] {
    const entries: TocEntry[] = [];
    const tocEntries = element.querySelectorAll(':scope > TocEntry');
    
    for (const entry of tocEntries) {
      const title = entry.getAttribute('Title') || entry.getAttribute('title') || 'Untitled';
      const href = entry.getAttribute('Link') || entry.getAttribute('href') || undefined;
      const linkedTitle = title === '[%=System.LinkedTitle%]';
      
      // Parse children recursively
      const children = this.parseTocEntries(entry, contentBasePath, level + 1);
      
      entries.push({
        title,
        href,
        linkedTitle,
        children,
        level
      });
    }
    
    return entries;
  }

  /**
   * Create a TOC-based conversion plan
   */
  async createTOCBasedPlan(
    tocStructures: TocStructure[], 
    format: 'asciidoc' | 'writerside-markdown' | 'zendesk'
  ): Promise<TOCBasedConversionPlan> {
    const folderStructure: Array<{ path: string; type: 'folder' | 'file' }> = [];
    const conversionEntries: Array<{ inputPath: string; outputPath: string; tocEntry: TocEntry }> = [];
    const fileMapping = new Map<string, string>();

    // Get file extension for format
    const ext = this.getExtensionForFormat(format);
    
    for (const tocStructure of tocStructures) {
      // Create a folder for each TOC
      const tocFolderName = this.sanitizeFolderName(tocStructure.title);
      folderStructure.push({ path: tocFolderName, type: 'folder' });
      
      // Process entries recursively
      this.planTocEntries(
        tocStructure.entries,
        tocFolderName,
        ext,
        folderStructure,
        conversionEntries,
        fileMapping
      );
    }

    return {
      folderStructure,
      conversionEntries,
      fileMapping
    };
  }

  /**
   * Plan TOC entries recursively
   */
  private planTocEntries(
    entries: TocEntry[],
    basePath: string,
    ext: string,
    folderStructure: Array<{ path: string; type: 'folder' | 'file' }>,
    conversionEntries: Array<{ inputPath: string; outputPath: string; tocEntry: TocEntry }>,
    fileMapping: Map<string, string>
  ): void {
    for (const entry of entries) {
      if (entry.href) {
        // This is a file entry
        const inputPath = entry.href;
        const fileName = basename(entry.href, extname(entry.href));
        const outputPath = join(basePath, `${fileName}${ext}`);
        
        conversionEntries.push({
          inputPath,
          outputPath,
          tocEntry: entry
        });
        
        fileMapping.set(inputPath, outputPath);
      }
      
      if (entry.children.length > 0) {
        // Create subfolder for children if needed
        let childBasePath = basePath;
        if (!entry.href) {
          // This is a folder entry
          const subFolderName = this.sanitizeFolderName(entry.title);
          childBasePath = join(basePath, subFolderName);
          folderStructure.push({ path: childBasePath, type: 'folder' });
        }
        
        // Process children
        this.planTocEntries(
          entry.children,
          childBasePath,
          ext,
          folderStructure,
          conversionEntries,
          fileMapping
        );
      }
    }
  }

  /**
   * Resolve LinkedTitle entries by reading actual file content
   */
  async resolveLinkedTitles(tocStructure: TocStructure, contentBasePath: string): Promise<TocStructure> {
    const resolvedEntries = await this.resolveEntriesLinkedTitles(tocStructure.entries, contentBasePath);
    
    return {
      ...tocStructure,
      entries: resolvedEntries
    };
  }

  /**
   * Resolve LinkedTitle entries recursively
   */
  private async resolveEntriesLinkedTitles(entries: TocEntry[], contentBasePath: string): Promise<TocEntry[]> {
    const resolved: TocEntry[] = [];
    
    for (const entry of entries) {
      let resolvedEntry = { ...entry };
      
      // If this is a LinkedTitle entry, resolve it
      if (entry.linkedTitle && entry.href) {
        try {
          const filePath = join(contentBasePath, entry.href);
          const title = await this.extractTitleFromFile(filePath);
          resolvedEntry.title = title;
          resolvedEntry.linkedTitle = false;
        } catch (error) {
          console.warn(`Failed to resolve LinkedTitle for ${entry.href}: ${error}`);
          // Keep original title as fallback
        }
      }
      
      // Resolve children recursively
      if (entry.children.length > 0) {
        resolvedEntry.children = await this.resolveEntriesLinkedTitles(entry.children, contentBasePath);
      }
      
      resolved.push(resolvedEntry);
    }
    
    return resolved;
  }

  /**
   * Extract title (H1) from HTML file
   */
  private async extractTitleFromFile(filePath: string): Promise<string> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const dom = new JSDOM(content);
      const doc = dom.window.document;
      
      // Look for H1 element
      const h1 = doc.querySelector('h1');
      if (h1) {
        return h1.textContent?.trim() || 'Untitled';
      }
      
      // Fallback to title element
      const title = doc.querySelector('title');
      if (title) {
        return title.textContent?.trim() || 'Untitled';
      }
      
      // Last resort: use filename
      return basename(filePath, extname(filePath));
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  /**
   * Generate master AsciiDoc document from TOC structure
   */
  generateMasterAdoc(
    tocStructure: TocStructure, 
    format: 'adoc' | 'markdown', 
    options: BookOptions
  ): { content: string; metadata: { format: string } } {
    const lines: string[] = [];
    
    // Document header
    const title = options.bookTitle || tocStructure.title;
    lines.push(`= ${title}`);
    
    if (options.bookAuthor) {
      lines.push(options.bookAuthor);
    }
    
    // Document attributes
    if (options.useBookDoctype !== false) {
      lines.push(':doctype: book');
    }
    lines.push(':toc: left');
    lines.push(`:toclevels: ${options.includeTOCLevels || 3}`);
    lines.push(':sectnums:');
    lines.push(':sectlinks:');
    lines.push(':icons: font');
    lines.push(':experimental:');
    
    if (options.useBookDoctype !== false) {
      lines.push(':partnums:');
      lines.push(':chapter-signifier: Chapter');
      lines.push(':appendix-caption: Appendix');
    }
    
    lines.push('');
    
    // Include variables file if requested
    if (options.includeVariablesFile) {
      lines.push('include::variables.adoc[]');
      lines.push('');
    }
    
    // Generate includes for TOC entries
    this.generateTocIncludes(tocStructure.entries, lines, format, options);
    
    return {
      content: lines.join('\n'),
      metadata: { format: 'asciidoc' }
    };
  }

  /**
   * Generate include directives for TOC entries
   */
  private generateTocIncludes(
    entries: TocEntry[], 
    lines: string[], 
    format: 'adoc' | 'markdown',
    options: BookOptions,
    level: number = 1
  ): void {
    for (const entry of entries) {
      if (entry.href) {
        // File entry - add include
        const fileName = basename(entry.href, extname(entry.href));
        const includeExt = format === 'adoc' ? '.adoc' : '.md';
        
        // Add chapter break for top-level entries in book mode
        if (level === 1 && options.includeChapterBreaks && options.useBookDoctype) {
          lines.push('[chapter]');
        }
        
        // Add section heading based on level
        const headingLevel = '='.repeat(Math.min(level + 1, 6));
        lines.push(`${headingLevel} ${entry.title}`);
        lines.push('');
        
        lines.push(`include::${fileName}${includeExt}[]`);
        lines.push('');
      } else if (entry.children.length > 0) {
        // Section with children - add heading
        const headingLevel = '='.repeat(Math.min(level + 1, 6));
        lines.push(`${headingLevel} ${entry.title}`);
        lines.push('');
      }
      
      // Process children recursively
      if (entry.children.length > 0) {
        this.generateTocIncludes(entry.children, lines, format, options, level + 1);
      }
    }
  }

  /**
   * Get file extension for format
   */
  private getExtensionForFormat(format: 'asciidoc' | 'writerside-markdown' | 'zendesk'): string {
    switch (format) {
      case 'asciidoc':
        return '.adoc';
      case 'writerside-markdown':
        return '.md';
      case 'zendesk':
        return '.html';
      default:
        return '.adoc';
    }
  }

  /**
   * Sanitize folder name for file system
   */
  private sanitizeFolderName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid characters
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .replace(/-+/g, '-') // Collapse multiple dashes
      .replace(/^-|-$/g, '') // Remove leading/trailing dashes
      .toLowerCase();
  }
}
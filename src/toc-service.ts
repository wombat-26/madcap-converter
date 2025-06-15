import { readFile } from 'fs/promises';
import { JSDOM } from 'jsdom';
import { resolve, relative, dirname, basename, extname } from 'path';

export interface TocEntry {
  title: string;
  link?: string;
  level: number;
  children: TocEntry[];
  originalPath?: string; // Original file path from Content directory
  targetPath?: string;   // Target path in output structure
}

export interface TocStructure {
  title: string;
  entries: TocEntry[];
  pathMapping?: Map<string, string>; // Maps original paths to TOC-based paths
}

export interface TOCBasedConversionPlan {
  tocStructures: TocStructure[];
  fileMapping: Map<string, string>; // Original file path -> TOC-based target path
  folderStructure: string[]; // All folders that need to be created
}

export class TocService {
  async parseFlareToc(fltocPath: string, contentBasePath: string): Promise<TocStructure> {
    const tocContent = await readFile(fltocPath, 'utf8');
    const dom = new JSDOM(tocContent, { contentType: 'application/xml' });
    const document = dom.window.document;
    
    const tocTitle = this.extractTocTitle(fltocPath);
    const entries: TocEntry[] = [];
    
    // Parse top-level TocEntry elements
    const topLevelEntries = document.querySelectorAll('CatapultToc > TocEntry');
    topLevelEntries.forEach(entry => {
      const tocEntry = this.parseTocEntry(entry, 0, contentBasePath);
      if (tocEntry) {
        entries.push(tocEntry);
      }
    });
    
    return {
      title: tocTitle,
      entries
    };
  }
  
  private parseTocEntry(element: Element, level: number, contentBasePath: string): TocEntry | null {
    const title = element.getAttribute('Title') || '';
    const link = element.getAttribute('Link') || '';
    
    // Resolve the actual file path
    const resolvedLink = this.resolveContentPath(link, contentBasePath);
    
    const children: TocEntry[] = [];
    
    // Parse nested TocEntry elements
    const childEntries = element.querySelectorAll(':scope > TocEntry');
    childEntries.forEach(childEntry => {
      const child = this.parseTocEntry(childEntry, level + 1, contentBasePath);
      if (child) {
        children.push(child);
      }
    });
    
    return {
      title: this.resolveTitle(title),
      link: resolvedLink,
      level,
      children,
      originalPath: resolvedLink, // Store original path for mapping
      targetPath: undefined // Will be set during structure generation
    };
  }
  
  private extractTocTitle(fltocPath: string): string {
    const fileName = basename(fltocPath, '.fltoc');
    return fileName.replace(/^(Online|PDF)\s*/, '').trim();
  }
  
  private resolveTitle(title: string): string {
    // Handle MadCap system variables in titles
    if (title === '[%=System.LinkedTitle%]' || title === '[%=System.LinkedHeader%]') {
      return 'Auto-Generated Title'; // Will be resolved from actual content during TOC processing
    }
    
    // Clean up titles that might contain full sentences or unwanted content
    let cleanTitle = title.trim();
    
    // If title is too long (likely a sentence), truncate it or extract key part
    if (cleanTitle.length > 80) {
      // Try to extract first meaningful phrase before punctuation
      const firstSentence = cleanTitle.split(/[.!?]/)[0];
      if (firstSentence.length < 80) {
        cleanTitle = firstSentence;
      } else {
        // Take first 80 characters and cut at word boundary
        cleanTitle = cleanTitle.substring(0, 80);
        const lastSpace = cleanTitle.lastIndexOf(' ');
        if (lastSpace > 40) {
          cleanTitle = cleanTitle.substring(0, lastSpace);
        }
        cleanTitle += '...';
      }
    }
    
    // Remove HTML tags if any leaked through
    cleanTitle = cleanTitle.replace(/<[^>]*>/g, '');
    
    // Clean up extra whitespace
    cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();
    
    return cleanTitle;
  }

  /**
   * Resolve title from actual file content when it's Auto-Generated Title
   */
  private async resolveTitleFromContent(entry: TocEntry, contentBasePath: string): Promise<string> {
    if (entry.title !== 'Auto-Generated Title' || !entry.link) {
      return entry.title;
    }

    try {
      // Build full path to the source file
      const cleanLink = entry.link.replace(/^\/+/, '');
      const fullPath = resolve(contentBasePath, cleanLink);
      
      // Read file content
      const content = await readFile(fullPath, 'utf8');
      
      // Extract H1 title using same logic as batch service
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
      
      // If no title found, use filename without extension
      const filename = basename(cleanLink, extname(cleanLink));
      return filename.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
    } catch (error) {
      // If file read fails, return original title or filename
      const filename = entry.link ? basename(entry.link, extname(entry.link)) : entry.title;
      return filename.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  /**
   * Resolve all LinkedTitle entries in a TOC structure by reading actual file content
   */
  async resolveLinkedTitles(tocStructure: TocStructure, contentBasePath: string): Promise<TocStructure> {
    const resolveEntryTitles = async (entry: TocEntry): Promise<TocEntry> => {
      const resolvedTitle = await this.resolveTitleFromContent(entry, contentBasePath);
      
      // Recursively resolve children
      const resolvedChildren = await Promise.all(
        entry.children.map(child => resolveEntryTitles(child))
      );
      
      return {
        ...entry,
        title: resolvedTitle,
        children: resolvedChildren
      };
    };

    const resolvedEntries = await Promise.all(
      tocStructure.entries.map(entry => resolveEntryTitles(entry))
    );

    return {
      ...tocStructure,
      entries: resolvedEntries
    };
  }
  
  private resolveContentPath(link: string, contentBasePath: string): string | undefined {
    if (!link) return undefined;
    
    // Remove leading slash and resolve relative to content base
    const cleanLink = link.replace(/^\/+/, '');
    
    // Return the relative path for file mapping - this will be resolved later in batch service
    // The batch service will handle the actual file existence checking
    return cleanLink;
  }
  
  generateMasterAdoc(tocStructure: TocStructure, outputFormat: 'adoc' | 'md' = 'adoc', bookOptions?: {
    bookTitle?: string;
    bookAuthor?: string;
    includeTOCLevels?: number;
    useBookDoctype?: boolean;
    includeChapterBreaks?: boolean;
    includeVariablesFile?: boolean;
  }): string {
    const extension = outputFormat === 'adoc' ? '.adoc' : '.md';
    const title = bookOptions?.bookTitle || tocStructure.title;
    const tocLevels = bookOptions?.includeTOCLevels || 3;
    const useBookDoctype = bookOptions?.useBookDoctype !== false; // Default true
    
    let content = `= ${title}\n`;
    
    // Add author if provided
    if (bookOptions?.bookAuthor) {
      content += `${bookOptions.bookAuthor}\n`;
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
    
    // Include variables file if it will be generated
    if (bookOptions?.includeVariablesFile) {
      content += `// Include variables file\n`;
      content += `include::variables.adoc[]\n\n`;
    }
    
    // Generate structured includes with sections
    tocStructure.entries.forEach(entry => {
      content += this.generateStructuredSection(entry, extension, 1, bookOptions?.includeChapterBreaks);
    });
    
    return content;
  }
  
  private generateStructuredSection(entry: TocEntry, extension: string, level: number, includeChapterBreaks?: boolean): string {
    let content = '';
    
    // Determine if we should create a section header
    const hasChildren = entry.children.length > 0;
    const hasRealTitle = entry.title !== 'Auto-Generated Title';
    const isValidSectionTitle = hasRealTitle && entry.title.length <= 100 && !entry.title.includes('.');
    
    // Add chapter break for top-level sections if enabled
    if (includeChapterBreaks && level === 1 && hasChildren) {
      content += `[chapter]\n`;
    }
    const shouldCreateSection = hasChildren && isValidSectionTitle;
    
    if (shouldCreateSection) {
      // Create section header based on level
      const headerLevel = '='.repeat(Math.min(level + 1, 6)); // AsciiDoc supports up to 6 levels
      content += `${headerLevel} ${entry.title}\n\n`;
    }
    
    // Add include for this entry if it has a link (exclude variables.adoc files)
    if (entry.link) {
      // Use targetPath if available (from TOC-based conversion), otherwise convert path
      const includePath = entry.targetPath 
        ? entry.targetPath 
        : this.convertPathToOutput(entry.link, extension);
      
      // Skip variables.adoc files - they shouldn't appear as sections in the book
      if (!includePath.endsWith('variables.adoc')) {
        content += `include::${includePath}[]\n\n`;
      }
    }
    
    // Process children with proper nesting
    if (hasChildren) {
      entry.children.forEach(child => {
        // For children under a section, maintain proper hierarchy
        const childLevel = shouldCreateSection ? level + 1 : level;
        content += this.generateStructuredSection(child, extension, childLevel, includeChapterBreaks);
      });
    }
    
    return content;
  }
  
  private generateIncludeSection(entry: TocEntry, extension: string): string {
    let content = '';
    
    // Add include for this entry if it has a link
    if (entry.link) {
      const includePath = this.convertPathToOutput(entry.link, extension);
      const comment = entry.title !== 'Auto-Generated Title' ? ` // ${entry.title}` : '';
      content += `include::${includePath}[]${comment}\n\n`;
    }
    
    // Add includes for children
    entry.children.forEach(child => {
      content += this.generateIncludeSection(child, extension);
    });
    
    return content;
  }
  
  private convertPathToOutput(contentPath: string, extension: string): string {
    // Convert Content/path/file.htm to path/file.adoc
    let outputPath = contentPath;
    
    // Remove 'Content/' prefix if present
    outputPath = outputPath.replace(/^Content\//, '');
    
    // Change extension
    outputPath = outputPath.replace(/\.(htm|html)$/, extension);
    
    return outputPath;
  }
  
  async generateTocReport(fltocPath: string, contentBasePath: string): Promise<string> {
    const tocStructure = await this.parseFlareToc(fltocPath, contentBasePath);
    
    let report = `# TOC Structure Report\n\n`;
    report += `**TOC File:** ${fltocPath}\n`;
    report += `**Title:** ${tocStructure.title}\n`;
    report += `**Total Entries:** ${this.countEntries(tocStructure.entries)}\n\n`;
    
    report += `## Hierarchy\n\n`;
    tocStructure.entries.forEach(entry => {
      report += this.generateEntryReport(entry, '');
    });
    
    return report;
  }
  
  private generateEntryReport(entry: TocEntry, indent: string): string {
    let report = '';
    const marker = entry.link ? '📄' : '📁';
    const linkInfo = entry.link ? ` → ${entry.link}` : '';
    
    report += `${indent}- ${marker} ${entry.title}${linkInfo}\n`;
    
    entry.children.forEach(child => {
      report += this.generateEntryReport(child, indent + '  ');
    });
    
    return report;
  }
  
  private countEntries(entries: TocEntry[]): number {
    let count = entries.length;
    entries.forEach(entry => {
      count += this.countEntries(entry.children);
    });
    return count;
  }

  /**
   * Creates a TOC-based conversion plan that maps files to their hierarchical structure
   */
  async createTOCBasedPlan(
    tocStructures: TocStructure[],
    outputFormat: 'markdown' | 'asciidoc' | 'zendesk'
  ): Promise<TOCBasedConversionPlan> {
    const fileMapping = new Map<string, string>();
    const folderStructure = new Set<string>();
    const extension = this.getExtensionForFormat(outputFormat);

    // Process each TOC structure
    for (const tocStructure of tocStructures) {
      const tocFolder = this.sanitizeFolderName(tocStructure.title);
      folderStructure.add(tocFolder);

      // Generate path mapping for this TOC
      const pathMapping = new Map<string, string>();
      this.generateTOCPaths(tocStructure.entries, tocFolder, '', pathMapping, folderStructure, extension);
      
      tocStructure.pathMapping = pathMapping;

      // Merge into global file mapping
      for (const [original, target] of pathMapping.entries()) {
        fileMapping.set(original, target);
      }
    }

    return {
      tocStructures,
      fileMapping,
      folderStructure: Array.from(folderStructure).sort()
    };
  }

  /**
   * Recursively generates TOC-based folder structure and path mapping
   */
  private generateTOCPaths(
    entries: TocEntry[],
    currentPath: string,
    parentTitle: string,
    pathMapping: Map<string, string>,
    folderStructure: Set<string>,
    extension: string
  ): void {
    entries.forEach((entry, index) => {
      const hasChildren = entry.children.length > 0;
      const hasLink = entry.link && entry.originalPath;
      
      // For Auto-Generated Title entries, use filename instead of generic folder name
      let titleForPath = entry.title;
      if (entry.title === 'Auto-Generated Title' && entry.link) {
        // Extract filename without extension from the link
        const fileName = basename(entry.link, extname(entry.link));
        titleForPath = fileName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      
      // Create sanitized folder/file name
      const sanitizedTitle = this.sanitizeFolderName(titleForPath);
      
      if (hasChildren && hasLink) {
        // Entry has both content and children - create folder with index file
        const entryFolder = `${currentPath}/${sanitizedTitle}`;
        folderStructure.add(entryFolder);
        
        // Map the file to index file in the folder
        const targetPath = `${entryFolder}/index${extension}`;
        entry.targetPath = targetPath;
        if (entry.originalPath) {
          pathMapping.set(entry.originalPath, targetPath);
        }
        
        // Process children in this folder
        this.generateTOCPaths(entry.children, entryFolder, entry.title, pathMapping, folderStructure, extension);
        
      } else if (hasChildren && !hasLink) {
        // Entry is just a container - create folder for children
        const entryFolder = `${currentPath}/${sanitizedTitle}`;
        folderStructure.add(entryFolder);
        
        // Process children in this folder
        this.generateTOCPaths(entry.children, entryFolder, entry.title, pathMapping, folderStructure, extension);
        
      } else if (hasLink && !hasChildren) {
        // Entry is just a file - place directly in current folder
        // Skip variables files - they shouldn't be included in the book structure
        if (!entry.originalPath?.toLowerCase().includes('variables.')) {
          const fileName = `${sanitizedTitle}${extension}`;
          const targetPath = `${currentPath}/${fileName}`;
          entry.targetPath = targetPath;
          if (entry.originalPath) {
            pathMapping.set(entry.originalPath, targetPath);
          }
        }
      }
    });
  }

  /**
   * Sanitizes a title to be used as a folder or file name
   */
  private sanitizeFolderName(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/_+/g, '-') // Replace underscores with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
      .substring(0, 50) // Limit length to prevent filesystem issues
      || 'untitled'; // Fallback for empty titles
  }

  /**
   * Gets the file extension for the output format
   */
  private getExtensionForFormat(format: 'markdown' | 'asciidoc' | 'zendesk'): string {
    switch (format) {
      case 'asciidoc':
        return '.adoc';
      case 'zendesk':
        return '.html';
      case 'markdown':
      default:
        return '.md';
    }
  }

  /**
   * Generates a structured master document that includes all TOCs
   */
  generateMultiTOCMaster(
    tocStructures: TocStructure[],
    outputFormat: 'markdown' | 'asciidoc' | 'zendesk' = 'asciidoc'
  ): string {
    if (outputFormat === 'asciidoc') {
      return this.generateMultiTOCAsciiDoc(tocStructures);
    } else if (outputFormat === 'markdown') {
      return this.generateMultiTOCMarkdown(tocStructures);
    } else {
      return this.generateMultiTOCHTML(tocStructures);
    }
  }

  private generateMultiTOCAsciiDoc(tocStructures: TocStructure[]): string {
    let content = `= Master Documentation\n`;
    content += `:doctype: book\n`;
    content += `:toc: left\n`;
    content += `:toclevels: 4\n`;
    content += `:sectnums:\n`;
    content += `:sectlinks:\n`;
    content += `:icons: font\n\n`;
    
    content += `This document includes all documentation sections from the MadCap Flare project.\n\n`;

    // Track included files to avoid duplicates
    const includedFiles = new Set<string>();

    tocStructures.forEach(tocStructure => {
      const tocFolder = this.sanitizeFolderName(tocStructure.title);
      
      content += `= ${tocStructure.title}\n\n`;
      
      // Include all entries from this TOC
      tocStructure.entries.forEach(entry => {
        content += this.generateTOCIncludeSectionWithDuplicateCheck(entry, tocFolder, '.adoc', 2, includedFiles);
      });
      
      content += `\n`;
    });
    
    return content;
  }

  private generateMultiTOCMarkdown(tocStructures: TocStructure[]): string {
    let content = `# Master Documentation\n\n`;
    content += `This document includes all documentation sections from the MadCap Flare project.\n\n`;
    content += `## Table of Contents\n\n`;

    // Generate TOC
    tocStructures.forEach(tocStructure => {
      content += `- [${tocStructure.title}](#${this.sanitizeFolderName(tocStructure.title)})\n`;
      tocStructure.entries.forEach(entry => {
        content += this.generateMarkdownTOCLine(entry, 1);
      });
    });

    content += `\n\n`;

    // Generate content sections
    tocStructures.forEach(tocStructure => {
      content += `## ${tocStructure.title}\n\n`;
      
      tocStructure.entries.forEach(entry => {
        content += this.generateMarkdownContentSection(entry, this.sanitizeFolderName(tocStructure.title), 3);
      });
      
      content += `\n`;
    });
    
    return content;
  }

  private generateMultiTOCHTML(tocStructures: TocStructure[]): string {
    let content = `<!DOCTYPE html>\n<html lang="en">\n<head>\n`;
    content += `    <meta charset="UTF-8">\n`;
    content += `    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n`;
    content += `    <title>Master Documentation</title>\n`;
    content += `    <style>\n`;
    content += `        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }\n`;
    content += `        .toc-section { margin-bottom: 40px; border-bottom: 2px solid #ddd; padding-bottom: 20px; }\n`;
    content += `        .toc-title { color: #2c3e50; border-bottom: 1px solid #3498db; padding-bottom: 10px; }\n`;
    content += `        .entry-link { display: block; margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; text-decoration: none; color: #2c3e50; }\n`;
    content += `        .entry-link:hover { background: #e9ecef; }\n`;
    content += `    </style>\n`;
    content += `</head>\n<body>\n`;
    content += `    <h1>Master Documentation</h1>\n`;
    content += `    <p>This document includes all documentation sections from the MadCap Flare project.</p>\n\n`;

    tocStructures.forEach(tocStructure => {
      content += `    <div class="toc-section">\n`;
      content += `        <h2 class="toc-title">${tocStructure.title}</h2>\n`;
      
      tocStructure.entries.forEach(entry => {
        content += this.generateHTMLContentSection(entry, this.sanitizeFolderName(tocStructure.title), 2);
      });
      
      content += `    </div>\n\n`;
    });
    
    content += `</body>\n</html>`;
    return content;
  }

  private generateTOCIncludeSection(entry: TocEntry, tocFolder: string, extension: string, level: number): string {
    let content = '';
    const headerLevel = '='.repeat(Math.min(level, 6));
    
    // Skip entries with no content and no children
    if (!entry.targetPath && entry.children.length === 0) {
      return content;
    }
    
    // Improve title - if it's Auto-Generated Title, try to create better title from target path
    let displayTitle = entry.title;
    if (entry.title === 'Auto-Generated Title' && entry.targetPath) {
      // Extract meaningful title from file path
      const fileName = basename(entry.targetPath, extension);
      displayTitle = fileName
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    if (entry.targetPath) {
      // This entry has content
      if (entry.children.length > 0) {
        // Has both content and children - create section with include
        content += `${headerLevel} ${displayTitle}\n\n`;
        content += `include::${entry.targetPath}[]\n\n`;
        
        // Include children at next level
        entry.children.forEach(child => {
          content += this.generateTOCIncludeSection(child, tocFolder, extension, level + 1);
        });
      } else {
        // Just content, no children - use include with comment for context
        if (displayTitle !== 'Auto-Generated Title') {
          content += `// ${displayTitle}\n`;
        }
        content += `include::${entry.targetPath}[]\n\n`;
      }
    } else if (entry.children.length > 0) {
      // Container only - create section for children
      content += `${headerLevel} ${displayTitle}\n\n`;
      entry.children.forEach(child => {
        content += this.generateTOCIncludeSection(child, tocFolder, extension, level + 1);
      });
    }
    
    return content;
  }

  /**
   * Generate TOC include section with duplicate checking
   */
  private generateTOCIncludeSectionWithDuplicateCheck(
    entry: TocEntry, 
    tocFolder: string, 
    extension: string, 
    level: number, 
    includedFiles: Set<string>
  ): string {
    let content = '';
    const headerLevel = '='.repeat(Math.min(level, 6));
    
    // Skip entries with no content and no children
    if (!entry.targetPath && entry.children.length === 0) {
      return content;
    }
    
    // Improve title - if it's Auto-Generated Title, try to create better title from target path
    let displayTitle = entry.title;
    if (entry.title === 'Auto-Generated Title' && entry.targetPath) {
      // Extract meaningful title from file path
      const fileName = basename(entry.targetPath, extension);
      displayTitle = fileName
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    if (entry.targetPath) {
      // Check if we've already included this file
      if (!includedFiles.has(entry.targetPath)) {
        includedFiles.add(entry.targetPath);
        
        // This entry has content
        if (entry.children.length > 0) {
          // Has both content and children - create section with include
          content += `${headerLevel} ${displayTitle}\n\n`;
          content += `include::${entry.targetPath}[]\n\n`;
          
          // Include children at next level
          entry.children.forEach(child => {
            content += this.generateTOCIncludeSectionWithDuplicateCheck(child, tocFolder, extension, level + 1, includedFiles);
          });
        } else {
          // Just content, no children - use include with comment for context
          if (displayTitle !== 'Auto-Generated Title') {
            content += `// ${displayTitle}\n`;
          }
          content += `include::${entry.targetPath}[]\n\n`;
        }
      }
      // If file already included, skip but still process children
      else if (entry.children.length > 0) {
        entry.children.forEach(child => {
          content += this.generateTOCIncludeSectionWithDuplicateCheck(child, tocFolder, extension, level + 1, includedFiles);
        });
      }
    } else if (entry.children.length > 0) {
      // Container only - create section for children
      content += `${headerLevel} ${displayTitle}\n\n`;
      entry.children.forEach(child => {
        content += this.generateTOCIncludeSectionWithDuplicateCheck(child, tocFolder, extension, level + 1, includedFiles);
      });
    }
    
    return content;
  }

  private generateMarkdownTOCLine(entry: TocEntry, level: number): string {
    const indent = '  '.repeat(level);
    const anchor = this.sanitizeFolderName(entry.title);
    let content = `${indent}- [${entry.title}](#${anchor})\n`;
    
    entry.children.forEach(child => {
      content += this.generateMarkdownTOCLine(child, level + 1);
    });
    
    return content;
  }

  private generateMarkdownContentSection(entry: TocEntry, tocFolder: string, level: number): string {
    let content = '';
    const headerLevel = '#'.repeat(Math.min(level, 6));
    
    if (entry.targetPath) {
      content += `${headerLevel} ${entry.title}\n\n`;
      content += `[📄 View ${entry.title}](${entry.targetPath})\n\n`;
    } else if (entry.children.length > 0) {
      content += `${headerLevel} ${entry.title}\n\n`;
    }
    
    entry.children.forEach(child => {
      content += this.generateMarkdownContentSection(child, tocFolder, level + 1);
    });
    
    return content;
  }

  private generateHTMLContentSection(entry: TocEntry, tocFolder: string, level: number): string {
    let content = '';
    const headerTag = `h${Math.min(level + 1, 6)}`;
    
    if (entry.targetPath) {
      content += `        <${headerTag}>${entry.title}</${headerTag}>\n`;
      content += `        <a href="${entry.targetPath}" class="entry-link">📄 View ${entry.title}</a>\n`;
    } else if (entry.children.length > 0) {
      content += `        <${headerTag}>${entry.title}</${headerTag}>\n`;
    }
    
    entry.children.forEach(child => {
      content += this.generateHTMLContentSection(child, tocFolder, level + 1);
    });
    
    return content;
  }
}
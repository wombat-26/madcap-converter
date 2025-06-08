import { readFile } from 'fs/promises';
import { JSDOM } from 'jsdom';
import { resolve, relative, dirname, basename } from 'path';

export interface TocEntry {
  title: string;
  link?: string;
  level: number;
  children: TocEntry[];
}

export interface TocStructure {
  title: string;
  entries: TocEntry[];
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
      children
    };
  }
  
  private extractTocTitle(fltocPath: string): string {
    const fileName = basename(fltocPath, '.fltoc');
    return fileName.replace(/^(Online|PDF)\s*/, '').trim();
  }
  
  private resolveTitle(title: string): string {
    // Handle MadCap system variables in titles
    if (title === '[%=System.LinkedTitle%]' || title === '[%=System.LinkedHeader%]') {
      return 'Auto-Generated Title'; // Will be resolved from actual content
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
  
  private resolveContentPath(link: string, contentBasePath: string): string | undefined {
    if (!link) return undefined;
    
    // Remove leading slash and resolve relative to content base
    const cleanLink = link.replace(/^\/+/, '');
    const fullPath = resolve(contentBasePath, cleanLink);
    
    // Convert to relative path for include statements
    return cleanLink;
  }
  
  generateMasterAdoc(tocStructure: TocStructure, outputFormat: 'adoc' | 'md' = 'adoc'): string {
    const extension = outputFormat === 'adoc' ? '.adoc' : '.md';
    
    let content = `= ${tocStructure.title}\n`;
    content += `:doctype: book\n`;
    content += `:toc: left\n`;
    content += `:toclevels: 3\n`;
    content += `:sectnums:\n`;
    content += `:sectlinks:\n`;
    content += `:icons: font\n\n`;
    
    // Generate structured includes with sections
    tocStructure.entries.forEach(entry => {
      content += this.generateStructuredSection(entry, extension, 1);
    });
    
    return content;
  }
  
  private generateStructuredSection(entry: TocEntry, extension: string, level: number): string {
    let content = '';
    
    // Determine if we should create a section header
    const hasChildren = entry.children.length > 0;
    const hasRealTitle = entry.title !== 'Auto-Generated Title';
    const isValidSectionTitle = hasRealTitle && entry.title.length <= 100 && !entry.title.includes('.');
    const shouldCreateSection = hasChildren && isValidSectionTitle;
    
    if (shouldCreateSection) {
      // Create section header based on level
      const headerLevel = '='.repeat(Math.min(level + 1, 6)); // AsciiDoc supports up to 6 levels
      content += `${headerLevel} ${entry.title}\n\n`;
    }
    
    // Add include for this entry if it has a link
    if (entry.link) {
      const includePath = this.convertPathToOutput(entry.link, extension);
      content += `include::${includePath}[]\n\n`;
    }
    
    // Process children with proper nesting
    if (hasChildren) {
      entry.children.forEach(child => {
        // For children under a section, maintain proper hierarchy
        const childLevel = shouldCreateSection ? level + 1 : level;
        content += this.generateStructuredSection(child, extension, childLevel);
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
}
/**
 * Academic citation and footnote handler for preserving scholarly references
 * in converted documents
 */
export interface Citation {
  id: string;
  type: 'footnote' | 'endnote' | 'bibliography' | 'inline';
  content: string;
  originalHtml?: string;
  authors?: string[];
  title?: string;
  year?: string;
  journal?: string;
  url?: string;
  doi?: string;
}

export interface CitationResult {
  processedContent: string;
  citations: Citation[];
  warnings: string[];
}

export class CitationHandler {
  private citationCounter = 0;
  private citations: Map<string, Citation> = new Map();
  
  private readonly citationPatterns = {
    // Standard footnote patterns
    footnoteRef: /<a[^>]*href=["']#fn(\d+)["'][^>]*>(.*?)<\/a>/gi,
    footnoteContent: /<(?:div|p)[^>]*id=["']fn(\d+)["'][^>]*>(.*?)<\/(?:div|p)>/gi,
    
    // Academic citation patterns
    academicRef: /\[(\d+)\]/g,
    authorYear: /\(([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+(\d{4})\)/g,
    
    // Bibliography entries
    bibliographyEntry: /<(?:div|p)[^>]*class=["'][^"']*(?:bibliography|reference|citation)[^"']*["'][^>]*>(.*?)<\/(?:div|p)>/gi,
    
    // DOI patterns
    doi: /(?:DOI|doi):\s*(10\.\d+\/[^\s<>]+)/gi,
    
    // URL patterns in citations
    urlInCitation: /(https?:\/\/[^\s<>]+)/gi,
    
    // Journal citation patterns
    journalCitation: /"([^"]+)"\s+(?:in\s+)?([A-Z][^,.]+),?\s+(?:vol\.?\s*)?(\d+)?,?\s*(?:no\.?\s*(\d+))?,?\s*(?:pp?\.?\s*([0-9\-]+))?,?\s*(\d{4})/gi
  };

  /**
   * Process citations in document for specific output format
   */
  processCitations(content: string, format: 'asciidoc' | 'markdown'): CitationResult {
    this.citations.clear();
    this.citationCounter = 0;
    const warnings: string[] = [];
    
    let processedContent = content;
    
    // Extract and process footnotes first
    const footnoteResult = this.processFootnotes(processedContent, format);
    processedContent = footnoteResult.content;
    warnings.push(...footnoteResult.warnings);
    
    // Process academic citations
    const academicResult = this.processAcademicCitations(processedContent, format);
    processedContent = academicResult.content;
    warnings.push(...academicResult.warnings);
    
    // Process bibliography entries
    const bibliographyResult = this.processBibliography(processedContent, format);
    processedContent = bibliographyResult.content;
    warnings.push(...bibliographyResult.warnings);
    
    // Add citations section if needed
    if (this.citations.size > 0 && format === 'asciidoc') {
      processedContent += this.generateAsciiDocCitationsSection();
    } else if (this.citations.size > 0 && format === 'markdown') {
      processedContent += this.generateMarkdownCitationsSection();
    }
    
    return {
      processedContent,
      citations: Array.from(this.citations.values()),
      warnings
    };
  }

  /**
   * Process HTML footnotes and convert to format-appropriate references
   */
  private processFootnotes(content: string, format: 'asciidoc' | 'markdown'): { content: string; warnings: string[] } {
    const warnings: string[] = [];
    let processedContent = content;
    const footnoteContents = new Map<string, string>();
    
    // Extract footnote content first
    let match;
    while ((match = this.citationPatterns.footnoteContent.exec(content)) !== null) {
      const footnoteId = match[1];
      const footnoteContent = this.cleanHtmlContent(match[2]);
      footnoteContents.set(footnoteId, footnoteContent);
    }
    
    // Process footnote references
    processedContent = processedContent.replace(this.citationPatterns.footnoteRef, (match, refId, linkText) => {
      const footnoteContent = footnoteContents.get(refId);
      
      if (!footnoteContent) {
        warnings.push(`Footnote reference ${refId} found but content missing`);
        return linkText || `[${refId}]`;
      }
      
      const citationId = this.generateCitationId();
      const citation: Citation = {
        id: citationId,
        type: 'footnote',
        content: footnoteContent,
        originalHtml: match
      };
      
      this.citations.set(citationId, citation);
      
      if (format === 'asciidoc') {
        return `footnote:[${footnoteContent}]`;
      } else {
        return `[^${citationId}]`;
      }
    });
    
    // Remove original footnote content sections
    processedContent = processedContent.replace(this.citationPatterns.footnoteContent, '');
    
    return { content: processedContent, warnings };
  }

  /**
   * Process academic citations (author-year format)
   */
  private processAcademicCitations(content: string, format: 'asciidoc' | 'markdown'): { content: string; warnings: string[] } {
    const warnings: string[] = [];
    let processedContent = content;
    
    // Process author-year citations
    processedContent = processedContent.replace(this.citationPatterns.authorYear, (match, author, year) => {
      const citationId = this.generateCitationId();
      const citation: Citation = {
        id: citationId,
        type: 'inline',
        content: `${author}, ${year}`,
        authors: [author],
        year: year,
        originalHtml: match
      };
      
      this.citations.set(citationId, citation);
      
      if (format === 'asciidoc') {
        return `<<${citationId},${author}, ${year}>>`;
      } else {
        return `[${author}, ${year}](#${citationId})`;
      }
    });
    
    // Process numeric academic references
    processedContent = processedContent.replace(this.citationPatterns.academicRef, (match, refNum) => {
      const citationId = `ref_${refNum}`;
      
      if (format === 'asciidoc') {
        return `<<${citationId},[${refNum}]>>`;
      } else {
        return `[${refNum}](#${citationId})`;
      }
    });
    
    return { content: processedContent, warnings };
  }

  /**
   * Process bibliography sections
   */
  private processBibliography(content: string, format: 'asciidoc' | 'markdown'): { content: string; warnings: string[] } {
    const warnings: string[] = [];
    let processedContent = content;
    
    // Extract bibliography entries
    processedContent = processedContent.replace(this.citationPatterns.bibliographyEntry, (match, entryContent) => {
      const cleanContent = this.cleanHtmlContent(entryContent);
      const citationId = this.generateCitationId();
      
      // Try to parse structured citation information
      const parsedCitation = this.parseBibliographyEntry(cleanContent);
      const citation: Citation = {
        id: citationId,
        type: 'bibliography',
        content: cleanContent,
        originalHtml: match,
        ...parsedCitation
      };
      
      this.citations.set(citationId, citation);
      
      if (format === 'asciidoc') {
        return `\n[[${citationId}]]\n${cleanContent}\n`;
      } else {
        return `\n<a id="${citationId}"></a>${cleanContent}\n`;
      }
    });
    
    return { content: processedContent, warnings };
  }

  /**
   * Parse bibliography entry to extract structured information
   */
  private parseBibliographyEntry(content: string): Partial<Citation> {
    const result: Partial<Citation> = {};
    
    // Extract DOI
    const doiMatch = content.match(this.citationPatterns.doi);
    if (doiMatch) {
      result.doi = doiMatch[1];
    }
    
    // Extract URL
    const urlMatch = content.match(this.citationPatterns.urlInCitation);
    if (urlMatch) {
      result.url = urlMatch[1];
    }
    
    // Extract journal citation details
    const journalMatch = content.match(this.citationPatterns.journalCitation);
    if (journalMatch) {
      result.title = journalMatch[1];
      result.journal = journalMatch[2];
      result.year = journalMatch[6];
    }
    
    // Extract authors (basic heuristic)
    const authorMatch = content.match(/^([A-Z][a-z]+(?:,?\s+[A-Z][a-z]*\.?)*(?:\s+and\s+[A-Z][a-z]+(?:,?\s+[A-Z][a-z]*\.?)*)*)/);
    if (authorMatch) {
      const authorString = authorMatch[1];
      result.authors = authorString.split(/\s+and\s+/).map(author => author.trim());
    }
    
    return result;
  }

  /**
   * Generate AsciiDoc citations section
   */
  private generateAsciiDocCitationsSection(): string {
    if (this.citations.size === 0) return '';
    
    let section = '\n\n== References\n\n';
    
    for (const citation of this.citations.values()) {
      if (citation.type === 'footnote') {
        continue; // Footnotes are inline in AsciiDoc
      }
      
      section += `[[${citation.id}]]\n`;
      
      if (citation.authors && citation.year) {
        section += `${citation.authors.join(', ')} (${citation.year}). `;
      }
      
      section += `${citation.content}`;
      
      if (citation.doi) {
        section += ` DOI: ${citation.doi}`;
      }
      
      if (citation.url) {
        section += ` Available at: ${citation.url}`;
      }
      
      section += '\n\n';
    }
    
    return section;
  }

  /**
   * Generate Markdown citations section
   */
  private generateMarkdownCitationsSection(): string {
    if (this.citations.size === 0) return '';
    
    let section = '\n\n## References\n\n';
    
    // Add footnote definitions for Markdown
    const footnotes = Array.from(this.citations.values()).filter(c => c.type === 'footnote');
    if (footnotes.length > 0) {
      footnotes.forEach(citation => {
        section += `[^${citation.id}]: ${citation.content}\n\n`;
      });
    }
    
    // Add other citations
    const otherCitations = Array.from(this.citations.values()).filter(c => c.type !== 'footnote');
    if (otherCitations.length > 0) {
      otherCitations.forEach(citation => {
        section += `<a id="${citation.id}"></a>\n`;
        
        if (citation.authors && citation.year) {
          section += `**${citation.authors.join(', ')}** (${citation.year}). `;
        }
        
        section += `${citation.content}`;
        
        if (citation.doi) {
          section += ` DOI: ${citation.doi}`;
        }
        
        if (citation.url) {
          section += ` Available at: [${citation.url}](${citation.url})`;
        }
        
        section += '\n\n';
      });
    }
    
    return section;
  }

  /**
   * Clean HTML content while preserving essential formatting
   */
  private cleanHtmlContent(html: string): string {
    let content = html;
    
    // Remove HTML tags but preserve some formatting
    content = content.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    content = content.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    content = content.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    content = content.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    content = content.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    
    // Remove remaining HTML tags
    content = content.replace(/<[^>]+>/g, '');
    
    // Clean up whitespace
    content = content.replace(/\s+/g, ' ').trim();
    
    // Decode HTML entities
    content = content
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
    
    return content;
  }

  /**
   * Generate unique citation ID
   */
  private generateCitationId(): string {
    this.citationCounter++;
    return `cite_${this.citationCounter}`;
  }

  /**
   * Check if content contains citations
   */
  containsCitations(content: string): boolean {
    return (
      this.citationPatterns.footnoteRef.test(content) ||
      this.citationPatterns.academicRef.test(content) ||
      this.citationPatterns.authorYear.test(content) ||
      this.citationPatterns.bibliographyEntry.test(content)
    );
  }

  /**
   * Process citations in document elements
   */
  processCitationsInDocument(document: Document, format: 'asciidoc' | 'markdown'): CitationResult {
    const bodyContent = document.body?.innerHTML || document.documentElement.innerHTML;
    const result = this.processCitations(bodyContent, format);
    
    // Update document with processed content
    if (document.body) {
      document.body.innerHTML = result.processedContent;
    } else {
      document.documentElement.innerHTML = result.processedContent;
    }
    
    return result;
  }
}
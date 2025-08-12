/**
 * Quality Validator - Analyzes conversion output quality and provides feedback
 */

export interface QualityIssue {
  type: 'error' | 'warning' | 'info';
  category: 'content' | 'structure' | 'formatting' | 'links' | 'images';
  message: string;
  line?: number;
  suggestion?: string;
}

export interface QualityReport {
  score: number; // 0-100 quality score
  issues: QualityIssue[];
  metadata: {
    totalLines: number;
    hasTitle: boolean;
    hasContent: boolean;
    imageCount: number;
    linkCount: number;
    format: string;
  };
  summary: string;
}

export class QualityValidator {
  /**
   * Validate the quality of converted content
   */
  validateContent(content: string, format: string, originalPath?: string): QualityReport {
    const issues: QualityIssue[] = [];
    const lines = content.split('\n');
    
    // Analyze content structure
    const metadata = this.analyzeStructure(content, format);
    
    // Run quality checks
    this.checkForJavaScript(content, issues);
    this.checkForHTMLTags(content, issues);
    this.checkForMalformedMarkup(content, format, issues);
    this.checkContentStructure(content, format, issues, metadata);
    this.checkForDuplication(content, issues);
    this.checkForEncodingIssues(content, issues);
    this.checkImageReferences(content, issues);
    this.checkLinkReferences(content, issues);
    
    // Calculate quality score
    const score = this.calculateQualityScore(issues, metadata);
    
    // Generate summary
    const summary = this.generateSummary(score, issues, metadata);
    
    return {
      score,
      issues,
      metadata: {
        ...metadata,
        format,
        totalLines: lines.length
      },
      summary
    };
  }

  private analyzeStructure(content: string, format: string) {
    const imageRegex = format === 'asciidoc' ? /image::?[^[\]]+\[/g : /!\[[^\]]*\]\([^)]+\)/g;
    const linkRegex = format === 'asciidoc' ? /(?:xref:|link:)[^[\]]+\[/g : /\[[^\]]*\]\([^)]+\)/g;
    
    return {
      hasTitle: this.hasProperTitle(content, format),
      hasContent: content.trim().length > 100, // Minimum content threshold
      imageCount: (content.match(imageRegex) || []).length,
      linkCount: (content.match(linkRegex) || []).length
    };
  }

  private hasProperTitle(content: string, format: string): boolean {
    if (format === 'asciidoc') {
      return /^=\s+.+$/m.test(content);
    } else if (format === 'markdown' || format === 'writerside-markdown') {
      return /^#\s+.+$/m.test(content);
    }
    return true; // Other formats
  }

  private checkForJavaScript(content: string, issues: QualityIssue[]): void {
    // Check for JavaScript code that leaked into content
    const jsPatterns = [
      /function\s*\([^)]*\)\s*\{/,
      /var\s+\w+\s*=/,
      /\.addEventListener\(/,
      /console\.log\(/,
      /document\.createElement\(/,
      /\$\([^)]+\)\./,
      /new\s+Date\(\)/,
      /Math\.(floor|ceil|random)/
    ];

    jsPatterns.forEach((pattern, index) => {
      if (pattern.test(content)) {
        issues.push({
          type: 'error',
          category: 'content',
          message: 'JavaScript code detected in converted content',
          suggestion: 'Source HTML likely contained <script> tags that were not properly filtered'
        });
      }
    });
  }

  private checkForHTMLTags(content: string, issues: QualityIssue[]): void {
    // Check for HTML tags that weren't converted
    const htmlTagRegex = /<(?!\/?(?:sub|sup|br|hr)>)[a-zA-Z][^>]*>/g;
    const matches = content.match(htmlTagRegex);
    
    if (matches && matches.length > 0) {
      const uniqueTags = [...new Set(matches.map(tag => 
        tag.replace(/<\/?([a-zA-Z0-9]+)[^>]*>/, '$1')
      ))];
      
      issues.push({
        type: 'warning',
        category: 'formatting',
        message: `Unconverted HTML tags found: ${uniqueTags.join(', ')}`,
        suggestion: 'These HTML elements were not properly converted to the target format'
      });
    }
  }

  private checkForMalformedMarkup(content: string, format: string, issues: QualityIssue[]): void {
    if (format === 'asciidoc') {
      // Check for malformed AsciiDoc syntax
      if (/latexmath:\[/.test(content)) {
        issues.push({
          type: 'error',
          category: 'formatting',
          message: 'Malformed latexmath expressions detected',
          suggestion: 'Mathematical content was not properly converted'
        });
      }

      // Check for broken references
      if (/<ref_\d+,\[\d+\]>/.test(content)) {
        issues.push({
          type: 'error',
          category: 'formatting',
          message: 'Corrupted reference markers detected',
          suggestion: 'Cross-references were not properly processed'
        });
      }

      // Check for proper section structure
      const lines = content.split('\n');
      let hasDocumentTitle = false;
      let duplicateHeaders = 0;
      const seenHeaders = new Set();

      lines.forEach((line, index) => {
        if (line.startsWith('= ') && !hasDocumentTitle) {
          hasDocumentTitle = true;
        } else if (line.startsWith('= ') && hasDocumentTitle) {
          duplicateHeaders++;
        }

        if (line.match(/^=+\s+/)) {
          if (seenHeaders.has(line)) {
            issues.push({
              type: 'warning',
              category: 'structure',
              message: `Duplicate header found: ${line.substring(0, 50)}...`,
              line: index + 1
            });
          }
          seenHeaders.add(line);
        }
      });

      if (duplicateHeaders > 0) {
        issues.push({
          type: 'error',
          category: 'structure',
          message: `Multiple document titles found (${duplicateHeaders + 1} total)`,
          suggestion: 'Document structure may be duplicated or malformed'
        });
      }
    }
  }

  private checkContentStructure(content: string, format: string, issues: QualityIssue[], metadata: any): void {
    if (!metadata.hasTitle) {
      issues.push({
        type: 'warning',
        category: 'structure',
        message: 'No document title found',
        suggestion: 'Add a proper title to improve document structure'
      });
    }

    if (!metadata.hasContent) {
      issues.push({
        type: 'error',
        category: 'content',
        message: 'Document appears to be empty or have very little content',
        suggestion: 'Check if source document was properly processed'
      });
    }

    // Check for reasonable content-to-markup ratio
    const markupChars = (content.match(/[=*_`\[\]]/g) || []).length;
    const totalChars = content.length;
    const markupRatio = markupChars / totalChars;

    if (markupRatio > 0.3) {
      issues.push({
        type: 'warning',
        category: 'formatting',
        message: 'High markup-to-content ratio detected',
        suggestion: 'Document may contain excessive formatting or conversion artifacts'
      });
    }
  }

  private checkForDuplication(content: string, issues: QualityIssue[]): void {
    const lines = content.split('\n');
    const duplicateLines = new Map<string, number[]>();

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.length > 20) { // Only check substantial lines
        if (!duplicateLines.has(trimmed)) {
          duplicateLines.set(trimmed, []);
        }
        duplicateLines.get(trimmed)!.push(index + 1);
      }
    });

    duplicateLines.forEach((lineNumbers, content) => {
      if (lineNumbers.length > 1) {
        issues.push({
          type: 'warning',
          category: 'content',
          message: `Duplicate content found on lines ${lineNumbers.join(', ')}`,
          suggestion: 'Check for content duplication in source or conversion process'
        });
      }
    });
  }

  private checkForEncodingIssues(content: string, issues: QualityIssue[]): void {
    // Check for encoding issues
    const encodingIssues = [
      /â€™/g, // Smart quote issues
      /Â/g,   // Non-breaking space issues
      /â€/g,  // Em dash issues
      /Ã/g    // Various encoding issues
    ];

    encodingIssues.forEach(pattern => {
      if (pattern.test(content)) {
        issues.push({
          type: 'warning',
          category: 'content',
          message: 'Text encoding issues detected',
          suggestion: 'Source document may have character encoding problems'
        });
      }
    });
  }

  private checkImageReferences(content: string, issues: QualityIssue[]): void {
    // Check for broken or suspicious image references
    const imageRegex = /image::?([^[\]]+)\[/g;
    let match;

    while ((match = imageRegex.exec(content)) !== null) {
      const imagePath = match[1];
      
      if (imagePath.includes('data:')) {
        continue; // Skip data URLs
      }

      if (imagePath.includes('../') && (imagePath.match(/\.\.\//g) || []).length > 3) {
        issues.push({
          type: 'warning',
          category: 'images',
          message: `Suspicious image path with many directory traversals: ${imagePath}`,
          suggestion: 'Image paths may not resolve correctly'
        });
      }

      if (!imagePath.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
        issues.push({
          type: 'info',
          category: 'images',
          message: `Image without standard extension: ${imagePath}`,
          suggestion: 'Verify image file exists and has correct extension'
        });
      }
    }
  }

  private checkLinkReferences(content: string, issues: QualityIssue[]): void {
    // Check for broken or suspicious link references  
    const linkRegex = /(?:xref:|link:)([^[\]]+)\[/g;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const linkPath = match[1];
      
      if (linkPath.includes('..htm') || linkPath.includes('..html')) {
        issues.push({
          type: 'info',
          category: 'links',
          message: `Link may need extension conversion: ${linkPath}`,
          suggestion: 'HTML links should be converted to target format extensions'
        });
      }
    }
  }

  private calculateQualityScore(issues: QualityIssue[], metadata: any): number {
    let score = 100;

    // Deduct points for issues
    issues.forEach(issue => {
      switch (issue.type) {
        case 'error':
          score -= 15;
          break;
        case 'warning':
          score -= 5;
          break;
        case 'info':
          score -= 1;
          break;
      }
    });

    // Bonus for good structure
    if (metadata.hasTitle) score += 5;
    if (metadata.hasContent) score += 10;
    if (metadata.imageCount > 0) score += 2;
    if (metadata.linkCount > 0) score += 2;

    return Math.max(0, Math.min(100, score));
  }

  private generateSummary(score: number, issues: QualityIssue[], metadata: any): string {
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    
    if (score >= 90) {
      return `Excellent conversion quality (${score}/100). ${errorCount} errors, ${warningCount} warnings.`;
    } else if (score >= 75) {
      return `Good conversion quality (${score}/100). ${errorCount} errors, ${warningCount} warnings.`;
    } else if (score >= 50) {
      return `Fair conversion quality (${score}/100). ${errorCount} errors, ${warningCount} warnings. Review recommended.`;
    } else {
      return `Poor conversion quality (${score}/100). ${errorCount} errors, ${warningCount} warnings. Manual review required.`;
    }
  }
}
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { ConditionAnalysisResult, ConditionInfo } from '../types/index';

/**
 * Analyzes MadCap files to discover all conditions and their usage patterns
 */
export class ConditionAnalyzer {
  private conditionUsage = new Map<string, number>();
  private filesByCondition = new Map<string, Set<string>>();
  private analyzedFiles = 0;

  /**
   * Analyze a set of files for MadCap conditions
   */
  async analyzeFiles(files: { path: string; content?: string }[]): Promise<ConditionAnalysisResult> {
    this.reset();
    
    for (const file of files) {
      await this.analyzeFile(file.path, file.content);
    }

    return this.getResults();
  }

  /**
   * Analyze a single file for conditions
   */
  private async analyzeFile(filePath: string, content?: string): Promise<void> {
    try {
      const fileContent = content || readFileSync(filePath, 'utf8');
      
      // Skip non-HTML files
      if (!this.isHtmlFile(filePath, fileContent)) {
        return;
      }

      this.analyzedFiles++;
      
      // Extract conditions from file content
      const conditions = this.extractConditions(fileContent);
      
      // Update usage statistics
      conditions.forEach(condition => {
        // Update condition usage count
        this.conditionUsage.set(condition, (this.conditionUsage.get(condition) || 0) + 1);
        
        // Track which files use this condition
        if (!this.filesByCondition.has(condition)) {
          this.filesByCondition.set(condition, new Set());
        }
        this.filesByCondition.get(condition)!.add(filePath);
      });
      
    } catch (error) {
      console.warn(`Could not analyze file ${filePath}:`, error);
    }
  }

  /**
   * Extract all MadCap conditions from HTML content
   */
  private extractConditions(content: string): string[] {
    const conditions = new Set<string>();
    
    try {
      // Parse with JSDOM for accurate DOM traversal
      const dom = new JSDOM(content, { contentType: 'text/html' });
      const document = dom.window.document;
      
      // Find elements with MadCap condition attributes
      const elementsWithConditions = document.querySelectorAll('[madcap\\:conditions], [data-mc-conditions]');
      
      elementsWithConditions.forEach(element => {
        const madcapConditions = element.getAttribute('madcap:conditions') || '';
        const dataMcConditions = element.getAttribute('data-mc-conditions') || '';
        const allConditions = madcapConditions + ' ' + dataMcConditions;
        
        // Parse individual conditions (comma or semicolon separated)
        const individualConditions = this.parseConditionString(allConditions);
        individualConditions.forEach(condition => conditions.add(condition));
      });
      
    } catch (error) {
      // Fallback to regex parsing if JSDOM fails
      console.warn('JSDOM parsing failed, using regex fallback:', error);
      const regexConditions = this.extractConditionsWithRegex(content);
      regexConditions.forEach(condition => conditions.add(condition));
    }
    
    return Array.from(conditions);
  }

  /**
   * Fallback regex-based condition extraction
   */
  private extractConditionsWithRegex(content: string): string[] {
    const conditions = new Set<string>();
    const conditionPattern = /(?:madcap:conditions|data-mc-conditions)="([^"]+)"/gi;
    
    let match;
    while ((match = conditionPattern.exec(content)) !== null) {
      const conditionString = match[1];
      const individualConditions = this.parseConditionString(conditionString);
      individualConditions.forEach(condition => conditions.add(condition));
    }
    
    return Array.from(conditions);
  }

  /**
   * Parse a condition string into individual conditions
   * Handles comma-separated, semicolon-separated, and space-separated conditions
   */
  private parseConditionString(conditionString: string): string[] {
    if (!conditionString.trim()) {
      return [];
    }
    
    // Split by common separators and clean up
    return conditionString
      .split(/[,;]/)
      .map(condition => condition.trim())
      .filter(condition => condition.length > 0)
      .map(condition => {
        // Remove common prefixes/suffixes
        return condition
          .replace(/^["']|["']$/g, '') // Remove quotes
          .replace(/^General\./i, '') // Remove "General." prefix
          .replace(/^Default\./i, '') // Remove "Default." prefix
          .trim();
      })
      .filter(condition => condition.length > 0);
  }

  /**
   * Determine if a file should be analyzed (HTML/HTM files)
   */
  private isHtmlFile(filePath: string, content: string): boolean {
    // Check file extension
    if (filePath.toLowerCase().match(/\.(htm|html)$/)) {
      return true;
    }
    
    // Check content for HTML-like structure
    if (content.includes('<html') || content.includes('<!DOCTYPE') || content.includes('<body')) {
      return true;
    }
    
    return false;
  }

  /**
   * Categorize conditions based on their names
   */
  private categorizeCondition(condition: string): ConditionInfo['category'] {
    const lowerCondition = condition.toLowerCase();
    
    // Status-based conditions
    if (/\b(deprecated?|deprecation|obsolete|legacy|old|paused?|halted?|stopped?|discontinued?|retired?)\b/i.test(condition)) {
      return 'status';
    }
    
    // Color-based conditions  
    if (/\b(black|red|gray|grey|blue|green|yellow|orange|purple|pink)\b/i.test(condition)) {
      return 'color';
    }
    
    // Print-related conditions
    if (/\b(print[\s\-_]?only|printonly|online[\s\-_]?only|onlineonly)\b/i.test(condition)) {
      return 'print';
    }
    
    // Development status
    if (/\b(cancelled?|canceled?|abandoned|shelved|draft|beta|alpha|experimental)\b/i.test(condition)) {
      return 'development';
    }
    
    // Visibility conditions
    if (/\b(hidden|internal|private|public|external)\b/i.test(condition)) {
      return 'visibility';
    }
    
    return 'custom';
  }

  /**
   * Determine if a condition appears to be deprecated
   */
  private isDeprecatedCondition(condition: string): boolean {
    const deprecatedPatterns = [
      /\b(deprecated?|deprecation|obsolete|legacy|old)\b/i,
      /\b(cancelled?|canceled?|abandoned|shelved)\b/i,
      /\b(discontinued?|retired?|paused?|halted?|stopped?)\b/i,
      /\b(black|red|gray|grey)\b/i, // Often used for deprecated content
    ];
    
    return deprecatedPatterns.some(pattern => pattern.test(condition));
  }

  /**
   * Get analysis results with categorized conditions
   */
  private getResults(): ConditionAnalysisResult {
    const conditions = Array.from(this.conditionUsage.keys()).sort();
    const conditionUsage: Record<string, number> = {};
    const filesByCondition: Record<string, string[]> = {};
    
    conditions.forEach(condition => {
      conditionUsage[condition] = this.conditionUsage.get(condition) || 0;
      filesByCondition[condition] = Array.from(this.filesByCondition.get(condition) || []);
    });
    
    return {
      conditions,
      fileCount: this.analyzedFiles,
      conditionUsage,
      filesByCondition
    };
  }

  /**
   * Get detailed condition information with categorization
   */
  getConditionInfo(condition: string, usage: number): ConditionInfo {
    return {
      condition,
      usage,
      category: this.categorizeCondition(condition),
      isDeprecated: this.isDeprecatedCondition(condition),
      description: this.getConditionDescription(condition)
    };
  }

  /**
   * Generate a human-readable description for a condition
   */
  private getConditionDescription(condition: string): string {
    const category = this.categorizeCondition(condition);
    const lowerCondition = condition.toLowerCase();
    
    switch (category) {
      case 'status':
        if (lowerCondition.includes('deprecated')) return 'Deprecated content - usually excluded from output';
        if (lowerCondition.includes('obsolete')) return 'Obsolete content - no longer relevant';
        if (lowerCondition.includes('legacy')) return 'Legacy content - from previous versions';
        break;
        
      case 'color':
        return `Color-based condition - often used for review status or content categorization`;
        
      case 'print':
        if (lowerCondition.includes('print')) return 'Print-only content - not shown in online output';
        if (lowerCondition.includes('online')) return 'Online-only content - not shown in print output';
        break;
        
      case 'development':
        if (lowerCondition.includes('draft')) return 'Draft content - work in progress';
        if (lowerCondition.includes('beta')) return 'Beta content - experimental features';
        break;
        
      case 'visibility':
        if (lowerCondition.includes('internal')) return 'Internal content - for internal use only';
        if (lowerCondition.includes('hidden')) return 'Hidden content - not visible to end users';
        break;
    }
    
    return `Custom condition: ${condition}`;
  }

  /**
   * Reset analyzer state for new analysis
   */
  private reset(): void {
    this.conditionUsage.clear();
    this.filesByCondition.clear();
    this.analyzedFiles = 0;
  }
}
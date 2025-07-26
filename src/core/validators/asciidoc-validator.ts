/**
 * AsciiDoc Validator - Comprehensive validation for AsciiDoc syntax
 * 
 * Provides validation capabilities to detect common AsciiDoc syntax issues,
 * orphaned markers, broken lists, and other structural problems.
 */

import { ValidationRule, ValidationIssue, VALIDATION_RULES, getValidationRules } from './validation-rules';

export interface ValidationOptions {
  /** Validation strictness level */
  strictness: 'strict' | 'normal' | 'lenient';
  /** Include severity levels to validate */
  includeSeverities: ('error' | 'warning' | 'info')[];
  /** Specific rules to enable/disable */
  enabledRules?: string[];
  /** Maximum number of issues to report (0 = no limit) */
  maxIssues?: number;
  /** Enable detailed analysis for better suggestions */
  detailedAnalysis?: boolean;
}

export interface ValidationResult {
  /** Total number of issues found */
  issueCount: number;
  /** Issues grouped by severity */
  issues: {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    info: ValidationIssue[];
  };
  /** Overall validation status */
  status: 'valid' | 'warnings' | 'errors';
  /** Summary statistics */
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
    rulesApplied: string[];
  };
}

export interface AutoFixResult {
  /** Fixed content */
  content: string;
  /** Number of issues fixed */
  fixesApplied: number;
  /** Issues that were fixed */
  fixedIssues: string[];
  /** Issues that couldn't be fixed */
  remainingIssues: ValidationIssue[];
  /** Validation result after fixes */
  validationResult: ValidationResult;
}

export class AsciiDocValidator {
  private options: ValidationOptions;
  private validationRules: ValidationRule[];

  constructor(options: Partial<ValidationOptions> = {}) {
    this.options = {
      strictness: 'normal',
      includeSeverities: ['error', 'warning'],
      maxIssues: 100,
      detailedAnalysis: true,
      ...options
    };

    // Filter rules based on options
    this.validationRules = this.filterRules();
  }

  /**
   * Validate AsciiDoc content and return comprehensive results
   */
  validate(content: string): ValidationResult {
    const allIssues: ValidationIssue[] = [];
    const rulesApplied: string[] = [];

    // Apply each validation rule
    for (const rule of this.validationRules) {
      if (this.isRuleEnabled(rule)) {
        try {
          const ruleIssues = rule.validate(content);
          allIssues.push(...ruleIssues);
          rulesApplied.push(rule.id);

          // Check max issues limit
          if (this.options.maxIssues && allIssues.length >= this.options.maxIssues) {
            break;
          }
        } catch (error) {
          console.warn(`Validation rule ${rule.id} failed:`, error);
        }
      }
    }

    // Group issues by severity
    const errors = allIssues.filter(issue => issue.severity === 'error');
    const warnings = allIssues.filter(issue => issue.severity === 'warning');
    const info = allIssues.filter(issue => issue.severity === 'info');

    // Determine overall status
    let status: 'valid' | 'warnings' | 'errors' = 'valid';
    if (errors.length > 0) {
      status = 'errors';
    } else if (warnings.length > 0) {
      status = 'warnings';
    }

    return {
      issueCount: allIssues.length,
      issues: { errors, warnings, info },
      status,
      summary: {
        errorCount: errors.length,
        warningCount: warnings.length,
        infoCount: info.length,
        rulesApplied
      }
    };
  }

  /**
   * Quick validation that returns only a boolean result
   */
  isValid(content: string): boolean {
    const result = this.validate(content);
    return result.status === 'valid' || 
           (result.status === 'warnings' && this.options.strictness === 'lenient');
  }

  /**
   * Get validation issues as a formatted string report
   */
  getReport(content: string): string {
    const result = this.validate(content);
    const lines = content.split('\n');
    
    let report = '';
    
    // Header
    report += `AsciiDoc Validation Report\n`;
    report += `${'='.repeat(30)}\n`;
    report += `Status: ${result.status.toUpperCase()}\n`;
    report += `Total Issues: ${result.issueCount}\n`;
    report += `Errors: ${result.summary.errorCount}, Warnings: ${result.summary.warningCount}, Info: ${result.summary.infoCount}\n\n`;

    // Group all issues by line number for better readability
    const allIssues = [...result.issues.errors, ...result.issues.warnings, ...result.issues.info];
    const issuesByLine = new Map<number, ValidationIssue[]>();
    
    allIssues.forEach(issue => {
      if (!issuesByLine.has(issue.line)) {
        issuesByLine.set(issue.line, []);
      }
      issuesByLine.get(issue.line)!.push(issue);
    });

    // Sort by line number
    const sortedLines = Array.from(issuesByLine.keys()).sort((a, b) => a - b);

    sortedLines.forEach(lineNum => {
      const lineIssues = issuesByLine.get(lineNum)!;
      const lineContent = lines[lineNum - 1] || '';
      
      report += `Line ${lineNum}: ${lineContent}\n`;
      
      lineIssues.forEach(issue => {
        const icon = this.getSeverityIcon(issue.severity);
        report += `  ${icon} [${issue.severity.toUpperCase()}] ${issue.message}\n`;
        if (issue.suggestion) {
          report += `    💡 Suggestion: ${issue.suggestion}\n`;
        }
      });
      report += '\n';
    });

    // Summary of rules applied
    if (result.summary.rulesApplied.length > 0) {
      report += `Rules Applied: ${result.summary.rulesApplied.join(', ')}\n`;
    }

    return report;
  }

  /**
   * Update validation options
   */
  updateOptions(newOptions: Partial<ValidationOptions>): void {
    this.options = { ...this.options, ...newOptions };
    this.validationRules = this.filterRules();
  }

  /**
   * Get current validation options
   */
  getOptions(): ValidationOptions {
    return { ...this.options };
  }

  /**
   * Filter rules based on current options
   */
  private filterRules(): ValidationRule[] {
    let rules = VALIDATION_RULES;

    // Filter by severity
    rules = rules.filter(rule => 
      this.options.includeSeverities.includes(rule.severity)
    );

    // Filter by enabled rules if specified
    if (this.options.enabledRules) {
      rules = rules.filter(rule => 
        this.options.enabledRules!.includes(rule.id)
      );
    }

    // Apply strictness filtering
    if (this.options.strictness === 'lenient') {
      // In lenient mode, only include errors
      rules = rules.filter(rule => rule.severity === 'error');
    } else if (this.options.strictness === 'strict') {
      // In strict mode, include all severities
      // (no additional filtering needed)
    }

    return rules;
  }

  /**
   * Check if a rule is enabled based on current options
   */
  private isRuleEnabled(rule: ValidationRule): boolean {
    return this.validationRules.includes(rule);
  }

  /**
   * Get appropriate icon for severity level
   */
  private getSeverityIcon(severity: 'error' | 'warning' | 'info'): string {
    switch (severity) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '•';
    }
  }

  /**
   * Validate specific aspects of AsciiDoc content
   */
  validateLists(content: string): ValidationIssue[] {
    const listRules = this.validationRules.filter(rule => 
      rule.id.includes('list') || rule.id.includes('continuation')
    );
    
    const issues: ValidationIssue[] = [];
    for (const rule of listRules) {
      issues.push(...rule.validate(content));
    }
    
    return issues;
  }

  /**
   * Validate table syntax specifically
   */
  validateTables(content: string): ValidationIssue[] {
    const tableRules = this.validationRules.filter(rule => 
      rule.id.includes('table')
    );
    
    const issues: ValidationIssue[] = [];
    for (const rule of tableRules) {
      issues.push(...rule.validate(content));
    }
    
    return issues;
  }

  /**
   * Validate image macros specifically
   */
  validateImages(content: string): ValidationIssue[] {
    const imageRules = this.validationRules.filter(rule => 
      rule.id.includes('image')
    );
    
    const issues: ValidationIssue[] = [];
    for (const rule of imageRules) {
      issues.push(...rule.validate(content));
    }
    
    return issues;
  }

  /**
   * Auto-fix common AsciiDoc issues
   */
  autoFix(content: string): AutoFixResult {
    let fixedContent = content;
    const fixedIssues: string[] = [];
    let fixesApplied = 0;

    // Apply auto-fixes in order of importance
    const fixes = [
      this.fixOrphanedContinuationMarkers.bind(this),
      this.fixAdmonitionSpacing.bind(this),
      this.fixListFormatting.bind(this),
      this.fixBlockSpacing.bind(this),
      this.fixInlineImages.bind(this),
      this.removeDuplicateBlankLines.bind(this)
    ];

    for (const fix of fixes) {
      const result = fix(fixedContent);
      if (result.fixed) {
        fixedContent = result.content;
        fixesApplied += result.fixesApplied;
        fixedIssues.push(...result.issues);
      }
    }

    // Validate the fixed content
    const validationResult = this.validate(fixedContent);
    const remainingIssues = [
      ...validationResult.issues.errors,
      ...validationResult.issues.warnings,
      ...validationResult.issues.info
    ];

    return {
      content: fixedContent,
      fixesApplied,
      fixedIssues,
      remainingIssues,
      validationResult
    };
  }

  /**
   * Fix orphaned continuation markers
   */
  private fixOrphanedContinuationMarkers(content: string): { content: string; fixed: boolean; fixesApplied: number; issues: string[] } {
    const lines = content.split('\n');
    const fixedLines: string[] = [];
    let fixesApplied = 0;
    const issues: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check for orphaned continuation marker
      if (trimmedLine === '+') {
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';

        // If previous line is empty or next line is empty, remove the orphaned marker
        if (prevLine === '' || nextLine === '') {
          // Skip this line (remove orphaned marker)
          fixesApplied++;
          issues.push(`Removed orphaned continuation marker at line ${i + 1}`);
          continue;
        }
      }

      fixedLines.push(line);
    }

    return {
      content: fixedLines.join('\n'),
      fixed: fixesApplied > 0,
      fixesApplied,
      issues
    };
  }

  /**
   * Fix spacing around admonitions
   */
  private fixAdmonitionSpacing(content: string): { content: string; fixed: boolean; fixesApplied: number; issues: string[] } {
    let fixedContent = content;
    let fixesApplied = 0;
    const issues: string[] = [];

    // Fix admonition block spacing
    const admonitionPatterns = [
      /(\n)(\[NOTE\]|\[TIP\]|\[WARNING\]|\[CAUTION\]|\[IMPORTANT\])\n====\n/g,
      /(\n)====(\n)((?:\n|.)*?)(\n)====(\n)/g
    ];

    // Ensure proper spacing before admonitions
    fixedContent = fixedContent.replace(
      /([^\n])\n(\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\])/g,
      (match, beforeChar, admonition) => {
        fixesApplied++;
        issues.push('Fixed spacing before admonition');
        return `${beforeChar}\n\n${admonition}`;
      }
    );

    // Ensure proper spacing after admonitions
    fixedContent = fixedContent.replace(
      /(====)\n([^\n])/g,
      (match, endMarker, nextChar) => {
        fixesApplied++;
        issues.push('Fixed spacing after admonition');
        return `${endMarker}\n\n${nextChar}`;
      }
    );

    return {
      content: fixedContent,
      fixed: fixesApplied > 0,
      fixesApplied,
      issues
    };
  }

  /**
   * Fix list formatting issues
   */
  private fixListFormatting(content: string): { content: string; fixed: boolean; fixesApplied: number; issues: string[] } {
    const lines = content.split('\n');
    const fixedLines: string[] = [];
    let fixesApplied = 0;
    const issues: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Fix list continuation spacing
      if (trimmedLine === '+' && i > 0 && i < lines.length - 1) {
        const prevLine = lines[i - 1].trim();
        const nextLine = lines[i + 1].trim();

        // Only keep continuation marker if it's properly used
        if (prevLine !== '' && nextLine !== '' && !nextLine.startsWith('.') && !nextLine.startsWith('*')) {
          fixedLines.push(line);
        } else {
          // Add proper spacing around continuation
          if (prevLine !== '') {
            fixedLines.push('+');
            if (nextLine !== '') {
              // Ensure there's content after continuation
              fixesApplied++;
              issues.push(`Fixed list continuation at line ${i + 1}`);
            }
          }
        }
      } else {
        fixedLines.push(line);
      }
    }

    return {
      content: fixedLines.join('\n'),
      fixed: fixesApplied > 0,
      fixesApplied,
      issues
    };
  }

  /**
   * Fix spacing around block elements
   */
  private fixBlockSpacing(content: string): { content: string; fixed: boolean; fixesApplied: number; issues: string[] } {
    let fixedContent = content;
    let fixesApplied = 0;
    const issues: string[] = [];

    // Ensure blank lines before and after images
    fixedContent = fixedContent.replace(
      /([^\n])\n(image::)/g,
      (match, beforeChar, imageTag) => {
        fixesApplied++;
        issues.push('Fixed spacing before block image');
        return `${beforeChar}\n\n${imageTag}`;
      }
    );

    // Ensure blank lines after images
    fixedContent = fixedContent.replace(
      /(image::[^\n]*\n)([^\n])/g,
      (match, imageBlock, nextChar) => {
        if (!nextChar.match(/^\s*$/)) {
          fixesApplied++;
          issues.push('Fixed spacing after block image');
          return `${imageBlock}\n${nextChar}`;
        }
        return match;
      }
    );

    return {
      content: fixedContent,
      fixed: fixesApplied > 0,
      fixesApplied,
      issues
    };
  }

  /**
   * Fix inline images spacing
   */
  private fixInlineImages(content: string): { content: string; fixed: boolean; fixesApplied: number; issues: string[] } {
    let fixedContent = content;
    let fixesApplied = 0;
    const issues: string[] = [];

    // Fix spacing around inline images (ensure spaces around inline images in text)
    fixedContent = fixedContent.replace(
      /(\w)(image:[^[]*\[[^\]]*\])(\w)/g,
      (match, beforeChar, imageTag, afterChar) => {
        fixesApplied++;
        issues.push('Fixed spacing around inline image');
        return `${beforeChar} ${imageTag} ${afterChar}`;
      }
    );

    return {
      content: fixedContent,
      fixed: fixesApplied > 0,
      fixesApplied,
      issues
    };
  }

  /**
   * Remove excessive blank lines
   */
  private removeDuplicateBlankLines(content: string): { content: string; fixed: boolean; fixesApplied: number; issues: string[] } {
    let fixedContent = content;
    let fixesApplied = 0;
    const issues: string[] = [];

    // Replace multiple consecutive blank lines with single blank line
    const before = fixedContent;
    fixedContent = fixedContent.replace(/\n\s*\n\s*\n+/g, '\n\n');
    
    if (before !== fixedContent) {
      fixesApplied = (before.match(/\n\s*\n\s*\n+/g) || []).length;
      issues.push(`Removed ${fixesApplied} sets of excessive blank lines`);
    }

    return {
      content: fixedContent,
      fixed: fixesApplied > 0,
      fixesApplied,
      issues
    };
  }
}

/**
 * Convenience function for quick validation
 */
export function validateAsciiDoc(content: string, options?: Partial<ValidationOptions>): ValidationResult {
  const validator = new AsciiDocValidator(options);
  return validator.validate(content);
}

/**
 * Convenience function for getting a validation report
 */
export function getValidationReport(content: string, options?: Partial<ValidationOptions>): string {
  const validator = new AsciiDocValidator(options);
  return validator.getReport(content);
}
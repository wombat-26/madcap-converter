/**
 * MadCap HTM Validation Service
 * 
 * Specialized validation service for MadCap Flare HTM files that validates against
 * XHTML standards and identifies MadCap-specific structural issues.
 */

import { w3cHtmlValidator } from 'w3c-html-validator';
import { HtmlValidate, Result } from 'html-validate';
import * as cheerio from 'cheerio';
import { readFileSync } from 'fs';

export interface MadCapValidationError {
  type: 'critical' | 'warning' | 'info';
  category: 'xhtml' | 'list-nesting' | 'madcap-elements' | 'structure';
  line?: number;
  column?: number;
  message: string;
  element?: string;
  source: 'w3c' | 'html-validate' | 'madcap-custom';
}

export interface MadCapValidationResult {
  isValid: boolean;
  filePath?: string;
  errors: MadCapValidationError[];
  warnings: MadCapValidationError[];
  madcapSpecificIssues: MadCapValidationError[];
  summary: {
    totalErrors: number;
    criticalErrors: number;
    listNestingErrors: number;
    xhtmlErrors: number;
    madcapElementErrors: number;
  };
}

export interface FlareProjectValidationReport {
  projectPath: string;
  totalFiles: number;
  validFiles: number;
  filesWithErrors: number;
  results: Map<string, MadCapValidationResult>;
  commonErrors: Map<string, number>;
}

export class MadCapHTMValidationService {
  private htmlValidate: HtmlValidate;
  private readonly madcapElementPatterns = [
    'MadCap:dropDown',
    'MadCap:dropDownHead', 
    'MadCap:dropDownHotspot',
    'MadCap:dropDownBody',
    'MadCap:xref',
    'MadCap:variable',
    'MadCap:snippetBlock',
    'MadCap:snippetText'
  ];

  constructor() {
    // Configure html-validate for XHTML mode
    this.htmlValidate = new HtmlValidate({
      extends: ['html-validate:recommended'],
      rules: {
        'void-content': 'error',
        'void-style': 'error',
        'close-order': 'error',
        'element-required-content': 'error',
        'element-permitted-content': 'error',
        'no-unknown-elements': 'off', // Allow MadCap elements
        'require-closing-tags': 'error'
      }
    });
  }

  /**
   * Validate a single MadCap HTM file
   */
  async validateFlareFile(filePath: string): Promise<MadCapValidationResult> {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return await this.validateFlareContent(content, filePath);
    } catch (error) {
      return {
        isValid: false,
        filePath,
        errors: [{
          type: 'critical',
          category: 'structure',
          message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
          source: 'madcap-custom'
        }],
        warnings: [],
        madcapSpecificIssues: [],
        summary: {
          totalErrors: 1,
          criticalErrors: 1,
          listNestingErrors: 0,
          xhtmlErrors: 0,
          madcapElementErrors: 0
        }
      };
    }
  }

  /**
   * Validate MadCap HTM content
   */
  async validateFlareContent(html: string, filePath?: string): Promise<MadCapValidationResult> {
    const errors: MadCapValidationError[] = [];
    const warnings: MadCapValidationError[] = [];
    const madcapSpecificIssues: MadCapValidationError[] = [];

    // Clean HTML for W3C validation (temporarily remove MadCap elements)
    const cleanedHtml = this.prepareMadCapForValidation(html);

    // 1. W3C Validation (using Nu HTML Checker)
    try {
      const w3cResult = await w3cHtmlValidator.validate({
        html: cleanedHtml,
        output: 'json'
      });

      if (w3cResult.messages) {
        w3cResult.messages.forEach(msg => {
          const error: MadCapValidationError = {
            type: msg.type === 'error' ? 'critical' : 'warning',
            category: this.categorizeW3CError(msg.message || ''),
            line: msg.lastLine || (msg as any).firstLine,
            column: msg.lastColumn || (msg as any).firstColumn,
            message: msg.message || 'Unknown validation error',
            source: 'w3c'
          };

          if (error.type === 'critical') {
            errors.push(error);
          } else {
            warnings.push(error);
          }
        });
      }
    } catch (w3cError) {
      warnings.push({
        type: 'warning',
        category: 'structure',
        message: `W3C validation failed: ${w3cError instanceof Error ? w3cError.message : String(w3cError)}`,
        source: 'w3c'
      });
    }

    // 2. html-validate for XHTML compliance
    try {
      const htmlValidateResult = await this.htmlValidate.validateString(html);
      if (htmlValidateResult.results) {
        htmlValidateResult.results.forEach((result: any) => {
          result.messages.forEach((msg: any) => {
            const error: MadCapValidationError = {
              type: msg.severity === 2 ? 'critical' : 'warning',
              category: this.categorizeHtmlValidateError(msg.ruleId || ''),
              line: msg.line,
              column: msg.column,
              message: msg.message,
              element: msg.selector,
              source: 'html-validate'
            };

            if (error.type === 'critical') {
              errors.push(error);
            } else {
              warnings.push(error);
            }
          });
        });
      }
    } catch (htmlValidateError) {
      warnings.push({
        type: 'warning',
        category: 'structure',
        message: `HTML-validate failed: ${htmlValidateError instanceof Error ? htmlValidateError.message : String(htmlValidateError)}`,
        source: 'html-validate'
      });
    }

    // 3. MadCap-specific validation
    const madcapIssues = this.validateMadCapSpecific(html);
    madcapSpecificIssues.push(...madcapIssues);

    // 4. List nesting validation
    const listIssues = this.validateListNesting(html);
    errors.push(...listIssues);

    // Calculate summary
    const summary = {
      totalErrors: errors.length,
      criticalErrors: errors.filter(e => e.type === 'critical').length,
      listNestingErrors: errors.filter(e => e.category === 'list-nesting').length,
      xhtmlErrors: errors.filter(e => e.category === 'xhtml').length,
      madcapElementErrors: madcapSpecificIssues.length
    };

    return {
      isValid: errors.length === 0,
      filePath,
      errors,
      warnings,
      madcapSpecificIssues,
      summary
    };
  }

  /**
   * Validate list nesting specifically for MadCap patterns
   */
  private validateListNesting(html: string): MadCapValidationError[] {
    const errors: MadCapValidationError[] = [];
    const $ = cheerio.load(html, { xmlMode: false });

    // Check for invalid direct children in lists
    $('ul, ol').each((index, element) => {
      const $list = $(element);
      const children = $list.children();
      
      children.each((childIndex, child) => {
        const tagName = child.tagName.toLowerCase();
        
        // Only li, script, and template are allowed as direct children
        if (!['li', 'script', 'template'].includes(tagName)) {
          errors.push({
            type: 'critical',
            category: 'list-nesting',
            message: `Invalid direct child <${tagName}> in <${element.tagName.toLowerCase()}>. Only <li>, <script>, and <template> elements are allowed.`,
            element: `${element.tagName.toLowerCase()} > ${tagName}`,
            source: 'madcap-custom'
          });
        }
      });

      // Check for orphaned text nodes
      $list.contents().filter(function() {
        return this.nodeType === 3 && $(this).text().trim().length > 0;
      }).each((textIndex, textNode) => {
        errors.push({
          type: 'critical',
          category: 'list-nesting',
          message: `Orphaned text content in <${element.tagName.toLowerCase()}>: "${$(textNode).text().trim()}"`,
          element: element.tagName.toLowerCase(),
          source: 'madcap-custom'
        });
      });
    });

    // Check for orphaned list items
    $('li').each((index, element) => {
      const $li = $(element);
      const parent = $li.parent()[0];
      
      if (!parent || !['ul', 'ol'].includes(parent.tagName.toLowerCase())) {
        errors.push({
          type: 'critical',
          category: 'list-nesting',
          message: `Orphaned <li> element outside of <ul> or <ol>`,
          element: 'li',
          source: 'madcap-custom'
        });
      }
    });

    // Check for improper nested list placement
    $('ul ul, ol ol, ul ol, ol ul').each((index, element) => {
      const $nestedList = $(element);
      const $parent = $nestedList.parent();
      
      if ($parent[0] && $parent[0].tagName.toLowerCase() !== 'li') {
        errors.push({
          type: 'critical',
          category: 'list-nesting',
          message: `Nested <${element.tagName.toLowerCase()}> should be inside a <li> element, not <${$parent[0].tagName.toLowerCase()}>`,
          element: `${$parent[0].tagName.toLowerCase()} > ${element.tagName.toLowerCase()}`,
          source: 'madcap-custom'
        });
      }
    });

    return errors;
  }

  /**
   * Validate MadCap-specific elements and patterns
   */
  private validateMadCapSpecific(html: string): MadCapValidationError[] {
    const errors: MadCapValidationError[] = [];
    const $ = cheerio.load(html, { xmlMode: false });

    // Check for unclosed MadCap elements
    this.madcapElementPatterns.forEach(pattern => {
      const selector = pattern.replace(':', '\\:');
      $(selector).each((index, element) => {
        const $element = $(element);
        
        // Check for required attributes
        if (pattern === 'MadCap:variable' && !$element.attr('name')) {
          errors.push({
            type: 'critical',
            category: 'madcap-elements',
            message: `<${pattern}> element missing required 'name' attribute`,
            element: pattern,
            source: 'madcap-custom'
          });
        }
        
        if ((pattern === 'MadCap:snippetBlock' || pattern === 'MadCap:snippetText') && !$element.attr('src')) {
          errors.push({
            type: 'critical',
            category: 'madcap-elements',
            message: `<${pattern}> element missing required 'src' attribute`,
            element: pattern,
            source: 'madcap-custom'
          });
        }
      });
    });

    // Check for malformed MadCap dropdown structures
    $('MadCap\\:dropDown').each((index, element) => {
      const $dropdown = $(element);
      const hasHead = $dropdown.children('MadCap\\:dropDownHead').length > 0;
      const hasBody = $dropdown.children('MadCap\\:dropDownBody').length > 0;
      
      if (!hasHead) {
        errors.push({
          type: 'critical',
          category: 'madcap-elements',
          message: 'MadCap:dropDown missing required MadCap:dropDownHead child',
          element: 'MadCap:dropDown',
          source: 'madcap-custom'
        });
      }
      
      if (!hasBody) {
        errors.push({
          type: 'critical',
          category: 'madcap-elements',
          message: 'MadCap:dropDown missing required MadCap:dropDownBody child',
          element: 'MadCap:dropDown',
          source: 'madcap-custom'
        });
      }
    });

    return errors;
  }

  /**
   * Prepare MadCap HTML for W3C validation by temporarily removing MadCap elements
   */
  private prepareMadCapForValidation(html: string): string {
    let cleaned = html;
    
    // Replace MadCap elements with div equivalents for validation
    const madcapReplacements = [
      { from: /<MadCap:dropDown[^>]*>/g, to: '<div class="madcap-dropdown">' },
      { from: /<\/MadCap:dropDown>/g, to: '</div>' },
      { from: /<MadCap:dropDownHead[^>]*>/g, to: '<div class="madcap-dropdown-head">' },
      { from: /<\/MadCap:dropDownHead>/g, to: '</div>' },
      { from: /<MadCap:dropDownHotspot[^>]*>/g, to: '<span class="madcap-hotspot">' },
      { from: /<\/MadCap:dropDownHotspot>/g, to: '</span>' },
      { from: /<MadCap:dropDownBody[^>]*>/g, to: '<div class="madcap-dropdown-body">' },
      { from: /<\/MadCap:dropDownBody>/g, to: '</div>' },
      { from: /<MadCap:variable[^>]*\/>/g, to: '<span class="madcap-variable"></span>' },
      { from: /<MadCap:variable[^>]*>[^<]*<\/MadCap:variable>/g, to: '<span class="madcap-variable"></span>' },
      { from: /<MadCap:xref[^>]*>/g, to: '<a href="#">' },
      { from: /<\/MadCap:xref>/g, to: '</a>' },
      { from: /<MadCap:snippetBlock[^>]*\/>/g, to: '<div class="madcap-snippet"></div>' },
      { from: /<MadCap:snippetText[^>]*\/>/g, to: '<span class="madcap-snippet"></span>' }
    ];

    madcapReplacements.forEach(replacement => {
      cleaned = cleaned.replace(replacement.from, replacement.to);
    });

    return cleaned;
  }

  /**
   * Categorize W3C validation errors
   */
  private categorizeW3CError(message: string): MadCapValidationError['category'] {
    if (message.includes('list') || message.includes('li') || message.includes('ul') || message.includes('ol')) {
      return 'list-nesting';
    }
    if (message.includes('tag') || message.includes('element') || message.includes('unclosed')) {
      return 'xhtml';
    }
    return 'structure';
  }

  /**
   * Categorize html-validate errors
   */
  private categorizeHtmlValidateError(ruleId: string): MadCapValidationError['category'] {
    if (ruleId.includes('close') || ruleId.includes('void') || ruleId.includes('tag')) {
      return 'xhtml';
    }
    if (ruleId.includes('content') || ruleId.includes('permitted')) {
      return 'list-nesting';
    }
    return 'structure';
  }

  /**
   * Batch validate a MadCap Flare project
   */
  async batchValidateFlareProject(contentDir: string): Promise<FlareProjectValidationReport> {
    const glob = await import('glob');
    const htmFiles = glob.sync(`${contentDir}/**/*.htm`).filter((file: string) => !file.includes('/._'));
    
    const results = new Map<string, MadCapValidationResult>();
    const commonErrors = new Map<string, number>();
    let validFiles = 0;
    let filesWithErrors = 0;

    for (const file of htmFiles) {
      const result = await this.validateFlareFile(file);
      results.set(file, result);
      
      if (result.isValid) {
        validFiles++;
      } else {
        filesWithErrors++;
        
        // Track common errors
        result.errors.forEach(error => {
          const key = `${error.category}: ${error.message}`;
          commonErrors.set(key, (commonErrors.get(key) || 0) + 1);
        });
      }

      // Rate limiting for W3C validator
      await new Promise(resolve => setTimeout(resolve, 1100));
    }

    return {
      projectPath: contentDir,
      totalFiles: htmFiles.length,
      validFiles,
      filesWithErrors,
      results,
      commonErrors
    };
  }

  /**
   * Generate a validation report
   */
  generateReport(result: MadCapValidationResult): string {
    const lines: string[] = [];
    lines.push(`MadCap HTM Validation Report`);
    lines.push(`${'='.repeat(40)}`);
    
    if (result.filePath) {
      lines.push(`File: ${result.filePath}`);
    }
    
    lines.push(`Status: ${result.isValid ? 'VALID' : 'INVALID'}`);
    lines.push('');
    
    lines.push(`Summary:`);
    lines.push(`  Total Errors: ${result.summary.totalErrors}`);
    lines.push(`  Critical Errors: ${result.summary.criticalErrors}`);
    lines.push(`  List Nesting Errors: ${result.summary.listNestingErrors}`);
    lines.push(`  XHTML Errors: ${result.summary.xhtmlErrors}`);
    lines.push(`  MadCap Element Errors: ${result.summary.madcapElementErrors}`);
    lines.push('');

    if (result.errors.length > 0) {
      lines.push(`Errors:`);
      result.errors.forEach(error => {
        lines.push(`  [${error.type.toUpperCase()}] ${error.category}: ${error.message}`);
        if (error.line) {
          lines.push(`    Line ${error.line}${error.column ? `, Column ${error.column}` : ''}`);
        }
      });
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push(`Warnings:`);
      result.warnings.forEach(warning => {
        lines.push(`  [WARNING] ${warning.category}: ${warning.message}`);
      });
      lines.push('');
    }

    if (result.madcapSpecificIssues.length > 0) {
      lines.push(`MadCap-Specific Issues:`);
      result.madcapSpecificIssues.forEach(issue => {
        lines.push(`  [${issue.type.toUpperCase()}] ${issue.message}`);
      });
    }

    return lines.join('\n');
  }
}
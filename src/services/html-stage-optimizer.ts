/**
 * HTML Stage Optimizer
 * 
 * Optimizes the handoff between Cheerio (validation/fixing) and JSDOM (conversion)
 * stages to ensure seamless integration and maximum performance.
 */

export interface StageHandoffOptions {
  preserveFormatting?: boolean;
  optimizeForJSDOM?: boolean;
  validateTransition?: boolean;
  normalizeWhitespace?: boolean;
  ensureWellFormed?: boolean;
}

export interface StageHandoffResult {
  optimizedHTML: string;
  optimizations: string[];
  warnings: string[];
  isWellFormed: boolean;
  processingTime: number;
}

export class HTMLStageOptimizer {
  
  /**
   * Optimize HTML for handoff from Cheerio stage to JSDOM stage
   */
  static optimizeCheerioToJSDOM(
    cheerioHTML: string, 
    options: StageHandoffOptions = {}
  ): StageHandoffResult {
    const startTime = Date.now();
    const optimizations: string[] = [];
    const warnings: string[] = [];
    let optimizedHTML = cheerioHTML;

    const {
      preserveFormatting = true,
      optimizeForJSDOM = true,
      validateTransition = true,
      normalizeWhitespace = false,
      ensureWellFormed = true
    } = options;

    // 1. Ensure proper HTML structure for JSDOM
    if (ensureWellFormed) {
      optimizedHTML = this.ensureWellFormedHTML(optimizedHTML);
      optimizations.push('Ensured well-formed HTML structure');
    }

    // 2. Normalize namespace declarations for MadCap elements
    if (optimizeForJSDOM) {
      const namespaceResult = this.optimizeNamespaces(optimizedHTML);
      optimizedHTML = namespaceResult.html;
      optimizations.push(...namespaceResult.optimizations);
      warnings.push(...namespaceResult.warnings);
    }

    // 3. Handle Cheerio-specific formatting artifacts
    const cheerioArtifactResult = this.cleanCheerioArtifacts(optimizedHTML);
    optimizedHTML = cheerioArtifactResult.html;
    optimizations.push(...cheerioArtifactResult.optimizations);

    // 4. Optimize whitespace handling
    if (normalizeWhitespace) {
      optimizedHTML = this.normalizeWhitespace(optimizedHTML);
      optimizations.push('Normalized whitespace for JSDOM compatibility');
    }

    // 5. Validate the transition
    let isWellFormed = true;
    if (validateTransition) {
      const validationResult = this.validateJSDOMCompatibility(optimizedHTML);
      isWellFormed = validationResult.isValid;
      warnings.push(...validationResult.warnings);
    }

    const processingTime = Date.now() - startTime;

    return {
      optimizedHTML,
      optimizations,
      warnings,
      isWellFormed,
      processingTime
    };
  }

  /**
   * Ensure HTML is well-formed for JSDOM parsing
   */
  private static ensureWellFormedHTML(html: string): string {
    let result = html;

    // Ensure DOCTYPE if missing (helps JSDOM)
    if (!result.toLowerCase().includes('<!doctype') && !result.toLowerCase().includes('<html')) {
      // If it's a fragment, don't add DOCTYPE, but ensure it's wrapped
      if (!result.trim().startsWith('<html')) {
        result = `<div class="fragment-wrapper">${result}</div>`;
      }
    }

    // Ensure proper encoding declaration
    if (result.includes('<head>') && !result.includes('charset')) {
      result = result.replace(
        '<head>',
        '<head>\n    <meta charset="UTF-8">'
      );
    }

    // Fix common self-closing tag issues that differ between Cheerio and JSDOM
    const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link'];
    selfClosingTags.forEach(tag => {
      // Convert self-closing tags to XHTML format for JSDOM
      const regex = new RegExp(`<${tag}([^>]*?)>`, 'gi');
      result = result.replace(regex, (match, attributes) => {
        if (!match.endsWith('/>')) {
          return `<${tag}${attributes} />`;
        }
        return match;
      });
    });

    return result;
  }

  /**
   * Optimize namespace declarations for JSDOM MadCap processing
   */
  private static optimizeNamespaces(html: string): {
    html: string;
    optimizations: string[];
    warnings: string[];
  } {
    const optimizations: string[] = [];
    const warnings: string[] = [];
    let result = html;

    // Ensure MadCap namespace is declared if MadCap elements are present
    if (result.includes('MadCap:') && !result.includes('xmlns:MadCap')) {
      // Add namespace declaration to html element or create one
      if (result.includes('<html')) {
        result = result.replace(
          /<html([^>]*?)>/i,
          (match, attributes) => {
            if (!attributes.includes('xmlns:MadCap')) {
              return `<html${attributes} xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">`;
            }
            return match;
          }
        );
        optimizations.push('Added MadCap namespace declaration to html element');
      } else {
        warnings.push('MadCap elements found but no html element to add namespace declaration');
      }
    }

    // Normalize namespace prefixes for consistency
    const namespaceMap = new Map([
      ['MadCap:', 'MadCap:'],
      ['madcap:', 'MadCap:'],
      ['MADCAP:', 'MadCap:']
    ]);

    namespaceMap.forEach((correct, variant) => {
      if (variant !== correct && result.includes(variant)) {
        const regex = new RegExp(variant.replace(':', '\\:'), 'g');
        result = result.replace(regex, correct);
        optimizations.push(`Normalized ${variant} to ${correct}`);
      }
    });

    return { html: result, optimizations, warnings };
  }

  /**
   * Clean Cheerio-specific formatting artifacts
   */
  private static cleanCheerioArtifacts(html: string): {
    html: string;
    optimizations: string[];
  } {
    const optimizations: string[] = [];
    let result = html;

    // Remove Cheerio's XML declaration if present (not needed for JSDOM HTML parsing)
    if (result.startsWith('<?xml')) {
      result = result.replace(/^<\?xml[^>]*\?>\s*/, '');
      optimizations.push('Removed XML declaration for HTML parsing');
    }

    // Fix Cheerio's handling of empty attributes
    result = result.replace(/(\w+)=""/g, '$1');
    if (result !== html) {
      optimizations.push('Cleaned empty attribute values');
    }

    // Normalize Cheerio's void element formatting for JSDOM
    const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
    voidElements.forEach(element => {
      const regex = new RegExp(`<${element}([^>]*?)\\s*>`, 'gi');
      result = result.replace(regex, `<${element}$1 />`);
    });

    return { html: result, optimizations };
  }

  /**
   * Normalize whitespace for consistent parsing
   */
  private static normalizeWhitespace(html: string): string {
    let result = html;

    // Normalize line endings
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Normalize excessive whitespace between elements (but preserve content whitespace)
    result = result.replace(/>\s{2,}</g, '>\n<');

    // Ensure proper indentation for nested elements
    result = result.replace(/(<[^>]+>)\s*\n\s*(<[^>]+>)/g, '$1\n    $2');

    return result;
  }

  /**
   * Validate HTML for JSDOM compatibility
   */
  private static validateJSDOMCompatibility(html: string): {
    isValid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let isValid = true;

    // Check for common JSDOM parsing issues
    const issues = [
      {
        pattern: /<[^>]+[^\/]>\s*<\/[^>]+>/,
        warning: 'Potential void element with closing tag detected'
      },
      {
        pattern: /xmlns:(\w+)="[^"]*"/g,
        warning: 'Namespace declarations found - ensure JSDOM xmlMode is appropriate'
      },
      {
        pattern: /<(\w+)([^>]*?)\/>/g,
        warning: 'Self-closing tags detected - verify JSDOM handles them correctly'
      }
    ];

    issues.forEach(issue => {
      if (issue.pattern.test(html)) {
        warnings.push(issue.warning);
      }
    });

    // Check for malformed elements that might cause JSDOM issues
    const elementPattern = /<(\w+)([^>]*?)>/g;
    let match;
    while ((match = elementPattern.exec(html)) !== null) {
      const [fullMatch, tagName, attributes] = match;
      
      // Check for unclosed quotes in attributes
      if (attributes && !this.validateAttributes(attributes)) {
        warnings.push(`Malformed attributes in <${tagName}> element`);
        isValid = false;
      }
    }

    return { isValid, warnings };
  }

  /**
   * Validate attribute syntax
   */
  private static validateAttributes(attributeString: string): boolean {
    // Simple validation for balanced quotes
    const quotes = attributeString.match(/"/g);
    return !quotes || quotes.length % 2 === 0;
  }

  /**
   * Prepare HTML for optimal JSDOM performance
   */
  static prepareForJSDOMPerformance(html: string): string {
    let result = html;

    // Remove unnecessary whitespace that can slow JSDOM parsing
    result = result.replace(/\s+/g, ' ');
    result = result.replace(/>\s+</g, '><');

    // Optimize script and style tags for faster parsing
    result = result.replace(/<script[^>]*>\s*<\/script>/g, '');
    result = result.replace(/<style[^>]*>\s*<\/style>/g, '');

    return result;
  }

  /**
   * Create performance-optimized transition
   */
  static createOptimizedTransition(
    cheerioHTML: string,
    targetStage: 'jsdom' | 'conversion' = 'jsdom'
  ): StageHandoffResult {
    const options: StageHandoffOptions = {
      preserveFormatting: true,
      optimizeForJSDOM: true,
      validateTransition: true,
      normalizeWhitespace: false,
      ensureWellFormed: true
    };

    if (targetStage === 'conversion') {
      // Additional optimizations for conversion stage
      options.normalizeWhitespace = true;
    }

    return this.optimizeCheerioToJSDOM(cheerioHTML, options);
  }

  /**
   * Generate transition report
   */
  static generateTransitionReport(result: StageHandoffResult): string {
    const lines: string[] = [];
    lines.push('HTML Stage Transition Report');
    lines.push('='.repeat(35));
    lines.push(`Processing Time: ${result.processingTime}ms`);
    lines.push(`Well-Formed: ${result.isWellFormed ? '✅' : '❌'}`);
    lines.push('');

    if (result.optimizations.length > 0) {
      lines.push('Applied Optimizations:');
      result.optimizations.forEach((opt, index) => {
        lines.push(`  ${index + 1}. ${opt}`);
      });
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      result.warnings.forEach((warning, index) => {
        lines.push(`  ${index + 1}. ${warning}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }
}
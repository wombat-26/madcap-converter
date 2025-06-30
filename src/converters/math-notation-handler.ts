/**
 * Mathematical notation handler for converting various math formats
 * to AsciiDoc and Markdown compatible representations
 */
export class MathNotationHandler {
  private readonly mathPatterns = {
    // LaTeX inline math: $...$
    latexInline: /\$([^$]+)\$/g,
    
    // LaTeX display math: $$...$$
    latexDisplay: /\$\$([^$]+)\$\$/g,
    
    // MathML elements
    mathml: /<math[^>]*>[\s\S]*?<\/math>/gi,
    
    // Common mathematical symbols
    symbols: {
      '±': '±',
      '×': '×',
      '÷': '÷',
      '≤': '≤',
      '≥': '≥',
      '≠': '≠',
      '≈': '≈',
      '∞': '∞',
      'α': 'α',
      'β': 'β',
      'γ': 'γ',
      'δ': 'δ',
      'π': 'π',
      'σ': 'σ',
      'Σ': 'Σ',
      'Δ': 'Δ',
      '∑': '∑',
      '∫': '∫',
      '√': '√',
      '²': '²',
      '³': '³',
      '½': '½',
      '¼': '¼',
      '¾': '¾'
    },
    
    // Scientific notation patterns
    scientificNotation: /(\d+(?:\.\d+)?)\s*[×x]\s*10\s*\^?\s*([+-]?\d+)/gi,
    
    // Fraction patterns
    fractions: /(\d+)\/(\d+)/g,
    
    // Subscript/superscript in HTML
    subscript: /<sub>(.*?)<\/sub>/gi,
    superscript: /<sup>(.*?)<\/sup>/gi,
    
    // Mathematical expressions in parentheses
    expressions: /\(([^)]*(?:[+\-*/=^√∑∫][^)]*)*)\)/g
  };

  /**
   * Convert mathematical notation for AsciiDoc format
   */
  convertForAsciiDoc(content: string): string {
    let result = content;

    // Handle LaTeX display math
    result = result.replace(this.mathPatterns.latexDisplay, (match, math) => {
      return `\n[latexmath]\n++++\n$$${math.trim()}$$\n++++\n`;
    });

    // Handle LaTeX inline math
    result = result.replace(this.mathPatterns.latexInline, (match, math) => {
      return `latexmath:[${math.trim()}]`;
    });

    // Handle MathML
    result = result.replace(this.mathPatterns.mathml, (match) => {
      return this.convertMathMLForAsciiDoc(match);
    });

    // Handle HTML subscript/superscript
    result = result.replace(this.mathPatterns.subscript, (match, content) => {
      return `~${content}~`;
    });

    result = result.replace(this.mathPatterns.superscript, (match, content) => {
      return `^${content}^`;
    });

    // Handle scientific notation
    result = result.replace(this.mathPatterns.scientificNotation, (match, base, exponent) => {
      return `${base} × 10^${exponent}^`;
    });

    // Handle simple fractions
    result = result.replace(this.mathPatterns.fractions, (match, numerator, denominator) => {
      // Only convert simple numeric fractions
      if (/^\d+$/.test(numerator) && /^\d+$/.test(denominator)) {
        return `${numerator}/${denominator}`;
      }
      return match;
    });

    // Preserve mathematical symbols (already Unicode-compatible with AsciiDoc)
    
    return result;
  }

  /**
   * Convert mathematical notation for Markdown format
   */
  convertForMarkdown(content: string): string {
    let result = content;

    // Handle LaTeX display math (if using KaTeX/MathJax)
    result = result.replace(this.mathPatterns.latexDisplay, (match, math) => {
      return `\n$$\n${math.trim()}\n$$\n`;
    });

    // Handle LaTeX inline math (if using KaTeX/MathJax)
    result = result.replace(this.mathPatterns.latexInline, (match, math) => {
      return `$${math.trim()}$`;
    });

    // Handle MathML - convert to readable text or LaTeX if possible
    result = result.replace(this.mathPatterns.mathml, (match) => {
      return this.convertMathMLForMarkdown(match);
    });

    // Handle HTML subscript/superscript
    result = result.replace(this.mathPatterns.subscript, (match, content) => {
      return `<sub>${content}</sub>`;
    });

    result = result.replace(this.mathPatterns.superscript, (match, content) => {
      return `<sup>${content}</sup>`;
    });

    // Handle scientific notation
    result = result.replace(this.mathPatterns.scientificNotation, (match, base, exponent) => {
      return `${base} × 10<sup>${exponent}</sup>`;
    });

    // Handle simple fractions - keep as-is for Markdown
    // Unicode fractions and symbols are preserved

    return result;
  }

  /**
   * Convert MathML to AsciiDoc format
   */
  private convertMathMLForAsciiDoc(mathml: string): string {
    // Extract basic mathematical content from MathML
    let content = mathml;
    
    // Remove MathML tags but preserve content
    content = content.replace(/<\/?math[^>]*>/gi, '');
    content = content.replace(/<mi>(.*?)<\/mi>/gi, '$1');
    content = content.replace(/<mn>(.*?)<\/mn>/gi, '$1');
    content = content.replace(/<mo>(.*?)<\/mo>/gi, ' $1 ');
    content = content.replace(/<mtext>(.*?)<\/mtext>/gi, '$1');
    
    // Handle fractions
    content = content.replace(/<mfrac><mi>(.*?)<\/mi><mi>(.*?)<\/mi><\/mfrac>/gi, 
      (match, num, den) => `${num}/${den}`);
    content = content.replace(/<mfrac><mn>(.*?)<\/mn><mn>(.*?)<\/mn><\/mfrac>/gi, 
      (match, num, den) => `${num}/${den}`);
    
    // Handle superscripts
    content = content.replace(/<msup><mi>(.*?)<\/mi><mn>(.*?)<\/mn><\/msup>/gi, 
      (match, base, exp) => `${base}^${exp}^`);
    
    // Handle subscripts
    content = content.replace(/<msub><mi>(.*?)<\/mi><mn>(.*?)<\/mn><\/msub>/gi, 
      (match, base, sub) => `${base}~${sub}~`);
    
    // Handle square roots
    content = content.replace(/<msqrt>(.*?)<\/msqrt>/gi, '√($1)');
    
    // Clean up extra whitespace
    content = content.replace(/\s+/g, ' ').trim();
    
    // If complex, wrap in math block
    if (content.includes('^') || content.includes('~') || content.includes('√')) {
      return `\nmath:[${content}]\n`;
    }
    
    return content;
  }

  /**
   * Convert MathML to Markdown format
   */
  private convertMathMLForMarkdown(mathml: string): string {
    // Extract basic mathematical content from MathML
    let content = mathml;
    
    // Remove MathML tags but preserve content
    content = content.replace(/<\/?math[^>]*>/gi, '');
    content = content.replace(/<mi>(.*?)<\/mi>/gi, '$1');
    content = content.replace(/<mn>(.*?)<\/mn>/gi, '$1');
    content = content.replace(/<mo>(.*?)<\/mo>/gi, ' $1 ');
    content = content.replace(/<mtext>(.*?)<\/mtext>/gi, '$1');
    
    // Handle fractions
    content = content.replace(/<mfrac><mi>(.*?)<\/mi><mi>(.*?)<\/mi><\/mfrac>/gi, 
      (match, num, den) => `${num}/${den}`);
    content = content.replace(/<mfrac><mn>(.*?)<\/mn><mn>(.*?)<\/mn><\/mfrac>/gi, 
      (match, num, den) => `${num}/${den}`);
    
    // Handle superscripts
    content = content.replace(/<msup><mi>(.*?)<\/mi><mn>(.*?)<\/mn><\/msup>/gi, 
      (match, base, exp) => `${base}<sup>${exp}</sup>`);
    
    // Handle subscripts
    content = content.replace(/<msub><mi>(.*?)<\/mi><mn>(.*?)<\/mn><\/msub>/gi, 
      (match, base, sub) => `${base}<sub>${sub}</sub>`);
    
    // Handle square roots
    content = content.replace(/<msqrt>(.*?)<\/msqrt>/gi, '√($1)');
    
    // Clean up extra whitespace
    content = content.replace(/\s+/g, ' ').trim();
    
    return content;
  }

  /**
   * Detect if content contains mathematical notation
   */
  containsMathNotation(content: string): boolean {
    return (
      this.mathPatterns.latexInline.test(content) ||
      this.mathPatterns.latexDisplay.test(content) ||
      this.mathPatterns.mathml.test(content) ||
      this.mathPatterns.scientificNotation.test(content) ||
      this.mathPatterns.subscript.test(content) ||
      this.mathPatterns.superscript.test(content) ||
      this.containsMathSymbols(content)
    );
  }

  /**
   * Check if content contains mathematical symbols
   */
  private containsMathSymbols(content: string): boolean {
    const mathSymbolPattern = /[±×÷≤≥≠≈∞αβγδπσΣΔ∑∫√²³½¼¾]/;
    return mathSymbolPattern.test(content);
  }

  /**
   * Convert mathematical expressions in table cells or inline content
   */
  convertInlineExpressions(content: string, format: 'asciidoc' | 'markdown'): string {
    let result = content;

    // Handle mathematical expressions in parentheses
    result = result.replace(this.mathPatterns.expressions, (match, expression) => {
      if (this.containsMathNotation(expression)) {
        if (format === 'asciidoc') {
          return `(${this.convertForAsciiDoc(expression)})`;
        } else {
          return `(${this.convertForMarkdown(expression)})`;
        }
      }
      return match;
    });

    return result;
  }

  /**
   * Process mathematical notation in document elements
   */
  processMathInDocument(document: Document, format: 'asciidoc' | 'markdown'): void {
    // Find elements that might contain math
    const mathContainers = document.querySelectorAll('p, td, th, li, div, span');
    
    mathContainers.forEach(element => {
      const content = element.innerHTML;
      
      if (this.containsMathNotation(content)) {
        let processedContent: string;
        
        if (format === 'asciidoc') {
          processedContent = this.convertForAsciiDoc(content);
        } else {
          processedContent = this.convertForMarkdown(content);
        }
        
        element.innerHTML = processedContent;
      }
    });

    // Handle dedicated math elements
    const mathElements = document.querySelectorAll('math, .math, .latex, .equation');
    mathElements.forEach(element => {
      const content = element.outerHTML;
      let replacement: string;
      
      if (format === 'asciidoc') {
        replacement = this.convertMathMLForAsciiDoc(content);
      } else {
        replacement = this.convertMathMLForMarkdown(content);
      }
      
      const textNode = document.createTextNode(replacement);
      element.parentNode?.replaceChild(textNode, element);
    });
  }
}
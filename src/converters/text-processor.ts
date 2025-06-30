/**
 * Smart text processor that handles spacing, punctuation, and formatting correctly
 */
export class TextProcessor {
  private readonly PUNCTUATION_REGEX = /^[.,;:!?)\]}]$/;
  private readonly OPENING_PUNCTUATION_REGEX = /^[(\[{]$/;
  private readonly QUOTE_REGEX = /^["']$/;
  private readonly SENTENCE_ENDING_REGEX = /[.!?]$/;
  private readonly PARAGRAPH_BOUNDARY_INDICATORS = /\n\s*\n|\r\n\s*\r\n/;
  
  /**
   * Process an array of text fragments intelligently, handling spacing and punctuation
   */
  processFragments(fragments: Array<{text: string, type: 'text' | 'formatted' | 'punctuation'}>): string {
    if (fragments.length === 0) return '';
    
    let result = '';
    
    for (let i = 0; i < fragments.length; i++) {
      const current = fragments[i];
      const previous = i > 0 ? fragments[i - 1] : null;
      const next = i < fragments.length - 1 ? fragments[i + 1] : null;
      
      // Add the current text
      result += current.text;
      
      // Determine if we need a space after this fragment
      if (i < fragments.length - 1 && this.needsSpaceAfter(current, next)) {
        result += ' ';
      }
    }
    
    return result;
  }
  
  /**
   * Determine if a space is needed between two fragments
   */
  private needsSpaceAfter(current: {text: string, type: string}, next: {text: string, type: string} | null): boolean {
    if (!next) return false;
    
    const currentText = current.text.trim();
    const nextText = next.text.trim();
    
    if (!currentText || !nextText) return false;
    
    // No space before closing punctuation
    if (this.PUNCTUATION_REGEX.test(nextText)) return false;
    
    // No space before formatted punctuation (like _._)
    if (next.type === 'formatted' && this.isFormattedPunctuation(nextText)) return false;
    
    // No space after opening punctuation
    if (this.OPENING_PUNCTUATION_REGEX.test(currentText)) return false;
    
    // No space between certain formatting markers and punctuation
    if (currentText.endsWith('_') && this.PUNCTUATION_REGEX.test(nextText)) return false;
    if (currentText.endsWith('*') && this.PUNCTUATION_REGEX.test(nextText)) return false;
    
    // No space inside quotes in certain cases
    if (this.QUOTE_REGEX.test(currentText) || this.QUOTE_REGEX.test(nextText)) {
      return this.shouldHaveSpaceAroundQuote(currentText, nextText);
    }
    
    // Default: add space
    return true;
  }
  
  private shouldHaveSpaceAroundQuote(current: string, next: string): boolean {
    // Opening quote at end of current: no space before next
    if (current.endsWith('"') || current.endsWith("'")) return false;
    
    // Closing quote at start of next: no space after current
    if (next.startsWith('"') || next.startsWith("'")) return false;
    
    return true;
  }
  
  /**
   * Process child nodes intelligently
   */
  processChildNodes(nodes: Node[], processor: (node: Node) => string): string {
    const fragments: Array<{text: string, type: 'text' | 'formatted' | 'punctuation'}> = [];
    
    for (const node of nodes) {
      if (node.nodeType === 3) { // Text node
        const text = node.textContent || '';
        if (text.trim()) {
          // Clean any residual alphabetic list markers that should be handled by list processor
          const cleanedText = text.replace(/^\s*[a-z]\.\s+/, '');
          if (cleanedText.trim()) {
            // Split text into words and punctuation
            const parts = this.tokenizeText(cleanedText);
            fragments.push(...parts);
          }
        }
      } else if (node.nodeType === 1) { // Element node
        const processed = processor(node);
        if (processed.trim()) {
          // Special handling for formatted elements that contain only punctuation
          if (this.isFormattingElement(node as Element)) {
            const innerText = node.textContent || '';
            if (innerText.trim() && this.PUNCTUATION_REGEX.test(innerText.trim())) {
              // This is a formatted punctuation mark - treat as a single formatted unit
              fragments.push({
                text: processed,
                type: 'formatted'
              });
            } else {
              fragments.push({
                text: processed,
                type: 'formatted'
              });
            }
          } else {
            fragments.push({
              text: processed,
              type: 'text'
            });
          }
        }
      }
    }
    
    return this.processFragments(fragments);
  }
  
  /**
   * Tokenize text into words and punctuation
   */
  private tokenizeText(text: string): Array<{text: string, type: 'text' | 'punctuation'}> {
    const tokens: Array<{text: string, type: 'text' | 'punctuation'}> = [];
    
    // More intelligent tokenization that preserves genitive apostrophes
    // Split on spaces and punctuation, but keep genitive apostrophes with their words
    const parts = text.split(/(\s+|[.,;:!?()\[\]{}"'])/g).filter(Boolean);
    
    // Reconstruct tokens, merging apostrophes with preceding words for genitives
    let i = 0;
    while (i < parts.length) {
      const part = parts[i];
      
      if (part.trim()) {
        // Check if this is an apostrophe that should be part of a genitive
        if (part === "'" && i > 0 && i < parts.length - 1) {
          const prevPart = parts[i - 1];
          const nextPart = parts[i + 1];
          
          // If previous part ends with 's' or 'x' and next is a space, this is likely genitive
          if (prevPart && prevPart.match(/[sx]$/i) && nextPart && nextPart.match(/^\s/)) {
            // Merge apostrophe with previous token
            if (tokens.length > 0) {
              tokens[tokens.length - 1].text += "'";
            }
            i++;
            continue;
          }
        }
        
        tokens.push({
          text: part,
          type: this.PUNCTUATION_REGEX.test(part) || this.OPENING_PUNCTUATION_REGEX.test(part) ? 'punctuation' : 'text'
        });
      }
      i++;
    }
    
    return tokens;
  }
  
  private isFormattingElement(element: Element): boolean {
    const tag = element.tagName.toLowerCase();
    return ['strong', 'b', 'em', 'i', 'code', 'span'].includes(tag);
  }
  
  private isFormattedPunctuation(text: string): boolean {
    // Check if the text is formatted punctuation like _._  or *,*
    const patterns = [
      /^_[.,;:!?]_$/,     // _._
      /^\*[.,;:!?]\*$/,   // *,*
      /^`[.,;:!?]`$/      // `,`
    ];
    return patterns.some(pattern => pattern.test(text));
  }

  /**
   * Detect sentence boundaries in text content
   */
  detectSentenceBoundaries(text: string): string[] {
    if (!text.trim()) return [];
    
    // Split on sentence-ending punctuation followed by whitespace and capital letter
    // This is a simplified approach that works well for technical documentation
    const sentences = text.split(/([.!?]+\s+)(?=[A-Z])/);
    
    // Recombine sentences with their punctuation
    const result: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i] || '';
      const punctuation = sentences[i + 1] || '';
      
      if (sentence.trim()) {
        result.push((sentence + punctuation).trim());
      }
    }
    
    return result.length > 0 ? result : [text.trim()];
  }

  /**
   * Detect paragraph boundaries in text content
   */
  detectParagraphBoundaries(text: string): string[] {
    if (!text.trim()) return [];
    
    // Split on double line breaks or explicit paragraph markers
    const paragraphs = text.split(this.PARAGRAPH_BOUNDARY_INDICATORS)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    return paragraphs.length > 0 ? paragraphs : [text.trim()];
  }

  /**
   * Determine if text content represents a complete sentence
   */
  isCompleteSentence(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;
    
    // Check if it ends with sentence-ending punctuation
    if (this.SENTENCE_ENDING_REGEX.test(trimmed)) {
      return true;
    }
    
    // Check for special cases like headings (usually complete thoughts)
    if (trimmed.length > 10 && /^[A-Z]/.test(trimmed)) {
      return true;
    }
    
    return false;
  }

  /**
   * Intelligently join text fragments with proper boundary handling
   */
  joinWithBoundaryDetection(fragments: string[], joinType: 'sentence' | 'paragraph' = 'sentence'): string {
    if (fragments.length === 0) return '';
    if (fragments.length === 1) return fragments[0];
    
    const separator = joinType === 'paragraph' ? '\n\n' : ' ';
    const result: string[] = [];
    
    for (let i = 0; i < fragments.length; i++) {
      const current = fragments[i].trim();
      const next = i < fragments.length - 1 ? fragments[i + 1].trim() : null;
      
      if (current) {
        result.push(current);
        
        // Add appropriate separator based on content analysis
        if (next) {
          if (joinType === 'paragraph') {
            result.push(separator);
          } else {
            // For sentence joining, be more intelligent about spacing
            const needsSpace = this.needsSpaceBetweenFragments(current, next);
            if (needsSpace) {
              result.push(' ');
            }
          }
        }
      }
    }
    
    return result.join('');
  }

  private needsSpaceBetweenFragments(current: string, next: string): boolean {
    // Don't add space if current ends with sentence punctuation and next starts with capital
    if (this.SENTENCE_ENDING_REGEX.test(current) && /^[A-Z]/.test(next)) {
      return true; // Actually, we do want a space here for readability
    }
    
    // Don't add space before punctuation
    if (this.PUNCTUATION_REGEX.test(next.charAt(0))) {
      return false;
    }
    
    // Default: add space
    return true;
  }
}
import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index.js';
import { MadCapPreprocessor } from '../services/madcap-preprocessor.js';
import { HTMLPreprocessor } from '../services/html-preprocessor.js';
import { VariableExtractor } from '../services/variable-extractor.js';

interface AsciiDocEdgeCaseRules {
  name: string;
  pattern: RegExp | ((element: Element) => boolean);
  handler: (element: Element, context?: ConversionContext) => string;
  priority: number;
}

interface ListContext {
  level: number;
  type: 'ordered' | 'unordered' | 'description';
  style?: string;
  parent?: ListContext;
  itemCount: number;
}

interface ConversionContext {
  inTable: boolean;
  inList: boolean;
  listStack: ListContext[];
  inAdmonition: boolean;
  inCodeBlock: boolean;
  currentIndent: number;
  variables: Map<string, string>;
  snippets: Map<string, string>;
  crossRefs: Map<string, string>;
}

export class EnhancedAsciiDocConverter implements DocumentConverter {
  supportedInputTypes = ['html'];
  private madCapPreprocessor: MadCapPreprocessor;
  private htmlPreprocessor: HTMLPreprocessor;
  private variableExtractor: VariableExtractor;
  private edgeCaseRules: AsciiDocEdgeCaseRules[] = [];
  
  constructor() {
    this.madCapPreprocessor = new MadCapPreprocessor();
    this.htmlPreprocessor = new HTMLPreprocessor();
    this.variableExtractor = new VariableExtractor();
    this.initializeEdgeCaseRules();
  }
  
  private initializeEdgeCaseRules(): void {
    // Based on https://docs.asciidoctor.org/asciidoc/latest/
    this.edgeCaseRules = [
      // MadCap-specific conversions (highest priority)
      {
        name: 'MadCap cross-references',
        pattern: (el) => el.tagName === 'MADCAP:XREF',
        handler: (el: Element) => {
          const href = el.getAttribute('href') || '';
          const text = el.textContent || '';
          const cleanHref = href.replace(/\.htm(l)?/, '.adoc');
          return `xref:${cleanHref}[${text}]`;
        },
        priority: 100
      },
      {
        name: 'MadCap snippets',
        pattern: (el) => el.tagName === 'MADCAP:SNIPPETBLOCK',
        handler: (el: Element) => {
          const src = el.getAttribute('src') || '';
          const cleanSrc = src.replace(/\.flsnp$/, '.adoc');
          return `\ninclude::${cleanSrc}[]\n`;
        },
        priority: 100
      },
      {
        name: 'MadCap dropdowns',
        pattern: (el) => el.tagName === 'MADCAP:DROPDOWN',
        handler: (el: Element) => {
          const hotspot = el.querySelector('madcap\\:dropdownhotspot');
          const body = el.querySelector('madcap\\:dropdownbody');
          const title = hotspot?.textContent?.trim() || 'Details';
          const content = body ? this.processElement(body, this.createContext()) : '';
          
          return `\n.${title}\n[%collapsible]\n====\n${content.trim()}\n====\n`;
        },
        priority: 100
      },
      
      // List handling with proper nesting
      {
        name: 'Ordered lists with custom styles',
        pattern: (el) => el.tagName === 'OL',
        handler: (el: Element, ctx?: ConversionContext) => {
          const style = el.getAttribute('style') || '';
          const listStyle = this.extractListStyle(style);
          return this.processListElement(el, 'ordered', ctx || this.createContext(), listStyle);
        },
        priority: 90
      },
      {
        name: 'Unordered lists',
        pattern: (el) => el.tagName === 'UL',
        handler: (el: Element, ctx?: ConversionContext) => {
          return this.processListElement(el, 'unordered', ctx || this.createContext());
        },
        priority: 90
      },
      {
        name: 'Description lists',
        pattern: (el) => el.tagName === 'DL',
        handler: (el: Element) => {
          let result = '\n';
          const children = Array.from(el.children);
          
          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.tagName === 'DT') {
              const term = this.processInlineContent(child);
              result += `${term}::\n`;
            } else if (child.tagName === 'DD') {
              const desc = this.processElement(child, this.createContext());
              result += `  ${desc.trim()}\n`;
            }
          }
          
          return result + '\n';
        },
        priority: 90
      },
      
      // Images with inline/block detection
      {
        name: 'Images',
        pattern: (el) => el.tagName === 'IMG',
        handler: (el: Element, ctx?: ConversionContext) => {
          const src = el.getAttribute('src') || '';
          const alt = el.getAttribute('alt') || el.getAttribute('title') || '';
          const style = el.getAttribute('style') || '';
          const className = el.getAttribute('class') || '';
          
          // Extract dimensions
          const dimensions = this.extractDimensions(style);
          const attrs = [];
          if (alt) attrs.push(alt);
          if (dimensions.width) attrs.push(`width=${dimensions.width}`);
          if (dimensions.height) attrs.push(`height=${dimensions.height}`);
          
          // Determine if inline or block
          const isInline = this.isInlineImage(el, className, dimensions);
          
          if (isInline) {
            if (className.includes('IconInline')) {
              attrs.push('role=icon');
            }
            return `image:${src}[${attrs.join(',')}]`;
          } else {
            return `\nimage::${src}[${attrs.join(',')}]\n`;
          }
        },
        priority: 80
      },
      
      // Note/Admonition blocks
      {
        name: 'Note blocks',
        pattern: (el) => el.classList.contains('note'),
        handler: (el: Element) => {
          // Remove the "Note:" prefix if present
          const content = this.processElement(el, this.createContext())
            .replace(/^Note:\s*/i, '')
            .replace(/^\s*<span[^>]*>Note:<\/span>\s*/i, '');
          
          return `\nNOTE: ${content.trim()}\n`;
        },
        priority: 85
      },
      {
        name: 'Warning blocks',
        pattern: (el) => el.classList.contains('warning'),
        handler: (el: Element) => {
          const content = this.processElement(el, this.createContext())
            .replace(/^Warning:\s*/i, '');
          
          return `\nWARNING: ${content.trim()}\n`;
        },
        priority: 85
      },
      {
        name: 'Tip blocks',
        pattern: (el) => el.classList.contains('tip'),
        handler: (el: Element) => {
          const content = this.processElement(el, this.createContext())
            .replace(/^Tip:\s*/i, '');
          
          return `\nTIP: ${content.trim()}\n`;
        },
        priority: 85
      },
      
      // Tables
      {
        name: 'Tables',
        pattern: (el) => el.tagName === 'TABLE',
        handler: (el: Element) => {
          return this.processTable(el);
        },
        priority: 75
      },
      
      // Code blocks and inline code
      {
        name: 'Code blocks',
        pattern: (el) => el.tagName === 'PRE',
        handler: (el: Element) => {
          const code = el.querySelector('code');
          const content = (code || el).textContent || '';
          const lang = code?.className?.match(/language-(\w+)/)?.[1] || '';
          
          return `\n[source${lang ? `,${lang}` : ''}]\n----\n${content}\n----\n`;
        },
        priority: 70
      },
      {
        name: 'Inline code',
        pattern: (el) => el.tagName === 'CODE' && el.parentElement?.tagName !== 'PRE',
        handler: (el: Element) => {
          return `\`${el.textContent}\``;
        },
        priority: 70
      },
      
      // Headings
      {
        name: 'Headings',
        pattern: (el) => /^H[1-6]$/.test(el.tagName),
        handler: (el: Element) => {
          const level = parseInt(el.tagName.substring(1));
          const text = this.processInlineContent(el);
          const equals = '='.repeat(level);
          
          // Add ID if present
          const id = el.id;
          const anchor = id ? `[[${id}]]` : '';
          
          return `\n${anchor}${anchor ? '\n' : ''}${equals} ${text}\n`;
        },
        priority: 95
      },
      
      // Links
      {
        name: 'Links',
        pattern: (el) => el.tagName === 'A',
        handler: (el: Element) => {
          const href = el.getAttribute('href') || '';
          const text = this.processInlineContent(el);
          
          // Convert .htm/.html to .adoc for internal links
          const cleanHref = href.replace(/\.htm(l)?($|#)/, '.adoc$2');
          
          if (href.startsWith('http')) {
            return `${cleanHref}[${text}]`;
          } else {
            return `link:${cleanHref}[${text}]`;
          }
        },
        priority: 60
      },
      
      // Text formatting
      {
        name: 'Bold text',
        pattern: (el) => el.tagName === 'B' || el.tagName === 'STRONG',
        handler: (el: Element) => {
          return `*${this.processInlineContent(el)}*`;
        },
        priority: 50
      },
      {
        name: 'Italic text',
        pattern: (el) => el.tagName === 'I' || el.tagName === 'EM',
        handler: (el: Element) => {
          return `_${this.processInlineContent(el)}_`;
        },
        priority: 50
      },
      {
        name: 'Keyboard',
        pattern: (el) => el.tagName === 'KBD',
        handler: (el: Element) => {
          return `kbd:[${el.textContent}]`;
        },
        priority: 50
      },
      
      // Paragraphs
      {
        name: 'Paragraphs',
        pattern: (el) => el.tagName === 'P',
        handler: (el: Element, ctx?: ConversionContext) => {
          const context = ctx || this.createContext();
          const content = this.processElement(el, context);
          
          // Handle paragraphs in lists
          if (context.inList && context.listStack.length > 0) {
            return content.trim();
          }
          
          return `\n${content.trim()}\n`;
        },
        priority: 30
      },
      
      // Line breaks
      {
        name: 'Line breaks',
        pattern: (el) => el.tagName === 'BR',
        handler: () => ' +\n',
        priority: 20
      },
      
      // Blockquotes
      {
        name: 'Blockquotes',
        pattern: (el) => el.tagName === 'BLOCKQUOTE',
        handler: (el: Element) => {
          const content = this.processElement(el, this.createContext());
          return `\n[quote]\n____\n${content.trim()}\n____\n`;
        },
        priority: 65
      }
    ];
    
    // Sort by priority (highest first)
    this.edgeCaseRules.sort((a, b) => b.priority - a.priority);
  }
  
  async convert(input: string | Buffer, options: ConversionOptions): Promise<ConversionResult> {
    try {
      this.variableExtractor.clear();
      
      let htmlContent = typeof input === 'string' ? input : input.toString('utf-8');
      
      // Apply preprocessing
      if (this.madCapPreprocessor.containsMadCapContent(htmlContent)) {
        htmlContent = await this.madCapPreprocessor.preprocessMadCapContent(htmlContent, options.inputPath);
      }
      htmlContent = await this.htmlPreprocessor.preprocess(htmlContent);
      
      // Create JSDOM instance
      const dom = new JSDOM(htmlContent);
      const document = dom.window.document;
      
      // Extract variables if requested
      if (options.variableOptions?.extractVariables) {
        this.extractVariablesFromDocument(document);
      }
      
      // Convert to AsciiDoc
      const content = this.convertToAsciiDoc(document, options);
      
      // Post-process for quality
      const finalContent = this.postProcess(content);
      
      // Extract metadata
      const title = this.extractTitleFromContent(finalContent);
      const wordCount = this.estimateWordCount(finalContent);
      
      // Generate variables file if requested
      let variablesFile: string | undefined;
      if (options.variableOptions?.extractVariables && options.variableOptions.variableFormat) {
        variablesFile = this.variableExtractor.generateVariablesFile(options.variableOptions);
      }

      return {
        content: finalContent,
        variablesFile,
        metadata: {
          title,
          wordCount,
          format: 'asciidoc',
          variables: options.variableOptions?.extractVariables ? this.variableExtractor.getVariables() : undefined
        }
      };
    } catch (error) {
      throw new Error(`Enhanced AsciiDoc conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  private convertToAsciiDoc(document: Document, options: ConversionOptions): string {
    const titleElement = document.querySelector('h1');
    const title = titleElement?.textContent?.trim() || 
                  document.querySelector('title')?.textContent?.trim() || 
                  'Untitled Document';
    
    // Generate document header
    let result = `= ${title}\n`;
    result += ':toc:\n';
    result += ':icons: font\n';
    result += ':experimental:\n';
    result += ':source-highlighter: highlight.js\n\n';
    
    // Add variable includes if needed
    if (options.variableOptions?.extractVariables) {
      result += 'include::includes/variables.adoc[]\n\n';
    }
    
    // Process body content
    const body = document.body;
    if (body) {
      const context = this.createContext();
      result += this.processElement(body, context);
    }
    
    return result;
  }
  
  private createContext(): ConversionContext {
    return {
      inTable: false,
      inList: false,
      listStack: [],
      inAdmonition: false,
      inCodeBlock: false,
      currentIndent: 0,
      variables: new Map(),
      snippets: new Map(),
      crossRefs: new Map()
    };
  }
  
  private processElement(element: Element, context: ConversionContext): string {
    // Skip title if it's h1 (already in document header)
    if (element.tagName === 'H1' && element.parentElement?.tagName === 'BODY') {
      return '';
    }
    
    // Find matching rule
    for (const rule of this.edgeCaseRules) {
      const matches = typeof rule.pattern === 'function' 
        ? rule.pattern(element)
        : rule.pattern.test(element.tagName);
        
      if (matches) {
        return rule.handler(element, context);
      }
    }
    
    // Process children if no specific rule
    if (element.children.length > 0) {
      return Array.from(element.children)
        .map(child => this.processElement(child as Element, context))
        .join('');
    }
    
    // Return text content for text nodes
    return this.processInlineContent(element);
  }
  
  private processInlineContent(element: Element): string {
    let result = '';
    
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 3) { // Text node
        result += this.escapeAsciiDocSpecialChars(node.textContent || '');
      } else if (node.nodeType === 1) { // Element node
        const el = node as Element;
        
        // Check inline formatting rules
        const rule = this.edgeCaseRules.find(r => {
          const matches = typeof r.pattern === 'function' 
            ? r.pattern(el)
            : r.pattern.test(el.tagName);
          return matches && r.priority >= 50; // Inline elements typically have priority 50+
        });
        
        if (rule) {
          result += rule.handler(el, this.createContext());
        } else {
          // For unmatched inline elements, just extract text content
          result += this.extractTextContent(el);
        }
      }
    }
    
    return result;
  }
  
  private extractTextContent(element: Element): string {
    // Simple text extraction without recursion
    return element.textContent || '';
  }
  
  private processListElement(listEl: Element, type: 'ordered' | 'unordered', context: ConversionContext, style?: string): string {
    const newContext = { ...context };
    newContext.inList = true;
    newContext.listStack.push({
      level: newContext.listStack.length,
      type,
      style,
      itemCount: 0
    });
    
    let result = '\n';
    const items = Array.from(listEl.children).filter(el => el.tagName === 'LI');
    
    items.forEach((item, index) => {
      const listContext = newContext.listStack[newContext.listStack.length - 1];
      listContext.itemCount++;
      
      const marker = this.getListMarker(type, style, listContext.level, index);
      const content = this.processListItem(item as Element, newContext);
      
      // Add appropriate spacing
      const indent = '+'.repeat(listContext.level);
      result += `${marker} ${content}\n`;
      
      // Handle continuation
      const hasNestedContent = item.children.length > 1 || 
        Array.from(item.children).some(child => ['OL', 'UL', 'DL'].includes(child.tagName));
        
      if (hasNestedContent) {
        result += `${indent}\n`;
      }
    });
    
    newContext.listStack.pop();
    return result + '\n';
  }
  
  private processListItem(item: Element, context: ConversionContext): string {
    let result = '';
    let firstParagraph = true;
    
    for (const child of Array.from(item.children)) {
      if (child.tagName === 'P') {
        const content = this.processInlineContent(child);
        if (firstParagraph) {
          result += content;
          firstParagraph = false;
        } else {
          result += `\n+\n${content}`;
        }
      } else if (['OL', 'UL', 'DL'].includes(child.tagName)) {
        result += this.processElement(child, context);
      } else {
        result += this.processElement(child, context);
      }
    }
    
    // Handle direct text content
    if (result === '') {
      result = this.processInlineContent(item);
    }
    
    return result.trim();
  }
  
  private getListMarker(type: 'ordered' | 'unordered', style: string | undefined, level: number, index: number): string {
    if (type === 'unordered') {
      return '*'.repeat(level + 1);
    }
    
    if (type === 'ordered') {
      if (style === 'lower-alpha') {
        return String.fromCharCode(97 + index) + '.';
      } else if (style === 'upper-alpha') {
        return String.fromCharCode(65 + index) + '.';
      } else if (style === 'lower-roman') {
        return this.toRoman(index + 1).toLowerCase() + '.';
      } else if (style === 'upper-roman') {
        return this.toRoman(index + 1) + '.';
      }
      return '.'.repeat(level + 1);
    }
    
    return '-';
  }
  
  private toRoman(num: number): string {
    const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const symbols = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
    let result = '';
    
    for (let i = 0; i < values.length; i++) {
      while (num >= values[i]) {
        num -= values[i];
        result += symbols[i];
      }
    }
    
    return result;
  }
  
  private processTable(table: Element): string {
    let result = '\n|===\n';
    
    // Process headers
    const headers = table.querySelectorAll('thead th');
    if (headers.length > 0) {
      result += '|' + Array.from(headers)
        .map(th => ` ${this.processInlineContent(th as Element)}`)
        .join(' |') + '\n\n';
    }
    
    // Process rows
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      result += '|' + Array.from(cells)
        .map(td => ` ${this.processInlineContent(td as Element)}`)
        .join(' |') + '\n';
    });
    
    result += '|===\n';
    return result;
  }
  
  private extractListStyle(style: string): string | undefined {
    const match = style.match(/list-style-type:\s*([^;]+)/);
    if (match) {
      return match[1].trim();
    }
    return undefined;
  }
  
  private extractDimensions(style: string): { width?: string; height?: string } {
    const result: { width?: string; height?: string } = {};
    
    const widthMatch = style.match(/width:\s*(\d+)px/);
    if (widthMatch) {
      result.width = widthMatch[1];
    }
    
    const heightMatch = style.match(/height:\s*(\d+)px/);
    if (heightMatch) {
      result.height = heightMatch[1];
    }
    
    return result;
  }
  
  private isInlineImage(img: Element, className: string, dimensions: { width?: string; height?: string }): boolean {
    // Check class
    if (className.includes('IconInline')) return true;
    
    // Check dimensions
    const width = parseInt(dimensions.width || '0');
    const height = parseInt(dimensions.height || '0');
    if (width > 0 && width <= 32 && height > 0 && height <= 32) return true;
    
    // Check parent context
    const parent = img.parentElement;
    if (parent?.tagName === 'P') {
      // Check if image is surrounded by text
      const prevSibling = img.previousSibling;
      const nextSibling = img.nextSibling;
      
      if (prevSibling?.nodeType === 3 && prevSibling.textContent?.trim()) return true;
      if (nextSibling?.nodeType === 3 && nextSibling.textContent?.trim()) return true;
    }
    
    // Check path
    const src = img.getAttribute('src') || '';
    if (src.includes('/GUI/') || src.includes('/Icon/') || src.includes('/Button/')) return true;
    
    return false;
  }
  
  private escapeAsciiDocSpecialChars(text: string): string {
    // Don't escape inside certain contexts
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\+/g, '\\+')
      .replace(/`/g, '\\`');
  }
  
  private postProcess(content: string): string {
    // Clean up excessive newlines
    content = content.replace(/\n{4,}/g, '\n\n\n');
    
    // Fix list continuations
    content = content.replace(/\n\+\n\+\n/g, '\n+\n');
    
    // Clean up spacing around blocks
    content = content.replace(/\n*(NOTE|TIP|WARNING|CAUTION|IMPORTANT):\s*/g, '\n\n$1: ');
    content = content.replace(/\n*(\[source[^\]]*\])\n*/g, '\n\n$1\n');
    content = content.replace(/\n*(image::[^\[]+\[[^\]]*\])\n*/g, '\n\n$1\n\n');
    
    // Fix collapsible blocks
    content = content.replace(/\n*\.([^\n]+)\n\[%collapsible\]\n====/g, '\n\n.$1\n[%collapsible]\n====');
    
    // Clean trailing whitespace
    content = content.replace(/ +$/gm, '');
    
    return content.trim() + '\n';
  }
  
  private extractVariablesFromDocument(document: Document): void {
    // Extract MadCap variables
    document.querySelectorAll('[data-mc-variable]').forEach(el => {
      const varName = el.getAttribute('data-mc-variable');
      const varValue = el.textContent || '';
      if (varName) {
        this.variableExtractor.addVariable({
          name: varName,
          value: varValue,
          namespace: varName.includes('.') ? varName.split('.')[0] : '',
          key: varName.includes('.') ? varName.split('.').slice(1).join('.') : varName,
          source: 'madcap'
        });
      }
    });
  }
  
  private extractTitleFromContent(content: string): string {
    const match = content.match(/^=\s+(.+)$/m);
    return match ? match[1] : 'Untitled';
  }
  
  private estimateWordCount(content: string): number {
    const text = content.replace(/[=*_`\[\]{}|]/g, ' ');
    const words = text.split(/\s+/).filter(word => word.length > 0);
    return words.length;
  }
}
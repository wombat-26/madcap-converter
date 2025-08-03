import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index';
import { MadCapPreprocessor } from '../services/madcap-preprocessor';
import { HTMLPreprocessor } from '../services/html-preprocessor';
import { VariableExtractor } from '../services/variable-extractor';
import { EnhancedTableProcessor } from './enhanced-table-processor';
import { MathNotationHandler } from './math-notation-handler';
import { CitationHandler } from './citation-handler';
import { PerformanceOptimizer } from './performance-optimizer';

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

export class AsciiDocConverter implements DocumentConverter {
  supportedInputTypes = ['html'];
  private madCapPreprocessor: MadCapPreprocessor;
  private htmlPreprocessor: HTMLPreprocessor;
  private variableExtractor: VariableExtractor;
  private tableProcessor: EnhancedTableProcessor;
  private mathHandler: MathNotationHandler;
  private citationHandler: CitationHandler;
  private performanceOptimizer: PerformanceOptimizer;
  private edgeCaseRules: AsciiDocEdgeCaseRules[] = [];
  
  constructor() {
    this.madCapPreprocessor = new MadCapPreprocessor();
    this.htmlPreprocessor = new HTMLPreprocessor();
    this.variableExtractor = new VariableExtractor();
    this.tableProcessor = new EnhancedTableProcessor();
    this.mathHandler = new MathNotationHandler();
    this.citationHandler = new CitationHandler();
    this.performanceOptimizer = new PerformanceOptimizer();
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
        pattern: (el) => el.tagName === 'MADCAP:DROPDOWN' || el.classList.contains('madcap-dropdown') || el.classList.contains('collapsible-block'),
        handler: (el: Element, context?: ConversionContext) => {
          // Handle both original MadCap dropdowns and preprocessed ones
          let title = 'Details';
          let content = '';
          
          if (el.tagName === 'MADCAP:DROPDOWN') {
            const hotspot = el.querySelector('madcap\\:dropdownhotspot');
            const body = el.querySelector('madcap\\:dropdownbody');
            title = hotspot?.textContent?.trim() || 'Details';
            
            // Process body content without recursion - just get text content
            if (body) {
              content = this.processChildElements(body, context || this.createContext());
            }
          } else {
            // Preprocessed dropdown
            title = el.getAttribute('data-title') || 'Details';
            content = this.processChildElements(el, context || this.createContext());
          }
          
          // Check if collapsible blocks should be used (default: false)
          const useCollapsible = false; // TODO: Get from options
          
          if (useCollapsible) {
            return `\n.${title}\n[%collapsible]\n====\n${content.trim()}\n====\n`;
          } else {
            // Default: Convert to H2 section
            return `\n== ${title}\n\n${content.trim()}\n\n`;
          }
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
      
      // Advanced table processing
      {
        name: 'Tables with complex formatting',
        pattern: (el) => el.tagName === 'TABLE',
        handler: (el: Element) => this.tableProcessor.convertTable(el as HTMLTableElement),
        priority: 85
      },
      
      // Admonitions (notes, warnings, tips)
      {
        name: 'Note blocks',
        pattern: (el) => el.classList.contains('note') || el.classList.contains('mc-note'),
        handler: (el: Element, context?: ConversionContext) => {
          const content = this.processChildElements(el, context || this.createContext());
          return `\nNOTE: ${content.trim()}\n\n`;
        },
        priority: 80
      },
      {
        name: 'Warning blocks',
        pattern: (el) => el.classList.contains('warning') || el.classList.contains('mc-warning'),
        handler: (el: Element, context?: ConversionContext) => {
          const content = this.processChildElements(el, context || this.createContext());
          return `\nWARNING: ${content.trim()}\n\n`;
        },
        priority: 80
      },
      {
        name: 'Tip blocks',
        pattern: (el) => el.classList.contains('tip') || el.classList.contains('mc-tip'),
        handler: (el: Element, context?: ConversionContext) => {
          const content = this.processChildElements(el, context || this.createContext());
          return `\nTIP: ${content.trim()}\n\n`;
        },
        priority: 80
      },
      {
        name: 'Caution blocks',
        pattern: (el) => el.classList.contains('caution') || el.classList.contains('mc-caution'),
        handler: (el: Element, context?: ConversionContext) => {
          const content = this.processChildElements(el, context || this.createContext());
          return `\nCAUTION: ${content.trim()}\n\n`;
        },
        priority: 80
      },
      
      // Special formatting
      {
        name: 'Keyboard shortcuts',
        pattern: (el) => el.classList.contains('Keyboard'),
        handler: (el: Element) => {
          const text = el.textContent?.trim() || '';
          return `kbd:[${text}]`;
        },
        priority: 75
      },
      {
        name: 'Code blocks',
        pattern: (el) => el.tagName === 'PRE',
        handler: (el: Element) => {
          const code = el.querySelector('code');
          const lang = code?.className?.match(/language-(\w+)/)?.[1] || '';
          const content = code?.textContent || el.textContent || '';
          
          if (lang) {
            return `\n[source,${lang}]\n----\n${content}\n----\n`;
          }
          return `\n----\n${content}\n----\n`;
        },
        priority: 70
      },
      
      // Math notation handling
      {
        name: 'Mathematical expressions',
        pattern: (el) => this.mathHandler.containsMathNotation(el.innerHTML),
        handler: (el: Element) => {
          const content = this.mathHandler.convertForAsciiDoc(el.innerHTML);
          return content;
        },
        priority: 65
      },
      {
        name: 'Math elements',
        pattern: (el) => el.tagName === 'MATH' || el.classList.contains('math') || el.classList.contains('latex'),
        handler: (el: Element) => {
          const content = this.mathHandler.convertForAsciiDoc(el.outerHTML);
          return content;
        },
        priority: 65
      },
      
      // Citation handling
      {
        name: 'Footnote references',
        pattern: (el) => el.tagName === 'A' && (el.getAttribute('href')?.startsWith('#fn') ?? false),
        handler: (el: Element) => {
          // This will be processed by the citation handler in the document preprocessing
          // Return as-is for now, letting the handler process it globally
          return el.outerHTML;
        },
        priority: 60
      },
      {
        name: 'Bibliography entries',
        pattern: (el) => el.classList.contains('bibliography') || el.classList.contains('reference'),
        handler: (el: Element) => {
          // This will be processed by the citation handler in the document preprocessing
          // Return as-is for now, letting the handler process it globally
          return el.outerHTML;
        },
        priority: 60
      }
    ];
    
    // Sort by priority (descending)
    this.edgeCaseRules.sort((a, b) => b.priority - a.priority);
  }
  
  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    const warnings: string[] = [];
    
    try {
      console.log('AsciiDocConverter: Starting conversion');
      
      // Disable performance optimization to prevent stack overflow
      // Process all documents with standard processing
      
      // Standard processing for smaller documents
      const result = await this.convertChunk(input, options);
      
      return {
        content: result,
        metadata: {
          title: this.extractTitleFromContent(result),
          wordCount: this.estimateWordCount(result),
          warnings: warnings.length > 0 ? warnings : undefined,
          format: 'asciidoc',
          variables: this.variableExtractor.getVariables()
        }
      };
      
    } catch (error) {
      throw new Error(`AsciiDoc conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  private async convertChunk(input: string, options: ConversionOptions): Promise<string> {
    try {
      // Apply HTML preprocessing to fix list structures and other issues
      const preprocessedHtml = await this.htmlPreprocessor.preprocess(input);
      
      // HTML preprocessing has successfully fixed the nested list structure
      
      const dom = new JSDOM(preprocessedHtml, { 
        contentType: 'text/html'
      });
      const document = dom.window.document;
      
      // Get title from first h1 or use default
      const firstH1 = document.querySelector('h1');
      const title = firstH1?.textContent?.trim() || 'Document Title';
      
      // Basic AsciiDoc structure
      let result = `= ${title}\n`;
      result += ':toc:\n';
      result += ':icons: font\n';
      result += '\n';
      
      // Convert body content using full processing to handle nested structures
      const body = document.body;
      if (body) {
        const context = this.createContext();
        // Process all children except the first h1 (which is used for title)
        for (const child of Array.from(body.children)) {
          if (child.tagName === 'H1' && child === body.querySelector('h1')) {
            continue; // Skip the title h1
          }
          result += this.processElement(child as Element, context);
        }
      }
      
      return result.trim() + '\n';
      
    } catch (error) {
      console.error('Error in convertChunk:', error);
      return '= Error Converting Document\n\nConversion failed due to processing error.\n';
    }
    
  }
  
  /**
   * Simple element processor to avoid recursion issues
   */
  private processElementSimple(element: Element): string {
    let result = '';
    
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3) { // Text node
        const text = child.textContent?.trim() || '';
        if (text) {
          result += text + ' ';
        }
      } else if (child.nodeType === 1) { // Element node
        const childElement = child as Element;
        const tagName = childElement.tagName.toLowerCase();
        
        switch (tagName) {
          case 'h1':
            // Skip h1 as it's used for title
            break;
          case 'h2':
            result += `\n== ${childElement.textContent?.trim()}\n\n`;
            break;
          case 'h3':
            result += `\n=== ${childElement.textContent?.trim()}\n\n`;
            break;
          case 'p':
            const text = childElement.textContent?.trim() || '';
            if (text) {
              result += `${text}\n\n`;
            }
            break;
          case 'li':
            const itemText = childElement.textContent?.trim() || '';
            if (itemText) {
              result += `* ${itemText}\n`;
            }
            break;
          case 'ol':
          case 'ul':
            result += '\n';
            // Process list items without recursion
            const items = childElement.querySelectorAll('li');
            items.forEach(li => {
              const itemText = li.textContent?.trim() || '';
              if (itemText) {
                result += tagName === 'ol' ? `. ${itemText}\n` : `* ${itemText}\n`;
              }
            });
            result += '\n';
            break;
          default:
            // For other elements, just get text content
            const elementText = childElement.textContent?.trim() || '';
            if (elementText) {
              result += elementText + ' ';
            }
            break;
        }
      }
    }
    
    return result;
  }
  
  private convertToAsciiDoc(document: Document, options: ConversionOptions): string {
    const body = document.body;
    if (!body) return '';
    
    // Extract title from first h1
    const firstH1 = body.querySelector('h1');
    const title = firstH1?.textContent?.trim() || 'Document Title';
    
    // Build document header
    let result = `= ${title}\n`;
    result += ':toc:\n';
    result += ':icons: font\n';
    result += ':experimental:\n';
    result += ':source-highlighter: highlight.js\n';
    
    // Add variable includes if extracted
    if (options.variableOptions?.extractVariables) {
      result += '\ninclude::includes/variables.adoc[]\n';
    }
    
    result += '\n';
    
    // Process content (skip first h1 since it's the title)
    const context = this.createContext();
    for (const child of Array.from(body.children)) {
      if (child === firstH1) continue;
      result += this.processElement(child as Element, context);
    }
    
    return result;
  }
  
  private processElement(element: Element, context: ConversionContext): string {
    // Check edge case rules first (fixed to prevent stack overflow)
    for (const rule of this.edgeCaseRules) {
      const matches = typeof rule.pattern === 'function' 
        ? rule.pattern(element)
        : rule.pattern.test(element.outerHTML);
        
      if (matches) {
        return rule.handler(element, context);
      }
    }
    
    // Standard element processing
    const tagName = element.tagName.toLowerCase();
    
    switch (tagName) {
      case 'h1':
        return `\n== ${element.textContent?.trim()}\n\n`;
      case 'h2':
        return `\n=== ${element.textContent?.trim()}\n\n`;
      case 'h3':
        return `\n==== ${element.textContent?.trim()}\n\n`;
      case 'h4':
        return `\n===== ${element.textContent?.trim()}\n\n`;
      case 'h5':
        return `\n====== ${element.textContent?.trim()}\n\n`;
      case 'h6':
        return `\n======= ${element.textContent?.trim()}\n\n`;
        
      case 'p':
        const text = this.processInlineContent(element, context);
        return text ? `${text}\n\n` : '';
        
      case 'div':
      case 'section':
        let divContent = '';
        for (const child of Array.from(element.children)) {
          divContent += this.processElement(child, context);
        }
        return divContent;
        
      case 'img':
        return this.processImage(element);
        
      case 'a':
        return this.processLink(element);
        
      case 'code':
        return `\`${element.textContent}\``;
        
      case 'strong':
      case 'b':
        return `*${element.textContent}*`;
        
      case 'em':
      case 'i':
        return `_${element.textContent}_`;
        
      case 'br':
        return ' +\n';
        
      case 'hr':
        return '\n---\n\n';
        
      case 'ol':
        return this.processOrderedList(element, context);
        
      case 'ul':
        return this.processUnorderedList(element, context);
        
      default:
        // Process children for unknown elements
        let content = '';
        for (const child of Array.from(element.childNodes)) {
          if (child.nodeType === 3) { // Text node
            content += child.textContent;
          } else if (child.nodeType === 1) { // Element node
            content += this.processElement(child as Element, context);
          }
        }
        return content;
    }
  }
  
  
  private processListElement(
    list: Element, 
    type: 'ordered' | 'unordered', 
    context: ConversionContext,
    style?: string
  ): string {
    let result = '';
    const items = list.querySelectorAll(':scope > li');
    
    // Update context
    const newContext = { ...context, inList: true };
    const level = context.listStack.length;
    
    for (const [index, item] of Array.from(items).entries()) {
      // Determine marker based on type and level
      let marker = '';
      if (type === 'ordered') {
        marker = '.'.repeat(level + 1);
        
        // Apply style if specified
        if (style === 'lower-alpha') {
          result += '[loweralpha]\n';
        }
      } else {
        marker = '*'.repeat(level + 1);
      }
      
      // Process item content
      let itemContent = '';
      for (const child of Array.from(item.childNodes)) {
        if (child.nodeType === 3) { // Text node
          itemContent += child.textContent;
        } else if (child.nodeType === 1) { // Element node
          const childEl = child as Element;
          if (childEl.tagName === 'UL' || childEl.tagName === 'OL') {
            // Nested list - process with increased level
            const nestedContext = {
              ...newContext,
              listStack: [...context.listStack, { level, type, itemCount: 0 }]
            };
            itemContent += '\n' + this.processElement(childEl, nestedContext);
          } else {
            itemContent += this.processElement(childEl, newContext);
          }
        }
      }
      
      result += `${marker} ${itemContent.trim()}\n`;
      
      // Add continuation marker if needed
      if (item.querySelector('ul, ol, pre, div.note')) {
        result += '+\n';
      }
    }
    
    return result + '\n';
  }
  
  private processImage(img: Element): string {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    const title = img.getAttribute('title');
    
    // Determine if inline or block
    const parent = img.parentElement;
    const isInline = parent?.tagName === 'P' && parent.childNodes.length > 1;
    
    if (isInline) {
      return `image:${src}[${alt}]`;
    } else {
      let result = `\nimage::${src}[${alt}`;
      if (title) result += `,title="${title}"`;
      result += ']\n\n';
      return result;
    }
  }
  
  private processLink(link: Element): string {
    const href = link.getAttribute('href') || '';
    const text = link.textContent || '';
    
    // Convert .htm/.html to .adoc for cross-references
    if (href.match(/\.htm(l)?$/)) {
      const cleanHref = href.replace(/\.htm(l)?$/, '.adoc');
      return `xref:${cleanHref}[${text}]`;
    }
    
    return `${href}[${text}]`;
  }
  
  private processInlineContent(element: Element, context: ConversionContext): string {
    let result = '';
    
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3) { // Text node
        result += child.textContent;
      } else if (child.nodeType === 1) { // Element node
        result += this.processElement(child as Element, context);
      }
    }
    
    return result.trim();
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

  /**
   * Process child elements without triggering edge case rules to avoid recursion
   */
  private processChildElements(element: Element, context: ConversionContext): string {
    let result = '';
    
    for (const child of Array.from(element.children)) {
      // Skip edge case rules and process directly
      result += this.processElementDirect(child as Element, context);
    }
    
    return result;
  }

  /**
   * Process element directly without edge case rules
   */
  private processElementDirect(element: Element, context: ConversionContext): string {
    const tagName = element.tagName.toLowerCase();
    
    switch (tagName) {
      case 'h1':
        return `\n== ${element.textContent?.trim()}\n\n`;
      case 'h2':
        return `\n=== ${element.textContent?.trim()}\n\n`;
      case 'h3':
        return `\n==== ${element.textContent?.trim()}\n\n`;
      case 'p':
        const text = this.processInlineContent(element, context);
        return text ? `${text}\n\n` : '';
      case 'div':
      case 'section':
        let divContent = '';
        for (const child of Array.from(element.children)) {
          divContent += this.processElementDirect(child as Element, context);
        }
        return divContent;
      case 'ol':
        return this.processOrderedList(element, context);
      case 'ul':
        return this.processUnorderedList(element, context);
      default:
        // Process children for unknown elements
        let content = '';
        for (const child of Array.from(element.childNodes)) {
          if (child.nodeType === 3) { // Text node
            content += child.textContent;
          } else if (child.nodeType === 1) { // Element node
            content += this.processElementDirect(child as Element, context);
          }
        }
        return content;
    }
  }

  private processOrderedList(element: Element, context: ConversionContext): string {
    let result = '\n';
    const items = Array.from(element.children).filter(child => child.tagName === 'LI');
    const depth = context.listStack.length;
    const marker = '.'.repeat(depth + 1);
    
    // Process ordered list with proper depth-based markers
    
    for (const item of items) {
      let itemContent = '';
      
      // Process each child of the list item
      for (const child of Array.from(item.childNodes)) {
        if (child.nodeType === 3) { // Text node
          itemContent += child.textContent || '';
        } else if (child.nodeType === 1) { // Element node
          const childElement = child as Element;
          if (childElement.tagName === 'OL' || childElement.tagName === 'UL') {
            // Nested list - increase depth
            const nestedContext = {
              ...context,
              listStack: [...context.listStack, { level: depth, type: 'ordered' as const, itemCount: 0, parent: undefined }]
            };
            itemContent += '\n' + this.processElement(childElement, nestedContext);
          } else {
            itemContent += this.processElement(childElement, context);
          }
        }
      }
      
      result += `${marker} ${itemContent.trim()}\n`;
    }
    
    return result + '\n';
  }

  private processUnorderedList(element: Element, context: ConversionContext): string {
    let result = '\n';
    const items = Array.from(element.children).filter(child => child.tagName === 'LI');
    const depth = context.listStack.length;
    const marker = '*'.repeat(depth + 1);
    
    for (const item of items) {
      let itemContent = '';
      
      // Process each child of the list item
      for (const child of Array.from(item.childNodes)) {
        if (child.nodeType === 3) { // Text node
          itemContent += child.textContent || '';
        } else if (child.nodeType === 1) { // Element node
          const childElement = child as Element;
          if (childElement.tagName === 'OL' || childElement.tagName === 'UL') {
            // Nested list - increase depth
            const nestedContext = {
              ...context,
              listStack: [...context.listStack, { level: depth, type: 'unordered' as const, itemCount: 0, parent: undefined }]
            };
            itemContent += '\n' + this.processElement(childElement, nestedContext);
          } else {
            itemContent += this.processElement(childElement, context);
          }
        }
      }
      
      result += `${marker} ${itemContent.trim()}\n`;
    }
    
    return result + '\n';
  }
  
  private extractListStyle(style: string): string | undefined {
    if (style.includes('lower-alpha')) return 'lower-alpha';
    if (style.includes('upper-alpha')) return 'upper-alpha';
    if (style.includes('lower-roman')) return 'lower-roman';
    if (style.includes('upper-roman')) return 'upper-roman';
    return undefined;
  }
  
  private extractTitleFromContent(content: string): string {
    const match = content.match(/^= (.+)$/m);
    return match ? match[1] : 'Untitled';
  }
  
  private estimateWordCount(content: string): number {
    // Remove AsciiDoc syntax for accurate count
    const textOnly = content
      .replace(/^[=\*\.#]+\s/gm, '') // Remove markers
      .replace(/\[.*?\]/g, '') // Remove attributes
      .replace(/image::[^\[]+\[.*?\]/g, '') // Remove images
      .trim();
      
    return textOnly.split(/\s+/).filter(w => w.length > 0).length;
  }
  
  private escapeAsciiDoc(text: string): string {
    return text
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
    
    // Ensure proper spacing around blocks
    content = content.replace(/\n(NOTE:|TIP:|WARNING:|CAUTION:|IMPORTANT:)/g, '\n\n$1');
    content = content.replace(/(NOTE:|TIP:|WARNING:|CAUTION:|IMPORTANT:)(.+?)\n(?!\n)/g, '$1$2\n\n');
    
    // Fix image block spacing
    content = content.replace(/\nimage::/g, '\n\nimage::');
    content = content.replace(/\]\n(?!\n)/g, ']\n\n');
    
    // Clean up code block spacing
    content = content.replace(/\n----\n/g, '\n----\n');
    content = content.replace(/----\n(?!\n)/g, '----\n\n');
    
    return content.trim() + '\n';
  }
  
  // Method needed by MadCapConverter for compatibility
  getVariableExtractor(): VariableExtractor {
    return this.variableExtractor;
  }
}
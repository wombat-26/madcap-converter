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

export class EnhancedAsciiDocConverter implements DocumentConverter {
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
        handler: (el: Element) => {
          // Handle both original MadCap dropdowns and preprocessed ones
          let title = 'Details';
          let content = '';
          
          if (el.tagName === 'MADCAP:DROPDOWN') {
            const hotspot = el.querySelector('madcap\\:dropdownhotspot');
            const body = el.querySelector('madcap\\:dropdownbody');
            title = hotspot?.textContent?.trim() || 'Details';
            content = body ? this.processElement(body, this.createContext()) : '';
          } else {
            // Preprocessed dropdown
            title = el.getAttribute('data-title') || 'Details';
            content = this.processElement(el, this.createContext());
          }
          
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
        handler: (el: Element) => {
          const content = this.processElement(el, this.createContext());
          return `\nNOTE: ${content.trim()}\n`;
        },
        priority: 80
      },
      {
        name: 'Warning blocks',
        pattern: (el) => el.classList.contains('warning') || el.classList.contains('mc-warning'),
        handler: (el: Element) => {
          const content = this.processElement(el, this.createContext());
          return `\nWARNING: ${content.trim()}\n`;
        },
        priority: 80
      },
      {
        name: 'Tip blocks',
        pattern: (el) => el.classList.contains('tip') || el.classList.contains('mc-tip'),
        handler: (el: Element) => {
          const content = this.processElement(el, this.createContext());
          return `\nTIP: ${content.trim()}\n`;
        },
        priority: 80
      },
      {
        name: 'Caution blocks',
        pattern: (el) => el.classList.contains('caution') || el.classList.contains('mc-caution'),
        handler: (el: Element) => {
          const content = this.processElement(el, this.createContext());
          return `\nCAUTION: ${content.trim()}\n`;
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
      console.log('EnhancedAsciiDocConverter: Starting conversion');
      
      // Check if performance optimization is needed/enabled
      const performanceOptions = options.asciidocOptions?.performanceOptions;
      const enablePerformance = performanceOptions?.enableOptimization ?? (input.length > 50000);
      
      if (enablePerformance) {
        console.log(`Large document detected (${Math.round(input.length / 1024)}KB), using performance optimization`);
        
        // Use performance optimizer for large documents
        const optimizationResult = await this.performanceOptimizer.optimizeDocumentProcessing(
          input,
          async (chunk: string) => await this.convertChunk(chunk, options)
        );
        
        warnings.push(...optimizationResult.warnings);
        
        return {
          content: optimizationResult.optimizedContent,
          metadata: {
            title: this.extractTitleFromContent(optimizationResult.optimizedContent),
            wordCount: this.estimateWordCount(optimizationResult.optimizedContent),
            warnings: warnings.length > 0 ? warnings : undefined,
            format: 'asciidoc',
            variables: this.variableExtractor.getVariables(),
            processingTime: optimizationResult.metrics.processingTime,
            memoryUsage: optimizationResult.metrics.memoryUsage
          }
        };
      }
      
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
      throw new Error(`Enhanced AsciiDoc conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  private async convertChunk(input: string, options: ConversionOptions): Promise<string> {
    // MadCap preprocessing
    const preprocessed = await this.madCapPreprocessor.preprocessMadCapContent(input, options.inputPath);
    
    // HTML preprocessing
    const cleaned = await this.htmlPreprocessor.preprocess(preprocessed);
    
    console.log('EnhancedAsciiDocConverter: Cleaned HTML:', cleaned.substring(0, 500));
    
    // Parse with JSDOM
    const dom = new JSDOM(cleaned);
    const document = dom.window.document;
    
    // Apply performance optimizations to DOM if enabled
    if (options.asciidocOptions?.performanceOptions?.batchProcessing) {
      this.performanceOptimizer.optimizeDOMProcessing(document);
    }
    
    // Process math notation if enabled
    const mathOptions = options.asciidocOptions?.mathOptions;
    if (mathOptions?.enableMathProcessing ?? true) {
      this.mathHandler.processMathInDocument(document, 'asciidoc');
    }
    
    // Process citations if enabled
    const citationOptions = options.asciidocOptions?.citationOptions;
    if (citationOptions?.enableCitationProcessing ?? true) {
      const citationResult = this.citationHandler.processCitationsInDocument(document, 'asciidoc');
      if (citationResult.warnings.length > 0) {
        console.log('Citation processing warnings:', citationResult.warnings);
      }
    }
    
    // Convert to AsciiDoc
    const content = this.convertToAsciiDoc(document, options);
    
    // Post-process for quality
    const finalContent = this.postProcess(content);
    
    return finalContent;
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
    // Check edge case rules first
    for (const rule of this.edgeCaseRules) {
      const matches = typeof rule.pattern === 'function' 
        ? rule.pattern(element)
        : rule.pattern.test(element.outerHTML);
        
      if (matches) {
        console.log(`EnhancedAsciiDocConverter: Applying rule "${rule.name}" for element ${element.tagName}`);
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
        if (style === 'lower-alpha' && level === 0) {
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
    
    // Normalize image path for AsciiDoc output
    let normalizedSrc = this.normalizeImagePath(src);
    
    // Ensure alt text is meaningful
    let normalizedAlt = alt || this.generateAltTextFromPath(normalizedSrc);
    
    // Determine if inline or block
    const parent = img.parentElement;
    const isInline = parent?.tagName === 'P' && parent.childNodes.length > 1;
    
    if (isInline) {
      return `image:${normalizedSrc}[${normalizedAlt}]`;
    } else {
      let result = `\nimage::${normalizedSrc}[${normalizedAlt}`;
      if (title && title !== 'c' && title !== normalizedAlt) {
        result += `,title="${title}"`;
      }
      result += ']\n\n';
      return result;
    }
  }
  
  private normalizeImagePath(src: string): string {
    let normalized = src;
    console.log(`DEBUG: Normalizing image path: "${src}"`);
    
    // Handle MadCap-specific path patterns first
    if (normalized.includes('Content/Images/')) {
      // Extract from Content/Images/ onward and map to Images/
      const contentImagesIndex = normalized.indexOf('Content/Images/');
      normalized = 'Images/' + normalized.substring(contentImagesIndex + 'Content/Images/'.length);
      console.log(`DEBUG: Applied Content/Images/ pattern: "${normalized}"`);
    } else if (normalized.includes('Content/Resources/Images/')) {
      // Extract from Content/Resources/Images/ onward and map to Images/
      const contentResourcesIndex = normalized.indexOf('Content/Resources/Images/');
      normalized = 'Images/' + normalized.substring(contentResourcesIndex + 'Content/Resources/Images/'.length);
      console.log(`DEBUG: Applied Content/Resources/Images/ pattern: "${normalized}"`);
    } else if (normalized.includes('/Images/')) {
      // Extract from the Images/ part onward
      const imagesIndex = normalized.indexOf('/Images/');
      normalized = normalized.substring(imagesIndex + 1);
      console.log(`DEBUG: Applied /Images/ pattern: "${normalized}"`);
    } else {
      // Remove leading path traversals like ../../../../
      normalized = normalized.replace(/^(\.\.\/)+/, '');
      console.log(`DEBUG: Applied path traversal removal: "${normalized}"`);
    }
    
    console.log(`DEBUG: Final normalized path: "${normalized}"`);
    return normalized;
  }
  
  private generateAltTextFromPath(src: string): string {
    // Generate meaningful alt text from filename
    const filename = src.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.[^.]*$/, '');
    
    // Remove dimension suffixes like _711x349
    const cleanName = nameWithoutExt.replace(/_\d+x\d+$/, '');
    
    // Convert to readable text
    return cleanName
      .replace(/[_-]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Handle camelCase
      .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize words
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
    
    for (let i = 0; i < element.childNodes.length; i++) {
      const child = element.childNodes[i];
      
      if (child.nodeType === 3) { // Text node
        let textContent = child.textContent || '';
        
        // Check if this text node ends with "see " and next node is a link
        if (textContent.endsWith('see ') && i + 1 < element.childNodes.length) {
          const nextChild = element.childNodes[i + 1];
          if (nextChild.nodeType === 1 && (nextChild as Element).tagName.toLowerCase() === 'a') {
            // Remove "see " from the text and let the link be processed normally
            textContent = textContent.slice(0, -4); // Remove "see "
            result += textContent + 'see ';
          } else {
            result += textContent;
          }
        } else {
          result += textContent;
        }
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
    // Fix seexref: pattern to proper "see xref:" (multiple variations)
    content = content.replace(/seexref:/g, 'see xref:');
    content = content.replace(/see\s*xref:/g, 'see xref:');
    
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
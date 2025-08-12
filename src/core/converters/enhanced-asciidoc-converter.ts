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
  depth: number;
  maxDepth: number;
  processedElements: WeakSet<Element>;
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
  private extractedImages: Set<string> = new Set();
  
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
        name: 'MadCap glossary terms',
        pattern: (el) => el.tagName === 'MADCAP:GLOSSARYTERM',
        handler: (el: Element) => {
          const term = el.textContent?.trim() || '';
          if (!term) {
            return '';
          }
          
          // Create anchor reference for the glossary term
          // This matches the anchor format used in glossary-converter.ts
          const anchor = `glossary-${term.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')}`;
          
          console.log(`🔍 [EnhancedAsciiDoc] Converting glossary term: "${term}" -> xref:${anchor}[${term}]`);
          
          // Return AsciiDoc cross-reference to glossary
          return `xref:${anchor}[${term}]`;
        },
        priority: 100
      },
      {
        name: 'MadCap dropdowns',
        pattern: (el) => el.tagName === 'MADCAP:DROPDOWN' || el.classList.contains('madcap-dropdown') || el.classList.contains('collapsible-block'),
        handler: (el: Element, ctx?: ConversionContext) => {
          const context = ctx || this.createContext();
          // Handle both original MadCap dropdowns and preprocessed ones
          let title = 'Details';
          let content = '';
          
          if (el.tagName === 'MADCAP:DROPDOWN') {
            const hotspot = el.querySelector('madcap\\:dropdownhotspot');
            const body = el.querySelector('madcap\\:dropdownbody');
            title = hotspot?.textContent?.trim() || 'Details';
            content = body ? this.processElement(body, context) : '';
          } else {
            // Preprocessed dropdown
            title = el.getAttribute('data-title') || 'Details';
            // Process children, not the element itself to avoid recursion
            content = '';
            for (const child of Array.from(el.childNodes)) {
              if (child.nodeType === 3) {
                content += child.textContent;
              } else if (child.nodeType === 1) {
                content += this.processElement(child as Element, context);
              }
            }
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
          const context = ctx || this.createContext();
          const style = el.getAttribute('style') || '';
          const listStyle = this.extractListStyle(style);
          return this.processListElement(el, 'ordered', context, listStyle);
        },
        priority: 90
      },
      {
        name: 'Unordered lists',
        pattern: (el) => el.tagName === 'UL',
        handler: (el: Element, ctx?: ConversionContext) => {
          const context = ctx || this.createContext();
          return this.processListElement(el, 'unordered', context);
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
        handler: (el: Element, ctx?: ConversionContext) => {
          const context = ctx || this.createContext();
          let content = '';
          for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === 3) {
              content += child.textContent;
            } else if (child.nodeType === 1) {
              content += this.processElement(child as Element, context);
            }
          }
          return `\nNOTE: ${content.trim()}\n`;
        },
        priority: 80
      },
      {
        name: 'Warning blocks',
        pattern: (el) => el.classList.contains('warning') || el.classList.contains('mc-warning'),
        handler: (el: Element, ctx?: ConversionContext) => {
          const context = ctx || this.createContext();
          let content = '';
          for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === 3) {
              content += child.textContent;
            } else if (child.nodeType === 1) {
              content += this.processElement(child as Element, context);
            }
          }
          return `\nWARNING: ${content.trim()}\n`;
        },
        priority: 80
      },
      {
        name: 'Tip blocks',
        pattern: (el) => el.classList.contains('tip') || el.classList.contains('mc-tip'),
        handler: (el: Element, ctx?: ConversionContext) => {
          const context = ctx || this.createContext();
          let content = '';
          for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === 3) {
              content += child.textContent;
            } else if (child.nodeType === 1) {
              content += this.processElement(child as Element, context);
            }
          }
          return `\nTIP: ${content.trim()}\n`;
        },
        priority: 80
      },
      {
        name: 'Caution blocks',
        pattern: (el) => el.classList.contains('caution') || el.classList.contains('mc-caution'),
        handler: (el: Element, ctx?: ConversionContext) => {
          const context = ctx || this.createContext();
          let content = '';
          for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === 3) {
              content += child.textContent;
            } else if (child.nodeType === 1) {
              content += this.processElement(child as Element, context);
            }
          }
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
    
    // Reset image extraction for this conversion
    this.extractedImages.clear();
    
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
        
        // Generate variables file if variables were extracted (performance path)
        let variablesFile: string | undefined;
        if (options.variableOptions?.extractVariables) {
          const extractedVariables = this.madCapPreprocessor.getExtractedVariables();
          console.log(`🔧 [EnhancedAsciiDocConverter Performance] Extracted ${extractedVariables.length} variables from MadCapPreprocessor`);
          
          if (extractedVariables.length > 0) {
            variablesFile = this.generateVariablesFile(extractedVariables, options.variableOptions);
            console.log(`📝 [EnhancedAsciiDocConverter Performance] Generated variables file: ${variablesFile?.length || 0} characters`);
          }
        }
        
        return {
          content: optimizationResult.optimizedContent,
          variablesFile,
          metadata: {
            title: this.extractTitleFromContent(optimizationResult.optimizedContent),
            wordCount: this.estimateWordCount(optimizationResult.optimizedContent),
            warnings: warnings.length > 0 ? warnings : undefined,
            format: 'asciidoc',
            variables: this.variableExtractor.getVariables(),
            images: Array.from(this.extractedImages),
            processingTime: optimizationResult.metrics.processingTime,
            memoryUsage: optimizationResult.metrics.memoryUsage
          }
        };
      }
      
      // Standard processing for smaller documents
      const result = await this.convertChunk(input, options);
      
      // Generate variables file if variables were extracted
      let variablesFile: string | undefined;
      if (options.variableOptions?.extractVariables) {
        const extractedVariables = this.madCapPreprocessor.getExtractedVariables();
        console.log(`🔧 [EnhancedAsciiDocConverter] Extracted ${extractedVariables.length} variables from MadCapPreprocessor`);
        
        if (extractedVariables.length > 0) {
          variablesFile = this.generateVariablesFile(extractedVariables, options.variableOptions);
          console.log(`📝 [EnhancedAsciiDocConverter] Generated variables file: ${variablesFile?.length || 0} characters`);
        }
      }
      
      return {
        content: result,
        variablesFile,
        metadata: {
          title: this.extractTitleFromContent(result),
          wordCount: this.estimateWordCount(result),
          warnings: warnings.length > 0 ? warnings : undefined,
          format: 'asciidoc',
          variables: this.variableExtractor.getVariables(),
          images: Array.from(this.extractedImages)
        }
      };
      
    } catch (error) {
      throw new Error(`Enhanced AsciiDoc conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  private async convertChunk(input: string, options: ConversionOptions): Promise<string> {
    // Configure MadCap preprocessor for variable extraction if needed
    if (options.variableOptions?.extractVariables) {
      console.log('🔧 [EnhancedAsciiDocConverter] Configuring MadCapPreprocessor for variable extraction');
      this.madCapPreprocessor.setExtractVariables(true);
      
      // If we have pre-extracted variables from batch processing, provide them to the preprocessor
      if (options.extractedVariables && options.extractedVariables.length > 0) {
        console.log(`📝 [EnhancedAsciiDocConverter] Using ${options.extractedVariables.length} pre-extracted variables from batch processing`);
        this.madCapPreprocessor.loadExtractedVariables(options.extractedVariables);
        options.extractedVariables.forEach((variable) => {
          console.log(`    • ${variable.name} = "${variable.value}"`);
        });
      }
    } else {
      this.madCapPreprocessor.setExtractVariables(false);
    }
    
    // MadCap preprocessing
    const preprocessed = await this.madCapPreprocessor.preprocessMadCapContent(input, options.inputPath, undefined, options.projectRootPath, options);
    
    // HTML preprocessing
    const cleaned = await this.htmlPreprocessor.preprocess(preprocessed);
    
    
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
    
    // Check for multiple HTML or body elements which could cause duplication
    const allBodies = document.querySelectorAll('body');
    const allHtmlElements = document.querySelectorAll('html');
    if (allBodies.length > 1) {
      console.warn(`⚠️ [Enhanced AsciiDoc] Found ${allBodies.length} body elements - this may cause content duplication`);
    }
    if (allHtmlElements.length > 1) {
      console.warn(`⚠️ [Enhanced AsciiDoc] Found ${allHtmlElements.length} html elements - this may cause content duplication`);
    }
    
    // Extract title from first h1
    const firstH1 = body.querySelector('h1');
    const title = firstH1?.textContent?.trim() || 'Document Title';
    
    console.log(`📄 [Enhanced AsciiDoc] Converting document with title: "${title}"`);
    
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
    // Check if this element was already processed (e.g., as a nested list)
    if (context.processedElements.has(element)) {
      return '';
    }
    
    // Check recursion depth to prevent stack overflow
    if (context.depth >= context.maxDepth) {
      console.warn(`⚠️ [Enhanced AsciiDoc] Max recursion depth reached (${context.maxDepth})`);
      return this.createDepthLimitFallback(element);
    }
    
    // Increment depth for this recursion level
    const newContext = { ...context, depth: context.depth + 1 };
    
    // Check edge case rules first
    for (const rule of this.edgeCaseRules) {
      const matches = typeof rule.pattern === 'function' 
        ? rule.pattern(element)
        : rule.pattern.test(element.outerHTML);
        
      if (matches) {
        console.log(`EnhancedAsciiDocConverter: Applying rule "${rule.name}" for element ${element.tagName}`);
        return rule.handler(element, newContext);
      }
    }
    
    // Standard element processing
    const tagName = element.tagName.toLowerCase();
    
    // Filter out elements that should never be converted to content
    if (this.shouldSkipElement(tagName)) {
      console.log(`📄 [Enhanced AsciiDoc] Skipping element: ${tagName}`);
      return '';
    }
    
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
        const text = this.processInlineContent(element, newContext);
        return text ? `${text}\n\n` : '';
        
      case 'div':
      case 'section':
        let divContent = '';
        for (const child of Array.from(element.children)) {
          divContent += this.processElement(child, newContext);
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
        // Treat UI tokens (commonly italicized in source) as bold for AsciiDoc style
        return `*${element.textContent}*`;
        
      case 'br':
        return ' +\n';
        
      case 'hr':
        return '\n---\n\n';
        
      case 'span':
        // Handle preprocessed glossary terms
        if (element.classList.contains('madcap-glossary-term')) {
          const term = element.getAttribute('data-term') || element.textContent?.trim() || '';
          if (term) {
            const anchor = `glossary-${term.toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')}`;
            console.log(`🔍 [EnhancedAsciiDoc] Converting preprocessed glossary term: "${term}" -> xref:${anchor}[${term}]`);
            return `xref:${anchor}[${term}]`;
          }
        }
        
        // Regular span - process inline content
        return this.processInlineContent(element, newContext);
        
      default:
        // Process children for unknown elements
        let content = '';
        for (const child of Array.from(element.childNodes)) {
          if (child.nodeType === 3) { // Text node
            content += child.textContent;
          } else if (child.nodeType === 1) { // Element node
            content += this.processElement(child as Element, newContext);
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
        
        // Apply style if specified (only at list start level)
        if (level === 0) {
          if (style === 'lower-alpha') result += '[loweralpha]\n';
          else if (style === 'upper-alpha') result += '[upperalpha]\n';
          else if (style === 'lower-roman') result += '[lowerroman]\n';
          else if (style === 'upper-roman') result += '[upperroman]\n';
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
            // Mark nested list as processed to prevent double processing
            context.processedElements.add(childEl);
            
            // Nested list - process with increased level
            const nestedContext = {
              ...newContext,
              listStack: [...context.listStack, { level, type, itemCount: 0 }]
            };
            itemContent += '\n' + this.processListElement(childEl, childEl.tagName === 'OL' ? 'ordered' : 'unordered', nestedContext);
          } else {
            itemContent += this.processElement(childEl, newContext);
          }
        }
      }
      
      result += `${marker} ${itemContent.trim()}\n`;
      
      // Add continuation marker if needed
      if (item.querySelector('ul, ol, pre, div.note, div.mc-note')) {
        result += '+\n';
      }
    }
    
    return result + '\n';
  }
  
  private processImage(img: Element): string {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    const title = img.getAttribute('title');
    
    // Extract and store the original image path for batch copying
    if (src && !src.startsWith('data:') && !src.startsWith('http')) {
      this.extractedImages.add(src);
      console.log(`📸 [Enhanced AsciiDoc] Extracted image for copying: ${src}`);
    }
    
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
    
    // FIRST: Handle Windows absolute paths like file:///C:/Flare/... 
    if (normalized.startsWith('file:///')) {
      console.log(`DEBUG: Detected Windows absolute path with file:// protocol`);
      // Remove file:// protocol
      normalized = normalized.replace('file:///', '');
      // Convert Windows path to Unix-style for further processing
      normalized = normalized.replace(/\\/g, '/');
      console.log(`DEBUG: After removing file:// protocol: "${normalized}"`);
    }
    
    // Handle other Windows absolute paths like C:\Flare\...
    if (normalized.match(/^[A-Z]:\//)) {
      console.log(`DEBUG: Detected Windows absolute path without protocol`);
      // Find a reasonable extraction point from Windows paths
      const pathSegments = normalized.split('/');
      // Look for common MadCap patterns in Windows paths
      for (let i = 0; i < pathSegments.length; i++) {
        if (pathSegments[i].includes('Images') && i < pathSegments.length - 1) {
          // Extract from Images/ onward
          normalized = pathSegments.slice(i).join('/');
          console.log(`DEBUG: Extracted Windows path from Images/ onward: "${normalized}"`);
          break;
        }
      }
    }
    
    // Handle MadCap-specific path patterns
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
    
    // Convert .htm/.html to .adoc for cross-references (handle hash fragments)
    if (href.match(/\.htm(l)?(#|$)/)) {
      const cleanHref = href.replace(/\.htm(l)?(#|$)/, '.adoc$2');
      return `xref:${cleanHref}[${text}]`;
    }
    
    return `${href}[${text}]`;
  }
  
  private processInlineContent(element: Element, context: ConversionContext): string {
    let result = '';
    const childNodes = Array.from(element.childNodes);
    
    for (let i = 0; i < childNodes.length; i++) {
      const child = childNodes[i];
      
      if (child.nodeType === 3) { // Text node
        const text = child.textContent || '';
        result += text; // Preserve original whitespace in text nodes
      } else if (child.nodeType === 1) { // Element node
        const elementResult = this.processElement(child as Element, context);
        
        if (elementResult) {
          // Enhanced spacing logic for proper word boundaries
          const needsSpaceBefore = this.shouldAddSpaceBefore(result, elementResult);
          
          if (needsSpaceBefore) {
            result += ' ';
          }
          
          result += elementResult;
          
          // Look ahead to next sibling to determine if we need space after
          const nextSibling = childNodes[i + 1];
          if (nextSibling && this.shouldAddSpaceAfter(elementResult, nextSibling)) {
            result += ' ';
          }
        }
      }
    }
    
    // Only trim excessive whitespace, preserve single spaces
    return result.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }
  
  /**
   * Determines if a space should be added before an inline element
   */
  private shouldAddSpaceBefore(currentResult: string, elementResult: string): boolean {
    // If result is empty or already ends with whitespace, no space needed
    if (!currentResult || /\s$/.test(currentResult)) {
      return false;
    }
    
    // If element already starts with whitespace, no space needed
    if (/^\s/.test(elementResult)) {
      return false;
    }
    
    const lastChar = currentResult.slice(-1);
    const firstChar = elementResult.charAt(0);
    
    // Always add space before AsciiDoc macros (image:, xref:, link:, kbd:) when not preceded by whitespace
    if (elementResult.match(/^(image:|xref:|link:|kbd:\[)/)) {
      return true;
    }
    
    // Always add space before bold/italic formatting when preceded by word characters
    if (elementResult.match(/^[\*_]/) && lastChar.match(/\w/)) {
      return true;
    }
    
    // Add space between word characters (handles most text-to-text cases)
    if (lastChar.match(/\w/) && firstChar.match(/\w/)) {
      return true;
    }
    
    // Add space between punctuation and word characters for readability
    if (lastChar.match(/[.,:;!?]/) && firstChar.match(/\w/)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Determines if a space should be added after an inline element
   */
  private shouldAddSpaceAfter(elementResult: string, nextSibling: Node): boolean {
    // If next sibling is a text node that starts with whitespace, no additional space needed
    if (nextSibling.nodeType === 3) { // Text node
      const nextText = nextSibling.textContent || '';
      if (/^\s/.test(nextText)) {
        return false; // Next text already starts with whitespace
      }
      
      // If the element result ends with AsciiDoc formatting and next text doesn't start with space
      // we need to add space to prevent text from being attached
      const lastChar = elementResult.slice(-1);
      const firstChar = nextText.charAt(0);
      
      // Add space after bold/italic formatting when followed by word characters
      if (elementResult.match(/[\*_]$/) && firstChar.match(/\w/)) {
        return true;
      }
      
      // Add space after AsciiDoc macros when followed by word characters
      if (elementResult.includes(']') && elementResult.match(/\]$/) && firstChar.match(/\w/)) {
        return true;
      }
      
      // Add space between word characters
      if (lastChar.match(/\w/) && firstChar.match(/\w/)) {
        return true;
      }
    }
    
    return false;
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
      crossRefs: new Map(),
      depth: 0,
      maxDepth: 50, // Limit recursion depth to prevent stack overflow
      processedElements: new WeakSet()
    };
  }
  
  /**
   * Determine if an element should be completely skipped during conversion
   * These elements contain non-content data that should never appear in AsciiDoc
   */
  private shouldSkipElement(tagName: string): boolean {
    const skipElements = [
      // Script and style elements
      'script', 'style', 'noscript',
      
      // Meta and head elements (should not be in body, but just in case)
      'meta', 'link', 'base', 'title',
      
      // HTML5 semantic elements that are containers only
      'head', 'html',
      
      // Interactive elements that don't translate to AsciiDoc
      'canvas', 'embed', 'object', 'param',
      
      // Form elements (could be added back if needed)
      'script', // Duplicate for emphasis - this is critical
      
      // Comment nodes
      '#comment'
    ];
    
    return skipElements.includes(tagName.toLowerCase());
  }
  
  private createDepthLimitFallback(element: Element): string {
    // Fallback processing when recursion depth limit is reached
    const tagName = element.tagName.toLowerCase();
    const textContent = element.textContent?.trim() || '';
    
    // Skip elements that should never produce content, even in fallback mode
    if (this.shouldSkipElement(tagName)) {
      console.log(`📄 [Enhanced AsciiDoc] Skipping element in fallback: ${tagName}`);
      return '';
    }
    
    // Handle common cases with simple text extraction
    switch (tagName) {
      case 'h1': return `\n== ${textContent}\n\n`;
      case 'h2': return `\n=== ${textContent}\n\n`;
      case 'h3': return `\n==== ${textContent}\n\n`;
      case 'h4': return `\n===== ${textContent}\n\n`;
      case 'h5': return `\n====== ${textContent}\n\n`;
      case 'h6': return `\n======= ${textContent}\n\n`;
      case 'p': return textContent ? `${textContent}\n\n` : '';
      case 'strong': 
      case 'b': return `*${textContent}*`;
      case 'em':
      case 'i': return `*${textContent}*`;
      case 'code': return `\`${textContent}\``;
      case 'a': 
        const href = element.getAttribute('href') || '';
        return href ? `${href}[${textContent}]` : textContent;
      case 'img':
        const src = element.getAttribute('src') || '';
        const alt = element.getAttribute('alt') || 'image';
        // Extract image even in fallback mode
        if (src && !src.startsWith('data:') && !src.startsWith('http')) {
          this.extractedImages.add(src);
          console.log(`📸 [Enhanced AsciiDoc] Extracted image (fallback): ${src}`);
        }
        return src ? `image::${src}[${alt}]` : '';
      default:
        // For other elements, just return the text content with a warning comment
        return textContent ? `// WARNING: Deep nesting truncated - ${tagName}\n${textContent}\n\n` : '';
    }
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
  
  /**
   * Generate AsciiDoc variables file from extracted MadCap variables
   */
  private generateVariablesFile(
    extractedVariables: { name: string; value: string }[], 
    variableOptions?: any
  ): string {
    if (!extractedVariables || extractedVariables.length === 0) {
      return '';
    }
    
    console.log(`📝 [EnhancedAsciiDocConverter] Generating variables file with ${extractedVariables.length} variables`);
    
    // Generate AsciiDoc variables file header
    let content = '// Variables extracted from MadCap Flare project\n';
    content += '// This file contains variable definitions for use in AsciiDoc documents\n\n';
    
    // Sort variables by name for consistency
    const sortedVariables = extractedVariables.sort((a, b) => a.name.localeCompare(b.name));
    
    for (const variable of sortedVariables) {
      // Convert MadCap variable name to AsciiDoc attribute name (kebab-case)
      const asciidocName = this.convertToAsciiDocAttributeName(variable.name);
      const cleanValue = this.cleanVariableValue(variable.value);
      
      // Add the variable definition as an AsciiDoc attribute
      content += `:${asciidocName}: ${cleanValue}\n`;
      
      console.log(`📝 [Variables] ${variable.name} -> :${asciidocName}: ${cleanValue}`);
    }
    
    content += '\n// End of variables\n';
    
    console.log(`✅ [EnhancedAsciiDocConverter] Generated variables file with ${sortedVariables.length} variables (${content.length} characters)`);
    return content;
  }
  
  /**
   * Convert MadCap variable name to AsciiDoc attribute name format (kebab-case)
   */
  private convertToAsciiDocAttributeName(variableName: string): string {
    return variableName
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-/, '')
      .replace(/-$/, '');
  }
  
  /**
   * Clean variable value for AsciiDoc format
   */
  private cleanVariableValue(value: string): string {
    if (!value) {
      return '';
    }
    
    // Remove HTML tags and entities, normalize whitespace
    return value
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Convert non-breaking spaces
      .replace(/&amp;/g, '&') // Convert HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
  
  // Method needed by MadCapConverter for compatibility
  getVariableExtractor(): VariableExtractor {
    return this.variableExtractor;
  }
}

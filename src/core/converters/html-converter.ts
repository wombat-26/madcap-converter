import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import { basename, extname, relative, dirname } from 'path';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index';
import { MadCapPreprocessor } from '../services/madcap-preprocessor';
import { HTMLPreprocessor } from '../services/html-preprocessor';
import { TextProcessor } from './text-processor';
import { EnhancedListProcessor } from './enhanced-list-processor';
import { PerformanceOptimizer } from './performance-optimizer';
import { MathNotationHandler } from './math-notation-handler';
import { CitationHandler } from './citation-handler';
import { VariableExtractor } from '../services/variable-extractor';

export class HTMLConverter implements DocumentConverter {
  supportedInputTypes = ['html'];
  private turndownService: TurndownService;
  private madCapPreprocessor: MadCapPreprocessor;
  private htmlPreprocessor: HTMLPreprocessor;
  private textProcessor: TextProcessor;
  private enhancedListProcessor: EnhancedListProcessor;
  private performanceOptimizer: PerformanceOptimizer;
  private mathNotationHandler: MathNotationHandler;
  private citationHandler: CitationHandler;
  private variableExtractor: VariableExtractor;

  constructor() {
    this.madCapPreprocessor = new MadCapPreprocessor();
    this.htmlPreprocessor = new HTMLPreprocessor();
    this.textProcessor = new TextProcessor();
    this.enhancedListProcessor = new EnhancedListProcessor();
    this.performanceOptimizer = new PerformanceOptimizer();
    this.mathNotationHandler = new MathNotationHandler();
    this.citationHandler = new CitationHandler();
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full'
    });

    // GENERAL FLARE CONVERSION RULE: Handle paragraphs with standalone images for Markdown
    this.turndownService.addRule('flareImageParagraphs', {
      filter: 'p',
      replacement: (content: string, node: any) => {
        // Check if this paragraph contains only an image
        const img = node.querySelector('img');
        if (!img) {
          // Not an image paragraph, return default paragraph processing
          return content ? `${content}\n\n` : '';
        }
        
        const text = node.textContent?.trim() || '';
        const alt = img.getAttribute('alt')?.trim() || '';
        const textWithoutImage = text.replace(alt, '').trim();
        
        // If this paragraph contains only the image (MadCap Flare rule), format as block
        if (textWithoutImage.length <= 5) {
          const src = img.getAttribute('src') || '';
          const width = img.getAttribute('width');
          const height = img.getAttribute('height');
          
          let imageMarkdown = `![${alt}](${src})`;
          if (width && height) {
            imageMarkdown = `<img src="${src}" alt="${alt}" width="${width}" height="${height}">`;
          }
          
          // Block image with proper spacing for MadCap Flare rule
          return `\n\n${imageMarkdown}\n\n`;
        }
        
        // Otherwise, return default paragraph processing
        return content ? `${content}\n\n` : '';
      }
    });

    // GENERAL FLARE CONVERSION RULE: Handle images with proper inline detection for Markdown
    // Override the default 'img' rule to ensure it takes priority for inline images
    this.turndownService.addRule('img', {
      filter: 'img',
      replacement: (content: string, node: any) => {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || '';
        const width = node.getAttribute('width');
        const height = node.getAttribute('height');
        const className = node.getAttribute('class') || '';
        
        // Check if this is part of a standalone image paragraph (handled by flareImageParagraphs rule)
        const parent = node.parentElement;
        if (parent && parent.tagName.toLowerCase() === 'p') {
          const text = parent.textContent?.trim() || '';
          const imageText = alt.trim();
          const textWithoutImage = text.replace(imageText, '').trim();
          if (textWithoutImage.length <= 5) {
            // This will be handled by flareImageParagraphs rule, so return empty
            return '';
          }
        }
        
        // For inline images, use normal markdown syntax
        let imageMarkdown = `![${alt}](${src})`;
        if (width && height && (parseInt(width) <= 32 && parseInt(height) <= 32)) {
          // Small images get HTML with size attributes
          imageMarkdown = `<img src="${src}" alt="${alt}" width="${width}" height="${height}">`;
        }
        
        return imageMarkdown;
      }
    });

    this.turndownService.addRule('removeComments', {
      filter: (node: any) => node.nodeType === 8,
      replacement: () => ''
    });

    // Add rule for pre/code blocks to prevent escaping of equals signs
    this.turndownService.addRule('preserveFormulas', {
      filter: (node: any) => {
        return node.nodeName === 'PRE' || 
               (node.nodeName === 'CODE' && node.textContent && node.textContent.includes('='));
      },
      replacement: (content: string) => {
        // Don't escape equals signs in formulas
        const cleanContent = content.replace(/\\=/g, '=');
        return `\`${cleanContent}\``;
      }
    });

    // Enhanced MadCap style mapping for various callout types
    this.turndownService.addRule('madcapCallouts', {
      filter: (node: any) => {
        if (node.nodeName !== 'DIV' && node.nodeName !== 'P') return false;
        if (!node.className) return false;
        
        const className = node.className.toString().toLowerCase();
        return this.isMadCapCalloutClass(className) && 
               !node.getAttribute('data-callout-type'); // Skip if already processed by MadCap preprocessor
      },
      replacement: (content: string, node: any) => {
        const className = node.className.toString().toLowerCase();
        const calloutInfo = this.getMadCapCalloutInfo(className);
        
        // Extract clean content using a simpler approach
        const cleanContent = this.getCleanTextFromCalloutNode(node);
        
        if (!cleanContent) return '';
        
        return `> **${calloutInfo.icon} ${calloutInfo.label}:** ${cleanContent}\n\n`;
      }
    });

    // Handle callouts that were already processed by MadCap preprocessor
    this.turndownService.addRule('processedCallouts', {
      filter: (node: any) => {
        return node.nodeName === 'DIV' && 
               node.className && 
               node.className.toString().includes('callout') &&
               node.getAttribute('data-callout-type');
      },
      replacement: (content: string, node: any) => {
        const calloutType = node.getAttribute('data-callout-type');
        const calloutInfo = this.getMadCapCalloutInfo(calloutType);
        
        // Extract content from the callout-content div
        const contentDiv = node.querySelector('.callout-content');
        const cleanContent = contentDiv ? contentDiv.textContent?.trim() || '' : content;
        
        return `> **${calloutInfo.icon} ${calloutInfo.label}:** ${cleanContent}\n\n`;
      }
    });

    // Handle semantic admonitions created by preprocessor - PRIORITY RULE
    this.turndownService.addRule('semanticAdmonitions', {
      filter: (node: any) => {
        return node.nodeName === 'DIV' && 
               node.className && 
               node.className.toString().includes('admonition') &&
               node.getAttribute('data-admonition');
      },
      replacement: (content: string, node: any) => {
        const admonitionType = node.getAttribute('data-admonition');
        const mappedType = this.mapToAsciiDocAdmonition(admonitionType);
        
        // Extract ONLY the text content from paragraph children
        let noteText = '';
        const paragraphs = node.querySelectorAll('p');
        for (const p of paragraphs) {
          const text = p.textContent?.trim() || '';
          if (text && !text.match(/^\s*(Note|Tip|Warning|Important|Caution)\s*$/i)) {
            // Remove "Note:" or similar prefixes from the content
            const cleanText = text.replace(/^\s*(Note|Tip|Warning|Important|Caution):\s*/i, '');
            noteText += cleanText + ' ';
          }
        }
        
        const cleanContent = noteText.trim();
        
        // Return as isolated block - no content absorption
        return `\n${mappedType}: ${cleanContent}\n\n`;
      }
    });

    // Handle boundary markers to prevent content absorption
    this.turndownService.addRule('admonitionBoundaries', {
      filter: (node: any) => {
        return node.getAttribute && node.getAttribute('data-admonition-boundary');
      },
      replacement: () => {
        return '\n<!-- BOUNDARY -->\n';
      }
    });

    // Add rule for note divs (handles complex note structures) - but skip if already processed by semantic admonitions
    this.turndownService.addRule('noteDivs', {
      filter: (node: any) => {
        return node.nodeName === 'DIV' && 
               node.className && node.className.includes('note') &&
               !node.getAttribute('data-processed') && // Skip if already processed by semantic admonitions
               !node.getAttribute('data-admonition') && // Skip if it's a semantic admonition
               !node.querySelector('table') && // Don't process if contains tables
               !node.querySelector('details'); // Don't process if contains collapsible content
      },
      replacement: (content: string, node: any) => {
        // Extract all text content, skipping the "Note" label
        let noteContent = '';
        const paragraphs = node.querySelectorAll('p');
        
        for (let i = 0; i < paragraphs.length; i++) {
          const p = paragraphs[i];
          const text = p.textContent || '';
          // Skip paragraphs that only contain "Note" or similar labels
          if (!text.match(/^\s*(Note|Tip)\s*$/i)) {
            // Remove "Note:" or similar prefixes from the content
            const cleanText = text.replace(/^\s*(Note|Tip|Warning|Important|Caution):\s*/i, '');
            noteContent += cleanText + ' ';
          }
        }
        
        const cleanContent = noteContent.trim();
        return cleanContent ? `\n> **📝 NOTE:** ${cleanContent}\n\n` : '';
      }
    });

    // Add rule for note paragraphs (better than spans for proper context)
    this.turndownService.addRule('noteParagraphs', {
      filter: (node: any) => {
        return node.nodeName === 'P' && 
               !node.closest('.note') && // Don't process if already handled by noteDivs
               (node.querySelector('.noteInDiv') || 
                (node.textContent && node.textContent.match(/^\s*(Note|Tip):\s*/i)));
      },
      replacement: (content: string) => {
        // Remove the "Note:" label and format as callout
        // Handle both "Note: " at start and "Note " followed by content
        const cleanContent = content
          .replace(/^\s*(Note|Tip):\s*/i, '')  // Remove "Note: " at start
          .replace(/^\s*(Note|Tip)\s+/i, '')   // Remove "Note " at start
          .trim();
        return `\n> **📝 NOTE:** ${cleanContent}\n`;
      }
    });

    // Enhanced definition list handling
    this.turndownService.addRule('definitionLists', {
      filter: 'dl',
      replacement: (content: string, node: any) => {
        let result = '\n';
        const children = Array.from(node.children);
        
        for (let i = 0; i < children.length; i++) {
          const child = children[i] as Element;
          const tagName = child.tagName.toLowerCase();
          
          if (tagName === 'dt') {
            // Definition term - make it bold
            const termText = child.textContent?.trim() || '';
            result += `**${termText}**\n`;
          } else if (tagName === 'dd') {
            // Definition description - indent with blockquote
            const descText = this.turndownService.turndown(child.innerHTML).trim();
            // Split by lines and indent each
            const lines = descText.split('\n');
            const indentedDesc = lines.map(line => `> ${line}`).join('\n');
            result += `${indentedDesc}\n\n`;
          }
        }
        
        return result;
      }
    });

    // Override default list handling to ensure proper formatting after preprocessing
    this.turndownService.addRule('lists', {
      filter: ['ul', 'ol'],
      replacement: (content: string, node: any) => {
        const tagName = node.tagName.toLowerCase();
        const isOrdered = tagName === 'ol';
        
        // Get list items
        const items = Array.from(node.children).filter((child: any) => 
          child.tagName.toLowerCase() === 'li'
        );
        
        let result = '\n';
        items.forEach((item: any, index: number) => {
          const itemContent = this.turndownService.turndown(item.innerHTML).trim();
          const marker = isOrdered ? `${index + 1}.` : '-';
          
          // Handle multi-line content
          const lines = itemContent.split('\n');
          if (lines.length === 1) {
            result += `${marker} ${itemContent}\n`;
          } else {
            // First line with marker
            result += `${marker} ${lines[0]}\n`;
            // Subsequent lines indented
            for (let i = 1; i < lines.length; i++) {
              if (lines[i].trim()) {
                // Check if it's a nested list
                if (lines[i].trim().match(/^[-*\d+\.]/)) {
                  result += `  ${lines[i]}\n`;
                } else {
                  result += `   ${lines[i]}\n`;
                }
              }
            }
          }
        });
        
        return result + '\n';
      }
    });
    
    this.variableExtractor = new VariableExtractor();
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    // HTMLConverter only handles Markdown format
    if (options.format === 'asciidoc') {
      throw new Error('HTMLConverter does not support AsciiDoc format. Use AsciiDocConverter instead.');
    }
    
    // Clear variable extractor for new conversion to start fresh - disabled for now
    // NOTE: MadCapConverter will transfer variables after this clearing
    // this.madCapPreprocessor.clearVariableExtractor();
    
    // Use performance optimization for large documents
    const optimizationResult = await this.performanceOptimizer.optimizeDocumentProcessing(
      input,
      async (chunk) => (await this.processChunk(chunk, options)).content
    );
    
    if (optimizationResult.warnings.length > 0) {
      console.log('Performance optimization warnings:', optimizationResult.warnings);
    }
    
    const { optimizedContent, metrics } = optimizationResult;
    
    // If this was optimized processing, return the result
    if (input.length >= 50000) {
      return {
        content: optimizedContent,
        metadata: {
          title: this.extractTitleFromContent(optimizedContent),
          wordCount: this.estimateWordCount(optimizedContent),
          warnings: optimizationResult.warnings.concat([
            `Large document processed with optimization (${Math.round(metrics.processingTime)}ms, ${metrics.memoryUsage}MB peak memory)`
          ])
        }
      };
    }
    
    // Standard processing for smaller documents
    return await this.processChunk(input, options);
  }

  private async processChunk(input: string, options: ConversionOptions): Promise<ConversionResult> {
    // Check if this HTML contains MadCap elements and preprocess if needed
    let processedInput = input;
    if (this.madCapPreprocessor.containsMadCapContent(input)) {
      processedInput = await this.madCapPreprocessor.preprocessMadCapContent(input, options.inputPath);
    }
    
    // Apply three-phase HTML preprocessing to clean malformed HTML
    processedInput = await this.htmlPreprocessor.preprocess(processedInput);
    
    const dom = new JSDOM(processedInput);
    const document = dom.window.document;
    
    // Clear variable extractor for new conversion
    this.variableExtractor.clear();
    
    // Extract variables if requested
    if (options.variableOptions?.extractVariables) {
      this.extractVariablesFromDocument(document);
    }
    
    // Process mathematical notation before conversion (only for markdown)
    if (this.mathNotationHandler.containsMathNotation(processedInput)) {
      this.mathNotationHandler.processMathInDocument(document, 'markdown');
    }
    
    // Process citations and footnotes (only for markdown)
    let citationWarnings: string[] = [];
    if (this.citationHandler.containsCitations(processedInput)) {
      const citationResult = this.citationHandler.processCitationsInDocument(document, 'markdown');
      citationWarnings = citationResult.warnings;
      processedInput = document.body?.innerHTML || document.documentElement.innerHTML;
    }
    
    // Rewrite links to converted file extensions for batch processing
    if (options.rewriteLinks) {
      this.rewriteDocumentLinks(document);
    }
    
    const title = document.querySelector('title')?.textContent || 
                  document.querySelector('h1')?.textContent || 
                  'Untitled Document';

    const images: string[] = [];
    if (options.extractImages) {
      const imgElements = document.querySelectorAll('img');
      imgElements.forEach(img => {
        const src = img.getAttribute('src');
        if (src) images.push(src);
      });
    }

    // Convert to Markdown using Turndown
    let content = this.turndownService.turndown(document.documentElement.outerHTML);
    
    // Fix over-escaped equals signs in formulas
    content = this.fixFormulaEscaping(content);
    // Fix callout formatting for Writerside compatibility
    content = this.fixCalloutFormatting(content);
    // Remove spaces before punctuation in Markdown
    content = this.removeSpacesBeforePunctuation(content);

    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

    // Generate variables file if extraction is enabled
    let variablesFile: string | undefined;
    // Generate variables file if requested
    const extractedVariables = this.variableExtractor.getVariables();
    
    if (options.variableOptions?.extractVariables && options.variableOptions.variableFormat && extractedVariables.length > 0) {
      try {
        variablesFile = this.variableExtractor.generateVariablesFile(options.variableOptions);
      } catch (error) {
        console.warn('Failed to generate variables file in HTMLConverter:', error);
      }
    }

    return {
      content,
      variablesFile,
      metadata: {
        title,
        wordCount,
        images: images.length > 0 ? images : undefined,
        variables: extractedVariables.length > 0 ? extractedVariables : undefined,
        warnings: citationWarnings.length > 0 ? citationWarnings : undefined
      }
    };
  }

  private preProcessAdmonitionsForBoundaries(document: Document): void {
    // Find all admonition divs and insert boundary markers
    const admonitions = document.querySelectorAll('[data-admonition]');
    
    admonitions.forEach(admonition => {
      // Create a boundary marker after each admonition
      const boundaryMarker = document.createElement('div');
      boundaryMarker.setAttribute('data-admonition-boundary', 'true');
      boundaryMarker.style.display = 'none';
      boundaryMarker.textContent = '<!-- BOUNDARY -->';
      
      // Insert after the admonition
      if (admonition.nextSibling) {
        admonition.parentNode?.insertBefore(boundaryMarker, admonition.nextSibling);
      } else {
        admonition.parentNode?.appendChild(boundaryMarker);
      }
    });
  }

  private convertToAsciiDoc(document: Document, options: ConversionOptions): string {
    const titleElement = document.querySelector('h1');
    const title = titleElement?.textContent?.trim() || 
                  document.querySelector('title')?.textContent?.trim() || 
                  'Untitled Document';
    
    // Generate document header
    let result = `= ${title}\n`;
    result += `:toc:\n`;
    result += `:icons: font\n`;
    result += `:experimental:\n`;
    
    // Add variables file include if extraction is enabled
    if (options.variableOptions?.extractVariables && options.variableOptions.variableFormat === 'adoc') {
      // Calculate relative path to includes/variables.adoc based on output path
      let variablesIncludePath = 'includes/variables.adoc';
      
      if (options.outputPath && options.outputDir) {
        if (options.outputPath.startsWith('/')) {
          // Absolute path - calculate relative to outputDir
          const fileDir = dirname(options.outputPath);
          const pathToRoot = relative(fileDir, options.outputDir);
          if (pathToRoot) {
            variablesIncludePath = `${pathToRoot}/includes/variables.adoc`;
          }
        } else {
          // Relative path - calculate depth from path components
          const pathParts = options.outputPath.split('/').filter(part => part !== '');
          const depth = pathParts.length - 1; // Subtract 1 for the filename
          if (depth > 0) {
            const pathToRoot = '../'.repeat(depth);
            variablesIncludePath = `${pathToRoot}includes/variables.adoc`;
          }
        }
      }
      
      result += `\n// Include variables file\ninclude::${variablesIncludePath}[]\n`;
    }
    
    result += '\n\n';  // Double newline to ensure proper separation from content
    
    const body = document.body || document.documentElement;
    
    // Skip complex HTML structure fixing to avoid infinite loops
    // this.fixMalformedListStructure(body);
    
    // Remove the first h1 from body since it's now the document title
    if (titleElement) titleElement.remove();
    
    // Convert remaining h1 elements to h2 to avoid duplicate document titles
    const remainingH1s = body.querySelectorAll('h1');
    remainingH1s.forEach(h1 => {
      const h2 = document.createElement('h2');
      h2.innerHTML = h1.innerHTML;
      h1.parentNode?.replaceChild(h2, h1);
    });
    
    const bodyContent = this.nodeToAsciiDoc(body, 0, options);
    result += bodyContent;
    
    // Clean up orphaned continuation markers and other formatting issues
    result = this.cleanupOrphanedContinuationMarkers(result);
    
    // Fix roman numeral lists and standalone continuation markers
    result = this.fixRomanNumeralLists(result);
    result = this.fixAlphabeticListNumbering(result);
    result = this.fixStandaloneContinuationMarkers(result);
    
    // Clean up the result with proper AsciiDoc formatting - SIMPLIFIED to avoid list corruption
    result = result.split('\n').map(line => {
      // Only trim lines that genuinely need it (don't be too aggressive)
      if (line.match(/^\s+(NOTE:|TIP:|WARNING:|CAUTION:|IMPORTANT:|\[cols|\[source\]|----)/)) {
        return line.trim();
      }
      return line;
    }).join('\n');
    
    result = result
    // SIMPLIFIED cleanup - only essential fixes to avoid list corruption
    // Clean up excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Fix malformed table syntax only
    .replace(/(\[cols="[^"]+"\])\n\|\s*\n\s*\n===/g, '$1\n|===')
    .replace(/(\[cols="[^"]+"\])\n\|\s*\n===/g, '$1\n|===')
    .replace(/\|\s*\n\s*\n===/g, '|===')
    .replace(/\|\s*\n===/g, '|===');
    
    // DISABLED: Most aggressive cleanup to prevent list corruption
    
    return result;
  }

  private convertElementToAsciiDoc(element: Element): string {
    let result = '';
    
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3) { // Text node
        const text = (child.textContent || '').trim();
        if (text) {
          result += text + ' ';
        }
      } else if (child.nodeType === 1) { // Element node
        const childElement = child as Element;
        result += this.convertSingleElementToAsciiDoc(childElement);
      }
    }
    
    return result;
  }

  private convertSingleElementToAsciiDoc(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    
    switch (tagName) {
      case 'h1': return `= ${this.getElementText(element)}\n\n`;
      case 'h2': return `== ${this.getElementText(element)}\n\n`;
      case 'h3': return `=== ${this.getElementText(element)}\n\n`;
      case 'h4': return `==== ${this.getElementText(element)}\n\n`;
      case 'h5': return `===== ${this.getElementText(element)}\n\n`;
      case 'h6': return `====== ${this.getElementText(element)}\n\n`;
      case 'p': {
        const text = this.getElementText(element);
        return text ? `${text}\n\n` : '';
      }
      case 'div': {
        // Handle special div types
        if (element.className.includes('note') || element.querySelector('.noteInDiv')) {
          let noteText = this.getElementText(element).replace(/^\s*Note\s*/i, '');
          noteText = noteText.replace(/📝\s*NOTE:\s*/g, '').trim();
          return `[NOTE]\n====\n${noteText}\n====\n\n`;
        }
        if (element.getAttribute('data-madcap-dropdown')) {
          // MadCap dropdown should have been converted to h2 + content
          return this.convertElementToAsciiDoc(element);
        }
        return this.convertElementToAsciiDoc(element);
      }
      case 'table':
        return this.convertTableToValidAsciiDoc(element);
      case 'ul':
        return this.enhancedListProcessor.convertListWithDeepNesting(element, '*', 0);
      case 'ol':
        return this.enhancedListProcessor.convertListWithDeepNesting(element, '.', 0);
      case 'strong':
      case 'b': {
        const text = this.getElementText(element);
        // If the element contains only punctuation, don't format it
        if (text.trim().match(/^[.,;:!?()\[\]{}"']+$/)) {
          return text;
        }
        return `*${text}*`;
      }
      case 'em':
      case 'i': {
        const text = this.getElementText(element);
        // If the element contains only punctuation, don't format it
        if (text.trim().match(/^[.,;:!?()\[\]{}"']+$/)) {
          return text;
        }
        return `_${text}_`;
      }
      case 'blockquote':
        return `____\n${this.getElementText(element)}\n____\n\n`;
      case 'a': {
        const href = element.getAttribute('href');
        const text = this.getElementText(element);
        if (href && text) {
          // Skip external links
          if (href.startsWith('http') || href.startsWith('mailto:')) {
            return `link:${href}[${text}]`;
          }
          // Normalize filenames to match TOC-based naming convention
          let convertedHref = href;
          const needsNormalization = convertedHref.includes(' ') || /[A-Z]/.test(convertedHref);
          
          if (needsNormalization) {
            const [path, filename] = convertedHref.split('/').length > 1 
              ? [convertedHref.substring(0, convertedHref.lastIndexOf('/')), convertedHref.substring(convertedHref.lastIndexOf('/') + 1)]
              : ['', convertedHref];
            const cleanFilename = filename.replace(/\.(htm|html)$/i, '').toLowerCase()
              .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
              .replace(/^-+|-+$/g, '') + '.adoc';
            convertedHref = path ? `${path}/${cleanFilename}` : cleanFilename;
          } else {
            // Just convert .htm extensions to .adoc for internal links
            convertedHref = convertedHref.replace(/\.htm(l?)$/, '.adoc');
          }
          return `xref:${convertedHref}[${text}]`;
        } else if (text) {
          return text;
        }
        return '';
      }
      case 'img': {
        const src = element.getAttribute('src');
        const alt = element.getAttribute('alt') || '';
        const width = element.getAttribute('width');
        const height = element.getAttribute('height');
        
        if (src) {
          // Determine if this should be inline or block image
          // Inline images are typically small icons within text, block images are standalone
          const isInline = this.isInlineImage(element, width, height);
          const imagePrefix = isInline ? 'image:' : 'image::';
          
          let imageRef = `${imagePrefix}${src}[${alt}`;
          if (width) imageRef += `, ${width}`;
          if (height && width) imageRef += `, ${height}`;
          imageRef += ']';
          return imageRef;
        }
        return '';
      }
      case 'code':
        return `\`${this.getElementText(element)}\``;
      default:
        return this.convertElementToAsciiDoc(element);
    }
  }

  private getElementText(element: Element): string {
    let text = '';
    
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3) {
        const nodeText = (child.textContent || '').trim();
        if (nodeText) {
          text += nodeText + ' ';
        }
      } else if (child.nodeType === 1) {
        const childElement = child as Element;
        const childTag = childElement.tagName.toLowerCase();
        
        // Extract plain text only - let nodeToAsciiDoc handle formatting
        if (childTag === 'strong' || childTag === 'b') {
          text += `${this.getElementText(childElement)} `;
        } else if (childTag === 'em' || childTag === 'i') {
          text += `${this.getElementText(childElement)} `;
        } else if (childTag === 'a') {
          // Extract plain text only - let nodeToAsciiDoc handle link formatting
          const linkText = this.getElementText(childElement);
          if (linkText) {
            text += linkText + ' ';
          }
        } else if (childTag === 'code') {
          // Extract plain text only - let nodeToAsciiDoc handle code formatting
          text += `${this.getElementText(childElement)} `;
        } else {
          text += this.getElementText(childElement) + ' ';
        }
      }
    }
    
    return text.trim();
  }

  private convertTableToValidAsciiDoc(table: Element): string {
    // Use simple table converter for basic table handling
    return this.convertSimpleTable(table as HTMLTableElement);
  }

  private getPlainTextFromElement(element: Element): string {
    // Extract plain text, converting lists to inline format
    let text = '';
    
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3) {
        const nodeText = (child.textContent || '').trim();
        if (nodeText) {
          text += nodeText + ' ';
        }
      } else if (child.nodeType === 1) {
        const childElement = child as Element;
        const childTag = childElement.tagName.toLowerCase();
        
        if (childTag === 'ul' || childTag === 'ol') {
          const items = Array.from(childElement.querySelectorAll('li'));
          const listText = items.map(item => this.getPlainTextFromElement(item)).join('; ');
          text += listText + ' ';
        } else {
          text += this.getPlainTextFromElement(childElement) + ' ';
        }
      }
    }
    
    // Fix concatenated words that might result from MadCap variable processing
    text = text.replace(/([a-z])([A-Z][a-z])/g, '$1 $2'); // Add space between camelCase words
    text = text.replace(/\b(Other|Picture|Agency|Internal)([a-z])/g, '$1 $2'); // Fix specific concatenations
    
    return text.trim();
  }

  private convertListToValidAsciiDoc(list: Element, marker: string): string {
    const items = list.querySelectorAll('li');
    let result = '';
    
    items.forEach(item => {
      const itemText = this.getElementText(item);
      if (itemText) {
        result += `${marker} ${itemText}\n`;
      }
    });
    
    return result + '\n';
  }

  private cleanupAsciiDocOutput(text: string): string {
    return text.split('\n').map(line => {
      // Remove ALL leading spaces from every line
      return line.trimLeft();
    }).join('\n')
    // Fix navigation breadcrumbs
    .replace(/_> ([^_>]+) > ([^_>]+) > ([^_>]+) > ([^_>]+)_/g, '*$1 > $2 > $3 > $4*')
    .replace(/_> ([^_>]+) > ([^_>]+) > ([^_>]+)_/g, '*$1 > $2 > $3*')
    .replace(/_> ([^_>]+)_/g, '*$1*')
    // Clean up multiple blank lines
    .replace(/\n\n\n+/g, '\n\n');
  }

  private nodeToAsciiDoc(node: Node, depth: number = 0, options?: ConversionOptions): string {
    if (node.nodeType === 3) {
      return (node.textContent || '').trim();
    }

    if (node.nodeType !== 1) return '';

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    
    
    // Handle special elements that need custom processing first - with explicit debug
    if (tagName === 'ul') {
      // TODO: Add list structure validation when method is available
      // const warnings = this.enhancedListProcessor.validateListStructure(element);
      // if (warnings.length > 0) {
      //   console.warn('List structure warnings:', warnings);
      // }
      return this.enhancedListProcessor.convertListWithDeepNesting(element, '*', depth);
    }
    if (tagName === 'ol') {
      // TODO: Add list structure validation when method is available
      // const warnings = this.enhancedListProcessor.validateListStructure(element);
      // if (warnings.length > 0) {
      //   console.warn('List structure warnings:', warnings);
      // }
      return this.enhancedListProcessor.convertListWithDeepNesting(element, '.', depth);
    }
    if (tagName === 'table') {
      return this.convertTableToAsciiDoc(element);
    }
    
    // For container elements, preserve structure
    let children: string;
    if (tagName === 'body' || tagName === 'html') {
      // For top-level containers, process each child individually and join with proper spacing
      const childResults: string[] = [];
      for (const child of Array.from(element.childNodes)) {
        // Don't increment depth for body/html elements
        const result = this.nodeToAsciiDoc(child, depth, options);
        if (result.trim()) {
          // Don't trim list results as they need their leading newlines
          if (result.includes('\n.') || result.includes('\n*') || result.includes('\n-')) {
            childResults.push(result);
          } else {
            childResults.push(result.trim());
          }
        }
      }
      children = childResults.join('\n\n');
    } else if (tagName === 'div') {
      // For divs, preserve structure and paragraph spacing
      const childResults: string[] = [];
      for (const child of Array.from(element.childNodes)) {
        const result = this.nodeToAsciiDoc(child, depth + 1, options);
        if (result.trim()) {
          childResults.push(result.trim());
        }
      }
      // Check if this div contains block-level content (paragraphs, lists, etc.)
      const hasBlockContent = element.querySelector('p, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre');
      if (hasBlockContent || element.className?.includes('dropdown-content')) {
        // Join with double newlines to preserve paragraph spacing
        children = childResults.join('\n\n');
      } else {
        // For inline content divs, use single newlines
        children = childResults.join('\n');
      }
    } else {
      // For inline and other elements, use smart text processing
      children = this.textProcessor.processChildNodes(
        Array.from(element.childNodes),
        (child) => this.nodeToAsciiDoc(child, depth + 1, options)
      );
    }

    switch (tagName) {
      case 'h1': return `= ${children.trim()}\n\n`;
      case 'h2': return `== ${children.trim()}\n\n`;
      case 'h3': return `=== ${children.trim()}\n\n`;
      case 'h4': return `==== ${children.trim()}\n\n`;
      case 'h5': return `===== ${children.trim()}\n\n`;
      case 'h6': return `====== ${children.trim()}\n\n`;
      case 'p': {
        // Check if this paragraph contains a note span and should be converted to an admonition
        const noteSpan = element.querySelector('.noteInDiv, .warningInDiv, .tipInDiv, .cautionInDiv');
        if (noteSpan) {
          const spanText = noteSpan.textContent?.trim() || '';
          if (spanText.match(/^(Note|Tip|Warning|Caution|Attention|Important):?$/i)) {
            // Extract the admonition type and content
            const admonitionType = spanText.replace(/:$/, '').toUpperCase();
            const mappedType = this.mapToAsciiDocAdmonition(admonitionType);
            
            // Remove the note span and process remaining content with proper formatting
            const noteSpanClone = noteSpan.cloneNode(true);
            noteSpan.remove();
            
            // Process the remaining paragraph content to preserve links and formatting
            let noteContent = this.textProcessor.processChildNodes(
              Array.from(element.childNodes),
              (child) => this.nodeToAsciiDoc(child, depth + 1, options)
            );
            
            // Clean up leading colon or spaces
            noteContent = noteContent.replace(/^:\s*/, '').trim();
            
            // Restore the noteSpan for other processing
            element.insertBefore(noteSpanClone, element.firstChild);
            
            if (noteContent) {
              return `${mappedType}: ${noteContent}\n\n`;
            }
          }
        }
        
        if (children.trim()) {
          // Special handling for paragraphs that contain only an image
          const imgChild = element.querySelector('img');
          if (imgChild && element.children.length === 1) {
            // Check if paragraph has no text content (only the image)
            const textContent = element.textContent?.trim() || '';
            const altText = imgChild.getAttribute('alt')?.trim() || '';
            if (textContent === altText || textContent === '') {
              // This paragraph contains only an image - ensure it's treated as a block
              const imageResult = this.nodeToAsciiDoc(imgChild, depth + 1, options);
              return `\n\n${imageResult.trim()}\n\n`;
            }
          }
          
          // Add extra line break before paragraphs that follow images or other block elements
          const prevSibling = element.previousElementSibling;
          const needsExtraSpace = prevSibling && (
            prevSibling.tagName.toLowerCase() === 'img' ||
            prevSibling.tagName.toLowerCase() === 'div' ||
            prevSibling.className?.includes('note')
          );
          const prefix = needsExtraSpace ? '\n' : '';
          return `${prefix}${children.trim()}\n\n`;
        }
        return '';
      }
      case 'strong': 
      case 'b': return `*${children}*`;
      case 'em': 
      case 'i': {
        // In technical documentation, many <i> tags represent emphasized terms that should be bold in AsciiDoc
        // Convert certain patterns to bold instead of italic for better AsciiDoc formatting
        const text = children.trim();
        
        // Check if this is a technical term, UI element, or emphasized concept that should be bold
        const shouldBeBold = text.match(/^(Activity Roll-Up|Tactic [AB]|Details|Budget|Funding Source|Demand Gen Campaign|Master Settings|Custom Settings|Columns|Spend Data Category|Planned|Expected|Committed|Actual|Estimated Costs)$/i) ||
                            text.includes('Roll-Up') ||
                            text.includes('Campaign') ||
                            text.includes('Tactic') ||
                            text.includes('Budget') ||
                            text.includes('Settings') ||
                            text.includes('Details');
        
        return shouldBeBold ? `*${children}*` : `_${children}_`;
      }
      case 'code': {
        // For inline code, use backticks; for block code, check parent
        const parentTag = element.parentElement?.tagName.toLowerCase();
        if (parentTag === 'pre') {
          // This will be handled by the pre case
          return children;
        }
        return `\`${children}\``;
      }
      case 'pre': {
        // Check if this contains a code element
        const codeElement = element.querySelector('code');
        if (codeElement) {
          const cleanCode = codeElement.textContent || children;
          return `[source]\n----\n${cleanCode.trim()}\n----\n\n`;
        }
        // Fallback for pre without code
        const cleanCode = children.replace(/`/g, '');
        return `[source]\n----\n${cleanCode.trim()}\n----\n\n`;
      }
      case 'a': {
        const href = element.getAttribute('href');
        if (!href) return children;
        
        // Convert .htm/.html to .adoc for internal links and normalize filenames
        let convertedHref = href;
        if (this.isDocumentLink(href)) {
          // Apply filename normalization for links that need it
          const needsNormalization = convertedHref.includes(' ') || /[A-Z]/.test(convertedHref);
          
          if (needsNormalization) {
            // Extract anchor fragment if present
            const [baseHref, fragment] = convertedHref.split('#');
            const [path, filename] = baseHref.split('/').length > 1 
              ? [baseHref.substring(0, baseHref.lastIndexOf('/')), baseHref.substring(baseHref.lastIndexOf('/') + 1)]
              : ['', baseHref];
            
            const cleanFilename = filename
              .replace(/\.(htm|html)$/i, '') // Remove extension first
              .toLowerCase()
              .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
              .replace(/\s+/g, '-') // Replace spaces with hyphens
              .replace(/-+/g, '-') // Collapse multiple hyphens
              .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
              + '.adoc';
            
            convertedHref = path ? `${path}/${cleanFilename}` : cleanFilename;
            if (fragment) {
              convertedHref += '#' + fragment;
            }
          } else {
            // Simple extension conversion
            convertedHref = convertedHref.replace(/\.htm(l?)(#.*)?$/i, (match, ext, anchor) => {
              return '.adoc' + (anchor || '');
            });
          }
        }
        
        // Check if the link contains only an image
        const imgElement = element.querySelector('img');
        if (imgElement && element.textContent?.trim() === '') {
          const src = imgElement.getAttribute('src');
          const alt = imgElement.getAttribute('alt') || '';
          
          // Check if this linked image is within a list item
          const isInListItem = this.isWithinListItem(element);
          
          if (isInListItem) {
            // For linked images in list items, don't add continuation marker here
            return `image::${src}[${alt}]`;
          } else {
            // For linked images, just show the image without the link with proper spacing
            return `\n\nimage::${src}[${alt}]\n\n`;
          }
        }
        
        // Determine the appropriate link format
        let linkMacro = 'link:';
        let finalHref = convertedHref;
        
        if (convertedHref.startsWith('#')) {
          // For anchor-only links, use the cleaner <<anchor>> syntax in AsciiDoc
          const anchor = convertedHref.substring(1);
          return `<<${anchor},${children}>>`;
        } else if (this.isDocumentLink(convertedHref)) {
          // Use xref: for internal document links
          linkMacro = 'xref:';
        }
        
        // Check if this is a tile/card link (contains both image and structural elements like h3/p)
        const hasStructuralContent = element.querySelector('h1, h2, h3, h4, h5, h6, p');
        if (imgElement && hasStructuralContent) {
          // This is likely a tile/card structure - convert it differently
          const tileTitle = element.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim() || '';
          const tileDescription = element.querySelector('p')?.textContent?.trim() || '';
          const imgSrc = imgElement.getAttribute('src') || '';
          const imgAlt = imgElement.getAttribute('alt') || tileTitle;
          
          // Convert to a structured format in AsciiDoc
          let result = '\n';
          if (imgSrc) {
            // Check if this image has IconInline class for smaller sizing
            const hasIconInlineClass = imgElement.className.includes('IconInline');
            const imageSize = hasIconInlineClass ? 18 : 200;
            result += `image::${imgSrc}[${imgAlt}, ${imageSize}]\n\n`;
          }
          result += `*${linkMacro}${convertedHref}[${tileTitle}]*\n\n`;
          if (tileDescription) {
            result += `${tileDescription}\n\n`;
          }
          return result;
        }
        
        return `${linkMacro}${finalHref}[${children}]`;
      }
      case 'img': {
        const src = element.getAttribute('src');
        let alt = element.getAttribute('alt') || '';
        if (!src) return '';
        
        // If no alt text provided, generate descriptive alt text based on filename
        if (!alt) {
          const filename = src.split('/').pop() || '';
          const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
          
          // Generate descriptive alt text based on common patterns
          if (nameWithoutExt.includes('ActivityRoll-Up')) {
            alt = 'Activity Roll-Up Example';
          } else if (nameWithoutExt.includes('Addition Spend Data')) {
            alt = 'Spend Data Category Configuration';
          } else if (nameWithoutExt.includes('TrackingSpend')) {
            alt = 'Tracking Spend Interface';
          } else {
            // Convert filename to readable alt text
            alt = nameWithoutExt.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          }
        }
        
        // Use existing isInlineImage method for consistent inline detection
        const width = element.getAttribute('width');
        const height = element.getAttribute('height');
        const hasIconInlineClass = element.className.includes('IconInline');
        const isInline = hasIconInlineClass || this.isInlineImage(element, width, height);
        
        // Check if this image is within a list item and should be a continuation
        const isInListItem = this.isWithinListItem(element);
        const isStandaloneImage = this.isStandaloneImageParagraph(element);
        
        if (isInline) {
          // For IconInline class, add sizing attributes to maintain 18px height from CSS
          if (hasIconInlineClass) {
            return `image:${src}[${alt}, 18]`; // Inline image with height constraint
          }
          return `image:${src}[${alt}]`; // Regular inline image syntax (single colon)
        } else {
          // Block image - check if it needs continuation marker for list context
          if (isInListItem) {
            // Image in list item - don't add continuation marker here, let list item processing handle it
            return `image::${src}[${alt}]`; // Block image without extra markers
          } else {
            // Regular block image - ensure proper spacing before and after
            return `\n\nimage::${src}[${alt}]\n\n`; // Block image syntax (double colon) with extra line breaks
          }
        }
      }
      case 'ul': 
        // This should not be reached due to early return above
        return this.enhancedListProcessor.convertListWithDeepNesting(element, '*', depth);
      case 'ol': 
        // This should not be reached due to early return above
        return this.enhancedListProcessor.convertListWithDeepNesting(element, '.', depth);
      case 'dl':
        // Convert definition list using enhanced processor
        return this.enhancedListProcessor.convertListWithDeepNesting(element, '', depth);
      case 'li': {
        // For list items, process children to preserve structure (including nested admonitions)
        const childResults: string[] = [];
        for (const child of Array.from(element.childNodes)) {
          const result = this.nodeToAsciiDoc(child, depth + 1, options);
          if (result.trim()) {
            childResults.push(result.trim());
          }
        }
        
        // Join children with proper spacing - add continuation markers for admonitions and block images
        let content = '';
        for (let i = 0; i < childResults.length; i++) {
          const item = childResults[i];
          if (i === 0) {
            content += item;
          } else {
            // Check if this item already has a continuation marker
            const hasExistingContinuation = item.match(/^\+\s*/);
            
            // Check if this item needs a continuation marker
            const needsContinuation = 
              item.match(/^(NOTE|WARNING|TIP|IMPORTANT|CAUTION):/) || // Admonitions
              item.match(/^image::/) || // Block images (without existing +)
              item.match(/^\s*\[.*\]\s*\|===/) || // Tables
              item.match(/^\s*----/) || // Code blocks
              (i > 1 && !hasExistingContinuation); // Any content after the first paragraph needs continuation
              
            if (needsContinuation && !hasExistingContinuation) {
              content += '\n+\n' + item;
            } else if (hasExistingContinuation) {
              // Item already has continuation marker from image processing
              content += '\n' + item;
            } else {
              content += '\n' + item;
            }
          }
        }
        return content;
      }
      case 'dt': {
        // Definition term - should not be processed outside of dl
        return '';
      }
      case 'dd': {
        // Definition description - should not be processed outside of dl
        return '';
      }
      case 'table': return this.convertTableToValidAsciiDoc(element);
      case 'blockquote': 
      case 'div': {
        // Check if this is a tile/grid container
        const className = element.className?.toString() || '';
        if (className.includes('home-tiles') || className.includes('tile-grid') || className.includes('card-grid') || 
            className.match(/tiles\d+/) || className.match(/grid\d+/)) {
          // Extract grid column count from class name if possible (e.g., home-tiles3 = 3 columns)
          const gridMatch = className.match(/(?:tiles|grid)(\d+)/);
          const gridColumns = gridMatch ? parseInt(gridMatch[1]) : 3;
          
          // Check if we should convert to table format (optional enhancement)
          if (options?.asciidocOptions?.tilesAsTable) {
            // Convert tiles to AsciiDoc table
            const tiles = element.querySelectorAll('.tile, .card');
            if (tiles.length > 0) {
              let result = `[cols="${gridColumns}*", frame=none, grid=none, role="tiles"]\n|===\n`;
              
              tiles.forEach((tile, index) => {
                const link = tile.querySelector('a');
                if (link) {
                  const imgElement = link.querySelector('img');
                  const titleElement = link.querySelector('h1, h2, h3, h4, h5, h6');
                  const descElement = link.querySelector('p');
                  const href = link.getAttribute('href') || '#';
                  
                  result += '|';
                  if (imgElement) {
                    const src = imgElement.getAttribute('src') || '';
                    const alt = imgElement.getAttribute('alt') || '';
                    // Check if this image has IconInline class for smaller sizing
                    const hasIconInlineClass = imgElement.className.includes('IconInline');
                    const imageSize = hasIconInlineClass ? 18 : 150;
                    result += `image:${src}[${alt}, ${imageSize}]\n\n`;
                  }
                  if (titleElement) {
                    const title = titleElement.textContent?.trim() || '';
                    // Convert href to .adoc if needed
                    let processedHref = href;
                    if (options?.rewriteLinks && this.isDocumentLink(href)) {
                      processedHref = href.replace(/\.html?(#.*)?$/i, (match, anchor) => {
                        return '.adoc' + (anchor || '');
                      });
                    }
                    const linkMacro = this.isDocumentLink(processedHref) ? 'xref:' : 'link:';
                    result += `*${linkMacro}${processedHref}[${title}]*\n\n`;
                  }
                  if (descElement) {
                    result += descElement.textContent?.trim() || '';
                  }
                  result += '\n';
                }
              });
              
              result += '|===\n\n';
              return result;
            }
          }
          
          // Default: Process tile container - just process children without wrapping
          const childResults: string[] = [];
          for (const child of Array.from(element.childNodes)) {
            const result = this.nodeToAsciiDoc(child, depth + 1, options);
            if (result.trim()) {
              childResults.push(result.trim());
            }
          }
          return childResults.join('\n\n') + '\n\n';
        }
        
        // Check if this is an individual tile/card - but skip if parent is a tile container
        if (className.includes('tile') || className.includes('card')) {
          // Check if this tile is inside a tile container that should be processed as table
          let parent = element.parentElement;
          let foundTileContainer = false;
          while (parent && !foundTileContainer) {
            const parentClass = parent.className?.toString() || '';
            if (parentClass.includes('home-tiles') || parentClass.includes('tile-grid') || 
                parentClass.includes('card-grid') || parentClass.match(/tiles\d+/) || parentClass.match(/grid\d+/)) {
              foundTileContainer = true;
            }
            parent = parent.parentElement;
          }
          
          if (foundTileContainer && options?.asciidocOptions?.tilesAsTable) {
            // Skip individual processing - let the container handle it
            return '';
          }
          
          // Process tile content specially to maintain structure
          const link = element.querySelector('a');
          if (link) {
            // Let the link handler process this tile
            return this.nodeToAsciiDoc(link, depth + 1, options);
          }
          // Otherwise process normally
          return children.trim() ? children.trim() + '\n\n' : '';
        }
        
        // Handle semantic admonitions FIRST (highest priority)
        if (element.getAttribute('data-admonition')) {
          const admonitionType = element.getAttribute('data-admonition') || 'note';
          const mappedType = this.mapToAsciiDocAdmonition(admonitionType);
          
          // Process paragraph children while preserving structure (including links)
          let noteContent = '';
          const paragraphs = element.querySelectorAll('p');
          for (const p of paragraphs) {
            const pContent = this.nodeToAsciiDoc(p, depth + 1, options).trim();
            if (pContent && !pContent.match(/^\s*(Note|Tip|Warning|Important|Caution)\s*$/i)) {
              if (noteContent) {
                noteContent += '\n\n' + pContent;
              } else {
                noteContent = pContent;
              }
            }
          }
          
          const cleanContent = noteContent.trim();
          return `\n${mappedType}: ${cleanContent}\n\n`;
        }
        
        // Enhanced MadCap callout handling for AsciiDoc - check for simple 'note' class first
        if (element.className && (this.isMadCapCalloutClass(element.className.toString().toLowerCase()) || element.className.toString().toLowerCase().includes('note'))) {
          const calloutInfo = this.getMadCapCalloutInfo(element.className.toString().toLowerCase());
          const cleanContent = this.getCleanTextFromCalloutNode(element);
          
          if (cleanContent) {
            const admonitionType = this.mapToAsciiDocAdmonition(calloutInfo.label);
            // Use proper AsciiDoc admonition syntax: just the type and content
            return `[${admonitionType}]\n====\n${cleanContent}\n====\n\n`;
          }
          return '';
        }
        
        // Legacy note handling for backward compatibility
        if ((element.className.includes('note') || element.querySelector('.noteInDiv')) && 
            !element.querySelector('h1, h2, h3, h4, h5, h6') && 
            !element.querySelector('img') &&
            !element.querySelector('table')) {
          
          // Process children while preserving structure (including links)
          let noteContent = '';
          const paragraphs = element.querySelectorAll('p');
          for (const p of paragraphs) {
            // Skip paragraphs that only contain the "Note:" label
            const noteSpan = p.querySelector('.noteInDiv, span[class*="noteInDiv"]');
            if (noteSpan) {
              const spanText = noteSpan.textContent?.trim() || '';
              if (spanText.match(/^\s*(Note|Tip|Warning|Important|Caution):?\s*$/i)) {
                // Remove the note span and process remaining content
                noteSpan.remove();
              }
            }
            
            // Process the paragraph content with proper link handling
            const pContent = this.nodeToAsciiDoc(p, depth + 1, options).trim();
            if (pContent && !pContent.match(/^\s*(Note|Tip|Warning|Important|Caution):\s*$/i)) {
              if (noteContent) {
                noteContent += ' ' + pContent;
              } else {
                noteContent = pContent;
              }
            }
          }
          
          // Clean up any remaining note labels
          noteContent = noteContent.replace(/^\s*Note:?\s*/i, '').trim();
          noteContent = noteContent.replace(/\*\*NOTE:\*\*\s*/g, '').trim();
          noteContent = noteContent.replace(/📝\s*NOTE:\s*/g, '').trim();
          
          return noteContent ? `[NOTE]\n====\n${noteContent}\n====\n\n` : '';
        }
        
        // Legacy warning handling for backward compatibility
        if (element.className.includes('warning') || element.querySelector('.warningInDiv')) {
          let warningText = children.replace(/^\s*(Attention|Warning):?\s*/i, '').trim();
          warningText = warningText.replace(/⚠️\s*WARNING:\s*/g, '').trim();
          return `[WARNING]\n====\n${warningText}\n====\n\n`;
        }
        // Handle note divs that contain images separately
        if ((element.className.includes('note') || element.querySelector('.noteInDiv')) && 
            element.querySelector('img')) {
          // Process normally without NOTE: prefix for image-containing notes
          return children.trim() + '\n\n';
        }
        // Check for MadCap dropdown - process each child separately to maintain structure
        if (element.getAttribute('data-madcap-dropdown') || 
            element.className.includes('madcap-dropdown-section') ||
            element.tagName?.toLowerCase() === 'madcap:dropdown' ||
            element.tagName === 'MadCap:dropDown') {
          // Check if we should use collapsible blocks for AsciiDoc
          if (options?.format === 'asciidoc' && options?.asciidocOptions?.useCollapsibleBlocks) {
            return this.convertToCollapsibleBlock(element, depth, options);
          }
          
          const childResults: string[] = [];
          for (const child of Array.from(element.childNodes)) {
            if (child.nodeType === 1) { // Element node
              const childElement = child as Element;
              const childResult = this.nodeToAsciiDoc(childElement, depth + 1, options);
              if (childResult.trim()) {
                // Don't trim image results - they need their spacing preserved
                // Check if this is a block image paragraph result
                const isBlockImageResult = childResult.includes('image::') && 
                                         (childResult.startsWith('\n\n') || childResult.trim().startsWith('\n\nimage::'));
                childResults.push(isBlockImageResult ? childResult : childResult.trim());
              }
            } else if (child.nodeType === 3) { // Text node
              const text = (child.textContent || '').trim();
              if (text && text !== '\n\n') {
                childResults.push(text);
              }
            }
          }
          // Join results with proper spacing - ensure paragraph separation
          let result = '';
          for (let i = 0; i < childResults.length; i++) {
            const item = childResults[i];
            result += item;
            
            // Add spacing between elements if needed
            if (i < childResults.length - 1) {
              // If current item doesn't end with \n\n and next item doesn't start with \n
              if (!item.endsWith('\n\n') && !childResults[i + 1].startsWith('\n')) {
                result += '\n\n';
              }
            }
          }
          return result + '\n\n';
        }
        return children.trim() ? children.trim() + '\n\n' : '';
      }
      case 'hr': return `'''\n\n`;
      case 'br': return ' +\n';
      case 'kbd': {
        // Convert keyboard shortcuts to AsciiDoc kbd macro
        if (children.trim()) {
          return `kbd:[${children.trim()}]`;
        }
        return children;
      }
      case 'button': {
        // Convert button elements to AsciiDoc button macro
        if (children.trim()) {
          return `btn:[${children.trim()}]`;
        }
        return children;
      }
      case 'span': {
        // Check for note spans - return empty string to avoid duplication (handled by parent div)
        if (element.className.includes('noteInDiv') || element.textContent?.match(/^\s*(Note|Tip):?\s*$/i)) {
          return '';
        }
        // Check for warning spans - return empty string to avoid duplication (handled by parent div)
        if (element.className.includes('warningInDiv') || element.textContent?.match(/^\s*(Attention|Warning):?\s*$/i)) {
          return '';
        }
        // Check for menu navigation patterns (File > Save)
        const menuPattern = /^(.+?)\s*>\s*(.+)$/;
        const menuMatch = children.match(menuPattern);
        if (menuMatch) {
          return `menu:${menuMatch[1].trim()}[${menuMatch[2].trim()}]`;
        }
        return children;
      }
      case 'object': {
        // Handle MadCap HTML5 video objects and other embedded content
        const src = element.getAttribute('src');
        
        // Check for video file extensions to identify video content
        const isVideoFile = src && /\.(mp4|webm|ogg|avi|mov|wmv|flv|mkv)$/i.test(src);
        
        // Try to detect MadCap video attributes (with various namespace formats)
        const madcapHTML5Video = element.getAttribute('MadCap:HTML5Video') || 
                                 element.getAttribute('madcap:html5video') ||
                                 element.getAttribute('data-madcap-html5video');
        
        if ((madcapHTML5Video === 'true' || isVideoFile) && src) {
          // This is a video object - convert to AsciiDoc video block
          const controls = element.getAttribute('MadCap:Param_controls') === 'true' ||
                          element.getAttribute('madcap:param_controls') === 'true' ||
                          element.getAttribute('data-madcap-param-controls') === 'true';
          const autoplay = element.getAttribute('MadCap:Param_autoplay') === 'true' ||
                          element.getAttribute('madcap:param_autoplay') === 'true' ||
                          element.getAttribute('data-madcap-param-autoplay') === 'true';
          const loop = element.getAttribute('MadCap:Param_loop') === 'true' ||
                      element.getAttribute('madcap:param_loop') === 'true' ||
                      element.getAttribute('data-madcap-param-loop') === 'true';
          const muted = element.getAttribute('MadCap:Param_muted') === 'true' ||
                       element.getAttribute('madcap:param_muted') === 'true' ||
                       element.getAttribute('data-madcap-param-muted') === 'true';
          
          // Generate AsciiDoc video macro with options
          let videoOptions = [];
          if (controls) videoOptions.push('controls');
          if (autoplay) videoOptions.push('autoplay');
          if (loop) videoOptions.push('loop');
          if (muted) videoOptions.push('muted');
          
          const optionsStr = videoOptions.length > 0 ? `,${videoOptions.join(',')}` : '';
          
          return `\n\nvideo::${src}[width=640,height=480${optionsStr}]\n\n`;
        } else if (src) {
          // Generic object with src - treat as embedded content
          return `\n\n[NOTE]\n====\nEmbedded content: ${src}\n====\n\n`;
        } else {
          // Object without src - process children
          return children ? children + '\n\n' : '';
        }
      }
      case 'video': {
        // Handle standard HTML5 video elements
        const src = element.getAttribute('src');
        if (src) {
          const controls = element.hasAttribute('controls');
          const autoplay = element.hasAttribute('autoplay');
          const loop = element.hasAttribute('loop');
          const muted = element.hasAttribute('muted');
          
          let videoOptions = [];
          if (controls) videoOptions.push('controls');
          if (autoplay) videoOptions.push('autoplay');
          if (loop) videoOptions.push('loop');
          if (muted) videoOptions.push('muted');
          
          const optionsStr = videoOptions.length > 0 ? `,${videoOptions.join(',')}` : '';
          
          return `\n\nvideo::${src}[width=640,height=480${optionsStr}]\n\n`;
        }
        return children ? children + '\n\n' : '';
      }
      case 'body':
      case 'html': {
        // For body/html, return the processed children with clean spacing
        return children;
      }
      default: return children;
    }
  }

  private convertTableToAsciiDoc(table: Element): string {
    // Use simple table converter for all table processing
    return this.convertSimpleTable(table as HTMLTableElement);
  }

  /**
   * Convert HTML table to simple AsciiDoc table format
   */
  private convertSimpleTable(table: HTMLTableElement): string {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return '';
    
    let result = '';
    
    // Add caption if present
    const caption = table.querySelector('caption');
    if (caption) {
      result += `.${caption.textContent?.trim() || ''}\n`;
    }
    
    // Determine column count from first row
    const firstRow = rows[0];
    const colCount = firstRow ? firstRow.querySelectorAll('td, th').length : 0;
    
    if (colCount === 0) return '';
    
    // Generate simple equal-width column spec
    const colSpec = Array(colCount).fill('1').join(',');
    result += `[cols="${colSpec}"]\n`;
    result += '|===\n';
    
    // Convert each row
    rows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      cells.forEach(cell => {
        const isHeader = cell.tagName.toLowerCase() === 'th';
        const content = this.extractSimpleCellText(cell);
        result += `|${isHeader ? ' ' : ''}${content}\n`;
      });
    });
    
    result += '|===\n\n';
    return result;
  }

  /**
   * Extract simple text content from table cell
   */
  private extractSimpleCellText(cell: Element): string {
    // Simple text extraction without complex formatting
    let content = cell.textContent || '';
    
    // Clean up whitespace and normalize
    content = content.replace(/\s+/g, ' ').trim();
    
    // Escape pipe characters that would break table syntax
    content = content.replace(/\|/g, '\\|');
    
    return content;
  }

  private nodeToAsciiDocForTable(element: Element): string {
    // Special handling for table cells - flatten lists and fix formatting
    let text = '';
    
    const processNode = (node: Node): string => {
      if (node.nodeType === 3) {
        return (node.textContent || '').trim();
      }
      
      if (node.nodeType !== 1) return '';
      
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();
      
      const children = Array.from(el.childNodes)
        .map(child => processNode(child))
        .filter(text => text.trim().length > 0)
        .join(' ');
      
      switch (tagName) {
        case 'ul':
        case 'ol':
          // Convert lists to proper AsciiDoc format even in table cells
          const items = Array.from(el.querySelectorAll('li'));
          const listItems = items.map(item => processNode(item)).filter(t => t.trim());
          // Use proper AsciiDoc list syntax with line breaks for table cells
          const marker = tagName === 'ol' ? '.' : '*';
          return listItems.map(item => `${marker} ${item}`).join(' +\n');
        case 'li':
          return children;
        case 'strong':
        case 'b':
          return `*${children}*`;
        case 'em':
        case 'i':
          return `_${children}_`;
        case 'p':
          return children;
        case 'br':
          return ' ';
        default:
          return children;
      }
    };
    
    return processNode(element).trim();
  }

  private convertListToAsciiDoc(list: Element, marker: string, options?: ConversionOptions, depth: number = 0): string {
    const children = Array.from(list.children);
    const items = children.filter(child => child.tagName.toLowerCase() === 'li');
    
    if (items.length === 0) {
      return '';
    }
    
    // Check for orphaned paragraphs (paragraphs directly inside list, not in li)
    const orphanedElements = children.filter(child => 
      child.tagName.toLowerCase() === 'p'
    );
    
    // If there are orphaned paragraphs, use special handling
    if (orphanedElements.length > 0) {
      return this.convertMalformedListToAsciiDoc(list, marker, options, depth);
    }
    
    // Start list with a line break to ensure proper separation from previous content
    let result = '';
    
    items.forEach((item, index) => {
      // Get the proper marker for this depth level
      // AsciiDoc uses repeated markers for nesting: ., .., ...  or *, **, ***
      const listMarker = marker === '.' ? '.'.repeat(depth + 1) : '*'.repeat(depth + 1);
      
      // Process this list item completely - paragraphs and nested lists
      const itemResult = this.processListItem(item, depth, options);
      
      // Add the list marker and content
      if (itemResult.mainText) {
        result += `${listMarker} ${itemResult.mainText}\n`;
        
        // Add continuation content if any
        if (itemResult.continuationContent) {
          result += itemResult.continuationContent;
        }
        
        // Add nested lists if any
        if (itemResult.nestedLists) {
          result += itemResult.nestedLists;
        }
      }
    });
    
    return '\n' + result; // Add spacing before and after list
  }

  private processListItem(item: Element, depth: number, options?: ConversionOptions): {
    mainText: string;
    continuationContent: string;
    nestedLists: string;
  } {
    let mainText = '';
    let continuationContent = '';
    let nestedLists = '';
    
    // Separate direct children into paragraphs, lists, and other elements
    const paragraphs: Element[] = [];
    const lists: Element[] = [];
    const otherElements: Node[] = [];
    
    Array.from(item.childNodes).forEach(child => {
      if (child.nodeType === 1) { // Element node
        const element = child as Element;
        const tagName = element.tagName.toLowerCase();
        
        if (tagName === 'p') {
          paragraphs.push(element);
        } else if (tagName === 'ol' || tagName === 'ul') {
          lists.push(element);
        } else if (tagName === 'div' && (element.className.includes('note') || element.querySelector('.noteInDiv'))) {
          // Handle NOTE divs as special paragraphs
          paragraphs.push(element);
        } else {
          otherElements.push(child);
        }
      } else if (child.nodeType === 3) { // Text node
        otherElements.push(child);
      }
    });
    
    // Process paragraphs
    if (paragraphs.length > 0) {
      // First paragraph becomes the main text
      const firstParagraphContent = this.nodeToAsciiDoc(paragraphs[0], depth + 1, options).trim();
      if (firstParagraphContent) {
        mainText = firstParagraphContent;
      }
      
      // Additional paragraphs become continuation content
      for (let i = 1; i < paragraphs.length; i++) {
        const paragraphContent = this.nodeToAsciiDoc(paragraphs[i], depth + 1, options).trim();
        if (paragraphContent) {
          continuationContent += `+\n${paragraphContent}\n\n`;
        }
      }
    }
    
    // Process other elements (if no paragraphs exist)
    if (!mainText && otherElements.length > 0) {
      const otherContent = this.textProcessor.processChildNodes(
        otherElements,
        (child) => this.nodeToAsciiDoc(child, depth + 1, options)
      ).trim();
      
      if (otherContent) {
        mainText = otherContent;
      }
    }
    
    // Process nested lists (these should NOT use continuation markers)
    lists.forEach(list => {
      const tagName = list.tagName.toLowerCase();
      let listMarker = tagName === 'ol' ? '.' : '*';
      
      // Check for specific list-style-type to determine marker
      const listStyle = list.getAttribute('style') || '';
      const listStyleType = listStyle.match(/list-style-type:\s*([^;]+)/);
      
      if (listStyleType) {
        const styleType = listStyleType[1].trim();
        switch (styleType) {
          case 'lower-alpha':
          case 'lower-latin':
            // These will be converted to proper alphabetic in post-processing
            listMarker = '.';
            break;
          case 'upper-alpha':
          case 'upper-latin':
            listMarker = '.';
            break;
          case 'lower-roman':
          case 'upper-roman':
            listMarker = '.';
            break;
          case 'disc':
          case 'circle':
          case 'square':
            listMarker = '*';
            break;
          default:
            // Keep default marker
            break;
        }
      }
      
      const nestedListContent = this.convertListToAsciiDoc(list, listMarker, options, depth + 1);
      
      if (nestedListContent.trim()) {
        // Ensure proper spacing for nested lists
        nestedLists += '\n' + nestedListContent.replace(/^\n/, '');
      }
    });
    
    return {
      mainText,
      continuationContent: continuationContent.trim() ? continuationContent : '',
      nestedLists
    };
  }

  /**
   * Fix malformed HTML structure throughout the document
   * NOTE: This method is disabled to prevent conflicts with HTMLPreprocessor
   */
  private fixMalformedListStructure(element: Element): void {
    // DISABLED: Now handled by HTMLPreprocessor.preprocess()
    return;
  }
  
  /**
   * Recursively fix orphaned lists and paragraphs throughout the document
   */
  private fixOrphanedListsRecursively(element: Element): void {
    const children = Array.from(element.children);
    let i = 0;
    
    while (i < children.length) {
      const child = children[i];
      const tagName = child.tagName.toLowerCase();
      
      if (tagName === 'ol' || tagName === 'ul') {
        // Check if this list has orphaned elements as siblings
        this.fixListWithOrphanedSiblings(child as Element);
        
        // Recursively process the list
        this.fixOrphanedListsRecursively(child as Element);
      } else if (tagName === 'li') {
        // Process list items recursively
        this.fixOrphanedListsRecursively(child as Element);
      } else {
        // Process other elements recursively
        if (child.children.length > 0) {
          this.fixOrphanedListsRecursively(child as Element);
        }
      }
      
      i++;
    }
  }
  
  /**
   * Fix a specific list that has orphaned elements as siblings
   */
  private fixListWithOrphanedSiblings(list: Element): void {
    const parent = list.parentElement;
    if (!parent) return;
    
    const siblings = Array.from(parent.children);
    const listIndex = siblings.indexOf(list);
    let currentLi: Element | null = null;
    
    // Find the last list item in this list to attach orphaned elements to
    const listItems = Array.from(list.children).filter(child => child.tagName.toLowerCase() === 'li');
    if (listItems.length > 0) {
      currentLi = listItems[listItems.length - 1];
    }
    
    // Look at siblings that come after this list
    for (let i = listIndex + 1; i < siblings.length; i++) {
      const sibling = siblings[i];
      const siblingTag = sibling.tagName.toLowerCase();
      
      // Stop if we hit another list item (indicates end of this list's orphaned content)
      if (siblingTag === 'li') {
        break;
      }
      
      // If we find orphaned paragraphs or nested lists, move them into the current list item
      if ((siblingTag === 'p' || siblingTag === 'ol' || siblingTag === 'ul') && currentLi) {
        currentLi.appendChild(sibling);
        i--; // Adjust index since we moved an element
      } else if (siblingTag !== 'ol' && siblingTag !== 'ul') {
        // Stop at non-list, non-paragraph elements
        break;
      }
    }
    
    // Also fix orphaned elements within the list itself
    const listChildren = Array.from(list.children);
    currentLi = null;
    
    for (let i = 0; i < listChildren.length; i++) {
      const child = listChildren[i];
      const tagName = child.tagName.toLowerCase();
      
      if (tagName === 'li') {
        currentLi = child;
      } else if ((tagName === 'p' || tagName === 'ol' || tagName === 'ul') && currentLi) {
        currentLi.appendChild(child);
        i--; // Adjust index since we moved an element
      }
    }
  }

  /**
   * Convert definition list to AsciiDoc format
   */
  private convertDefinitionListToAsciiDoc(list: Element, options?: ConversionOptions, depth: number = 0): string {
    let result = '';
    const indent = '  '.repeat(depth);
    
    const children = Array.from(list.children);
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const tagName = child.tagName.toLowerCase();
      
      if (tagName === 'dt') {
        // Definition term
        const termText = this.extractTextWithFormatting(child);
        result += `${indent}${termText}::\n`;
      } else if (tagName === 'dd') {
        // Definition description - process children, not the dd element itself
        const childResults: string[] = [];
        for (const node of Array.from(child.childNodes)) {
          const result = this.nodeToAsciiDoc(node, depth + 1, options);
          if (result.trim()) {
            childResults.push(result);
          }
        }
        const descText = childResults.join('\n').trim();
        
        // Check if there's nested content
        const hasNestedLists = child.querySelector('ul, ol, dl');
        const hasMultipleParagraphs = child.querySelectorAll('p').length > 1;
        
        if (hasNestedLists || hasMultipleParagraphs) {
          // Use continuation marker for complex content
          // Split the content and indent each line properly
          const lines = descText.split('\n');
          const indentedLines = lines.map((line, idx) => {
            if (idx === 0) {
              return `${indent}  ${line}`;
            } else if (line.startsWith('*') || line.startsWith('.')) {
              // List items need to be indented
              return `${indent}${line}`;
            } else {
              return line;
            }
          });
          result += indentedLines.join('\n') + '\n';
        } else {
          // Simple single-line description
          result += `${indent}  ${descText}\n`;
        }
      }
    }
    
    return result + '\n';
  }

  /**
   * Handle malformed lists by first fixing HTML structure, then converting normally
   */
  private convertMalformedListToAsciiDoc(list: Element, marker: string, options?: ConversionOptions, depth: number = 0): string {
    // Handle malformed lists by restructuring them properly
    const restructuredList = this.restructureMalformedList(list);
    return this.convertListToAsciiDoc(restructuredList, marker, options, depth);
  }

  private restructureMalformedList(list: Element): Element {
    // Create a new properly structured list
    const document = list.ownerDocument;
    const newList = document.createElement(list.tagName);
    
    // Copy attributes
    Array.from(list.attributes).forEach(attr => {
      newList.setAttribute(attr.name, attr.value);
    });
    
    const children = Array.from(list.children);
    let currentLi: Element | null = null;
    
    for (const child of children) {
      const tagName = child.tagName.toLowerCase();
      
      if (tagName === 'li') {
        // This is a proper list item, add it to the new list
        currentLi = document.createElement('li');
        
        // Copy all content from the original li
        Array.from(child.childNodes).forEach(node => {
          currentLi!.appendChild(node.cloneNode(true));
        });
        
        newList.appendChild(currentLi);
      } else if (tagName === 'p' || tagName === 'div') {
        // This is orphaned content that should be inside the current list item
        if (currentLi) {
          // Add the orphaned content to the current list item
          currentLi.appendChild(child.cloneNode(true));
        } else {
          // If there's no current list item, create one for this orphaned content
          currentLi = document.createElement('li');
          currentLi.appendChild(child.cloneNode(true));
          newList.appendChild(currentLi);
        }
      }
    }
    
    return newList;
  }

  /**
   * Extract text from an element with inline formatting preserved
   */
  private extractTextWithFormatting(element: Element): string {
    let result = '';
    
    const processNode = (node: Node): string => {
      if (node.nodeType === 3) {
        return node.textContent || '';
      } else if (node.nodeType === 1) {
        const elem = node as Element;
        const tag = elem.tagName.toLowerCase();
        
        let childText = '';
        for (const child of Array.from(elem.childNodes)) {
          childText += processNode(child);
        }
        
        switch (tag) {
          case 'i':
          case 'em':
            return `_${childText}_`;
          case 'b':
          case 'strong':
            return `*${childText}*`;
          case 'code':
            return `\`${childText}\``;
          default:
            return childText;
        }
      }
      return '';
    };
    
    return processNode(element);
  }

  /**
   * Flatten element content to text with basic formatting and proper line breaks
   */
  private flattenElementContent(element: Element): string {
    let result = '';
    
    const processNode = (node: Node, depth: number = 0): string => {
      if (node.nodeType === 3) { // Text node
        return node.textContent || '';
      }
      
      if (node.nodeType !== 1) return ''; // Not an element
      
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();
      
      // Apply formatting based on tag
      switch (tagName) {
        case 'strong':
        case 'b': {
          let childrenText = '';
          for (const child of Array.from(el.childNodes)) {
            childrenText += processNode(child, depth);
          }
          return `*${childrenText}*`;
        }
        case 'em':
        case 'i': {
          let childrenText = '';
          for (const child of Array.from(el.childNodes)) {
            childrenText += processNode(child, depth);
          }
          return `_${childrenText}_`;
        }
        case 'code': {
          let childrenText = '';
          for (const child of Array.from(el.childNodes)) {
            childrenText += processNode(child, depth);
          }
          return `\`${childrenText}\``;
        }
        case 'br':
          return '\n';
        case 'p': {
          let childrenText = '';
          for (const child of Array.from(el.childNodes)) {
            childrenText += processNode(child, depth);
          }
          return childrenText.trim() ? childrenText.trim() + '\n\n' : '';
        }
        case 'div': {
          let childrenText = '';
          for (const child of Array.from(el.childNodes)) {
            childrenText += processNode(child, depth);
          }
          return childrenText.trim() ? childrenText.trim() + '\n' : '';
        }
        case 'span': {
          let childrenText = '';
          for (const child of Array.from(el.childNodes)) {
            childrenText += processNode(child, depth);
          }
          return childrenText;
        }
        case 'a': {
          let childrenText = '';
          for (const child of Array.from(el.childNodes)) {
            childrenText += processNode(child, depth);
          }
          // For links, preserve the text and add a simple link reference
          const href = el.getAttribute('href');
          if (href && !href.startsWith('#')) {
            return `${childrenText} (${href})`;
          }
          return childrenText;
        }
        case 'li': {
          let childrenText = '';
          for (const child of Array.from(el.childNodes)) {
            childrenText += processNode(child, depth);
          }
          // Use proper AsciiDoc list markers based on depth
          const marker = depth === 0 ? '*' : '*'.repeat(depth + 1);
          
          // Split long content into multiple lines for readability
          const content = childrenText.trim();
          if (content.length > 80) {
            // Try to break at sentence boundaries
            const sentences = content.split(/(?<=\.)\s+/);
            if (sentences.length > 1) {
              let result = `${marker} ${sentences[0]}\n`;
              for (let i = 1; i < sentences.length; i++) {
                result += `\n${sentences[i]}\n`;
              }
              return result;
            }
          }
          
          return `${marker} ${content}\n`;
        }
        case 'ul':
        case 'ol': {
          let listContent = '';
          const allChildren = Array.from(el.children);
          const listItems = allChildren.filter(child => child.tagName.toLowerCase() === 'li');
          
          if (listItems.length > 0) {
            listContent += '\n';
            
            // Process all children in order, handling both list items and orphaned elements
            for (const child of allChildren) {
              const childTag = child.tagName.toLowerCase();
              
              if (childTag === 'li') {
                listContent += processNode(child, depth + 1);
              } else if (childTag === 'p') {
                // Orphaned paragraph - treat as continuation or separate item
                let childText = '';
                for (const grandchild of Array.from(child.childNodes)) {
                  childText += processNode(grandchild, depth);
                }
                if (childText.trim()) {
                  const marker = depth === 0 ? '*' : '*'.repeat(depth + 2);
                  listContent += `${marker} ${childText.trim()}\n`;
                }
              } else {
                // Other orphaned elements
                listContent += processNode(child, depth + 1);
              }
            }
            listContent += '\n';
          } else {
            // If no proper list items, just process all children
            for (const child of Array.from(el.childNodes)) {
              listContent += processNode(child, depth);
            }
          }
          return listContent;
        }
        case 'img': {
          // For images, just add a text reference
          const alt = el.getAttribute('alt') || 'image';
          const src = el.getAttribute('src') || '';
          return `[${alt}]${src ? ` (${src})` : ''} `;
        }
        default: {
          let childrenText = '';
          for (const child of Array.from(el.childNodes)) {
            childrenText += processNode(child, depth);
          }
          return childrenText;
        }
      }
    };
    
    result = processNode(element);
    
    // Clean up formatting issues
    result = result
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Collapse multiple newlines
      .replace(/\s*\*\s*\*/g, '') // Remove empty bold markers
      .replace(/\s*_\s*_/g, '') // Remove empty italic markers
      .replace(/\s*`\s*`/g, '') // Remove empty code markers
      .replace(/(\* .+?)\n\n(\* )/g, '$1\n$2') // Fix spacing between list items
      .trim();
    
    return result;
  }

  private rewriteDocumentLinks(document: Document): void {
    const links = document.querySelectorAll('a[href]');
    const targetExtension = '.md';
    
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && this.isDocumentLink(href)) {
        const newHref = this.convertLinkExtension(href, targetExtension);
        link.setAttribute('href', newHref);
      }
    });
  }

  private isDocumentLink(href: string): boolean {
    // Check if it's a relative link to a document file
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) {
      return false;
    }
    
    // Check for supported document extensions (including converted .adoc files)
    const documentExtensions = ['.html', '.htm', '.adoc', '.md', '.docx', '.doc', '.xml'];
    return documentExtensions.some(ext => href.toLowerCase().includes(ext));
  }

  private convertLinkExtension(href: string, targetExtension: string): string {
    // Replace document extensions with target extension
    return href
      .replace(/\.html?(?=(\?|#|$))/i, targetExtension)
      .replace(/\.docx?(?=(\?|#|$))/i, targetExtension)
      .replace(/\.xml(?=(\?|#|$))/i, targetExtension);
  }

  private fixFormulaEscaping(text: string): string {
    // Fix over-escaped equals signs in mathematical formulas and expressions
    return text
      // Fix escaped equals in code blocks
      .replace(/`\\=/g, '`=')
      // Fix escaped equals at start of lines (common in formulas)
      .replace(/^\\=/gm, '=')
      // Fix escaped equals after spaces (like in examples)
      .replace(/\s\\=/g, ' =')
      // Fix escaped equals in general formula contexts
      .replace(/\\=(\d)/g, '=$1'); // =456.99+856.45+89.74 etc.
  }

  private fixCalloutFormatting(text: string): string {
    // Fix callout formatting issues for Writerside and other Markdown renderers
    return text
      // Remove extra blank lines after callout markers that break rendering
      .replace(/> \*\*(📝 NOTE|⚠️ WARNING|💡 TIP|❌ DANGER):\*\*\s*\n\n+([^\n>])/g, '> **$1:** $2')
      // Fix callouts that have content on the same line as marker
      .replace(/> \*\*(📝 NOTE|⚠️ WARNING|💡 TIP|❌ DANGER):\*\*\s+([^\n]+)/g, '> **$1:** $2')
      // Ensure proper spacing before callouts
      .replace(/([^\n])\n> \*\*(📝 NOTE|⚠️ WARNING|💡 TIP|❌ DANGER):\*\*/g, '$1\n\n> **$2:**')
      // Remove duplicate content in callouts
      .replace(/> \*\*(📝 NOTE|⚠️ WARNING):\*\* (.+?)\. \1/g, '> **$1:** $2')
      // Fix doubled Note patterns (> **Note:** > > **📝 NOTE:** Note)
      .replace(/> \*\*Note:\*\*\s*\n> > \*\*📝 NOTE:\*\* Note\s*\n/g, '> **📝 NOTE:** ')
      // Fix any remaining Note: Note duplications
      .replace(/> \*\*📝 NOTE:\*\* Note\s+/g, '> **📝 NOTE:** ')
      // Fix "Note: Note:" pattern specifically
      .replace(/> \*\*📝 NOTE:\*\* Note:\s*/g, '> **📝 NOTE:** ')
      // Remove empty note callouts (> **📝 NOTE:** > or > **📝 NOTE:** \n>)
      .replace(/> \*\*📝 NOTE:\*\*\s*>\s*\n/g, '')
      // Remove note callouts that only have empty content
      .replace(/> \*\*📝 NOTE:\*\*\s*\n>\s*\n/g, '');
  }

  private fixBrokenTableSyntax(text: string): string {
    // Fix the exact broken table pattern using string replacement
    const brokenPattern1 = '[cols="1,1"]\n|\n\n===';
    const fixedPattern1 = '[cols="1,1"]\n|===';
    
    let result = text.split(brokenPattern1).join(fixedPattern1);
    
    // Also fix any other column patterns
    const lines = result.split('\n');
    const newLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('[cols=') && lines[i].endsWith(']')) {
        const next1 = lines[i + 1];
        const next2 = lines[i + 2];
        const next3 = lines[i + 3];
        
        if (next1 === '|' && next2 === '' && next3 === '===') {
          newLines.push(lines[i]);
          newLines.push('|===');
          i += 3; // Skip the broken lines
        } else {
          newLines.push(lines[i]);
        }
      } else {
        newLines.push(lines[i]);
      }
    }
    
    return newLines.join('\n');
  }

  private removeSpacesBeforePunctuation(text: string): string {
    // Remove spaces before common punctuation marks for Markdown
    let result = text
      .replace(/(\S)\s+([,;!?.])/g, '$1$2');    // For Markdown, use original logic
    
    // For Markdown, simple colon handling
    result = result.replace(/\s+(:)/g, '$1');
    
    return result
      .replace(/\s+(\))/g, '$1')        // Remove spaces before closing parenthesis
      .replace(/(\()\s+/g, '$1')        // Remove spaces after opening parenthesis
      // Fix quote spacing - ensure proper spacing around quotes  
      .replace(/create"([^"]+)"and/g, 'create "$1" and')  // Fix concatenated quotes specifically
      .replace(/(\w)"([^"]+)"(\w)/g, '$1 "$2" $3')  // Fix missing spaces around quotes
      .replace(/create\s*"\s*([^"]+)\s*"\s*and/g, 'create "$1" and')  // Fix "project blueprints" specifically
      .replace(/(\w)"\s*([^"]+)\s*"/g, '$1 "$2"')  // General quote spacing fix
      .replace(/\s+(["'])/g, '$1')      // Remove spaces before quotes when they're closing
      .replace(/(["'])\s+(\w)/g, '$1$2')      // Remove spaces after opening quotes
      // Be more careful with periods - only remove space before period if it's not at end of line
      .replace(/(\w)\s+(\.)(\s)/g, '$1$2$3')  // Remove space before period when followed by space
      .replace(/(\w)\s+(\.)([\n\r])/g, '$1$2$3') // Remove space before period at end of line
      .replace(/(\w)\s+(\.)$/gm, '$1$2') // Remove space before period at end of line
      // Fix formatting issues with underscores and quotes
      .replace(/'_([^_]+)_/g, " '_$1_") // Fix missing space before quoted italics
      .replace(/activities'_([^_]+)_/g, 'activities\' _$1_'); // Fix apostrophe + italic formatting
  }




  private isMadCapCalloutClass(className: string): boolean {
    const calloutClasses = [
      'note', 'tip', 'warning', 'caution', 'important', 'danger', 'error',
      'info', 'example', 'quote', 'code', 'attention', 'advisory',
      'mc-note', 'mc-tip', 'mc-warning', 'mc-caution', 'mc-important', 
      'mc-danger', 'mc-error', 'mc-info', 'mc-example', 'mc-quote', 
      'mc-code', 'mc-attention', 'mc-advisory',
      'noteinpaper', 'warninginpaper', 'tipinpaper', 'cautioninpaper',
      'noteindiv', 'warningindiv', 'tipindiv', 'cautionindiv'
    ];
    
    return calloutClasses.some(cls => className.includes(cls));
  }

  private getMadCapCalloutInfo(className: string): { icon: string; label: string; labels: string[] } {
    // Map MadCap style classes to appropriate icons and labels
    if (className.includes('warning') || className.includes('caution') || className.includes('attention')) {
      return { icon: '⚠️', label: 'WARNING', labels: ['warning', 'caution', 'attention'] };
    }
    if (className.includes('danger') || className.includes('error')) {
      return { icon: '❌', label: 'DANGER', labels: ['danger', 'error'] };
    }
    if (className.includes('important') || className.includes('advisory')) {
      return { icon: '❗', label: 'IMPORTANT', labels: ['important', 'advisory'] };
    }
    if (className.includes('tip')) {
      return { icon: '💡', label: 'TIP', labels: ['tip'] };
    }
    if (className.includes('info')) {
      return { icon: 'ℹ️', label: 'INFO', labels: ['info'] };
    }
    if (className.includes('example')) {
      return { icon: '📋', label: 'EXAMPLE', labels: ['example'] };
    }
    if (className.includes('quote')) {
      return { icon: '💬', label: 'QUOTE', labels: ['quote'] };
    }
    if (className.includes('code')) {
      return { icon: '💻', label: 'CODE', labels: ['code'] };
    }
    // Default to note for any other callout type
    return { icon: '📝', label: 'NOTE', labels: ['note'] };
  }

  private extractCleanCalloutContent(content: string, labels: string[]): string {
    // Remove label text and clean up content
    let cleanContent = content;
    
    // First, remove HTML tags to get clean text
    cleanContent = cleanContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Remove all common label patterns (case insensitive)
    const allLabels = ['note', 'tip', 'warning', 'caution', 'attention', 'important', 'danger', 'error', 'info', 'information', 'example', 'quote', 'code', ...labels];
    
    allLabels.forEach(label => {
      const patterns = [
        // Remove "Label:" at start
        new RegExp(`^\\s*${label}:?\\s*`, 'gi'),
        // Remove "**Label:**" at start  
        new RegExp(`^\\s*\\*\\*${label}:?\\*\\*\\s*`, 'gi'),
        // Remove standalone label words
        new RegExp(`\\b${label}\\b(?=\\s|$)`, 'gi'),
        // Remove label at end
        new RegExp(`\\s*${label}\\s*$`, 'gi')
      ];
      patterns.forEach(pattern => {
        cleanContent = cleanContent.replace(pattern, ' ');
      });
    });
    
    // Remove common icon patterns
    cleanContent = cleanContent
      .replace(/^\s*(⚠️|❌|❗|💡|ℹ️|📋|💬|💻|📝)\s*/, '')
      .replace(/^\s*\*\*(WARNING|DANGER|IMPORTANT|TIP|INFO|EXAMPLE|QUOTE|CODE|NOTE):\*\*\s*/, '')
      .trim();
    
    // Clean up multiple spaces and return
    cleanContent = cleanContent.replace(/\s+/g, ' ').trim();
    
    // Additional cleanup for common duplicated patterns
    cleanContent = cleanContent
      .replace(/^(tip|warning|note|caution|important|danger|info|example)\s+/i, '')
      .replace(/\s+(tip|warning|note|caution|important|danger|info|example)$/i, '')
      .trim();
    
    return cleanContent;
  }

  private extractCleanCalloutContentFromNode(node: any, labels: string[]): string {
    // Extract text content directly from DOM node to avoid Turndown preprocessing
    let textContent = '';
    
    // Recursively extract text from all child nodes, skipping label spans
    const extractText = (element: any): string => {
      let text = '';
      for (const child of Array.from(element.childNodes) as any[]) {
        if ((child as any).nodeType === 3) { // Text node
          const nodeText = ((child as any).textContent || '').trim();
          if (nodeText) {
            text += nodeText + ' ';
          }
        } else if ((child as any).nodeType === 1) { // Element node
          const childElement = child as any;
          const className = (childElement.className || '').toString().toLowerCase();
          
          // Skip label spans like "tipInDiv", "warningInDiv", etc.
          if (className.includes('indiv') || className.includes('inpaper')) {
            const childText = (childElement.textContent || '').toLowerCase().trim();
            // Skip if this span contains only a label word (exact match)
            const isLabelOnly = labels.some(label => childText === label.toLowerCase()) ||
                               ['note', 'tip', 'warning', 'caution', 'attention', 'important', 'danger', 'error', 'info', 'information', 'example'].includes(childText);
            if (isLabelOnly) {
              continue; // Skip label-only spans
            }
          }
          
          // For other elements, continue extracting
          text += extractText(childElement);
        }
      }
      return text;
    };
    
    textContent = extractText(node).trim();
    
    // Only remove exact label patterns, not words within content
    // Remove "*Label:*" at start (bold labels with colon)
    textContent = textContent.replace(/^\s*\*\s*(note|tip|warning|caution|attention|important|danger|error|info|information|example)\s*:\*\s*/gi, '');
    
    // Remove "Label:" at start only (not within sentences)
    textContent = textContent.replace(/^\s*(note|tip|warning|caution|attention|important|danger|error|info|information|example)\s*:?\s*/gi, '');
    
    // Clean up extra spaces
    textContent = textContent.replace(/\s+/g, ' ').trim();
    
    return textContent;
  }

  private getCleanTextFromCalloutNode(node: any): string {
    // Get all text content
    let allText = node.textContent || '';
    
    // Remove label spans by content
    const labelSpans = node.querySelectorAll('.tipInDiv, .warningInDiv, .noteInDiv, .cautionInDiv, .importantInDiv, [class*="InDiv"], [class*="InPaper"]');
    labelSpans.forEach((span: any) => {
      const spanText = span.textContent || '';
      // Only remove if it's a standalone label
      if (/^(note|tip|warning|caution|attention|important|danger|error|info|information|example)$/i.test(spanText.trim())) {
        allText = allText.replace(spanText, '');
      }
    });
    
    // Remove "Note:" or similar prefixes from the content
    allText = allText.replace(/^\s*(Note|Tip|Warning|Important|Caution):\s*/i, '');
    
    // Clean up extra spaces and return
    return allText.replace(/\s+/g, ' ').trim();
  }

  private isInlineImage(element: Element, width?: string | null, height?: string | null): boolean {
    // Determine if an image should be rendered inline vs as a block
    
    // First check: IconInline class - this is the most reliable indicator
    const className = element.getAttribute('class') || element.className || '';
    if (className.includes('IconInline')) {
      return true;
    }
    
    // Check explicit size - very small images (typically icons) should be inline
    if (width && height) {
      const w = parseInt(width);
      const h = parseInt(height);
      if (w <= 32 && h <= 32) {
        return true; // Small icons
      }
    }
    
    // Check CSS style attributes for small dimensions
    const style = element.getAttribute('style') || '';
    const widthMatch = style.match(/width:\s*(\d+)px/);
    const heightMatch = style.match(/height:\s*(\d+)px/);
    if (widthMatch && heightMatch) {
      const w = parseInt(widthMatch[1]);
      const h = parseInt(heightMatch[1]);
      if (w <= 32 && h <= 32) {
        return true; // Small icons defined in style
      }
    }
    
    // Check file path patterns for common UI icons
    const src = element.getAttribute('src') || '';
    const isUIIcon = /\/(GUI|gui|Icon|icon|Button|button)/i.test(src) || 
                     /\.(ico|icon)/i.test(src) ||
                     src.includes('GUI-Elemente');
    
    if (isUIIcon) {
      return true;
    }
    
    // GENERAL FLARE CONVERSION RULE: Images in their own paragraphs should be block images
    // Check parent context - images inside paragraphs or text are usually inline UNLESS they're alone
    const parent = element.parentElement;
    if (parent) {
      const parentTag = parent.tagName.toLowerCase();
      
      // Special handling for paragraphs - apply MadCap Flare rule
      if (parentTag === 'p') {
        // Check if this is an image in its own paragraph (should be block image)
        const parentText = parent.textContent?.trim() || '';
        const imageText = element.getAttribute('alt')?.trim() || '';
        const textWithoutImage = parentText.replace(imageText, '').trim();
        
        // MadCap Flare rule: If paragraph contains only the image (possibly after a colon), 
        // it should be a block image with line breaks before and after
        if (textWithoutImage.length <= 5 || textWithoutImage.match(/^:?\s*$/)) {
          return false; // Force block image for images in their own paragraphs
        }
        
        // If there's substantial text content beyond the image, treat as inline
        if (textWithoutImage.length > 5) {
          return true;
        }
      }
      
      // Inline if inside other inline elements
      if (['span', 'em', 'strong', 'i', 'b', 'td', 'th', 'li'].includes(parentTag)) {
        // Check if there's any text content in the container (more lenient check)
        const parentText = parent.textContent?.trim() || '';
        const imageText = element.getAttribute('alt')?.trim() || '';
        // If there's any meaningful text beyond just the image alt text, treat as inline
        const textWithoutImage = parentText.replace(imageText, '').trim();
        if (textWithoutImage.length > 5) { // Has some text content beyond the image
          return true;
        }
      }
    }
    
    // Default to block image for standalone images
    return false;
  }

  private mapToAsciiDocAdmonition(label: string): string {
    // Map callout labels to AsciiDoc admonition types
    switch (label.toUpperCase()) {
      case 'WARNING':
      case 'CAUTION':
      case 'ATTENTION':
        return 'WARNING';
      case 'DANGER':
      case 'ERROR':
        return 'CAUTION';
      case 'IMPORTANT':
      case 'ADVISORY':
        return 'IMPORTANT';
      case 'TIP':
        return 'TIP';
      case 'INFO':
      case 'EXAMPLE':
        return 'NOTE';
      case 'QUOTE':
        return 'QUOTE';
      case 'CODE':
        return 'NOTE';
      default:
        return 'NOTE';
    }
  }

  /**
   * Convert MadCap dropdown to AsciiDoc collapsible block
   */
  private convertToCollapsibleBlock(element: Element, depth: number, options: ConversionOptions): string {
    // Find the title element - check for MadCap dropdown structure first
    let titleElement: Element | null = null;
    let title = 'Collapsible Section';
    
    // Check for MadCap dropdown structure (both original and preprocessed)
    const madcapHotspot = element.querySelector('MadCap\\:dropDownHotspot, madcap\\:dropdownhotspot');
    if (madcapHotspot) {
      // Original MadCap structure
      titleElement = madcapHotspot;
      title = madcapHotspot.textContent?.trim() || 'Collapsible Section';
    } else if (element.hasAttribute('data-madcap-dropdown')) {
      // Preprocessed MadCap structure - look for the h3 title element
      titleElement = element.querySelector('h3.dropdown-title, h3');
      title = titleElement?.textContent?.trim() || 'Collapsible Section';
    } else {
      // Fallback to regular heading elements
      titleElement = element.querySelector('h1, h2, h3, h4, h5, h6');
      title = titleElement?.textContent?.trim() || 'Collapsible Section';
    }
    
    // Remove the title element from processing to avoid duplication
    if (titleElement) {
      titleElement.remove();
    }
    
    // Remove dropdown attributes to prevent infinite recursion
    element.removeAttribute('data-madcap-dropdown');
    element.className = element.className.replace(/madcap-dropdown-section/g, '').trim();
    
    // For MadCap dropdowns, process only the body content
    let contentElement = element;
    const madcapBody = element.querySelector('MadCap\\:dropDownBody, madcap\\:dropdownbody');
    if (madcapBody) {
      contentElement = madcapBody;
    }
    
    // Process the remaining content
    const content = this.nodeToAsciiDoc(contentElement, depth + 1, options).trim();
    
    // Determine the delimiter level based on nesting depth
    // Use 4 equals signs (====) for outer blocks, 5 (=====) for nested, etc.
    const delimiterLevel = Math.min(4 + depth, 6); // Cap at 6 equals signs
    const delimiter = '='.repeat(delimiterLevel);
    
    // Format as AsciiDoc collapsible block
    return `\n.${title}\n[%collapsible]\n${delimiter}\n${content}\n${delimiter}\n\n`;
  }

  /**
   * Clean up orphaned continuation markers that appear without following content
   */
  private cleanupOrphanedContinuationMarkers(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const lineAfterNext = i + 2 < lines.length ? lines[i + 2] : '';
      
      // Check if this is an orphaned continuation marker
      if (line === '+' || line.trim() === '+') {
        // Look ahead to see if there's actual content after the continuation marker
        // Skip empty lines and check the next non-empty line
        let hasContent = false;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const futureeLine = lines[j];
          if (futureeLine.trim()) {
            // If the next content line is a list item (starts with ., a., etc.), 
            // this continuation marker should be removed as it's probably orphaned
            if (futureeLine.match(/^\s*\.[a-z]\.|^\s*\d+\.|^\s*\.\s/)) {
              hasContent = false; // This is a new list, not continuation content
              break;
            }
            // If it's actual paragraph content or other non-list content, keep the marker
            if (!futureeLine.match(/^[.=*-]/)) {
              hasContent = true;
              break;
            }
          }
        }
        
        if (!hasContent) {
          // Skip this orphaned continuation marker
          continue;
        }
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }

  /**
   * Fix roman numeral lists and multiple dot patterns by converting them to alphabetic lists
   * Convert patterns like "i.", "ii.", "iii." to "a.", "b.", "c."
   * Also convert "...", "...." patterns to "a.", "b.", "c."
   */
  private fixRomanNumeralLists(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let dotCounter = 0; // Track multiple dot patterns within a list
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Match multiple dot patterns: "...", "....", etc.
      const multiDotMatch = line.match(/^(\s*)(\.{2,})\s+(.+)$/);
      if (multiDotMatch) {
        const [, indent, dots, content] = multiDotMatch;
        
        // Reset counter if we're starting a new list (different indentation)
        if (i === 0 || !lines[i-1].match(/^(\s*)(\.{2,})\s+/)) {
          dotCounter = 0;
        }
        
        dotCounter++;
        
        // Convert to alphabetic list format
        const letter = String.fromCharCode(96 + dotCounter); // 96 + 1 = 97 which is 'a'
        line = `${indent}${letter}. ${content}`;
        
        result.push(line);
        continue;
      }
      
      // Match roman numeral list patterns: "i.", "ii.", "iii.", "iv.", "v.", etc.
      const romanMatch = line.match(/^(\s*)([ivx]+)\.\s+(.+)$/i);
      if (romanMatch) {
        const [, indent, roman, content] = romanMatch;
        
        // Convert roman numeral to number, then to letter
        const romanLower = roman.toLowerCase();
        let number = 0;
        
        // Simple roman numeral to number conversion for common cases
        switch (romanLower) {
          case 'i': number = 1; break;
          case 'ii': number = 2; break;
          case 'iii': number = 3; break;
          case 'iv': number = 4; break;
          case 'v': number = 5; break;
          case 'vi': number = 6; break;
          case 'vii': number = 7; break;
          case 'viii': number = 8; break;
          case 'ix': number = 9; break;
          case 'x': number = 10; break;
          default:
            // For more complex roman numerals, fall back to the original
            result.push(line);
            continue;
        }
        
        // Convert number to letter (1=a, 2=b, etc.)
        const letter = String.fromCharCode(96 + number); // 96 + 1 = 97 which is 'a'
        
        // Replace with alphabetic list format
        line = `${indent}${letter}. ${content}`;
      }
      
      // Reset dot counter if this is not a multiple dot line
      if (!multiDotMatch) {
        dotCounter = 0;
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }

  /**
   * Fix alphabetic list numbering to ensure proper sequence (a, b, c not a, a, a)
   * Tracks list contexts and resets counters appropriately
   */
  private fixAlphabeticListNumbering(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    const listContexts = new Map<number, number>(); // indentation level -> current counter
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Match alphabetic list patterns: "a.", "b.", etc.
      const alphaMatch = line.match(/^(\s*)([a-z])\.\s+(.+)$/);
      if (alphaMatch) {
        const [, indent, letter, content] = alphaMatch;
        const indentLevel = indent.length;
        
        // Check if this is the start of a new list context
        const prevLine = i > 0 ? lines[i - 1] : '';
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        
        // Reset counter if:
        // 1. This is the first line or different indentation level
        // 2. Previous line was not an alphabetic list item
        // 3. There was a gap in the sequence
        if (!listContexts.has(indentLevel) || 
            !prevLine.match(/^(\s*)([a-z])\.\s+/) ||
            prevLine.match(/^(\s*)/)?.[1]?.length !== indentLevel) {
          listContexts.set(indentLevel, 1);
        } else {
          // Increment counter for this indentation level
          const currentCount = listContexts.get(indentLevel) || 0;
          listContexts.set(indentLevel, currentCount + 1);
        }
        
        // Generate correct letter
        const correctCount = listContexts.get(indentLevel) || 1;
        const correctLetter = String.fromCharCode(96 + correctCount); // 97 = 'a'
        
        // Replace with correct numbering
        line = `${indent}${correctLetter}. ${content}`;
        
        result.push(line);
        continue;
      }
      
      // Clear list context if we encounter non-list content (except continuation markers)
      if (!line.trim().startsWith('+') && !line.match(/^\s*$/) && 
          !line.match(/^\s*NOTE:|^\s*TIP:|^\s*WARNING:|^\s*image::/)) {
        // Only clear if this looks like a major break in content
        if (!line.match(/^\s*\*+\s/) && !line.match(/^\s*\.+\s/)) {
          listContexts.clear();
        }
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }

  /**
   * Fix standalone continuation markers by adding proper spacing after headings
   * Remove standalone "+" lines that appear without proper context
   * Also fix malformed "Related tasks" patterns
   */
  private fixStandaloneContinuationMarkers(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : '';
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      
      // Fix malformed "Related tasks" pattern: "*Related tasks* *** xref:..."
      const relatedTasksMatch = line.match(/^(\*[^*]+\*)\s+(\*{3,})\s+(.+)$/);
      if (relatedTasksMatch) {
        const [, heading, stars, content] = relatedTasksMatch;
        // Split into proper heading and list item
        result.push(heading);
        result.push('');
        result.push(`* ${content}`);
        continue;
      }
      
      // Fix malformed dropdown headings that have content on same line
      const dropdownHeadingMatch = line.match(/^(\*[^*]+\*)\s+([A-Z].{20,})$/);
      if (dropdownHeadingMatch) {
        const [, heading, content] = dropdownHeadingMatch;
        // Split into proper heading and content
        result.push(heading);
        result.push('');
        result.push(content);
        continue;
      }
      
      // Check if this is a standalone continuation marker
      if (line.trim() === '+') {
        // Check if the previous line is a heading (starts with *)
        if (prevLine.match(/^\*[^*]+\*\s*$/)) {
          // This is after a heading - remove the standalone marker and add proper spacing
          continue; // Skip this line to remove the standalone +
        }
        
        // Check if this continuation marker is properly contextual
        // (has meaningful content following it within a few lines)
        let hasProperContext = false;
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const futureLine = lines[j];
          if (futureLine.trim() && !futureLine.match(/^[+=*-.\s]*$/)) {
            hasProperContext = true;
            break;
          }
        }
        
        if (!hasProperContext) {
          // Remove standalone continuation marker without proper context
          continue;
        }
      }
      
      // Check if this is a heading that should have proper spacing
      if (line.match(/^\*[^*]+\*\s*$/) && nextLine.trim() === '+') {
        // This is a heading followed by a standalone +, add proper spacing
        result.push(line);
        result.push(''); // Add blank line after heading
        continue; // The + will be handled in next iteration
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }

  /**
   * Check if an element is within a list item context
   */
  private isWithinListItem(element: Element): boolean {
    let current = element.parentElement;
    while (current) {
      const tagName = current.tagName.toLowerCase();
      
      // Check if we're in a list item
      if (tagName === 'li') {
        return true;
      }
      
      // Check if we're in a paragraph that's inside a list item
      if (tagName === 'p') {
        const grandParent = current.parentElement;
        if (grandParent && grandParent.tagName.toLowerCase() === 'li') {
          return true;
        }
      }
      
      // Stop searching if we hit a list boundary (but continue past it to check for nested contexts)
      if (tagName === 'ol' || tagName === 'ul') {
        // Don't return false here - continue checking in case we're in a nested structure
      }
      
      // Stop at body/html level
      if (tagName === 'body' || tagName === 'html') {
        break;
      }
      
      current = current.parentElement;
    }
    return false;
  }

  /**
   * Check if an image is in a standalone paragraph (likely needs continuation marker)
   */
  private isStandaloneImageParagraph(element: Element): boolean {
    const parent = element.parentElement;
    if (!parent || parent.tagName.toLowerCase() !== 'p') {
      return false;
    }
    
    // Check if the paragraph contains mostly just the image
    const textContent = parent.textContent?.trim() || '';
    const hasOtherContent = textContent.length > (element.getAttribute('alt') || '').length + 10;
    
    return !hasOtherContent;
  }

  /**
   * Get the variable extractor for transferring variables between converters
   */
  getVariableExtractor() {
    return this.variableExtractor;
  }

  /**
   * Convert number to roman numeral
   */
  private toRomanNumeral(num: number): string {
    const romanNumerals: [number, string][] = [
      [1000, 'M'],
      [900, 'CM'],
      [500, 'D'],
      [400, 'CD'],
      [100, 'C'],
      [90, 'XC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I']
    ];
    
    let result = '';
    for (const [value, numeral] of romanNumerals) {
      while (num >= value) {
        result += numeral;
        num -= value;
      }
    }
    return result;
  }

  private extractTitleFromContent(content: string): string {
    // Extract title from AsciiDoc format
    const titleMatch = content.match(/^= (.+)$/m);
    if (titleMatch) {
      return titleMatch[1];
    }
    
    // Extract title from Markdown format
    const mdTitleMatch = content.match(/^# (.+)$/m);
    if (mdTitleMatch) {
      return mdTitleMatch[1];
    }
    
    return 'Untitled Document';
  }

  private estimateWordCount(content: string): number {
    // Remove markup and count words
    const plainText = content
      .replace(/[=#+*_`\[\]()-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return plainText ? plainText.split(' ').length : 0;
  }

  /**
   * Extract variables from document for variable file generation
   */
  private extractVariablesFromDocument(document: Document): void {
    // Look for MadCap variable elements
    const variableElements = document.querySelectorAll(
      'madcap\\:variable, MadCap\\:variable, [data-mc-variable], .mc-variable, [class*="mc-variable"]'
    );
    
    variableElements.forEach(element => {
      const variableName = element.getAttribute('name') ||
                          element.getAttribute('data-mc-variable') ||
                          this.extractVariableNameFromClass(element.className);
      
      const variableValue = element.textContent?.trim() || '';
      
      if (variableName && variableValue) {
        try {
          const extractedVariable = VariableExtractor.createExtractedVariable(
            variableName,
            variableValue,
            'madcap'
          );
          this.variableExtractor.addVariable(extractedVariable);
        } catch (error) {
          console.warn(`Failed to extract variable ${variableName}:`, error);
        }
      }
    });
    
    // Also look for variable placeholders in content like {VariableName}
    const textNodes = this.getTextNodes(document.body || document.documentElement);
    textNodes.forEach(textNode => {
      const text = textNode.textContent || '';
      const variableMatches = text.matchAll(/\{([^}]+)\}/g);
      
      for (const match of variableMatches) {
        const variableName = match[1];
        if (variableName && !variableName.includes(' ')) {
          // Create placeholder variable for reference
          try {
            const extractedVariable = VariableExtractor.createExtractedVariable(
              variableName,
              `{${variableName}}`, // Keep as placeholder
              'fallback'
            );
            this.variableExtractor.addVariable(extractedVariable);
          } catch (error) {
            console.warn(`Failed to extract placeholder variable ${variableName}:`, error);
          }
        }
      }
    });
  }

  /**
   * Extract variable name from class attribute
   */
  private extractVariableNameFromClass(className: string): string | undefined {
    // Look for mc-variable.VariableName pattern
    const match = className.match(/mc-variable\.([^\s]+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Get all text nodes from an element
   */
  private getTextNodes(element: Element): Text[] {
    const textNodes: Text[] = [];
    const walker = element.ownerDocument.createTreeWalker(
      element,
      4 // NodeFilter.SHOW_TEXT
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeType === 3) { // TEXT_NODE
        textNodes.push(node as Text);
      }
    }
    
    return textNodes;
  }
}
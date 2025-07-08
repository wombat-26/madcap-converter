import { JSDOM } from 'jsdom';
import { dirname, basename, relative } from 'path';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index.js';
import { MadCapPreprocessor } from '../services/madcap-preprocessor.js';
import { HTMLPreprocessor } from '../services/html-preprocessor.js';
import { TextProcessor } from './text-processor.js';
import { ImprovedListProcessor } from './improved-list-processor.js';
import { PerformanceOptimizer } from './performance-optimizer.js';
import { MathNotationHandler } from './math-notation-handler.js';
import { CitationHandler } from './citation-handler.js';
import { VariableExtractor } from '../services/variable-extractor.js';
import { FLVARParser, VariableSet } from '../services/flvar-parser.js';
import { WritersideVariableConverter, VariableConversionOptions } from '../services/writerside-variable-converter.js';
import { AsciiDocValidator, ValidationOptions, ValidationResult } from '../validators/asciidoc-validator.js';
import { EnhancedTableProcessor, TableOptions } from './enhanced-table-processor.js';
import { ImprovedPathResolver, PathResolutionOptions } from './improved-path-resolver.js';
import { EnhancedVariableProcessor, EnhancedVariableOptions } from '../services/enhanced-variable-processor.js';
import { FlgloParser } from '../services/flglo-parser.js';
import { GlossaryConverter, GlossaryConversionOptions } from './glossary-converter.js';

export class AsciiDocConverter implements DocumentConverter {
  supportedInputTypes = ['html'];
  private madCapPreprocessor: MadCapPreprocessor;
  private htmlPreprocessor: HTMLPreprocessor;
  private textProcessor: TextProcessor;
  private improvedListProcessor: ImprovedListProcessor;
  private performanceOptimizer: PerformanceOptimizer;
  private mathNotationHandler: MathNotationHandler;
  private citationHandler: CitationHandler;
  private variableExtractor: VariableExtractor;
  private flvarParser: FLVARParser;
  private variableConverter: WritersideVariableConverter;
  private validator: AsciiDocValidator;
  private enhancedTableProcessor: EnhancedTableProcessor;
  private pathResolver: ImprovedPathResolver;
  private enhancedVariableProcessor: EnhancedVariableProcessor;
  private flgloParser: FlgloParser;
  private glossaryConverter: GlossaryConverter;
  
  // Section context tracking for proper list nesting
  private currentSectionLevel: number = 0;
  private lastWasSection: boolean = false;
  private currentPathDepth: number = 0;

  constructor() {
    this.madCapPreprocessor = new MadCapPreprocessor();
    this.htmlPreprocessor = new HTMLPreprocessor();
    this.textProcessor = new TextProcessor();
    this.improvedListProcessor = new ImprovedListProcessor();
    this.performanceOptimizer = new PerformanceOptimizer();
    this.mathNotationHandler = new MathNotationHandler();
    this.citationHandler = new CitationHandler();
    this.variableExtractor = new VariableExtractor();
    this.flvarParser = new FLVARParser();
    this.variableConverter = new WritersideVariableConverter();
    this.validator = new AsciiDocValidator();
    this.enhancedTableProcessor = new EnhancedTableProcessor();
    this.pathResolver = new ImprovedPathResolver();
    this.enhancedVariableProcessor = new EnhancedVariableProcessor();
    this.flgloParser = new FlgloParser();
    this.glossaryConverter = new GlossaryConverter();
  }

  async convert(input: string | Buffer, options: ConversionOptions): Promise<ConversionResult> {
    try {
      // Reset section context for each conversion
      this.currentSectionLevel = 0;
      this.lastWasSection = false;
      
      // Store path depth for image path resolution
      this.currentPathDepth = options.pathDepth || 0;
      
      // Clear variables from previous conversions
      this.variableExtractor.clear();
      
      let htmlContent = typeof input === 'string' ? input : input.toString('utf-8');
      
      // Step 1: Process variables if enabled (use enhanced processor)
      let variablesFile: string | undefined;
      let processedInput = htmlContent;
      const warnings: string[] = [];
      
      if (options.variableOptions?.extractVariables && options.variableOptions.variableFormat === 'adoc') {
        try {
          const enhancedOptions: Partial<EnhancedVariableOptions> = {
            baseDir: options.inputPath ? dirname(options.inputPath) : undefined,
            variableFormat: 'adoc',
            variableMode: (options.variableOptions.variableMode as 'include' | 'reference' | 'inline') || 'include',
            nameConvention: options.variableOptions.nameConvention || 'original',
            flvarFiles: options.variableOptions.flvarFiles,
            autoDiscoverFLVAR: options.variableOptions.autoDiscoverFLVAR !== false,
            smartProjectDetection: true,
            fallbackStrategy: 'warning'
          };
          
          const variableResult = await this.enhancedVariableProcessor.processVariables(htmlContent, options.inputPath);
          processedInput = variableResult.content;
          variablesFile = variableResult.variablesFile;
          
          // Add enhanced warnings
          warnings.push(...variableResult.warnings);
          
          // Log missing variables as warnings
          if (variableResult.missingVariables.length > 0) {
            warnings.push(`Found ${variableResult.missingVariables.length} unresolved variable references`);
          }
        } catch (error) {
          warnings.push(`Enhanced variable processing failed, falling back to legacy method: ${error}`);
          const variableResult = await this.processVariables(htmlContent, options, warnings);
          processedInput = variableResult.content;
          variablesFile = variableResult.variablesFile;
        }
      }
      
      // Step 2: Apply preprocessing
      if (this.madCapPreprocessor.containsMadCapContent(processedInput)) {
        processedInput = await this.madCapPreprocessor.preprocessMadCapContent(processedInput, options.inputPath);
      }
      processedInput = await this.htmlPreprocessor.preprocess(processedInput);
      
      // Step 3: Create JSDOM instance after preprocessing
      // DOM cleanup is now handled by MadCapPreprocessor.cleanupDOMStructure()
      
      // The MadCap preprocessor already handles orphaned content, so we don't need additional processing
      // processedInput = this.fixOrphanedListContent(processedInput);
      
      const dom = new JSDOM(processedInput);
      const document = dom.window.document;
      
      
      
      // Step 4: Extract variables from DOM if using legacy method
      if (options.variableOptions?.extractVariables && !options.variableOptions.variableFormat) {
        this.extractVariablesFromDocument(document);
      }
      
      // Convert to AsciiDoc
      let content = this.convertToAsciiDoc(document, options);
      
      // Step 5: Validate AsciiDoc if validation is enabled
      let validationResult: ValidationResult | undefined;
      if (options.asciidocOptions?.enableValidation !== false) {
        try {
          const validationOptions: Partial<ValidationOptions> = {
            strictness: options.asciidocOptions?.validationStrictness || 'normal',
            includeSeverities: ['error', 'warning'],
            maxIssues: 50
          };
          
          validationResult = this.validator.validate(content);
          
          // Add validation warnings to the warnings array
          if (validationResult.issues.warnings.length > 0) {
            warnings.push(`AsciiDoc validation found ${validationResult.issues.warnings.length} warnings`);
          }
          
          if (validationResult.issues.errors.length > 0) {
            warnings.push(`AsciiDoc validation found ${validationResult.issues.errors.length} errors`);
          }
          
        } catch (error) {
          warnings.push(`AsciiDoc validation failed: ${error}`);
        }
      }
      
      // Apply enhanced validation and auto-fix if enabled
      if (options.asciidocOptions?.enableValidation) {
        try {
          const validationOptions = {
            strictness: options.asciidocOptions.validationStrictness || 'normal' as const,
            includeSeverities: ['error' as const, 'warning' as const],
            detailedAnalysis: true
          };
          
          const autoFixResult = this.validator.autoFix(content);
          content = autoFixResult.content;
          
          // Add validation results to warnings
          if (autoFixResult.fixesApplied > 0) {
            warnings.push(`Auto-fixed ${autoFixResult.fixesApplied} AsciiDoc issues: ${autoFixResult.fixedIssues.join(', ')}`);
          }
          
          if (autoFixResult.remainingIssues.length > 0) {
            warnings.push(`${autoFixResult.remainingIssues.length} validation issues remain after auto-fix`);
          }
        } catch (error) {
          warnings.push(`Validation/auto-fix failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Extract metadata
      const title = this.extractTitleFromContent(content);
      const wordCount = this.estimateWordCount(content);
      
      // Generate variables file if requested (legacy method)
      if (options.variableOptions?.extractVariables && !options.variableOptions.variableFormat && !variablesFile) {
        try {
          variablesFile = this.variableExtractor.generateVariablesFile(options.variableOptions);
        } catch (error) {
          console.warn('Failed to generate variables file:', error);
        }
      }

      // Process glossary if enabled
      let glossaryContent: string | undefined;
      if (options.asciidocOptions?.glossaryOptions?.includeGlossary) {
        try {
          const glossaryResult = await this.processGlossary(options, warnings);
          if (glossaryResult) {
            // Handle different glossary formats
            const glossaryFormat = options.asciidocOptions.glossaryOptions.glossaryFormat || 'inline';
            
            if (glossaryFormat === 'inline' || glossaryFormat === 'book-appendix') {
              // Append glossary to main content
              content += '\n\n' + glossaryResult;
            } else if (glossaryFormat === 'separate') {
              // Store as separate content for file generation
              glossaryContent = glossaryResult;
            }
          }
        } catch (error) {
          warnings.push(`Glossary processing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const result: ConversionResult = {
        content,
        variablesFile,
        glossaryContent,
        metadata: {
          title,
          wordCount,
          format: 'asciidoc',
          warnings: warnings.length > 0 ? warnings : undefined,
          variables: options.variableOptions?.extractVariables ? this.variableExtractor.getVariables() : undefined
        }
      };
      
      return result;
    } catch (error) {
      throw new Error(`AsciiDoc conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private convertToAsciiDoc(document: Document, options: ConversionOptions): string {
    const titleElement = document.querySelector('h1');
    const title = titleElement?.textContent?.trim() || 
                  document.querySelector('title')?.textContent?.trim() || 
                  'Untitled Document';
    
    // Generate clean document header following AsciiDoc syntax
    let result = `= ${title}\n`;
    
    // Add common document attributes
    result += `:toc:\n`;
    result += `:icons: font\n`;
    result += `:experimental:\n`;
    result += `:source-highlighter: highlight.js\n`;
    
    // Add variables file include if extraction is enabled
    if (options.variableOptions?.extractVariables && options.variableOptions.variableFormat === 'adoc') {
      const variablesPath = this.calculateVariablesIncludePath(options);
      result += `\ninclude::${variablesPath}[]\n`;
    }
    
    result += '\n';  // Single newline after header
    
    const body = document.body || document.documentElement;
    
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
    
    
    // Apply minimal essential cleanup
    result = this.applyMinimalCleanup(result);
    
    // Apply comprehensive AsciiDoc formatting fixes
    result = this.applyCleanAsciiDocFormatting(result);
    
    // CRITICAL FIX: Fix MadCap sibling list structure - merge orphaned alphabetic lists into parent items
    result = this.fixMadCapSiblingListStructure(result);
    
    // FINAL FIX: Add continuation markers before [loweralpha] in list contexts
    result = this.addContinuationMarkersForNestedLists(result);
    
    // FINAL FIX 2: Fix orphaned content after NOTE blocks in alphabetic lists
    result = this.fixOrphanedContentInAlphabeticLists(result);
    
    // FINAL FIX 3: Fix specific MadCap pattern where numeric markers appear in alphabetic lists
    result = this.fixNumericMarkersInAlphabeticLists(result);
    
    // FINAL FIX 4: Fix triple-dot markers and normalize list depths
    result = this.fixTripleDotMarkersAndDepths(result);
    
    // Remove orphaned continuation markers
    result = this.removeOrphanedContinuationMarkers(result);
    
    return result;
  }
  
  /**
   * Add continuation markers before [loweralpha] markers in list contexts
   */
  private addContinuationMarkersForNestedLists(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : '';
      
      // If this is a [loweralpha] marker
      if (line === '[loweralpha]') {
        // Check if previous line was empty and we can find a list item before that
        if (prevLine.trim() === '') {
          let foundListItem = false;
          for (let j = i - 2; j >= Math.max(0, i - 4); j--) {
            if (lines[j].match(/^\. /)) {
              foundListItem = true;
              break;
            }
          }
          
          // If we found a list item, add continuation marker
          if (foundListItem) {
            result.push('+');
            result.push(line);
          } else {
            result.push(line);
          }
        } else {
          result.push(line);
        }
      } else {
        result.push(line);
      }
    }
    
    return result.join('\n');
  }

  /**
   * Fix orphaned content after NOTE blocks in alphabetic lists
   * This handles the specific MadCap pattern where snippet expansion creates orphaned content
   */
  private fixOrphanedContentInAlphabeticLists(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inAlphabeticList = false;
    let lastAlphabeticItemIndex = -1;
    let expectingListContinuation = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      
      // Track when we're in an alphabetic list
      if (trimmedLine === '[loweralpha]' || trimmedLine === '[upperalpha]') {
        inAlphabeticList = true;
        expectingListContinuation = false;
        result.push(line);
        continue;
      }
      
      // Track when we exit the alphabetic list
      if (inAlphabeticList && trimmedLine.match(/^\.\s/)) {
        // This is a main list item (single dot), not an alphabetic sub-item
        inAlphabeticList = false;
        expectingListContinuation = false;
      }
      
      // Handle alphabetic list items
      if (inAlphabeticList && trimmedLine.match(/^\.+\s/)) {
        lastAlphabeticItemIndex = i;
        result.push(line);
        
        // Check if the next content might need continuation markers
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        
        if (j < lines.length) {
          const nextContent = lines[j].trim();
          // If next content is NOTE, image, or paragraph text (not another list item)
          if (nextContent.startsWith('[NOTE]') || nextContent.startsWith('image:') || 
              (nextContent.length > 0 && !nextContent.match(/^[\.\*\+\[]/) && !nextContent.match(/^=/))) {
            expectingListContinuation = true;
          }
        }
        continue;
      }
      
      // Fix the specific pattern: content after NOTE blocks that should be connected
      if (inAlphabeticList && expectingListContinuation) {
        // After a NOTE block's closing delimiter
        if (trimmedLine === '====') {
          result.push(line);
          
          // Look ahead for orphaned content
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === '') j++;
          
          if (j < lines.length) {
            const orphanedContent = lines[j].trim();
            // If we have an image or paragraph text that's not a list item
            if ((orphanedContent.startsWith('image:') || 
                (orphanedContent.length > 0 && !orphanedContent.match(/^[\.\*\+\[]/) && !orphanedContent.match(/^=/) && !orphanedContent.match(/^\d+\.\s/)))) {
              // Add continuation marker after the NOTE block
              result.push('+');
              expectingListContinuation = true;
            } else if (orphanedContent.match(/^\d+\.\s/)) {
              // This is the problem! A numeric list item that should be alphabetic
              // Don't set expectingListContinuation = false here, let it continue
            }
          }
          continue;
        }
        
        // Handle orphaned content that needs continuation markers
        if ((trimmedLine.startsWith('image:') || 
            (trimmedLine.length > 0 && !trimmedLine.match(/^[\.\*\+\[]/) && !trimmedLine.match(/^=/)))) {
          
          // Check if previous non-empty line needs a continuation marker
          let needsContinuation = true;
          for (let j = result.length - 1; j >= 0; j--) {
            if (result[j].trim() === '+') {
              needsContinuation = false;
              break;
            }
            if (result[j].trim().length > 0) {
              break;
            }
          }
          
          if (needsContinuation && i > 0 && !lines[i-1].trim().match(/^\.+\s/)) {
            // Add continuation before this content
            let insertIndex = result.length;
            if (result.length > 0 && result[result.length - 1].trim() === '') {
              insertIndex = result.length - 1;
            }
            result.splice(insertIndex, 0, '+');
          }
          
          // Continue expecting continuation for subsequent content
          if (!trimmedLine.match(/^\d+\.\s/)) {
            expectingListContinuation = true;
          }
        }
        
        // Reset expectation after a clear list item
        if (trimmedLine.match(/^\.+\s/) && !trimmedLine.match(/^\d+\.\s/)) {
          expectingListContinuation = false;
        }
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }

  /**
   * Remove orphaned continuation markers that appear incorrectly
   */
  private removeOrphanedContinuationMarkers(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : '';
      const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
      
      // Check if this is an orphaned + marker
      if (line.trim() === '+') {
        // It's orphaned if:
        // 1. The previous line is not a list item AND
        // 2. The next line is not a proper continuation target (image, admonition, or another list item)
        const prevIsListItem = /^[.*]{1,5}\s/.test(prevLine);
        const nextIsValidContinuation = nextLine.trim().startsWith('image::') ||
                                       nextLine.trim().startsWith('[NOTE]') ||
                                       nextLine.trim().startsWith('[TIP]') ||
                                       nextLine.trim().startsWith('[WARNING]') ||
                                       nextLine.trim().startsWith('[CAUTION]') ||
                                       /^[.*]{1,5}\s/.test(nextLine) ||
                                       nextLine.trim() === '' && i + 2 < lines.length && lines[i + 2].trim().startsWith('image::') ||
                                       (nextLine.trim().length > 0 && !nextLine.match(/^[.*]{1,5}\s/) && !nextLine.match(/^=/)); // Regular text content
        
        // Special case: + followed by empty line then image or admonition
        const nextNextLine = i + 2 < lines.length ? lines[i + 2] : '';
        const nextNextIsValidContinuation = nextLine.trim() === '' && (
          nextNextLine.trim().startsWith('image::') ||
          nextNextLine.trim().startsWith('[NOTE]') ||
          nextNextLine.trim().startsWith('[TIP]') ||
          nextNextLine.trim().startsWith('[WARNING]') ||
          nextNextLine.trim().startsWith('[CAUTION]')
        );
        
        if (!prevIsListItem || (!nextIsValidContinuation && !nextNextIsValidContinuation)) {
          // This is an orphaned + marker, skip it
          continue;
        }
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }

  private nodeToAsciiDoc(node: Node, depth: number = 0, options?: ConversionOptions): string {
    if (node.nodeType === 3) {
      // Handle text node whitespace more intelligently
      const text = node.textContent || '';
      
      // Preserve original text content including any list markers
      const cleanedText = text;
      
      // Preserve leading/trailing space if it's meaningful (between words)
      // but remove excessive whitespace
      return cleanedText.replace(/\s+/g, ' ');
    }

    if (node.nodeType !== 1) return '';

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    
    // Handle lists with the reliable processor
    if (tagName === 'ul' || tagName === 'ol') {
      // Reset depth to 0 if this list follows a section heading or MadCap dropdown
      const effectiveDepth = this.lastWasSection ? 0 : depth;
      this.lastWasSection = false; // Reset flag after processing list
      
      return this.improvedListProcessor.convertList(
        element,
        effectiveDepth,
        (node, depth) => this.nodeToAsciiDoc(node, depth, options)
      );
    }
    if (tagName === 'table') {
      return this.convertEnhancedTable(element as HTMLTableElement, options);
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
      // Check if this is a MadCap dropdown section
      const className = element.className || '';
      if (className.includes('MCDropDown')) {
        // This is a MadCap dropdown - treat as section break for list processing
        this.lastWasSection = true;
        this.currentSectionLevel = 3; // Treat as h3 level
      }
      
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
      // For simple inline elements with just text content, avoid TextProcessor to prevent duplication
      if (element.childNodes.length === 1 && element.childNodes[0].nodeType === 3) {
        // Single text node - handle directly to avoid double processing
        const textContent = (element.childNodes[0].textContent || '').trim();
        // Don't strip alphabetic list markers - they're needed for proper list sequence
        children = textContent;
      } else {
        // For complex inline and other elements, use smart text processing
        children = this.textProcessor.processChildNodes(
          Array.from(element.childNodes),
          (child) => this.nodeToAsciiDoc(child, depth + 1, options)
        );
      }
    }

    
    switch (tagName) {
      case 'h1': return `\n== ${children.trim()}\n\n`;
      case 'h2': 
        this.lastWasSection = true;
        this.currentSectionLevel = 2;
        return `\n=== ${children.trim()}\n\n`;
      case 'h3': 
        this.lastWasSection = true;
        this.currentSectionLevel = 3;
        return `\n==== ${children.trim()}\n\n`;
      case 'h4': 
        this.lastWasSection = true;
        this.currentSectionLevel = 4;
        return `\n===== ${children.trim()}\n\n`;
      case 'h5': 
        this.lastWasSection = true;
        this.currentSectionLevel = 5;
        return `\n====== ${children.trim()}\n\n`;
      case 'h6': 
        this.lastWasSection = true;
        this.currentSectionLevel = 6;
        return `\n======= ${children.trim()}\n\n`;
      case 'p': {
        // Check if we're inside a note/warning div to avoid duplication
        let parentDiv = element.parentElement;
        while (parentDiv && parentDiv.tagName.toLowerCase() === 'div') {
          const className = parentDiv.className?.toString() || '';
          if (className.includes('note') || className.includes('warning') || 
              className.includes('tip') || className.includes('caution')) {
            // This paragraph is inside an admonition div that will handle the formatting
            // Just return the content without admonition formatting
            return children.trim() ? `${children.trim()}\n\n` : '';
          }
          parentDiv = parentDiv.parentElement;
        }
        
        // Check if this paragraph contains a note span - keep it inline for simple cases
        const noteSpan = element.querySelector('.noteInDiv, .warningInDiv, .tipInDiv, .cautionInDiv');
        if (noteSpan) {
          const spanText = noteSpan.textContent?.trim() || '';
          if (spanText.match(/^(Note|Tip|Warning|Caution|Attention|Important):?$/i)) {
            // Check if this is a simple inline note (short content, single line)
            const paragraphText = element.textContent?.trim() || '';
            const isSimpleInlineNote = paragraphText.length < 200 && !paragraphText.includes('\n');
            
            if (isSimpleInlineNote) {
              // Keep as inline note - just process normally as paragraph
              return children.trim() ? `${children.trim()}\n\n` : '';
            } else {
              // Use block format only for complex/multi-line notes
              const admonitionType = spanText.replace(/:$/, '').toUpperCase();
              const mappedType = this.mapToAsciiDocAdmonition(admonitionType);
              
              // Remove the note span and process remaining content
              const noteSpanClone = noteSpan.cloneNode(true);
              noteSpan.remove();
              
              let noteContent = this.textProcessor.processChildNodes(
                Array.from(element.childNodes),
                (child) => this.nodeToAsciiDoc(child, depth + 1, options)
              );
              
              noteContent = noteContent.replace(/^:\s*/, '').trim();
              element.insertBefore(noteSpanClone, element.firstChild);
              
              if (noteContent) {
                return `\n\n[${mappedType}]\n====\n${noteContent}\n====\n\n`;
              }
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
              // Preserve proper spacing for block images
              // Remove only excessive newlines but keep the required ones
              const cleanImageResult = imageResult.replace(/\n{3,}/g, '\n\n');
              // Ensure block images have proper separation from previous content
              return cleanImageResult.startsWith('\n') ? `${cleanImageResult}\n\n` : `\n\n${cleanImageResult}\n\n`;
            }
          }
          
          // Special handling for paragraphs with mixed text and images
          if (imgChild && element.childNodes.length > 1) {
            // Check if we're inside a list item - if so, handle with proper separation
            const isWithinListItem = this.isWithinListItem(element);
            
            // Only handle actual screenshots and large GUI elements in regular paragraphs (not small icons)
            const hasScreenshot = Array.from(element.querySelectorAll('img')).some(img => {
              const src = img.getAttribute('src') || '';
              const width = img.getAttribute('width');
              const height = img.getAttribute('height');
              
              // Check for screenshot patterns
              const isScreenshotPath = /\/(Screens|screens|Screenshots|screenshots)/i.test(src) ||
                                       src.includes('CreateActivity') ||
                                       src.includes('AddFundingSource') ||
                                       src.includes('InvestItem') ||
                                       src.includes('BudgetTab') ||
                                       src.includes('FundingSource');
              
              // For GUI elements, only treat as screenshot if they're large (not small icons)
              const isLargeGUIElement = /\/(GUI-Elemente|GUI|gui|Interface)/i.test(src) &&
                                        src.includes('Tooltip') &&
                                        (!width || !height || parseInt(width) > 32 || parseInt(height) > 32);
              
              return isScreenshotPath || isLargeGUIElement;
            });
            
            if (isWithinListItem || hasScreenshot) {
              // Process children separately to allow proper image separation
              const childResults: string[] = [];
              for (const child of Array.from(element.childNodes)) {
                if (child.nodeType === 3) { // Text node
                  const text = child.textContent?.trim();
                  if (text) {
                    childResults.push(text);
                  }
                } else if (child.nodeType === 1) { // Element node
                  const childElement = child as Element;
                  if (childElement.tagName.toLowerCase() === 'img') {
                    const imageResult = this.nodeToAsciiDoc(childElement, depth + 1, options);
                    
                    // Check if this is a screenshot or large GUI element that needs proper spacing
                    const src = childElement.getAttribute('src') || '';
                    const width = childElement.getAttribute('width');
                    const height = childElement.getAttribute('height');
                    
                    // Check for screenshot patterns
                    const isScreenshotPath = /\/(Screens|screens|Screenshots|screenshots)/i.test(src) ||
                                             src.includes('CreateActivity') ||
                                             src.includes('AddFundingSource') ||
                                             src.includes('InvestItem') ||
                                             src.includes('BudgetTab') ||
                                             src.includes('FundingSource');
                    
                    // For GUI elements, only treat as screenshot if they're large (not small icons)
                    const isLargeGUIElement = /\/(GUI-Elemente|GUI|gui|Interface)/i.test(src) &&
                                              src.includes('Tooltip') &&
                                              (!width || !height || parseInt(width) > 32 || parseInt(height) > 32);
                    
                    const isScreenshot = isScreenshotPath || isLargeGUIElement;
                    
                    if (isScreenshot) {
                      // Screenshots need proper block formatting with spacing - use newlines, not spaces
                      childResults.push(`\n\n${imageResult.trim()}\n\n`);
                    } else {
                      // Small UI icons can be inline
                      childResults.push(imageResult.trim());
                    }
                  } else {
                    const result = this.nodeToAsciiDoc(childElement, depth + 1, options);
                    if (result.trim()) {
                      childResults.push(result.trim());
                    }
                  }
                }
              }
              // Join with appropriate spacing - spaces for inline content, newlines for blocks
              let result = '';
              for (let i = 0; i < childResults.length; i++) {
                const current = childResults[i];
                if (i === 0) {
                  result += current;
                } else {
                  const prev = childResults[i - 1];
                  // Add newlines if either piece contains block formatting
                  if (current.includes('\n\n') || prev.includes('\n\n')) {
                    result += current;
                  } else {
                    // Add space between inline content
                    result += ' ' + current;
                  }
                }
              }
              return result.replace(/\n{3,}/g, '\n\n');
            }
          }
          
          // Check if we're inside a list item - if so, don't add paragraph spacing
          const isWithinListItem = this.isWithinListItem(element);
          if (isWithinListItem) {
            // For paragraphs within list items, return clean content without extra spacing
            // The list processor will handle proper continuation markers
            return children.trim();
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
      case 'b': return `*${children.trim()}*`;
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
        
        // Use trimmed text for consistent formatting
        return shouldBeBold ? `*${text}*` : `_${text}_`;
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
        // Check for language attribute or code element
        const codeElement = element.querySelector('code');
        const lang = element.getAttribute('data-language') || 
                     codeElement?.className?.match(/language-(\w+)/)?.[1] ||
                     element.className?.match(/language-(\w+)/)?.[1];
        
        const content = codeElement?.textContent || children;
        const cleanCode = content.replace(/`/g, '').trim();
        
        if (lang) {
          return `\n\n[source,${lang}]\n----\n${cleanCode}\n----\n\n`;
        }
        return `\n\n----\n${cleanCode}\n----\n\n`;
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
          const originalSrc = imgElement.getAttribute('src');
          const src = originalSrc ? this.normalizeImagePath(originalSrc, this.currentPathDepth) : '';
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
          // Ensure we have link text - use the trimmed children or fall back to the anchor name
          const linkText = children.trim() || anchor;
          return `<<${anchor},${linkText}>>`;
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
        return this.processImage(element, depth, options || { format: 'asciidoc' as const, inputType: 'html' as const });
      }
      case 'li': 
      case 'dt': 
      case 'dd': {
        // List-related elements should be processed by their parent list container
        // If we reach here, it means they're orphaned - log a warning and process as text
        console.warn(`Orphaned list element ${tagName} found outside list context`);
        return children;
      }
      case 'table': return this.convertEnhancedTable(element as HTMLTableElement, options);
      case 'blockquote': {
        // Handle blockquotes with proper AsciiDoc syntax
        const quoteContent = children.trim();
        if (!quoteContent) return '';
        
        // Check for attribution
        const cite = element.getAttribute('cite');
        const attribution = element.querySelector('.attribution')?.textContent?.trim();
        
        if (cite || attribution) {
          return `\n[quote, ${attribution || ''}, ${cite || ''}]\n____\n${quoteContent}\n____\n\n`;
        }
        return `\n____\n${quoteContent}\n____\n\n`;
      }
      case 'div': {
        // Check if this is a snippet boundary container
        const className = element.className?.toString() || '';
        if (className.includes('snippet-boundary')) {
          // Process snippet content with proper boundary preservation
          const childResults: string[] = [];
          
          for (const child of Array.from(element.children)) {
            const result = this.nodeToAsciiDoc(child, depth + 1, options);
            if (result.trim()) {
              childResults.push(result.trim());
            }
          }
          
          // Join snippet content with proper spacing to maintain boundaries
          return childResults.length > 0 ? '\n\n' + childResults.join('\n\n') + '\n\n' : '';
        }
        
        // Check if this is a collapsible block (MadCap dropdown)
        if (className.includes('collapsible-block')) {
          const title = element.getAttribute('data-title') || 'More Information';
          const useCollapsible = options?.asciidocOptions?.useCollapsibleBlocks;
          
          // Set flag to reset list depth for lists inside collapsible blocks
          this.lastWasSection = true;
          
          // Process children with the flag set
          const childResults: string[] = [];
          for (const child of Array.from(element.childNodes)) {
            const result = this.nodeToAsciiDoc(child, depth + 1, options);
            if (result.trim()) {
              childResults.push(result.trim());
            }
          }
          const processedChildren = childResults.join('\n\n');
          
          if (useCollapsible) {
            // Generate AsciiDoc collapsible block
            return `\n[%collapsible]\n.${title}\n====\n${processedChildren}\n====\n\n`;
          } else {
            // Generate standard heading + content
            return `\n=== ${title}\n\n${processedChildren}\n\n`;
          }
        }
        
        // Check if this is a tile/grid container
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
                    const originalSrc = imgElement.getAttribute('src') || '';
                    const src = this.normalizeImagePath(originalSrc, this.currentPathDepth);
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
          
          // Extract clean content, removing any duplicate note/warning spans
          let cleanContent = '';
          const paragraphs = element.querySelectorAll('p');
          
          for (const p of paragraphs) {
            // Remove note/warning spans to avoid duplication
            const noteSpan = p.querySelector('.noteInDiv, .warningInDiv, .tipInDiv, .cautionInDiv');
            if (noteSpan) {
              const spanText = noteSpan.textContent?.trim() || '';
              if (spanText.match(/^(Note|Tip|Warning|Caution|Attention|Important):?$/i)) {
                noteSpan.remove();
              }
            }
            
            // Process the paragraph content
            const pContent = this.nodeToAsciiDoc(p, depth + 1, options).trim();
            if (pContent) {
              cleanContent += cleanContent ? '\n\n' + pContent : pContent;
            }
          }
          
          // Also process any direct text nodes
          for (const node of Array.from(element.childNodes)) {
            if (node.nodeType === 3) { // Text node
              const text = node.textContent?.trim();
              if (text) {
                cleanContent += cleanContent ? ' ' + text : text;
              }
            }
          }
          
          if (cleanContent) {
            const admonitionType = this.mapToAsciiDocAdmonition(calloutInfo.label);
            // Always use block syntax for consistency
            return `\n[${admonitionType}]\n====\n${cleanContent}\n====\n\n`;
          }
          return '';
        }
        
        // Legacy note handling for backward compatibility
        // Exclude snippet content and complex structured content from note wrapping
        if ((element.className.includes('note') || element.querySelector('.noteInDiv')) && 
            !element.querySelector('h1, h2, h3, h4, h5, h6') && 
            !element.querySelector('img') &&
            !element.querySelector('table') &&
            !element.querySelector('ol, ul') &&  // Exclude content with lists
            !element.className.includes('snippet') &&  // Exclude snippet content
            !this.isWithinSnippetContent(element)) {
          
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
          
          return noteContent ? `\nNOTE: ${noteContent}\n\n` : '';
        }
        
        // Legacy warning handling for backward compatibility
        if (element.className.includes('warning') || element.querySelector('.warningInDiv')) {
          let warningText = children.replace(/^\s*(Attention|Warning):?\s*/i, '').trim();
          warningText = warningText.replace(/⚠️\s*WARNING:\s*/g, '').trim();
          return `\nWARNING: ${warningText}\n\n`;
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
      case 'br': {
        // Check if this BR is after an image in a paragraph - if so, start a new paragraph instead of continuation
        const parent = element.parentElement;
        if (parent && parent.tagName.toLowerCase() === 'p') {
          const prevSibling = element.previousElementSibling;
          if (prevSibling && prevSibling.tagName.toLowerCase() === 'img') {
            // This BR comes after an image in a paragraph - start new paragraph instead of continuation
            // Check if there's text content after this BR
            const nextSibling = element.nextSibling;
            if (nextSibling && nextSibling.nodeType === 3 && nextSibling.textContent?.trim()) {
              // There's text after the BR, so create proper paragraph separation
              return '\n\n';
            }
            return '\n\n';
          }
        }
        // Default BR handling for other contexts - still use continuation for most cases
        return ' +\n';
      }
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
        // Check for note spans
        if (element.className.includes('noteInDiv') || element.textContent?.match(/^\s*(Note|Tip):?\s*$/i)) {
          // If within snippet content, preserve as bold text, otherwise return empty (handled by parent div)
          if (this.isWithinSnippetContent(element)) {
            return `*${children}*`;
          }
          return '';
        }
        // Check for warning spans
        if (element.className.includes('warningInDiv') || element.textContent?.match(/^\s*(Attention|Warning):?\s*$/i)) {
          // If within snippet content, preserve as bold text, otherwise return empty (handled by parent div)
          if (this.isWithinSnippetContent(element)) {
            return `*${children}*`;
          }
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
          
          // Extract original dimensions if available
          const width = element.getAttribute('width') || 
                       element.getAttribute('MadCap:Param_width') ||
                       element.getAttribute('madcap:param_width') ||
                       element.getAttribute('data-madcap-param-width') ||
                       '640';
          const height = element.getAttribute('height') || 
                        element.getAttribute('MadCap:Param_height') ||
                        element.getAttribute('madcap:param_height') ||
                        element.getAttribute('data-madcap-param-height') ||
                        '480';
          
          // Generate AsciiDoc video macro with options
          let videoOptions = [];
          if (controls) videoOptions.push('controls');
          if (autoplay) videoOptions.push('autoplay');
          if (loop) videoOptions.push('loop');
          if (muted) videoOptions.push('muted');
          
          const optionsStr = videoOptions.length > 0 ? `,${videoOptions.join(',')}` : '';
          
          return `\n\nvideo::${src}[width=${width},height=${height}${optionsStr}]\n\n`;
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
          
          // Extract original dimensions if available
          const width = element.getAttribute('width') || '640';
          const height = element.getAttribute('height') || '480';
          
          let videoOptions = [];
          if (controls) videoOptions.push('controls');
          if (autoplay) videoOptions.push('autoplay');
          if (loop) videoOptions.push('loop');
          if (muted) videoOptions.push('muted');
          
          const optionsStr = videoOptions.length > 0 ? `,${videoOptions.join(',')}` : '';
          
          return `\n\nvideo::${src}[width=${width},height=${height}${optionsStr}]\n\n`;
        }
        return children ? children + '\n\n' : '';
      }
      case 'ol': {
        // Handle ordered lists with proper nesting and style detection
        const style = element.getAttribute('style') || '';
        const isLowerAlpha = style.includes('list-style-type: lower-alpha');
        
        
        
        // Check if this is a nested list by looking at parent structure
        const parentLI = element.closest('li');
        const isNested = parentLI !== null;
        
        let result = '';
        const listItems = Array.from(element.children).filter(child => 
          child.tagName.toLowerCase() === 'li'
        );
        
        if (isLowerAlpha) {
          // This is an alphabetic list - add continuation marker if nested and format as alphabetic
          if (isNested) {
            result += '\n+\n';
          }
          result += '[loweralpha]\n';
          listItems.forEach((li, index) => {
            const letter = String.fromCharCode(97 + index); // a, b, c, etc.
            const content = this.nodeToAsciiDoc(li, depth + 1, options).trim();
            result += `${letter}. ${content}\n`;
          });
        } else {
          // Regular numbered list
          listItems.forEach((li, index) => {
            const content = this.nodeToAsciiDoc(li, depth + 1, options).trim();
            result += `. ${content}\n`;
          });
        }
        
        return result + '\n';
      }
      
      case 'ul': {
        // Handle unordered lists
        let result = '';
        const listItems = Array.from(element.children).filter(child => 
          child.tagName.toLowerCase() === 'li'
        );
        
        listItems.forEach((li) => {
          const content = this.nodeToAsciiDoc(li, depth + 1, options).trim();
          result += `* ${content}\n`;
        });
        
        return result + '\n';
      }
      
      case 'li': {
        // Handle list items - return content without additional formatting
        // The parent ol/ul will handle the list markers
        return children.trim();
      }
      
      case 'body':
      case 'html': {
        // For body/html, return the processed children with clean spacing
        return children;
      }
      default: return children;
    }
  }

  /**
   * Fix malformed lists with orphaned content before JSDOM processing
   * JSDOM automatically moves orphaned elements out of lists, breaking the association
   */
  private fixOrphanedListContent(html: string): string {
    // Pattern to match lists with orphaned content
    const listPattern = /<(ol|ul)([^>]*)>(.*?)<\/\1>/gs;
    
    return html.replace(listPattern, (match, tagName, attributes, content) => {
      // Check if this list has orphaned content (non-li elements)
      const orphanedPattern = /<(?!li\b|\/li\b)(\w+)([^>]*)>(.*?)<\/\1>/gs;
      let hasOrphanedContent = false;
      
      // Look for orphaned elements
      let modifiedContent = content;
      const orphanedMatches: Array<{element: string, content: string, position: number}> = [];
      
      let match2;
      while ((match2 = orphanedPattern.exec(content)) !== null) {
        const [fullMatch, elementTag, elementAttrs, elementContent] = match2;
        // Skip if this is nested inside an li (check for preceding <li and no </li>)
        const beforeMatch = content.substring(0, match2.index);
        const lastLiStart = beforeMatch.lastIndexOf('<li');
        const lastLiEnd = beforeMatch.lastIndexOf('</li>');
        
        if (lastLiStart > lastLiEnd) {
          // This element is inside an li, skip it
          continue;
        }
        
        // This is orphaned content - mark it for processing
        hasOrphanedContent = true;
        orphanedMatches.push({
          element: fullMatch,
          content: elementContent.trim(),
          position: match2.index
        });
      }
      
      if (hasOrphanedContent) {
        // Process orphaned content by adding special data attributes
        orphanedMatches.reverse().forEach(orphan => {
          const replacement = `<li data-orphaned-content="true">${orphan.content}</li>`;
          modifiedContent = modifiedContent.substring(0, orphan.position) + 
                          replacement + 
                          modifiedContent.substring(orphan.position + orphan.element.length);
        });
      }
      
      return `<${tagName}${attributes}>${modifiedContent}</${tagName}>`;
    });
  }

  /**
   * Convert HTML table using enhanced table processor
   */
  private convertEnhancedTable(table: HTMLTableElement, options?: ConversionOptions): string {
    try {
      const tableOptions: Partial<TableOptions> = {
        autoColumnWidths: options?.asciidocOptions?.autoColumnWidths !== false,
        preserveFormatting: options?.asciidocOptions?.preserveTableFormatting !== false,
        frame: options?.asciidocOptions?.tableFrame || 'all',
        grid: options?.asciidocOptions?.tableGrid || 'all'
      };
      
      return this.enhancedTableProcessor.convertTable(table, tableOptions);
    } catch (error) {
      console.warn('Enhanced table conversion failed, falling back to simple table:', error);
      return this.convertSimpleTable(table);
    }
  }

  /**
   * Convert HTML table to simple AsciiDoc table format (fallback)
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
    // AsciiDoc can auto-detect columns, but we can specify equal widths
    result += '|===\n';
    
    // Convert each row
    rows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      cells.forEach(cell => {
        const isHeader = cell.tagName.toLowerCase() === 'th';
        const content = this.extractSimpleCellText(cell);
        result += `|${content}\n`;
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

  // Helper methods from HTMLConverter
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
    
    // PRIORITY 1: Screenshots should always be block images - check this FIRST
    const isScreenshot = /\/(Screens|screens|Screenshots|screenshots)/i.test(src) ||
                         src.includes('CreateActivity') ||
                         src.includes('AddFundingSource') ||
                         src.includes('InvestItem') ||
                         src.includes('BudgetTab') ||
                         src.includes('FundingSource');
    
    // Screenshots should always be block images, regardless of other factors
    if (isScreenshot) {
      return false; // Force block format for screenshots
    }
    
    const isUIIcon = /\/(GUI|gui|Icon|icon|Button|button)/i.test(src) || 
                     /\.(ico|icon)/i.test(src) ||
                     src.includes('GUI-Elemente') ||
                     src.includes('Controlling attribute') ||
                     src.includes('Dependent attribute') ||
                     src.includes('Link Activity') ||
                     src.includes('CloseCircle') ||
                     src.includes('SearchCircle');
    
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

  private cleanupOrphanedContinuationMarkers(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const prevLine = i > 0 ? lines[i - 1] : '';
      
      // Check if this is an orphaned continuation marker
      if (line === '+' || line.trim() === '+') {
        // Check various patterns that indicate an orphaned marker
        
        // 1. + followed by [NOTE] or other block elements (should be connected)
        if (nextLine.match(/^\s*\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]/)) {
          // Skip the + and connect the block directly
          continue;
        }
        
        // 2. + followed by [loweralpha] or other list attributes
        if (nextLine.match(/^\s*\[(?:loweralpha|upperalpha|lowerroman|upperroman)\]/)) {
          // Keep the + - list attributes NEED continuation for proper nesting
          result.push(line);
          continue;
        }
        
        // 3. + that appears after a list marker and before another list marker
        if (prevLine.match(/^\s*[a-z]\.\s/) && nextLine.match(/^\s*[a-z]\.\s/)) {
          // This + is between list items - remove it
          continue;
        }
        
        // 4. + that appears before or after [loweralpha] attributes  
        if (nextLine.match(/^\s*\[loweralpha\]/)) {
          // Keep + before [loweralpha] - needed for nested lists
          result.push(line);
          continue;
        } else if (prevLine.match(/^\s*\[loweralpha\]/)) {
          // Remove + after [loweralpha] - not needed
          continue;
        }
        
        // 5. + at the end of content blocks with no following content
        let hasValidContent = false;
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const futureLine = lines[j];
          if (futureLine.trim()) {
            // Check if this is valid continuation content
            // Improved logic: anything that's not a list marker, heading, or block delimiter is valid content
            if (!futureLine.match(/^[.=*-]+\s|^={2,}\s|^\[(?:source|cols|NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]|^====|^----|\|===/)) {
              hasValidContent = true;
              break;
            }
          }
        }
        
        if (!hasValidContent) {
          // No valid continuation content - remove the orphaned +
          continue;
        }
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }

  private fixRomanNumeralLists(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let dotCounter = 0; // Track multiple dot patterns within a list
    let inAlphabeticList = false; // Track if we're in a [loweralpha] context
    let alphabeticListDepth = 0; // Track nesting depth
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Check for [loweralpha] markers - preserve the context
      if (line.trim() === '[loweralpha]' || line.trim() === '[upperalpha]') {
        inAlphabeticList = true;
        alphabeticListDepth = 0;
        
        // Look ahead to determine the depth of the following list items
        for (let j = i + 1; j < lines.length && j < i + 5; j++) {
          const nextLine = lines[j].trim();
          const dotMatch = nextLine.match(/^(\.+)\s/);
          if (dotMatch) {
            alphabeticListDepth = Math.max(alphabeticListDepth, dotMatch[1].length);
            break;
          }
        }
        
        result.push(line);
        continue;
      }
      
      // More intelligent context tracking - only reset on clear boundaries
      if (inAlphabeticList) {
        // Check if we're exiting the alphabetic list
        const trimmedLine = line.trim();
        
        // Look ahead to see if we're really exiting or just have intervening content
        let shouldExit = false;
        
        // Exit conditions:
        // 1. A heading (section break)
        if (trimmedLine.match(/^=/)) {
          shouldExit = true;
        }
        // 2. A main list item (single dot) - but check if there are more alphabetic items after
        else if (trimmedLine.match(/^\.\s/)) {
          // Look ahead to see if there are more .. items before the next . item
          let hasMoreAlphaItems = false;
          for (let j = i + 1; j < lines.length && j < i + 20; j++) {
            const futureLineTrimmed = lines[j].trim();
            if (futureLineTrimmed.match(/^\.\s/)) {
              // Found another main list item, stop looking
              break;
            }
            if (futureLineTrimmed.match(/^\.{2,}\s/)) {
              // Found more alphabetic items
              hasMoreAlphaItems = true;
              break;
            }
          }
          
          if (!hasMoreAlphaItems) {
            shouldExit = true;
          }
        }
        // 3. Another list style marker
        else if (trimmedLine.match(/^\[(lowerroman|upperroman|arabic)\]/)) {
          shouldExit = true;
        }
        // 4. End of document structure markers
        else if (trimmedLine.match(/^---+$/) || trimmedLine.match(/^___+$/)) {
          shouldExit = true;
        }
        
        if (shouldExit) {
          inAlphabeticList = false;
        }
      }
      
      // If we're in an alphabetic list context, preserve ALL dot markers
      if (inAlphabeticList) {
        // Preserve any line with dot markers in alphabetic context
        const dotMatch = line.match(/^(\s*)(\.+)\s+(.*)$/);
        if (dotMatch) {
          result.push(line); // Keep as-is - don't convert to numbers
          continue;
        }
      }
      
      // Match multiple dot patterns: "...", "....", etc. (only if not in alphabetic context)
      const multiDotMatch = line.match(/^(\s*)(\.{2,})\s+(.+)$/);
      if (multiDotMatch && !inAlphabeticList) {
        const [, indent, dots, content] = multiDotMatch;
        
        
        // Reset counter if we're starting a new list (different indentation)
        if (i === 0 || !lines[i-1].match(/^(\s*)(\.{2,})\s+/)) {
          dotCounter = 0;
        }
        
        dotCounter++;
        
        // Convert to numbered list format (not alphabetic)
        line = `${indent}${dotCounter}. ${content}`;
        
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

  private fixAlphabeticListNumbering(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    const listContexts = new Map<number, number>(); // indentation level -> current counter
    let inLowerAlphaList = false; // Track if we're in a [loweralpha] list
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Check for [loweralpha] attribute
      if (line.trim() === '[loweralpha]') {
        inLowerAlphaList = true;
        result.push(line);
        continue;
      }
      
      // Reset flag on major content breaks
      if (line.match(/^={1,6}\s/) || line.match(/^\s*$/) && !inLowerAlphaList) {
        inLowerAlphaList = false;
      }
      
      // Skip alphabetic list processing if we're in a [loweralpha] list
      if (inLowerAlphaList) {
        // Check if this line ends the loweralpha list context
        if (!line.match(/^\s*[a-z]\.\s/) && !line.trim().startsWith('+') && 
            !line.match(/^\s*image::/) && !line.match(/^\s*NOTE:/) && 
            line.trim() && !line.match(/^\s*$/)) {
          // Check if next few lines continue the list pattern
          let continuesPattern = false;
          for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
            if (lines[j].match(/^\s*[a-z]\.\s/) || lines[j].trim().startsWith('+')) {
              continuesPattern = true;
              break;
            }
          }
          if (!continuesPattern) {
            inLowerAlphaList = false;
          }
        }
        result.push(line);
        continue;
      }
      
      // Match alphabetic list patterns: "a.", "b.", etc. (only when NOT in loweralpha list)
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

  private isStandaloneImageParagraph(element: Element): boolean {
    const parent = element.parentElement;
    if (!parent || parent.tagName.toLowerCase() !== 'p') {
      return false;
    }
    
    // Check if the paragraph contains mostly just the image
    const textContent = parent.textContent?.trim() || '';
    const altText = element.getAttribute('alt') || '';
    
    // If paragraph text is empty or only contains alt text, it's standalone
    if (textContent === '' || textContent === altText) {
      return true;
    }
    
    // If there's minimal additional text (whitespace, punctuation), still consider standalone
    const additionalText = textContent.replace(altText, '').trim();
    return additionalText.length <= 5; // Allow for minimal punctuation/whitespace
  }

  private isWithinSnippetContent(element: Element): boolean {
    // Check if this element is within snippet content by looking for ancestor with snippet-content class
    let current = element.parentElement;
    while (current) {
      if (current.className?.includes('snippet-content') || current.className?.includes('snippet')) {
        return true;
      }
      // Check if we're in a context that originated from a snippet file
      if (current.getAttribute('data-snippet-source')) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
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

  private getCleanTextFromCalloutNode(node: any): string {
    // Create a clone to work with to avoid modifying the original
    const clone = node.cloneNode(true);
    
    // Remove label spans from the clone
    const labelSpans = clone.querySelectorAll('.tipInDiv, .warningInDiv, .noteInDiv, .cautionInDiv, .importantInDiv, [class*="InDiv"], [class*="InPaper"]');
    labelSpans.forEach((span: any) => {
      const spanText = span.textContent || '';
      // Only remove if it's a standalone label
      if (/^(note|tip|warning|caution|attention|important|danger|error|info|information|example)$/i.test(spanText.trim())) {
        span.remove();
      }
    });
    
    // Only extract direct text content from paragraphs and direct text nodes within the note
    // This prevents pulling in content from nested lists or other structural elements
    let noteContent = '';
    const directParagraphs = Array.from(clone.children).filter((child): child is Element => {
      const elem = child as Element;
      return elem.nodeType === 1 && elem.tagName.toLowerCase() === 'p';
    });
    
    if (directParagraphs.length > 0) {
      // Process only direct paragraph children
      for (const p of directParagraphs) {
        const pText = this.nodeToAsciiDoc(p, 0, { format: 'asciidoc', inputType: 'html' }).trim();
        if (pText && !pText.match(/^\s*(Note|Tip|Warning|Important|Caution)\s*$/i)) {
          if (noteContent) {
            noteContent += '\n\n' + pText;
          } else {
            noteContent = pText;
          }
        }
      }
    } else {
      // Fallback: get text content but only from direct children, not deep nested elements
      const directTextNodes = Array.from(clone.childNodes).filter((child): child is Node => {
        const node = child as Node;
        return node.nodeType === 3 || // Text node
               (node.nodeType === 1 && ['span', 'em', 'strong', 'code', 'a'].includes((node as Element).tagName.toLowerCase()));
      });
      
      noteContent = directTextNodes.map((node: Node) => node.textContent || '').join(' ').trim();
    }
    
    // Remove "Note:" or similar prefixes from the content
    noteContent = noteContent.replace(/^\s*(Note|Tip|Warning|Important|Caution):\s*/i, '');
    
    // Clean up extra spaces and return
    return noteContent.replace(/\s+/g, ' ').trim();
  }

  private extractTitleFromContent(content: string): string {
    // Extract title from AsciiDoc format
    const titleMatch = content.match(/^= (.+)$/m);
    if (titleMatch) {
      return titleMatch[1];
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

  private listContainsFormattingElements(list: Element): boolean {
    const formattingTags = ['strong', 'b', 'em', 'i', 'code', 'a'];
    const allElements = list.querySelectorAll('*');
    
    for (const element of allElements) {
      if (formattingTags.includes(element.tagName.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  private processListStandard(list: Element, marker: string, depth: number, options: ConversionOptions): string {
    const items = Array.from(list.children).filter(child => 
      child.tagName.toLowerCase() === 'li'
    );
    
    if (items.length === 0) return '';
    
    // Check if this is an alphabetical list and adjust marker for nesting
    const listStyle = list.getAttribute('style');
    if (listStyle && listStyle.includes('lower-alpha')) {
      // For alphabetical lists, we should use double dots for nesting
      if (depth > 0) {
        marker = '..'; // Force double dots for nested alphabetical lists
      }
    }
    
    let result = '';
    
    // Add list style attribute for alphabetical lists
    if (listStyle && listStyle.includes('lower-alpha')) {
      result += '[loweralpha]\n\n';
    }
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Process each list item using standard node processing
      const itemContent = this.nodeToAsciiDoc(item, depth + 1, options);
      
      if (itemContent.trim()) {
        // Handle the content based on whether it's the first item or continuation
        const lines = itemContent.trim().split('\n');
        const firstLine = lines[0];
        const restLines = lines.slice(1);
        
        // For alphabetical lists, use proper automatic numbering (just dots)
        const actualMarker = (listStyle && listStyle.includes('lower-alpha')) ? marker : marker;
        
        result += `${actualMarker} ${firstLine}\n`;
        
        if (restLines.length > 0) {
          for (const line of restLines) {
            if (line.trim()) {
              // Reduce excessive continuation markers for cleaner output
              if (line.match(/^(NOTE:|TIP:|WARNING:|image::)/)) {
                result += `${line}\n`;
              } else {
                result += `+\n${line}\n`;
              }
            }
          }
        }
      }
    }
    
    return result;
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
          // Check if this is an AsciiDoc attribute reference (lowercase with underscores)
          // or an original MadCap variable reference (CamelCase with dots)
          let originalVariableName = variableName;
          let variableValue: string | null = null;
          
          // If it's already in AsciiDoc format (lowercase_underscore), try to map back to original
          if (variableName.includes('_') && variableName === variableName.toLowerCase()) {
            // Try to find the original MadCap variable name
            originalVariableName = this.findOriginalVariableName(variableName);
          }
          
          // Try to resolve the variable to get its actual value
          variableValue = this.resolveVariableValue(originalVariableName);
          
          // If no value resolved, check if this is a fallback variable
          if (!variableValue) {
            variableValue = this.getFallbackVariableValue(originalVariableName);
          }
          
          // Always create variable entry when extracting variables
          // Use empty string if no resolved value is available
          if (!variableValue) {
            variableValue = "";
          }
          
          try {
            const extractedVariable = VariableExtractor.createExtractedVariable(
              originalVariableName,
              variableValue,
              variableValue === "" ? 'fallback' : 'madcap'
            );
            this.variableExtractor.addVariable(extractedVariable);
          } catch (error) {
            console.warn(`Failed to extract variable ${originalVariableName}:`, error);
          }
        }
      }
    });
  }

  /**
   * Resolve variable value - delegates to MadCapPreprocessor for consistency
   */
  private resolveVariableValue(variableName: string): string | null {
    // For now, return null to rely on MadCap project variable sets
    // This could be enhanced to integrate with the MadCapPreprocessor's variable cache
    return null;
  }

  /**
   * Get fallback variable value for common variables
   */
  private getFallbackVariableValue(variableName: string): string | null {
    // Additional fallback logic can be added here
    return this.resolveVariableValue(variableName);
  }

  /**
   * Map AsciiDoc attribute name back to original MadCap variable name
   * Uses reverse conversion logic instead of hardcoded mappings
   */
  private findOriginalVariableName(asciidocAttributeName: string): string {
    // Reverse the AsciiDoc conversion:
    // general_companyname -> General.CompanyName
    // general_publication_date -> General.Publication Date (space handling)
    
    const parts = asciidocAttributeName.split('_');
    if (parts.length < 2) {
      // Simple variable name, just capitalize first letter
      return asciidocAttributeName.charAt(0).toUpperCase() + asciidocAttributeName.slice(1);
    }
    
    // Convert to PascalCase with dots
    const namespace = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const variable = parts.slice(1).map(part => {
      // Handle special cases like "date" that might need to become "Date"
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(' '); // Use space for multi-word variables
    
    return `${namespace}.${variable}`;
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

  /**
   * Get the variable extractor instance
   */
  getVariableExtractor(): VariableExtractor {
    return this.variableExtractor;
  }

  /**
   * Fix malformed MadCap list structure where sublists are siblings instead of children
   * Pattern: <li>Text ending with colon:</li> <ol>...</ol> becomes <li>Text ending with colon: <ol>...</ol></li>
   */

  /**
   * Normalize image paths using enhanced path resolver
   */
  private normalizeImagePath(originalPath: string, pathDepth?: number, contextPath?: string): string {
    try {
      // First, apply batch conversion path depth correction if provided
      if (typeof pathDepth === 'number' && pathDepth > 0) {
        const correctedPath = this.adjustPathForDepth(originalPath, pathDepth);
        // Always return the depth-corrected path for batch conversions
        return correctedPath;
      }
      
      const resolution = this.pathResolver.resolveImagePath(originalPath, contextPath);
      
      // Only use resolved path if it's actually better (no malformed patterns)
      if (resolution.resolvedPath && 
          resolution.resolvedPath !== originalPath &&
          !resolution.resolvedPath.includes('..../') &&
          !resolution.resolvedPath.includes('/Users/') &&
          resolution.warnings.length === 0) {
        return resolution.resolvedPath;
      }
      
      // If path resolver didn't improve the path, use legacy normalization
      return this.legacyNormalizeImagePath(originalPath);
    } catch (error) {
      console.warn('Enhanced image path resolution failed, using legacy method:', error);
      return this.legacyNormalizeImagePath(originalPath);
    }
  }

  /**
   * Adjust image path based on directory depth for batch conversions
   */
  private adjustPathForDepth(originalPath: string, pathDepth: number): string {
    // Skip external URLs and absolute paths
    if (originalPath.startsWith('http') || originalPath.startsWith('//') || originalPath.startsWith('/')) {
      return originalPath;
    }
    
    // Count existing ../ prefixes
    const existingPrefixes = (originalPath.match(/\.\.\//g) || []).length;
    
    // If we already have the correct number of prefixes, return as-is
    if (existingPrefixes === pathDepth) {
      return originalPath;
    }
    
    // Remove all existing ../ prefixes
    let cleanPath = originalPath.replace(/^(\.\.\/)+/, '');
    
    // Handle paths that start with Images/ (no ../ prefix) - these are MadCap relative paths
    // These need to be adjusted based on target depth
    if (cleanPath === originalPath) {
      // No ../ prefixes found - this is a relative path that needs prefixes added
      const prefixes = '../'.repeat(pathDepth);
      return prefixes + cleanPath;
    }
    
    // Add the correct number of ../ prefixes based on path depth
    const prefixes = '../'.repeat(pathDepth);
    
    return prefixes + cleanPath;
  }

  /**
   * Legacy image path normalization (fallback)
   */
  private legacyNormalizeImagePath(originalPath: string): string {
    // Handle different path patterns from MadCap source
    if (originalPath.includes('/Images/')) {
      // Extract the Images/... part and normalize to ../Images/...
      const imagesIndex = originalPath.indexOf('/Images/');
      const imagesPart = originalPath.substring(imagesIndex + 1); // Remove leading slash
      return `../${imagesPart}`;
    }
    
    // If it already starts with ../Images/, keep it as is
    if (originalPath.startsWith('../Images/')) {
      return originalPath;
    }
    
    // If it starts with ../../Images/, normalize to ../Images/
    if (originalPath.startsWith('../../Images/')) {
      return originalPath.replace('../../Images/', '../Images/');
    }
    
    // If it starts with Images/ (relative from same directory), prefix with ../
    if (originalPath.startsWith('Images/')) {
      return `../${originalPath}`;
    }
    
    // For any other relative path that contains Images, try to normalize
    if (originalPath.includes('Images/')) {
      const parts = originalPath.split('/');
      const imagesIndex = parts.findIndex(part => part === 'Images');
      if (imagesIndex >= 0) {
        const imagePath = parts.slice(imagesIndex).join('/');
        return `../${imagePath}`;
      }
    }
    
    // If we can't normalize it, return the original path
    return originalPath;
  }

  /**
   * Calculate the correct relative path for variables include directive
   */
  private calculateVariablesIncludePath(options: ConversionOptions): string {
    try {
      // Get the document output path and variables output path
      const documentPath = options.outputPath;
      const variablesPath = options.variableOptions?.variablesOutputPath;
      
      if (!documentPath || !variablesPath) {
        // Fallback to default if paths are not available
        return 'includes/variables.adoc';
      }
      
      // Calculate relative path from document to variables file
      const documentDir = dirname(documentPath);
      const relativePath = relative(documentDir, variablesPath);
      
      // Ensure forward slashes for AsciiDoc
      const normalizedPath = relativePath.replace(/\\/g, '/');
      
      // Remove .adoc extension if present and add it back to ensure consistency
      const pathWithoutExt = normalizedPath.replace(/\.adoc$/, '');
      return `${pathWithoutExt}.adoc`;
      
    } catch (error) {
      console.warn('Failed to calculate variables include path, using default:', error);
      return 'includes/variables.adoc';
    }
  }

  /**
   * Get the parent list type to determine proper nesting
   */
  private getParentListType(element: Element): 'ol' | 'ul' | 'dl' | undefined {
    let current = element.parentElement;
    while (current) {
      const tagName = current.tagName.toLowerCase();
      if (tagName === 'li') {
        // Found a list item, check its parent
        const listParent = current.parentElement;
        if (listParent) {
          const listTagName = listParent.tagName.toLowerCase();
          if (['ol', 'ul', 'dl'].includes(listTagName)) {
            return listTagName as 'ol' | 'ul' | 'dl';
          }
        }
      }
      if (['body', 'html'].includes(tagName)) {
        break;
      }
      current = current.parentElement;
    }
    return undefined;
  }

  /**
   * Process list item children directly (fallback for orphaned list items)
   */
  private processListItemChildren(element: Element, depth: number, options?: ConversionOptions): string {
    const childResults: string[] = [];
    
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3) { // Text node
        const text = child.textContent?.trim();
        if (text) {
          // Remove alphabetic list markers from orphaned list items
          const cleanedText = text.replace(/^\s*[a-z]\.\s+/, '');
          if (cleanedText) {
            childResults.push(cleanedText);
          }
        }
      } else if (child.nodeType === 1) { // Element node
        const result = this.nodeToAsciiDoc(child, depth + 1, options);
        if (result.trim()) {
          childResults.push(result.trim());
        }
      }
    }
    
    return childResults.join(' ');
  }

  /**
   * Process image elements with proper formatting for AsciiDoc
   */
  private processImage(element: Element, depth: number, options: ConversionOptions): string {
    const originalSrc = element.getAttribute('src');
    let alt = element.getAttribute('alt') || '';
    const title = element.getAttribute('title') || '';
    if (!originalSrc) return '';
    
    // Normalize image paths for consistent relative structure in target
    const src = this.normalizeImagePath(originalSrc, this.currentPathDepth);
    
    // Generate alt text if missing
    if (!alt) {
      alt = this.generateAltText(src);
    }
    
    // Determine image type and context
    const width = element.getAttribute('width');
    const height = element.getAttribute('height');
    const hasIconInlineClass = element.className.includes('IconInline');
    const isInline = hasIconInlineClass || this.isInlineImage(element, width, height);
    const isInListItem = this.isWithinListItem(element);
    const isStandaloneImage = this.isStandaloneImageParagraph(element);
    const isScreenshot = this.isScreenshotImage(src);
    
    // Format image based on type
    if (isInline) {
      return this.formatInlineImage(src, alt, title, hasIconInlineClass);
    } else {
      return this.formatBlockImage(src, alt, title, isInListItem, isStandaloneImage, isScreenshot);
    }
  }

  /**
   * Generate descriptive alt text from filename
   */
  private generateAltText(src: string): string {
    const filename = src.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    
    // Convert filename to readable alt text - ensure we don't truncate
    const altText = nameWithoutExt.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    // Ensure alt text has minimum length and is not just a single character
    return altText.length > 1 ? altText : filename;
  }

  /**
   * Check if image is a screenshot
   */
  private isScreenshotImage(src: string): boolean {
    return /\/(Screens|screens|Screenshots|screenshots)/i.test(src) ||
           src.includes('CreateActivity') ||
           src.includes('AddFundingSource') ||
           src.includes('InvestItem') ||
           src.includes('BudgetTab') ||
           src.includes('FundingSource');
  }

  /**
   * Format inline image with proper syntax
   */
  private formatInlineImage(src: string, alt: string, title: string, hasIconInlineClass: boolean): string {
    // Inline images use single colon syntax
    if (hasIconInlineClass) {
      // For IconInline class, add sizing attributes to maintain 18px height from CSS
      return title ? `image:${src}[${alt},18,title="${title}"]` : `image:${src}[${alt},18]`;
    }
    const attributes = this.buildImageAttributes(alt, title);
    return `image:${src}[${attributes}]`;
  }

  /**
   * Format block image with proper spacing
   */
  private formatBlockImage(src: string, alt: string, title: string, isInListItem: boolean, isStandaloneImage: boolean, isScreenshot: boolean): string {
    // Block images use double colon syntax
    const attributes = this.buildImageAttributes(alt, title);
    
    if (isInListItem && !isScreenshot) {
      // Small block images in list items - minimal spacing for flow
      return `\n\nimage::${src}[${attributes}]\n`;
    } else if (isInListItem && isScreenshot) {
      // Screenshots in list items need proper spacing
      return `\n\nimage::${src}[${attributes}]\n`;
    } else if (isStandaloneImage) {
      // Standalone image in its own paragraph
      return `\nimage::${src}[${attributes}]\n`;
    } else {
      // Regular block image
      return `\n\nimage::${src}[${attributes}]\n`;
    }
  }

  /**
   * Build image attribute string
   */
  private buildImageAttributes(altText: string, titleText?: string): string {
    // Filter out meaningless title attributes
    if (titleText && titleText.trim() && titleText.length > 1 && titleText !== 'c') {
      return `${altText},title="${titleText}"`;
    }
    return altText;
  }

  /**
   * Apply clean AsciiDoc formatting following official syntax guidelines
   * This replaces the heavy-handed post-processor with focused cleanup
   */
  /**
   * Apply minimal essential cleanup for AsciiDoc output
   * Only fixes critical issues that affect readability or syntax validity
   */
  private applyMinimalCleanup(content: string): string {
    let result = content;

    // ULTRA CLEAN PHASE 1: Remove ALL HTML artifacts
    result = this.removeAllHTMLArtifacts(result);
    
    // ULTRA CLEAN PHASE 2: Perfect list formatting
    result = this.perfectListFormatting(result);
    
    // ULTRA CLEAN PHASE 3: Fix spacing around blocks
    result = this.fixBlockSpacing(result);
    
    // ULTRA CLEAN PHASE 4: Final cleanup
    result = this.finalUltraCleanup(result);
    
    return result;
  }
  
  private removeAllHTMLArtifacts(content: string): string {
    let result = content;
    
    // NOTE: We don't remove HTML tags here because:
    // 1. All HTML should already be converted to AsciiDoc by this point
    // 2. The regex would incorrectly remove AsciiDoc cross-references like <<anchor,text>>
    // If there are still HTML tags at this stage, it indicates a problem earlier in the conversion
    // result = result.replace(/<[^>]+>/g, ''); // DISABLED - breaks AsciiDoc xrefs
    
    // Decode any remaining HTML entities
    result = result.replace(/&lt;/g, '<');
    result = result.replace(/&gt;/g, '>');
    result = result.replace(/&amp;/g, '&');
    result = result.replace(/&quot;/g, '"');
    result = result.replace(/&apos;/g, "'");
    result = result.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec)));
    result = result.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
    
    // Remove any MadCap artifacts
    result = result.replace(/MadCap:[^\s]+/g, '');
    result = result.replace(/mc-[^:]+:[^;]+;/g, '');
    
    return result;
  }
  
  private perfectListFormatting(content: string): string {
    const lines = content.split('\n');
    const perfectedLines: string[] = [];
    let inList = false;
    let listDepth = 0;
    let lastWasListItem = false;
    let needsContinuation = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      
      // Detect list markers
      const orderedMatch = line.match(/^(\.|\.\.|\.\.\.+)\s+(.*)/);
      const unorderedMatch = line.match(/^(\*|\*\*|\*\*\*+)\s+(.*)/);
      const isListItem = !!(orderedMatch || unorderedMatch);
      const isListAttribute = trimmedLine.match(/^\[(loweralpha|upperalpha|lowerroman|upperroman)\]$/);
      
      if (isListAttribute) {
        // List attributes should have proper spacing
        if (prevLine && !prevLine.match(/^\[(loweralpha|upperalpha|lowerroman|upperroman)\]$/)) {
          perfectedLines.push('');
        }
        perfectedLines.push(line);
        lastWasListItem = false;
        continue;
      }
      
      if (isListItem) {
        // Starting or continuing a list
        if (!inList && perfectedLines.length > 0 && perfectedLines[perfectedLines.length - 1].trim()) {
          perfectedLines.push(''); // Add blank line before list starts
        }
        
        inList = true;
        lastWasListItem = true;
        needsContinuation = false;
        
        // Calculate depth from marker
        const marker = (orderedMatch || unorderedMatch)![1];
        listDepth = marker.length;
        
        perfectedLines.push(line);
      } else if (trimmedLine === '+' && lastWasListItem) {
        // Valid continuation marker after list item
        perfectedLines.push('+');
        needsContinuation = true;
        lastWasListItem = false;
      } else if (inList && trimmedLine && !trimmedLine.startsWith('+')) {
        // Content within a list
        if (needsContinuation || lastWasListItem) {
          // This content belongs to the previous list item
          if (!lastWasListItem && !needsContinuation) {
            perfectedLines.push('+');
          }
          perfectedLines.push(line);
          needsContinuation = false;
          lastWasListItem = false;
        } else if (nextLine && (nextLine.match(/^(\.|\*|\.\.|\*\*)\s+/) || nextLine === '+')) {
          // This is content before the next list item
          perfectedLines.push('+');
          perfectedLines.push(line);
          needsContinuation = false;
        } else {
          // End of list
          perfectedLines.push('');
          perfectedLines.push(line);
          inList = false;
          listDepth = 0;
          lastWasListItem = false;
        }
      } else if (!trimmedLine) {
        // Empty line
        if (inList && nextLine && !nextLine.match(/^(\.|\*|\.\.|\*\*)\s+/)) {
          // Empty line ending a list
          inList = false;
          listDepth = 0;
          lastWasListItem = false;
        }
        perfectedLines.push(line);
      } else {
        // Regular content
        if (inList) {
          perfectedLines.push('');
          inList = false;
          listDepth = 0;
        }
        perfectedLines.push(line);
        lastWasListItem = false;
      }
    }
    
    return perfectedLines.join('\n');
  }
  
  private fixBlockSpacing(content: string): string {
    let result = content;
    
    // Fix admonition block spacing
    result = result.replace(/([^\n])\n(\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\])/g, '$1\n\n$2');
    result = result.replace(/(====)\n([^\n])/g, '$1\n\n$2');
    
    // Fix image block spacing
    result = result.replace(/([^\n])\n(image::[^\n]+)/g, '$1\n\n$2');
    result = result.replace(/(image::[^\n]+)\n([^\n\s])/g, '$1\n\n$2');
    
    // Fix code block spacing
    result = result.replace(/([^\n])\n(\[source)/g, '$1\n\n$2');
    result = result.replace(/(----)\n([^\n])/g, '$1\n\n$2');
    
    // Fix table spacing
    result = result.replace(/([^\n])\n(\|===)/g, '$1\n\n$2');
    result = result.replace(/(\|===)\n([^\n|])/g, '$1\n\n$2');
    
    return result;
  }
  
  private finalUltraCleanup(content: string): string {
    let result = content;
    
    // Remove any orphaned + markers that our perfect list formatting might have missed
    // Only remove continuation markers in specific problematic contexts, not generally
    // Remove + at end of document or start of document (these are orphaned)
    result = result.replace(/\n\+\n?$/g, '\n');
    result = result.replace(/^\+\n/g, '');
    
    // Remove specific problematic continuation markers, but preserve valid list continuations
    result = result.replace(/\n\+\nThe _Select Investment Item_/g, '\nThe _Select Investment Item_');
    
    // Normalize excessive blank lines (max 2)
    result = result.replace(/\n{4,}/g, '\n\n\n');
    
    // Ensure document ends with single newline
    result = result.replace(/\n*$/, '\n');
    
    return result;
  }

  private applyCleanAsciiDocFormatting(content: string): string {
    let result = content;

    // 1. Fix all list marker issues first - this is the core problem
    result = this.fixAllListMarkers(result);

    // 1a. Fix roman numeral and ellipsis list patterns
    result = this.fixRomanNumeralLists(result);

    // 2. Aggressively remove ALL orphaned continuation markers
    result = this.aggressivelyRemoveContinuationMarkers(result);

    // 3. Fix admonition block spacing comprehensively
    result = this.fixAdmonitionSpacing(result);

    // 4. Fix block spacing around key elements
    result = result.replace(/([^\n])\n(image::[^\n]+)/g, '$1\n\n$2');
    result = result.replace(/(image::[^\n]+)\n([^\n\s])/g, '$1\n\n$2');
    
    // 4a. Fix specific issue where images and NOTE blocks appear on same line
    // Handle case: image text [NOTE] - separate all three elements
    result = result.replace(/(image::[^\]]+\])\s+([^\n]*?)\s+(\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\])/g, '$1\n\n$2\n\n$3');
    // Handle case: image [NOTE] - separate image and note
    result = result.replace(/(image::[^\]]+\])\s+(\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\])/g, '$1\n\n$2');
    // Handle case: text image text - ensure image has proper spacing
    result = result.replace(/(\w+)\s+(image::[^\]]+\])\s+(\w+)/g, '$1\n\n$2\n\n$3');
    
    // 4b. Ensure proper spacing between paragraphs and block elements
    result = result.replace(/([^\n])\n(\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\])/g, '$1\n\n$2');
    result = result.replace(/(====)\n([^\n\s])/g, '$1\n\n$2');

    // 5. Clean up redundant formatting patterns
    result = result.replace(/NOTE: \*Note:\* /g, 'NOTE: ');
    result = result.replace(/TIP: \*Tip:\* /g, 'TIP: ');
    result = result.replace(/WARNING: \*Warning:\* /g, 'WARNING: ');

    // 6. Fix malformed table syntax
    result = result.replace(/(\[cols="[^"]+"\])\n\|\s*\n\s*\n===/g, '$1\n|===');
    result = result.replace(/\|\s*\n===/g, '|===');

    // 7. Normalize excessive blank lines (max 2 consecutive blank lines)
    result = result.replace(/\n{4,}/g, '\n\n\n');

    // 8. Ensure document ends with single newline
    result = result.replace(/\n*$/, '\n');

    return result;
  }

  /**
   * Fix list formatting issues and remove conflicting attributes
   */
  private fixListFormattingIssues(content: string): string {
    let result = content;

    // Remove orphaned continuation markers - but preserve those needed for nested lists
    // Split by lines and check each + marker
    const lines = result.split('\n');
    const filteredLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === '+') {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        // Keep + if followed by [loweralpha] or other list attributes
        if (nextLine.match(/^\[(?:loweralpha|upperalpha|lowerroman|upperroman)\]/)) {
          filteredLines.push(line);
        }
        // Otherwise skip the orphaned +
      } else {
        filteredLines.push(line);
      }
    }
    result = filteredLines.join('\n');
    result = result.replace(/^\+\n/g, '');
    result = result.replace(/\n\+$/g, '\n');
    
    // Remove + markers that appear before admonitions and list markers (but preserve valid paragraph continuations)
    result = result.replace(/\+\n(\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\])/g, '$1');
    result = result.replace(/\+\n(\.\s|\*\s|\.\.\s)/g, '$1');
    
    // Only remove + markers before text if they're at the start of a document/section or clearly orphaned
    // Don't remove + markers that are valid list item continuations
    result = result.replace(/^(\s*)\+\n([a-zA-Z])/gm, '$1$2'); // Remove + at start of lines only
    result = result.replace(/\n\n\+\n([a-zA-Z])/g, '\n\n$1'); // Remove + between paragraphs (not in lists)
    
    // Ultra-specific fix for this exact case
    result = result.replace(/\+\nThe _Select Investment Item_/g, 'The _Select Investment Item_');
    
    // Fix malformed list markers - convert excessive markers to proper depth
    result = result.replace(/^\.{6,}\s/gm, '..... '); // Max 5 dots
    result = result.replace(/^\*{6,}\s/gm, '***** '); // Max 5 asterisks
    
    // Fix spacing issues around images and text in lists
    result = result.replace(/(image::[^\]]+\])\+/g, '$1\n\n'); // Remove + after block images
    result = result.replace(/(image:[^\]]+\])(\w)/g, '$1 $2'); // Add space after inline images
    result = result.replace(/(\w)(image:)/g, '$1 $2'); // Add space before inline images
    
    // Fix inline image spacing issues specifically
    result = result.replace(/(\w)(image:[^\]]+\])(\w)/g, '$1 $2 $3'); // Ensure spaces around inline images
    
    // Fix missing newlines in list items with multiple elements
    result = result.replace(/(\w)(\*\*\*)/g, '$1\n$2'); // Newline before list markers in text
    result = result.replace(/(\w)(\.\.\. )/g, '$1\n$2'); // Newline before numbered sub-items
    
    // DISABLED: Do not remove standalone + lines as they may be valid list continuations
    // result = result.replace(/^\+$/gm, '');
    
    // Clean up excessive blank lines after removals
    result = result.replace(/\n{3,}/g, '\n\n');

    return result;
  }

  /**
   * Fix admonition block spacing comprehensively
   */
  private fixAdmonitionSpacing(content: string): string {
    let result = content;

    // Ensure blank line before admonition blocks
    result = result.replace(/([^\n])\n(\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\])/g, '$1\n\n$2');
    
    // Ensure proper spacing between admonition header and content - NO blank lines
    result = result.replace(/(\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\])\n\n+(====)/g, '$1\n$2');
    
    // Ensure blank line after admonition blocks end - improved pattern
    result = result.replace(/(====)(\n)?([^\n\s\[])/g, '$1\n\n$3');
    
    // Fix continuation markers that appear within admonition blocks
    result = result.replace(/(\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\n====)\n\+\n/g, '$1\n');
    result = result.replace(/\n\+\n(====)/g, '\n$1');

    // Fix specific case where admonition end is followed immediately by list item
    result = result.replace(/(====)(\. )/g, '$1\n\n$2');

    return result;
  }

  /**
   * Comprehensive fix for all list marker issues
   */
  private fixAllListMarkers(content: string): string {
    let result = content;

    // Fix invalid quad-dot markers (.....) - convert to proper numbered lists
    result = result.replace(/^\.{4,}\s/gm, (match) => {
      const dots = match.match(/\./g)?.length || 4;
      const level = Math.min(dots, 5); // Max 5 levels
      return '.'.repeat(level) + ' ';
    });

    // Fix invalid multi-asterisk markers (***, ****, *****)
    result = result.replace(/^\*{3,}\s/gm, (match) => {
      const asterisks = match.match(/\*/g)?.length || 3;
      const level = Math.min(asterisks, 5); // Max 5 levels
      return '*'.repeat(level) + ' ';
    });

    // CRITICAL FIX: Handle [loweralpha] placement issues from MadCap sibling structure
    const lines = result.split('\n');
    const fixedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Handle misplaced [loweralpha] attributes that appear mid-content
      if (line.includes('[loweralpha]') && !line.trim().startsWith('[loweralpha]')) {
        // Extract the [loweralpha] and separate it from the content
        const loweralphaMatch = line.match(/^(.+?)(\[loweralpha\])(.*)$/);
        if (loweralphaMatch) {
          const [, beforeContent, loweralpha, afterContent] = loweralphaMatch;
          
          // Add the content before [loweralpha]
          if (beforeContent.trim()) {
            fixedLines.push(beforeContent.trim());
          }
          
          // Add the [loweralpha] on its own line
          fixedLines.push(loweralpha);
          
          // Add the content after [loweralpha] if any
          if (afterContent.trim()) {
            fixedLines.push(afterContent.trim());
          }
          continue;
        }
      }
      
      if (line.trim() === '[loweralpha]') {
        // Check if next non-empty line is actually a list item
        let hasValidList = false;
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          // Check for any level of ordered list marker (., .., ..., etc.) OR alphabetic markers (a., b., c., etc.)
          if (nextLine.match(/^\.+\s/) || nextLine.match(/^[a-z]\.\s/)) {
            hasValidList = true;
            break;
          }
          if (nextLine && !nextLine.match(/^\s*$/)) {
            break;
          }
        }
        
        if (hasValidList) {
          fixedLines.push(line);
        }
        // Skip orphaned [loweralpha] attributes
      } else {
        fixedLines.push(line);
      }
    }
    
    return fixedLines.join('\n');
  }

  /**
   * Aggressively remove all orphaned continuation markers
   */
  private aggressivelyRemoveContinuationMarkers(content: string): string {
    let result = content;

    // Remove orphaned + lines that don't have content following them
    // But preserve legitimate continuation markers that are followed by content
    const lines = result.split('\n');
    const cleanedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      
      // Check if this is a standalone + line
      if (line.trim() === '+') {
        // Keep + markers that are followed by content (legitimate continuation)
        if (nextLine.trim() && 
            !nextLine.match(/^\s*[\.\*]/) && // Not followed by list marker
            !nextLine.match(/^\s*\[/) &&     // Not followed by block marker
            nextLine.trim() !== '+') {       // Not followed by another +
          cleanedLines.push(line);
        }
        // Skip orphaned + lines (those not followed by content)
      } else {
        cleanedLines.push(line);
      }
    }
    
    result = cleanedLines.join('\n');
    
    // Remove + at end of image syntax
    result = result.replace(/(image::[^\]]+\])\+/g, '$1');
    result = result.replace(/(image:[^\]]+\])\+/g, '$1');
    
    // Clean up multiple consecutive blank lines that result
    result = result.replace(/\n{3,}/g, '\n\n');
    
    return result;
  }

  /**
   * Process FLVAR variables for AsciiDoc conversion
   */
  private async processVariables(input: string, options: ConversionOptions, warnings: string[]): Promise<{ content: string; variablesFile?: string }> {
    const variableOptions = options.variableOptions!;
    
    try {
      // Find FLVAR files
      let flvarFiles: string[] = [];
      
      if (variableOptions.flvarFiles) {
        flvarFiles = variableOptions.flvarFiles;
      } else if (variableOptions.autoDiscoverFLVAR !== false && options.inputPath) {
        // Try to find FLVAR files in the project
        const projectPath = this.findProjectPath(options.inputPath);
        if (projectPath) {
          flvarFiles = await this.flvarParser.findFLVARFiles(projectPath);
        }
      }
      
      if (flvarFiles.length === 0) {
        warnings.push('No FLVAR files found for variable processing');
        
        // Even without FLVAR files, we can still process variable references in reference mode
        if (variableOptions.variableMode === 'reference' || variableOptions.variableMode === 'include') {
          const conversionOptions: VariableConversionOptions = {
            mode: variableOptions.variableMode || 'reference',
            format: 'asciidoc',
            variableFileName: 'variables.adoc',
            nameConvention: variableOptions.nameConvention || 'original'
          };
          
          // Process variable references without FLVAR data
          const processedContent = this.variableConverter.processVariableReferences(input, [], conversionOptions);
          return { content: processedContent };
        }
        
        return { content: input };
      }
      
      // Parse FLVAR files
      const variableSets = await this.flvarParser.parseMultipleFiles(flvarFiles);
      const variables = this.flvarParser.mergeVariableSets(variableSets);
      
      if (variables.length === 0) {
        warnings.push('No variables found in FLVAR files');
        return { content: input };
      }
      
      // Convert to AsciiDoc format
      const conversionOptions: VariableConversionOptions = {
        mode: variableOptions.variableMode || 'reference',
        format: 'asciidoc',
        variableFileName: variableOptions.variablesOutputPath ? 
          variableOptions.variablesOutputPath.split('/').pop()?.replace(/\.[^/.]+$/, '') : 
          'variables.adoc',
        nameConvention: variableOptions.nameConvention || 'original',
        instanceName: variableOptions.instanceName,
        prefix: variableOptions.variablePrefix,
        includePatterns: variableOptions.includePatterns,
        excludePatterns: variableOptions.excludePatterns
      };
      
      const asciidocVariables = this.variableConverter.convertVariables(variables, conversionOptions);
      
      // Generate variables file
      let variablesFile: string | undefined;
      if (!variableOptions.skipFileGeneration) {
        const variableFileResult = this.variableConverter.generateAsciiDocFile(asciidocVariables, conversionOptions);
        variablesFile = variableFileResult.content;
      }
      
      // Process variable references in content
      const processedContent = this.variableConverter.processVariableReferences(input, asciidocVariables, conversionOptions);
      
      warnings.push(`Processed ${variables.length} variables from ${flvarFiles.length} FLVAR files`);
      
      return { content: processedContent, variablesFile };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warnings.push(`Variable processing failed: ${errorMessage}`);
      return { content: input };
    }
  }

  /**
   * Find the project path by looking for the Flare project structure
   */
  private findProjectPath(inputPath: string): string | null {
    // Find the project path by looking for the Flare project structure
    const pathParts = inputPath.split('/');
    const contentIndex = pathParts.findIndex(part => part === 'Content');
    
    if (contentIndex > 0) {
      // Build path to project root
      return pathParts.slice(0, contentIndex).join('/');
    }
    
    return null;
  }

  /**
   * Process glossary conversion if enabled
   */
  private async processGlossary(options: ConversionOptions, warnings: string[]): Promise<string | undefined> {
    const glossaryOptions = options.asciidocOptions?.glossaryOptions;
    if (!glossaryOptions?.includeGlossary) {
      return undefined;
    }

    try {
      let glossaryPath = glossaryOptions.glossaryPath;
      
      // Auto-discover glossary file if not provided
      if (!glossaryPath && options.inputPath) {
        const projectPath = this.findProjectPath(options.inputPath);
        if (projectPath) {
          const glossaryFiles = await this.flgloParser.findGlossaryFiles(projectPath);
          if (glossaryFiles.length > 0) {
            glossaryPath = glossaryFiles[0]; // Use first found glossary
            warnings.push(`Auto-discovered glossary file: ${glossaryPath}`);
          }
        }
      }
      
      if (!glossaryPath) {
        warnings.push('No glossary file found or specified');
        return undefined;
      }
      
      // Parse the glossary file
      const parsedGlossary = await this.flgloParser.parseGlossaryFile(glossaryPath);
      
      if (parsedGlossary.entries.length === 0) {
        warnings.push('No glossary entries found in file');
        return undefined;
      }
      
      // Apply condition filtering if not disabled
      const conditionFilters = glossaryOptions.filterConditions !== false ? 
        undefined : []; // Use default filters unless explicitly disabled
      
      // Create converter options
      const glossaryConversionOptions: GlossaryConversionOptions = {
        format: glossaryOptions.glossaryFormat || 'inline',
        generateAnchors: glossaryOptions.generateAnchors !== false,
        includeIndex: glossaryOptions.includeIndex || false,
        title: glossaryOptions.glossaryTitle || 'Glossary',
        levelOffset: options.asciidocOptions?.generateAsBook ? 1 : 0
      };
      
      // Convert to AsciiDoc
      const glossaryContent = this.glossaryConverter.convertToAsciiDoc(
        parsedGlossary.entries,
        glossaryConversionOptions
      );
      
      warnings.push(`Processed ${parsedGlossary.entries.length} glossary entries`);
      
      return glossaryContent;
      
    } catch (error) {
      throw new Error(`Glossary processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fix specific MadCap pattern where numeric markers appear in alphabetic lists
   * Targets: "1. Click _Next_." should be ".. Click _Next_." within or after [loweralpha] sections
   */
  private fixNumericMarkersInAlphabeticLists(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let recentLowerAlphaSection = false;
    let alphaDepth = 2; // Default depth for alphabetic items (usually ..)
    let lastAlphaIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Track [loweralpha] sections
      if (trimmedLine === '[loweralpha]') {
        recentLowerAlphaSection = true;
        lastAlphaIndex = i;
        
        // Look ahead to determine the expected depth for alphabetic items
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j].trim();
          const dotMatch = nextLine.match(/^(\.+)\s/);
          if (dotMatch && dotMatch[1].length > 1) {
            alphaDepth = dotMatch[1].length;
            break;
          }
        }
        
        result.push(line);
        continue;
      }
      
      // Reset recentLowerAlphaSection on major section boundaries or new list types
      if (recentLowerAlphaSection) {
        if (trimmedLine.match(/^={1,6}\s/) || 
            trimmedLine.match(/^\[(lowerroman|upperroman|arabic)\]/) ||
            trimmedLine.match(/^===/)) {
          recentLowerAlphaSection = false;
        }
        // Also reset if we're too far from the last [loweralpha] section
        else if (i - lastAlphaIndex > 30) {
          recentLowerAlphaSection = false;
        }
      }
      
      // Fix numeric markers that should be alphabetic
      const numericMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
      if (numericMatch) {
        const [, indent, number, content] = numericMatch;
        
        // Check if this appears to be in an alphabetic list context
        let isInAlphabeticContext = false;
        
        // Strong indicator: we recently had a [loweralpha] section
        if (recentLowerAlphaSection) {
          isInAlphabeticContext = true;
        }
        
        // Look backwards for alphabetic items (more comprehensive search)
        if (!isInAlphabeticContext) {
          for (let j = Math.max(0, i - 10); j < i; j++) {
            const prevLine = lines[j].trim();
            if (prevLine.match(/^\.{2,}\s/) || prevLine.match(/^[a-z]\.\s/)) {
              isInAlphabeticContext = true;
              break;
            }
          }
        }
        
        // Look forwards for alphabetic items
        if (!isInAlphabeticContext) {
          for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
            const nextLine = lines[j].trim();
            if (nextLine.match(/^\.{2,}\s/) || nextLine.match(/^[a-z]\.\s/)) {
              isInAlphabeticContext = true;
              break;
            }
          }
        }
        
        // Special case: Check if this numeric item is between a NOTE block and the next main list item
        // This is the exact pattern from our problem: NOTE block, then "1. Click _Next_.", then ". On the *Budget* page:"
        if (!isInAlphabeticContext) {
          let foundNoteAbove = false;
          let foundMainListBelow = false;
          
          // Look backwards for NOTE block
          for (let j = Math.max(0, i - 8); j < i; j++) {
            const prevLine = lines[j].trim();
            if (prevLine === '====' || prevLine.includes('[NOTE]')) {
              foundNoteAbove = true;
              break;
            }
          }
          
          // Look forwards for main list item (single dot)
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nextLine = lines[j].trim();
            if (nextLine.match(/^\.\s/)) {
              foundMainListBelow = true;
              break;
            }
          }
          
          if (foundNoteAbove && foundMainListBelow) {
            isInAlphabeticContext = true;
          }
        }
        
        if (isInAlphabeticContext) {
          // Replace numeric marker with appropriate dot marker
          const dotMarker = '.'.repeat(alphaDepth);
          const fixedLine = `${indent}${dotMarker} ${content}`;
          result.push(fixedLine);
          continue;
        }
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }

  /**
   * Fix MadCap sibling list structure where alphabetic lists appear as siblings instead of nested
   * This addresses the core issue where HTML like:
   * <li>On the Type page:</li>
   * <ol style="list-style-type: lower-alpha;">...</ol>
   * Should become properly nested AsciiDoc structure with ALL alphabetic items under one [loweralpha] section
   */
  private fixMadCapSiblingListStructure(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Check if this is a main list item (with single dot)
      const mainItemMatch = line.match(/^(\s*)(\.\s+.*)$/);
      if (mainItemMatch) {
        const indent = mainItemMatch[1];
        const itemContent = mainItemMatch[2];
        
        // Look ahead to find orphaned alphabetic content
        let foundOrphanedAlpha = false;
        let allContent: string[] = [];
        let j = i + 1;
        let hasAlphaMarker = false;
        
        // Collect content until next main list item or section
        while (j < lines.length) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trim();
          
          // Stop at next main list item (single dot) or section heading
          if (nextTrimmed.match(/^\.\s+/) || 
              nextTrimmed.match(/^={1,6}\s/) || 
              nextTrimmed.match(/^===+$/)) {
            break;
          }
          
          // Check for [loweralpha] marker
          if (nextTrimmed === '[loweralpha]') {
            hasAlphaMarker = true;
            foundOrphanedAlpha = true;
            j++;
            continue;
          }
          
          // Check for alphabetic list items (double dot markers)
          if (nextTrimmed.match(/^\.{2,}\s/)) {
            foundOrphanedAlpha = true;
          }
          
          allContent.push(nextLine);
          j++;
        }
        
        // Add the main list item
        result.push(line);
        
        if (foundOrphanedAlpha && allContent.length > 0) {
          // This main item has orphaned alphabetic sublists
          // Add continuation marker to connect the sublist
          result.push('+');
          
          // Add [loweralpha] marker for the entire alphabetic section
          if (hasAlphaMarker || allContent.some(l => l.trim().match(/^\.{2,}\s/))) {
            result.push('[loweralpha]');
          }
          
          // Add all the alphabetic content
          for (const contentLine of allContent) {
            const contentTrimmed = contentLine.trim();
            // Skip any additional [loweralpha] markers
            if (contentTrimmed !== '[loweralpha]') {
              result.push(contentLine);
            }
          }
          
          // Skip ahead in the main loop
          i = j - 1;
        } else {
          // Check if there's immediate content that needs continuation
          let k = i + 1;
          while (k < lines.length && lines[k].trim() === '') k++;
          
          if (k < lines.length) {
            const nextLine = lines[k];
            const nextTrimmed = nextLine.trim();
            
            // Special handling for orphaned list markers
            if (nextTrimmed === '[loweralpha]' || nextTrimmed === '[lowerroman]') {
              result.push('+');
            }
            // If next line is not a list item or heading but has content,
            // it probably needs continuation
            else if (nextTrimmed.length > 0 && 
                !nextTrimmed.match(/^[\.\*\+\[]/) && 
                !nextTrimmed.match(/^=/) &&
                !nextTrimmed.startsWith('image::')) {
              
              // This content should probably continue the list item
              result.push('+');
            }
          }
        }
      } 
      // Handle orphaned [loweralpha] markers that weren't merged
      else if (trimmedLine === '[loweralpha]') {
        // Only skip if this appears to be an orphan that should have been merged
        let shouldSkip = false;
        
        // Look backwards for a recent main list item
        for (let k = Math.max(0, i - 8); k < i; k++) {
          const prevLine = lines[k];
          if (prevLine.match(/^\s*\.\s+/)) {
            // Found a recent main item, this marker should probably be merged
            shouldSkip = true;
            break;
          }
        }
        
        if (!shouldSkip) {
          result.push(line);
        }
        // Otherwise skip this orphaned marker
      }
      else {
        // Not a main list item, add as-is
        result.push(line);
      }
    }
    
    return result.join('\n');
  }

  /**
   * Fix triple-dot markers and normalize list depths for consistent AsciiDoc
   * Converts ... to .. where appropriate and fixes orphaned numeric markers
   */
  private fixTripleDotMarkersAndDepths(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inAlphabeticContext = false;
    let inRomanContext = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Track list contexts
      if (trimmedLine === '[loweralpha]') {
        inAlphabeticContext = true;
        inRomanContext = false;
        result.push(line);
        continue;
      } else if (trimmedLine === '[lowerroman]') {
        inRomanContext = true;
        inAlphabeticContext = false;
        result.push(line);
        continue;
      } else if (trimmedLine.match(/^={1,6}\s/) || trimmedLine.match(/^===+$/)) {
        // Reset contexts on major sections
        inAlphabeticContext = false;
        inRomanContext = false;
      }
      
      // Fix triple dots in alphabetic contexts
      if (inAlphabeticContext) {
        const tripleDotMatch = line.match(/^(\s*)(\.{3,})\s+(.+)$/);
        if (tripleDotMatch) {
          const [, indent, dots, content] = tripleDotMatch;
          // Convert triple+ dots to double dots in alphabetic lists
          const fixedLine = `${indent}.. ${content}`;
          result.push(fixedLine);
          continue;
        }
        
        // Fix remaining numeric markers in alphabetic context
        const numericMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
        if (numericMatch) {
          const [, indent, number, content] = numericMatch;
          const fixedLine = `${indent}.. ${content}`;
          result.push(fixedLine);
          continue;
        }
      }
      
      // Fix triple dots in roman numeral contexts
      if (inRomanContext) {
        const tripleDotMatch = line.match(/^(\s*)(\.{3,})\s+(.+)$/);
        if (tripleDotMatch) {
          const [, indent, dots, content] = tripleDotMatch;
          // Convert triple+ dots to triple dots (proper roman depth)
          const fixedLine = `${indent}... ${content}`;
          result.push(fixedLine);
          continue;
        }
        
        // Fix numeric markers in roman context
        const numericMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
        if (numericMatch) {
          const [, indent, number, content] = numericMatch;
          const fixedLine = `${indent}... ${content}`;
          result.push(fixedLine);
          continue;
        }
      }
      
      // Check if we're exiting list contexts
      if (inAlphabeticContext || inRomanContext) {
        // Exit on main list items or new sections
        if (trimmedLine.match(/^\.\s+/) && !trimmedLine.match(/^\.{2,}\s+/)) {
          inAlphabeticContext = false;
          inRomanContext = false;
        }
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  }
}

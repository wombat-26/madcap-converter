import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index.js';
import { HTMLPreprocessor } from '../services/html-preprocessor.js';
import { MadCapPreprocessor } from '../services/madcap-preprocessor.js';
import { FLVARParser, VariableSet } from '../services/flvar-parser.js';
import { WritersideVariableConverter, VariableConversionOptions } from '../services/writerside-variable-converter.js';
import { MadCapToWritersideConverter } from '../services/madcap-to-writerside-converter.js';

export default class WritersideMarkdownConverter implements DocumentConverter {
  format = 'writerside-markdown' as const;
  supportedInputTypes = ['html', 'madcap'];
  private htmlPreprocessor: HTMLPreprocessor;
  private madcapPreprocessor: MadCapPreprocessor;
  private flvarParser: FLVARParser;
  private variableConverter: WritersideVariableConverter;
  private madcapConverter: MadCapToWritersideConverter;
  
  // Store current conversion options for access in methods
  private currentOptions: ConversionOptions | null = null;

  constructor() {
    this.htmlPreprocessor = new HTMLPreprocessor();
    this.madcapPreprocessor = new MadCapPreprocessor();
    this.flvarParser = new FLVARParser();
    this.variableConverter = new WritersideVariableConverter();
    this.madcapConverter = new MadCapToWritersideConverter();
  }

  supportsFormat(format: string): boolean {
    return format === 'writerside-markdown';
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    
    // Store options for access in other methods
    this.currentOptions = options;

    try {
      // Step 1: Process variables if variable options are provided
      let variablesFile: string | undefined;
      let processedInput = input;
      
      if (options.variableOptions) {
        const variableResult = await this.processVariables(input, options, warnings);
        processedInput = variableResult.content;
        variablesFile = variableResult.variablesFile;
      }
      
      // Step 2: Preprocess HTML for better structure using MadCap preprocessor for variable handling
      let preprocessedHtml: string;
      if (options.inputType === 'madcap' || processedInput.includes('MadCap:')) {
        // Use MadCap preprocessor for MadCap content - preserve variable tags for later processing
        this.madcapPreprocessor.setExtractVariables(false);
        this.madcapPreprocessor.setPreserveVariables(true);
        
        // Check if we should merge snippets or convert them to includes
        const shouldMergeSnippets = !options.writersideOptions?.mergeSnippets;
        
        if (shouldMergeSnippets) {
          // Default behavior: merge snippet content inline
          preprocessedHtml = await this.madcapPreprocessor.preprocessMadCapContent(processedInput, options.inputPath, 'writerside-markdown');
        } else {
          // Convert snippets to include references instead of merging content
          preprocessedHtml = await this.preprocessWithSnippetIncludes(processedInput, options.inputPath);
        }
        
        // Reset preserve variables flag for next use
        this.madcapPreprocessor.setPreserveVariables(false);
      } else {
        // Use regular HTML preprocessor for regular HTML
        preprocessedHtml = await this.htmlPreprocessor.preprocess(processedInput);
      }
      
      // Step 3: Parse with JSDOM for proper DOM manipulation
      const dom = new JSDOM(preprocessedHtml);
      const document = dom.window.document;
      
      // Step 4: Convert using CommonMark/Writerside rules
      const markdownContent = this.convertDomToMarkdown(document.body, document);
      
      // Step 5: Post-process for CommonMark compliance
      const cleanedMarkdown = this.postProcessMarkdown(markdownContent);
      
      const processingTime = Date.now() - startTime;
      
      return {
        content: cleanedMarkdown,
        variablesFile,
        metadata: {
          wordCount: cleanedMarkdown.trim() ? cleanedMarkdown.split(/\s+/).length : 0,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Writerside markdown conversion failed: ${errorMessage}`);
    }
  }

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
        return { content: input };
      }
      
      // Parse FLVAR files
      const variableSets = await this.flvarParser.parseMultipleFiles(flvarFiles);
      const variables = this.flvarParser.mergeVariableSets(variableSets);
      
      if (variables.length === 0) {
        warnings.push('No variables found in FLVAR files');
        return { content: input };
      }
      
      // Convert to Writerside format
      const conversionOptions: VariableConversionOptions = {
        mode: variableOptions.variableMode || 'reference',
        format: 'writerside',
        variableFileName: variableOptions.variablesOutputPath ? 
          this.extractVariableFileName(variableOptions.variablesOutputPath) : 
          'v.list',
        nameConvention: variableOptions.nameConvention || 'original',
        instanceName: variableOptions.instanceName,
        prefix: variableOptions.variablePrefix,
        includePatterns: variableOptions.includePatterns,
        excludePatterns: variableOptions.excludePatterns
      };
      
      const writersideVariables = this.variableConverter.convertVariables(variables, conversionOptions);
      
      // Generate variables file
      let variablesFile: string | undefined;
      if (!variableOptions.skipFileGeneration) {
        const variableFileResult = this.variableConverter.generateWritersideFile(writersideVariables, conversionOptions);
        variablesFile = variableFileResult.content;
      }
      
      // Process variable references in content
      const processedContent = this.variableConverter.processVariableReferences(input, writersideVariables, conversionOptions);
      
      warnings.push(`Processed ${variables.length} variables from ${flvarFiles.length} FLVAR files`);
      
      return { content: processedContent, variablesFile };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warnings.push(`Variable processing failed: ${errorMessage}`);
      return { content: input };
    }
  }

  private extractVariableFileName(variablesOutputPath: string): string {
    try {
      // Add safety check for variablesOutputPath parameter
      if (!variablesOutputPath || typeof variablesOutputPath !== 'string') {
        return 'v.list';
      }
      
      const pathParts = variablesOutputPath.split('/');
      const fileName = pathParts[pathParts.length - 1]; // Get last part (filename)
      
      if (!fileName) {
        return 'v.list';
      }
      
      // Remove file extension and return, fallback to v.list if empty
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      return nameWithoutExt || 'v.list';
    } catch (error) {
      // If any error occurs during parsing, return default
      return 'v.list';
    }
  }

  private findProjectPath(inputPath: string): string | null {
    // Add safety check for inputPath parameter
    if (!inputPath || typeof inputPath !== 'string') {
      return null;
    }
    
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
   * Preprocess MadCap content but convert snippets to include references instead of merging content
   */
  private async preprocessWithSnippetIncludes(input: string, inputPath?: string): Promise<string> {
    // Parse as HTML first
    const dom = new JSDOM(input, { contentType: 'text/html' });
    const document = dom.window.document;

    // Find all MadCap snippet elements
    const snippetBlocks = Array.from(document.querySelectorAll('MadCap\\:snippetBlock, madcap\\:snippetblock'));
    const snippetTexts = Array.from(document.querySelectorAll('MadCap\\:snippetText, madcap\\:snippettext'));

    // Process snippet blocks
    for (const element of snippetBlocks) {
      const snippetSrc = element.getAttribute('src');
      if (snippetSrc) {
        // Convert .flsnp to .md and create include tag, use just filename
        const baseFileName = snippetSrc.replace(/\.flsnp$/i, '.md').split('/').pop() || '';
        const includePath = baseFileName;
        const includeElement = document.createElement('div');
        includeElement.className = 'writerside-include';
        includeElement.setAttribute('data-include-from', includePath);
        
        // Get any conditions for instance/filter attributes
        const conditions = element.getAttribute('data-mc-conditions');
        if (conditions) {
          includeElement.setAttribute('data-conditions', conditions);
        }
        
        element.parentNode?.replaceChild(includeElement, element);
      }
    }

    // Process snippet texts  
    for (const element of snippetTexts) {
      const snippetSrc = element.getAttribute('src');
      if (snippetSrc) {
        // Convert .flsnp to .md and create include tag, use just filename
        const baseFileName = snippetSrc.replace(/\.flsnp$/i, '.md').split('/').pop() || '';
        const includePath = baseFileName;
        const includeElement = document.createElement('span');
        includeElement.className = 'writerside-include-inline';
        includeElement.setAttribute('data-include-from', includePath);
        
        // Get any conditions
        const conditions = element.getAttribute('data-mc-conditions');
        if (conditions) {
          includeElement.setAttribute('data-conditions', conditions);
        }
        
        element.parentNode?.replaceChild(includeElement, element);
      }
    }

    // Continue with regular MadCap preprocessing for variables, conditions, etc.
    const processedHtml = await this.madcapPreprocessor.preprocessMadCapContent(document.documentElement.outerHTML, inputPath, 'writerside-markdown');
    
    return processedHtml;
  }

  private convertDomToMarkdown(element: Element, document: Document): string {
    let result = '';
    const children = Array.from(element.childNodes);
    
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      
      if (node.nodeType === document.TEXT_NODE) {
        // Handle text nodes - preserve ALL content including punctuation and spaces
        const rawText = node.textContent || '';
        if (rawText) { // Process any non-empty text content
          const text = this.cleanTextContent(rawText);
          result += this.escapeMarkdownText(text);
        }
      } else if (node.nodeType === document.ELEMENT_NODE) {
        const elem = node as Element;
        const elementMarkdown = this.convertElementToMarkdown(elem, document);
        
        // Special handling for elements that should have line breaks
        const tagName = elem.tagName.toLowerCase();
        if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ol', 'ul'].includes(tagName)) {
          // Check if we need to add spacing before this element
          if (result.trim() && !result.endsWith('\n\n')) {
            // Ensure proper spacing before block elements
            if (!result.endsWith('\n')) {
              result += '\n';
            }
          }
        }
        
        result += elementMarkdown;
      }
    }
    
    return result;
  }

  private convertElementToMarkdown(element: Element, document: Document): string {
    const tagName = element.tagName.toLowerCase();
    const content = this.convertDomToMarkdown(element, document);
    
    switch (tagName) {
      case 'h1':
        return this.formatHeading(1, content.trim());
      case 'h2':
        return this.formatHeading(2, content.trim());
      case 'h3':
        return this.formatHeading(3, content.trim());
      case 'h4':
        return this.formatHeading(4, content.trim());
      case 'h5':
        return this.formatHeading(5, content.trim());
      case 'h6':
        return this.formatHeading(6, content.trim());
        
      case 'p':
        return this.handleParagraph(element, content, document);
        
      case 'i':
      case 'em':
        return this.handleEmphasis(element, content); // Don't trim - preserve spacing
        
      case 'b':
      case 'strong':
        return this.handleStrong(element, content); // Don't trim - preserve spacing
        
      case 'code':
        return '`' + content.trim() + '`';
        
      case 'a':
        return this.handleLink(element, content);
        
      case 'img':
        return this.handleImage(element);
        
      case 'ol':
        return this.handleMixedOrderedList(element, document);
        
      case 'ul':
        return this.handleUnorderedList(element, document);
        
      case 'li':
        return content; // Handled by parent list
        
      case 'div':
        return this.handleDiv(element, content, document);
        
      case 'span':
        return this.handleSpan(element, content);
        
      case 'br':
        return '  \n'; // CommonMark hard line break
        
      case 'hr':
        return '\n---\n\n';
        
      case 'blockquote':
        return this.handleBlockquote(content);
        
      case 'pre':
        return this.handleCodeBlock(element, content);
        
      case 'table':
        return this.handleTable(element, document);
        
      // Handle MadCap variable elements
      case 'madcap:variable':
        return this.handleMadCapVariable(element);
        
      // Handle processed variable elements
      case 'var':
        return this.handleMadCapVariable(element);
        
      default:
        return content;
    }
  }

  private formatHeading(level: number, content: string): string {
    const hashes = '#'.repeat(level);
    // Ensure consistent spacing with double newlines after headings
    // The post-processing will handle spacing before headings
    return `${hashes} ${content}\n\n`;
  }

  private handleParagraph(element: Element, content: string, document: Document): string {
    const images = element.querySelectorAll('img');
    
    // Check if paragraph contains only an image (block image)
    if (images.length === 1 && this.isImageOnlyParagraph(element, images[0])) {
      return `\n${content.trim()}\n\n`;
    }
    
    // Handle paragraphs with mixed text and images - separate them properly
    if (images.length > 0) {
      return this.handleMixedTextAndImages(element, document);
    }
    
    // Check if this paragraph is an admonition pattern
    const trimmedContent = content.trim();
    const admonitionType = this.detectAdmonitionType(trimmedContent);
    if (admonitionType) {
      const cleanedContent = this.cleanAdmonitionContent(trimmedContent, admonitionType);
      return this.createWritersideAdmonition(admonitionType, cleanedContent);
    }
    
    // Enhanced paragraph processing with context awareness
    const cleanContent = content.replace(/^\n+|\n+$/g, '').trim();
    if (!cleanContent) return '';
    
    // Check if this paragraph is within a list item - if so, don't add extra line breaks
    const parentElement = element.parentElement;
    const isInListItem = parentElement && parentElement.tagName.toLowerCase() === 'li';
    
    if (isInListItem) {
      // Just return the content without extra line breaks for list item content
      return cleanContent;
    }
    
    // Regular paragraph - ensure proper boundaries
    return `${cleanContent}\n\n`;
  }

  private handleMixedTextAndImages(element: Element, document: Document): string {
    let result = '';
    let textBuffer = '';
    
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === document.TEXT_NODE) {
        const text = this.cleanTextContent(node.textContent || '');
        if (text.trim()) {
          textBuffer += this.escapeMarkdownText(text);
        }
      } else if (node.nodeType === document.ELEMENT_NODE) {
        const elem = node as Element;
        
        if (elem.tagName.toLowerCase() === 'img') {
          const imageMarkdown = this.handleImage(elem);
          
          // Check if this is an inline image (icon)
          if (this.isInlineImage(elem)) {
            // Keep inline images in the text buffer
            textBuffer += imageMarkdown;
          } else {
            // Flush any accumulated text first for block images
            if (textBuffer.trim()) {
              result += `${textBuffer.trim()}\n\n`;
              textBuffer = '';
            }
            
            // Add the image as a block element
            const blockImage = imageMarkdown.replace(/^\n?(.+?)\n*$/s, '\n$1\n\n');
            result += blockImage;
          }
        } else {
          // Other elements (spans, links, etc.) go into text buffer
          textBuffer += this.convertElementToMarkdown(elem, document);
        }
      }
    }
    
    // Flush any remaining text
    if (textBuffer.trim()) {
      result += `${textBuffer.trim()}\n\n`;
    }
    
    return result;
  }

  private handleLink(element: Element, content: string): string {
    const href = element.getAttribute('href') || '';
    const title = element.getAttribute('title');
    
    if (!href) {
      return content;
    }
    
    // Adjust link path for Writerside structure
    const adjustedHref = this.adjustLinkPathForWriterside(href);
    
    // CommonMark link syntax with optional title
    if (title) {
      return `[${content.trim()}](${adjustedHref} "${title}")`;
    }
    return `[${content.trim()}](${adjustedHref})`;
  }

  private handleImage(element: Element): string {
    let src = element.getAttribute('src') || '';
    const alt = element.getAttribute('alt') || '';
    const title = element.getAttribute('title');
    
    // Adjust image paths for Writerside project structure
    src = this.adjustImagePathForWriterside(src);
    
    // Don't escape URLs - they should remain as-is for proper linking
    // Only escape alt text if it contains special characters
    const escapedAlt = (alt || '').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    
    // Determine if inline or block based on Writerside rules
    const isInline = this.isInlineImage(element);
    
    // Build CommonMark image syntax
    let imageMarkdown = title ? 
      `![${escapedAlt}](${src} "${title}")` : 
      `![${escapedAlt}](${src})`;
    
    // Add Writerside styling attributes if needed
    if (isInline && this.needsInlineStyle(element)) {
      imageMarkdown += '{style="inline"}';
    } else if (!isInline && this.needsBlockStyle(element)) {
      imageMarkdown += '{style="block"}';
    }
    
    // For inline images, return without extra spacing
    // For block images, add proper spacing
    return isInline ? imageMarkdown : imageMarkdown;
  }
  
  private adjustLinkPathForWriterside(href: string): string {
    // Skip external URLs and anchors
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('#')) {
      return href;
    }
    
    // Extract anchor/fragment if present
    const [path, fragment] = href.split('#');
    const fragmentSuffix = fragment ? `#${fragment}` : '';
    
    // Convert .htm/.html to .md and handle spaces in paths
    let cleanPath = path.replace(/\.html?$/i, '.md');
    
    // Handle different MadCap path patterns and convert to Writerside structure:
    
    // 1. Parent directory references (../) - preserve them with space-to-hyphen conversion
    if (path.startsWith('../')) {
      // Keep the relative structure, ensure .md extension, and convert spaces to hyphens
      cleanPath = cleanPath.replace(/\s+/g, '-');
      return cleanPath + fragmentSuffix;
    }
    
    // 2. Relative paths that should stay relative (same directory or subdirectory)
    if (!cleanPath.includes('/') || cleanPath.startsWith('./')) {
      // Simple filename or same directory reference, convert spaces to hyphens
      cleanPath = cleanPath.replace(/^\.\//, '').replace(/\s+/g, '-');
      return cleanPath + fragmentSuffix;
    }
    
    // Remove leading slashes for absolute-style paths
    cleanPath = cleanPath.replace(/^\/+/, '');
    
    // 3. Absolute-style paths from MadCap Content directory structure
    // Convert Content/folder/file.htm to folder/file.md
    if (cleanPath.match(/^Content\//i)) {
      cleanPath = cleanPath.replace(/^Content\//i, '');
    }
    
    // 4. For paths that navigate to different sections, preserve directory structure
    // Example: "02 Planung/01-04-1 FilterGroupAct.html" should become "02-Planung/01-04-1-FilterGroupAct.md"
    // Replace spaces and special characters for Writerside compatibility
    cleanPath = cleanPath
      .replace(/\s+/g, '-')  // Spaces to hyphens
      .replace(/[^a-zA-Z0-9\-_\/\.]/g, '')  // Remove special chars except path separators
      .replace(/\/-/g, '-')  // Convert /- to -
      .replace(/-\//g, '-'); // Convert -/ to -
    
    return cleanPath + fragmentSuffix;
  }

  private adjustImagePathForWriterside(src: string): string {
    // Skip external URLs and data URIs
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return src;
    }
    
    // DEBUG: Log the transformation
    
    // Writerside expects paths like: ../images/Images/[rest of path]
    // This preserves the original "Images" folder structure
    
    // Remove leading slashes and relative path prefixes
    let cleanPath = src.replace(/^\/+/, '').replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
    
    let result: string;
    
    // Handle different patterns:
    // 1. Already has images/Images/ -> just add ../
    if (cleanPath.startsWith('images/Images/')) {
      result = '../' + cleanPath;
      return result;
    }
    
    // 2. Has lowercase images/ but not Images/ -> add ../images/Images/
    if (cleanPath.startsWith('images/') && !cleanPath.includes('/Images/')) {
      // Extract the part after images/
      const afterImages = cleanPath.substring(7); // Skip "images/"
      result = '../images/Images/' + afterImages;
      return result;
    }
    
    // 3. Starts with Images/ -> add ../images/ prefix
    if (cleanPath.match(/^Images\//i)) {
      result = '../images/' + cleanPath;
      return result;
    }
    
    // 4. Has Resources/Images/ -> convert to ../images/Images/
    if (cleanPath.match(/^(Content\/)?Resources\/Images\//i)) {
      const afterImages = cleanPath.replace(/^(Content\/)?Resources\/Images\//i, '');
      result = '../images/Images/' + afterImages;
      return result;
    }
    
    // 5. Default case - assume it should be in ../images/Images/
    result = '../images/Images/' + cleanPath;
    return result;
  }

  private handleMadCapVariable(element: Element): string {
    const variableName = element.getAttribute('name');
    if (variableName) {
      // Strip namespace prefix (e.g., "General.CompanyName" -> "CompanyName")
      const cleanVariableName = variableName.includes('.') ? 
        variableName.split('.').pop() || variableName : 
        variableName;
      
      // Convert MadCap variable to Writerside format
      return `<var name="${cleanVariableName}"/>`;
    }
    // Fallback if no name attribute
    return '';
  }

  private handleMixedOrderedList(element: Element, document: Document): string {
    let result = '';
    let listItemNumber = 1;
    
    // Process all children in DOM order, maintaining proper separation and numbering
    const children = Array.from(element.children);
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const tagName = child.tagName.toLowerCase();
      
      if (tagName === 'li') {
        // Process list item content directly, avoiding paragraph wrapper issues
        let listItemText = '';
        
        // Extract text content from the list item, handling nested elements properly
        const paragraphElements = Array.from(child.querySelectorAll('p'));
        
        if (paragraphElements.length > 1) {
          // Multiple paragraphs in list item - handle them as separate blocks
          for (let j = 0; j < paragraphElements.length; j++) {
            const para = paragraphElements[j];
            const paraContent = this.convertDomToMarkdown(para, document).trim();
            if (paraContent) {
              if (j === 0) {
                // First paragraph - this is the main list item, apply punctuation logic
                let firstParaContent = paraContent;
                if (firstParaContent && !firstParaContent.match(/[.!?;:]$/)) {
                  const words = firstParaContent.split(/\s+/);
                  const isCompleteSentence = words.length >= 2 && 
                                           /^[A-Z]/.test(firstParaContent) && 
                                           /[a-z]/i.test(firstParaContent) &&
                                           !firstParaContent.match(/^(Note|Tip|Warning|Caution):/i) &&
                                           !firstParaContent.match(/^(e\.g\.|i\.e\.|etc\.)$/i) &&
                                           !firstParaContent.match(/^(vs\.|cf\.|et al\.)$/i);
                  if (isCompleteSentence) {
                    firstParaContent += '.';
                  }
                }
                listItemText += firstParaContent;
              } else {
                // Additional paragraphs - treat as continuation or separate content
                listItemText += `\n\n${paraContent}`;
              }
            }
          }
        } else {
          // Single or no paragraphs - use existing logic
          for (const childNode of Array.from(child.childNodes)) {
            if (childNode.nodeType === document.TEXT_NODE) {
              const text = this.cleanTextContent(childNode.textContent || '');
              if (text.trim()) {
                listItemText += this.escapeMarkdownText(text);
              }
            } else if (childNode.nodeType === document.ELEMENT_NODE) {
              const elem = childNode as Element;
              // Process child elements but don't add extra paragraph breaks
              const elemContent = this.convertElementToMarkdown(elem, document);
              listItemText += elemContent;
            }
          }
        }
        
        const cleanItemText = listItemText.trim();
        if (cleanItemText) {
          // Check if list item should end with punctuation
          let finalItemText = cleanItemText;
          if (finalItemText && !finalItemText.match(/[.!?;:]$/)) {
            // Check if it appears to be a complete sentence
            const words = finalItemText.split(/\s+/);
            // More lenient check - 2+ words starting with a capital letter or verb
            const isCompleteSentence = words.length >= 2 && 
                                       /^[A-Z]/.test(finalItemText) && // Starts with capital
                                       /[a-z]/i.test(finalItemText) &&
                                       !finalItemText.match(/^(Note|Tip|Warning|Caution):/i) &&
                                       !finalItemText.match(/^(e\.g\.|i\.e\.|etc\.)$/i) &&
                                       !finalItemText.match(/^(vs\.|cf\.|et al\.)$/i);
            if (isCompleteSentence) {
              finalItemText += '.';
            }
          }
          
          // Ensure proper spacing before list item
          if (result.trim() && !result.endsWith('\n\n')) {
            result += '\n';
          }
          result += `${listItemNumber}. ${finalItemText}\n\n`;
          listItemNumber++;
        }
      } else {
        // Orphaned content (paragraphs, divs, etc.) - treat as standalone blocks
        const orphanedContent = this.convertElementToMarkdown(child, document).trim();
        if (orphanedContent) {
          // Ensure proper spacing before orphaned content - always add double newline for separation
          if (result.trim() && !result.endsWith('\n\n')) {
            result += '\n\n';
          }
          result += `${orphanedContent}\n\n`;
        }
      }
    }
    
    // Ensure proper spacing after list - use trimEnd to preserve structure
    return result.trimEnd() + '\n\n\n'; // Extra newline for better separation from following content
  }
  
  private generateOrderedListFromItems(items: Element[], startNum: number, document: Document): string {
    let result = '\n';
    
    items.forEach((item, index) => {
      const marker = `${startNum + index}.`;
      const itemResult = this.handleListItem(item, document, marker, 0);
      result += itemResult;
    });
    
    return result + '\n';
  }

  private handleOrderedList(element: Element, document: Document, indentLevel: number = 0): string {
    let result = indentLevel === 0 ? '\n' : '';
    let startNum = 1;
    let listItemIndex = 0;
    
    // Check for start attribute (CommonMark supports this)
    const startAttr = element.getAttribute('start');
    if (startAttr) {
      startNum = parseInt(startAttr, 10) || 1;
    }
    
    // Only process actual <li> elements - ignore orphaned content
    const listItems = Array.from(element.children).filter(child => 
      child.tagName.toLowerCase() === 'li'
    );
    
    listItems.forEach((listItem) => {
      let marker: string;
      if (indentLevel === 0) {
        // Top-level: use numbers (1., 2., 3.)
        marker = `${startNum + listItemIndex}.`;
      } else {
        // Sub-levels: use lowercase letters (a., b., c.)
        const letterIndex = listItemIndex % 26;
        const letter = String.fromCharCode(97 + letterIndex); // 'a' + index
        marker = `${letter}.`;
      }
      
      const itemResult = this.handleListItem(listItem, document, marker, indentLevel);
      result += itemResult;
      listItemIndex++;
    });
    
    return indentLevel === 0 ? result + '\n' : result;
  }

  private handleUnorderedList(element: Element, document: Document, indentLevel: number = 0): string {
    const items = Array.from(element.children).filter(child => 
      child.tagName.toLowerCase() === 'li'
    );
    
    let result = indentLevel === 0 ? '\n' : '';
    
    items.forEach((item) => {
      const itemResult = this.handleListItem(item, document, '-', indentLevel);
      result += itemResult;
    });
    
    return indentLevel === 0 ? result + '\n' : result;
  }

  private handleListItem(item: Element, document: Document, marker: string, indentLevel: number): string {
    const indent = '    '.repeat(indentLevel); // 4 spaces per level
    let result = '';
    let textContent = '';
    let hasNestedLists = false;
    
    // Process child nodes to separate text content from nested lists
    for (const node of Array.from(item.childNodes)) {
      if (node.nodeType === document.TEXT_NODE) {
        const text = this.cleanTextContent(node.textContent || '');
        if (text.trim()) {
          textContent += this.escapeMarkdownText(text);
        }
      } else if (node.nodeType === document.ELEMENT_NODE) {
        const elem = node as Element;
        const tagName = elem.tagName.toLowerCase();
        
        if (tagName === 'ol' || tagName === 'ul') {
          // Handle nested lists
          hasNestedLists = true;
          
          // Flush any accumulated text first
          if (textContent.trim()) {
            result += `${indent}${marker} ${textContent.trim()}\n`;
            textContent = '';
          }
          
          // Process nested list with increased indentation
          if (tagName === 'ol') {
            const nestedList = this.handleOrderedList(elem, document, indentLevel + 1);
            result += this.indentText(nestedList, indent);
          } else {
            const nestedList = this.handleUnorderedList(elem, document, indentLevel + 1);
            result += this.indentText(nestedList, indent);
          }
        } else {
          // Other elements (spans, links, etc.) go into text content
          textContent += this.convertElementToMarkdown(elem, document);
        }
      }
    }
    
    // Handle remaining text content
    if (textContent.trim()) {
      if (hasNestedLists) {
        // If we already have nested lists, add as continuation
        result += `${indent}    ${textContent.trim()}\n`;
      } else {
        // Simple list item
        result += `${indent}${marker} ${textContent.trim()}\n`;
      }
    }
    
    return result;
  }
  
  private indentText(text: string, baseIndent: string): string {
    return text.split('\n').map(line => 
      line.trim() ? `${baseIndent}${line}` : line
    ).join('\n');
  }

  private handleDiv(element: Element, content: string, document: Document): string {
    const className = element.className || '';
    const writersideOptions = this.currentOptions?.writersideOptions;
    
    // Handle MadCap snippet elements (data-mc-snippet attribute)
    const snippetSrc = element.getAttribute('data-mc-snippet');
    if (snippetSrc) {
      return this.handleSnippetElement(element, snippetSrc, content);
    }
    
    // Handle Writerside procedure blocks (when enableProcedureBlocks is true)
    if (writersideOptions?.enableProcedureBlocks && 
        (className.includes('mc-procedure') || className.includes('procedure'))) {
      return this.createWritersideProcedure(element, document);
    }
    
    // Handle Writerside collapsible blocks (when enableCollapsibleBlocks is true)  
    if (writersideOptions?.enableCollapsibleBlocks &&
        (className.includes('mc-dropdown') || className.includes('collapsible'))) {
      return this.createWritersideCollapsible(element, document);
    }
    
    // Handle Writerside tab groups (when enableTabs is true)
    if (writersideOptions?.enableTabs &&
        (className.includes('mc-tabs') || className.includes('tabs'))) {
      return this.createWritersideTabs(element, document);
    }
    
    // Handle Writerside semantic admonitions (when enableSemanticMarkup is true)
    if (writersideOptions?.enableSemanticMarkup) {
      if (className.includes('note') || className.includes('mc-note')) {
        return this.createWritersideSemanticAdmonition(element, 'note', document);
      }
      
      if (className.includes('warning') || className.includes('mc-warning')) {
        return this.createWritersideSemanticAdmonition(element, 'warning', document);
      }
      
      if (className.includes('tip') || className.includes('mc-tip')) {
        return this.createWritersideSemanticAdmonition(element, 'tip', document);
      }
    } else {
      // Fallback to regular admonitions when semantic markup is disabled
      if (className.includes('note') || className.includes('mc-note')) {
        return this.createWritersideAdmonitionFromDiv(element, 'note', document);
      }
      
      if (className.includes('warning') || className.includes('mc-warning')) {
        return this.createWritersideAdmonitionFromDiv(element, 'warning', document);
      }
      
      if (className.includes('tip') || className.includes('mc-tip')) {
        return this.createWritersideAdmonitionFromDiv(element, 'tip', document);
      }
    }
    
    // Handle Writerside include elements (when mergeSnippets is enabled)
    if (className.includes('writerside-include')) {
      const includePath = element.getAttribute('data-include-from');
      const conditions = element.getAttribute('data-conditions');
      
      if (includePath) {
        if (conditions) {
          const includeResult = this.madcapConverter.convertSnippetInclude(includePath, [conditions]);
          return `\n${includeResult}\n\n`;
        } else {
          return `\n<include from="${includePath}"/>\n\n`;
        }
      }
    }
    
    // Regular div - just return content
    return content;
  }

  private handleSpan(element: Element, content: string): string {
    const className = element.className || '';
    const trimmedContent = content.trim();
    
    // Handle Writerside inline include elements (when mergeSnippets is enabled)
    if (className.includes('writerside-include-inline')) {
      const includePath = element.getAttribute('data-include-from');
      const conditions = element.getAttribute('data-conditions');
      
      if (includePath) {
        if (conditions) {
          return this.madcapConverter.convertSnippetInclude(includePath, [conditions]);
        } else {
          return `<include from="${includePath}"/>`;
        }
      }
    }
    
    // Check if this span should be formatted as inline code
    if (this.shouldFormatAsInlineCode(element, trimmedContent)) {
      return '`' + trimmedContent + '`';
    }
    
    // Handle special MadCap span classes for emphasis
    if (className.includes('noteInDiv') || className.includes('warningInDiv') || className.includes('tipInDiv')) {
      return `**${trimmedContent}**`;
    }
    
    return content;
  }

  private shouldFormatAsInlineCode(element: Element, content: string): boolean {
    const className = element.className || '';
    const lowercaseContent = content.toLowerCase();
    
    // 1. MadCap-specific classes for code formatting
    if (className.includes('Keyboard') || 
        className.includes('Code') || 
        className.includes('Monospace') ||
        className.includes('keyboard') ||
        className.includes('code')) {
      return true;
    }
    
    // 2. UI Element patterns
    const uiPatterns = [
      // Button patterns
      /^(ok|cancel|save|delete|edit|create|new|add|remove|close|open|start|stop|play|pause|next|previous|back|forward|submit|apply|reset|clear|refresh|reload|update|upgrade|download|upload|import|export|print|preview|search|find|replace|copy|paste|cut|undo|redo)$/i,
      
      // Menu/Tab patterns  
      /^(file|edit|view|tools|help|settings|preferences|options|configuration|config|admin|administrator|home|dashboard|profile|account|login|logout|sign in|sign out)$/i,
      
      // Dialog/Window patterns
      /^(dialog|window|popup|modal|alert|confirm|prompt|notification|message|warning|error|info|success)$/i,
      
      // Form elements
      /^(textbox|text box|dropdown|drop-down|checkbox|check box|radio button|button|field|input|textarea|select|option|label|placeholder)$/i
    ];
    
    // 3. Keyboard shortcuts and key combinations
    const keyboardPatterns = [
      // Single keys
      /^(ctrl|alt|shift|cmd|command|meta|win|windows|fn|tab|enter|return|space|spacebar|backspace|delete|del|insert|ins|home|end|pageup|pagedown|pgup|pgdn|up|down|left|right|esc|escape|f1|f2|f3|f4|f5|f6|f7|f8|f9|f10|f11|f12)$/i,
      
      // Key combinations (with common separators)
      /^(ctrl|alt|shift|cmd|command)\s*[\+\-]\s*[a-z0-9]/i,
      /^[a-z0-9]\s*[\+\-]\s*(ctrl|alt|shift|cmd|command)/i,
      
      // Multiple key combinations
      /^(ctrl|alt|shift|cmd|command)\s*[\+\-]\s*(ctrl|alt|shift|cmd|command)\s*[\+\-]\s*[a-z0-9]/i,
      
      // Function keys with modifiers
      /^(ctrl|alt|shift|cmd|command)\s*[\+\-]\s*f\d{1,2}$/i
    ];
    
    // 4. Technical terms and codes
    const technicalPatterns = [
      // API/HTTP patterns
      /^(get|post|put|delete|patch|head|options|http|https|api|rest|json|xml|html|css|js|javascript|sql|url|uri|id|uuid|guid)$/i,
      
      // File/Path patterns
      /^[a-z0-9_-]+\.(exe|dll|bat|cmd|sh|ps1|py|js|css|html|htm|php|asp|aspx|jsp|xml|json|txt|log|ini|cfg|conf|config)$/i,
      /^[a-z]:\\/i, // Windows paths
      /^\/[a-z0-9_/-]+/i, // Unix paths (starting with /)
      
      // Version numbers
      /^v?\d+\.\d+(\.\d+)?(\.\d+)?$/i,
      
      // Hex codes/IDs
      /^[a-f0-9]{6,}$/i,
      
      // Configuration values
      /^(true|false|null|undefined|none|auto|default|enabled|disabled|on|off|yes|no|0|1)$/i
    ];
    
    // 5. Brackets/parentheses indicate UI elements or parameters
    if (/^\[.*\]$/.test(content) || /^\(.*\)$/.test(content)) {
      return true;
    }
    
    // 6. All caps with underscores (constants/settings)
    if (/^[A-Z][A-Z0-9_]*$/.test(content) && content.length > 2) {
      return true;
    }
    
    // Test against all patterns
    const allPatterns = [...uiPatterns, ...keyboardPatterns, ...technicalPatterns];
    return allPatterns.some(pattern => pattern.test(content));
  }

  private handleBlockquote(content: string): string {
    const trimmedContent = content.trim();
    
    // Check if this is an admonition pattern
    const admonitionType = this.detectAdmonitionType(trimmedContent);
    if (admonitionType) {
      const cleanedContent = this.cleanAdmonitionContent(trimmedContent, admonitionType);
      return this.createWritersideAdmonition(admonitionType, cleanedContent);
    }
    
    // Regular blockquote with CommonMark line prefixing
    const lines = trimmedContent.split('\n');
    const quotedLines = lines.map(line => `> ${line.trim()}`).join('\n');
    return `\n${quotedLines}\n\n`;
  }

  private detectAdmonitionType(content: string): 'note' | 'tip' | 'warning' | null {
    // Add safety check for content parameter
    if (!content || typeof content !== 'string') {
      return null;
    }
    
    // Don't treat content that starts with markdown emphasis as admonitions
    // This prevents **Important:** from being detected as an admonition
    if (/^\s*\*\*/.test(content) || /^\s*\*[^*]/.test(content)) {
      return null;
    }
    
    // Remove any leading whitespace and normalize
    const cleanContent = content.replace(/^\s*/, '').toLowerCase();
    
    // Define admonition patterns with their types
    const admonitionPatterns = [
      { pattern: /^note\s*:/, type: 'note' as const },
      { pattern: /^info\s*:/, type: 'note' as const },
      { pattern: /^information\s*:/, type: 'note' as const },
      { pattern: /^tip\s*:/, type: 'tip' as const },
      { pattern: /^hint\s*:/, type: 'tip' as const },
      { pattern: /^warning\s*:/, type: 'warning' as const },
      { pattern: /^caution\s*:/, type: 'warning' as const },
      { pattern: /^important\s*:/, type: 'warning' as const },
      { pattern: /^alert\s*:/, type: 'warning' as const }
    ];
    
    // Check each pattern
    for (const { pattern, type } of admonitionPatterns) {
      if (pattern.test(cleanContent)) {
        return type;
      }
    }
    
    return null;
  }

  private cleanAdmonitionContent(content: string, type: 'note' | 'tip' | 'warning'): string {
    // Add safety check for content parameter
    if (!content || typeof content !== 'string') {
      return content || '';
    }
    
    // Remove the admonition keyword and any formatting
    let cleaned = content;
    
    // Create regex pattern to match the detected type with various formatting
    const typePatterns = [
      `\\*\\s*\\*\\s*${type}\\s*:\\s*\\*\\s*\\*`,  // * *Note:* *
      `\\*\\*${type}\\*\\*\\s*:`,  // **Note:**
      `\\*${type}\\*\\s*:`,        // *Note:*
      `${type}\\s*:`,              // Note:
      `\\*\\*${type.toUpperCase()}\\*\\*\\s*:`,  // **NOTE:**
      `\\*${type.toUpperCase()}\\*\\s*:`,        // *NOTE:*
      `${type.toUpperCase()}\\s*:`               // NOTE:
    ];
    
    // Try each pattern and remove the first match
    for (const pattern of typePatterns) {
      const regex = new RegExp(`^\\s*${pattern}\\s*`, 'i');
      if (regex.test(cleaned)) {
        cleaned = cleaned.replace(regex, '').trim();
        break;
      }
    }
    
    return cleaned;
  }

  private handleCodeBlock(element: Element, content: string): string {
    // Check for language specification
    const codeElement = element.querySelector('code');
    const lang = element.getAttribute('data-language') || 
                 codeElement?.className?.match(/language-(\w+)/)?.[1] ||
                 (element.className || '').match(/language-(\w+)/)?.[1];
    
    // CommonMark fenced code block
    const cleanContent = content.trim();
    if (lang) {
      return '\n```' + lang + '\n' + cleanContent + '\n```\n\n';
    }
    return '\n```\n' + cleanContent + '\n```\n\n';
  }

  private handleTable(element: Element, document: Document): string {
    const rows = Array.from(element.querySelectorAll('tr'));
    if (rows.length === 0) return '';
    
    let result = '\n';
    
    // Process header row
    const headerRow = rows[0];
    const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
    const headerContent = headerCells.map(cell => 
      this.convertDomToMarkdown(cell, document).trim()
    );
    
    result += `| ${headerContent.join(' | ')} |\n`;
    
    // Add separator row (CommonMark table requirement)
    const separator = headerCells.map(() => '---').join(' | ');
    result += `| ${separator} |\n`;
    
    // Process data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = Array.from(row.querySelectorAll('td, th'));
      const cellContent = cells.map(cell => 
        this.convertDomToMarkdown(cell, document).trim()
      );
      
      result += `| ${cellContent.join(' | ')} |\n`;
    }
    
    return result + '\n';
  }

  private createWritersideAdmonition(type: 'note' | 'tip' | 'warning', content: string): string {
    // Use proper Writerside blockquote syntax with style attribute
    const cleanContent = content.trim();
    
    // Remove any existing **Note:** or similar prefixes that might cause duplicates
    const cleanedContent = cleanContent.replace(/^\s*\*\*\s*(Note|Tip|Warning|Info|Important|Caution)\s*:\*\*\s*/i, '');
    
    const lines = cleanedContent.split('\n');
    const quotedLines = lines.map(line => line.trim() ? `> ${line.trim()}` : '>').join('\n');
    return `\n${quotedLines}\n{style="${type}"}\n\n`;
  }

  private createWritersideAdmonitionFromDiv(element: Element, type: 'note' | 'tip' | 'warning', document: Document): string {
    // Extract title from span with warningInDiv/noteInDiv/tipInDiv class
    const titleSpan = element.querySelector('.warningInDiv, .noteInDiv, .tipInDiv');
    let title = '';
    let content = '';
    
    if (titleSpan) {
      title = this.cleanTextContent(titleSpan.textContent || '').trim();
      // Remove the entire paragraph containing the title span to get the rest of the content
      const clone = element.cloneNode(true) as Element;
      const titleSpanClone = clone.querySelector('.warningInDiv, .noteInDiv, .tipInDiv');
      if (titleSpanClone && titleSpanClone.parentNode) {
        // Remove the parent paragraph, not just the span
        const titleParagraph = titleSpanClone.parentNode;
        if (titleParagraph && titleParagraph.parentNode) {
          titleParagraph.parentNode.removeChild(titleParagraph);
        }
      }
      content = this.convertDomToMarkdown(clone, document).trim();
      
    } else {
      // No title span, use all content
      content = this.convertDomToMarkdown(element, document).trim();
    }
    
    // Build the admonition content with proper blockquote structure
    let admonitionLines: string[] = [];
    
    if (title) {
      admonitionLines.push(`> **${title}**`);
      // Always ensure empty line between title and content
      if (content && content.trim()) {
        admonitionLines.push(`>`); // Empty line in blockquote
      }
    }
    
    if (content && content.trim()) {
      // Split content into paragraphs and process each with proper spacing
      const contentParagraphs = content.split('\n\n').filter(p => p.trim());
      contentParagraphs.forEach((paragraph, index) => {
        // Add empty line between content paragraphs (but not before first one if we have title)
        if (index > 0 || (!title)) {
          if (index > 0) {
            admonitionLines.push(`>`); // Empty line between paragraphs
          }
        }
        
        const lines = paragraph.split('\n');
        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed) {
            admonitionLines.push(`> ${trimmed}`);
          }
        });
      });
    }
    
    const blockquote = admonitionLines.join('\n');
    return `\n${blockquote}\n{style="${type}"}\n\n`;
  }

  private isInlineImage(element: Element): boolean {
    // Writerside rules: ≤32px images are inline by default
    const width = element.getAttribute('width');
    const height = element.getAttribute('height');
    
    if (width && parseInt(width) <= 32) return true;
    if (height && parseInt(height) <= 32) return true;
    
    // Check for explicit inline class
    if (element.classList.contains('IconInline')) {
      return true;
    }
    
    return false;
  }

  private needsInlineStyle(element: Element): boolean {
    // Check if we need to explicitly mark as inline
    const width = element.getAttribute('width');
    const height = element.getAttribute('height');
    
    return Boolean((width && parseInt(width) > 32) || (height && parseInt(height) > 32));
  }

  private needsBlockStyle(element: Element): boolean {
    // Check if we need to explicitly mark as block
    const width = element.getAttribute('width');
    const height = element.getAttribute('height');
    
    return Boolean((width && parseInt(width) <= 32) || (height && parseInt(height) <= 32));
  }

  private isImageOnlyParagraph(paragraph: Element, image: Element): boolean {
    // Check if paragraph contains only the image and whitespace
    const textContent = paragraph.textContent?.trim() || '';
    const altText = (image.getAttribute('alt') || '').trim();
    
    return textContent === altText || textContent === '';
  }

  private isLooseListItem(item: Element): boolean {
    // Check if list item contains multiple block elements or blank lines
    const blockElements = item.querySelectorAll('p, div, blockquote, pre, ol, ul');
    return blockElements.length > 1;
  }

  private splitIntoParagraphs(content: string): string[] {
    return content.split('\n\n').filter(p => p.trim().length > 0);
  }

  private handleEmphasis(element: Element, content: string): string {
    // Clean content but preserve internal spacing
    const cleanContent = content.replace(/^\s+|\s+$/g, '');
    if (!cleanContent) return '';
    
    // Check what follows the emphasis element
    const nextSibling = element.nextSibling;
    const nextChar = nextSibling?.textContent?.charAt(0) || '';
    const isPunctuationNext = /^[.!?;:,\)\]}>]/.test(nextChar);
    
    // Add leading space if needed
    const needsLeadingSpace = this.needsLeadingSpace(element);
    // Don't add trailing space if followed by punctuation
    const needsTrailingSpace = !isPunctuationNext && this.needsTrailingSpace(element);
    
    let result = `*${cleanContent}*`;
    if (needsLeadingSpace) result = ' ' + result;
    if (needsTrailingSpace) result += ' ';
    
    return result;
  }

  private handleStrong(element: Element, content: string): string {
    // Clean content but preserve internal spacing
    const cleanContent = content.replace(/^\s+|\s+$/g, '');
    if (!cleanContent) return '';
    
    // Check spacing context more comprehensively
    const needsLeadingSpace = this.needsLeadingSpace(element);
    const needsTrailingSpace = this.needsTrailingSpace(element);
    
    // Build strong emphasis with proper spacing
    let result = `**${cleanContent}**`;
    
    if (needsLeadingSpace) {
      result = ' ' + result;
    }
    if (needsTrailingSpace) {
      result += ' ';
    }
    
    return result;
  }

  private needsLeadingSpace(element: Element): boolean {
    const prevSibling = element.previousSibling;
    if (!prevSibling) return false;
    
    if (prevSibling.nodeType === 3) { // TEXT_NODE
      const text = prevSibling.textContent || '';
      // Need space if previous text doesn't end with whitespace
      return !text.endsWith(' ') && text.length > 0;
    }
    
    // Always add space after other elements
    return true;
  }
  
  private needsTrailingSpace(element: Element): boolean {
    const nextSibling = element.nextSibling;
    if (!nextSibling) return false;
    
    if (nextSibling.nodeType === 3) { // TEXT_NODE
      const text = nextSibling.textContent || '';
      // Need space if next text doesn't start with whitespace or punctuation
      return !text.startsWith(' ') && !/^[.!?;:,\)\]}>]/.test(text) && text.length > 0;
    }
    
    // Always add space before other elements
    return true;
  }

  private cleanTextContent(text: string): string {
    // Add null/undefined safety check
    if (!text || typeof text !== 'string') {
      return text || '';
    }
    
    let cleaned = text;
    
    // Decode common HTML entities manually (avoid JSDOM overhead)
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
    
    // Clean up special Unicode spaces but preserve regular spaces
    cleaned = cleaned
      .replace(/\u00A0/g, ' ')  // Non-breaking space to regular space
      .replace(/\u2009/g, ' ')  // Thin space to regular space
      .replace(/\u200B/g, '')   // Zero-width space
      .replace(/\t/g, ' ');     // Tabs to spaces
      
    // Only collapse excessive whitespace (3+ consecutive spaces), preserve single/double spaces
    cleaned = cleaned.replace(/   +/g, ' ');
      
    // Don't trim text content to preserve spacing around elements
    // Only remove leading/trailing line breaks, preserve spaces
    return cleaned.replace(/^\n+|\n+$/g, '');
  }

  private escapeMarkdownText(text: string): string {
    // Add null/undefined safety check
    if (!text || typeof text !== 'string') {
      return text || '';
    }
    
    // Only escape the most essential CommonMark special characters
    // Avoid escaping parentheses, periods, and other characters that are common in paths/URLs
    return text
      .replace(/\\/g, '\\\\')      // Backslash (must be first)
      .replace(/\*/g, '\\*')       // Asterisk (emphasis)
      .replace(/_/g, '\\_')        // Underscore (emphasis)
      .replace(/\[/g, '\\[')       // Left bracket (links)
      .replace(/\]/g, '\\]')       // Right bracket (links)
      .replace(/`/g, '\\`')        // Backtick (code)
      .replace(/^#/gm, '\\#')      // Hash at start of line (headers)
      .replace(/\|/g, '\\|');      // Pipe (tables)
  }

  private fixSpacingIssues(content: string): string {
    let processed = content;
    
    // Fix missing spaces before emphasis markers
    processed = processed.replace(/([^\s\n])\*(\w)/g, '$1 *$2');
    processed = processed.replace(/([^\s\n])\*\*(\w)/g, '$1 **$2');
    
    // Fix missing spaces after emphasis markers (but not before punctuation)
    processed = processed.replace(/(\w)\*([^\s\n*.!?;:,\)\]}>])/g, '$1* $2');
    processed = processed.replace(/(\w)\*\*([^\s\n*.!?;:,\)\]}>])/g, '$1** $2');
    
    // Fix double punctuation patterns (but preserve ../ relative paths)
    processed = processed.replace(/([.!?;:])\1+(?!\/)/g, '$1'); // Remove duplicate punctuation but not ../
    processed = processed.replace(/\.,,/g, '.'); // Fix specific pattern like ".,,"
    processed = processed.replace(/,,/g, ','); // Fix double commas
    
    // Fix missing spaces after punctuation (when not at end of line)
    processed = processed.replace(/([.!?:])([A-Z])/g, '$1 $2');
    processed = processed.replace(/([,;])([a-zA-Z])/g, '$1 $2');
    
    // Fix malformed emphasis patterns - targeted fixes
    processed = processed.replace(/> \*\* ([^*]+?)\*\*/g, '> **$1**'); // Fix admonition titles with extra space
    processed = processed.replace(/\*\s*\*([^*]+?)\*\s*\*/g, '**$1**'); // Fix broken bold
    
    // Note: Emphasis spacing now handled at DOM level in handleEmphasis
    
    // Fix missing punctuation at end of sentences
    processed = processed.replace(/([a-z])(\n\d+\.)/g, '$1.$2'); // Add period before list items
    processed = processed.replace(/deleted\n$/g, 'deleted.\n'); // Fix "deleted" at end
    processed = processed.replace(/([a-z])(\s*\n*$)/g, '$1.$2'); // Add period at end of document if missing
    
    // Note: General emphasis spacing now handled at DOM level
    
    // Fix line break issues around block elements
    processed = processed.replace(/(\w)\n(\d+\.)/g, '$1\n\n$2'); // Space before numbered lists
    processed = processed.replace(/\.\n(\d+\.)/g, '.\n\n$1'); // Space between list items and paragraphs
    
    return processed;
  }

  private postProcessMarkdown(content: string): string {
    // Add null/undefined safety check
    if (!content || typeof content !== 'string') {
      return content || '';
    }
    
    let processed = content;
    
    // Fix spacing issues first - before other processing
    processed = this.fixSpacingIssues(processed);
    
    // Fix punctuation spacing after general spacing fixes
    processed = this.fixPunctuationSpacing(processed);
    
    // Fix excessive blank lines (CommonMark allows any number but 2 is standard)
    processed = processed.replace(/\n{4,}/g, '\n\n\n');
    
    processed = processed.replace(/\n{3}/g, '\n\n');
    
    // Fix leading whitespace before headings
    processed = processed.replace(/^[ \t]+(#{1,6}\s)/gm, '$1');
    
    // Ensure proper spacing around headings (before and after)
    processed = processed.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2'); // Add blank line before headings
    processed = processed.replace(/(#{1,6}[^\n]*)\n([^\n#])/g, '$1\n\n$2'); // Add blank line after headings
    
    // Special case: ensure spacing between consecutive headings
    processed = processed.replace(/(#{1,6}[^\n]*)\n(#{1,6}\s)/g, '$1\n\n$2');
    
    // Fix potential triple newlines created by heading spacing
    processed = processed.replace(/\n{3,}/g, '\n\n');
    
    // Protect Writerside admonitions from line merging
    processed = this.protectAdmonitionSpacing(processed);
    
    // Ensure proper spacing around lists
    processed = this.fixListSpacing(processed);
    
    // Clean up emphasis formatting - minimal post-processing to preserve DOM-based spacing logic
    // Only fix internal whitespace issues inside emphasis, let DOM-based logic handle external spacing
    
    // Clean up double spaces (but preserve single spaces for readability)
    processed = processed.replace(/  +/g, ' '); // Replace multiple spaces with single space
    
    // NOTE: Emphasis spacing is now handled at DOM level in handleEmphasis
    // These patterns were causing issues by adding extra spaces

    // Clean up admonition formatting - remove duplicate blockquote markers and fix orphaned style attributes
    // BUT preserve single newlines between > markers (for proper admonition line separation)
    processed = processed.replace(/>[ \t]+>/g, '> >'); // Multiple spaces/tabs (but not newlines) become single space
    processed = processed.replace(/>[ \t]*>[ \t]*>/g, '> > >'); // Three consecutive > markers with spaces/tabs
    // Fix blockquote emphasis patterns - but avoid matching XML tags like <step>
    // Only match lines that start with '> ' (blockquote) and don't contain '<' or '>' inside content
    processed = processed.replace(/^>\s+[^<\n]*\*\*([^*\n]+?)\*\*[^<\n]*$/gm, '> **$1**');
    processed = processed.replace(/\n\{style="(note|tip|warning)"\}\n\{style="(note|tip|warning)"\}/g, '\\n{style="$1"}');
    
    // Fix malformed admonitions that appear as italic emphasis instead of blockquotes
    // Only fix patterns that are clearly broken (not inside existing blockquotes)
    processed = processed.replace(/^(?!>)\*\s*\*\s*(Note|Tip|Warning|Info|Important|Caution)\s*:\s*\*\s*\*/gim, '\n> **$1:**');
    processed = processed.replace(/^(?!>)\*\s*(Note|Tip|Warning|Info|Important|Caution)\s*:\s*\*/gim, '\n> **$1:**');
    
    // Fix Writerside admonition style attribute positioning - CRITICAL FIX
    // Move style attributes from same line as blockquote content to separate line
    processed = processed.replace(/(>[^\n]*)\s*\{style="(note|tip|warning)"\}/g, '$1\n{style="$2"}');
    
    // Fix missing empty line in admonitions - specific pattern
    processed = processed.replace(/(> \*\*Attention! Data loss!\*\*)\n(> Deleting an activity)/g, '$1\n>\n$2');
    
    // Fix merged list items - comprehensive patterns for complex content
    processed = processed.replace(/(\d+\. [^0-9]+\.) (\d+\. )/g, '$1\n\n$2');
    processed = processed.replace(/(\d+\. [^\n]*[.!?]) (\d+\. )/g, '$1\n\n$2');
    processed = processed.replace(/([.!?]) (\d+\. )/g, '$1\n\n$2');
    
    // Fix spacing between lists and following paragraphs - handle complex whitespace
    processed = processed.replace(/(\d+\. [^\n]*)\n+\s*([A-Z][^\n]*\.)/g, '$1\n\n$2');
    
    // Note: List processing improvements now handled at DOM level in handleMixedOrderedList
    
    // Remove trailing file path artifacts
    processed = this.removeFilePathArtifacts(processed);
    
    // Enhance inline code detection for missed UI elements  
    // TEMPORARILY DISABLED: This enhancement is causing undefined replace errors
    // processed = this.enhanceInlineCodeFormatting(processed);
    
    // Remove trailing whitespace
    processed = processed.replace(/[ \t]+$/gm, '');
    
    // FINAL FIX: Add missing periods at end of sentences - do this last
    processed = processed.replace(/deleted\n/g, 'deleted.\n');
    processed = processed.replace(/deleted$/g, 'deleted.'); // Add period at end of line
    processed = processed.replace(/([a-z])(\n)$/g, '$1.$2'); // Add period before final newline
    
    // Ensure single newline at end
    processed = processed.replace(/\n*$/, '\n');
    
    return processed;
  }

  private fixListSpacing(content: string): string {
    // Add null/undefined safety check
    if (!content || typeof content !== 'string') {
      return content || '';
    }
    
    let processed = content;
    
    // Split content into lines for easier processing
    const lines = processed.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : '';
      const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
      
      // Check if current line is a list item
      const isListItem = /^\s*(\d+\.\s|-\s)/.test(currentLine);
      const isIndentedListContent = /^    /.test(currentLine) && currentLine.trim().length > 0;
      
      // Check if previous/next lines are list-related
      const prevIsListItem = /^\s*(\d+\.\s|-\s)/.test(prevLine);
      const prevIsIndentedListContent = /^    /.test(prevLine) && prevLine.trim().length > 0;
      const nextIsListItem = /^\s*(\d+\.\s|-\s)/.test(nextLine);
      const nextIsIndentedListContent = /^    /.test(nextLine) && nextLine.trim().length > 0;
      
      // Check if line is empty
      const isEmpty = currentLine.trim() === '';
      const prevIsEmpty = prevLine.trim() === '';
      const nextIsEmpty = nextLine.trim() === '';
      
      // Rule 1: Add blank line before first list item if preceded by content
      if (isListItem && !prevIsEmpty && !prevIsListItem && !prevIsIndentedListContent && prevLine.trim() !== '') {
        if (!isEmpty) {
          result.push('');
        }
      }
      
      // Rule 2: Add blank line after last list item if followed by content
      if ((isListItem || isIndentedListContent) && 
          !nextIsEmpty && !nextIsListItem && !nextIsIndentedListContent && 
          nextLine.trim() !== '' && !nextLine.startsWith('#')) {
        result.push(currentLine);
        result.push('');
        continue;
      }
      
      // Rule 3: Add blank line between different list types
      if (isListItem && prevIsListItem && !prevIsEmpty) {
        const currentIsOrdered = /^\s*\d+\.\s/.test(currentLine);
        const prevIsOrdered = /^\s*\d+\.\s/.test(prevLine);
        
        if (currentIsOrdered !== prevIsOrdered) {
          result.push('');
        }
      }
      
      result.push(currentLine);
    }
    
    return result.join('\n');
  }

  private protectAdmonitionSpacing(content: string): string {
    // Add null/undefined safety check
    if (!content || typeof content !== 'string') {
      return content || '';
    }
    
    let processed = content;
    
    // Ensure Writerside admonition style blocks have proper spacing before and after
    // Pattern: {style="note|tip|warning"} followed by non-whitespace
    processed = processed.replace(/\{style="(note|tip|warning)"\}([^\n])/g, '{style="$1"}\n\n$2');
    
    // Ensure admonitions have blank line before them if preceded by content
    processed = processed.replace(/([^\n])\n\{style="(note|tip|warning)"\}/g, '$1\n\n{style="$2"}');
    
    // Fix specific issue where whitespace and newlines before list items get collapsed
    // Protect the pattern: {style="..."}\n\n\n \n1. (multiple newlines + space + newline + list)
    processed = processed.replace(/\{style="(note|tip|warning)"\}\s*\n\s*(\d+\.)/g, '{style="$1"}\n\n$2');
    
    return processed;
  }

  private removeFilePathArtifacts(content: string): string {
    // Add null/undefined safety check
    if (!content || typeof content !== 'string') {
      return content || '';
    }
    
    let processed = content;
    
    // 0. Fix spaces in file paths (e.g., "button. png" -> "button.png", "Activities. md" -> "Activities.md")
    // But avoid breaking URLs - only match if not preceded by ://
    processed = processed.replace(/(?<![/:])(\w+)\.\s+(png|jpg|jpeg|gif|svg|webp|bmp|ico|md|html|htm)\b/gi, '$1.$2');
    
    // 1. Remove trailing file extensions at end of lines (common MadCap artifacts)
    processed = processed.replace(/\.(htm|html|aspx|php|jsp)$/gm, '');
    processed = processed.replace(/\.(htm|html|aspx|php|jsp)\s*$/gm, '');
    
    // 2. Remove trailing path separators and fragments
    processed = processed.replace(/[\\\/]+$/gm, '');
    processed = processed.replace(/[\\\/]+\s*$/gm, '');
    
    // 3. Remove MadCap-specific file artifacts
    processed = processed.replace(/\.flsnp$/gm, ''); // Snippet files
    processed = processed.replace(/\.flvar$/gm, ''); // Variable files
    processed = processed.replace(/\.fltoc$/gm, ''); // TOC files
    processed = processed.replace(/\.fltar$/gm, ''); // Target files
    
    // 4. Remove common web file artifacts at end of lines
    processed = processed.replace(/\.(css|js|xml|json)$/gm, '');
    processed = processed.replace(/\.(css|js|xml|json)\s*$/gm, '');
    
    // 5. Clean up orphaned file path fragments
    // Remove lines that are just file paths or extensions
    processed = processed.replace(/^\s*[\\\/][\w\\\/.-]*\.(htm|html|aspx|php|jsp|css|js|xml|json|flsnp|flvar|fltoc|fltar)\s*$/gm, '');
    
    // 6. Remove query parameters and anchor fragments at end of lines (except in proper links)
    // Only remove if not part of a markdown link syntax
    processed = processed.replace(/(?<!\]\()[?#][\w=&.-]*$/gm, '');
    
    // 7. Remove common MadCap temp/cache file references
    processed = processed.replace(/\.tmp$/gm, '');
    processed = processed.replace(/\.cache$/gm, '');
    processed = processed.replace(/\.log$/gm, '');
    
    // 8. Clean up duplicate path separators within lines (but not in URLs)
    // Use negative lookbehind to avoid matching :// in URLs
    processed = processed.replace(/(?<!:)[\\\/]{2,}/g, '/');
    
    // 9. Remove trailing periods that are clearly file artifacts (not sentence endings)
    // Only remove if the line looks like a file path or isolated extension
    processed = processed.replace(/^[\\\/].*\.\s*$/gm, ''); // Full file paths ending with period
    processed = processed.replace(/^\s*\.[a-z0-9]{1,4}\s*$/gm, ''); // Isolated extensions like ".htm"
    
    // 10. Remove empty lines created by artifact removal
    processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    return processed;
  }

  private enhanceInlineCodeFormatting(content: string): string {
    // Add null/undefined safety check
    if (!content || typeof content !== 'string') {
      return content || '';
    }
    
    let processed = content;
    
    // Define patterns for common UI elements that should be in backticks
    const inlineCodePatterns = [
      // Keyboard shortcuts (not already in backticks)
      /(?<!`)\b(Ctrl|Alt|Shift|Cmd|Command)\s*[\+\-]\s*[A-Za-z0-9](?!`)/gi,
      /(?<!`)\b(F\d{1,2}|Tab|Enter|Return|Space|Backspace|Delete|Esc|Escape|Home|End|PageUp|PageDown)(?!`)\b/gi,
      
      // Common button names (case insensitive, word boundaries)
      /(?<!`)\b(OK|Cancel|Save|Delete|Edit|Create|New|Add|Remove|Close|Open|Start|Stop|Submit|Apply|Reset|Clear|Refresh|Update|Download|Upload|Import|Export|Print|Preview|Search|Find|Replace|Copy|Paste|Cut|Undo|Redo)(?!`)\b/gi,
      
      // Menu items
      /(?<!`)\b(File|Edit|View|Tools|Help|Settings|Preferences|Options|Configuration|Config|Admin|Administrator|Home|Dashboard|Profile|Account)(?!`)\b/gi,
      
      // Form elements
      /(?<!`)\b(textbox|text box|dropdown|drop-down|checkbox|check box|radio button|button|field|input|textarea|select|option|label|placeholder)(?!`)\b/gi,
      
      // Configuration values
      /(?<!`)\b(true|false|null|undefined|none|auto|default|enabled|disabled|on|off)(?!`)\b/gi,
      
      // Version numbers (not in backticks)
      /(?<!`)\bv?\d+\.\d+(?:\.\d+)?(?:\.\d+)?(?!`)\b/gi,
      
      // File extensions (when standalone)
      /(?<!`)\b[a-zA-Z0-9_-]+\.(exe|dll|bat|cmd|sh|ps1|py|js|css|html|htm|php|asp|aspx|jsp|xml|json|txt|log|ini|cfg|conf|config)(?!`)\b/gi,
      
      // Constants/settings (all caps with underscores)
      /(?<!`)\b[A-Z][A-Z0-9_]{2,}(?!`)\b/g,
      
      // Quoted UI elements that should be code instead
      /\"(OK|Cancel|Save|Delete|Edit|Create|New|Add|Remove|Close|Open|Start|Stop|Submit|Apply|Reset|Clear|Refresh|Update)\"/gi
    ];
    
    // Apply each pattern
    inlineCodePatterns.forEach((pattern, index) => {
      if (index < inlineCodePatterns.length - 1) {
        // Most patterns: wrap in backticks
        processed = processed.replace(pattern, '`$&`');
      } else {
        // Last pattern: replace quotes with backticks
        processed = processed.replace(pattern, '`$1`');
      }
    });
    
    // Clean up any double backticks that might have been created
    processed = processed.replace(/``+/g, '`');
    
    // Fix backticks around already formatted text
    processed = processed.replace(/`\*\*([^*`]+)\*\*`/g, '`$1`');
    processed = processed.replace(/`\*([^*`]+)\*`/g, '`$1`');
    
    return processed;
  }

  private fixPunctuationSpacing(content: string): string {
    // Add null/undefined safety check
    if (!content || typeof content !== 'string') {
      return content || '';
    }
    
    let processed = content;
    
    // Remove spaces before punctuation marks (but preserve newlines)
    processed = processed.replace(/ +([.!?;:,\)\]}>])/g, '$1');
    
    // Ensure space after punctuation (except at end of line, before closing brackets, or in URLs/domains)
    // Don't add spaces after periods that are clearly part of domains or file extensions
    processed = processed.replace(/([!?;:,])([A-Za-z])/g, '$1 $2'); // Handle most punctuation
    // For periods, be more careful - avoid domains and file extensions
    processed = processed.replace(/(?<![a-zA-Z0-9])\.(?![a-zA-Z]{2,4}\b)([A-Z])/g, '. $1');
    
    // Fix emphasis before punctuation - remove spaces (but only single spaces, not multiple)
    processed = processed.replace(/\* ([.!?;:,])/g, '*$1');
    processed = processed.replace(/\*\* ([.!?;:,])/g, '**$1');
    
    // Fix code blocks before punctuation
    processed = processed.replace(/`\s+([.!?;:,])/g, '`$1');
    
    return processed;
  }

  // ===== WRITERSIDE-SPECIFIC FEATURE IMPLEMENTATIONS =====

  private handleSnippetElement(element: Element, snippetSrc: string, content: string): string {
    const writersideOptions = this.currentOptions?.writersideOptions;
    
    // If mergeSnippets is disabled, create include directive
    if (writersideOptions?.mergeSnippets === false) {
      const elementId = this.generateElementId(snippetSrc);
      const snippetPath = snippetSrc.replace(/\.flsnp$/i, '.md');
      return `\n<include from="${snippetPath}" element-id="${elementId}"/>\n\n`;
    }
    
    // Default: merge content inline
    return content;
  }

  private createWritersideProcedure(element: Element, document: Document): string {
    const titleElement = element.querySelector('h1, h2, h3, h4, h5, h6');
    let title = 'Procedure';
    
    if (titleElement) {
      // Use convertDomToMarkdown to properly handle variables and formatting
      const convertedTitle = this.convertDomToMarkdown(titleElement, document).trim();
      // Strip any markdown heading syntax
      title = convertedTitle.replace(/^#+\s*/, '') || 'Procedure';
    }
    
    const procedureId = this.generateElementId(title);
    
    // Find ordered list or create steps from content
    const olElement = element.querySelector('ol');
    let steps: string[] = [];
    
    if (olElement) {
      const listItems = olElement.querySelectorAll('li');
      steps = Array.from(listItems).map(li => {
        const stepContent = this.convertDomToMarkdown(li, document).trim();
        return stepContent.replace(/^\d+\.\s*/, ''); // Remove numbering
      });
    } else {
      // If no ordered list, treat each paragraph as a step
      const paragraphs = element.querySelectorAll('p');
      steps = Array.from(paragraphs).map(p => 
        this.convertDomToMarkdown(p, document).trim()
      );
    }
    
    if (steps.length === 0) {
      return `\n<procedure title="${title}" id="${procedureId}">
    <step>No steps found</step>
</procedure>\n\n`;
    }
    
    const stepsMarkup = steps.map(step => `    <step>${step}</step>`).join('\n');
    return `\n<procedure title="${title}" id="${procedureId}">
${stepsMarkup}
</procedure>\n\n`;
  }

  private createWritersideCollapsible(element: Element, document: Document): string {
    // Look for title in button or first heading
    const buttonElement = element.querySelector('button, .mc-dropdown-head');
    const headingElement = element.querySelector('h1, h2, h3, h4, h5, h6');
    
    const title = buttonElement?.textContent?.trim() || 
                  headingElement?.textContent?.trim() || 
                  'Expandable Content';
    
    // Get body content, excluding the button/heading
    const bodyElement = element.querySelector('.mc-dropdown-body') || element;
    let bodyContent = this.convertDomToMarkdown(bodyElement, document);
    
    // Remove the title from content if it was included
    if (buttonElement || headingElement) {
      const titleText = (buttonElement || headingElement)!.textContent?.trim();
      if (titleText) {
        bodyContent = bodyContent.replace(new RegExp(this.escapeRegex(titleText), 'g'), '').trim();
      }
    }
    
    // Indent the content properly
    const indentedContent = bodyContent.split('\n').map(line => 
      line.trim() ? `    ${line}` : line
    ).join('\n');
    
    return `\n<collapsible title="${title}">
${indentedContent}
</collapsible>\n\n`;
  }

  private createWritersideTabs(element: Element, document: Document): string {
    const tabHeaders = element.querySelectorAll('.mc-tab-head button, .mc-tab');
    const tabBodies = element.querySelectorAll('.mc-tab-content, .mc-tab-body > *');
    
    const tabs: Array<{title: string, content: string}> = [];
    
    // Extract tab titles and content
    tabHeaders.forEach((header, index) => {
      const title = header.textContent?.trim() || `Tab ${index + 1}`;
      const bodyElement = tabBodies[index];
      const content = bodyElement ? 
        this.convertDomToMarkdown(bodyElement as Element, document) : 
        'No content';
      
      tabs.push({ title, content });
    });
    
    if (tabs.length === 0) {
      return '\nNo tabs found\n\n';
    }
    
    const tabsMarkup = tabs.map(tab => {
      const indentedContent = tab.content.split('\n').map(line => 
        line.trim() ? `        ${line}` : line
      ).join('\n');
      
      return `    <tab title="${tab.title}">
${indentedContent}
    </tab>`;
    }).join('\n');
    
    return `\n<tabs>
${tabsMarkup}
</tabs>\n\n`;
  }

  private createWritersideSemanticAdmonition(element: Element, type: string, document: Document): string {
    const content = this.convertDomToMarkdown(element, document);
    const indentedContent = content.split('\n').map(line => 
      line.trim() ? `    ${line}` : line
    ).join('\n');
    
    return `\n<${type}>
${indentedContent}
</${type}>\n\n`;
  }

  private generateElementId(text: string): string {
    return text.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
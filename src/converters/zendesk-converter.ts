import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult, ZendeskArticleMetadata } from '../types/index.js';
import { MadCapConverter } from './madcap-converter.js';
import { readFile, stat } from 'fs/promises';
import { resolve, dirname } from 'path';

export class ZendeskConverter implements DocumentConverter {
  supportedInputTypes = ['html', 'htm', 'madcap'];
  private madcapConverter: MadCapConverter;
  private loadedSnippets: Set<string> = new Set(); // Prevent circular snippet loading
  private variableCache: Map<string, Map<string, string>> = new Map();
  private snippetCache: Map<string, string> = new Map(); // Cache loaded snippets
  
  // File content cache shared with MadCapConverter
  private static readonly MAX_CACHE_SIZE = 500;
  private static fileContentCache = new Map<string, { content: string; mtime: number }>();
  
  // Safe HTML tags allowed by Zendesk
  private readonly SAFE_HTML_TAGS = [
    'p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span', 'hr', 'sub', 'sup', 'small', 'del', 'ins', 'kbd', 'svg', 'path', 'g', 'circle',
    'rect', 'line', 'polygon', 'polyline', 'ellipse', 'defs', 'use'
  ];

  private readonly UNSAFE_ATTRIBUTES = [
    'onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur',
    'script', 'javascript:', 'vbscript:', 'data:', 'style'
  ];

  constructor() {
    this.madcapConverter = new MadCapConverter();
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    if (options.format !== 'zendesk') {
      throw new Error('ZendeskConverter only supports zendesk format');
    }

    // Check if content should be skipped due to MadCap conditions
    if (this.shouldSkipMadCapContent(input)) {
      throw new Error('Content contains MadCap conditions that should not be converted (black, deprecated, paused, halted, discontinued, print only)');
    }

    // First preprocess with MadCap converter if it's MadCap content
    // We'll handle the MadCap preprocessing directly within this converter
    let processedInput = input;
    if (options.inputType === 'madcap' || this.containsMadCapContent(input)) {
      // Preprocess MadCap elements while keeping HTML structure
      processedInput = await this.preprocessMadCapForZendesk(input, options.inputPath);
    }

    // Parse HTML content
    const dom = new JSDOM(processedInput, { contentType: 'text/html' });
    const document = dom.window.document;

    // Extract title
    const title = this.extractTitle(document);
    
    // Sanitize HTML content
    const sanitizedBody = this.sanitizeHtmlContent(document, options.zendeskOptions?.sanitizeHtml !== false, options);
    
    // Generate AI-based content tags (simplified for performance)
    const suggestedTags = options.zendeskOptions?.generateTags 
      ? this.generateSimpleTags(sanitizedBody, title, options.zendeskOptions?.maxTags || 5)
      : [];

    // Count words
    const wordCount = this.countWords(sanitizedBody);

    // Create Zendesk metadata
    const zendeskMetadata: ZendeskArticleMetadata = {
      title,
      body: sanitizedBody,
      locale: options.zendeskOptions?.locale || 'en-us',
      sectionId: options.zendeskOptions?.sectionId,
      userSegmentId: options.zendeskOptions?.userSegmentId,
      permissionGroupId: options.zendeskOptions?.permissionGroupId,
      suggestedTags,
      draft: true // Default to draft
    };

    // Generate stylesheet if requested
    const result: ConversionResult = {
      content: sanitizedBody,
      metadata: {
        title,
        wordCount,
        zendeskMetadata,
        warnings: this.getZendeskWarnings(input, sanitizedBody, options)
      }
    };

    // Add stylesheet if external CSS is requested
    if (options.zendeskOptions?.generateStylesheet) {
      result.stylesheet = this.generateZendeskStylesheet();
    }

    return result;
  }

  private containsMadCapContent(html: string): boolean {
    return html.includes('MadCap:') || 
           html.includes('madcap:') || 
           html.includes('xmlns:MadCap') ||
           html.includes('data-mc-') ||
           html.includes('mc-variable') ||
           html.includes('mc-');
  }

  private shouldSkipMadCapContent(html: string): boolean {
    return this.checkSkipConditions(html);
  }

  private checkSkipConditions(content: string): boolean {
    // Regex patterns for deprecation and exclusion conditions
    const skipPatterns = [
      // Color-based conditions (case insensitive)
      /\b(Black|Red|Gray|Grey)\b/i,
      
      // Deprecation patterns (various forms)
      /\b(deprecated?|deprecation|obsolete|legacy|old)\b/i,
      
      // Status patterns
      /\b(paused?|halted?|stopped?|discontinued?|retired?)\b/i,
      
      // Print-only patterns
      /\b(print[\s\-_]?only|printonly)\b/i,
      
      // Development status
      /\b(cancelled?|canceled?|abandoned|shelved)\b/i,
      
      // Hidden/internal patterns
      /\b(hidden|internal|private|draft)\b/i
    ];
    
    // Check for madcap:conditions attributes
    const conditionPattern = /(?:madcap:conditions|data-mc-conditions)="([^"]+)"/gi;
    const matches = content.matchAll(conditionPattern);
    
    for (const match of matches) {
      const conditions = match[1];
      // Check if any skip pattern matches the conditions
      if (skipPatterns.some(pattern => pattern.test(conditions))) {
        return true;
      }
    }
    
    return false;
  }

  // Public method for batch service to check if file should be skipped
  public static shouldSkipFile(content: string): boolean {
    // Regex patterns for deprecation and exclusion conditions
    const skipPatterns = [
      // Color-based conditions (case insensitive)
      /\b(Black|Red|Gray|Grey)\b/i,
      
      // Deprecation patterns (various forms)
      /\b(deprecated?|deprecation|obsolete|legacy|old)\b/i,
      
      // Status patterns
      /\b(paused?|halted?|stopped?|discontinued?|retired?)\b/i,
      
      // Print-only patterns
      /\b(print[\s\-_]?only|printonly)\b/i,
      
      // Development status
      /\b(cancelled?|canceled?|abandoned|shelved)\b/i,
      
      // Hidden/internal patterns
      /\b(hidden|internal|private|draft)\b/i
    ];
    
    // Check for madcap:conditions attributes
    const conditionPattern = /(?:madcap:conditions|data-mc-conditions)="([^"]+)"/gi;
    const matches = content.matchAll(conditionPattern);
    
    for (const match of matches) {
      const conditions = match[1];
      // Check if any skip pattern matches the conditions
      if (skipPatterns.some(pattern => pattern.test(conditions))) {
        return true;
      }
    }
    
    return false;
  }

  private removeSkipConditionElements(document: Document): void {
    // Regex patterns for deprecation and exclusion conditions
    const skipPatterns = [
      // Color-based conditions (case insensitive)
      /\b(Black|Red|Gray|Grey)\b/i,
      
      // Deprecation patterns (various forms)
      /\b(deprecated?|deprecation|obsolete|legacy|old)\b/i,
      
      // Status patterns
      /\b(paused?|halted?|stopped?|discontinued?|retired?)\b/i,
      
      // Print-only patterns
      /\b(print[\s\-_]?only|printonly)\b/i,
      
      // Development status
      /\b(cancelled?|canceled?|abandoned|shelved)\b/i,
      
      // Hidden/internal patterns
      /\b(hidden|internal|private|draft)\b/i
    ];
    
    // Find elements with madcap:conditions attributes
    const conditionalElements = document.querySelectorAll('[madcap\\:conditions], [data-mc-conditions]');
    
    conditionalElements.forEach(element => {
      const madcapConditions = element.getAttribute('madcap:conditions') || '';
      const dataMcConditions = element.getAttribute('data-mc-conditions') || '';
      const allConditions = madcapConditions + ' ' + dataMcConditions;
      
      // Check if any skip patterns match the conditions
      const shouldSkip = skipPatterns.some(pattern => pattern.test(allConditions));
      
      if (shouldSkip) {
        // Add a comment indicating the removed content
        const comment = document.createComment(
          ` Removed content with MadCap conditions: ${madcapConditions || dataMcConditions} `
        );
        element.parentNode?.replaceChild(comment, element);
      }
    });
  }

  private async preprocessMadCapForZendesk(html: string, inputPath?: string): Promise<string> {
    // Reset snippet loading cache for each conversion
    this.loadedSnippets.clear();
    
    // Remove Microsoft properties first
    let cleanedHtml = this.removeMicrosoftProperties(html);
    
    // Try to load MadCap variables from project (cached)
    if (inputPath) {
      const projectPath = this.findProjectPath(inputPath);
      if (projectPath && !this.variableCache.has(projectPath)) {
        await this.loadVariableSets(projectPath);
      }
    }
    
    // Parse as HTML once
    const dom = new JSDOM(cleanedHtml, { contentType: 'text/html' });
    const document = dom.window.document;
    
    // Remove elements with skip conditions before processing
    this.removeSkipConditionElements(document);
    
    // Batch process all MadCap elements in one pass to minimize DOM traversals
    await this.processMadCapElementsBatch(document, inputPath);
    
    return document.documentElement.outerHTML;
  }

  private async processMadCapElementsBatch(document: Document, inputPath?: string): Promise<void> {
    // Single DOM traversal to find all MadCap elements
    const allElements = Array.from(document.querySelectorAll('*'));
    
    const snippetBlocks: Element[] = [];
    const snippetTexts: Element[] = [];
    const dropDowns: Element[] = [];
    const xrefs: Element[] = [];
    const variables: Element[] = [];
    
    // Categorize elements in one pass
    for (const element of allElements) {
      const tagName = element.tagName.toLowerCase();
      
      if (tagName === 'madcap:snippetblock' || tagName === 'madcap:snippet') {
        snippetBlocks.push(element);
      } else if (tagName === 'madcap:snippettext') {
        snippetTexts.push(element);
      } else if (tagName === 'madcap:dropdown') {
        dropDowns.push(element);
      } else if (tagName === 'madcap:xref') {
        xrefs.push(element);
      } else if (tagName === 'madcap:variable' || tagName === 'MadCap:variable' || tagName === 'MADCAP:VARIABLE' || tagName.toLowerCase() === 'madcap:variable' || element.hasAttribute('data-mc-variable') || (element.hasAttribute('name') && (tagName.includes('variable') || element.className.includes('mc-variable')))) {
        variables.push(element);
      }
    }
    
    // Debug: log variable elements found
    if (variables.length > 0) {
      // Found ${variables.length} variable elements to process
    }
    
    // Process each type efficiently
    await this.processSnippetBlocks(snippetBlocks, inputPath);
    await this.processSnippetTexts(snippetTexts, inputPath);
    this.processDropDowns(dropDowns);
    this.processXrefs(xrefs);
    this.processVariables(variables);
    
    // Fallback: Process any remaining madcap:variable elements that weren't caught
    this.processRemainingVariables(document);
    
    // Clean up remaining MadCap elements
    this.convertMadCapElements(document);
  }

  private removeMicrosoftProperties(html: string): string {
    let cleanedHtml = html;
    
    // Remove the entire <head> section completely
    cleanedHtml = cleanedHtml.replace(/<head[\s\S]*?<\/head>/gi, '');
    
    // Remove any remaining link, meta, style, script tags
    cleanedHtml = cleanedHtml.replace(/<link[^>]*>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<meta[^>]*>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<style[\s\S]*?<\/style>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
    
    // Convert self-closing MadCap variable tags to regular tags
    cleanedHtml = this.normalizeMadCapVariables(cleanedHtml);
    
    return cleanedHtml;
  }

  private normalizeMadCapVariables(html: string): string {
    // Convert self-closing MadCap:variable tags to regular opening/closing tags
    // <MadCap:variable name="..." /> -> <MadCap:variable name="..."></MadCap:variable>
    let result = html.replace(
      /<MadCap:variable([^>]*?)\s*\/>/gi,
      '<MadCap:variable$1></MadCap:variable>'
    );
    
    // Also handle lowercase variations
    result = result.replace(
      /<madcap:variable([^>]*?)\s*\/>/gi,
      '<madcap:variable$1></madcap:variable>'
    );
    
    return result;
  }

  // Legacy method - now handled by processVariables in batch
  // private convertMadCapVariables(document: Document): void { ... }

  // Legacy method - now handled by processXrefs in batch
  // private convertMadCapCrossReferences(document: Document): void { ... }

  private async processSnippetTexts(snippetTexts: Element[], inputPath?: string): Promise<void> {
    for (const element of snippetTexts) {
      const snippetSrc = element.getAttribute('src');
      
      if (snippetSrc && inputPath) {
        try {
          // Resolve snippet path relative to the current document
          const snippetPath = resolve(dirname(inputPath), snippetSrc);
          
          // Check for circular references
          if (this.loadedSnippets.has(snippetPath)) {
            console.warn(`Circular snippet reference detected: ${snippetPath}`);
            element.remove();
            continue;
          }
          
          // Check cache first
          let snippetContent: string;
          if (this.snippetCache.has(snippetPath)) {
            snippetContent = this.snippetCache.get(snippetPath)!;
          } else {
            // Mark snippet as being loaded
            this.loadedSnippets.add(snippetPath);
            
            const rawContent = await readFile(snippetPath, 'utf8');
            snippetContent = await this.processSnippetContent(rawContent);
            this.snippetCache.set(snippetPath, snippetContent);
          }
          
          // Replace element with processed snippet text
          const textNode = element.ownerDocument.createTextNode(snippetContent.replace(/<[^>]*>/g, '').trim());
          element.parentNode?.replaceChild(textNode, element);
          
        } catch (error) {
          console.warn(`Could not load snippet text ${snippetSrc}:`, error instanceof Error ? error.message : String(error));
          element.remove();
        }
      } else {
        // Remove element if no valid src
        element.remove();
      }
    }
  }

  private async processSnippetBlocks(snippetBlocks: Element[], inputPath?: string): Promise<void> {
    for (const element of snippetBlocks) {
      const snippetSrc = element.getAttribute('src');
      
      if (snippetSrc && inputPath) {
        try {
          // Resolve snippet path relative to the current document
          const snippetPath = resolve(dirname(inputPath), snippetSrc);
          
          // Check for circular references
          if (this.loadedSnippets.has(snippetPath)) {
            console.warn(`Circular snippet reference detected: ${snippetPath}`);
            this.createSnippetPlaceholder(element.ownerDocument, element, snippetSrc);
            continue;
          }
          
          // Check cache first
          let snippetContent: string;
          if (this.snippetCache.has(snippetPath)) {
            snippetContent = this.snippetCache.get(snippetPath)!;
          } else {
            // Mark snippet as being loaded
            this.loadedSnippets.add(snippetPath);
            
            const rawContent = await readFile(snippetPath, 'utf8');
            snippetContent = await this.processSnippetContent(rawContent);
            this.snippetCache.set(snippetPath, snippetContent);
          }
          
          // Create container for snippet content
          const div = element.ownerDocument.createElement('div');
          div.className = 'snippet-content';
          div.innerHTML = snippetContent;
          
          element.parentNode?.replaceChild(div, element);
          
        } catch (error) {
          console.warn(`Could not load snippet ${snippetSrc}:`, error instanceof Error ? error.message : String(error));
          this.createSnippetPlaceholder(element.ownerDocument, element, snippetSrc);
        }
      } else {
        // If no src attribute or inputPath, create a placeholder
        if (snippetSrc) {
          this.createSnippetPlaceholder(element.ownerDocument, element, snippetSrc);
        } else {
          const div = element.ownerDocument.createElement('div');
          div.innerHTML = element.innerHTML;
          element.parentNode?.replaceChild(div, element);
        }
      }
    }
  }

  private async processSnippetContent(snippetContent: string): Promise<string> {
    // Clean the snippet content
    let cleanedSnippet = snippetContent
      .replace(/<\?xml[^>]*>/g, '')
      .replace(/xmlns:MadCap="[^"]*"/g, '');
    
    // Extract the body content
    const bodyMatch = cleanedSnippet.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      return bodyMatch[1].trim();
    }
    
    // If no body tag, return the cleaned content
    return cleanedSnippet.trim();
  }

  private createSnippetPlaceholder(document: Document, element: Element, snippetSrc: string): void {
    const div = document.createElement('div');
    div.className = 'snippet-placeholder';
    
    const noteP = document.createElement('p');
    noteP.innerHTML = `<strong>📄 Content:</strong> Snippet from <code>${snippetSrc}</code>`;
    div.appendChild(noteP);
    
    // If the element has content, include it
    if (element.innerHTML.trim()) {
      const contentDiv = document.createElement('div');
      contentDiv.innerHTML = element.innerHTML;
      div.appendChild(contentDiv);
    }
    
    element.parentNode?.replaceChild(div, element);
  }

  private processDropDowns(dropDowns: Element[]): void {
    dropDowns.forEach(dropDown => {
      const head = Array.from(dropDown.children).find(el => 
        el.tagName.toLowerCase().includes('dropdownhead')
      );
      
      const hotspot = head ? Array.from(head.children).find(el => 
        el.tagName.toLowerCase().includes('dropdownhotspot')
      ) : null;
      
      const body = Array.from(dropDown.children).find(el => 
        el.tagName.toLowerCase().includes('dropdownbody')
      );
      
      if (hotspot && body) {
        // Create Zendesk-style collapsible section using details/summary
        const details = dropDown.ownerDocument.createElement('details');
        details.className = 'zendesk-collapsible';
        
        const summaryText = hotspot.textContent?.trim() || 'More Information';
        const summary = dropDown.ownerDocument.createElement('summary');
        summary.innerHTML = `<strong>${summaryText}</strong>`;
        
        details.appendChild(summary);
        
        // Create content container
        const contentDiv = dropDown.ownerDocument.createElement('div');
        contentDiv.className = 'collapsible-content';
        
        // Move all body content to the container
        const bodyContent = Array.from(body.childNodes);
        bodyContent.forEach(child => {
          contentDiv.appendChild(child.cloneNode(true));
        });
        
        details.appendChild(contentDiv);
        
        // Replace the entire dropDown with the details element
        dropDown.parentNode?.replaceChild(details, dropDown);
      }
    });
  }

  private processXrefs(xrefs: Element[]): void {
    xrefs.forEach(element => {
      const href = element.getAttribute('href');
      const linkText = element.textContent?.trim() || '';
      
      if (href) {
        const link = element.ownerDocument.createElement('a');
        // Convert .htm to .html for Zendesk output consistency (handles both .htm and .htm#anchor)
        const convertedHref = href.includes('.htm') ? href.replace(/\.htm(#|$)/, '.html$1') : href;
        link.setAttribute('href', convertedHref);
        link.textContent = linkText || `See ${convertedHref}`;
        element.parentNode?.replaceChild(link, element);
      } else {
        const textNode = element.ownerDocument.createTextNode(linkText);
        element.parentNode?.replaceChild(textNode, element);
      }
    });
  }

  private processVariables(variables: Element[]): void {
    variables.forEach(element => {
      const variableName = element.getAttribute('name') ||
                          element.getAttribute('data-mc-variable') || 
                          this.extractVariableName(element.className);
      
      // First try to get the text content (already resolved by MadCap)
      const textContent = element.textContent?.trim();
      if (textContent && textContent !== '' && !textContent.includes('.') && textContent.length > 0) {
        // Use resolved content if it doesn't look like a variable reference
        const textNode = element.ownerDocument.createTextNode(textContent);
        element.parentNode?.replaceChild(textNode, element);
      } else if (variableName) {
        // Try to resolve the variable
        const resolvedValue = this.resolveVariable(variableName);
        const textNode = element.ownerDocument.createTextNode(resolvedValue || `{${variableName}}`);
        element.parentNode?.replaceChild(textNode, element);
      } else {
        // If no variable name found, create placeholder
        const placeholder = `{Variable: ${element.outerHTML.substring(0, 50)}...}`;
        const textNode = element.ownerDocument.createTextNode(placeholder);
        element.parentNode?.replaceChild(textNode, element);
      }
    });
  }

  private processRemainingVariables(document: Document): void {
    // Use CSS selector to find any remaining variable elements that weren't caught
    // This handles namespace issues with JSDOM
    const remainingVariables = document.querySelectorAll('madcap\\:variable, MadCap\\:variable, MADCAP\\:VARIABLE');
    
    remainingVariables.forEach(element => {
      const variableName = element.getAttribute('name');
      
      if (variableName) {
        // Try to resolve the variable
        const resolvedValue = this.resolveVariable(variableName);
        const textNode = element.ownerDocument.createTextNode(resolvedValue || `{${variableName}}`);
        element.parentNode?.replaceChild(textNode, element);
      } else {
        // If no variable name found, create placeholder
        const placeholder = `{Variable: ${element.outerHTML.substring(0, 50)}...}`;
        const textNode = element.ownerDocument.createTextNode(placeholder);
        element.parentNode?.replaceChild(textNode, element);
      }
    });
  }

  private extractTitle(document: Document): string {
    // Try to find title from various sources
    const h1 = document.querySelector('h1');
    if (h1?.textContent?.trim()) {
      return h1.textContent.trim();
    }

    const title = document.querySelector('title');
    if (title?.textContent?.trim()) {
      return title.textContent.trim();
    }

    // Look for MadCap title patterns
    const madcapTitle = document.querySelector('[data-mc-heading-level="1"]');
    if (madcapTitle?.textContent?.trim()) {
      return madcapTitle.textContent.trim();
    }

    return 'Untitled Article';
  }

  private sanitizeHtmlContent(document: Document, sanitize: boolean = true, options?: ConversionOptions): string {
    if (!sanitize) {
      return document.body?.innerHTML || document.documentElement.innerHTML;
    }

    // Remove script and style tags completely
    const scripts = document.querySelectorAll('script, style');
    scripts.forEach(el => el.remove());

    // Remove unsafe elements
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      const tagName = element.tagName.toLowerCase();
      
      // Remove elements with unsafe tags
      if (!this.SAFE_HTML_TAGS.includes(tagName)) {
        // Replace with div or span, preserving content
        const replacement = document.createElement(tagName === 'div' ? 'div' : 'span');
        replacement.innerHTML = element.innerHTML;
        element.parentNode?.replaceChild(replacement, element);
        return;
      }

      // Remove unsafe attributes
      const attributes = Array.from(element.attributes);
      attributes.forEach(attr => {
        const attrName = attr.name.toLowerCase();
        const attrValue = attr.value.toLowerCase();
        
        if (this.UNSAFE_ATTRIBUTES.some(unsafe => 
          attrName.includes(unsafe) || attrValue.includes(unsafe)
        )) {
          element.removeAttribute(attr.name);
        }
      });
    });

    // Convert MadCap-specific elements to standard HTML
    this.convertMadCapElements(document);
    
    // Clean up and optimize HTML structure
    this.optimizeHtmlStructure(document, options!);
    
    // Enhance styling for Zendesk (with configurable CSS approach)
    this.enhanceForZendeskStylingWithOptions(document, options!);

    return document.body?.innerHTML || document.documentElement.innerHTML;
  }

  private convertMadCapElements(document: Document): void {
    // Remove MadCap conditional attributes from all elements
    const elementsWithConditions = document.querySelectorAll('[madcap\\:conditions]');
    elementsWithConditions.forEach(element => {
      element.removeAttribute('madcap:conditions');
    });

    // Convert MadCap video objects to Zendesk video placeholders
    const madcapVideoObjects = document.querySelectorAll('object[madcap\\:html5video]');
    madcapVideoObjects.forEach(videoObj => {
      const src = videoObj.getAttribute('src');
      if (src) {
        const videoPlaceholder = document.createElement('div');
        videoPlaceholder.className = 'zendesk-video-embed';
        videoPlaceholder.innerHTML = `
          <p><strong>🎬 Video:</strong> ${src}</p>
          <p><em>Upload this video to Zendesk and replace this placeholder with the embedded video.</em></p>
          <p><strong>Video file:</strong> <code>${src}</code></p>
        `.trim();
        videoObj.parentNode?.replaceChild(videoPlaceholder, videoObj);
      } else {
        // Remove video object if no src
        videoObj.remove();
      }
    });

    // Remove other MadCap-specific attributes from all elements
    const madcapAttributes = [
      'madcap:html5video', 'madcap:param_controls', 'madcap:param_muted', 
      'madcap:param_loop', 'madcap:param_autoplay', 'madcap:targetname',
      'madcap:ignoretag', 'madcap:exclude'
    ];
    
    document.querySelectorAll('*').forEach(element => {
      madcapAttributes.forEach(attr => {
        if (element.hasAttribute(attr)) {
          element.removeAttribute(attr);
        }
      });
    });

    // Convert MadCap notes to properly formatted blockquotes
    const notes = document.querySelectorAll('.mc-note, [class*="mc-note"], .note');
    notes.forEach(note => {
      const blockquote = document.createElement('blockquote');
      blockquote.className = 'zendesk-callout zendesk-note';
      
      // Extract the note content, removing any existing noteInDiv spans
      let noteContent = note.innerHTML;
      noteContent = noteContent.replace(/<span[^>]*noteInDiv[^>]*>.*?<\/span>/gi, '');
      noteContent = noteContent.trim();
      
      blockquote.innerHTML = `<p><strong>📝 Note:</strong> ${noteContent}</p>`;
      note.parentNode?.replaceChild(blockquote, note);
    });

    // Convert MadCap warnings/attention to properly formatted blockquotes
    const warnings = document.querySelectorAll('.mc-warning, [class*="mc-warning"], .warning, .attention');
    warnings.forEach(warning => {
      const blockquote = document.createElement('blockquote');
      blockquote.className = 'zendesk-callout zendesk-warning';
      
      // Extract the warning content, removing any existing warningInDiv spans
      let warningContent = warning.innerHTML;
      warningContent = warningContent.replace(/<span[^>]*warningInDiv[^>]*>.*?<\/span>/gi, '');
      warningContent = warningContent.trim();
      
      blockquote.innerHTML = `<p><strong>⚠️ Warning:</strong> ${warningContent}</p>`;
      warning.parentNode?.replaceChild(blockquote, warning);
    });

    // Convert MadCap headings
    const headings = document.querySelectorAll('[class*="mc-heading"]');
    headings.forEach(heading => {
      const level = this.extractHeadingLevel(heading.className) || 2;
      const newHeading = document.createElement(`h${Math.min(level, 6)}`);
      newHeading.innerHTML = heading.innerHTML;
      heading.parentNode?.replaceChild(newHeading, heading);
    });

    // Convert MadCap procedures to ordered lists
    const procedures = document.querySelectorAll('.mc-procedure, [class*="mc-procedure"]');
    procedures.forEach(procedure => {
      const ol = document.createElement('ol');
      ol.innerHTML = procedure.innerHTML;
      procedure.parentNode?.replaceChild(ol, procedure);
    });
  }

  private extractHeadingLevel(className: string): number | null {
    const match = className.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  private optimizeHtmlStructure(document: Document, options: ConversionOptions): void {
    // Remove empty elements
    const emptyElements = document.querySelectorAll('p:empty, div:empty, span:empty');
    emptyElements.forEach(el => el.remove());
    
    // Clean up empty paragraphs in notes/blockquotes after initial cleanup (including whitespace-only)
    const parasInNotes = document.querySelectorAll('blockquote p');
    parasInNotes.forEach(el => {
      if (!el.textContent?.trim()) {
        el.remove();
      }
    });

    // Clean up nested blockquotes (from MadCap note conversions)
    const nestedBlockquotes = document.querySelectorAll('blockquote blockquote');
    nestedBlockquotes.forEach(innerBlockquote => {
      const outerBlockquote = innerBlockquote.parentElement;
      if (outerBlockquote && outerBlockquote.tagName.toLowerCase() === 'blockquote') {
        // If the outer blockquote only contains this inner blockquote, replace outer with inner
        const outerChildren = Array.from(outerBlockquote.children);
        if (outerChildren.length === 1 && outerChildren[0] === innerBlockquote) {
          outerBlockquote.parentNode?.replaceChild(innerBlockquote, outerBlockquote);
        }
      }
    });

    // Clean up nested paragraphs
    const nestedPs = document.querySelectorAll('p p');
    nestedPs.forEach(p => {
      const content = p.innerHTML;
      const parent = p.parentNode;
      if (parent && 'insertAdjacentHTML' in parent) {
        (parent as Element).insertAdjacentHTML('afterend', content);
      }
      p.remove();
    });

    // Optimize images for Zendesk display
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (!img.getAttribute('alt')) {
        img.setAttribute('alt', '');
      }
      
      // Remove any existing style attributes
      img.removeAttribute('style');
      
      // Classify and size images appropriately for Zendesk
      const src = img.getAttribute('src') || '';
      const classes = img.getAttribute('class') || '';
      
      // Check if image is in an icon container
      const parentElement = img.parentElement;
      const parentClasses = parentElement?.getAttribute('class') || '';
      const isInIconContainer = parentClasses.includes('icon') || 
                               parentElement?.tagName.toLowerCase() === 'span' && 
                               (parentClasses.includes('icon') || classes.includes('icon'));
      
      // Add Zendesk-appropriate sizing classes
      if (isInIconContainer || classes.includes('icon') || 
          src.includes('icon') || src.includes('GUI-Elemente/') || 
          classes.includes('StartPage')) {
        // PNG icons - inline with text
        img.className = 'zendesk-png-icon';
        img.setAttribute('style', 'width: 1em; height: 1em; display: inline-block; vertical-align: middle; max-width: 24px; max-height: 24px;');
      } else if (parentClasses.includes('button') || parentElement?.tagName.toLowerCase() === 'button') {
        // PNG icons in buttons
        img.className = 'zendesk-png-button-icon';
        img.setAttribute('style', 'width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 4px;');
      } else if (src.includes('Screens/') || classes.includes('screenshot')) {
        // Screenshots and large interface images
        img.className = 'zendesk-image-large';
        img.setAttribute('style', 'max-width: 100%; height: auto; border: 1px solid #ddd; margin: 10px 0;');
      } else if (src.includes('Funktionen/')) {
        // Feature/function images (medium size)
        img.className = 'zendesk-image-medium';
        img.setAttribute('style', 'max-width: 300px; height: auto; margin: 10px 0;');
      } else {
        // Default sizing for other images
        img.className = 'zendesk-image-default';
        img.setAttribute('style', 'max-width: 600px; height: auto; margin: 10px 0;');
      }
    });

    // Optimize SVG icons for Zendesk display
    const svgElements = document.querySelectorAll('svg');
    svgElements.forEach(svg => {
      const parentElement = svg.parentElement;
      const classes = svg.getAttribute('class') || '';
      const parentClasses = parentElement?.getAttribute('class') || '';
      
      // Ensure SVG has proper attributes for inline display
      if (!svg.getAttribute('width') && !svg.getAttribute('height')) {
        // Default icon size
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
      }
      
      // Add appropriate classes based on context
      if (classes.includes('icon') || parentClasses.includes('icon')) {
        // Inline icon styling
        svg.classList.add('zendesk-svg-icon');
        svg.setAttribute('style', 'width: 1em; height: 1em; display: inline-block; vertical-align: middle; fill: currentColor;');
      } else if (parentClasses.includes('button') || parentElement?.tagName.toLowerCase() === 'button') {
        // Button icon styling
        svg.classList.add('zendesk-svg-button-icon');
        svg.setAttribute('style', 'width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 4px; fill: currentColor;');
      } else {
        // Default SVG styling
        svg.classList.add('zendesk-svg-default');
        svg.setAttribute('style', 'max-width: 100%; height: auto; display: inline-block;');
      }
      
      // Ensure proper namespace for SVG
      if (!svg.getAttribute('xmlns')) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
    });

    // Process icon containers (spans with icon class)
    const iconContainers = document.querySelectorAll('span.icon, .icon');
    iconContainers.forEach(container => {
      container.classList.add('zendesk-icon-container');
      // Apply inline icon container styling
      container.setAttribute('style', 'display: inline-flex; align-items: center; vertical-align: middle;');
      
      // If container has SVG, ensure it's styled as an icon
      const svg = container.querySelector('svg');
      if (svg) {
        svg.classList.add('zendesk-svg-icon');
        svg.setAttribute('style', 'width: 1em; height: 1em; display: inline-block; vertical-align: middle; fill: currentColor;');
      }
      
      // If container has PNG/image, ensure it's styled as an icon
      const img = container.querySelector('img');
      if (img) {
        img.classList.add('zendesk-png-icon');
        img.setAttribute('style', 'width: 1em; height: 1em; display: inline-block; vertical-align: middle; max-width: 24px; max-height: 24px;');
      }
    });

    // Convert video references to Zendesk video embeds (unless ignoreVideos is enabled)
    if (!options.zendeskOptions?.ignoreVideos) {
      this.convertVideoReferences(document);
    }

    // Clean up links and convert .htm to .html for Zendesk consistency
    const links = document.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        // Convert internal anchor links to text fragments for modern deep linking
        const anchorName = href.substring(1); // Remove the #
        const textFragment = this.convertToTextFragment(anchorName);
        link.setAttribute('href', `#:~:text=${encodeURIComponent(textFragment)}`);
        return;
      }
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        // Add target="_blank" for external links
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      } else if (href && href.includes('.htm')) {
        // Convert .htm to .html for Zendesk output consistency (handles both .htm and .htm#anchor)
        const convertedHref = href.replace(/\.htm(#|$)/, '.html$1');
        // If there's an anchor part, convert it to text fragment
        if (convertedHref.includes('#') && !convertedHref.includes('#:~:text=')) {
          const [baseUrl, anchor] = convertedHref.split('#');
          const textFragment = this.convertToTextFragment(anchor);
          link.setAttribute('href', `${baseUrl}#:~:text=${encodeURIComponent(textFragment)}`);
        } else {
          link.setAttribute('href', convertedHref);
        }
      }
    });

    // Convert keyboard shortcuts to <kbd> elements
    this.convertKeyboardShortcuts(document);
  }

  private convertVideoReferences(document: Document): void {
    // Find video elements (HTML5 video tags)
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      const src = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src');
      if (src) {
        // Create Zendesk video placeholder
        const videoPlaceholder = document.createElement('div');
        videoPlaceholder.className = 'zendesk-video-embed';
        videoPlaceholder.innerHTML = `
          <p><strong>🎬 Video:</strong> ${src}</p>
          <p><em>Upload this video to Zendesk and replace this placeholder with the embedded video.</em></p>
          <p><strong>Video file:</strong> <code>${src}</code></p>
        `;
        video.parentNode?.replaceChild(videoPlaceholder, video);
      }
    });

    // Find links to video files
    const videoLinks = document.querySelectorAll('a[href$=".mp4"], a[href$=".avi"], a[href$=".mov"], a[href$=".wmv"], a[href$=".webm"]');
    videoLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        // Create Zendesk video placeholder
        const videoPlaceholder = document.createElement('div');
        videoPlaceholder.className = 'zendesk-video-embed';
        videoPlaceholder.innerHTML = `
          <p><strong>🎬 Video:</strong> ${link.textContent || href}</p>
          <p><em>Upload this video to Zendesk and replace this placeholder with the embedded video.</em></p>
          <p><strong>Video file:</strong> <code>${href}</code></p>
        `;
        link.parentNode?.replaceChild(videoPlaceholder, link);
      }
    });

    // Look for specific video files mentioned in the content
    const bodyElement = document.body || document.documentElement;
    if (!bodyElement) return;
    
    const textNodes = document.createTreeWalker(
      bodyElement,
      4, // NodeFilter.SHOW_TEXT
      null
    );
    
    const videoFilePattern = /\b\w+\.(mp4|avi|mov|wmv|webm)\b/gi;
    let node;
    const nodesToProcess: { node: Text, matches: RegExpMatchArray[] }[] = [];
    
    while (node = textNodes.nextNode() as Text) {
      // Skip text nodes that are already inside video placeholders
      const parentElement = node.parentElement;
      if (parentElement && parentElement.closest('.zendesk-video-embed')) {
        continue;
      }
      
      const matches = Array.from(node.textContent?.matchAll(videoFilePattern) || []);
      if (matches.length > 0) {
        nodesToProcess.push({ node, matches });
      }
    }
    
    // Process the matches (in reverse order to avoid affecting positions)
    nodesToProcess.reverse().forEach(({ node, matches }) => {
      matches.reverse().forEach(match => {
        if (match.index !== undefined) {
          const videoFile = match[0];
          const before = node.textContent!.substring(0, match.index);
          const after = node.textContent!.substring(match.index + videoFile.length);
          
          // Create text nodes for before and after
          const beforeNode = document.createTextNode(before);
          const afterNode = document.createTextNode(after);
          
          // Create video placeholder
          const videoPlaceholder = document.createElement('div');
          videoPlaceholder.className = 'zendesk-video-embed';
          videoPlaceholder.innerHTML = `
            <p><strong>🎬 Video:</strong> ${videoFile}</p>
            <p><em>Upload this video to Zendesk and replace this placeholder with the embedded video.</em></p>
            <p><strong>Video file:</strong> <code>${videoFile}</code></p>
          `;
          
          // Replace the text node with before text, video placeholder, and after text
          const parent = node.parentNode!;
          parent.insertBefore(beforeNode, node);
          parent.insertBefore(videoPlaceholder, node);
          parent.insertBefore(afterNode, node);
          parent.removeChild(node);
        }
      });
    });
  }

  private generateSimpleTags(content: string, title: string, maxTags: number): string[] {
    // Simplified tag generation for better performance
    const text = this.stripHtml(content + ' ' + title).toLowerCase();
    
    // Quick pattern matching for common tags
    const tags: string[] = [];
    
    if (text.includes('install') || text.includes('setup')) tags.push('installation');
    if (text.includes('error') || text.includes('problem')) tags.push('troubleshooting');
    if (text.includes('admin') || text.includes('administrator')) tags.push('administration');
    if (text.includes('user') || text.includes('guide')) tags.push('user-guide');
    if (text.includes('tutorial') || text.includes('how-to')) tags.push('tutorial');
    if (text.includes('config') || text.includes('setting')) tags.push('configuration');
    if (text.includes('purchase') || text.includes('order')) tags.push('purchase-orders');
    if (text.includes('budget') || text.includes('forecast')) tags.push('budgeting');
    if (text.includes('import') || text.includes('export')) tags.push('data-management');
    
    // Add generic tags based on content type
    if (title.toLowerCase().includes('faq')) tags.push('faq');
    if (text.includes('example')) tags.push('examples');
    
    return [...new Set(tags)].slice(0, maxTags);
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
  }

  private countWords(html: string): number {
    const text = this.stripHtml(html);
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  private getZendeskWarnings(originalHtml: string, sanitizedHtml: string, options: ConversionOptions): string[] {
    const warnings: string[] = [];

    // Check if content was significantly modified during sanitization
    const originalLength = this.stripHtml(originalHtml).length;
    const sanitizedLength = this.stripHtml(sanitizedHtml).length;
    
    if (originalLength > sanitizedLength * 1.2) {
      warnings.push('Some content was removed during HTML sanitization for Zendesk compatibility');
    }

    // Check for MadCap-specific elements that might need attention
    if (originalHtml.includes('data-mc-conditions')) {
      warnings.push('Original content contains conditional text that may need manual review');
    }

    if (originalHtml.includes('data-mc-snippet') || originalHtml.includes('MadCap:snippetBlock')) {
      warnings.push('Original content contains snippets - verify all content was included');
    }

    if (originalHtml.includes('mc-variable') || originalHtml.includes('MadCap:variable')) {
      warnings.push('Original content contains variables - verify proper substitution');
    }

    if (originalHtml.includes('MadCap:dropDown')) {
      warnings.push('MadCap dropdowns converted to collapsible sections - verify functionality in Zendesk');
    }

    // Check for complex tables that might not render well
    if (originalHtml.includes('<table') && originalHtml.includes('colspan')) {
      warnings.push('Complex table structures detected - verify formatting in Zendesk');
    }

    // Check for embedded scripts or styles
    if (originalHtml.includes('<script') || originalHtml.includes('<style')) {
      warnings.push('Scripts and styles were removed for security compliance');
    }

    // Check for video content
    if (originalHtml.includes('.mp4') || originalHtml.includes('.avi') || originalHtml.includes('<video')) {
      if (options.zendeskOptions?.ignoreVideos) {
        warnings.push('Video content detected but ignored per configuration');
      } else {
        warnings.push('Video content detected - upload videos to Zendesk and replace placeholders');
      }
    }

    // Check for custom CSS classes that might not work in Zendesk
    if (originalHtml.includes('class=') && !originalHtml.includes('zendesk-')) {
      warnings.push('Custom CSS classes detected - may need styling adjustments in Zendesk');
    }

    // Check for relative links that might break
    const relativeLinkPattern = /href=["'][^"']*\/[^"']*\.htm/g;
    if (relativeLinkPattern.test(originalHtml)) {
      warnings.push('Relative links detected - verify all links work in Zendesk environment');
    }

    // Check if content had skip conditions that were removed
    if (sanitizedHtml.includes('<!-- Removed content with MadCap conditions:')) {
      warnings.push('Some content was excluded due to MadCap conditions (black, deprecated, paused, halted, discontinued, print only)');
    }

    return warnings;
  }

  // Add Zendesk-specific styling enhancements
  private enhanceForZendeskStyling(document: Document): void {
    // Add CSS classes for better Zendesk styling
    
    // Style code blocks
    const codeBlocks = document.querySelectorAll('pre, code');
    codeBlocks.forEach(block => {
      block.classList.add('zendesk-code');
    });

    // Style blockquotes (notes/warnings)
    const blockquotes = document.querySelectorAll('blockquote');
    blockquotes.forEach(quote => {
      quote.classList.add('zendesk-callout');
    });

    // Style tables
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      table.classList.add('zendesk-table');
      // Ensure table has proper structure
      if (!table.querySelector('thead') && table.querySelector('tr')) {
        const firstRow = table.querySelector('tr');
        if (firstRow) {
          const thead = document.createElement('thead');
          thead.appendChild(firstRow.cloneNode(true));
          table.insertBefore(thead, firstRow);
        }
      }
    });

    // Style lists
    const lists = document.querySelectorAll('ul, ol');
    lists.forEach(list => {
      list.classList.add('zendesk-list');
    });

    // Add spacing classes to improve readability
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
      heading.classList.add('zendesk-heading');
    });

    // Style icon elements and containers
    const icons = document.querySelectorAll('.icon, [class*="icon"]');
    icons.forEach(icon => {
      icon.classList.add('zendesk-icon');
    });

    // Style SVG elements
    const svgs = document.querySelectorAll('svg');
    svgs.forEach(svg => {
      if (!svg.classList.contains('zendesk-svg-icon') && 
          !svg.classList.contains('zendesk-svg-button-icon') && 
          !svg.classList.contains('zendesk-svg-default')) {
        svg.classList.add('zendesk-svg');
      }
    });

    // Style PNG icon images
    const pngIcons = document.querySelectorAll('img.zendesk-png-icon, img.zendesk-png-button-icon');
    pngIcons.forEach(img => {
      if (!img.classList.contains('zendesk-png-icon') && 
          !img.classList.contains('zendesk-png-button-icon')) {
        img.classList.add('zendesk-png-icon');
      }
    });

    // Style keyboard elements
    const kbdElements = document.querySelectorAll('kbd');
    kbdElements.forEach(kbd => {
      if (!kbd.classList.contains('zendesk-key')) {
        kbd.classList.add('zendesk-key');
      }
    });
  }

  // Add Zendesk-specific styling enhancements with configurable CSS approach
  private enhanceForZendeskStylingWithOptions(document: Document, options: ConversionOptions): void {
    const useInlineStyles = options.zendeskOptions?.inlineStyles !== false; // Default: true
    
    // Style code blocks
    const codeBlocks = document.querySelectorAll('pre, code');
    codeBlocks.forEach(block => {
      block.classList.add('zendesk-code');
      if (useInlineStyles) {
        block.setAttribute('style', 
          'background-color: #f8f9fa; ' +
          'border: 1px solid #e9ecef; ' +
          'border-radius: 4px; ' +
          'padding: 0.25em 0.5em; ' +
          'font-family: Monaco, Menlo, Ubuntu Mono, monospace; ' +
          'font-size: 0.9em;'
        );
      }
    });

    // Style blockquotes (notes/warnings)
    const blockquotes = document.querySelectorAll('blockquote');
    blockquotes.forEach(quote => {
      quote.classList.add('zendesk-callout');
      if (useInlineStyles) {
        quote.setAttribute('style', 
          'padding: 1em; ' +
          'margin: 1em 0; ' +
          'border-left: 4px solid #007acc; ' +
          'border-radius: 4px; ' +
          'background-color: #f8f9fa;'
        );
      }
    });

    // Style tables
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      table.classList.add('zendesk-table');
      if (useInlineStyles) {
        table.setAttribute('style', 
          'width: 100%; ' +
          'border-collapse: collapse; ' +
          'margin: 1em 0;'
        );
        
        // Style table cells
        const cells = table.querySelectorAll('th, td');
        cells.forEach(cell => {
          cell.setAttribute('style', 
            'padding: 0.75em; ' +
            'border: 1px solid #dee2e6; ' +
            'text-align: left;'
          );
        });
        
        // Style headers
        const headers = table.querySelectorAll('th');
        headers.forEach(header => {
          header.setAttribute('style', 
            header.getAttribute('style') + ' ' +
            'background-color: #f8f9fa; ' +
            'font-weight: 600;'
          );
        });
      }
      
      // Ensure table has proper structure
      if (!table.querySelector('thead') && table.querySelector('tr')) {
        const firstRow = table.querySelector('tr');
        if (firstRow) {
          const thead = document.createElement('thead');
          thead.appendChild(firstRow.cloneNode(true));
          table.insertBefore(thead, firstRow);
        }
      }
    });

    // Style lists
    const lists = document.querySelectorAll('ul, ol');
    lists.forEach(list => {
      list.classList.add('zendesk-list');
      if (useInlineStyles) {
        list.setAttribute('style', 'margin: 0.5em 0; padding-left: 1.5em;');
      }
    });

    // Add spacing classes to improve readability
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
      heading.classList.add('zendesk-heading');
      if (useInlineStyles) {
        heading.setAttribute('style', 
          'margin-top: 1.5em; ' +
          'margin-bottom: 0.5em; ' +
          'font-weight: 600;'
        );
      }
    });

    // Style icon elements and containers
    const icons = document.querySelectorAll('.icon, [class*="icon"]');
    icons.forEach(icon => {
      icon.classList.add('zendesk-icon');
    });

    // Style SVG elements
    const svgs = document.querySelectorAll('svg');
    svgs.forEach(svg => {
      if (!svg.classList.contains('zendesk-svg-icon') && 
          !svg.classList.contains('zendesk-svg-button-icon') && 
          !svg.classList.contains('zendesk-svg-default')) {
        svg.classList.add('zendesk-svg');
      }
    });

    // Style PNG icon images
    const pngIcons = document.querySelectorAll('img.zendesk-png-icon, img.zendesk-png-button-icon');
    pngIcons.forEach(img => {
      if (!img.classList.contains('zendesk-png-icon') && 
          !img.classList.contains('zendesk-png-button-icon')) {
        img.classList.add('zendesk-png-icon');
      }
    });

    // Style keyboard elements
    const kbdElements = document.querySelectorAll('kbd');
    kbdElements.forEach(kbd => {
      if (!kbd.classList.contains('zendesk-key')) {
        kbd.classList.add('zendesk-key');
      }
      if (useInlineStyles) {
        kbd.setAttribute('style', 
          'background-color: #f5f5f5; ' +
          'border: 1px solid #ccc; ' +
          'border-radius: 3px; ' +
          'box-shadow: 0 1px 0 rgba(0,0,0,0.1); ' +
          'padding: 2px 6px; ' +
          'font-family: Monaco, Menlo, Ubuntu Mono, monospace; ' +
          'font-size: 0.85em; ' +
          'display: inline-block; ' +
          'margin: 0 1px; ' +
          'vertical-align: baseline;'
        );
      }
    });
  }

  // Variable resolution methods adapted from MadCapConverter
  private findProjectPath(inputPath: string): string | null {
    // Find the project path by looking for the Flare project structure
    const pathParts = inputPath.split('/');
    const contentIndex = pathParts.findIndex(part => part === 'Content');
    
    if (contentIndex > 0) {
      // Build path to Project/VariableSets
      const projectBasePath = pathParts.slice(0, contentIndex).join('/');
      return `${projectBasePath}/Project/VariableSets`;
    }
    
    // Fallback to common paths
    const commonPaths = [
      '/Volumes/Envoy Pro/Flare/Spend EN/Project/VariableSets',
      '/Volumes/Envoy Pro/Flare/Administration DE/Project/VariableSets'
    ];
    
    return commonPaths[0];
  }

  private async loadVariableSets(projectPath: string): Promise<void> {
    try {
      if (this.variableCache.has(projectPath)) {
        return;
      }

      const variables = new Map<string, string>();
      
      // Dynamically find all .flvar files in the project directory
      try {
        const { readdir } = await import('fs/promises');
        const files = await readdir(projectPath);
        const flvarFiles = files.filter(file => file.endsWith('.flvar'));
        
        // Load variable files in parallel
        const variablePromises = flvarFiles.map(async (fileName) => {
          try {
            const variableSetPath = resolve(projectPath, fileName);
            const variableContent = await this.readFileWithCache(variableSetPath);
            
            const dom = new JSDOM(variableContent, { contentType: 'application/xml' });
            const document = dom.window.document;
            
            const fileVariables = new Map<string, string>();
            const variableElements = document.querySelectorAll('Variable');
            variableElements.forEach(element => {
              const name = element.getAttribute('Name');
              const value = element.getAttribute('EvaluatedDefinition') || element.textContent?.trim();
              
              if (name && value) {
                fileVariables.set(name, value);
              }
            });
            
            // Variables loaded from ${fileName}
            return fileVariables;
          } catch (error) {
            console.warn(`Could not load variable set ${fileName}:`, error);
            return new Map<string, string>();
          }
        });
        
        // Await all variable file loads and merge results
        const variableMaps = await Promise.all(variablePromises);
        variableMaps.forEach(fileVariables => {
          for (const [name, value] of fileVariables) {
            variables.set(name, value);
          }
        });
        
        // Total variables loaded: ${variables.size} from ${flvarFiles.length} .flvar files
      } catch (error) {
        console.warn('Could not read project directory for .flvar files:', error);
      }
      
      this.variableCache.set(projectPath, variables);
    } catch (error) {
      console.warn('Could not load MadCap variable sets:', error);
    }
  }

  private resolveVariable(variableRef: string): string | null {
    const parts = variableRef.split('.');
    if (parts.length < 2) {
      return null;
    }
    
    const variableName = parts[parts.length - 1];
    
    // Look through all loaded variable sets
    for (const variables of this.variableCache.values()) {
      const value = variables.get(variableName);
      if (value) {
        return value;
      }
    }
    
    // Fallback for common variables
    const fallbackVariables: { [key: string]: string } = {
      // General variables
      'ProductName': 'Uptempo',
      'CompanyShort': 'Uptempo',
      'CompanyName': 'Uptempo GmbH',
      'VersionNumber': 'October 2024',
      
      // Administration screen commands
      'admin.permission.admin_manage-user.name': 'Manage Users',
      'admin.uptempo.user.new_account.label': 'New User',
      'admin.uptempo.user_modal.tabs.account.label': 'Account',
      'admin.user.first_name': 'First Name',
      'admin.request_login.last_name': 'Last Name',
      'commons.add_user_login': 'Login',
      'admin.login.password': 'Password',
      'admin.uptempo.user_modal.form.department.label': 'Department',
      'admin.user_administration.organizational_unit': 'organizational units',
      'admin.uptempo.user_modal.tabs.membership.label': 'Membership',
      'admin.uptempo.user_modal.cards.storage_group.label': 'Storage Group',
      'admin.uptempo.user_modal.change_storage_group.btn': 'Change Storage Group',
      'admin.uptempo.user_drawer.assign_team.btn': 'Assign Team',
      'admin.uptempo.user_drawer.permissions.label': 'Permissions',
      'admin.uptempo.user_modal.assign_role.btn': 'Assign Role',
      'admin.dmc.mpm.form.role': 'role',
      'admin.dmc.mpm.roles.type.admin': 'Administrator',
      'admin.user_configuration.title': 'User Configuration',
      'admin.uptempo.user_page.start_module.label': 'Start Module',
      'admin.uptempo.rights.create.confirm.btn': 'Create User'
    };
    
    // First try the simple variable name
    if (fallbackVariables[variableName]) {
      return fallbackVariables[variableName];
    }
    
    // For Administration_ScreenCommands variables, try removing the prefix
    if (variableRef.startsWith('Administration_ScreenCommands.')) {
      const adminVar = variableRef.substring('Administration_ScreenCommands.'.length);
      if (fallbackVariables[adminVar]) {
        return fallbackVariables[adminVar];
      }
    }
    
    return null;
  }

  private extractVariableName(className: string): string | undefined {
    const dotMatch = className.match(/mc-variable\.(\w+)/)?.[1];
    if (dotMatch) return dotMatch;
    
    const spaceMatch = className.match(/mc-variable\s+([^.\s]+)\.([^.\s]+)/);
    if (spaceMatch) return `${spaceMatch[1]}.${spaceMatch[2]}`;
    
    return undefined;
  }

  private convertToTextFragment(anchorName: string): string {
    // Convert anchor names to text fragments that will match section headings
    // This creates a readable text string that browsers can search for
    const cleanText = anchorName
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters (camelCase)
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/-/g, ' ') // Replace hyphens with spaces
      .trim()
      .toLowerCase();
    
    // For common patterns, create more specific text fragments
    const textFragmentMappings: { [key: string]: string } = {
      'splitting': 'Splitting: One Purchase Order, Several Line Items',
      'amortizing': 'Amortizing: One Purchase Order, Several Months',
      'amortising': 'Amortizing: One Purchase Order, Several Months',
      'creating': 'Creating',
      'editing': 'Editing',
      'deleting': 'Deleting',
      'importing': 'Importing',
      'exporting': 'Exporting'
    };
    
    // Use specific mapping if available, otherwise use the cleaned text
    return textFragmentMappings[cleanText] || cleanText;
  }

  private processVariableTextNodes(document: Document): void {
    // Find text nodes that contain variable references like "General.ProductName"
    const textNodes = document.createTreeWalker(
      document.body || document.documentElement,
      4, // NodeFilter.SHOW_TEXT
      null
    );
    
    const variablePattern = /\bGeneral\.(\w+)\b/g;
    let node;
    const nodesToProcess: { node: Text, matches: RegExpMatchArray[] }[] = [];
    
    while (node = textNodes.nextNode() as Text) {
      const matches = Array.from(node.textContent?.matchAll(variablePattern) || []);
      if (matches.length > 0) {
        nodesToProcess.push({ node, matches });
      }
    }
    
    // Process the matches (in reverse order to avoid affecting positions)
    nodesToProcess.reverse().forEach(({ node, matches }) => {
      let text = node.textContent!;
      matches.reverse().forEach(match => {
        if (match.index !== undefined) {
          const fullVariable = match[0]; // e.g., "General.ProductName"
          const variableName = match[1]; // e.g., "ProductName"
          const resolvedValue = this.resolveVariable(fullVariable);
          
          if (resolvedValue) {
            text = text.substring(0, match.index) + resolvedValue + text.substring(match.index + fullVariable.length);
          }
        }
      });
      node.textContent = text;
    });
  }

  private convertKeyboardShortcuts(document: Document): void {
    // Convert existing keyboard/key styling to <kbd> elements
    
    // 1. Convert elements with keyboard-related classes
    const keyElements = document.querySelectorAll(
      '.key, .keyboard, .kbd, .keystroke, .shortcut, .hotkey, ' +
      '[class*="key-"], [class*="keyboard-"], [class*="kbd-"], ' +
      '.mc-key, .mc-keyboard, .mc-shortcut'
    );
    
    keyElements.forEach(element => {
      const kbd = document.createElement('kbd');
      kbd.className = 'zendesk-key';
      kbd.innerHTML = element.innerHTML;
      
      // Copy any important attributes (but not class)
      const title = element.getAttribute('title');
      if (title) kbd.setAttribute('title', title);
      
      element.parentNode?.replaceChild(kbd, element);
    });

    // 2. Convert text patterns that look like keyboard shortcuts
    const textNodes = document.createTreeWalker(
      document.body || document.documentElement,
      4, // NodeFilter.SHOW_TEXT
      node => {
        // Skip text nodes that are already inside kbd, code, or pre elements
        const parent = (node as Text).parentElement;
        if (parent && ['kbd', 'code', 'pre', 'script', 'style'].includes(parent.tagName.toLowerCase())) {
          return 3; // NodeFilter.FILTER_REJECT
        }
        return 1; // NodeFilter.FILTER_ACCEPT
      }
    );

    // Patterns for common keyboard shortcuts
    const keyboardPatterns = [
      // Ctrl/Cmd combinations: Ctrl+C, Cmd+V, Ctrl+Alt+Del
      /\b(Ctrl|Cmd|Alt|Shift|Meta|Win|Super|⌘|⌥|⇧|⌃)\s*\+\s*([A-Za-z0-9]+(?:\s*\+\s*[A-Za-z0-9]+)*)\b/g,
      // Function keys: F1, F12, etc.
      /\bF([1-9]|1[0-2])\b/g,
      // Special keys in caps: ENTER, TAB, ESC, DELETE, etc.
      /\b(ENTER|RETURN|TAB|ESC|ESCAPE|DELETE|DEL|BACKSPACE|SPACE|HOME|END|PAGEUP|PAGEDOWN|INSERT|INS)\b/g,
      // Arrow keys
      /\b(UP|DOWN|LEFT|RIGHT)\s+(ARROW|KEY)\b/gi,
      // Common single keys when emphasized: "Press A", "Type X"
      /\b(Press|Type|Hit)\s+([A-Za-z0-9])\b/g
    ];

    let node: Node | null;
    const nodesToProcess: { node: Text, matches: Array<{ match: RegExpMatchArray, pattern: number }> }[] = [];

    while (node = textNodes.nextNode()) {
      const textNode = node as Text;
      const allMatches: Array<{ match: RegExpMatchArray, pattern: number }> = [];
      
      keyboardPatterns.forEach((pattern, patternIndex) => {
        const matches = Array.from(textNode.textContent?.matchAll(pattern) || []);
        matches.forEach(match => {
          allMatches.push({ match, pattern: patternIndex });
        });
      });

      if (allMatches.length > 0) {
        // Sort matches by position to process them correctly
        allMatches.sort((a, b) => (a.match.index || 0) - (b.match.index || 0));
        nodesToProcess.push({ node: textNode, matches: allMatches });
      }
    }

    // Process keyboard shortcut matches (in reverse order to avoid affecting positions)
    nodesToProcess.reverse().forEach(({ node, matches }) => {
      let text = node.textContent!;
      let htmlFragments: string[] = [];
      let lastIndex = 0;

      matches.reverse().forEach(({ match, pattern }) => {
        if (match.index !== undefined) {
          const matchText = match[0];
          const beforeText = text.substring(lastIndex, match.index);
          
          let kbdHtml = '';
          if (pattern === 0) {
            // Ctrl/Cmd combinations - split and wrap each part
            const parts = matchText.split(/\s*\+\s*/);
            const kbdParts = parts.map(part => `<kbd class="zendesk-key">${part.trim()}</kbd>`);
            kbdHtml = kbdParts.join('+');
          } else if (pattern === 3) {
            // "Press X" pattern - only wrap the key part
            const keyPart = match[2];
            kbdHtml = `${match[1]} <kbd class="zendesk-key">${keyPart}</kbd>`;
          } else {
            // Simple wrap in kbd
            kbdHtml = `<kbd class="zendesk-key">${matchText}</kbd>`;
          }
          
          htmlFragments.unshift(beforeText + kbdHtml);
          lastIndex = match.index + matchText.length;
        }
      });

      // If we found matches, replace the text node with HTML
      if (htmlFragments.length > 0) {
        const remainingText = text.substring(lastIndex);
        const finalHtml = htmlFragments.join('') + remainingText;
        
        // Create a temporary element to parse the HTML
        const temp = document.createElement('span');
        temp.innerHTML = finalHtml;
        
        // Replace the text node with the parsed HTML content
        const parent = node.parentNode!;
        while (temp.firstChild) {
          parent.insertBefore(temp.firstChild, node);
        }
        parent.removeChild(node);
      }
    });

    // 3. Style existing <kbd> elements
    const existingKbds = document.querySelectorAll('kbd');
    existingKbds.forEach(kbd => {
      if (!kbd.classList.contains('zendesk-key')) {
        kbd.classList.add('zendesk-key');
      }
    });
  }

  // Optimized file reading with caching (shared with MadCapConverter)
  private async readFileWithCache(filePath: string): Promise<string> {
    try {
      const stats = await stat(filePath);
      const cached = ZendeskConverter.fileContentCache.get(filePath);
      
      if (cached && cached.mtime === stats.mtimeMs) {
        return cached.content;
      }
      
      const content = await readFile(filePath, 'utf8');
      ZendeskConverter.fileContentCache.set(filePath, { content, mtime: stats.mtimeMs });
      
      // LRU eviction to prevent memory leaks
      if (ZendeskConverter.fileContentCache.size > ZendeskConverter.MAX_CACHE_SIZE) {
        const firstKey = ZendeskConverter.fileContentCache.keys().next().value as string;
        ZendeskConverter.fileContentCache.delete(firstKey);
      }
      
      return content;
    } catch (error) {
      throw error; // Re-throw to maintain existing error handling
    }
  }

  private generateZendeskStylesheet(): string {
    return `/* Zendesk Help Center CSS - Generated by MadCap Converter */

/* Keyboard Keys */
.zendesk-key, kbd.zendesk-key {
  background-color: #f5f5f5;
  border: 1px solid #ccc;
  border-radius: 3px;
  box-shadow: 0 1px 0 rgba(0,0,0,0.1);
  padding: 2px 6px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.85em;
  display: inline-block;
  margin: 0 1px;
  vertical-align: baseline;
  font-weight: normal;
}

/* Icons and Images */
.zendesk-svg-icon {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: middle;
  fill: currentColor;
}

.zendesk-png-icon {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: middle;
  max-width: 24px;
  max-height: 24px;
}

.zendesk-svg-button-icon {
  width: 16px;
  height: 16px;
  display: inline-block;
  vertical-align: middle;
  margin-right: 4px;
  fill: currentColor;
}

.zendesk-png-button-icon {
  width: 16px;
  height: 16px;
  display: inline-block;
  vertical-align: middle;
  margin-right: 4px;
}

.zendesk-icon-container {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

/* Collapsible Sections */
.zendesk-collapsible {
  margin: 1em 0;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.zendesk-collapsible summary {
  padding: 0.75em 1em;
  background-color: #f8f9fa;
  cursor: pointer;
  border-radius: 4px 4px 0 0;
  font-weight: 600;
}

.zendesk-collapsible[open] summary {
  border-bottom: 1px solid #e0e0e0;
}

.collapsible-content {
  padding: 1em;
}

/* Callouts and Notes */
.zendesk-callout {
  padding: 1em;
  margin: 1em 0;
  border-left: 4px solid #007acc;
  border-radius: 4px;
  background-color: #f8f9fa;
}

.zendesk-note {
  border-left-color: #17a2b8;
}

.zendesk-warning {
  border-left-color: #ffc107;
  background-color: #fff3cd;
}

/* Typography */
.zendesk-heading {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  font-weight: 600;
}

.zendesk-list {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

/* Tables */
.zendesk-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}

.zendesk-table th,
.zendesk-table td {
  padding: 0.75em;
  border: 1px solid #dee2e6;
  text-align: left;
}

.zendesk-table th {
  background-color: #f8f9fa;
  font-weight: 600;
}

/* Code Blocks */
.zendesk-code {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 0.25em 0.5em;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
}

/* Images */
.zendesk-image-small {
  max-width: 32px;
  height: auto;
  display: inline-block;
  vertical-align: middle;
}

.zendesk-image-medium {
  max-width: 300px;
  height: auto;
  margin: 10px 0;
}

.zendesk-image-large {
  max-width: 100%;
  height: auto;
  border: 1px solid #ddd;
  margin: 10px 0;
}

.zendesk-image-default {
  max-width: 600px;
  height: auto;
  margin: 10px 0;
}

/* Video Placeholders */
.zendesk-video-embed {
  background-color: #f8f9fa;
  border: 2px dashed #6c757d;
  border-radius: 8px;
  padding: 2em;
  margin: 1em 0;
  text-align: center;
}

/* Snippet Content */
.snippet-content {
  margin: 0.5em 0;
}

.snippet-placeholder {
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
  padding: 1em;
  margin: 1em 0;
}

/* SVG Elements */
.zendesk-svg {
  max-width: 100%;
  height: auto;
  display: inline-block;
}

.zendesk-svg-default {
  max-width: 100%;
  height: auto;
  display: inline-block;
}
`;
  }
}
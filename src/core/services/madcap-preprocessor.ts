import { JSDOM } from 'jsdom';
import { readFile, stat, readdir, existsSync } from 'fs';
import { readFile as readFileAsync, stat as statAsync, readdir as readdirAsync } from 'fs/promises';
import { resolve, dirname, join } from 'path';

/**
 * Shared MadCap preprocessing service used by both MadCapConverter and ZendeskConverter
 * to ensure consistent handling of MadCap Flare source code elements, variables, and styles.
 */
export class MadCapPreprocessor {
  private variableCache: Map<string, Map<string, string>> = new Map();
  private loadedSnippets: Set<string> = new Set();
  private snippetCache: Map<string, string> = new Map();
  private extractVariables: boolean = false;
  private preserveVariables: boolean = false;
  private extractedVariables: Map<string, { name: string; value: string }> = new Map();
  
  // File content cache for performance
  private static readonly MAX_CACHE_SIZE = 500;
  private static fileContentCache = new Map<string, { content: string; mtime: number }>();

  constructor() {}

  /**
   * Set whether to extract variables instead of resolving them
   */
  setExtractVariables(extract: boolean): void {
    this.extractVariables = extract;
    if (extract) {
      this.extractedVariables.clear(); // Clear previous extraction
    }
  }

  /**
   * Set whether to preserve variable tags unchanged for later processing
   */
  setPreserveVariables(preserve: boolean): void {
    this.preserveVariables = preserve;
  }

  /**
   * Get extracted variables from the last preprocessing
   */
  getExtractedVariables(): { name: string; value: string }[] {
    return Array.from(this.extractedVariables.values());
  }

  /**
   * Main preprocessing method - cleans up MadCap elements, resolves variables, processes snippets
   */
  async preprocessMadCapContent(html: string, inputPath?: string, outputFormat?: string): Promise<string> {
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
    
    // Batch process all MadCap elements in one pass
    await this.processMadCapElementsBatch(document, inputPath);
    
    // Clean up DOM structure for all converters
    this.cleanupDOMStructure(document, outputFormat);
    
    return document.documentElement.outerHTML;
  }

  /**
   * Check if content should be skipped due to MadCap conditions
   */
  shouldSkipContent(html: string): boolean {
    return this.checkSkipConditions(html);
  }

  /**
   * Check if HTML contains MadCap content
   */
  containsMadCapContent(html: string): boolean {
    return html.includes('MadCap:') || 
           html.includes('madcap:') || 
           html.includes('xmlns:MadCap') ||
           html.includes('data-mc-') ||
           html.includes('mc-variable') ||
           html.includes('mc-');
  }

  /**
   * Process MadCap elements for standard HTML conversion (markdown/AsciiDoc)
   */
  processMadCapElementsForHTML(document: Document): void {
    // Handle MadCap:continue attributes on ordered lists first
    this.processMadCapContinueLists(document);
    
    // Convert MadCap elements to standard HTML
    this.convertMadCapElements(document);
    
    // Clean up MadCap attributes
    this.removeMadCapAttributes(document);
  }

  /**
   * Process MadCap continue lists - handles madcap:continue="true" for proper numbering
   */
  private processMadCapContinueLists(document: Document): void {
    // Find all ordered lists in document order
    const allOrderedLists = Array.from(document.querySelectorAll('ol'));
    let currentCounter = 1;
    
    for (const ol of allOrderedLists) {
      const hasContinue = ol.hasAttribute('madcap:continue') && ol.getAttribute('madcap:continue') === 'true';
      
      if (hasContinue) {
        // This list should continue numbering from previous list
        ol.setAttribute('start', currentCounter.toString());
      } else {
        // This is a new list, reset counter
        currentCounter = 1;
      }
      
      // Update counter based on number of items in this list
      const listItems = ol.querySelectorAll(':scope > li');
      currentCounter += listItems.length;
    }
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
      } else if (tagName === 'madcap:xref' || tagName === 'MadCap:xref' || tagName.toLowerCase() === 'madcap:xref') {
        xrefs.push(element);
      } else if (tagName === 'madcap:variable' || tagName === 'MadCap:variable' || tagName === 'MADCAP:VARIABLE' || tagName.toLowerCase() === 'madcap:variable' || element.hasAttribute('data-mc-variable') || (element.hasAttribute('name') && (tagName.includes('variable') || element.className.includes('mc-variable')))) {
        variables.push(element);
      }
    }
    
    // Process each type efficiently
    await this.processSnippetBlocks(snippetBlocks, inputPath);
    await this.processSnippetTexts(snippetTexts, inputPath);
    this.processDropDowns(dropDowns);
    this.processXrefs(xrefs);
    this.processVariables(variables);
    
    // Fallback: Process any remaining madcap:variable elements that weren't caught
    this.processRemainingVariables(document);
    
    // Fallback: Process any remaining xrefs that weren't caught (case-insensitive search)
    this.processRemainingXrefs(document);
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
            
            const rawContent = await readFileAsync(snippetPath, 'utf8');
            snippetContent = await this.processSnippetContent(rawContent);
            this.snippetCache.set(snippetPath, snippetContent);
          }
          
          // Parse snippet content with JSDOM and extract body children with boundary preservation
          const snippetDom = new JSDOM(snippetContent, { contentType: 'text/html' });
          const snippetBody = snippetDom.window.document.body;
          
          if (snippetBody && element.parentNode) {
            // Wrap snippet content in a container to preserve boundaries
            const snippetContainer = element.ownerDocument.createElement('div');
            snippetContainer.className = 'snippet-boundary';
            
            // Insert body children into the container, maintaining structure
            const children = Array.from(snippetBody.children);
            for (const child of children) {
              // Import the node into the target document
              const importedNode = element.ownerDocument.importNode(child, true);
              snippetContainer.appendChild(importedNode);
            }
            
            // Insert the container and remove the original snippet element
            element.parentNode.insertBefore(snippetContainer, element);
            element.parentNode.removeChild(element);
          } else {
            // Fallback: use the old method if no body found
            const div = element.ownerDocument.createElement('div');
            div.className = 'snippet-content';
            div.innerHTML = snippetContent;
            element.parentNode?.replaceChild(div, element);
          }
          
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

  private async processSnippetTexts(snippetTexts: Element[], inputPath?: string): Promise<void> {
    for (const element of snippetTexts) {
      const snippetSrc = element.getAttribute('src');
      
      if (snippetSrc && inputPath) {
        try {
          // Resolve snippet path from MadCap project root, not relative to current document
          // Snippets are always in /Content/Resources/Snippets/ directory
          const snippetPath = this.resolveSnippetPath(snippetSrc, inputPath);
          
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
            
            const rawContent = await readFileAsync(snippetPath, 'utf8');
            snippetContent = await this.processSnippetContent(rawContent);
            this.snippetCache.set(snippetPath, snippetContent);
          }
          
          // Parse snippet content and insert it properly
          const snippetDom = new JSDOM(snippetContent, { contentType: 'text/html' });
          const snippetBody = snippetDom.window.document.body;
          
          if (snippetBody && element.parentNode) {
            // Create a document fragment to hold the snippet content
            const fragment = element.ownerDocument.createDocumentFragment();
            
            // Import all children from the snippet body
            const children = Array.from(snippetBody.childNodes);
            for (const child of children) {
              const importedNode = element.ownerDocument.importNode(child, true);
              fragment.appendChild(importedNode);
            }
            
            // Replace the snippet element with the fragment
            element.parentNode.replaceChild(fragment, element);
          } else {
            // Fallback: create a span with the content
            const span = element.ownerDocument.createElement('span');
            span.innerHTML = snippetContent;
            element.parentNode?.replaceChild(span, element);
          }
          
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

  /**
   * Resolve snippet path from MadCap project structure
   * Snippets are always in /Content/Resources/Snippets/ directory
   */
  private resolveSnippetPath(snippetSrc: string, inputPath: string): string {
    // Find the MadCap project root by looking for /Content/ directory
    const projectRoot = this.findMadCapProjectRoot(inputPath);
    
    // Clean the snippet source path
    let cleanSnippetSrc = snippetSrc;
    
    // Remove leading ../ patterns that try to go relative
    cleanSnippetSrc = cleanSnippetSrc.replace(/^(\.\.\/)+/, '');
    
    // If the path already contains Resources/Snippets/, use it directly from Content root
    if (cleanSnippetSrc.startsWith('Resources/Snippets/')) {
      const snippetPath = join(projectRoot, 'Content', cleanSnippetSrc);
      return snippetPath;
    }
    
    // Remove leading Snippets/ if present (since we'll add the full path)
    cleanSnippetSrc = cleanSnippetSrc.replace(/^Snippets\//, '');
    
    // Construct the full snippet path
    const snippetPath = join(projectRoot, 'Content', 'Resources', 'Snippets', cleanSnippetSrc);
    
    return snippetPath;
  }

  /**
   * Find the MadCap project root directory by walking up from input path
   */
  private findMadCapProjectRoot(inputPath: string): string {
    let currentDir = dirname(inputPath);
    
    // Walk up directory tree to find Content directory
    while (currentDir !== dirname(currentDir)) {
      const contentDir = join(currentDir, 'Content');
      try {
        // Check if Content directory exists
        if (existsSync(contentDir)) {
          return currentDir;
        }
      } catch (error) {
        // Continue searching
      }
      currentDir = dirname(currentDir);
    }
    
    // Fallback: if no Content directory found, assume current directory structure
    // Extract path before /Content/ if it exists
    const contentIndex = inputPath.indexOf('/Content/');
    if (contentIndex >= 0) {
      return inputPath.substring(0, contentIndex);
    }
    
    // Ultimate fallback
    return dirname(inputPath);
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
        // Create a proper structure for AsciiDoc collapsible conversion
        const fragment = dropDown.ownerDocument.createDocumentFragment();
        
        // Create a container that can be detected and converted to collapsible block
        const collapsibleContainer = dropDown.ownerDocument.createElement('div');
        collapsibleContainer.className = 'madcap-dropdown collapsible-block';
        
        // Store the title in a data attribute for AsciiDoc conversion
        const summaryText = hotspot.textContent?.trim() || 'More Information';
        collapsibleContainer.setAttribute('data-title', summaryText);
        
        // Move all body content to the container
        const bodyContent = Array.from(body.childNodes);
        bodyContent.forEach(child => {
          collapsibleContainer.appendChild(child.cloneNode(true));
        });
        
        fragment.appendChild(collapsibleContainer);
        
        // Replace the entire dropDown with the fragment
        dropDown.parentNode?.replaceChild(fragment, dropDown);
      }
    });
  }

  private processXrefs(xrefs: Element[]): void {
    xrefs.forEach(element => {
      const href = element.getAttribute('href');
      const linkText = element.textContent?.trim() || '';
      
      if (href) {
        const link = element.ownerDocument.createElement('a');
        // Convert .htm to .html for output consistency (handles both .htm and .htm#anchor)
        let convertedHref = href;
        if (href.includes('.htm')) {
          convertedHref = href.replace(/\.htm(#|$)/, '.html$1');
        }
        
        link.setAttribute('href', convertedHref);
        link.textContent = linkText || `See ${convertedHref}`;
        
        // Copy any additional attributes that might be useful
        const attributes = element.attributes;
        for (let i = 0; i < attributes.length; i++) {
          const attr = attributes[i];
          if (attr.name !== 'href' && attr.name !== 'MadCap:href' && attr.name !== 'madcap:href') {
            // Skip MadCap-specific attributes but preserve others like class, id, etc.
            if (!attr.name.toLowerCase().startsWith('madcap:')) {
              link.setAttribute(attr.name, attr.value);
            }
          }
        }
        
        element.parentNode?.replaceChild(link, element);
      } else {
        // If no href, just replace with text content
        const textNode = element.ownerDocument.createTextNode(linkText);
        element.parentNode?.replaceChild(textNode, element);
      }
    });
  }

  private processVariables(variables: Element[]): void {
    variables.forEach(element => {
      // If preserveVariables is true, skip processing and leave the variable tags intact
      if (this.preserveVariables) {
        return;
      }

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
        // Check if we should extract variables instead of resolving them
        if (this.extractVariables) {
          // For extraction mode: resolve the variable to get its actual value for the variables file
          const resolvedValue = this.resolveVariable(variableName);
          if (resolvedValue) {
            // Store the extracted variable for later retrieval
            this.extractedVariables.set(variableName, { name: variableName, value: resolvedValue });
          }
          // Convert variable reference to AsciiDoc attribute format
          const asciidocVariableName = this.convertToAsciiDocAttributeName(variableName);
          const textNode = element.ownerDocument.createTextNode(`{${asciidocVariableName}}`);
          element.parentNode?.replaceChild(textNode, element);
        } else {
          // Try to resolve the variable
          const resolvedValue = this.resolveVariable(variableName);
          const textNode = element.ownerDocument.createTextNode(resolvedValue || `{${variableName}}`);
          element.parentNode?.replaceChild(textNode, element);
        }
      } else {
        // If no variable name found, create placeholder
        const placeholder = `{Variable: ${element.outerHTML.substring(0, 50)}...}`;
        const textNode = element.ownerDocument.createTextNode(placeholder);
        element.parentNode?.replaceChild(textNode, element);
      }
    });
  }

  private processRemainingVariables(document: Document): void {
    // If preserveVariables is true, skip processing
    if (this.preserveVariables) {
      return;
    }

    // Use CSS selector to find any remaining variable elements that weren't caught
    // This handles namespace issues with JSDOM
    const remainingVariables = document.querySelectorAll('madcap\\:variable, MadCap\\:variable, MADCAP\\:VARIABLE');
    
    remainingVariables.forEach(element => {
      const variableName = element.getAttribute('name');
      
      if (variableName) {
        // Check if we should extract variables instead of resolving them
        if (this.extractVariables) {
          // For extraction mode: resolve the variable to get its actual value for the variables file
          const resolvedValue = this.resolveVariable(variableName);
          if (resolvedValue) {
            // Store the extracted variable for later retrieval
            this.extractedVariables.set(variableName, { name: variableName, value: resolvedValue });
          }
          // Convert variable reference to AsciiDoc attribute format
          const asciidocVariableName = this.convertToAsciiDocAttributeName(variableName);
          const textNode = element.ownerDocument.createTextNode(`{${asciidocVariableName}}`);
          element.parentNode?.replaceChild(textNode, element);
        } else {
          // Try to resolve the variable
          const resolvedValue = this.resolveVariable(variableName);
          const textNode = element.ownerDocument.createTextNode(resolvedValue || `{${variableName}}`);
          element.parentNode?.replaceChild(textNode, element);
        }
      } else {
        // If no variable name found, create placeholder
        const placeholder = `{Variable: ${element.outerHTML.substring(0, 50)}...}`;
        const textNode = element.ownerDocument.createTextNode(placeholder);
        element.parentNode?.replaceChild(textNode, element);
      }
    });
  }

  private processRemainingXrefs(document: Document): void {
    // Use CSS selector to find any remaining xref elements that weren't caught
    // This handles namespace issues with JSDOM and case variations
    const remainingXrefs = document.querySelectorAll('madcap\\:xref, MadCap\\:xref, MADCAP\\:XREF');
    
    if (remainingXrefs.length > 0) {
      remainingXrefs.forEach(element => {
        const href = element.getAttribute('href');
        const linkText = element.textContent?.trim() || '';
        
        if (href) {
          const link = element.ownerDocument.createElement('a');
          // Convert .htm to .html for output consistency (handles both .htm and .htm#anchor)
          let convertedHref = href;
          if (href.includes('.htm')) {
            convertedHref = href.replace(/\.htm(#|$)/, '.html$1');
          }
          
          link.setAttribute('href', convertedHref);
          link.textContent = linkText || `See ${convertedHref}`;
          
          // Copy any additional attributes that might be useful
          const attributes = element.attributes;
          for (let i = 0; i < attributes.length; i++) {
            const attr = attributes[i];
            if (attr.name !== 'href' && attr.name !== 'MadCap:href' && attr.name !== 'madcap:href') {
              // Skip MadCap-specific attributes but preserve others like class, id, etc.
              if (!attr.name.toLowerCase().startsWith('madcap:')) {
                link.setAttribute(attr.name, attr.value);
              }
            }
          }
          
          element.parentNode?.replaceChild(link, element);
        } else {
          // If no href, just replace with text content
          const textNode = element.ownerDocument.createTextNode(linkText);
          element.parentNode?.replaceChild(textNode, element);
        }
      });
    }
  }

  private convertMadCapElements(document: Document): void {
    // Convert MadCap notes to properly formatted blockquotes
    const notes = document.querySelectorAll('.mc-note, [class*="mc-note"], .note');
    notes.forEach(note => {
      const blockquote = document.createElement('blockquote');
      // Don't add "Note:" prefix here, let the converter handle it
      blockquote.innerHTML = note.innerHTML;
      blockquote.className = 'note'; // Add class for converter to detect
      note.parentNode?.replaceChild(blockquote, note);
    });

    // Convert MadCap warnings/attention to properly formatted blockquotes
    const warnings = document.querySelectorAll('.mc-warning, [class*="mc-warning"], .warning, .attention');
    warnings.forEach(warning => {
      const blockquote = document.createElement('blockquote');
      blockquote.innerHTML = warning.innerHTML;
      blockquote.className = 'warning'; // Add class for converter to detect
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

  private removeMadCapAttributes(document: Document): void {
    // Remove MadCap conditional attributes from all elements
    const elementsWithConditions = document.querySelectorAll('[madcap\\:conditions]');
    elementsWithConditions.forEach(element => {
      element.removeAttribute('madcap:conditions');
    });

    // Remove other MadCap-specific attributes from all elements
    const madcapAttributes = [
      'madcap:html5video', 'madcap:param_controls', 'madcap:param_muted', 
      'madcap:param_loop', 'madcap:param_autoplay', 'madcap:targetname',
      'madcap:ignoretag', 'madcap:exclude', 'madcap:continue'
    ];
    
    document.querySelectorAll('*').forEach(element => {
      madcapAttributes.forEach(attr => {
        if (element.hasAttribute(attr)) {
          element.removeAttribute(attr);
        }
      });
    });
  }

  private extractHeadingLevel(className: string): number | null {
    const match = className.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  private extractVariableName(className: string): string | undefined {
    const dotMatch = className.match(/mc-variable\.(\w+)/)?.[1];
    if (dotMatch) return dotMatch;
    
    const spaceMatch = className.match(/mc-variable\s+([^.\s]+)\.([^.\s]+)/);
    if (spaceMatch) return `${spaceMatch[1]}.${spaceMatch[2]}`;
    
    return undefined;
  }

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
        const files = await readdirAsync(projectPath);
        const flvarFiles = files.filter(file => file.endsWith('.flvar') && !file.startsWith('._'));
        
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
    
    // First, try to find the full variable path in the loaded variable sets
    for (const variables of this.variableCache.values()) {
      // Try the full reference
      const value = variables.get(variableRef);
      if (value) {
        return value;
      }
      
      // Also try just the last part as a fallback
      const variableName = parts[parts.length - 1];
      const fallbackValue = variables.get(variableName);
      if (fallbackValue) {
        return fallbackValue;
      }
    }
    
    // No fallbacks - rely entirely on MadCap project variable sets
    
    return null;
  }

  /**
   * Convert MadCap variable name to AsciiDoc attribute name format
   */
  private convertToAsciiDocAttributeName(variableName: string): string {
    // AsciiDoc attribute names - use kebab-case for consistency with writerside-variable-converter
    return variableName
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-/, '')
      .replace(/-$/, '');
  }

  private async readFileWithCache(filePath: string): Promise<string> {
    try {
      const stats = await statAsync(filePath);
      const cached = MadCapPreprocessor.fileContentCache.get(filePath);
      
      if (cached && cached.mtime === stats.mtimeMs) {
        return cached.content;
      }
      
      const content = await readFileAsync(filePath, 'utf8');
      MadCapPreprocessor.fileContentCache.set(filePath, { content, mtime: stats.mtimeMs });
      
      // LRU eviction to prevent memory leaks
      if (MadCapPreprocessor.fileContentCache.size > MadCapPreprocessor.MAX_CACHE_SIZE) {
        const firstKey = MadCapPreprocessor.fileContentCache.keys().next().value as string;
        MadCapPreprocessor.fileContentCache.delete(firstKey);
      }
      
      return content;
    } catch (error) {
      throw error; // Re-throw to maintain existing error handling
    }
  }

  /**
   * Clean up DOM structure using pure JSDOM operations for all converters
   * This centralizes DOM manipulation that was previously scattered across converters
   */
  private cleanupDOMStructure(document: Document, outputFormat?: string): void {
    // Fix malformed list nesting (sublists as siblings → children)
    this.fixListNesting(document);
    
    // Ensure W3C XHTML compliance
    this.ensureW3CCompliance(document);
    
    // Separate mixed content in paragraphs  
    this.separateMixedContent(document);
    
    // Normalize block structure and remove empty paragraphs
    this.normalizeBlockStructure(document, outputFormat);
  }

  /**
   * Fix malformed list nesting where sublists are siblings instead of children
   * Uses pure JSDOM operations to restructure the DOM
   */
  private fixListNesting(document: Document): void {
    // Find all lists in the document
    const allLists = Array.from(document.querySelectorAll('ol, ul'));
    
    // Process each list to fix nesting issues
    for (const list of allLists) {
      const parent = list.parentElement;
      
      // Skip if this list is already properly nested inside an li
      if (parent && parent.tagName.toLowerCase() === 'li') {
        continue;
      }
      
      // Check if this list should be nested under a previous sibling list item
      const previousSibling = list.previousElementSibling;
      
      if (previousSibling) {
        // Case 1: Previous sibling is a list containing items that should parent this list
        if (previousSibling.tagName.toLowerCase() === 'ol' || previousSibling.tagName.toLowerCase() === 'ul') {
          const lastItem = previousSibling.querySelector(':scope > li:last-child');
          if (lastItem && this.shouldNestList(lastItem)) {
            lastItem.appendChild(list);
            continue;
          }
        }
        
        // Case 2: Previous sibling is any element that suggests this list should be nested
        // This handles cases where MadCap outputs lists as siblings when they should be nested
        if (previousSibling.tagName.toLowerCase() === 'p' || previousSibling.tagName.toLowerCase() === 'div') {
          // Look for the nearest previous list item that could be the parent
          let searchElement = previousSibling.previousElementSibling;
          while (searchElement) {
            if (searchElement.tagName.toLowerCase() === 'ol' || searchElement.tagName.toLowerCase() === 'ul') {
              const lastItem = searchElement.querySelector(':scope > li:last-child');
              if (lastItem) {
                // Check if there are no other list items or headings between this list and the potential parent
                let hasIntermediateBlockingElements = false;
                let checkElement = searchElement.nextElementSibling;
                while (checkElement && checkElement !== list) {
                  const tagName = checkElement.tagName.toLowerCase();
                  if (tagName === 'li' || ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                    hasIntermediateBlockingElements = true;
                    break;
                  }
                  checkElement = checkElement.nextElementSibling;
                }
                
                if (!hasIntermediateBlockingElements) {
                  lastItem.appendChild(list);
                  break;
                }
              }
            }
            searchElement = searchElement.previousElementSibling;
          }
        }
      }
    }
    
    // Second pass: Fix lists that are direct siblings of list items (MadCap pattern)
    const allListItems = Array.from(document.querySelectorAll('li'));
    
    for (const listItem of allListItems) {
      // Check for direct siblings of the list item
      let nextSibling = listItem.nextElementSibling;
      
      // Only nest lists that appear to be sub-lists, not separate document-level lists
      // Check if the next sibling is a list that should be nested
      if (nextSibling && (nextSibling.tagName.toLowerCase() === 'ol' || nextSibling.tagName.toLowerCase() === 'ul')) {
        // Check if this looks like a genuine sub-list vs a separate document section
        const shouldNest = this.shouldNestSiblingList(listItem, nextSibling);
        
        if (shouldNest) {
          const listToMove = nextSibling;
          nextSibling = nextSibling.nextElementSibling; // Save next before moving
          
          // Nest this sub-list under the list item
          listItem.appendChild(listToMove);
        }
      }
      
      // **MadCap specific fix**: Check if this li is the last child of its parent list,
      // and if the next sibling of the parent list is a lower-alpha/lower-roman list
      const parentList = listItem.parentElement;
      if (parentList && (parentList.tagName.toLowerCase() === 'ol' || parentList.tagName.toLowerCase() === 'ul')) {
        // Check if this is the last li in the parent list
        const isLastChild = listItem.nextElementSibling === null;
        
        if (isLastChild) {
          // Check if the parent list has a sibling that's a styled sub-list
          const parentNextSibling = parentList.nextElementSibling;
          
          if (parentNextSibling && (parentNextSibling.tagName.toLowerCase() === 'ol' || parentNextSibling.tagName.toLowerCase() === 'ul')) {
            const style = parentNextSibling.getAttribute('style') || '';
            const isSubList = style.includes('lower-alpha') || style.includes('lower-roman') || style.includes('upper-alpha');
            
            if (isSubList) {
              // This styled list should be nested under the last li of the previous list
              const listToMove = parentNextSibling;
              listItem.appendChild(listToMove);
            }
          }
        }
      }
    }
    
    // Third pass: Fix orphaned paragraphs that should be nested under list items
    this.fixOrphanedParagraphs(document);
  }
  
  /**
   * Fix paragraphs that appear as siblings to list items but should be nested under them
   * This handles MadCap's pattern where explanatory text appears outside list items
   */
  private fixOrphanedParagraphs(document: Document): void {
    // Find all lists and process their direct children to fix orphaned paragraphs
    const allLists = Array.from(document.querySelectorAll('ol, ul'));
    
    for (const list of allLists) {
      // Skip lists that have already been processed (marked with a data attribute)
      if (list.hasAttribute('data-orphaned-paragraphs-fixed')) {
        continue;
      }
      
      // Convert orphaned paragraphs into list items or attach them as continuation content
      let children = Array.from(list.children);
      let lastListItem: Element | null = null;
      let i = 0;
      
      while (i < children.length) {
        const child = children[i];
        const tagName = child.tagName.toLowerCase();
        
        if (tagName === 'li') {
          lastListItem = child;
          i++;
        } else if (tagName === 'p' || tagName === 'div') {
          const text = child.textContent?.trim() || '';
          
          // Skip empty elements
          if (text.length === 0) {
            i++;
            continue;
          }
          
          const isActionItem = this.looksLikeActionItem(text);
          const isExplanatory = this.isExplanatoryText(text);
          
          if (isActionItem) {
            // Convert this paragraph into a list item
            const newListItem = child.ownerDocument.createElement('li');
            newListItem.appendChild(child.cloneNode(true));
            list.replaceChild(newListItem, child);
            
            // Update references
            lastListItem = newListItem;
            children = Array.from(list.children);
            i++;
          } else if (isExplanatory && lastListItem) {
            // Attach explanatory text to the previous list item
            child.remove();
            lastListItem.appendChild(child);
            
            // Refresh the children array since we modified the DOM
            children = Array.from(list.children);
            // Don't increment i since we removed an element
          } else {
            // Default: attach to previous list item if available
            if (lastListItem) {
              child.remove();
              lastListItem.appendChild(child);
              children = Array.from(list.children);
              // Don't increment i since we removed an element
            } else {
              i++;
            }
          }
        } else {
          i++;
        }
      }
      
      
      // Mark this list as processed to prevent duplicate processing
      list.setAttribute('data-orphaned-paragraphs-fixed', 'true');
    }
  }
  
  /**
   * Determine whether a list should be nested under a list item or remain separate
   */
  private shouldNestSiblingList(listItem: Element, candidateList: Element): boolean {
    // Don't nest if there are headings between the list item and the candidate list
    // This indicates the candidate list is a new document section
    let sibling = listItem.nextElementSibling;
    while (sibling && sibling !== candidateList) {
      const tagName = sibling.tagName.toLowerCase();
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        return false; // Heading indicates new section
      }
      sibling = sibling.nextElementSibling;
    }
    
    // **MadCap Flare specific fix**: Check for style-based list hierarchy
    const candidateStyle = candidateList.getAttribute('style') || '';
    const parentList = listItem.parentElement;
    const parentStyle = parentList?.getAttribute('style') || '';
    
    // MadCap hierarchy patterns:
    // numbered (no style) → lower-alpha → lower-roman
    if (candidateStyle.includes('lower-alpha')) {
      // lower-alpha lists should nest under numbered lists (no style) or upper-alpha
      if (!parentStyle.includes('lower-alpha') && !parentStyle.includes('lower-roman')) {
        return true;
      }
    }
    
    if (candidateStyle.includes('lower-roman')) {
      // lower-roman lists should nest under lower-alpha lists
      if (parentStyle.includes('lower-alpha')) {
        return true;
      }
    }
    
    if (candidateStyle.includes('upper-alpha')) {
      // upper-alpha lists should nest under numbered lists
      if (!parentStyle.includes('lower-alpha') && !parentStyle.includes('upper-alpha') && !parentStyle.includes('lower-roman')) {
        return true;
      }
    }
    
    // Check for MadCap class-based hierarchy indicators
    const candidateClass = candidateList.className || '';
    if (candidateClass.includes('sub-list') || candidateClass.includes('nested')) {
      return true;
    }
    
    // Don't nest if the list item's parent list and candidate list are both top-level
    // and appear to be separate document sections
    if (parentList && parentList.parentElement) {
      const grandparent = parentList.parentElement;
      
      // If both lists are direct children of body or main content, they're likely separate sections
      if (grandparent.tagName.toLowerCase() === 'body') {
        // Check if the candidate list has substantial content (suggests it's a main section)
        const candidateListItems = candidateList.querySelectorAll('li');
        if (candidateListItems.length >= 5) { // Increased threshold for MadCap
          // Very large lists are likely separate document sections
          return false;
        }
      }
    }
    
    // Check if the list item text suggests it introduces a sub-list
    const listItemText = listItem.textContent?.trim().toLowerCase() || '';
    const introducesSublist = /\b(include|contains|such as|following|these|consist|comprise|on the|page)\b/.test(listItemText) ||
                             listItemText.endsWith(':') ||
                             listItemText.endsWith(';') ||
                             listItemText.includes('step');
    
    // If text suggests sub-list and it's not a large separate section, nest it
    return introducesSublist;
  }

  /**
   * Check if there are more list items coming up in the children array
   */
  private hasUpcomingListItems(children: Element[], startIndex: number): boolean {
    for (let i = startIndex; i < children.length; i++) {
      const tagName = children[i].tagName.toLowerCase();
      if (tagName === 'li') {
        return true;
      } else if (tagName === 'ol' || tagName === 'ul' || tagName.match(/^h[1-6]$/)) {
        // Stop at other lists or headers
        break;
      }
    }
    return false;
  }
  
  /**
   * Determine if text looks like explanatory content that should be nested under a list item
   */
  private isExplanatoryText(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Common patterns for explanatory text that should be nested
    const explanatoryPatterns = [
      /^the .+ (is|are) displayed/i,
      /^a .+ (is|are) (displayed|shown)/i,
      /^this (opens|displays|shows)/i,
      /^the following/i,
      /^you (can|will|should) now/i,
      /^the system (will|displays)/i,
      /^a (dialog|window|panel|popup|prompt) (is|appears)/i,
      /^the (dialog|window|panel|popup|prompt) (is|appears)/i,
      /^the activity's .+ (is|are) displayed/i,
      /^a security .+ (is|are) displayed/i
    ];
    
    return explanatoryPatterns.some(pattern => pattern.test(text));
  }
  
  /**
   * Determine if text looks like an action item that should be a separate list item
   */
  private looksLikeActionItem(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Patterns that suggest this should be a separate action step
    const actionPatterns = [
      /^(click|select|choose|press|open|close|enter|type|fill)/i,
      /^(go to|navigate to|switch to)/i,
      /^(add|delete|remove|create|edit|modify)/i,
      /^(save|submit|cancel|confirm)/i,
      /^(enable|disable|activate|deactivate)/i,
      /^(drag|drop|move|copy|paste)/i,
      /^(upload|download|import|export)/i,
      /^(login|logout|sign in|sign out)/i,
      /^(review|check|verify|validate)/i
    ];
    
    return actionPatterns.some(pattern => pattern.test(text));
  }
  
  /**
   * Determine if a list item should contain a nested list based on its content
   */
  private shouldNestList(listItem: Element): boolean {
    // Check the last block-level element in the list item
    const blockElements = listItem.querySelectorAll('p, div');
    
    if (blockElements.length > 0) {
      // Check the last paragraph or div
      const lastBlock = blockElements[blockElements.length - 1];
      const blockText = lastBlock.textContent?.trim() || '';
      
      // Check if it ends with a colon (common pattern for lists that should have sublists)
      if (blockText.endsWith(':')) {
        return true;
      }
    } else {
      // No block elements, check direct text content
      // Get only direct text nodes, not nested content
      const directText = Array.from(listItem.childNodes)
        .filter(node => node.nodeType === 3) // TEXT_NODE
        .map(node => node.textContent?.trim() || '')
        .join(' ')
        .trim();
        
      if (directText.endsWith(':')) {
        return true;
      }
    }
    
    // Additional heuristics for MadCap patterns
    // Check if the list item contains introductory phrases that typically precede sublists
    const itemText = listItem.textContent?.toLowerCase() || '';
    const introductoryPatterns = [
      'follow these steps',
      'following steps',
      'do the following',
      'as follows',
      'includes',
      'contains',
      'consists of',
      'comprised of'
    ];
    
    return introductoryPatterns.some(pattern => itemText.includes(pattern));
  }

  /**
   * Separate mixed content in paragraphs (images + text) into separate elements
   * This creates clean DOM structure for converters to work with
   * Skip paragraphs that only contain inline icons to preserve their structure
   */
  private separateMixedContent(document: Document): void {
    const paragraphs = Array.from(document.querySelectorAll('p'));
    
    for (const para of paragraphs) {
      const images = Array.from(para.querySelectorAll('img'));
      const hasText = Array.from(para.childNodes).some(node => 
        node.nodeType === 3 && node.textContent?.trim() !== ''
      );
      
      // Only process paragraphs with both images and meaningful text
      if (images.length > 0 && hasText) {
        // Check if all images are inline icons - if so, don't split the paragraph
        const allImagesAreInline = images.every(img => !this.isBlockImage(img));
        
        if (allImagesAreInline) {
          // Skip splitting if all images are inline - keep the paragraph intact
          continue;
        }
        
        this.splitMixedContentParagraph(para);
      }
    }
  }

  /**
   * Split a paragraph containing both images and text into separate elements
   * Enhanced to detect bullet points and separate them properly
   */
  private splitMixedContentParagraph(para: Element): void {
    const parent = para.parentNode;
    if (!parent) return;
    
    const children = Array.from(para.childNodes);
    let currentPara: Element | null = null;
    const elementsToInsert: Node[] = [];
    
    // Helper to create or get current paragraph
    const ensureCurrentPara = () => {
      if (!currentPara) {
        currentPara = para.ownerDocument.createElement('p');
        elementsToInsert.push(currentPara);
      }
      return currentPara;
    };
    
    // Helper to flush current paragraph
    const flushCurrentPara = () => {
      currentPara = null;
    };
    
    for (const child of children) {
      if (child.nodeType === 3) { // TEXT_NODE
        const text = child.textContent?.trim();
        if (text) {
          // Check if this text starts with a bullet point pattern
          const bulletMatch = text.match(/^(\s*\*\s+)(.*)/);
          if (bulletMatch && currentPara && (currentPara as Element).childNodes.length > 0) {
            // We found a bullet point - flush accumulated content first
            flushCurrentPara();
            
            // Create a list item for the bullet point
            const ul = para.ownerDocument.createElement('ul');
            const li = para.ownerDocument.createElement('li');
            li.textContent = bulletMatch[2]; // Text after the bullet
            ul.appendChild(li);
            elementsToInsert.push(ul);
          } else {
            // Add text to current paragraph
            const p = ensureCurrentPara();
            p.appendChild(child.cloneNode(true));
          }
        }
      } else if (child.nodeType === 1) { // ELEMENT_NODE
        const element = child as Element;
        
        if (element.tagName.toLowerCase() === 'img') {
          if (this.isBlockImage(element)) {
            // Block image - needs its own paragraph
            flushCurrentPara();
            const imgPara = para.ownerDocument.createElement('p');
            imgPara.appendChild(element.cloneNode(true));
            elementsToInsert.push(imgPara);
          } else {
            // Inline image - add to current paragraph
            const p = ensureCurrentPara();
            p.appendChild(element.cloneNode(true));
          }
        } else {
          // Other elements - add to current paragraph
          const p = ensureCurrentPara();
          p.appendChild(element.cloneNode(true));
        }
      }
    }
    
    // Replace the original paragraph with the separated elements
    if (elementsToInsert.length > 0) {
      for (const element of elementsToInsert) {
        parent.insertBefore(element, para);
      }
      parent.removeChild(para);
    }
  }

  /**
   * Determine if an image should be treated as a block image
   * Uses the same logic as the enhanced-list-processor but in pure DOM
   */
  private isBlockImage(img: Element): boolean {
    // Check for IconInline class
    const className = img.getAttribute('class') || img.className || '';
    if (className.includes('IconInline')) {
      return false;
    }
    
    // Check image source for UI patterns
    const src = img.getAttribute('src') || '';
    const isUIIcon = /\/(GUI|gui|Icon|icon|Button|button)/i.test(src);
    const isScreenshot = /\/(Screens|screens|Screenshots|screenshots)/i.test(src) ||
                         src.includes('CreateActivity') ||
                         src.includes('AddFundingSource') ||
                         src.includes('InvestItem') ||
                         src.includes('BudgetTab') ||
                         src.includes('FundingSource');
    
    // Screenshots should always be block
    if (isScreenshot) {
      return true;
    }
    
    // UI icons are typically inline
    if (isUIIcon) {
      return false;
    }
    
    // Check dimensions
    const width = img.getAttribute('width');
    const height = img.getAttribute('height');
    if (width && height) {
      const w = parseInt(width);
      const h = parseInt(height);
      if (w <= 32 && h <= 32) {
        return false;
      }
    }
    
    // Default to block for larger images
    return true;
  }

  /**
   * Normalize block structure and remove problematic empty paragraphs
   */
  private normalizeBlockStructure(document: Document, outputFormat?: string): void {
    // Skip text node whitespace normalization - it breaks block element detection
    // this.normalizeTextNodeWhitespace(document);
    
    // Remove empty paragraphs that don't contain images or variables
    const emptyParagraphs = Array.from(document.querySelectorAll('p')).filter(p => {
      const text = p.textContent?.trim() || '';
      const hasImage = p.querySelector('img') !== null;
      const hasVariables = p.querySelector('MadCap\\:variable, madcap\\:variable') !== null;
      return text.length === 0 && !hasImage && !hasVariables;
    });
    
    emptyParagraphs.forEach(p => p.remove());
    
    // Convert common HTML formatting to clean structure
    // Skip this for formats that handle their own formatting
    const skipFormats = ['zendesk', 'markdown', 'enhanced-markdown', 'madcap-markdown', 'pandoc-markdown', 'writerside-markdown'];
    if (outputFormat && !skipFormats.includes(outputFormat)) {
      // Only apply for AsciiDoc and other formats that need it
      this.normalizeHtmlFormatting(document);
    }
    
    // Ensure proper spacing between block elements
    const blockElements = Array.from(document.querySelectorAll('p, ul, ol, dl, blockquote, h1, h2, h3, h4, h5, h6'));
    for (let i = 0; i < blockElements.length - 1; i++) {
      const current = blockElements[i];
      const next = blockElements[i + 1];
      
      // Ensure there's proper separation between consecutive block elements
      if (current.nextSibling === next && current.parentNode === next.parentNode) {
        // They're direct siblings - this is fine for DOM processing
        continue;
      }
    }
  }

  /**
   * Normalize trailing whitespace in all text nodes throughout the document
   * This ensures consistent formatting before conversion processing
   */
  private normalizeTextNodeWhitespace(document: Document): void {
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      4 // NodeFilter.SHOW_TEXT
    );
    
    let textNode;
    while (textNode = walker.nextNode()) {
      if (textNode.nodeType === 3) { // TEXT_NODE
        const originalText = textNode.textContent || '';
        
        // Normalize whitespace patterns:
        // 1. Remove excessive whitespace (multiple spaces/tabs/newlines)
        // 2. Preserve single spaces between words
        // 3. Remove leading/trailing whitespace from text nodes
        // 4. Preserve meaningful paragraph breaks
        
        let normalizedText;
        
        // Special handling for text nodes that are only whitespace
        if (originalText.match(/^\s+$/)) {
          if (originalText.includes('\n')) {
            // This was likely a meaningful paragraph break - preserve as single space
            normalizedText = ' ';
          } else {
            // Pure whitespace without line breaks - preserve minimal spacing
            normalizedText = originalText.length > 1 ? ' ' : originalText;
          }
        } else {
          // For text with actual content, be more conservative with whitespace
          // Don't normalize whitespace for text nodes - this breaks block element detection
          normalizedText = originalText;
        }
        
        // Only update if the text actually changed
        if (normalizedText !== originalText) {
          textNode.textContent = normalizedText;
        }
      }
    }
  }

  /**
   * Normalize HTML formatting elements for better AsciiDoc conversion
   */
  private normalizeHtmlFormatting(document: Document): void {
    // Convert <i> tags to _italic_ markdown-style for easier AsciiDoc conversion
    const italicElements = Array.from(document.querySelectorAll('i'));
    italicElements.forEach(italic => {
      const textNode = document.createTextNode(`_${italic.textContent}_`);
      italic.parentNode?.replaceChild(textNode, italic);
    });

    // Convert <b>, <strong> tags to *bold* markdown-style
    const boldElements = Array.from(document.querySelectorAll('b, strong'));
    boldElements.forEach(bold => {
      const textNode = document.createTextNode(`*${bold.textContent}*`);
      bold.parentNode?.replaceChild(textNode, bold);
    });

    // Convert <code> tags to `code` markdown-style
    const codeElements = Array.from(document.querySelectorAll('code'));
    codeElements.forEach(code => {
      const textNode = document.createTextNode(`\`${code.textContent}\``);
      code.parentNode?.replaceChild(textNode, code);
    });
  }

  /**
   * Ensure W3C XHTML compliance for the processed document
   */
  private ensureW3CCompliance(document: Document): void {
    // Fix self-closing tags for XHTML compliance
    this.fixSelfClosingTags(document);
    
    // Ensure proper list nesting for W3C compliance
    this.ensureProperListNesting(document);
    
    // Fix invalid HTML structures
    this.fixInvalidNesting(document);
    
    // Ensure proper attributes and encoding
    this.normalizeAttributes(document);
  }

  /**
   * Fix self-closing tags to be XHTML compliant
   */
  private fixSelfClosingTags(document: Document): void {
    // Fix img tags
    const images = Array.from(document.querySelectorAll('img'));
    images.forEach(img => {
      // Ensure all required attributes are present
      if (!img.getAttribute('alt')) {
        img.setAttribute('alt', img.getAttribute('title') || '');
      }
      // JSDOM will handle self-closing syntax in serialization
    });

    // Fix br tags, hr tags, input tags, etc.
    const voidElements = ['br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
    voidElements.forEach(tagName => {
      const elements = Array.from(document.querySelectorAll(tagName));
      elements.forEach(element => {
        // JSDOM handles void elements correctly in XHTML mode
        // Just ensure they don't have text content
        if (element.textContent) {
          element.textContent = '';
        }
      });
    });
  }

  /**
   * Ensure lists are properly nested according to W3C standards
   */
  private ensureProperListNesting(document: Document): void {
    // Find all lists that are direct children of list items
    const allLists = Array.from(document.querySelectorAll('li > ol, li > ul'));
    
    allLists.forEach(list => {
      const listItem = list.parentElement as Element;
      
      // Ensure the list is at the end of the list item
      // W3C requires: text content first, then nested lists
      const listItemChildren = Array.from(listItem.childNodes);
      const listIndex = listItemChildren.indexOf(list);
      
      // Move all text and inline content before the list
      const contentBeforeList: Node[] = [];
      const contentAfterList: Node[] = [];
      
      listItemChildren.forEach((child, index) => {
        if (index < listIndex && child.nodeType === 3 && child.textContent?.trim()) {
          // Text content before list - keep it
          contentBeforeList.push(child);
        } else if (index > listIndex) {
          // Content after list - should be moved before
          contentAfterList.push(child);
        }
      });
      
      // Reorganize: content first, then lists
      contentAfterList.forEach(node => {
        listItem.insertBefore(node, list);
      });
    });
  }

  /**
   * Fix invalid HTML nesting structures
   */
  private fixInvalidNesting(document: Document): void {
    // Fix block elements inside inline elements
    const inlineElements = ['span', 'a', 'em', 'strong', 'i', 'b', 'code', 'small'];
    const blockElements = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre'];
    
    inlineElements.forEach(inlineTag => {
      const inlineEls = Array.from(document.querySelectorAll(inlineTag));
      
      inlineEls.forEach(inlineEl => {
        blockElements.forEach(blockTag => {
          const blockChild = inlineEl.querySelector(blockTag);
          if (blockChild) {
            // Invalid: block element inside inline element
            // Solution: Split the inline element or restructure
            console.warn(`W3C Compliance: Found ${blockTag} inside ${inlineTag}, restructuring...`);
            
            // Move the block element outside and split the inline element
            const parent = inlineEl.parentElement;
            if (parent) {
              parent.insertBefore(blockChild, inlineEl.nextSibling);
            }
          }
        });
      });
    });
  }

  /**
   * Normalize attributes for XHTML compliance
   */
  private normalizeAttributes(document: Document): void {
    // Ensure all attributes are properly quoted and lowercase
    const allElements = Array.from(document.querySelectorAll('*'));
    
    allElements.forEach(element => {
      // Convert attribute names to lowercase
      const attributes = Array.from(element.attributes);
      attributes.forEach(attr => {
        if (attr.name !== attr.name.toLowerCase()) {
          element.setAttribute(attr.name.toLowerCase(), attr.value);
          element.removeAttribute(attr.name);
        }
      });
      
      // Ensure boolean attributes are properly formatted for XHTML
      ['checked', 'disabled', 'readonly', 'selected', 'multiple'].forEach(boolAttr => {
        if (element.hasAttribute(boolAttr)) {
          element.setAttribute(boolAttr, boolAttr);
        }
      });
    });
  }

  /**
   * Static method for batch service to check if file should be skipped
   */
  static shouldSkipFile(content: string): boolean {
    const preprocessor = new MadCapPreprocessor();
    return preprocessor.shouldSkipContent(content);
  }
}
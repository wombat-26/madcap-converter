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
   * Get extracted variables from the last preprocessing
   */
  getExtractedVariables(): { name: string; value: string }[] {
    return Array.from(this.extractedVariables.values());
  }

  /**
   * Main preprocessing method - cleans up MadCap elements, resolves variables, processes snippets
   */
  async preprocessMadCapContent(html: string, inputPath?: string): Promise<string> {
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
    this.cleanupDOMStructure(document);
    
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
      } else if (tagName === 'madcap:xref') {
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
      console.log(`Resolving snippet (with Resources/Snippets): ${snippetSrc} → ${snippetPath}`);
      return snippetPath;
    }
    
    // Remove leading Snippets/ if present (since we'll add the full path)
    cleanSnippetSrc = cleanSnippetSrc.replace(/^Snippets\//, '');
    
    // Construct the full snippet path
    const snippetPath = join(projectRoot, 'Content', 'Resources', 'Snippets', cleanSnippetSrc);
    
    console.log(`Resolving snippet (adding Resources/Snippets): ${snippetSrc} → ${snippetPath}`);
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
        // Create a proper heading structure for AsciiDoc conversion
        const fragment = dropDown.ownerDocument.createDocumentFragment();
        
        // Create heading from hotspot text
        const summaryText = hotspot.textContent?.trim() || 'More Information';
        const heading = dropDown.ownerDocument.createElement('h3');
        heading.textContent = summaryText;
        heading.className = 'dropdown-heading';
        fragment.appendChild(heading);
        
        // Create content container with a line break
        const contentDiv = dropDown.ownerDocument.createElement('div');
        contentDiv.className = 'dropdown-content';
        
        // Move all body content to the container
        const bodyContent = Array.from(body.childNodes);
        bodyContent.forEach(child => {
          contentDiv.appendChild(child.cloneNode(true));
        });
        
        fragment.appendChild(contentDiv);
        
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
    // AsciiDoc attribute names must start with letter/underscore and contain only alphanumeric, hyphen, underscore
    return variableName
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/^[^a-zA-Z_]/, '_')
      .toLowerCase();
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
  private cleanupDOMStructure(document: Document): void {
    // Fix malformed list nesting (sublists as siblings → children)
    this.fixListNesting(document);
    
    // Separate mixed content in paragraphs  
    this.separateMixedContent(document);
    
    // Normalize block structure and remove empty paragraphs
    this.normalizeBlockStructure(document);
  }

  /**
   * Fix malformed list nesting where sublists are siblings instead of children
   * Uses pure JSDOM operations to restructure the DOM
   */
  private fixListNesting(document: Document): void {
    // Find all list items that should have sublists as children
    const allLists = Array.from(document.querySelectorAll('ol, ul'));
    
    for (const list of allLists) {
      const listItems = Array.from(list.querySelectorAll(':scope > li'));
      
      for (let i = 0; i < listItems.length; i++) {
        const currentLi = listItems[i];
        let nextSibling = currentLi.nextElementSibling;
        
        // Check if the next sibling is a list that should be nested
        while (nextSibling && (nextSibling.tagName.toLowerCase() === 'ol' || nextSibling.tagName.toLowerCase() === 'ul')) {
          const currentText = currentLi.textContent?.trim() || '';
          
          // If current li ends with colon, nest the following list
          if (currentText.endsWith(':')) {
            const listToMove = nextSibling;
            nextSibling = nextSibling.nextElementSibling; // Get next before moving
            currentLi.appendChild(listToMove);
          } else {
            break;
          }
        }
      }
    }
  }

  /**
   * Separate mixed content in paragraphs (images + text) into separate elements
   * This creates clean DOM structure for converters to work with
   */
  private separateMixedContent(document: Document): void {
    const paragraphs = Array.from(document.querySelectorAll('p'));
    
    for (const para of paragraphs) {
      const hasImage = para.querySelector('img') !== null;
      const hasText = Array.from(para.childNodes).some(node => 
        node.nodeType === 3 && node.textContent?.trim() !== ''
      );
      
      // Only process paragraphs with both images and meaningful text
      if (hasImage && hasText) {
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
    let currentTextContent = '';
    const elementsToInsert: Node[] = [];
    
    for (const child of children) {
      if (child.nodeType === 3) { // TEXT_NODE
        const text = child.textContent?.trim();
        if (text) {
          // Check if this text starts with a bullet point pattern
          const bulletMatch = text.match(/^(\s*\*\s+)(.*)/);
          if (bulletMatch && currentTextContent.trim()) {
            // We found a bullet point - flush accumulated text first
            const textPara = para.ownerDocument.createElement('p');
            textPara.innerHTML = currentTextContent.trim();
            elementsToInsert.push(textPara);
            currentTextContent = '';
            
            // Create a list item for the bullet point
            const ul = para.ownerDocument.createElement('ul');
            const li = para.ownerDocument.createElement('li');
            li.textContent = bulletMatch[2]; // Text after the bullet
            ul.appendChild(li);
            elementsToInsert.push(ul);
          } else {
            currentTextContent += text + ' ';
          }
        }
      } else if (child.nodeType === 1) { // ELEMENT_NODE
        const element = child as Element;
        
        if (element.tagName.toLowerCase() === 'img') {
          // Flush accumulated text before the image
          if (currentTextContent.trim()) {
            const textPara = para.ownerDocument.createElement('p');
            textPara.innerHTML = currentTextContent.trim();
            elementsToInsert.push(textPara);
            currentTextContent = '';
          }
          
          // Create standalone paragraph for the image if it's a block image
          if (this.isBlockImage(element)) {
            const imgPara = para.ownerDocument.createElement('p');
            imgPara.appendChild(element.cloneNode(true));
            elementsToInsert.push(imgPara);
          } else {
            // For inline images, include in the next text block
            currentTextContent += element.outerHTML + ' ';
          }
        } else {
          // Other elements become part of text content
          currentTextContent += element.outerHTML + ' ';
        }
      }
    }
    
    // Flush any remaining text
    if (currentTextContent.trim()) {
      const textPara = para.ownerDocument.createElement('p');
      textPara.innerHTML = currentTextContent.trim();
      elementsToInsert.push(textPara);
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
  private normalizeBlockStructure(document: Document): void {
    // Skip text node whitespace normalization - it breaks block element detection
    // this.normalizeTextNodeWhitespace(document);
    
    // Remove empty paragraphs that don't contain images
    const emptyParagraphs = Array.from(document.querySelectorAll('p')).filter(p => {
      const text = p.textContent?.trim() || '';
      const hasImage = p.querySelector('img') !== null;
      return text.length === 0 && !hasImage;
    });
    
    emptyParagraphs.forEach(p => p.remove());
    
    // Convert common HTML formatting to clean structure for AsciiDoc
    this.normalizeHtmlFormatting(document);
    
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
   * Static method for batch service to check if file should be skipped
   */
  static shouldSkipFile(content: string): boolean {
    const preprocessor = new MadCapPreprocessor();
    return preprocessor.shouldSkipContent(content);
  }
}
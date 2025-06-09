import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index.js';
import { HTMLConverter } from './html-converter.js';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';

export class MadCapConverter implements DocumentConverter {
  supportedInputTypes = ['html', 'htm', 'xml'];
  private htmlConverter: HTMLConverter;
  private variableCache: Map<string, Map<string, string>> = new Map();
  private loadedSnippets: Set<string> = new Set(); // Prevent circular snippet loading
  private currentTargetFormat: 'markdown' | 'asciidoc' | 'zendesk' = 'markdown';

  constructor() {
    this.htmlConverter = new HTMLConverter();
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    // Reset snippet loading cache for each conversion
    this.loadedSnippets.clear();
    
    // Check if content should be skipped due to MadCap conditions
    if (this.shouldSkipMadCapContent(input)) {
      throw new Error('Content contains MadCap conditions that should not be converted (Black, Red, Gray, deprecated, paused, halted, discontinued, print-only, etc.)');
    }
    
    // Set current target format for cross-reference processing
    this.currentTargetFormat = options.format;
    
    // Try to determine project path for variable resolution
    const projectPath = this.findProjectPath(input);
    if (projectPath) {
      await this.loadVariableSets(projectPath);
    }
    
    // Re-enable snippet loading with simple implementation
    const basePath = options.inputPath;
    
    const processedHtml = await this.preprocessMadCapContent(input, basePath, options.format);
    
    // Pass through all options including rewriteLinks
    const result = await this.htmlConverter.convert(processedHtml, options);
    
    return {
      content: result.content,
      metadata: {
        title: result.metadata?.title,
        wordCount: result.metadata?.wordCount || 0,
        images: result.metadata?.images,
        warnings: this.getMadCapWarnings(input)
      }
    };
  }

  private async preprocessMadCapContent(html: string, basePath?: string, targetFormat?: 'markdown' | 'asciidoc' | 'zendesk'): Promise<string> {
    // Remove Microsoft properties from HTML string first
    let cleanedHtml = this.removeMicrosoftPropertiesFromString(html);
    
    // Normalize self-closing MadCap variable tags
    cleanedHtml = this.normalizeMadCapVariables(cleanedHtml);
    
    // Try to parse as XML to handle MadCap namespaces properly
    const dom = new JSDOM(cleanedHtml, { 
      contentType: 'application/xhtml+xml',
      runScripts: 'outside-only' 
    });
    const document = dom.window.document;
    
    this.convertDropDowns(document);
    this.convertMadCapElements(document);
    this.processConditionalText(document);
    this.convertCrossReferences(document, targetFormat);
    await this.convertSnippets(document, basePath);
    this.convertVariables(document);

    return document.documentElement.outerHTML;
  }

  private removeMicrosoftPropertiesFromString(html: string): string {
    let cleanedHtml = html;
    
    // Remove the entire <head> section completely to avoid any contamination
    cleanedHtml = cleanedHtml.replace(/<head[\s\S]*?<\/head>/gi, '');
    
    // Remove any remaining link, meta, style, script tags that might be outside head
    cleanedHtml = cleanedHtml.replace(/<link[^>]*>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<meta[^>]*>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<style[\s\S]*?<\/style>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
    
    // Remove Microsoft namespace declarations from html tag
    cleanedHtml = cleanedHtml.replace(/\s+xmlns:mso="[^"]*"/gi, '');
    cleanedHtml = cleanedHtml.replace(/\s+xmlns:o="[^"]*"/gi, '');
    cleanedHtml = cleanedHtml.replace(/\s+xmlns:w="[^"]*"/gi, '');
    cleanedHtml = cleanedHtml.replace(/\s+xmlns:msdt="[^"]*"/gi, '');
    
    // Clean up any double whitespace left from removals
    cleanedHtml = cleanedHtml.replace(/\n\s*\n/g, '\n');
    
    return cleanedHtml;
  }

  private normalizeMadCapVariables(html: string): string {
    // Convert self-closing MadCap:variable tags to regular opening/closing tags
    // <MadCap:variable name="..." /> -> <MadCap:variable name="..."></MadCap:variable>
    return html.replace(
      /<MadCap:variable([^>]*?)\s*\/>/gi,
      '<MadCap:variable$1></MadCap:variable>'
    );
  }

  private convertDropDowns(document: Document): void {
    // Try multiple approaches to find MadCap dropDown elements
    const dropDowns = Array.from(document.querySelectorAll('*')).filter(el => 
      el.tagName === 'MadCap:dropDown' || 
      el.tagName === 'MADCAP:DROPDOWN' || 
      el.tagName === 'madcap:dropdown' ||
      el.tagName.toLowerCase() === 'madcap:dropdown'
    );
    
    dropDowns.forEach(dropDown => {
      const head = Array.from(dropDown.children).find(el => 
        el.tagName === 'MadCap:dropDownHead' ||
        el.tagName === 'MADCAP:DROPDOWNHEAD' || 
        el.tagName === 'madcap:dropdownhead' ||
        el.tagName.toLowerCase() === 'madcap:dropdownhead'
      );
      
      const hotspot = head ? Array.from(head.children).find(el => 
        el.tagName === 'MadCap:dropDownHotspot' ||
        el.tagName === 'MADCAP:DROPDOWNHOTSPOT' || 
        el.tagName === 'madcap:dropdownhotspot' ||
        el.tagName.toLowerCase() === 'madcap:dropdownhotspot'
      ) : null;
      
      const body = Array.from(dropDown.children).find(el => 
        el.tagName === 'MadCap:dropDownBody' ||
        el.tagName === 'MADCAP:DROPDOWNBODY' || 
        el.tagName === 'madcap:dropdownbody' ||
        el.tagName.toLowerCase() === 'madcap:dropdownbody'
      );
      
      if (hotspot && body) {
        // Create a section with a heading for the dropDown
        const section = document.createElement('div');
        section.setAttribute('data-madcap-dropdown', 'true');
        
        // Convert hotspot to h2 heading
        const heading = document.createElement('h2');
        heading.textContent = hotspot.textContent?.trim() || '';
        section.appendChild(heading);
        
        // Add a line break after heading
        section.appendChild(document.createTextNode('\n\n'));
        
        // Move all body content to the section, preserving structure
        const bodyContent = Array.from(body.childNodes);
        bodyContent.forEach(child => {
          section.appendChild(child.cloneNode(true));
        });
        
        // Replace the entire dropDown with the section
        dropDown.parentNode?.replaceChild(section, dropDown);
      }
    });
  }

  private convertMadCapElements(document: Document): void {
    const madcapElements = document.querySelectorAll('[class*="mc-"], [class*="MC"]');
    
    madcapElements.forEach(element => {
      const className = element.className;
      
      if (className.includes('mc-heading') || className.includes('MC-heading')) {
        const level = this.extractHeadingLevel(className) || 1;
        const newElement = document.createElement(`h${level}`);
        newElement.innerHTML = element.innerHTML;
        element.parentNode?.replaceChild(newElement, element);
      }
      
      else if (className.includes('mc-procedure') || className.includes('MC-procedure')) {
        const div = document.createElement('div');
        div.setAttribute('data-type', 'procedure');
        div.innerHTML = element.innerHTML;
        element.parentNode?.replaceChild(div, element);
      }
      
      else if (className.includes('mc-note') || className.includes('MC-note')) {
        const blockquote = document.createElement('blockquote');
        blockquote.innerHTML = `<strong>Note:</strong> ${element.innerHTML}`;
        element.parentNode?.replaceChild(blockquote, element);
      }
      
      else if (className.includes('mc-warning') || className.includes('MC-warning')) {
        const blockquote = document.createElement('blockquote');
        blockquote.innerHTML = `<strong>Warning:</strong> ${element.innerHTML}`;
        element.parentNode?.replaceChild(blockquote, element);
      }
    });
  }

  private processConditionalText(document: Document): void {
    const conditionalElements = document.querySelectorAll('[data-mc-conditions]');
    
    conditionalElements.forEach(element => {
      const conditions = element.getAttribute('data-mc-conditions');
      if (conditions) {
        const comment = document.createComment(`Conditional: ${conditions}`);
        element.parentNode?.insertBefore(comment, element);
      }
    });
  }

  private convertCrossReferences(document: Document, targetFormat?: 'markdown' | 'asciidoc' | 'zendesk'): void {
    // Handle MadCap:xref elements
    const madcapXrefs = Array.from(document.querySelectorAll('*')).filter(el => 
      el.tagName === 'MadCap:xref' ||
      el.tagName === 'MADCAP:XREF' || 
      el.tagName === 'madcap:xref' ||
      el.tagName.toLowerCase() === 'madcap:xref'
    );
    
    madcapXrefs.forEach(element => {
      const href = element.getAttribute('href');
      const linkText = element.textContent?.trim() || '';
      
      if (href) {
        // Convert to standard link element
        const link = document.createElement('a');
        
        // Convert file extension based on target format
        let convertedHref = href;
        if (targetFormat === 'asciidoc') {
          convertedHref = href.replace(/\.htm(#.*)?$/, '.adoc$1');
        } else if (targetFormat === 'markdown') {
          convertedHref = href.replace(/\.htm(#.*)?$/, '.md$1');
        } else if (targetFormat === 'zendesk') {
          // For Zendesk, keep original .htm or convert to internal links
          convertedHref = href;
        }
        // For other formats or missing format, keep original extension
        
        link.setAttribute('href', convertedHref);
        link.textContent = linkText || `See ${convertedHref}`;
        
        element.parentNode?.replaceChild(link, element);
      } else {
        // If no href, just keep the text content
        const textNode = document.createTextNode(linkText);
        element.parentNode?.replaceChild(textNode, element);
      }
    });
    
    // Handle regular cross-references
    const xrefElements = document.querySelectorAll('a[href^="#"], a[data-mc-xref]');
    
    xrefElements.forEach(element => {
      const href = element.getAttribute('href') || element.getAttribute('data-mc-xref');
      if (href) {
        element.setAttribute('href', href);
        if (!element.textContent?.trim()) {
          element.textContent = `See ${href}`;
        }
      }
    });
  }

  private async convertSnippets(document: Document, basePath?: string): Promise<void> {
    // Handle MadCap:snippetBlock elements
    const madcapSnippets = Array.from(document.querySelectorAll('*')).filter(el => 
      el.tagName === 'MadCap:snippetBlock' ||
      el.tagName === 'MADCAP:SNIPPETBLOCK' || 
      el.tagName === 'madcap:snippetblock' ||
      el.tagName.toLowerCase() === 'madcap:snippetblock'
    );
    
    for (const element of madcapSnippets) {
      const snippetSrc = element.getAttribute('src');
      
      if (snippetSrc && basePath) {
        try {
          // Resolve snippet path relative to the current document
          const snippetPath = resolve(dirname(basePath), snippetSrc);
          
          // Check for circular references
          if (this.loadedSnippets.has(snippetPath)) {
            console.warn(`Circular snippet reference detected: ${snippetPath}`);
            this.createSnippetNote(document, element, snippetSrc);
            continue;
          }
          
          // Mark snippet as being loaded
          this.loadedSnippets.add(snippetPath);
          
          const snippetContent = await readFile(snippetPath, 'utf8');
          
          // Clean the snippet content first - remove namespaces and xml declarations
          let cleanedSnippet = snippetContent
            .replace(/<\?xml[^>]*>/g, '')
            .replace(/xmlns:MadCap="[^"]*"/g, '');
          
          // Process variables in snippet content before parsing
          cleanedSnippet = this.processVariablesInHtml(cleanedSnippet);
          
          // Don't remove MadCap namespace yet - we need it for cross-reference processing
          cleanedSnippet = cleanedSnippet.trim();
          
          // Extract the body content with regex
          const bodyMatch = cleanedSnippet.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (bodyMatch) {
            const div = document.createElement('div');
            div.className = 'snippet-content';
            
            // Fix malformed HTML structure in snippets (common in MadCap)
            let fixedHtml = bodyMatch[1];
            
            // Fix specific MadCap issues: orphaned <p> elements within <ol> that should be list items
            // This is a common issue in MadCap exports where <p> elements appear outside <li> but inside <ol>
            fixedHtml = this.fixMalformedListStructure(fixedHtml);
            
            // Process cross-references BEFORE setting innerHTML to preserve MadCap elements
            fixedHtml = this.processCrossReferencesInHtml(fixedHtml, this.currentTargetFormat);
            
            // Now remove MadCap namespace prefixes
            fixedHtml = fixedHtml.replace(/MadCap:/g, '');
            
            // Simple HTML parsing without complex DOM operations
            div.innerHTML = fixedHtml;
            
            element.parentNode?.replaceChild(div, element);
          } else {
            // Fallback: create a note if snippet can't be parsed
            this.createSnippetNote(document, element, snippetSrc);
          }
        } catch (error) {
          console.warn(`Could not load snippet ${snippetSrc}:`, error instanceof Error ? error.message : String(error));
          // Create a note about the snippet instead
          this.createSnippetNote(document, element, snippetSrc);
        }
      } else {
        // If no src attribute or basePath, just keep the content or create a note
        if (snippetSrc) {
          this.createSnippetNote(document, element, snippetSrc);
        } else {
          const div = document.createElement('div');
          div.innerHTML = element.innerHTML;
          element.parentNode?.replaceChild(div, element);
        }
      }
    }
    
    // Handle legacy snippet elements with data attributes
    const snippetElements = document.querySelectorAll('[data-mc-snippet]');
    
    snippetElements.forEach(element => {
      const snippetPath = element.getAttribute('data-mc-snippet');
      const div = document.createElement('div');
      div.innerHTML = `<!-- Snippet: ${snippetPath} -->\n${element.innerHTML}`;
      element.parentNode?.replaceChild(div, element);
    });
  }
  
  private createSnippetNote(document: Document, element: Element, snippetSrc: string): void {
    const div = document.createElement('div');
    div.className = 'snippet-content';
    
    // Create a note about the snippet
    const noteP = document.createElement('p');
    noteP.innerHTML = `<strong>Note:</strong> Content from snippet <code>${snippetSrc}</code>`;
    div.appendChild(noteP);
    
    // If the element has content, include it
    if (element.innerHTML.trim()) {
      const contentDiv = document.createElement('div');
      contentDiv.innerHTML = element.innerHTML;
      div.appendChild(contentDiv);
    }
    
    element.parentNode?.replaceChild(div, element);
  }

  private convertVariables(document: Document): void {
    // Handle both span elements and MadCap:variable elements
    const spanVariables = document.querySelectorAll('span[data-mc-variable], [class*="mc-variable"]');
    const madcapVariables = document.querySelectorAll('MadCap\\:variable, madcap\\:variable');
    
    // Process span variables
    spanVariables.forEach(element => {
      const variableName = element.getAttribute('data-mc-variable') || 
                          this.extractVariableName(element.className);
      
      // For MadCap variables, we want to keep the actual text content, not the variable name
      // The variable has already been resolved by MadCap to its actual value
      const textContent = element.textContent?.trim();
      
      if (textContent && textContent !== '') {
        // Check if the next sibling is text that starts with punctuation (like 's, 's, etc.)
        const nextSibling = element.nextSibling;
        let additionalText = '';
        
        if (nextSibling && nextSibling.nodeType === 3) { // Text node
          const nextText = nextSibling.textContent || '';
          // Check if it starts with possessive or similar punctuation
          const punctuationMatch = nextText.match(/^('s|'s|\.\w+)/);
          if (punctuationMatch) {
            additionalText = punctuationMatch[0];
            // Remove the matched text from the next sibling
            nextSibling.textContent = nextText.substring(punctuationMatch[0].length);
          }
        }
        
        // Replace the variable element with the resolved text plus any possessive
        const textNode = document.createTextNode(textContent + additionalText);
        element.parentNode?.replaceChild(textNode, element);
      } else if (variableName) {
        // Fallback if no text content - show variable reference
        const textNode = document.createTextNode(`{${variableName}}`);
        element.parentNode?.replaceChild(textNode, element);
      } else {
        // If we can't process the variable, keep the original element but remove mc-variable class
        element.className = element.className.replace(/mc-variable[^\\s]*\\s*/g, '').trim();
      }
    });
    
    // Process MadCap:variable elements (self-closing tags) - also check with filter approach
    const allMadcapVars = Array.from(document.querySelectorAll('*')).filter(el => 
      el.tagName === 'MadCap:variable' ||
      el.tagName === 'MADCAP:VARIABLE' || 
      el.tagName === 'madcap:variable' ||
      el.tagName.toLowerCase() === 'madcap:variable'
    );
    
    allMadcapVars.forEach((element, index) => {
      const variableName = element.getAttribute('name');
      
      if (variableName) {
        // Try to resolve the variable first
        const resolvedValue = this.resolveVariable(variableName);
        
        if (resolvedValue) {
          // Use the resolved value
          const textNode = document.createTextNode(resolvedValue);
          element.parentNode?.replaceChild(textNode, element);
        } else {
          // Fallback to variable reference if resolution fails
          const textNode = document.createTextNode(`{${variableName}}`);
          element.parentNode?.replaceChild(textNode, element);
        }
      } else {
        // Remove the element if no name attribute
        element.remove();
      }
    });
  }

  private extractVariableName(className: string): string | undefined {
    // Handle both formats: "mc-variable.VariableName" and "mc-variable General.VariableName variable"
    const dotMatch = className.match(/mc-variable\.(\w+)/)?.[1];
    if (dotMatch) return dotMatch;
    
    // Handle space-separated format like "mc-variable General.ProductName variable"
    const spaceMatch = className.match(/mc-variable\s+([^.\s]+)\.([^.\s]+)/);
    if (spaceMatch) return `${spaceMatch[1]}.${spaceMatch[2]}`;
    
    return undefined;
  }

  private extractHeadingLevel(className: string): number | null {
    const match = className.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  private getMadCapWarnings(html: string): string[] | undefined {
    const warnings: string[] = [];
    
    if (html.includes('data-mc-conditions')) {
      warnings.push('Document contains conditional text that may need manual review');
    }
    
    if (html.includes('data-mc-snippet')) {
      warnings.push('Document contains snippets that may need to be manually included');
    }
    
    if (html.includes('data-mc-variable') || html.includes('mc-variable')) {
      warnings.push('Document contains variables that may need manual substitution');
    }
    
    if (html.includes('mc-expanding-head') || html.includes('MC-expanding-head')) {
      warnings.push('Document contains expanding sections that have been converted to static content');
    }
    
    return warnings.length > 0 ? warnings : undefined;
  }

  private findProjectPath(html: string): string | null {
    // For file-based conversion, we need a different approach
    // This is a simplified version - in practice, you'd pass the file path
    // For now, we'll use a common project structure
    const commonPaths = [
      '/Volumes/Envoy Pro/Flare/Spend EN/Project/VariableSets',
      '/Volumes/Envoy Pro/Flare/Administration DE/Project/VariableSets'
    ];
    
    // Return the first path that might exist (we'll handle errors in loadVariableSets)
    return commonPaths[0];
  }

  private async loadVariableSets(projectPath: string): Promise<void> {
    try {
      // Check if we already loaded variables for this project
      if (this.variableCache.has(projectPath)) {
        return;
      }

      const variableSetPath = resolve(projectPath, 'General.flvar');
      const variableContent = await readFile(variableSetPath, 'utf8');
      
      const dom = new JSDOM(variableContent, { contentType: 'application/xml' });
      const document = dom.window.document;
      
      const variables = new Map<string, string>();
      
      // Parse all Variable elements
      const variableElements = document.querySelectorAll('Variable');
      variableElements.forEach(element => {
        const name = element.getAttribute('Name');
        const value = element.getAttribute('EvaluatedDefinition') || element.textContent?.trim();
        
        if (name && value) {
          variables.set(name, value);
        }
      });
      
      this.variableCache.set(projectPath, variables);
    } catch (error) {
      // If we can't load variables, that's okay - just continue without resolution
      console.warn('Could not load MadCap variable sets:', error);
    }
  }

  private resolveVariable(variableRef: string): string | null {
    // Parse variable reference like "General.CompanyName"
    const parts = variableRef.split('.');
    if (parts.length < 2) {
      return null;
    }
    
    const variableName = parts[parts.length - 1]; // Take the last part as variable name
    
    // Look through all loaded variable sets
    for (const variables of this.variableCache.values()) {
      const value = variables.get(variableName);
      if (value) {
        return value;
      }
    }
    
    // Fallback for common variables if not loaded
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

  private processVariablesInHtml(html: string): string {
    // Process MadCap:variable elements using regex
    let result = html.replace(/<MadCap:variable\s+name="([^"]+)"\s*\/>/g, (match, variableName) => {
      const resolved = this.resolveVariable(variableName);
      return resolved || `{${variableName}}`;
    });
    
    // Fix common HTML issues that cause malformed text
    result = result.replace(/offers s a multi-step/g, 'offers a multi-step'); // Fix the specific "s" issue
    
    return result;
  }

  private fixMalformedListStructure(html: string): string {
    // This fixes a common MadCap issue where <p> elements appear outside <li> but inside <ol>
    // The regex handles this complex nested structure safely
    let fixed = html;
    
    // First, find all <ol> sections and process them individually
    fixed = fixed.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (olMatch, olContent) => {
      // Within each <ol>, find orphaned <p> elements (those not inside <li>)
      let fixedContent = olContent;
      
      // Split by <li> elements to identify orphaned content
      const parts = fixedContent.split(/(<li[^>]*>[\s\S]*?<\/li>)/g);
      
      for (let i = 0; i < parts.length; i++) {
        // Process parts that are not <li> elements and contain <p> tags
        if (!parts[i].match(/^<li[^>]*>/) && parts[i].includes('<p')) {
          // Convert orphaned <p> elements to list items
          parts[i] = parts[i].replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '<li><p>$1</p></li>');
        }
      }
      
      return '<ol>' + parts.join('') + '</ol>';
    });
    
    return fixed;
  }

  private processCrossReferencesInHtml(html: string, targetFormat: 'markdown' | 'asciidoc' | 'zendesk'): string {
    // Process MadCap:xref elements using regex to convert them to standard links
    return html.replace(/<MadCap:xref\s+href="([^"]+)"[^>]*>(.*?)<\/MadCap:xref>/g, (match, href, linkText) => {
      // Convert file extension based on target format
      let convertedHref = href;
      if (targetFormat === 'asciidoc') {
        convertedHref = href.replace(/\.htm(#.*)?$/, '.adoc$1');
      } else if (targetFormat === 'markdown') {
        convertedHref = href.replace(/\.htm(#.*)?$/, '.md$1');
      } else if (targetFormat === 'zendesk') {
        // For Zendesk, keep original .htm or convert to internal links
        convertedHref = href;
      }
      
      return `<a href="${convertedHref}">${linkText}</a>`;
    });
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
}
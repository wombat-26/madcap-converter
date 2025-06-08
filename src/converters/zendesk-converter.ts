import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult, ZendeskArticleMetadata } from '../types/index.js';
import { MadCapConverter } from './madcap-converter.js';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';

export class ZendeskConverter implements DocumentConverter {
  supportedInputTypes = ['html', 'htm', 'madcap'];
  private madcapConverter: MadCapConverter;
  private loadedSnippets: Set<string> = new Set(); // Prevent circular snippet loading
  private variableCache: Map<string, Map<string, string>> = new Map();
  private snippetCache: Map<string, string> = new Map(); // Cache loaded snippets
  
  // Safe HTML tags allowed by Zendesk
  private readonly SAFE_HTML_TAGS = [
    'p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span', 'hr', 'sub', 'sup', 'small', 'del', 'ins', 'svg', 'path', 'g', 'circle',
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

    return {
      content: sanitizedBody,
      metadata: {
        title,
        wordCount,
        zendeskMetadata,
        warnings: this.getZendeskWarnings(input, sanitizedBody, options)
      }
    };
  }

  private containsMadCapContent(html: string): boolean {
    return html.includes('MadCap:') || 
           html.includes('madcap:') || 
           html.includes('xmlns:MadCap') ||
           html.includes('data-mc-') ||
           html.includes('mc-variable') ||
           html.includes('mc-');
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
      } else if (tagName === 'madcap:variable' || element.hasAttribute('data-mc-variable') || element.className.includes('mc-variable')) {
        variables.push(element);
      }
    }
    
    // Process each type efficiently
    await this.processSnippetBlocks(snippetBlocks, inputPath);
    await this.processSnippetTexts(snippetTexts, inputPath);
    this.processDropDowns(dropDowns);
    this.processXrefs(xrefs);
    this.processVariables(variables);
    
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
    
    return cleanedHtml;
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
      const variableName = element.getAttribute('data-mc-variable') || 
                          element.getAttribute('name') ||
                          this.extractVariableName(element.className);
      
      // First try to get the text content (already resolved by MadCap)
      const textContent = element.textContent?.trim();
      if (textContent && textContent !== '' && !textContent.includes('.')) {
        // Use resolved content if it doesn't look like a variable reference
        const textNode = element.ownerDocument.createTextNode(textContent);
        element.parentNode?.replaceChild(textNode, element);
      } else if (variableName) {
        // Try to resolve the variable
        const resolvedValue = this.resolveVariable(variableName);
        const textNode = element.ownerDocument.createTextNode(resolvedValue || `{${variableName}}`);
        element.parentNode?.replaceChild(textNode, element);
      } else {
        // Keep original text content
        const textNode = element.ownerDocument.createTextNode(textContent || '');
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
    
    // Enhance styling for Zendesk
    this.enhanceForZendeskStyling(document);

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

      const variableSetPath = resolve(projectPath, 'General.flvar');
      const variableContent = await readFile(variableSetPath, 'utf8');
      
      const dom = new JSDOM(variableContent, { contentType: 'application/xml' });
      const document = dom.window.document;
      
      const variables = new Map<string, string>();
      
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
      'ProductName': 'Spend',
      'CompanyShort': 'Uptempo',
      'CompanyName': 'Uptempo GmbH',
      'VersionNumber': 'October 2024'
    };
    
    return fallbackVariables[variableName] || null;
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
}
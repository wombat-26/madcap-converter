import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult, ZendeskArticleMetadata } from '../types/index';
import { MadCapPreprocessor } from '../services/madcap-preprocessor';

export class ZendeskConverter implements DocumentConverter {
  supportedInputTypes = ['html', 'htm', 'madcap'];
  private madcapPreprocessor: MadCapPreprocessor;
  
  // Safe HTML tags allowed by Zendesk
  private readonly SAFE_HTML_TAGS = [
    'p', 'br', 'strong', 'em', 'i', 'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span', 'hr', 'sub', 'sup', 'small', 'del', 'ins', 'kbd', 'svg', 'path', 'g', 'circle',
    'rect', 'line', 'polygon', 'polyline', 'ellipse', 'defs', 'use'
  ];

  private readonly UNSAFE_ATTRIBUTES = [
    'onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur',
    'script', 'javascript:', 'vbscript:', 'data:', 'style'
  ];

  constructor() {
    this.madcapPreprocessor = new MadCapPreprocessor();
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    if (options.format !== 'zendesk') {
      throw new Error('ZendeskConverter only supports zendesk format');
    }

    // Check if content should be skipped due to MadCap conditions
    if (this.madcapPreprocessor.shouldSkipContent(input)) {
      throw new Error('Content contains MadCap conditions that should not be converted (black, deprecated, paused, halted, discontinued, print only)');
    }

    // First preprocess with shared MadCap preprocessor if it's MadCap content
    let processedInput = input;
    if (options.inputType === 'madcap' || this.madcapPreprocessor.containsMadCapContent(input)) {
      // Use shared MadCap preprocessing
      processedInput = await this.madcapPreprocessor.preprocessMadCapContent(
        input, 
        options.inputPath, 
        'zendesk', 
        options.projectRootPath,
        options
      );
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

    // Create complete HTML document structure
    const completeHtml = this.createCompleteHtmlDocument(title, sanitizedBody, options);

    // Generate stylesheet if requested
    const result: ConversionResult = {
      content: completeHtml,
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
    // First, try to extract just the main content from MadCap Flare structure
    const mainContent = document.querySelector('#mc-main-content') || 
                       document.querySelector('[role="main"]') || 
                       document.querySelector('.body-container');
    
    let workingDocument: Document;
    if (mainContent) {
      // Create a new document with just the main content
      workingDocument = new JSDOM(`<html><body>${mainContent.innerHTML}</body></html>`).window.document;
    } else {
      // Fallback to using the entire document
      workingDocument = document;
    }

    if (!sanitize) {
      return workingDocument.body?.innerHTML || workingDocument.documentElement.innerHTML;
    }

    // Remove script and style tags completely
    const scripts = workingDocument.querySelectorAll('script, style');
    scripts.forEach(el => el.remove());

    // Remove unsafe elements
    const allElements = workingDocument.querySelectorAll('*');
    allElements.forEach(element => {
      const tagName = element.tagName.toLowerCase();
      
      // Remove elements with unsafe tags
      if (!this.SAFE_HTML_TAGS.includes(tagName)) {
        // Replace with div or span, preserving content
        const replacement = workingDocument.createElement(tagName === 'div' ? 'div' : 'span');
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

    // Clean up and optimize HTML structure
    this.optimizeHtmlStructure(workingDocument, options!);
    
    // Enhance styling for Zendesk (with configurable CSS approach)
    this.enhanceForZendeskStyling(workingDocument, options!);

    return workingDocument.body?.innerHTML || workingDocument.documentElement.innerHTML;
  }

  private optimizeHtmlStructure(document: Document, options: ConversionOptions): void {
    // Remove empty elements
    const emptyElements = document.querySelectorAll('p:empty, div:empty, span:empty');
    emptyElements.forEach(el => el.remove());
    
    
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
      const height = parseInt(img.getAttribute('height') || '0');
      const width = parseInt(img.getAttribute('width') || '0');
      
      // Check if image is in a table cell for better context detection
      const inTableCell = img.closest('td, th') !== null;
      const inParagraph = img.closest('p') !== null;
      
      // Add Zendesk-appropriate sizing classes
      if (classes.includes('icon') || 
          src.includes('icon') || 
          src.includes('GUI-Elemente/') ||
          src.includes('symbol_') ||
          src.includes('_XX') ||
          src.includes('XX_') ||
          (height > 0 && height <= 36) ||
          (width > 0 && width <= 36) ||
          (inTableCell && inParagraph && (height <= 36 || width <= 36))) {
        // PNG icons - inline with text (small images, symbols, or small images in table cells)
        img.className = 'zendesk-png-icon';
        img.setAttribute('style', 'width: 1em; height: 1em; display: inline-block; vertical-align: middle; max-width: 24px; max-height: 24px;');
      } else if (src.includes('Screens/') || classes.includes('screenshot')) {
        // Screenshots and large interface images
        img.className = 'zendesk-image-large';
        img.setAttribute('style', 'max-width: 100%; height: auto; border: 1px solid #ddd; margin: 10px 0;');
      } else {
        // Default sizing for other images
        img.className = 'zendesk-image-default';
        img.setAttribute('style', 'max-width: 600px; height: auto; margin: 10px 0;');
      }
    });

    // Clean up links and convert .htm to .html for Zendesk consistency
    const links = document.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.includes('.htm')) {
        // Convert .htm to .html for Zendesk output consistency
        const convertedHref = href.replace(/\.htm(#|$)/, '.html$1');
        link.setAttribute('href', convertedHref);
      }
    });

    // Convert keyboard shortcuts to <kbd> elements
    this.convertKeyboardShortcuts(document);
    
    // Convert MadCap dropdowns to static content
    this.convertMadCapDropdowns(document);
    
    // Optimize tables for Zendesk
    this.optimizeTablesForZendesk(document);
  }

  private convertKeyboardShortcuts(document: Document): void {
    // Convert existing keyboard/key styling to <kbd> elements
    const keyElements = document.querySelectorAll(
      '.key, .keyboard, .kbd, .keystroke, .shortcut, .hotkey'
    );
    
    keyElements.forEach(element => {
      const kbd = document.createElement('kbd');
      kbd.className = 'zendesk-key';
      kbd.innerHTML = element.innerHTML;
      element.parentNode?.replaceChild(kbd, element);
    });

    // Pattern matching for keyboard shortcuts in text
    const textNodes = document.createTreeWalker(
      document.body || document.documentElement,
      4, // NodeFilter.SHOW_TEXT
      node => {
        const parent = (node as Text).parentElement;
        if (parent && ['kbd', 'code', 'pre'].includes(parent.tagName.toLowerCase())) {
          return 3; // NodeFilter.FILTER_REJECT
        }
        return 1; // NodeFilter.FILTER_ACCEPT
      }
    );

    // Simple patterns for common keyboard shortcuts
    const keyboardPatterns = [
      /\b(Ctrl|Cmd|Alt|Shift)\s*\+\s*([A-Za-z0-9]+)\b/g,
      /\bF([1-9]|1[0-2])\b/g,
      /\b(ENTER|TAB|ESC|DELETE|SPACE)\b/g
    ];

    let node: Node | null;
    const nodesToProcess: { node: Text, matches: RegExpMatchArray[] }[] = [];

    while (node = textNodes.nextNode()) {
      const textNode = node as Text;
      const allMatches: RegExpMatchArray[] = [];
      
      keyboardPatterns.forEach(pattern => {
        const matches = Array.from(textNode.textContent?.matchAll(pattern) || []);
        allMatches.push(...matches);
      });

      if (allMatches.length > 0) {
        nodesToProcess.push({ node: textNode, matches: allMatches });
      }
    }

    // Process keyboard shortcut matches
    nodesToProcess.forEach(({ node, matches }) => {
      let html = node.textContent!;
      matches.reverse().forEach(match => {
        if (match.index !== undefined) {
          const matchText = match[0];
          const before = html.substring(0, match.index);
          const after = html.substring(match.index + matchText.length);
          html = before + `<kbd class="zendesk-key">${matchText}</kbd>` + after;
        }
      });

      if (matches.length > 0) {
        const temp = document.createElement('span');
        temp.innerHTML = html;
        const parent = node.parentNode!;
        while (temp.firstChild) {
          parent.insertBefore(temp.firstChild, node);
        }
        parent.removeChild(node);
      }
    });
  }

  private convertMadCapDropdowns(document: Document): void {
    // Find all MadCap dropdown elements
    const dropdowns = document.querySelectorAll('.MCDropDown, [class*="MCDropDown"]');
    
    dropdowns.forEach(dropdown => {
      // Find the dropdown head and body elements
      const dropdownHead = dropdown.querySelector('.MCDropDownHead, [class*="MCDropDownHead"]');
      const dropdownBody = dropdown.querySelector('.MCDropDownBody, [class*="MCDropDownBody"]');
      
      if (dropdownHead && dropdownBody) {
        // Extract text content from the dropdown head
        const headText = this.extractTextFromDropdownHead(dropdownHead);
        
        // Create a heading element (h3 for nested dropdowns, h2 for top-level)
        const isNested = dropdown.closest('.MCDropDownBody') !== null;
        const headingLevel = isNested ? 'h4' : 'h3';
        const heading = document.createElement(headingLevel);
        heading.textContent = headText;
        heading.className = 'zendesk-heading zendesk-dropdown-heading';
        
        // Create a wrapper div for the content
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'zendesk-dropdown-content';
        contentWrapper.innerHTML = dropdownBody.innerHTML;
        
        // Replace the entire dropdown with the heading and content
        const parent = dropdown.parentNode;
        if (parent) {
          parent.insertBefore(heading, dropdown);
          parent.insertBefore(contentWrapper, dropdown);
          parent.removeChild(dropdown);
        }
      } else {
        // If we can't find proper head/body structure, just remove dropdown wrapper
        // and preserve the content
        const parent = dropdown.parentNode;
        if (parent) {
          while (dropdown.firstChild) {
            parent.insertBefore(dropdown.firstChild, dropdown);
          }
          parent.removeChild(dropdown);
        }
      }
    });
    
    // Clean up any remaining MadCap dropdown artifacts
    this.cleanupDropdownArtifacts(document);
  }

  private extractTextFromDropdownHead(headElement: Element): string {
    // Remove any icons or non-text elements
    const clone = headElement.cloneNode(true) as Element;
    
    // Remove image elements (dropdown icons)
    const images = clone.querySelectorAll('img');
    images.forEach(img => img.remove());
    
    // Remove any elements with icon-related classes
    const iconElements = clone.querySelectorAll('[class*="icon"], [class*="Icon"]');
    iconElements.forEach(el => el.remove());
    
    // Get the text content and clean it up
    let text = clone.textContent?.trim() || '';
    
    // Remove common dropdown indicator text/symbols
    text = text.replace(/^(▼|►|▶|⏵|▸|»|>)\s*/g, '');
    text = text.replace(/\s*(▼|►|▶|⏵|▸|»|>)$/g, '');
    
    return text || 'Section';
  }

  private cleanupDropdownArtifacts(document: Document): void {
    // Remove any remaining interactive attributes from all elements
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      // Remove MadCap-specific attributes
      const attributesToRemove = [
        'aria-expanded',
        'aria-controls',
        'aria-haspopup',
        'role',
        'tabindex'
      ];
      
      attributesToRemove.forEach(attr => {
        if (element.hasAttribute(attr)) {
          element.removeAttribute(attr);
        }
      });
      
      // Remove data-mc-* attributes
      Array.from(element.attributes).forEach(attr => {
        if (attr.name.startsWith('data-mc-')) {
          element.removeAttribute(attr.name);
        }
      });
      
      // Clean up classes - remove MadCap-specific ones
      const classList = element.classList;
      const classesToRemove: string[] = [];
      
      classList.forEach(className => {
        if (className.includes('MC') || 
            className.includes('dropDown') || 
            className.includes('HotSpot') ||
            className.includes('madcap') ||
            className.toLowerCase().includes('mc-')) {
          classesToRemove.push(className);
        }
      });
      
      classesToRemove.forEach(className => {
        classList.remove(className);
      });
      
      // If element has no classes left, remove the class attribute
      if (classList.length === 0) {
        element.removeAttribute('class');
      }
    });
    
    // Remove any remaining empty links or spans that were dropdown triggers
    const emptyInteractiveElements = document.querySelectorAll('a:empty, span:empty, button:empty');
    emptyInteractiveElements.forEach(el => {
      if (el.parentNode && !el.hasChildNodes()) {
        el.parentNode.removeChild(el);
      }
    });
  }

  private optimizeTablesForZendesk(document: Document): void {
    const tables = document.querySelectorAll('table');
    
    tables.forEach(table => {
      // Remove MadCap-specific style attributes
      table.removeAttribute('style');
      
      // Clean up classes - remove MadCap-specific ones and add Zendesk classes
      const classList = table.classList;
      const classesToRemove: string[] = [];
      
      classList.forEach(className => {
        if (className.includes('TableStyle') || 
            className.includes('BMTable') ||
            className.includes('madcap') ||
            className.toLowerCase().includes('mc-')) {
          classesToRemove.push(className);
        }
      });
      
      classesToRemove.forEach(className => {
        classList.remove(className);
      });
      
      // Add Zendesk table class
      table.classList.add('zendesk-table');
      
      // Clean up table headers
      const headers = table.querySelectorAll('th');
      headers.forEach(th => {
        this.cleanupTableCell(th, 'zendesk-table-header');
      });
      
      // Clean up table cells
      const cells = table.querySelectorAll('td');
      cells.forEach(td => {
        this.cleanupTableCell(td, 'zendesk-table-cell');
      });
      
      // Clean up table rows
      const rows = table.querySelectorAll('tr');
      rows.forEach(tr => {
        this.cleanupTableRow(tr);
      });
      
      // Remove column groups with MadCap-specific classes
      const colgroups = table.querySelectorAll('colgroup');
      colgroups.forEach(colgroup => {
        const cols = colgroup.querySelectorAll('col');
        let hasValidCols = false;
        
        cols.forEach(col => {
          const classList = col.classList;
          const classesToRemove: string[] = [];
          
          classList.forEach(className => {
            if (className.includes('TableStyle') || 
                className.includes('BMTable') ||
                className.includes('madcap') ||
                className.toLowerCase().includes('mc-')) {
              classesToRemove.push(className);
            }
          });
          
          classesToRemove.forEach(className => {
            classList.remove(className);
          });
          
          // Remove style attribute
          col.removeAttribute('style');
          
          // Keep column if it has useful attributes (like width)
          if (col.hasAttributes()) {
            hasValidCols = true;
          }
        });
        
        // Remove the entire colgroup if no useful columns remain
        if (!hasValidCols) {
          colgroup.remove();
        }
      });
    });
  }

  private cleanupTableCell(cell: Element, zendeskClass: string): void {
    // Clean up classes
    const classList = cell.classList;
    const classesToRemove: string[] = [];
    
    classList.forEach(className => {
      if (className.includes('TableStyle') || 
          className.includes('BMTable') ||
          className.includes('Head') ||
          className.includes('Body') ||
          className.includes('Regular') ||
          className.includes('Header') ||
          className.includes('Row') ||
          className.includes('madcap') ||
          className.toLowerCase().includes('mc-')) {
        classesToRemove.push(className);
      }
    });
    
    classesToRemove.forEach(className => {
      classList.remove(className);
    });
    
    // Add Zendesk class
    cell.classList.add(zendeskClass);
    
    // Remove MadCap-specific style attributes but preserve useful ones
    const style = cell.getAttribute('style');
    if (style) {
      // Keep only useful CSS properties, remove MadCap-specific ones
      const styleProps = style.split(';').map(prop => prop.trim()).filter(prop => {
        const lowerProp = prop.toLowerCase();
        return prop && 
               !lowerProp.includes('padding-left: 5px') &&
               !lowerProp.includes('padding-right: 5px') &&
               !lowerProp.includes('padding-top: 5px') &&
               !lowerProp.includes('padding-bottom: 5px') &&
               !lowerProp.includes('border-right-style') &&
               !lowerProp.includes('border-right-width') &&
               !lowerProp.includes('border-right-color') &&
               !lowerProp.includes('font-size: 24pt') &&
               !lowerProp.includes('text-align: center') &&
               !lowerProp.includes('color: #fa931d') &&
               !lowerProp.includes('font-weight: bold');
      });
      
      if (styleProps.length > 0) {
        cell.setAttribute('style', styleProps.join('; '));
      } else {
        cell.removeAttribute('style');
      }
    }
  }

  private cleanupTableRow(row: Element): void {
    // Clean up classes
    const classList = row.classList;
    const classesToRemove: string[] = [];
    
    classList.forEach(className => {
      if (className.includes('TableStyle') || 
          className.includes('BMTable') ||
          className.includes('Head') ||
          className.includes('Body') ||
          className.includes('Header') ||
          className.includes('Row') ||
          className.includes('madcap') ||
          className.toLowerCase().includes('mc-')) {
        classesToRemove.push(className);
      }
    });
    
    classesToRemove.forEach(className => {
      classList.remove(className);
    });
    
    // Add Zendesk class
    row.classList.add('zendesk-table-row');
    
    // Remove style attributes
    row.removeAttribute('style');
  }

  private enhanceForZendeskStyling(document: Document, options: ConversionOptions): void {
    const useInlineStyles = options.zendeskOptions?.inlineStyles !== false;
    
    // Style code blocks
    const codeBlocks = document.querySelectorAll('pre, code');
    codeBlocks.forEach(block => {
      block.classList.add('zendesk-code');
      if (useInlineStyles) {
        block.setAttribute('style', 
          'background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 0.25em 0.5em; font-family: Monaco, Menlo, Ubuntu Mono, monospace; font-size: 0.9em;'
        );
      }
    });

    // Style blockquotes (notes/warnings)
    const blockquotes = document.querySelectorAll('blockquote');
    blockquotes.forEach(quote => {
      quote.classList.add('zendesk-callout');
      if (useInlineStyles) {
        quote.setAttribute('style', 
          'padding: 1em; margin: 1em 0; border-left: 4px solid #007acc; border-radius: 4px; background-color: #f8f9fa;'
        );
      }
    });

    // Style headings
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
      heading.classList.add('zendesk-heading');
      if (useInlineStyles) {
        heading.setAttribute('style', 
          'margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600;'
        );
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

    // Style keyboard elements
    const kbdElements = document.querySelectorAll('kbd');
    kbdElements.forEach(kbd => {
      if (!kbd.classList.contains('zendesk-key')) {
        kbd.classList.add('zendesk-key');
      }
      if (useInlineStyles) {
        kbd.setAttribute('style', 
          'background-color: #f5f5f5; border: 1px solid #ccc; border-radius: 3px; box-shadow: 0 1px 0 rgba(0,0,0,0.1); padding: 2px 6px; font-family: Monaco, Menlo, Ubuntu Mono, monospace; font-size: 0.85em; display: inline-block; margin: 0 1px; vertical-align: baseline;'
        );
      }
    });

    // Style dropdown headings and content
    const dropdownHeadings = document.querySelectorAll('.zendesk-dropdown-heading');
    dropdownHeadings.forEach(heading => {
      if (useInlineStyles) {
        heading.setAttribute('style', 
          'margin: 1.5em 0 0.5em 0; padding: 0.5em 0; border-bottom: 2px solid #e0e0e0; font-weight: 600;'
        );
      }
    });

    const dropdownContent = document.querySelectorAll('.zendesk-dropdown-content');
    dropdownContent.forEach(content => {
      if (useInlineStyles) {
        content.setAttribute('style', 
          'margin: 0 0 1em 0; padding: 0.5em 0;'
        );
      }
    });

    // Style tables
    const tables = document.querySelectorAll('.zendesk-table');
    tables.forEach(table => {
      if (useInlineStyles) {
        table.setAttribute('style', 
          'width: 100%; border-collapse: collapse; margin: 1em 0; border: 1px solid #ddd;'
        );
      }
    });

    const tableHeaders = document.querySelectorAll('.zendesk-table-header');
    tableHeaders.forEach(header => {
      if (useInlineStyles) {
        header.setAttribute('style', 
          'background-color: #f8f9fa; border: 1px solid #ddd; padding: 12px; text-align: left; font-weight: 600;'
        );
      }
    });

    const tableCells = document.querySelectorAll('.zendesk-table-cell');
    tableCells.forEach(cell => {
      if (useInlineStyles) {
        cell.setAttribute('style', 
          'border: 1px solid #ddd; padding: 12px; vertical-align: top;'
        );
      }
    });

    const tableRows = document.querySelectorAll('.zendesk-table-row');
    tableRows.forEach(row => {
      if (useInlineStyles) {
        row.setAttribute('style', 
          'border-bottom: 1px solid #eee;'
        );
      }
    });
  }

  private createCompleteHtmlDocument(title: string, bodyContent: string, options: ConversionOptions): string {
    const cssFileName = options.zendeskOptions?.cssOutputPath || 'zendesk-styles.css';
    const cssLink = options.zendeskOptions?.generateStylesheet 
      ? `    <link rel="stylesheet" href="${cssFileName}">`
      : '';

    return `<!DOCTYPE html>
<html lang="${options.zendeskOptions?.locale || 'en'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>${cssLink ? '\n' + cssLink : ''}
</head>
<body>
${bodyContent}
</body>
</html>`;
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

    return warnings;
  }


  public generateZendeskStylesheet(): string {
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
.zendesk-png-icon {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: middle;
  max-width: 24px;
  max-height: 24px;
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

/* Dropdown Content Sections */
.zendesk-dropdown-heading {
  margin: 1.5em 0 0.5em 0;
  padding: 0.5em 0;
  border-bottom: 2px solid #e0e0e0;
  font-weight: 600;
}

.zendesk-dropdown-content {
  margin: 0 0 1em 0;
  padding: 0.5em 0;
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

.collapsible-content {
  padding: 1em;
}

/* Tables */
.zendesk-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  border: 1px solid #ddd;
}

.zendesk-table-header {
  background-color: #f8f9fa;
  border: 1px solid #ddd;
  padding: 12px;
  text-align: left;
  font-weight: 600;
}

.zendesk-table-cell {
  border: 1px solid #ddd;
  padding: 12px;
  vertical-align: top;
}

.zendesk-table-row {
  border-bottom: 1px solid #eee;
}

.zendesk-table-row:nth-child(even) {
  background-color: #f9f9f9;
}

/* Callouts and Notes */
.zendesk-callout {
  padding: 1em;
  margin: 1em 0;
  border-left: 4px solid #007acc;
  border-radius: 4px;
  background-color: #f8f9fa;
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

/* Code Blocks */
.zendesk-code {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 0.25em 0.5em;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
}

`;
  }

  // Public method for batch service to check if file should be skipped
  public static shouldSkipFile(content: string, options?: ConversionOptions): boolean {
    return MadCapPreprocessor.shouldSkipFile(content, options);
  }
}
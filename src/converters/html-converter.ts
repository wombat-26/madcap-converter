import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index.js';

export class HTMLConverter implements DocumentConverter {
  supportedInputTypes = ['html'];
  private turndownService: TurndownService;

  constructor() {
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

    // Add rule for warning divs
    this.turndownService.addRule('warningDiv', {
      filter: (node: any) => {
        return node.nodeName === 'DIV' && node.className && node.className.includes('warning');
      },
      replacement: (content: string, node: any) => {
        // Extract just the warning text, skip span labels
        const textParts = content.split('\n').filter(line => 
          line.trim() && 
          !line.trim().match(/^\s*(Attention|Warning)\s*$/i)
        );
        const cleanContent = textParts.join(' ').trim();
        return `> **⚠️ WARNING:** ${cleanContent}\n\n`;
      }
    });

    // Add rule for note paragraphs (better than spans for proper context)
    this.turndownService.addRule('noteParagraphs', {
      filter: (node: any) => {
        return node.nodeName === 'P' && 
               (node.querySelector('.noteInDiv') || 
                (node.textContent && node.textContent.match(/^\s*(Note|Tip):\s*/i)));
      },
      replacement: (content: string) => {
        // Remove the "Note:" label and format as callout
        const cleanContent = content.replace(/^\s*(Note|Tip):\s*/i, '').trim();
        return `\n> **📝 NOTE:** ${cleanContent}\n`;
      }
    });
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    // Check if this HTML contains MadCap elements and preprocess if needed
    let processedInput = input;
    if (this.containsMadCapElements(input)) {
      processedInput = this.preprocessMadCapContent(input);
    }
    
    const dom = new JSDOM(processedInput);
    const document = dom.window.document;
    
    // Rewrite links to converted file extensions for batch processing
    if (options.rewriteLinks) {
      this.rewriteDocumentLinks(document, options.format);
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

    let content: string;
    
    if (options.format === 'markdown') {
      content = this.turndownService.turndown(document.documentElement.outerHTML);
      // Fix over-escaped equals signs in formulas
      content = this.fixFormulaEscaping(content);
      // Fix callout formatting for Writerside compatibility
      content = this.fixCalloutFormatting(content);
      // Remove spaces before punctuation in Markdown too
      content = this.removeSpacesBeforePunctuation(content);
    } else {
      content = this.convertToAsciiDoc(document, options);
    }

    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

    return {
      content,
      metadata: {
        title,
        wordCount,
        images: images.length > 0 ? images : undefined
      }
    };
  }

  private convertToAsciiDoc(document: Document, options: ConversionOptions): string {
    const titleElement = document.querySelector('h1');
    const title = titleElement?.textContent?.trim() || 
                  document.querySelector('title')?.textContent?.trim() || 
                  'Untitled Document';
    
    // Generate document header
    let result = `= ${title}\n`;
    result += `:toc:\n`;
    result += `:icons: font\n\n`;
    
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
    
    result += this.nodeToAsciiDoc(body, 0, options);
    
    // Clean up the result - remove leading spaces from each line and fix formatting
    result = result.split('\n').map(line => {
      // Remove leading spaces from lines that start with AsciiDoc syntax
      if (line.match(/^\s+(==|===|====|=====|======|\.|NOTE:|[*]|\[cols|[|]===)/)) {
        return line.trim();
      }
      // For regular content lines, only trim if they start with space followed by content
      if (line.match(/^\s+\S/)) {
        return line.trim();
      }
      return line;
    }).join('\n');
    
    // Fix navigation breadcrumbs - replace invalid italic markup with proper formatting
    result = result.replace(/_> ([^_]+) > ([^_]+) > ([^_]+) > ([^_]+) >_/g, '*$1 > $2 > $3 > $4*');
    result = result.replace(/_> ([^_]+) > ([^_]+) > ([^_]+) >_/g, '*$1 > $2 > $3*');
    result = result.replace(/_> ([^_]+) >_/g, '*$1*');
    
    // Remove spaces before punctuation
    result = this.removeSpacesBeforePunctuation(result);
    
    // Ensure headers always start on new lines
    result = result.replace(/([^\n])\s*(==+\s+)/g, '$1\n\n$2');
    
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
          const noteText = this.getElementText(element).replace(/^\s*Note\s*/i, '');
          return `NOTE: ${noteText}\n\n`;
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
        return this.convertListToValidAsciiDoc(element, '*');
      case 'ol':
        return this.convertListToValidAsciiDoc(element, '.');
      case 'strong':
      case 'b':
        return `*${this.getElementText(element)}*`;
      case 'em':
      case 'i':
        return `_${this.getElementText(element)}_`;
      case 'blockquote':
        return `____\n${this.getElementText(element)}\n____\n\n`;
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
        
        if (childTag === 'strong' || childTag === 'b') {
          text += `*${this.getElementText(childElement)}* `;
        } else if (childTag === 'em' || childTag === 'i') {
          text += `_${this.getElementText(childElement)}_ `;
        } else {
          text += this.getElementText(childElement) + ' ';
        }
      }
    }
    
    return text.trim();
  }

  private convertTableToValidAsciiDoc(table: Element): string {
    const rows: string[][] = [];
    const tableRows = table.querySelectorAll('tr');
    
    tableRows.forEach(tr => {
      const cells: string[] = [];
      const tableCells = tr.querySelectorAll('td, th');
      tableCells.forEach(cell => {
        // Get clean text content for table cells - no formatting allowed
        let cellText = this.getPlainTextFromElement(cell);
        cells.push(cellText);
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });
    
    if (rows.length === 0) return '';
    
    const maxCols = Math.max(...rows.map(row => row.length));
    let result = `[cols="${Array(maxCols).fill('1').join(',')}"]\n|===\n`;
    
    rows.forEach((row, index) => {
      row.forEach(cell => {
        result += `|${cell}\n`;
      });
      if (index === 0 && table.querySelector('thead')) {
        result += '\n';
      }
    });
    
    result += '|===\n\n';
    return result;
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
    
    // Handle tables specially
    if (tagName === 'table') {
      return this.convertTableToAsciiDoc(element);
    }
    
    // For block elements, process children differently to avoid leading spaces
    const isBlockElement = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote'].includes(tagName);
    
    let children: string;
    if (isBlockElement) {
      children = Array.from(element.childNodes)
        .map(child => this.nodeToAsciiDoc(child, depth + 1, options))
        .filter(text => text.trim().length > 0)
        .join(' ').trim();
    } else {
      children = Array.from(element.childNodes)
        .map(child => this.nodeToAsciiDoc(child, depth + 1, options))
        .filter(text => text.trim().length > 0)
        .join(' ').trim();
    }

    switch (tagName) {
      case 'h1': return `= ${children.trim()}\n\n`;
      case 'h2': return `== ${children.trim()}\n\n`;
      case 'h3': return `=== ${children.trim()}\n\n`;
      case 'h4': return `==== ${children.trim()}\n\n`;
      case 'h5': return `===== ${children.trim()}\n\n`;
      case 'h6': return `====== ${children.trim()}\n\n`;
      case 'p': 
        if (children.trim()) {
          return `${children.trim()}\n\n`;
        }
        return '';
      case 'strong': 
      case 'b': return `*${children}*`;
      case 'em': 
      case 'i': return `_${children}_`;
      case 'code': return `\`${children}\``;
      case 'pre': return `[source]\n----\n${children}\n----\n\n`;
      case 'a': {
        const href = element.getAttribute('href');
        if (!href) return children;
        
        // Only convert .htm to .adoc for internal links if rewriteLinks is enabled (batch processing)
        const convertedHref = options?.rewriteLinks && this.isDocumentLink(href) 
          ? href.replace(/\.htm(#.*)?$/, '.adoc$1')
          : href;
        
        // Check if the link contains only an image
        const imgElement = element.querySelector('img');
        if (imgElement && element.textContent?.trim() === '') {
          const src = imgElement.getAttribute('src');
          const alt = imgElement.getAttribute('alt') || '';
          // Create a clickable image with proper spacing
          return `link:${convertedHref}[image:${src}[${alt}]]\n\n`;
        }
        
        // Regular text link with spacing
        return `link:${convertedHref}[${children}] `;
      }
      case 'img': {
        const src = element.getAttribute('src');
        const alt = element.getAttribute('alt') || '';
        return src ? `image::${src}[${alt}]\n\n` : '';
      }
      case 'ul': return this.convertListToAsciiDoc(element, '*', options);
      case 'ol': return this.convertListToAsciiDoc(element, '.', options);
      case 'li': return children; // Handled by parent list
      case 'table': return this.convertTableToValidAsciiDoc(element);
      case 'blockquote': 
      case 'div': {
        // Check for note class (but not if it contains headings or just images)
        if ((element.className.includes('note') || element.querySelector('.noteInDiv')) && 
            !element.querySelector('h1, h2, h3, h4, h5, h6') && 
            !element.querySelector('img')) {
          // Extract just the note content, skip the "Note" label
          const noteText = children.replace(/^\s*Note\s*/i, '').trim();
          return `NOTE: ${noteText}\n\n`;
        }
        // Check for warning class
        if (element.className.includes('warning') || element.querySelector('.warningInDiv')) {
          // Extract warning content, skip the "Attention" label
          const warningText = children.replace(/^\s*(Attention|Warning)\s*/i, '').trim();
          return `WARNING: ${warningText}\n\n`;
        }
        // Handle note divs that contain images separately
        if ((element.className.includes('note') || element.querySelector('.noteInDiv')) && 
            element.querySelector('img')) {
          // Process normally without NOTE: prefix for image-containing notes
          return children.trim() + '\n\n';
        }
        // Check for MadCap dropdown - process each child separately to maintain structure
        if (element.getAttribute('data-madcap-dropdown')) {
          let result = '';
          for (const child of Array.from(element.childNodes)) {
            if (child.nodeType === 1) { // Element node
              const childElement = child as Element;
              const childResult = this.nodeToAsciiDoc(childElement, depth + 1, options);
              if (childResult.trim()) {
                result += childResult;
                // Add extra spacing after headings and before lists
                if (childElement.tagName.toLowerCase().match(/^h[1-6]$/)) {
                  result += '\n';
                }
              }
            } else if (child.nodeType === 3) { // Text node
              const text = (child.textContent || '').trim();
              if (text && text !== '\n\n') {
                result += text + ' ';
              }
            }
          }
          return result.trim() + '\n\n';
        }
        return children.trim() ? children.trim() : '';
      }
      case 'hr': return `'''\n\n`;
      case 'br': return ' +\n';
      case 'span': {
        // Check for note spans
        if (element.className.includes('noteInDiv') || element.textContent?.match(/^\s*(Note|Tip):\s*/i)) {
          return `**NOTE:** `;
        }
        // Check for warning spans  
        if (element.className.includes('warningInDiv') || element.textContent?.match(/^\s*(Attention|Warning):\s*/i)) {
          return `**WARNING:** `;
        }
        return children;
      }
      case 'body':
      case 'html': return children;
      default: return children;
    }
  }

  private convertTableToAsciiDoc(table: Element): string {
    const rows: string[][] = [];
    const tableRows = table.querySelectorAll('tr');
    
    tableRows.forEach(tr => {
      const cells: string[] = [];
      const tableCells = tr.querySelectorAll('td, th');
      tableCells.forEach(cell => {
        let cellText = this.nodeToAsciiDocForTable(cell);
        cells.push(cellText);
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });
    
    if (rows.length === 0) return '';
    
    // Determine column count
    const maxCols = Math.max(...rows.map(row => row.length));
    
    let result = `[cols="${Array(maxCols).fill('1').join(',')}"]\n|===\n`;
    
    rows.forEach((row, index) => {
      row.forEach(cell => {
        result += `|${cell}\n`;
      });
      if (index === 0 && table.querySelector('thead')) {
        result += '\n'; // Add blank line after header
      }
    });
    
    result += '|===\n\n';
    return result;
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
          // Convert lists to inline text with separators
          const items = Array.from(el.querySelectorAll('li'));
          return items.map(item => processNode(item)).filter(t => t.trim()).join('; ');
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

  private convertListToAsciiDoc(list: Element, marker: string, options?: ConversionOptions): string {
    const items = list.querySelectorAll('li');
    let result = '\n'; // Start with newline to separate from previous content
    
    items.forEach(item => {
      const itemText = this.nodeToAsciiDoc(item, 0, options).trim();
      if (itemText) {
        result += `${marker} ${itemText}\n`;
      }
    });
    
    return result + '\n';
  }

  private rewriteDocumentLinks(document: Document, format: 'markdown' | 'asciidoc'): void {
    const links = document.querySelectorAll('a[href]');
    const targetExtension = format === 'asciidoc' ? '.adoc' : '.md';
    
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
    
    // Check for supported document extensions
    const documentExtensions = ['.html', '.htm', '.docx', '.doc', '.xml'];
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
      .replace(/> \*\*(📝 NOTE|⚠️ WARNING):\*\* (.+?)\. \1/g, '> **$1:** $2');
  }

  private removeSpacesBeforePunctuation(text: string): string {
    // Remove spaces before common punctuation marks, but be careful not to break structure
    return text
      .replace(/\s+([,;!?])/g, '$1')    // Remove spaces before commas, semicolons, exclamation, question marks
      .replace(/\s+(\))/g, '$1')        // Remove spaces before closing parenthesis
      .replace(/(\()\s+/g, '$1')        // Remove spaces after opening parenthesis
      .replace(/\s+(["'])/g, '$1')      // Remove spaces before quotes (closing)
      .replace(/(["'])\s+/g, '$1')      // Remove spaces after quotes (opening)
      // Fix specific spacing issues with quotes
      .replace(/such as"([^"]+)"/g, 'such as "$1"')  // Add space before quoted phrases
      .replace(/such as"([^"]+)"/g, 'such as "$1"')  // Handle smart quotes too
      // Be more careful with periods - only remove space before period if it's not at end of line
      .replace(/(\w)\s+(\.)(\s)/g, '$1$2$3')  // Remove space before period when followed by space
      .replace(/(\w)\s+(\.)([\n\r])/g, '$1$2$3'); // Remove space before period at end of line
  }

  private containsMadCapElements(html: string): boolean {
    return html.includes('MadCap:') || html.includes('madcap:');
  }

  private preprocessMadCapContent(html: string): string {
    // Remove Microsoft properties from HTML string first
    let cleanedHtml = this.removeMicrosoftPropertiesFromString(html);
    
    const dom = new JSDOM(cleanedHtml, { 
      contentType: 'application/xhtml+xml',
      runScripts: 'outside-only' 
    });
    const document = dom.window.document;
    
    this.convertDropDowns(document);
    this.convertMadCapVariables(document);

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

  private convertDropDowns(document: Document): void {
    const dropDowns = Array.from(document.querySelectorAll('*')).filter(el => 
      el.tagName === 'MadCap:dropDown'
    );
    
    dropDowns.forEach(dropDown => {
      const head = Array.from(dropDown.children).find(el => 
        el.tagName === 'MadCap:dropDownHead'
      );
      
      const hotspot = head ? Array.from(head.children).find(el => 
        el.tagName === 'MadCap:dropDownHotspot'
      ) : null;
      
      const body = Array.from(dropDown.children).find(el => 
        el.tagName === 'MadCap:dropDownBody'
      );
      
      if (hotspot && body) {
        // Create a section with a heading for the dropDown
        const section = document.createElement('div');
        section.setAttribute('data-madcap-dropdown', 'true');
        
        // Convert hotspot to h2 heading
        const heading = document.createElement('h2');
        heading.textContent = hotspot.textContent?.trim() || '';
        section.appendChild(heading);
        
        // Move all body content to the section
        while (body.firstChild) {
          section.appendChild(body.firstChild);
        }
        
        // Replace the entire dropDown with the section
        dropDown.parentNode?.replaceChild(section, dropDown);
      }
    });
  }

  private convertMadCapVariables(document: Document): void {
    // Find MadCap:variable elements
    const allMadcapVars = Array.from(document.querySelectorAll('*')).filter(el => 
      el.tagName === 'MadCap:variable'
    );
    
    allMadcapVars.forEach(element => {
      const variableName = element.getAttribute('name');
      
      if (variableName) {
        // Try to guess the actual text from variable name, or use a placeholder
        let displayText = this.guessVariableContent(variableName);
        
        // Check if the next sibling is text that starts immediately (no space)
        const nextSibling = element.nextSibling;
        if (nextSibling && nextSibling.nodeType === 3) { // Text node
          const nextText = nextSibling.textContent || '';
          // If next text starts with a letter (no space, no punctuation), add space
          if (nextText.match(/^[a-zA-Z]/)) {
            displayText += ' ';
          }
        }
        
        const textNode = document.createTextNode(displayText);
        element.parentNode?.replaceChild(textNode, element);
      } else {
        // Remove the element if no name attribute
        element.remove();
      }
    });
  }

  private guessVariableContent(variableName: string): string {
    // Convert common MadCap variable names to likely display text
    const variableMap: { [key: string]: string } = {
      'ScreenCommands.admin.mp.manage_licenses.title': 'Manage Licenses',
      'ScreenCommands.commons.license_type': 'License Type',
      'ScreenCommands.mp.commons.license.label': 'License',
      'ScreenCommands.mp.commons.license_name.label': 'License Name',
      'ScreenCommands.commons.usage': 'Usage',
      'ScreenCommands.mp.commons.period_of_validity.label': 'Validity Period',
      'ScreenCommands.mp.commons.regional_license.label': 'Regional Restrictions',
      'ScreenCommands.mp.commons.personal_license.label': 'Personal Restrictions',
      'ScreenCommands.mp.commons.other_restrictions.label': 'Other Restrictions',
      'ScreenCommands.mp.commons.license_icon.label': 'License Icon',
      'ScreenCommands.commons.images': 'Images',
      'ScreenCommands.commons.new.label': 'New',
      'ScreenCommands.commons.print.label': 'Print',
      'ScreenCommands.commons.online.label': 'Online'
    };
    
    // Return mapped value or extract a reasonable guess from the variable name
    if (variableMap[variableName]) {
      return variableMap[variableName];
    }
    
    // Fallback: extract the last part of the variable name and clean it up
    const parts = variableName.split('.');
    const lastPart = parts[parts.length - 1];
    
    // Convert camelCase/snake_case to readable text
    return lastPart
      .replace(/([A-Z])/g, ' $1') // Add space before capitals
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize first letter of each word
      .trim();
  }
}
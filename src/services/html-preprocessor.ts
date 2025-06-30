import { JSDOM } from 'jsdom';
import { tidy } from 'htmltidy2';

/**
 * HTMLPreprocessor implements a three-phase approach to clean and normalize
 * malformed HTML before conversion to other formats.
 * 
 * Phase 1: DOM Structure Fixing - Fix unclosed tags, improper nesting
 * Phase 2: List Normalization - Fix list structures, orphaned items
 * Phase 3: Text Content Cleaning - Clean entities, whitespace, encoding
 */
export class HTMLPreprocessor {
  /**
   * Main preprocessing pipeline
   */
  async preprocess(html: string): Promise<string> {
    // Phase 0: Use HTML Tidy to fix basic structural issues
    const tidiedHtml = await this.tidyHTML(html);
    
    // Phase 1: Parse and fix DOM structure
    const dom = new JSDOM(tidiedHtml, { 
      contentType: 'text/html',
      includeNodeLocations: true 
    });
    const document = dom.window.document;
    
    // Phase 1: Fix DOM structure
    this.fixDOMStructure(document, dom);
    
    // Phase 2: Normalize lists
    this.convertNumberedParagraphsToLists(document);
    this.fixOrphanedParagraphsInLists(document);
    this.attachOrphanedContentToLists(document);
    this.fixSiblingAlphabeticalLists(document);
    this.normalizeAllLists(document);
    
    // Phase 3: Clean text content
    this.cleanTextContent(document, dom);
    
    // Phase 4: Fix URL encoding in image paths
    this.fixURLEncodedPaths(document);
    
    // Return the cleaned HTML
    return document.body.innerHTML;
  }

  /**
   * Phase 0: Use HTML Tidy to fix basic structural issues
   */
  private async tidyHTML(html: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        // Basic structural fixes
        'fix-bad-uri': true,
        'fix-uri': true,
        'merge-divs': false,  // Don't merge divs to preserve structure
        'merge-spans': false, // Don't merge spans to preserve structure
        'drop-empty-elements': false, // We'll handle this ourselves
        
        // Output formatting
        'indent': false,  // Don't indent to preserve original spacing intent
        'wrap': 0,        // Don't wrap lines
        'tidy-mark': false, // Don't add tidy meta tag
        
        // HTML5 compatibility
        'doctype': 'html5',
        'new-blocklevel-tags': 'article,aside,canvas,dialog,figcaption,figure,footer,header,hgroup,main,nav,section,summary,details',
        'new-inline-tags': 'audio,video,ruby,rt,rp,time,canvas,command,datalist,keygen,mark,meter,progress,source,track,wbr',
        
        // Preserve MadCap elements
        'new-empty-tags': 'madcap:variable,madcap:snippet',
        
        // Specific fixes for our use case
        'force-output': true,  // Always produce output even if errors
        'quiet': true,        // Suppress warnings
        'show-warnings': false,
        'alt-text': '',       // Don't add alt text automatically
        
        // List structure fixes
        'fix-bad-nesting': true,
        'coerce-endtags': true,
        'omit-optional-tags': false
      };
      
      tidy(html, options, (err: Error | null, result: string) => {
        if (err) {
          // If tidy fails, return original HTML
          console.warn('HTML Tidy failed, using original HTML:', err.message);
          resolve(html);
        } else {
          resolve(result || html);
        }
      });
    });
  }

  /**
   * Phase 1: Fix DOM Structure
   * - Fix unclosed tags (handled by JSDOM parser)
   * - Remove duplicate attributes
   * - Ensure proper nesting of elements
   */
  private fixDOMStructure(document: Document, dom: JSDOM): void {
    // Fix improperly nested elements
    this.fixImproperNesting(document);
    
    // Remove empty elements that shouldn't be empty
    this.removeEmptyElements(document);
    
    // Fix orphaned text nodes
    this.wrapOrphanedTextNodes(document, dom);
    
    // Validate and fix table structures
    this.fixTableStructures(document);
  }

  /**
   * Fix improperly nested elements (e.g., div inside p, p inside span)
   */
  private fixImproperNesting(document: Document): void {
    // Block elements that should not be inside inline elements
    const blockElements = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                          'ul', 'ol', 'dl', 'table', 'blockquote', 'pre'];
    const inlineElements = ['span', 'a', 'b', 'i', 'em', 'strong', 'code'];
    
    // Find all inline elements
    inlineElements.forEach(inline => {
      const elements = document.querySelectorAll(inline);
      elements.forEach(element => {
        // Check if it contains block elements
        blockElements.forEach(block => {
          const blockChildren = element.querySelectorAll(block);
          blockChildren.forEach(blockChild => {
            // Move block element outside of inline element
            if (element.parentNode) {
              element.parentNode.insertBefore(blockChild, element.nextSibling);
            }
          });
        });
      });
    });

    // Fix nested paragraphs (p inside p)
    const paragraphs = document.querySelectorAll('p p');
    paragraphs.forEach(nestedP => {
      const parent = nestedP.parentElement;
      if (parent && parent.tagName === 'P') {
        // Convert nested p to span or move outside
        const span = document.createElement('span');
        span.innerHTML = nestedP.innerHTML;
        nestedP.replaceWith(span);
      }
    });
  }

  /**
   * Remove empty elements that shouldn't exist
   */
  private removeEmptyElements(document: Document): void {
    const elementsToCheck = ['p', 'li', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    
    elementsToCheck.forEach(tag => {
      const elements = document.querySelectorAll(tag);
      elements.forEach(element => {
        // Check if element is truly empty (no text, no meaningful children)
        const text = element.textContent?.trim() || '';
        const hasImages = element.querySelector('img') !== null;
        const hasInputs = element.querySelector('input, select, textarea') !== null;
        
        if (!text && !hasImages && !hasInputs && element.children.length === 0) {
          element.remove();
        }
      });
    });
  }

  /**
   * Wrap orphaned text nodes in appropriate containers
   */
  private wrapOrphanedTextNodes(document: Document, dom: JSDOM): void {
    const body = document.body;
    const walker = document.createTreeWalker(
      body,
      dom.window.NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const text = node.textContent?.trim() || '';
          if (!text) return dom.window.NodeFilter.FILTER_REJECT;
          
          const parent = node.parentElement;
          if (!parent) return dom.window.NodeFilter.FILTER_REJECT;
          
          // Check if text is directly in body or list elements
          if (['BODY', 'UL', 'OL', 'DL'].includes(parent.tagName)) {
            return dom.window.NodeFilter.FILTER_ACCEPT;
          }
          
          return dom.window.NodeFilter.FILTER_REJECT;
        }
      }
    );

    const orphanedNodes: Node[] = [];
    let node;
    while (node = walker.nextNode()) {
      orphanedNodes.push(node);
    }

    // Wrap orphaned text nodes
    orphanedNodes.forEach(node => {
      const parent = node.parentElement;
      if (!parent) return;
      
      if (parent.tagName === 'BODY') {
        // Wrap in paragraph
        const p = document.createElement('p');
        parent.insertBefore(p, node);
        p.appendChild(node);
      } else if (['UL', 'OL'].includes(parent.tagName)) {
        // Wrap in list item
        const li = document.createElement('li');
        parent.insertBefore(li, node);
        li.appendChild(node);
      } else if (parent.tagName === 'DL') {
        // Wrap in dd (definition description)
        const dd = document.createElement('dd');
        parent.insertBefore(dd, node);
        dd.appendChild(node);
      }
    });
  }

  /**
   * Fix table structures
   */
  private fixTableStructures(document: Document): void {
    const tables = document.querySelectorAll('table');
    
    tables.forEach(table => {
      // Ensure tbody exists
      if (!table.querySelector('tbody')) {
        const tbody = document.createElement('tbody');
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => tbody.appendChild(row));
        table.appendChild(tbody);
      }
      
      // Move thead rows to thead
      const firstRow = table.querySelector('tr');
      if (firstRow && firstRow.querySelectorAll('th').length > 0) {
        if (!table.querySelector('thead')) {
          const thead = document.createElement('thead');
          table.insertBefore(thead, table.firstChild);
          thead.appendChild(firstRow);
        }
      }
    });
  }

  /**
   * Convert numbered paragraphs to proper ordered lists
   */
  private convertNumberedParagraphsToLists(document: Document): void {
    const paragraphs = document.querySelectorAll('p');
    const numberedParagraphs: { element: Element, number: number, content: string }[] = [];
    
    // Find consecutive numbered paragraphs
    paragraphs.forEach(p => {
      const text = p.textContent?.trim() || '';
      const match = text.match(/^(\d+)\.\s+(.+)$/);
      if (match) {
        const number = parseInt(match[1]);
        const content = match[2];
        numberedParagraphs.push({ element: p, number, content });
      }
    });
    
    if (numberedParagraphs.length === 0) return;
    
    // Group consecutive numbered paragraphs
    const groups: typeof numberedParagraphs[] = [];
    let currentGroup: typeof numberedParagraphs = [];
    
    numberedParagraphs.forEach((item, index) => {
      if (index === 0 || item.number === 1 || 
          (currentGroup.length > 0 && item.number === currentGroup[currentGroup.length - 1].number + 1)) {
        if (item.number === 1 && currentGroup.length > 0) {
          groups.push([...currentGroup]);
          currentGroup = [item];
        } else {
          currentGroup.push(item);
        }
      } else {
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);
        }
        currentGroup = [item];
      }
    });
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    // Convert each group to an ordered list
    groups.forEach(group => {
      if (group.length < 2) return; // Only convert if there are at least 2 items
      
      const firstElement = group[0].element;
      const ol = document.createElement('ol');
      
      // Insert the ol before the first numbered paragraph
      firstElement.parentNode?.insertBefore(ol, firstElement);
      
      // Convert each numbered paragraph to li
      group.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = item.content;
        ol.appendChild(li);
        item.element.remove();
      });
    });
  }

  /**
   * Fix orphaned paragraphs inside lists - paragraphs that are direct children
   * of ol/ul elements instead of being inside li elements
   */
  private fixOrphanedParagraphsInLists(document: Document): void {
    const lists = document.querySelectorAll('ol, ul');
    
    lists.forEach(list => {
      const children = Array.from(list.childNodes);
      const elementsToMove: { element: Element; targetListItem: Element }[] = [];
      let currentListItem: Element | null = null;
      
      // Process children in order to maintain proper sequence
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        
        if (child.nodeType === 1) { // Element node
          const element = child as Element;
          const tagName = element.tagName.toLowerCase();
          
          if (tagName === 'li') {
            // This is a proper list item - update current context
            currentListItem = element;
          } else if (tagName === 'p' || tagName === 'div' || tagName === 'img') {
            // This is orphaned content that should be moved
            const text = element.textContent?.trim() || '';
            
            // Determine where to attach this content
            if (currentListItem) {
              // Attach to the previous list item as continuation content
              elementsToMove.push({ element, targetListItem: currentListItem });
            } else {
              // No previous list item - create a new one
              const newListItem = document.createElement('li');
              list.insertBefore(newListItem, element);
              elementsToMove.push({ element, targetListItem: newListItem });
              currentListItem = newListItem;
            }
          } else if (tagName === 'ol' || tagName === 'ul') {
            // Nested list - should be attached to current list item if it exists
            if (currentListItem) {
              elementsToMove.push({ element, targetListItem: currentListItem });
            }
          }
        }
      }
      
      // Move all orphaned elements to their target list items
      elementsToMove.forEach(({ element, targetListItem }) => {
        // Remove from current position and append to target
        element.remove();
        targetListItem.appendChild(element);
      });
    });
  }

  /**
   * Attach orphaned content that follows lists to the last list item
   * Only attach content that is clearly meant to be continuation content
   */
  private attachOrphanedContentToLists(document: Document): void {
    const lists = document.querySelectorAll('ol, ul');
    
    lists.forEach(list => {
      let nextSibling = list.nextElementSibling;
      const lastListItem = list.querySelector('li:last-child');
      
      if (!lastListItem) return;
      
      // Look for paragraphs immediately following the list
      while (nextSibling && nextSibling.tagName === 'P') {
        const text = nextSibling.textContent?.trim() || '';
        
        // Only attach content that is clearly continuation content
        // 1. Must not start with a number (already checked)
        // 2. Must have specific indicators that it's continuation content
        const isContinuationContent = this.isContinuationContent(nextSibling as Element, text);
        
        if (!text.match(/^\d+\.\s/) && isContinuationContent) {
          // Move this paragraph into the last list item
          const nextToProcess = nextSibling.nextElementSibling;
          lastListItem.appendChild(nextSibling);
          nextSibling = nextToProcess;
        } else {
          break;
        }
      }
    });
  }

  /**
   * Determine if content should be treated as continuation of a list item
   */
  private isContinuationContent(element: Element, text: string): boolean {
    // Check for explicit continuation indicators
    const continuationIndicators = [
      /^(Note|Tip|Warning|Caution|Important):/i,  // Admonition blocks
      /^(For example|Example:|e\.g\.|i\.e\.)/i,   // Example indicators  
      /^(Additionally|Furthermore|Moreover|Also)/i, // Continuation words
      /^(See also|Refer to|Reference)/i,           // Reference indicators
      /^\s*\+/,                                    // AsciiDoc continuation marker
      /^(Step \d+|Phase \d+|Part \d+)/i           // Step/phase continuations
    ];
    
    // Check if text matches continuation patterns
    if (continuationIndicators.some(pattern => pattern.test(text))) {
      return true;
    }
    
    // Check for special CSS classes that indicate continuation
    const className = element.className || '';
    if (className.includes('note') || className.includes('continuation') || 
        className.includes('example') || className.includes('callout')) {
      return true;
    }
    
    // Check for significant indentation (converted from original formatting)
    const style = element.getAttribute('style') || '';
    if (style.includes('margin-left') || style.includes('padding-left') || 
        style.includes('text-indent')) {
      return true;
    }
    
    // Check if this is a very short snippet that looks like it belongs to previous item
    // (but only if it's clearly incomplete or a fragment)
    if (text.length < 50 && !text.match(/[.!?]$/)) {
      return true;
    }
    
    // Default: treat as independent content
    return false;
  }

  /**
   * Phase 2: Normalize All Lists
   * - Fix list structures
   * - Handle orphaned paragraphs in lists
   * - Ensure proper nesting
   */
  private normalizeAllLists(document: Document): void {
    // Process each list type
    this.normalizeOrderedLists(document);
    this.normalizeUnorderedLists(document);
    this.normalizeDefinitionLists(document);
    
    // Fix nested list issues
    this.fixNestedLists(document);
  }

  /**
   * Normalize ordered lists
   */
  private normalizeOrderedLists(document: Document): void {
    const lists = document.querySelectorAll('ol');
    
    lists.forEach(list => {
      this.normalizeList(list, 'li');
    });
  }

  /**
   * Normalize unordered lists
   */
  private normalizeUnorderedLists(document: Document): void {
    const lists = document.querySelectorAll('ul');
    
    lists.forEach(list => {
      this.normalizeList(list, 'li');
    });
  }

  /**
   * Generic list normalization
   */
  private normalizeList(list: Element, itemTag: string): void {
    const children = Array.from(list.children);
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.tagName !== itemTag.toUpperCase()) {
        // This is an orphaned element
        if (child.tagName === 'P') {
          // Convert paragraph to list item
          const li = list.ownerDocument.createElement(itemTag);
          li.innerHTML = child.innerHTML;
          list.replaceChild(li, child);
        } else if (['UL', 'OL'].includes(child.tagName)) {
          // Nested list without parent li - check if previous sibling is li
          const prevSibling = child.previousElementSibling;
          if (prevSibling && prevSibling.tagName === itemTag.toUpperCase()) {
            // Move nested list inside previous li
            prevSibling.appendChild(child);
          } else {
            // Create new li to wrap nested list
            const li = list.ownerDocument.createElement(itemTag);
            list.replaceChild(li, child);
            li.appendChild(child);
          }
        } else {
          // Other elements - wrap in list item
          const li = list.ownerDocument.createElement(itemTag);
          list.replaceChild(li, child);
          li.appendChild(child);
        }
      }
    }
  }

  /**
   * Normalize definition lists
   */
  private normalizeDefinitionLists(document: Document): void {
    const lists = document.querySelectorAll('dl');
    
    lists.forEach(list => {
      const children = Array.from(list.children);
      
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        
        if (!['DT', 'DD'].includes(child.tagName)) {
          // Convert to appropriate element
          if (i === 0 || children[i-1]?.tagName === 'DD') {
            // Should be a term
            const dt = document.createElement('dt');
            dt.innerHTML = child.innerHTML;
            child.replaceWith(dt);
          } else {
            // Should be a description
            const dd = document.createElement('dd');
            dd.innerHTML = child.innerHTML;
            child.replaceWith(dd);
          }
        }
      }
    });
  }

  /**
   * Fix nested list issues
   */
  private fixNestedLists(document: Document): void {
    // Find lists that are direct children of lists (without li wrapper)
    const directNestedLists = document.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol');
    
    directNestedLists.forEach(nestedList => {
      const parent = nestedList.parentElement;
      if (!parent) return;
      
      // Find the previous li or create one
      const prevSibling = nestedList.previousElementSibling;
      if (prevSibling && prevSibling.tagName === 'LI') {
        // Move nested list inside previous li
        prevSibling.appendChild(nestedList);
      } else {
        // Create new li to contain nested list
        const li = document.createElement('li');
        parent.insertBefore(li, nestedList);
        li.appendChild(nestedList);
      }
    });
  }

  /**
   * Fix alphabetical lists that are siblings of main lists instead of being nested
   * This handles the common MadCap pattern where sub-lists are exported as siblings
   */
  private fixSiblingAlphabeticalLists(document: Document): void {
    const allLists = document.querySelectorAll('ol, ul');
    
    for (let i = 0; i < allLists.length; i++) {
      const currentList = allLists[i];
      const nextSibling = currentList.nextElementSibling;
      
      // Check if next sibling is an alphabetical list
      if (nextSibling && 
          (nextSibling.tagName === 'OL' || nextSibling.tagName === 'UL')) {
        
        const style = nextSibling.getAttribute('style') || '';
        const type = nextSibling.getAttribute('type') || '';
        
        // Check if it's an alphabetical list
        const isAlphabetical = style.includes('lower-alpha') || 
                              style.includes('lower-latin') || 
                              style.includes('upper-alpha') || 
                              style.includes('upper-latin') ||
                              type === 'a' || type === 'A' ||
                              type === 'i' || type === 'I';
        
        if (isAlphabetical) {
          // Find the last li in the current list
          const lastLi = currentList.querySelector('li:last-child');
          
          if (lastLi) {
            // Move the alphabetical list inside the last li
            nextSibling.remove();
            lastLi.appendChild(nextSibling);
            
            // Also move any orphaned li elements that might follow
            let nextElement: Element | null = currentList.nextElementSibling;
            while (nextElement && nextElement.tagName === 'LI') {
              const orphanedLi: Element = nextElement;
              const tempNext: Element | null = orphanedLi.nextElementSibling;
              orphanedLi.remove();
              currentList.appendChild(orphanedLi);
              nextElement = tempNext;
            }
          }
        }
      }
    }
  }

  /**
   * Phase 4: Fix URL encoding in image and link paths
   */
  private fixURLEncodedPaths(document: Document): void {
    // Fix image src attributes
    const images = document.querySelectorAll('img[src]');
    images.forEach(img => {
      const src = img.getAttribute('src');
      if (src && src.includes('%20')) {
        img.setAttribute('src', decodeURIComponent(src));
      }
    });
    
    // Fix link href attributes
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.includes('%20')) {
        link.setAttribute('href', decodeURIComponent(href));
      }
    });
  }

  /**
   * Phase 3: Clean Text Content
   * - Decode HTML entities
   * - Normalize whitespace
   * - Convert smart quotes
   * - Fix character encoding issues
   */
  private cleanTextContent(document: Document, dom: JSDOM): void {
    const walker = document.createTreeWalker(
      document.body,
      dom.window.NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.textContent) {
        node.textContent = this.cleanText(node.textContent);
      }
    }
  }

  /**
   * Clean individual text content
   */
  private cleanText(text: string): string {
    // Decode HTML entities (beyond what JSDOM does)
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&zwj;/g, '\u200D')
      .replace(/&zwnj;/g, '\u200C')
      .replace(/&ensp;/g, '\u2002')
      .replace(/&emsp;/g, '\u2003')
      .replace(/&thinsp;/g, '\u2009');
    
    // Convert smart quotes to regular quotes
    text = text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013]/g, '-')  // en dash
      .replace(/[\u2014]/g, '--') // em dash
      .replace(/[\u2026]/g, '...'); // ellipsis
    
    // Normalize whitespace
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/ +/g, ' '); // Multiple spaces to single space
    
    // Fix common encoding issues
    text = text
      .replace(/â€™/g, "'")
      .replace(/â€œ/g, '"')
      .replace(/â€/g, '"')
      .replace(/â€"/g, '--')
      .replace(/â€"/g, '-');
    
    return text;
  }
}
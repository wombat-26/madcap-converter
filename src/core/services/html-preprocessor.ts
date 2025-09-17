import { JSDOM } from 'jsdom';

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
    // Phase 1: Parse and fix DOM structure with enhanced HTML cleanup
    const dom = new JSDOM(html, { 
      contentType: 'text/html',
      includeNodeLocations: true 
    });
    const document = dom.window.document;
    
    // Phase 0: Enhanced HTML structure cleanup (replaces tidy)
    this.enhanceHTMLStructure(document);
    
    // Phase 1: Fix DOM structure
    this.fixDOMStructure(document, dom);
    
    // Phase 2: Normalize lists
    this.convertNumberedParagraphsToLists(document);
    this.fixOrphanedParagraphsInLists(document);
    this.attachOrphanedContentToLists(document);
    this.fixSiblingAlphabeticalLists(document);
    this.normalizeAllLists(document);
    
    // Phase 3: Enhanced text content cleaning
    this.enhancedTextCleaning(document, dom);
    
    // Phase 4: Fix URL encoding in image paths
    this.fixURLEncodedPaths(document);
    
    // Return the cleaned HTML
    return document.body.innerHTML;
  }

  /**
   * Phase 0: Simplified HTML preprocessing to prevent stack overflow
   * Replaces htmltidy2 with basic JSDOM-based cleanup
   */
  private enhanceHTMLStructure(document: Document): void {
    // Basic HTML cleanup to prevent stack overflow
    try {
      // Remove problematic elements that should never be converted to content
      this.removeNonContentElements(document);
      
      // Only fix URL encoding in attributes - this is safe and needed
      this.fixURLEncodedAttributes(document);
      
      // Skip other complex operations that might cause recursion
    } catch (error) {
      console.warn('HTML structure enhancement failed, continuing with basic processing:', error);
    }
  }
  
  /**
   * Remove elements that contain scripts, styles, or other non-content data
   * This prevents them from being processed as content during conversion
   */
  private removeNonContentElements(document: Document): void {
    const elementsToRemove = [
      'script', 'style', 'noscript', 
      'meta', 'link', 'base',
      'canvas', 'embed', 'object', 'param'
    ];
    
    for (const tagName of elementsToRemove) {
      const elements = document.querySelectorAll(tagName);
      console.log(`📄 [HTML Preprocessor] Removing ${elements.length} ${tagName} elements`);
      elements.forEach(element => {
        element.remove();
      });
    }
  }

  /**
   * Fix HTML entities that were malformed in source
   */
  private fixHTMLEntities(document: Document): void {
    const walker = document.createTreeWalker(
      document.body,
      document.defaultView!.NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.textContent) {
        // Fix common malformed entities
        node.textContent = node.textContent
          .replace(/&amp;(?=[a-zA-Z]+;)/g, '&')  // Fix double-encoded entities
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
            try {
              return String.fromCharCode(parseInt(hex, 16));
            } catch {
              return match;
            }
          });
      }
    }
  }

  /**
   * Fix URL-encoded attributes
   */
  private fixURLEncodedAttributes(document: Document): void {
    const elementsWithURLs = document.querySelectorAll('[src], [href], [data-src]');
    elementsWithURLs.forEach(element => {
      ['src', 'href', 'data-src'].forEach(attr => {
        const value = element.getAttribute(attr);
        if (value && value.includes('%')) {
          try {
            element.setAttribute(attr, decodeURIComponent(value));
          } catch {
            // Keep original if decoding fails
          }
        }
      });
    });
  }

  /**
   * Clean up malformed attributes
   */
  private cleanupAttributes(document: Document): void {
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      // Remove empty attributes
      Array.from(element.attributes).forEach(attr => {
        if (attr.value === '' && !['alt', 'title', 'value'].includes(attr.name)) {
          element.removeAttribute(attr.name);
        }
      });
      
      // Fix duplicate class attributes (common issue)
      const classAttr = element.getAttribute('class');
      if (classAttr) {
        const uniqueClasses = [...new Set(classAttr.split(/\s+/).filter(Boolean))];
        element.setAttribute('class', uniqueClasses.join(' '));
      }
    });
  }

  /**
   * Enhanced nesting fixes beyond the basic ones
   */
  private enhanceNestingFixes(document: Document): void {
    // Fix void elements with content (like <img>content</img>)
    const voidElements = ['img', 'br', 'hr', 'input', 'meta', 'link'];
    voidElements.forEach(tagName => {
      const elements = document.querySelectorAll(tagName);
      elements.forEach(element => {
        if (element.textContent?.trim()) {
          // Move text content after the void element
          const textNode = document.createTextNode(element.textContent);
          element.parentNode?.insertBefore(textNode, element.nextSibling);
          element.textContent = '';
        }
      });
    });
    
    // Fix missing closing tags by ensuring proper parent-child relationships
    this.fixMissingClosingTags(document);
  }

  /**
   * Fix elements that should have been closed but weren't
   */
  private fixMissingClosingTags(document: Document): void {
    // JSDOM handles most of this, but we can clean up specific patterns
    const selfClosingElements = document.querySelectorAll('p:empty, div:empty, span:empty');
    selfClosingElements.forEach(element => {
      if (!element.hasChildNodes() && !element.hasAttributes()) {
        element.remove();
      }
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
   * Phase 3: Enhanced Text Content Cleaning
   * - Decode HTML entities (enhanced from tidy functionality)
   * - Normalize whitespace and line endings
   * - Convert smart quotes and special characters
   * - Fix character encoding issues
   * - Handle malformed text from various sources
   */
  private enhancedTextCleaning(document: Document, dom: JSDOM): void {
    const walker = document.createTreeWalker(
      document.body,
      dom.window.NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.textContent) {
        node.textContent = this.enhancedTextClean(node.textContent);
      }
    }
    
    // Additional cleanup for specific text patterns
    this.fixSpecialTextPatterns(document);
  }

  /**
   * Enhanced text cleaning (replaces and extends tidy text processing)
   */
  private enhancedTextClean(text: string): string {
    // Decode HTML entities (beyond what JSDOM does)
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&zwj;/g, '\u200D')
      .replace(/&zwnj;/g, '\u200C')
      .replace(/&ensp;/g, '\u2002')
      .replace(/&emsp;/g, '\u2003')
      .replace(/&thinsp;/g, '\u2009')
      .replace(/&shy;/g, '\u00AD')  // soft hyphen
      .replace(/&lrm;/g, '\u200E')  // left-to-right mark
      .replace(/&rlm;/g, '\u200F'); // right-to-left mark
    
    // Convert smart quotes and special characters
    text = text
      .replace(/[\u2018\u2019]/g, "'")       // smart single quotes
      .replace(/[\u201C\u201D]/g, '"')       // smart double quotes
      .replace(/[\u2013]/g, '-')             // en dash
      .replace(/[\u2014]/g, '--')            // em dash
      .replace(/[\u2026]/g, '...')           // ellipsis
      .replace(/[\u00A0]/g, ' ')             // non-breaking space
      .replace(/[\u2002-\u2009]/g, ' ')      // various spaces
      .replace(/[\u200B-\u200D]/g, '')       // zero-width characters
      .replace(/[\u2028\u2029]/g, '\n');     // line/paragraph separators
    
    // Normalize whitespace and line endings
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/ +/g, ' ')                   // Multiple spaces to single
      .replace(/\n +/g, '\n')                // Remove leading spaces on lines
      .replace(/ +\n/g, '\n')                // Remove trailing spaces on lines
      .replace(/\n\n\n+/g, '\n\n');          // Max 2 consecutive newlines
    
    // Fix common encoding issues (UTF-8 mojibake)
    text = text
      .replace(/â€™/g, "'")
      .replace(/â€œ/g, '"')
      .replace(/â€/g, '"')
      .replace(/â€"/g, '--')
      .replace(/â€"/g, '-')
      .replace(/Ã¡/g, 'á')
      .replace(/Ã©/g, 'é')
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã±/g, 'ñ')
      .replace(/Ã¼/g, 'ü')
      .replace(/Ã¶/g, 'ö')
      .replace(/Ã¤/g, 'ä')
      .replace(/ÃŸ/g, 'ß');
    
    // Fix Windows-1252 characters that appear in UTF-8
    text = text
      .replace(/â€¢/g, '•')              // bullet
      .replace(/â€/g, '–')               // en dash
      .replace(/â€¦/g, '…')              // ellipsis
      .replace(/â„¢/g, '™')              // trademark
      .replace(/Â®/g, '®')               // registered
      .replace(/Â©/g, '©')               // copyright
      .replace(/Â°/g, '°');              // degree
    
    return text.trim();
  }

  /**
   * Fix special text patterns that need document-level processing
   */
  private fixSpecialTextPatterns(document: Document): void {
    // Fix text nodes that contain multiple sentences without proper spacing
    const textNodes = this.getAllTextNodes(document);
    textNodes.forEach(node => {
      if (node.textContent) {
        // Fix missing spaces after periods
        node.textContent = node.textContent
          .replace(/\.([A-Z])/g, '. $1')
          .replace(/\?([A-Z])/g, '? $1')
          .replace(/!([A-Z])/g, '! $1');
      }
    });
    
    // Fix malformed URLs and email addresses
    this.fixMalformedLinks(document);
  }

  /**
   * Get all text nodes in document
   */
  private getAllTextNodes(document: Document): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      document.body,
      document.defaultView!.NodeFilter.SHOW_TEXT,
      null
    );
    
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }
    
    return textNodes;
  }

  /**
   * Fix malformed links and email addresses
   */
  private fixMalformedLinks(document: Document): void {
    const textNodes = this.getAllTextNodes(document);
    textNodes.forEach(node => {
      if (node.textContent) {
        // Fix common URL malformations
        node.textContent = node.textContent
          .replace(/http:\/\/([^\s]+)/g, 'http://$1')
          .replace(/https:\/\/([^\s]+)/g, 'https://$1')
          .replace(/www\.([^\s]+)/g, 'www.$1')
          .replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '$1@$2');
      }
    });
  }
}
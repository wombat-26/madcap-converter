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
    // Phase 0: Basic HTML structure cleaning (replaces tidy)
    const cleanedHtml = this.basicHTMLClean(html);
    
    // Phase 1: Parse and fix DOM structure
    const dom = new JSDOM(cleanedHtml, { 
      contentType: 'text/html',
      includeNodeLocations: true 
    });
    const document = dom.window.document;
    
    // Phase 1: Fix DOM structure
    this.fixDOMStructure(document, dom);
    
    // Phase 2: Normalize lists - MINIMAL processing to avoid breaking structure
    this.convertNumberedParagraphsToLists(document);
    // Enable specific list processing for nested structures
    this.fixOrphanedParagraphsInLists(document);
    this.fixNestedListsAfterListItems(document);
    // this.attachOrphanedContentToLists(document);
    this.fixSiblingAlphabeticalLists(document);
    this.fixMadCapFlattenedProcedures(document);
    this.mergeConsecutiveNumberedLists(document);
    // this.normalizeAllLists(document);
    
    // Phase 3: Clean text content
    this.cleanTextContent(document, dom);
    
    // Phase 4: Fix URL encoding in image paths
    this.fixURLEncodedPaths(document);
    
    // Return the cleaned HTML
    return document.body.innerHTML;
  }

  /**
   * Phase 0: Basic HTML structure cleaning (replaces tidy)
   */
  private basicHTMLClean(html: string): string {
    // Basic HTML cleaning without external dependencies
    let cleaned = html;
    
    // Fix common HTML issues
    // 1. Ensure we have a proper HTML structure
    if (!cleaned.toLowerCase().includes('<html')) {
      cleaned = `<html><head></head><body>${cleaned}</body></html>`;
    }
    
    // 2. Fix common self-closing tag issues
    cleaned = cleaned.replace(/<(br|hr|img|input|meta|link)([^>]*?)(?<!\/)>/gi, '<$1$2/>');
    
    // 3. Fix basic URI encoding issues (but keep MadCap attributes)
    cleaned = cleaned.replace(/&(?![a-zA-Z0-9#][a-zA-Z0-9]*;)/g, '&amp;');
    
    // 4. Clean up extra whitespace while preserving content structure
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // 5. Ensure proper quote consistency 
    cleaned = cleaned.replace(/=([^"'\s>]+)/g, '="$1"');
    
    return cleaned;
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
   * Fix nested lists that appear as siblings after list items
   * This handles cases where <ol> appears immediately after <li> instead of being nested inside
   */
  private fixNestedListsAfterListItems(document: Document): void {
    const lists = document.querySelectorAll('ol, ul');
    
    lists.forEach(list => {
      const children = Array.from(list.children);
      let i = 0;
      
      while (i < children.length) {
        const child = children[i];
        
        if (child.tagName.toLowerCase() === 'li') {
          // Look for nested lists that appear as siblings after this list item
          let j = i + 1;
          const nestedListsToMove: Element[] = [];
          
          // Collect all consecutive nested lists that should belong to this list item
          while (j < children.length && 
                 (children[j].tagName.toLowerCase() === 'ol' || children[j].tagName.toLowerCase() === 'ul')) {
            nestedListsToMove.push(children[j]);
            j++;
          }
          
          // Move all collected nested lists into the current list item
          nestedListsToMove.forEach(nestedList => {
            nestedList.remove();
            child.appendChild(nestedList);
          });
          
          // Update children array since we modified the DOM
          children.splice(i + 1, nestedListsToMove.length);
        }
        
        i++;
      }
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
          // Find the immediately preceding li element
          // The alphabetical list should be nested inside the li that comes right before it
          let precedingLi: Element | null = null;
          
          // Check if the current list has any li children
          const listItems = currentList.querySelectorAll(':scope > li');
          if (listItems.length > 0) {
            // The alphabetical list follows the main list, so use the last li
            precedingLi = listItems[listItems.length - 1];
          }
          
          if (precedingLi) {
            // Move the alphabetical list inside the preceding li
            nextSibling.remove();
            precedingLi.appendChild(nextSibling);
            
            // Also check if there are any li elements that should follow the nested list
            // These would be continuation of the main list
            let nextElement: Element | null = precedingLi.parentElement?.nextElementSibling || null;
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
   * SIMPLIFIED: Focus on the core issue - ensure main procedures remain continuous
   * This is a single, focused fix for the 1-8 numbering issue
   */
  private mergeConsecutiveNumberedLists(document: Document): void {
    // Find all ol elements that should be merged into continuous sequences
    const allOLs = Array.from(document.querySelectorAll('ol'));
    
    for (let i = 0; i < allOLs.length - 1; i++) {
      const currentOL = allOLs[i];
      const nextOL = allOLs[i + 1];
      
      // Skip if either list doesn't exist or is alphabetic/roman
      if (!currentOL || !nextOL) continue;
      
      const currentStyle = currentOL.getAttribute('style') || '';
      const nextStyle = nextOL.getAttribute('style') || '';
      
      // Skip alphabetic and roman lists - don't merge them
      if (currentStyle.includes('lower-alpha') || currentStyle.includes('lower-roman') ||
          nextStyle.includes('lower-alpha') || nextStyle.includes('lower-roman')) {
        continue;
      }
      
      // Check if these are consecutive numbered lists that should be merged
      const shouldMerge = this.shouldMergeConsecutiveLists(currentOL, nextOL);
      
      if (shouldMerge) {
        // Debug: List merging for continuous numbering
        
        // Move all children from nextOL to currentOL
        while (nextOL.firstChild) {
          currentOL.appendChild(nextOL.firstChild);
        }
        
        // Remove the now-empty nextOL
        nextOL.remove();
        
        // Update the array to reflect the removal
        allOLs.splice(i + 1, 1);
        
        // Don't increment i so we can check if there are more lists to merge
        i--;
      }
    }
  }

  private shouldMergeConsecutiveLists(currentOL: Element, nextOL: Element): boolean {
    // Don't merge if there are too many elements between them
    let elementsBetween = 0;
    let sibling = currentOL.nextElementSibling;
    
    while (sibling && sibling !== nextOL) {
      elementsBetween++;
      // Allow some elements between (like orphaned alphabetic lists), but not too many
      if (elementsBetween > 3) return false;
      sibling = sibling.nextElementSibling;
    }
    
    // Merge if the lists are close together
    return sibling === nextOL;
  }

  /**
   * Fix MadCap's flattened procedure patterns where main steps are followed by
   * separate alphabetic lists that should be nested inside the main steps.
   * Also handles continuation of main lists after alphabetic sublists.
   * 
   * Pattern to fix:
   * <ol>
   *   <li>Step 1</li>
   *   <li>On the Type page:</li>
   * </ol>
   * <ol type="a">
   *   <li>Sub-step a</li>
   *   <li>Sub-step b</li>
   * </ol>
   * <ol start="4">
   *   <li>On the Details page:</li>
   * </ol>
   * 
   * Should become:
   * <ol>
   *   <li>Step 1</li>
   *   <li>On the Type page:
   *     <ol type="a">
   *       <li>Sub-step a</li>
   *       <li>Sub-step b</li>
   *     </ol>
   *   </li>
   *   <li>On the Details page:</li>
   * </ol>
   */
  private fixMadCapFlattenedProcedures(document: Document): void {
    const allOLs = Array.from(document.querySelectorAll('ol'));
    let modified = true;
    
    // Keep processing until no more modifications are made
    while (modified) {
      modified = false;
      
      for (let i = 0; i < allOLs.length - 1; i++) {
        const currentList = allOLs[i];
        const nextList = allOLs[i + 1];
        
        if (!currentList || !nextList) continue;
        
        const currentStyle = currentList.getAttribute('style') || '';
        const currentType = currentList.getAttribute('type') || '';
        const nextStyle = nextList.getAttribute('style') || '';
        const nextType = nextList.getAttribute('type') || '';
        
        // Case 1: Main list followed by alphabetic list (nest alphabetic inside main)
        const isCurrentMain = !currentStyle.includes('lower-alpha') && !currentStyle.includes('lower-latin') && currentType !== 'a';
        const isNextAlphabetic = nextStyle.includes('lower-alpha') || nextStyle.includes('lower-latin') || nextType === 'a';
        
        if (isCurrentMain && isNextAlphabetic) {
          const lastMainItem = currentList.lastElementChild;
          if (lastMainItem && lastMainItem.tagName.toLowerCase() === 'li') {
            const lastItemText = lastMainItem.textContent?.trim() || '';
            const isProcedureHeader = lastItemText.match(/^On the .+ page:?$/i) || 
                                     lastItemText.endsWith(' page:') ||
                                     lastItemText.endsWith(' step:') ||
                                     lastItemText.endsWith(' tab:');
            
            if (isProcedureHeader) {
              // Check if lists are close together
              let elementsBetween = 0;
              let sibling = currentList.nextElementSibling;
              while (sibling && sibling !== nextList) {
                elementsBetween++;
                if (elementsBetween > 2) break;
                sibling = sibling.nextElementSibling;
              }
              
              if (elementsBetween <= 2 && sibling === nextList) {
                // Move alphabetic list inside the last main item
                lastMainItem.appendChild(nextList);
                allOLs.splice(i + 1, 1);
                modified = true;
                break;
              }
            }
          }
        }
        
        // Case 2: Main list with start attribute (merge back into the first main list)
        const isNextMainWithStart = !nextStyle.includes('lower-alpha') && !nextStyle.includes('lower-latin') && 
                                   nextType !== 'a' && nextList.hasAttribute('start');
        
        if (isNextMainWithStart) {
          // Find the original main list to merge into
          for (let j = 0; j < i; j++) {
            const candidateMain = allOLs[j];
            if (!candidateMain) continue;
            
            const candidateStyle = candidateMain.getAttribute('style') || '';
            const candidateType = candidateMain.getAttribute('type') || '';
            const isCandidateMain = !candidateStyle.includes('lower-alpha') && !candidateStyle.includes('lower-latin') && candidateType !== 'a';
            
            if (isCandidateMain && !candidateMain.hasAttribute('start')) {
              // This looks like the original main list - merge the continuation items
              while (nextList.firstChild) {
                candidateMain.appendChild(nextList.firstChild);
              }
              nextList.remove();
              allOLs.splice(i + 1, 1);
              modified = true;
              break;
            }
          }
          
          if (modified) break;
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
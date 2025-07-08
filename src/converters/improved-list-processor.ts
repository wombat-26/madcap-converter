/**
 * Improved List Processor - Proper nested list conversion for AsciiDoc
 * 
 * This processor correctly handles nested lists using proper AsciiDoc syntax
 * and maintains list continuity with continuation markers.
 */
export class ImprovedListProcessor {
  
  /**
   * Convert HTML list to AsciiDoc with proper nesting
   */
  convertList(
    listElement: Element, 
    depth: number = 0,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    const tagName = listElement.tagName.toLowerCase();
    
    if (tagName === 'ol') {
      return this.convertOrderedList(listElement, depth, nodeConverter);
    } else if (tagName === 'ul') {
      return this.convertUnorderedList(listElement, depth, nodeConverter);
    }
    
    return '';
  }
  
  /**
   * Convert ordered list (ol) to AsciiDoc
   */
  private convertOrderedList(
    list: Element, 
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    // Check for mixed content (li elements + orphaned content)
    const allChildren = Array.from(list.children);
    const listItems = allChildren.filter(child => child.tagName.toLowerCase() === 'li');
    const hasOrphanedContent = allChildren.length > listItems.length;
    
    
    if (listItems.length === 0) return '';
    
    // Use mixed content processing if orphaned elements exist
    if (hasOrphanedContent) {
      return this.convertMixedOrderedList(list, depth, nodeConverter);
    }
    
    let result = '';
    
    // Check if this is an alphabetical or roman numeral list
    const style = list.getAttribute('style') || '';
    const type = list.getAttribute('type') || '';
    const isAlphabetical = style.includes('lower-alpha') || style.includes('lower-latin') || type === 'a';
    const isRoman = style.includes('lower-roman') || type === 'i';
    
    // Add appropriate list style attributes
    if (isAlphabetical) {
      result += '[loweralpha]\n';
    } else if (isRoman) {
      result += '[lowerroman]\n';
    }
    
    // Process each list item
    for (let i = 0; i < listItems.length; i++) {
      const item = listItems[i];
      
      
      // Check if this is orphaned content
      if (item.getAttribute('data-orphaned-content') === 'true') {
        // This is orphaned content - add it as continuation to the previous item
        if (i > 0) {
          result += '+\n';
          const content = item.textContent?.trim() || '';
          result += content + '\n';
        }
      } else {
        // Normal list item
        result += this.processListItem(item, 'ordered', depth, nodeConverter);
      }
    }
    
    return result;
  }

  /**
   * Convert ordered list with mixed content (li + orphaned elements)
   */
  private convertMixedOrderedList(
    list: Element, 
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    let result = '';
    let currentListItem: Element | null = null;
    let pendingOrphanedContent: string[] = [];
    
    // Check for alphabetical or roman numeral style
    const style = list.getAttribute('style') || '';
    const type = list.getAttribute('type') || '';
    const isAlphabetical = style.includes('lower-alpha') || style.includes('lower-latin') || type === 'a';
    const isRoman = style.includes('lower-roman') || type === 'i';
    
    // Add appropriate list style attributes for mixed content lists too
    if (isAlphabetical) {
      result += '[loweralpha]\n';
    } else if (isRoman) {
      result += '[lowerroman]\n';
    }
    
    // Process all children sequentially with better association logic
    const allChildren = Array.from(list.children);
    
    for (let i = 0; i < allChildren.length; i++) {
      const child = allChildren[i];
      const tagName = child.tagName.toLowerCase();
      
      if (tagName === 'li') {
        // Process the current list item
        currentListItem = child;
        result += this.processListItem(child, 'ordered', depth, nodeConverter);
        
        // Look ahead for any orphaned content that should belong to this list item
        let j = i + 1;
        const associatedOrphanedContent: string[] = [];
        
        while (j < allChildren.length && allChildren[j].tagName.toLowerCase() !== 'li') {
          const orphanedElement = allChildren[j];
          const orphanedContent = this.processOrphanedContent(orphanedElement, nodeConverter);
          if (orphanedContent.trim()) {
            associatedOrphanedContent.push(orphanedContent.trim());
          }
          j++;
        }
        
        // Add associated orphaned content with continuation markers
        if (associatedOrphanedContent.length > 0) {
          associatedOrphanedContent.forEach(content => {
            result += '+\n';
            result += content + '\n';
          });
        }
        
        // Skip the orphaned elements we just processed
        i = j - 1;  // -1 because the for loop will increment
        
      }
      // Note: orphaned content is now handled in the look-ahead logic above
    }
    
    return result;
  }

  /**
   * Process orphaned content (non-li elements within ol)
   */
  private processOrphanedContent(
    element: Element,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    const tagName = element.tagName.toLowerCase();
    
    // Handle different types of orphaned content
    if (tagName === 'p') {
      return element.textContent?.trim() || '';
    } else if (tagName === 'div' && element.classList.contains('note')) {
      // Handle note divs
      const noteContent = element.textContent?.trim() || '';
      return `[NOTE]\n====\n${noteContent}\n====`;
    } else if (tagName === 'div' && (element.classList.contains('warning') || element.classList.contains('caution'))) {
      // Handle warning/caution divs
      const warningContent = element.textContent?.trim() || '';
      return `[WARNING]\n====\n${warningContent}\n====`;
    } else if (tagName === 'img') {
      // Handle orphaned images
      const src = element.getAttribute('src') || '';
      const alt = element.getAttribute('alt') || '';
      const isInline = element.classList.contains('IconInline') || 
                      (element.getAttribute('style') || '').includes('width') && 
                      parseInt((element.getAttribute('style') || '').match(/width:\s*(\d+)/)?.[1] || '100') <= 32;
      
      if (isInline) {
        return `image:${src}[${alt}]`;
      } else {
        return `image::${src}[${alt}]`;
      }
    } else {
      // For any other orphaned content, extract text
      return element.textContent?.trim() || '';
    }
  }
  
  /**
   * Convert unordered list (ul) to AsciiDoc
   */
  private convertUnorderedList(
    list: Element, 
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    const listItems = Array.from(list.children).filter(child => 
      child.tagName.toLowerCase() === 'li'
    );
    
    if (listItems.length === 0) return '';
    
    let result = '';
    
    // Process each list item
    listItems.forEach((item) => {
      result += this.processListItem(item, 'unordered', depth, nodeConverter);
    });
    
    return result;
  }
  
  /**
   * Process a single list item with all its content
   */
  private processListItem(
    item: Element,
    listType: 'ordered' | 'unordered',
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    let result = '';
    
    // Check if this item is in a special numbered list
    let parentElement = item.parentElement;
    let isInAlphabeticalList = false;
    let isInRomanList = false;
    if (parentElement?.tagName.toLowerCase() === 'ol') {
      const style = parentElement.getAttribute('style') || '';
      const type = parentElement.getAttribute('type') || '';
      isInAlphabeticalList = style.includes('lower-alpha') || style.includes('lower-latin') || type === 'a';
      isInRomanList = style.includes('lower-roman') || type === 'i';
    }
    
    // Get the appropriate marker
    const marker = listType === 'ordered' 
      ? this.getOrderedMarker(depth, isInAlphabeticalList, isInRomanList)
      : this.getUnorderedMarker(depth);
      
    
    // Process the content of this list item
    const content = this.extractListItemContent(item, depth, nodeConverter);
    
    // Add the main content with the list marker
    if (content.mainContent) {
      result += `${marker} ${content.mainContent}\n`;
    }
    
    // Add any additional content blocks with continuation
    content.additionalBlocks.forEach((block, index) => {
      // Skip empty content
      if (!block.content || !block.content.trim()) {
        return;
      }
      
      if (block.type === 'paragraph' || block.type === 'note' || block.type === 'image') {
        result += '+\n';
        result += block.content + '\n';
      } else if (block.type === 'nested-list') {
        // Nested lists NEED + continuation to be properly nested in AsciiDoc
        result += '+\n';
        result += block.content;
      }
    });
    
    return result;
  }
  
  /**
   * Extract and structure content from a list item
   */
  private extractListItemContent(
    item: Element,
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): {
    mainContent: string;
    additionalBlocks: Array<{type: string, content: string}>;
  } {
    let mainContent = '';
    const additionalBlocks: Array<{type: string, content: string}> = [];
    let currentInlineContent = '';
    let hasSetMainContent = false;
    
    const children = Array.from(item.childNodes);
    
    // Helper to flush inline content
    const flushInlineContent = () => {
      if (currentInlineContent.trim()) {
        if (!hasSetMainContent) {
          mainContent = currentInlineContent.trim();
          hasSetMainContent = true;
        } else {
          additionalBlocks.push({
            type: 'paragraph',
            content: currentInlineContent.trim()
          });
        }
        currentInlineContent = '';
      }
    };
    
    // Process children
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 3) { // Text node
        const text = (child.textContent || '').trim();
        if (text) {
          currentInlineContent += currentInlineContent ? ' ' + text : text;
        }
      } else if (child.nodeType === 1) { // Element node
        const element = child as Element;
        const tagName = element.tagName.toLowerCase();
        
        // Handle nested lists - these are always block level
        if (tagName === 'ol' || tagName === 'ul') {
          flushInlineContent();
          
          const nestedList = this.convertList(element, depth + 1, nodeConverter);
          additionalBlocks.push({
            type: 'nested-list',
            content: nestedList
          });
          
        } else if (tagName === 'p') {
          // Paragraphs are block level
          flushInlineContent();
          
          // Check if this paragraph contains only an image
          const images = element.querySelectorAll('img');
          const hasOnlyImage = images.length === 1 && 
                              (element.textContent || '').trim().length <= (element.querySelector('img')?.getAttribute('alt') || '').length + 10;
          
          if (hasOnlyImage) {
            // Handle image-only paragraphs as images, not paragraphs
            const img = images[0];
            const imgContent = nodeConverter ? nodeConverter(img, depth) : '';
            if (imgContent && imgContent.includes('image::')) {
              additionalBlocks.push({
                type: 'image',
                content: imgContent.trim()
              });
            }
          } else {
            // Check if this is a note header paragraph (contains only "Note:" or similar)
            const noteSpan = element.querySelector('span.noteInDiv, span.warningInDiv, span.tipInDiv, span.cautionInDiv');
            const textContent = (element.textContent || '').trim();
            const isNoteHeader = noteSpan && textContent.length <= 20 && /^(Note|Warning|Tip|Caution):\s*$/i.test(textContent);
            
            if (isNoteHeader && i + 1 < children.length) {
              // Look ahead for the next paragraph that contains the actual note content
              const nextChild = children[i + 1];
              if (nextChild.nodeType === 1 && (nextChild as Element).tagName.toLowerCase() === 'p') {
                const nextElement = nextChild as Element;
                const nextContent = this.extractElementContent(nextElement, nodeConverter, depth);
                if (nextContent && nextContent.trim()) {
                  // Merge the note header and content
                  const noteType = textContent.toLowerCase().replace(':', '').toUpperCase();
                  const combinedNote = `[${noteType}]\n====\n${nextContent.trim()}\n====`;
                  additionalBlocks.push({
                    type: 'note',
                    content: combinedNote
                  });
                  i++; // Skip the next paragraph since we processed it
                  continue;
                }
              }
            }
            
            // Handle as regular paragraph
            const pContent = this.extractElementContent(element, nodeConverter, depth);
            if (pContent && pContent.trim()) {
              if (!hasSetMainContent) {
                mainContent = pContent;
                hasSetMainContent = true;
              } else {
                // For multiple paragraphs in same list item, combine them into mainContent
                // instead of treating as separate blocks (which adds continuation markers)
                if (mainContent) {
                  mainContent += '\n+\n' + pContent;
                } else {
                  mainContent = pContent;
                  hasSetMainContent = true;
                }
              }
            }
          }
          
        } else if (tagName === 'div') {
          // Check if this is a note div or other block content
          if (this.isNoteDiv(element)) {
            flushInlineContent();
            const noteContent = this.extractNoteContent(element, nodeConverter, depth);
            if (noteContent) {
              additionalBlocks.push({
                type: 'note',
                content: noteContent
              });
            }
          } else {
            // Other divs might contain inline content
            const content = this.extractElementContent(element, nodeConverter, depth);
            if (content) {
              currentInlineContent += currentInlineContent ? ' ' + content : content;
            }
          }
          
        } else if (tagName === 'img') {
          // Check if image is inline or block
          const imgContent = nodeConverter ? nodeConverter(element, depth) : '';
          if (imgContent && imgContent.includes('image::')) {
            // Block image
            flushInlineContent();
            additionalBlocks.push({
              type: 'image',
              content: imgContent.trim()
            });
          } else if (imgContent) {
            // Inline image
            currentInlineContent += currentInlineContent ? ' ' + imgContent : imgContent;
          }
          
        } else if (this.isBlockElement(tagName)) {
          // Other block elements
          flushInlineContent();
          const content = this.extractElementContent(element, nodeConverter, depth);
          if (content) {
            additionalBlocks.push({
              type: 'paragraph',
              content: content
            });
          }
          
        } else {
          // Inline elements (em, strong, span, etc.)
          const content = this.extractElementContent(element, nodeConverter, depth);
          if (content) {
            currentInlineContent += currentInlineContent ? ' ' + content : content;
          }
        }
      }
    }
    
    // Flush any remaining inline content
    flushInlineContent();
    
    // If we still don't have main content, use the first block
    if (!mainContent && additionalBlocks.length > 0) {
      const firstBlock = additionalBlocks.shift();
      if (firstBlock) {
        mainContent = firstBlock.content;
      }
    }
    
    
    return { mainContent, additionalBlocks };
  }
  
  /**
   * Check if element is a note div
   */
  private isNoteDiv(element: Element): boolean {
    const className = element.className || '';
    return className.includes('note') || 
           className.includes('warning') ||
           className.includes('tip') ||
           className.includes('caution') ||
           element.querySelector('.noteInDiv, .warningInDiv, .tipInDiv, .cautionInDiv') !== null;
  }
  
  /**
   * Extract content from note div
   */
  private extractNoteContent(
    noteDiv: Element,
    nodeConverter?: (node: Node, depth: number) => string,
    depth: number = 0
  ): string {
    if (nodeConverter) {
      // Let the main converter handle note conversion
      const result = nodeConverter(noteDiv, depth);
      // Remove extra newlines that might break list continuation
      return result.trim();
    }
    
    // Fallback
    const content = noteDiv.textContent?.trim() || '';
    return content ? `NOTE: ${content}` : '';
  }
  
  /**
   * Check if tag is a block element
   */
  private isBlockElement(tagName: string): boolean {
    const blockElements = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                          'blockquote', 'pre', 'table', 'hr'];
    return blockElements.includes(tagName);
  }
  
  /**
   * Extract text content from element
   */
  private extractElementContent(
    element: Element, 
    nodeConverter?: (node: Node, depth: number) => string, 
    depth: number = 0
  ): string {
    if (nodeConverter) {
      return nodeConverter(element, depth).trim();
    } else {
      return (element.textContent || '').trim();
    }
  }
  
  /**
   * Get ordered list marker based on depth
   * Proper AsciiDoc syntax: . for level 0, .. for level 1, etc.
   * This applies to ALL ordered lists including alphabetical and roman
   */
  private getOrderedMarker(depth: number, isAlphabetical: boolean = false, isRoman: boolean = false): string {
    // For alphabetical lists, we use the [loweralpha] attribute and standard numbered markers
    // The list processor already adds the [loweralpha] attribute above the list
    // For roman lists, we use the [lowerroman] attribute and standard numbered markers  
    // For numeric lists, use dot-based markers
    const level = Math.min(depth + 1, 5);
    return '.'.repeat(level);
  }
  
  /**
   * Get unordered list marker based on depth
   * Proper AsciiDoc syntax: * for level 0, ** for level 1, etc.
   */
  private getUnorderedMarker(depth: number): string {
    const level = Math.min(depth + 1, 5);
    return '*'.repeat(level);
  }
}
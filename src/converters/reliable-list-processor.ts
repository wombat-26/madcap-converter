/**
 * Reliable List Processor - Simple, structure-preserving list conversion
 * 
 * This processor focuses on maintaining the exact HTML structure without
 * complex transformations that can break document integrity.
 */
export class ReliableListProcessor {
  
  /**
   * Convert HTML list to AsciiDoc with structure preservation
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
    const listItems = Array.from(list.children).filter(child => 
      child.tagName.toLowerCase() === 'li'
    );
    
    if (listItems.length === 0) return '';
    
    let result = '';
    
    // Check if this is an alphabetical list
    const style = list.getAttribute('style') || '';
    const isAlphabetical = style.includes('lower-alpha') || style.includes('lower-latin');
    
    // Add list attribute for alphabetical lists
    if (isAlphabetical) {
      result += '[loweralpha]\n';
    }
    
    // Generate the appropriate marker based on depth
    const marker = this.getOrderedMarker(depth, isAlphabetical);
    
    // Process each list item, checking for sibling lists
    listItems.forEach((item, index) => {
      const itemResult = this.processListItem(item, marker, depth, nodeConverter);
      result += itemResult;
      
      // Check if this list item should have a sibling list associated with it
      if (index === listItems.length - 1) {
        // This is the last item, check for sibling lists
        const siblingLists = this.findSiblingLists(list);
        for (const siblingList of siblingLists) {
          result += '+\n';
          result += this.convertList(siblingList, depth + 1, nodeConverter);
        }
      }
    });
    
    return result;
  }
  
  /**
   * Find sibling lists that should be associated with this list's last item
   */
  private findSiblingLists(list: Element): Element[] {
    const siblingLists: Element[] = [];
    let nextSibling = list.nextElementSibling;
    
    // Look for consecutive sibling lists
    while (nextSibling) {
      const tagName = nextSibling.tagName.toLowerCase();
      
      if (tagName === 'ol' || tagName === 'ul') {
        siblingLists.push(nextSibling);
        nextSibling = nextSibling.nextElementSibling;
      } else if (tagName === 'li') {
        // If we encounter another list item, this might be a broken structure
        // Skip it for now
        break;
      } else {
        // Any other element breaks the sibling list chain
        break;
      }
    }
    
    return siblingLists;
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
    const marker = this.getUnorderedMarker(depth);
    
    // Process each list item
    listItems.forEach((item, index) => {
      const itemResult = this.processListItem(item, marker, depth, nodeConverter);
      result += itemResult;
    });
    
    return result;
  }
  
  /**
   * Process a single list item while preserving structure and paragraph separation
   */
  private processListItem(
    item: Element,
    marker: string,
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    let result = '';
    
    // Process list item content preserving paragraph structure
    const content = this.processListItemContent(item, depth, nodeConverter);
    
    // Add the first paragraph as the main list item
    if (content.paragraphs.length > 0) {
      result += `${marker} ${content.paragraphs[0]}\n`;
      
      // Add remaining paragraphs as continuation content
      for (let i = 1; i < content.paragraphs.length; i++) {
        result += '+\n';
        result += content.paragraphs[i] + '\n';
      }
    }
    
    // Add nested lists with continuation
    if (content.nestedLists.length > 0) {
      for (const nestedList of content.nestedLists) {
        result += '+\n';
        result += nestedList;
      }
    }
    
    // Add any content that comes after nested lists
    if (content.afterListContent.length > 0) {
      for (const afterContent of content.afterListContent) {
        result += '+\n';
        result += afterContent + '\n';
      }
    }
    
    return result;
  }
  
  /**
   * Extract structured content from list item, preserving paragraph boundaries
   */
  private processListItemContent(
    item: Element,
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): {
    paragraphs: string[];
    nestedLists: string[];
    afterListContent: string[];
  } {
    const paragraphs: string[] = [];
    const nestedLists: string[] = [];
    const afterListContent: string[] = [];
    let foundNestedList = false;
    
    const children = Array.from(item.childNodes);
    
    for (const child of children) {
      if (child.nodeType === 3) { // Text node
        const text = (child.textContent || '').trim();
        if (text) {
          if (!foundNestedList) {
            // Add to current paragraph or start new one
            if (paragraphs.length === 0) {
              paragraphs.push(text);
            } else {
              paragraphs[paragraphs.length - 1] += ' ' + text;
            }
          } else {
            afterListContent.push(text);
          }
        }
      } else if (child.nodeType === 1) { // Element node
        const element = child as Element;
        const tagName = element.tagName.toLowerCase();
        
        if (tagName === 'ol' || tagName === 'ul') {
          foundNestedList = true;
          const nestedResult = this.convertList(element, depth + 1, nodeConverter);
          nestedLists.push(nestedResult);
          
        } else if (tagName === 'p') {
          // Each paragraph should be separate
          const text = this.extractTextFromElement(element, nodeConverter, depth + 1);
          if (text) {
            if (!foundNestedList) {
              paragraphs.push(text);
            } else {
              afterListContent.push(text);
            }
          }
          
        } else if (tagName === 'div') {
          // Handle divs - let the main converter process notes to avoid duplication
          const text = this.extractTextFromElement(element, nodeConverter, depth + 1);
          if (text) {
            if (!foundNestedList) {
              paragraphs.push(text);
            } else {
              afterListContent.push(text);
            }
          }
          
        } else if (tagName === 'img') {
          // Handle images as separate blocks
          const imgContent = this.extractTextFromElement(element, nodeConverter, depth + 1);
          if (imgContent) {
            if (!foundNestedList) {
              paragraphs.push(imgContent);
            } else {
              afterListContent.push(imgContent);
            }
          }
          
        } else {
          // Other elements - extract text but don't force new paragraph
          const text = this.extractTextFromElement(element, nodeConverter, depth + 1);
          if (text) {
            if (!foundNestedList) {
              if (paragraphs.length === 0) {
                paragraphs.push(text);
              } else {
                paragraphs[paragraphs.length - 1] += ' ' + text;
              }
            } else {
              afterListContent.push(text);
            }
          }
        }
      }
    }
    
    return { paragraphs, nestedLists, afterListContent };
  }
  
  /**
   * Extract content from note div elements
   */
  private extractNoteContent(
    noteDiv: Element,
    nodeConverter?: (node: Node, depth: number) => string,
    depth: number = 0
  ): string {
    // Look for note type in span
    const noteSpan = noteDiv.querySelector('.noteInDiv, .warningInDiv, .tipInDiv, .cautionInDiv');
    let noteType = 'NOTE';
    
    if (noteSpan) {
      const spanText = noteSpan.textContent?.trim() || '';
      if (spanText.match(/^(Note|Tip|Warning|Caution|Attention|Important):?$/i)) {
        noteType = spanText.replace(/:$/, '').toUpperCase();
      }
    }
    
    // Create a clone to work with
    const noteDivClone = noteDiv.cloneNode(true) as Element;
    
    // Remove the note span from the clone to get clean content
    const noteSpanInClone = noteDivClone.querySelector('.noteInDiv, .warningInDiv, .tipInDiv, .cautionInDiv');
    noteSpanInClone?.remove();
    
    // Extract clean content without the note label
    const content = this.extractTextFromElement(noteDivClone, nodeConverter, depth);
    
    if (content.trim()) {
      return `[${noteType}]\n====\n${content.trim()}\n====`;
    }
    
    return '';
  }
  
  /**
   * Extract text from an element using the provided converter or fallback
   */
  private extractTextFromElement(
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
   */
  private getOrderedMarker(depth: number, isAlphabetical: boolean): string {
    // For ordered lists, use dots according to depth
    // . for level 0
    // .. for level 1  
    // ... for level 2, etc.
    // This works for all ordered lists including alphabetical ones
    const level = Math.min(depth + 1, 5);
    return '.'.repeat(level);
  }
  
  /**
   * Get unordered list marker based on depth
   */
  private getUnorderedMarker(depth: number): string {
    // Use asterisks based on depth for proper AsciiDoc nesting
    // * for level 0
    // ** for level 1
    // *** for level 2, etc.
    const level = Math.min(depth + 1, 5);
    return '*'.repeat(level);
  }
}
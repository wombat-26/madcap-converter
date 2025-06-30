/**
 * Enhanced list processor that supports deep nesting (8+ levels)
 * and mixed list type transitions (ol → ul → dl)
 * 
 * Focuses purely on AsciiDoc syntax generation - DOM cleanup is handled by MadCapPreprocessor
 */
export class EnhancedListProcessor {
  private readonly MAX_DEPTH = 10; // Support up to 10 levels of nesting
  
  /**
   * Convert list element to AsciiDoc with enhanced depth support
   */
  convertListWithDeepNesting(
    list: Element, 
    _baseMarker: string, // Unused parameter - kept for API compatibility
    depth: number = 0,
    parentType?: 'ol' | 'ul' | 'dl',
    listStyle?: string, // New parameter to support list-style-type
    nodeConverter?: (node: Node, depth: number) => string // Delegate content processing to main converter
  ): string {
    const listType = list.tagName.toLowerCase() as 'ol' | 'ul' | 'dl';
    
    
    // Warn about excessive nesting
    if (depth > this.MAX_DEPTH) {
      console.warn(`List nesting depth exceeds maximum (${this.MAX_DEPTH}). Converting remaining levels as continuation content.`);
      return this.convertOverlyDeepList(list, depth);
    }
    
    // Determine appropriate marker for this list type and depth
    const marker = this.determineMarkerForDepthAndType(listType, depth, parentType, listStyle);
    
    switch (listType) {
      case 'ol':
        return this.convertOrderedList(list, marker, depth, listStyle, nodeConverter);
      case 'ul':
        return this.convertUnorderedList(list, marker, depth, nodeConverter);
      case 'dl':
        return this.convertDefinitionList(list, depth, nodeConverter);
      default:
        console.warn(`Unknown list type: ${listType}`);
        return '';
    }
  }
  
  /**
   * Determine appropriate marker based on list type and depth
   * Enhanced to support list-style-type attributes
   */
  private determineMarkerForDepthAndType(
    currentType: 'ol' | 'ul' | 'dl',
    depth: number,
    _parentType?: 'ol' | 'ul' | 'dl', // Unused parameter - kept for API compatibility
    listStyle?: string
  ): string {
    // Generate marker based on current list type and depth
    switch (currentType) {
      case 'ol':
        return this.getOrderedMarker(depth, listStyle);
      case 'ul':
        return this.getUnorderedMarker(depth);
      case 'dl':
        return ''; // Definition lists don't use markers
      default:
        return '*'; // Fallback to basic unordered marker
    }
  }
  
  /**
   * Get ordered list marker for specific depth
   * Supports deep nesting (8+ levels) and different list styles
   */
  private getOrderedMarker(depth: number, listStyle?: string): string {
    const level = Math.min(depth, this.MAX_DEPTH);
    
    // Check for alphabetical list style - support both CSS property and value formats
    const hasAlphabeticStyle = listStyle && (
      listStyle.includes('lower-alpha') || 
      listStyle.includes('lower-latin') ||
      listStyle.includes('list-style-type: lower-alpha') ||
      listStyle.includes('list-style-type: lower-latin') ||
      listStyle.match(/list-style-type\s*:\s*lower-alpha/i) ||
      listStyle.match(/list-style-type\s*:\s*lower-latin/i)
    );
    
    if (hasAlphabeticStyle) {
      // For alphabetical lists in AsciiDoc with [loweralpha], always use single dot
      // The [loweralpha] attribute handles the alphabetic rendering
      return '.';
    }
    
    // Default numeric ordered list markers with proper depth limits
    // AsciiDoc supports up to 5 levels: ., .., ..., ...., .....
    const maxLevel = Math.min(level + 1, 5);
    return '.'.repeat(maxLevel);
  }
  
  /**
   * Get unordered list marker for specific depth with alternating styles
   * Supports deep nesting (8+ levels) as documented
   */
  private getUnorderedMarker(depth: number): string {
    // AsciiDoc unordered list markers: *, **, ***, ****, *****
    // Limit to 5 levels maximum as per AsciiDoc specification
    const level = Math.min(depth, 4); // 0-4 = 5 levels
    
    // Generate marker with proper depth support (max 5 asterisks)
    return '*'.repeat(level + 1);
  }
  
  /**
   * Convert ordered list with enhanced depth handling
   */
  private convertOrderedList(list: Element, marker: string, depth: number, listStyle?: string, nodeConverter?: (node: Node, depth: number) => string): string {
    return this.convertGenericList(list, marker, depth, 'ol', listStyle, nodeConverter);
  }
  
  /**
   * Convert unordered list with enhanced depth handling
   */
  private convertUnorderedList(list: Element, marker: string, depth: number, nodeConverter?: (node: Node, depth: number) => string): string {
    return this.convertGenericList(list, marker, depth, 'ul', undefined, nodeConverter);
  }
  
  /**
   * Convert definition list with enhanced structure handling
   */
  private convertDefinitionList(list: Element, depth: number, nodeConverter?: (node: Node, depth: number) => string): string {
    let result = '';
    const children = Array.from(list.children);
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const tagName = child.tagName.toLowerCase();
      
      if (tagName === 'dt') {
        // Definition term
        const termText = nodeConverter ? nodeConverter(child, depth + 1).trim() : this.extractTextContent(child);
        result += `${termText}::\n`;
        
      } else if (tagName === 'dd') {
        // Definition description
        const descContent = this.processDefinitionDescription(child, depth, nodeConverter);
        result += `  ${descContent.mainText}\n`;
        
        if (descContent.continuationContent) {
          result += descContent.continuationContent;
        }
        
        if (descContent.nestedLists) {
          result += descContent.nestedLists;
        }
      }
    }
    
    return result;
  }
  
  /**
   * Process list item with simplified structure analysis
   * DOM is already cleaned by MadCapPreprocessor, so we focus on AsciiDoc syntax
   */
  private processListItemWithDepth(
    item: Element, 
    depth: number, 
    parentListType: 'ol' | 'ul' | 'dl',
    nodeConverter?: (node: Node, depth: number) => string
  ): {
    mainText: string;
    continuationContent: string;
    nestedLists: string;
  } {
    // Process the cleaned DOM structure directly
    return this.processCleanListItem(item, depth, parentListType, nodeConverter);
  }

  /**
   * Process sibling lists that follow a list item (MadCap pattern)
   * This handles the case where HTML has:
   * <li><p>Text</p></li>
   * <ol>...</ol> (as sibling, not child)
   */
  private processSiblingNestedList(
    listItem: Element,
    depth: number,
    parentListType: 'ol' | 'ul' | 'dl',
    nodeConverter?: (node: Node, depth: number) => string
  ): {
    mainText: string;
    continuationContent: string;
    nestedLists: string;
  } {
    const result = {
      mainText: '',
      continuationContent: '',
      nestedLists: ''
    };

    // Get the main text from the list item
    const textContent = nodeConverter ? nodeConverter(listItem, depth + 1) : this.extractTextContent(listItem);
    result.mainText = textContent.trim().replace(/^\s*[a-z]\.\s+/, '');

    // Look for sibling lists that follow this list item
    let nextSibling = listItem.nextElementSibling;
    while (nextSibling) {
      const tagName = nextSibling.tagName.toLowerCase();
      
      if (tagName === 'ol' || tagName === 'ul' || tagName === 'dl') {
        // Found a sibling list - this should be treated as nested under the current item
        const listStyle = nextSibling.getAttribute('style');
        
        // CRITICAL FIX: Handle list style attributes properly for MadCap sibling structure
        let nestedList = '';
        const hasAlphabeticStyle = listStyle && (
          listStyle.includes('lower-alpha') || 
          listStyle.includes('lower-latin') ||
          listStyle.includes('list-style-type: lower-alpha') ||
          listStyle.includes('list-style-type: lower-latin') ||
          listStyle.match(/list-style-type\s*:\s*lower-alpha/i) ||
          listStyle.match(/list-style-type\s*:\s*lower-latin/i)
        );
        
        // Add [loweralpha] before the nested list if needed
        if (tagName === 'ol' && hasAlphabeticStyle) {
          nestedList += '[loweralpha]\n';
        }
        
        const listContent = this.convertListWithDeepNesting(
          nextSibling,
          this.getBaseMarkerForType(tagName as 'ol' | 'ul' | 'dl'),
          depth + 1,
          parentListType,
          listStyle || undefined,
          nodeConverter
        );
        
        // Remove [loweralpha] from the content since we added it above
        const cleanListContent = listContent.replace(/\[loweralpha\]\n/, '');
        nestedList += cleanListContent;
        
        if (nestedList.trim()) {
          // Add as continuation content with proper formatting
          // For alphabetical lists, ensure proper line breaks around [loweralpha]
          if (tagName === 'ol' && hasAlphabeticStyle && nestedList.startsWith('[loweralpha]')) {
            // Don't add extra continuation marker before [loweralpha] - it should be on its own line
            result.nestedLists += (result.nestedLists ? '\n+\n' : '\n+\n') + nestedList;
          } else {
            result.nestedLists += (result.nestedLists ? '\n+\n' : '\n+\n') + nestedList;
          }
        }
        
        // Mark this sibling as processed (remove it from DOM)
        const toRemove = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        toRemove.remove();
      } else if (tagName === 'li') {
        // Stop at next list item
        break;
      } else {
        // Continue looking through other siblings
        nextSibling = nextSibling.nextElementSibling;
      }
    }

    return result;
  }
  
  /**
   * Process clean list item structure (DOM already cleaned by preprocessor)
   * Focus purely on AsciiDoc syntax generation
   */
  private processCleanListItem(
    item: Element,
    depth: number,
    parentListType: 'ol' | 'ul' | 'dl',
    nodeConverter?: (node: Node, depth: number) => string
  ): {
    mainText: string;
    continuationContent: string;
    nestedLists: string;
  } {
    let mainText = '';
    let continuationContent = '';
    let nestedLists = '';
    
    
    // Process direct children since DOM is already clean
    const children = Array.from(item.children);
    let hasMainText = false;
    
    for (const child of children) {
      const tagName = child.tagName.toLowerCase();
      
      if (tagName === 'p') {
        // Paragraphs contain main text or continuation content
        const content = nodeConverter ? nodeConverter(child, depth + 1) : this.extractTextContent(child);
        const cleanedContent = content.trim();
        
        if (!hasMainText && cleanedContent) {
          // For main text, ensure we don't include any residual list markers
          const finalMainText = cleanedContent.replace(/^\s*[a-z]\.\s+/, '');
          if (finalMainText) {
            mainText = finalMainText;
            hasMainText = true;
          }
        } else if (cleanedContent) {
          // For continuation content, clean list markers and strip trailing punctuation to avoid doubling
          let finalContinuationText = cleanedContent.replace(/^\s*[a-z]\.\s+/, '');
          
          // Strip trailing periods to prevent double punctuation when content is merged
          finalContinuationText = finalContinuationText.replace(/\.\s*$/, '');
          
          if (finalContinuationText.trim()) {
            continuationContent += (continuationContent ? '\n+\n' : '\n+\n') + finalContinuationText;
          }
        }
      } else if (tagName === 'ul' || tagName === 'ol' || tagName === 'dl') {
        // Nested lists (DOM is already properly nested by preprocessor)
        const listStyle = child.getAttribute('style');
        
        const nestedList = this.convertListWithDeepNesting(
          child,
          this.getBaseMarkerForType(tagName as 'ol' | 'ul' | 'dl'),
          depth + 1,
          parentListType,
          listStyle || undefined,
          nodeConverter
        );
        
        if (nestedList.trim()) {
          // For alphabetic lists, ensure [loweralpha] is properly placed
          if (tagName === 'ol' && listStyle && listStyle.includes('lower-alpha')) {
            const hasLowerAlpha = nestedList.includes('[loweralpha]');
            
            // Check if [loweralpha] is not already in the nested list
            if (!hasLowerAlpha) {
              // Add continuation marker, then ensure [loweralpha] is on its own line
              nestedLists += (nestedLists ? '\n+\n' : '\n+\n');
              nestedLists += '[loweralpha]\n' + nestedList;
            } else {
              nestedLists += (nestedLists ? '\n+\n' : '\n+\n') + nestedList;
            }
          } else {
            nestedLists += (nestedLists ? '\n+\n' : '\n+\n') + nestedList;
          }
        }
      } else {
        // Other block elements as continuation
        const content = nodeConverter ? nodeConverter(child, depth + 1) : this.extractTextContent(child);
        let cleanedContent = content.trim().replace(/^\s*[a-z]\.\s+/, '');
        
        if (cleanedContent) {
          if (!hasMainText) {
            mainText = cleanedContent;
            hasMainText = true;
          } else {
            // Strip trailing periods for continuation content to prevent double punctuation
            cleanedContent = cleanedContent.replace(/\.\s*$/, '');
            if (cleanedContent.trim()) {
              continuationContent += (continuationContent ? '\n+\n' : '\n+\n') + cleanedContent;
            }
          }
        }
      }
    }
    
    // Process any direct text content, but exclude alphabetic list markers
    const directText = Array.from(item.childNodes)
      .filter(node => node.nodeType === 3)
      .map(node => {
        const text = node.textContent?.trim() || '';
        // Remove alphabetic list markers from text nodes - these will be generated by AsciiDoc
        return text.replace(/^\s*[a-z]\.\s+/, '');
      })
      .filter(text => text)
      .join(' ');
    
    if (directText && !hasMainText) {
      mainText = directText;
    }
    
    
    return {
      mainText,
      continuationContent: continuationContent.trim(),
      nestedLists: nestedLists.trim()
    };
  }
  
  /**
   * Process definition description with clean DOM structure
   * DOM is already cleaned by MadCapPreprocessor
   */
  private processDefinitionDescription(
    element: Element, 
    depth: number, 
    nodeConverter?: (node: Node, depth: number) => string
  ): {
    mainText: string;
    continuationContent: string;
    nestedLists: string;
  } {
    // Use the same clean processing approach as list items
    return this.processCleanListItem(element, depth, 'dl', nodeConverter);
  }
  
  /**
   * Handle overly deep lists by converting to continuation content
   */
  private convertOverlyDeepList(list: Element, depth: number): string {
    const items = Array.from(list.querySelectorAll('li'));
    let result = '\n+\n[NOTE]\n====\nDeep nested content (level ' + depth + '):\n\n';
    
    items.forEach((item, index) => {
      const text = this.extractTextContent(item);
      result += `${index + 1}. ${text}\n`;
    });
    
    result += '====\n';
    return result;
  }
  
  /**
   * Consolidated list conversion method to eliminate duplication
   */
  private convertGenericList(list: Element, marker: string, depth: number, listType: 'ol' | 'ul', listStyle?: string, nodeConverter?: (node: Node, depth: number) => string): string {
    const items = Array.from(list.children).filter(child => 
      child.tagName.toLowerCase() === 'li'
    );
    
    if (items.length === 0) return '';
    
    let result = '';
    
    // Add list style attribute for alphabetical lists
    const hasAlphabeticStyle = listStyle && (
      listStyle.includes('lower-alpha') || 
      listStyle.includes('lower-latin') ||
      listStyle.includes('list-style-type: lower-alpha') ||
      listStyle.includes('list-style-type: lower-latin') ||
      listStyle.match(/list-style-type\s*:\s*lower-alpha/i) ||
      listStyle.match(/list-style-type\s*:\s*lower-latin/i)
    );
    
    if (listType === 'ol' && hasAlphabeticStyle) {
      result += '[loweralpha]\n';
    }
    
    // Process each list item individually and handle nested lists correctly
    items.forEach((item, index) => {
      const itemContent = this.processListItemCorrectly(item, depth, listType, nodeConverter);
      
      if (itemContent.mainText) {
        result += `${marker} ${itemContent.mainText}\n`;
        
        // Add continuation content with proper markers
        if (itemContent.continuationContent) {
          result += '+\n' + itemContent.continuationContent;
          if (!itemContent.continuationContent.endsWith('\n')) {
            result += '\n';
          }
        }
        
        // Add nested lists with proper continuation
        if (itemContent.nestedLists) {
          result += '+\n' + itemContent.nestedLists;
        }
      }
    });
    
    return result;
  }
  
  /**
   * Process a single list item correctly, preserving nested structure
   */
  private processListItemCorrectly(
    item: Element, 
    depth: number, 
    parentListType: 'ol' | 'ul' | 'dl',
    nodeConverter?: (node: Node, depth: number) => string
  ): {
    mainText: string;
    continuationContent: string;
    nestedLists: string;
  } {
    const result = {
      mainText: '',
      continuationContent: '',
      nestedLists: ''
    };
    
    const children = Array.from(item.childNodes);
    const textParts: string[] = [];
    const continuationParts: string[] = [];
    const nestedLists: string[] = [];
    
    let foundNestedList = false;
    
    for (const child of children) {
      if (child.nodeType === 3) { // Node.TEXT_NODE
        const text = (child.textContent || '').trim();
        if (text) {
          if (!foundNestedList) {
            textParts.push(text);
          } else {
            continuationParts.push(text);
          }
        }
      } else if (child.nodeType === 1) { // Node.ELEMENT_NODE
        const element = child as Element;
        const tagName = element.tagName.toLowerCase();
        
        if (tagName === 'ol' || tagName === 'ul') {
          foundNestedList = true;
          // Process nested list with increased depth
          const nestedResult = this.convertListWithDeepNesting(
            element,
            '',  // marker will be determined by the method
            depth + 1,
            parentListType,
            element.getAttribute('style') || undefined,
            nodeConverter
          );
          nestedLists.push(nestedResult);
        } else if (tagName === 'p') {
          // Extract text from paragraph
          const text = nodeConverter ? 
            nodeConverter(element, depth + 1).trim() : 
            this.extractTextContent(element);
          if (text) {
            if (!foundNestedList) {
              textParts.push(text);
            } else {
              continuationParts.push(text);
            }
          }
        } else {
          // Other elements (divs, spans, etc.)
          const text = nodeConverter ? 
            nodeConverter(element, depth + 1).trim() : 
            this.extractTextContent(element);
          if (text) {
            if (!foundNestedList) {
              textParts.push(text);
            } else {
              continuationParts.push(text);
            }
          }
        }
      }
    }
    
    result.mainText = textParts.join(' ').trim();
    result.continuationContent = continuationParts.join('\n').trim();
    result.nestedLists = nestedLists.join('\n').trim();
    
    return result;
  }

  /**
   * Detect if this list follows the MadCap pattern where sublists are siblings
   */
  private detectMadCapSiblingListPattern(list: Element): boolean {
    // Look for the pattern: li -> sibling ol/ul
    const parent = list.parentElement;
    if (!parent) return false;
    
    // Check if there are list items followed by other lists as siblings
    const children = Array.from(parent.children);
    const listIndex = children.indexOf(list);
    
    if (listIndex > 0) {
      const previousSibling = children[listIndex - 1];
      if (previousSibling.tagName.toLowerCase() === 'li') {
        return true; // This list follows a list item as a sibling
      }
    }
    
    return false;
  }

  /**
   * Get base marker for list type
   */
  private getBaseMarkerForType(type: 'ol' | 'ul' | 'dl'): string {
    switch (type) {
      case 'ol': return '.';
      case 'ul': return '*';
      case 'dl': return '';
      default: return '*';
    }
  }
  
  /**
   * Process image within list context
   */

  private processImageInList(img: Element): string {
    const originalSrc = img.getAttribute('src') || '';
    const src = this.normalizeImagePath(originalSrc);
    const alt = img.getAttribute('alt') || '';
    const title = img.getAttribute('title') || '';
    
    // Determine if inline or block based on context
    const className = img.className || '';
    const isInline = className.includes('inline') || className.includes('icon');
    
    // Build attribute string with alt text and title
    const attributes = title ? `${alt},title="${title}"` : alt;
    
    if (isInline) {
      return `image:${src}[${attributes}]`;
    } else {
      return `image::${src}[${attributes}]`;
    }
  }

  /**
   * Normalize image paths to ensure consistent relative structure
   * Converts various MadCap relative paths to the standard ../Images/ format
   */
  private normalizeImagePath(originalPath: string): string {
    // Handle different path patterns from MadCap source
    if (originalPath.includes('/Images/')) {
      // Extract the Images/... part and normalize to ../Images/...
      const imagesIndex = originalPath.indexOf('/Images/');
      const imagesPart = originalPath.substring(imagesIndex + 1); // Remove leading slash
      return `../${imagesPart}`;
    }
    
    // If it already starts with ../Images/, keep it as is
    if (originalPath.startsWith('../Images/')) {
      return originalPath;
    }
    
    // If it starts with ../../Images/, normalize to ../Images/
    if (originalPath.startsWith('../../Images/')) {
      return originalPath.replace('../../Images/', '../Images/');
    }
    
    // If it starts with Images/ (relative from same directory), prefix with ../
    if (originalPath.startsWith('Images/')) {
      return `../${originalPath}`;
    }
    
    // For any other relative path that contains Images, try to normalize
    if (originalPath.includes('Images/')) {
      const parts = originalPath.split('/');
      const imagesIndex = parts.findIndex(part => part === 'Images');
      if (imagesIndex >= 0) {
        const imagePath = parts.slice(imagesIndex).join('/');
        return `../${imagePath}`;
      }
    }
    
    // If we can't normalize it, return the original path
    return originalPath;
  }
  
  /**
   * Extract text content while preserving some formatting
   */
  private containsFormattingElements(element: Element): boolean {
    const formattingTags = ['strong', 'b', 'em', 'i', 'code', 'a'];
    const allElements = element.querySelectorAll('*');
    
    for (const el of allElements) {
      if (formattingTags.includes(el.tagName.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  private extractTextContent(element: Element): string {
    // Simplified approach: extract only plain text, excluding formatting elements
    // This prevents duplication with the main converter while ensuring clean text extraction
    
    // Fallback approach - avoid TreeWalker NodeFilter issues in Node.js
    const clone = element.cloneNode(true) as Element;
    const formattingElements = clone.querySelectorAll('strong, b, em, i, code, a');
    formattingElements.forEach(el => el.remove());
    const text = clone.textContent?.trim() || '';
    
    // Remove alphabetic list markers and normalize whitespace
    const cleanedText = text.replace(/^\s*[a-z]\.\s+/, '');
    return cleanedText.replace(/\s+/g, ' ').trim();
  }
  
  /**
   * Convert individual list item using clean DOM structure
   * Public method for use by main converter (DOM already cleaned by preprocessor)
   */
  convertListItem(
    item: Element, 
    depth: number, 
    parentListType: 'ol' | 'ul' | 'dl',
    nodeConverter?: (node: Node, depth: number) => string
  ): {
    mainText: string;
    continuationContent: string;
    nestedLists: string;
  } {
    return this.processCleanListItem(item, depth, parentListType, nodeConverter);
  }

  /**
   * Validate list structure and provide warnings
   */
  validateListStructure(list: Element): string[] {
    const warnings: string[] = [];
    
    // Check depth
    const maxDepth = this.calculateMaxDepth(list);
    if (maxDepth > 6) {
      warnings.push(`List nesting depth is ${maxDepth}, which may not render correctly in all formats`);
    }
    
    // Check for mixed types at same level
    const mixedTypes = this.checkForMixedListTypes(list);
    if (mixedTypes.length > 0) {
      warnings.push(`Mixed list types detected: ${mixedTypes.join(', ')}`);
    }
    
    // Check for malformed structure
    const orphanedElements = list.querySelectorAll('ol > p, ul > p, ol > div, ul > div');
    if (orphanedElements.length > 0) {
      warnings.push(`Found ${orphanedElements.length} orphaned elements in list structure`);
    }
    
    return warnings;
  }
  
  /**
   * Calculate maximum nesting depth correctly by processing only direct children
   */
  private calculateMaxDepth(element: Element, currentDepth: number = 0): number {
    // Find only direct child lists to avoid double-counting nested structures
    const directChildLists = Array.from(element.children).filter(child => 
      ['ul', 'ol', 'dl'].includes(child.tagName.toLowerCase())
    );
    
    if (directChildLists.length === 0) {
      return currentDepth;
    }
    
    let maxDepth = currentDepth;
    
    // Check each direct child list item for deeper nesting
    const listItems = Array.from(element.children).filter(child => 
      child.tagName.toLowerCase() === 'li' || 
      child.tagName.toLowerCase() === 'dt' || 
      child.tagName.toLowerCase() === 'dd'
    );
    
    listItems.forEach(item => {
      // Find nested lists within this list item
      const nestedLists = Array.from(item.children).filter(child => 
        ['ul', 'ol', 'dl'].includes(child.tagName.toLowerCase())
      );
      
      nestedLists.forEach(nestedList => {
        const depth = this.calculateMaxDepth(nestedList, currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      });
    });
    
    return maxDepth;
  }
  
  /**
   * Check for mixed list types at the same level
   */
  private checkForMixedListTypes(element: Element): string[] {
    const types = new Set<string>();
    const directChildren = Array.from(element.children);
    
    directChildren.forEach(child => {
      const tagName = child.tagName.toLowerCase();
      if (['ul', 'ol', 'dl'].includes(tagName)) {
        types.add(tagName);
      }
    });
    
    return Array.from(types);
  }
}
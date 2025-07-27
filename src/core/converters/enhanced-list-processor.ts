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
   * Supports deep nesting (8+ levels)
   */
  private getUnorderedMarker(depth: number): string {
    const level = Math.min(depth, this.MAX_DEPTH);
    
    // AsciiDoc supports up to 5 levels: *, **, ***, ****, *****
    const maxLevel = Math.min(level + 1, 5);
    return '*'.repeat(maxLevel);
  }
  
  /**
   * Convert ordered list to AsciiDoc
   */
  private convertOrderedList(
    list: Element, 
    marker: string, 
    depth: number, 
    listStyle?: string,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    let result = '';
    const items = Array.from(list.querySelectorAll(':scope > li'));
    
    // Add list style attribute if alphabetical
    const hasAlphabeticStyle = listStyle && (
      listStyle.includes('lower-alpha') || 
      listStyle.includes('lower-latin')
    );
    
    if (hasAlphabeticStyle && depth === 0) {
      result += '[loweralpha]\n';
    }
    
    for (const item of items) {
      result += this.convertListItem(item, marker, depth, nodeConverter);
    }
    
    return result;
  }
  
  /**
   * Convert unordered list to AsciiDoc
   */
  private convertUnorderedList(
    list: Element, 
    marker: string, 
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    let result = '';
    const items = Array.from(list.querySelectorAll(':scope > li'));
    
    for (const item of items) {
      result += this.convertListItem(item, marker, depth, nodeConverter);
    }
    
    return result;
  }
  
  /**
   * Convert definition list to AsciiDoc
   */
  private convertDefinitionList(
    list: Element, 
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    let result = '';
    const children = Array.from(list.children);
    
    for (let i = 0; i < children.length; i += 2) {
      const dt = children[i];
      const dd = children[i + 1];
      
      if (dt && dt.tagName.toLowerCase() === 'dt') {
        const term = dt.textContent?.trim() || '';
        result += `${term}::\n`;
        
        if (dd && dd.tagName.toLowerCase() === 'dd') {
          const definition = this.processNodeContent(dd, depth, nodeConverter);
          result += `  ${definition}\n`;
        }
      }
    }
    
    return result;
  }
  
  /**
   * Convert individual list item to AsciiDoc
   */
  private convertListItem(
    item: Element, 
    marker: string, 
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    let result = '';
    
    // Process the content of the list item
    const content = this.processListItemContent(item, depth, nodeConverter);
    
    // Add the marker and content
    result += `${marker} ${content.trim()}\n`;
    
    // Check for continuation content (nested blocks, images, etc.)
    if (this.hasComplexContent(item)) {
      result += '+\n';
    }
    
    return result;
  }
  
  /**
   * Process list item content including nested elements
   */
  private processListItemContent(
    item: Element, 
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    let content = '';
    
    for (const child of Array.from(item.childNodes)) {
      if (child.nodeType === 3) { // Text node
        content += child.textContent || '';
      } else if (child.nodeType === 1) { // Element node
        const element = child as Element;
        const tagName = element.tagName.toLowerCase();
        
        if (tagName === 'ul' || tagName === 'ol' || tagName === 'dl') {
          // Nested list - process with increased depth
          content += '\n' + this.convertListWithDeepNesting(
            element, 
            '', 
            depth + 1, 
            tagName as 'ol' | 'ul' | 'dl',
            element.getAttribute('style') || undefined,
            nodeConverter
          );
        } else {
          // Other content - delegate to node converter or basic processing
          if (nodeConverter) {
            content += nodeConverter(child, depth);
          } else {
            content += this.processNodeContent(element, depth);
          }
        }
      }
    }
    
    return content;
  }
  
  /**
   * Basic node content processing (fallback when no nodeConverter provided)
   */
  private processNodeContent(
    element: Element, 
    _depth: number,
    nodeConverter?: (node: Node, depth: number) => string
  ): string {
    if (nodeConverter) {
      return nodeConverter(element, _depth);
    }
    
    // Basic processing for common elements
    const tagName = element.tagName.toLowerCase();
    
    switch (tagName) {
      case 'p':
        return element.textContent?.trim() || '';
      case 'strong':
      case 'b':
        return `*${element.textContent?.trim()}*`;
      case 'em':
      case 'i':
        return `_${element.textContent?.trim()}_`;
      case 'code':
        return `\`${element.textContent?.trim()}\``;
      default:
        return element.textContent?.trim() || '';
    }
  }
  
  /**
   * Check if list item has complex content requiring continuation
   */
  private hasComplexContent(item: Element): boolean {
    // Check for nested lists, code blocks, images, etc.
    return !!(
      item.querySelector('ul, ol, dl, pre, img, div.note, div.tip, div.warning') ||
      item.children.length > 1 ||
      (item.children.length === 1 && item.children[0].tagName.toLowerCase() !== 'p')
    );
  }
  
  /**
   * Convert overly deep lists as continuation content
   */
  private convertOverlyDeepList(list: Element, depth: number): string {
    const items = Array.from(list.querySelectorAll(':scope > li'));
    let result = '+\n--\n';
    
    for (const item of items) {
      const content = item.textContent?.trim() || '';
      result += `• ${content}\n`;
    }
    
    result += '--\n';
    return result;
  }
  
  /**
   * Main entry point compatible with existing list processors
   */
  convertList(
    list: Element,
    depth: number = 0,
    parentType?: string,
    listStyle?: string,
    format?: string
  ): string {
    // Map old API to new enhanced method
    const mappedParentType = parentType as 'ol' | 'ul' | 'dl' | undefined;
    return this.convertListWithDeepNesting(list, '', depth, mappedParentType, listStyle);
  }
}
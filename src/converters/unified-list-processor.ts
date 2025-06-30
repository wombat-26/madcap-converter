/**
 * Unified List Processor Interface
 * 
 * This interface consolidates all list processing functionality to eliminate
 * the multiple overlapping implementations that cause regression risks.
 * 
 * Design Goals:
 * - Single responsibility for list processing
 * - Format-agnostic core logic with format-specific output
 * - Clear separation between DOM structure analysis and output generation
 * - Comprehensive support for all MadCap patterns
 */

export interface ListContext {
  depth: number;
  sectionLevel: number;
  lastWasSection: boolean;
  format: 'asciidoc' | 'markdown' | 'html';
  parentListType?: 'ol' | 'ul' | 'dl';
  withinListItem?: boolean;
}

export interface ListProcessingOptions {
  // Format-specific options
  useAlphabeticalMarkers?: boolean; // AsciiDoc [loweralpha] support
  useContinuationMarkers?: boolean; // AsciiDoc + for multi-paragraph items
  indentSize?: number; // Markdown indentation (default: 4)
  preserveHtmlStructure?: boolean; // Zendesk HTML passthrough
  
  // Content handling options
  handleOrphanedContent?: boolean; // Convert orphaned paragraphs to list items
  processMixedContent?: boolean; // Handle mixed text/image/other content
  detectMadcapSiblings?: boolean; // Handle MadCap sibling list patterns
  
  // Image and media handling
  treatImagesAsBlock?: boolean; // Force images to block format
  inlineImageThreshold?: number; // Size threshold for inline vs block (default: 32px)
  
  // Advanced features
  maxNestingDepth?: number; // Maximum supported nesting depth
  enableSmartSpacing?: boolean; // Intelligent spacing between elements
  preserveCustomAttributes?: boolean; // Keep custom CSS classes/attributes
}

export interface ListProcessingResult {
  content: string;
  metadata: {
    listCount: number;
    maxDepth: number;
    hasAlphabetical: boolean;
    hasMixedContent: boolean;
    warnings: string[];
  };
}

/**
 * Core list processor interface that all implementations must follow
 */
export interface IListProcessor {
  /**
   * Process a list element and return formatted output
   */
  processListElement(
    element: Element,
    context: ListContext,
    options: ListProcessingOptions,
    nodeProcessor: (node: Node, depth: number) => string
  ): ListProcessingResult;
  
  /**
   * Process individual list item with proper context
   */
  processListItem(
    element: Element,
    context: ListContext,
    options: ListProcessingOptions,
    nodeProcessor: (node: Node, depth: number) => string
  ): string;
  
  /**
   * Detect and handle MadCap sibling list patterns
   */
  detectSiblingLists(
    element: Element,
    context: ListContext
  ): Element[];
  
  /**
   * Get format-specific list markers
   */
  getListMarker(
    listType: 'ol' | 'ul' | 'dl',
    depth: number,
    index: number,
    context: ListContext,
    options: ListProcessingOptions
  ): string;
  
  /**
   * Handle continuation content between list items
   */
  processContinuationContent(
    content: string,
    context: ListContext,
    options: ListProcessingOptions
  ): string;
}

/**
 * List element analysis utilities
 */
export class ListAnalyzer {
  /**
   * Analyze list structure and detect patterns
   */
  static analyzeListStructure(element: Element): {
    type: 'ol' | 'ul' | 'dl';
    depth: number;
    hasNestedLists: boolean;
    hasOrphanedContent: boolean;
    hasMixedContent: boolean;
    isAlphabetical: boolean;
    isMadcapSibling: boolean;
    itemCount: number;
  } {
    const tagName = element.tagName.toLowerCase() as 'ol' | 'ul' | 'dl';
    const items = Array.from(element.children);
    const listItems = items.filter(item => 
      ['li', 'dt', 'dd'].includes(item.tagName.toLowerCase())
    );
    
    // Check for alphabetical markers
    const isAlphabetical = element.classList.contains('loweralpha') ||
                          element.classList.contains('upperalpha') ||
                          (element.getAttribute('type')?.includes('alpha') ?? false);
    
    // Check for MadCap sibling pattern
    const isMadcapSibling = element.classList.contains('sub-list') ||
                           element.previousElementSibling?.tagName.toLowerCase() === tagName;
    
    // Check for nested lists
    const hasNestedLists = listItems.some(item => 
      item.querySelector('ol, ul, dl')
    );
    
    // Check for orphaned content (non-li elements in list)
    const hasOrphanedContent = items.length > listItems.length;
    
    // Check for mixed content (images, complex formatting)
    const hasMixedContent = listItems.some(item => 
      item.querySelector('img, table, div, blockquote')
    );
    
    // Calculate depth by counting ancestor lists
    let depth = 0;
    let parent = element.parentElement;
    while (parent) {
      if (['ol', 'ul', 'dl'].includes(parent.tagName.toLowerCase())) {
        depth++;
      }
      parent = parent.parentElement;
    }
    
    return {
      type: tagName,
      depth,
      hasNestedLists,
      hasOrphanedContent,
      hasMixedContent,
      isAlphabetical,
      isMadcapSibling,
      itemCount: listItems.length
    };
  }
  
  /**
   * Determine if content should be treated as inline or block
   */
  static isInlineContent(element: Element): boolean {
    // Check for inline indicators
    if (element.classList.contains('IconInline')) return true;
    
    // Check image dimensions
    if (element.tagName.toLowerCase() === 'img') {
      const width = element.getAttribute('width');
      const height = element.getAttribute('height');
      if (width && parseInt(width) <= 32) return true;
      if (height && parseInt(height) <= 32) return true;
    }
    
    // Check content length
    const textContent = element.textContent?.trim() || '';
    if (textContent.length < 50 && !textContent.includes('\n')) return true;
    
    return false;
  }
  
  /**
   * Extract continuation content from list items
   */
  static extractContinuationContent(listItem: Element): {
    primaryContent: Node[];
    continuationContent: Node[];
  } {
    const nodes = Array.from(listItem.childNodes);
    const primaryContent: Node[] = [];
    const continuationContent: Node[] = [];
    
    let foundBreak = false;
    for (const node of nodes) {
      if (node.nodeType === 1) { // Element node
        const element = node as Element;
        if (['p', 'div', 'blockquote', 'pre', 'ul', 'ol'].includes(element.tagName.toLowerCase())) {
          foundBreak = true;
        }
      }
      
      if (foundBreak) {
        continuationContent.push(node);
      } else {
        primaryContent.push(node);
      }
    }
    
    return { primaryContent, continuationContent };
  }
}

/**
 * Format-specific output generators
 */
export class ListOutputGenerators {
  /**
   * Generate AsciiDoc list output
   */
  static generateAsciiDocList(
    items: string[],
    listType: 'ol' | 'ul' | 'dl',
    depth: number,
    options: ListProcessingOptions
  ): string {
    const markers = {
      ol: '.'.repeat(depth + 1),
      ul: '*'.repeat(depth + 1),
      dl: depth === 0 ? '' : '::'.repeat(depth)
    };
    
    const marker = markers[listType];
    const formatted = items.map(item => {
      if (listType === 'dl') {
        // Definition lists have special formatting
        return item; // Handled by specific DL processor
      }
      return `${marker} ${item}`;
    });
    
    let result = formatted.join('\n');
    
    // Add alphabetical marker if needed
    if (options.useAlphabeticalMarkers && listType === 'ol') {
      result = '[loweralpha]\n' + result;
    }
    
    return result;
  }
  
  /**
   * Generate Markdown list output
   */
  static generateMarkdownList(
    items: string[],
    listType: 'ol' | 'ul' | 'dl',
    depth: number,
    options: ListProcessingOptions
  ): string {
    const indent = ' '.repeat(depth * (options.indentSize || 4));
    const markers = {
      ol: (index: number) => `${index + 1}.`,
      ul: (index: number) => '-',
      dl: (index: number) => ':' // Definition lists use : syntax
    };
    
    const getMarker = markers[listType];
    const formatted = items.map((item, index) => {
      const marker = getMarker(index);
      return `${indent}${marker} ${item}`;
    });
    
    return formatted.join('\n');
  }
  
  /**
   * Generate HTML list output (for Zendesk)
   */
  static generateHtmlList(
    items: string[],
    listType: 'ol' | 'ul' | 'dl',
    attributes: Record<string, string> = {}
  ): string {
    const tag = listType;
    const itemTag = listType === 'dl' ? 'dd' : 'li';
    
    const attrString = Object.entries(attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');
    
    const openTag = attrString ? `<${tag} ${attrString}>` : `<${tag}>`;
    const itemsHtml = items.map(item => `  <${itemTag}>${item}</${itemTag}>`).join('\n');
    
    return `${openTag}\n${itemsHtml}\n</${tag}>`;
  }
}

/**
 * Default context factory
 */
export class ListContextFactory {
  static createContext(
    depth: number,
    format: 'asciidoc' | 'markdown' | 'html',
    sectionLevel: number = 0,
    lastWasSection: boolean = false
  ): ListContext {
    return {
      depth,
      sectionLevel,
      lastWasSection,
      format,
      parentListType: undefined,
      withinListItem: false
    };
  }
  
  static createDefaultOptions(format: 'asciidoc' | 'markdown' | 'html'): ListProcessingOptions {
    const baseOptions: ListProcessingOptions = {
      handleOrphanedContent: true,
      processMixedContent: true,
      detectMadcapSiblings: true,
      inlineImageThreshold: 32,
      maxNestingDepth: 10,
      enableSmartSpacing: true,
      preserveCustomAttributes: false
    };
    
    switch (format) {
      case 'asciidoc':
        return {
          ...baseOptions,
          useAlphabeticalMarkers: true,
          useContinuationMarkers: true,
          treatImagesAsBlock: true
        };
      
      case 'markdown':
        return {
          ...baseOptions,
          indentSize: 4,
          useAlphabeticalMarkers: false,
          useContinuationMarkers: false
        };
      
      case 'html':
        return {
          ...baseOptions,
          preserveHtmlStructure: true,
          preserveCustomAttributes: true
        };
      
      default:
        return baseOptions;
    }
  }
}
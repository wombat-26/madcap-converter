/**
 * Consolidated List Processor Implementation
 * 
 * This implementation merges the best features from:
 * - ImprovedListProcessor (continuation markers, orphaned content handling)
 * - EnhancedListProcessor (deep nesting, alphabetical lists, MadCap patterns)
 * - ReliableListProcessor (structure preservation)
 * 
 * Goals:
 * - Eliminate regression risks from multiple processing paths
 * - Provide format-agnostic core logic
 * - Handle all MadCap edge cases
 * - Maintain backward compatibility
 */

import {
  IListProcessor,
  ListContext,
  ListProcessingOptions,
  ListProcessingResult,
  ListAnalyzer,
  ListOutputGenerators,
  ListContextFactory
} from './unified-list-processor.js';

// Re-export ListContextFactory for external use
export { ListContextFactory } from './unified-list-processor.js';

export class ConsolidatedListProcessor implements IListProcessor {
  private warnings: string[] = [];
  
  /**
   * Main entry point for processing list elements
   */
  processListElement(
    element: Element,
    context: ListContext,
    options: ListProcessingOptions,
    nodeProcessor: (node: Node, depth: number) => string
  ): ListProcessingResult {
    this.warnings = [];
    
    const analysis = ListAnalyzer.analyzeListStructure(element);
    
    // Handle MadCap sibling lists if detected
    if (analysis.isMadcapSibling && options.detectMadcapSiblings) {
      return this.processMadcapSiblingLists(element, context, options, nodeProcessor);
    }
    
    // Process regular list
    const content = this.processRegularList(element, analysis, context, options, nodeProcessor);
    
    return {
      content,
      metadata: {
        listCount: 1,
        maxDepth: analysis.depth,
        hasAlphabetical: analysis.isAlphabetical,
        hasMixedContent: analysis.hasMixedContent,
        warnings: [...this.warnings]
      }
    };
  }
  
  /**
   * Process a regular list (non-sibling pattern)
   */
  private processRegularList(
    element: Element,
    analysis: ReturnType<typeof ListAnalyzer.analyzeListStructure>,
    context: ListContext,
    options: ListProcessingOptions,
    nodeProcessor: (node: Node, depth: number) => string
  ): string {
    const items: string[] = [];
    const children = Array.from(element.children);
    
    // Filter list items vs orphaned content
    const listItems = children.filter(child => 
      ['li', 'dt', 'dd'].includes(child.tagName.toLowerCase())
    );
    
    const orphanedContent = children.filter(child => 
      !['li', 'dt', 'dd'].includes(child.tagName.toLowerCase())
    );
    
    // Handle orphaned content if enabled
    if (orphanedContent.length > 0 && options.handleOrphanedContent) {
      this.warnings.push(`Found ${orphanedContent.length} orphaned elements in list, converting to list items`);
      for (const orphan of orphanedContent) {
        const content = nodeProcessor(orphan, context.depth + 1);
        if (content.trim()) {
          items.push(content.trim());
        }
      }
    }
    
    // Process list items
    for (let i = 0; i < listItems.length; i++) {
      const listItem = listItems[i];
      const itemContext: ListContext = {
        ...context,
        depth: context.depth + 1,
        parentListType: analysis.type,
        withinListItem: true
      };
      
      const itemContent = this.processListItem(listItem, itemContext, options, nodeProcessor);
      if (itemContent.trim()) {
        items.push(itemContent.trim());
      }
    }
    
    // Generate format-specific output
    return this.generateListOutput(items, analysis, context, options);
  }
  
  /**
   * Process individual list item
   */
  processListItem(
    element: Element,
    context: ListContext,
    options: ListProcessingOptions,
    nodeProcessor: (node: Node, depth: number) => string
  ): string {
    const tagName = element.tagName.toLowerCase();
    
    // Handle definition list items specially
    if (tagName === 'dt') {
      return this.processDefinitionTerm(element, context, options, nodeProcessor);
    } else if (tagName === 'dd') {
      return this.processDefinitionDescription(element, context, options, nodeProcessor);
    }
    
    // Extract primary content and continuation content
    const { primaryContent, continuationContent } = ListAnalyzer.extractContinuationContent(element);
    
    // Process primary content
    let result = '';
    if (primaryContent.length > 0) {
      const primaryText = primaryContent
        .map(node => nodeProcessor(node, context.depth))
        .join('')
        .trim();
      result = primaryText;
    }
    
    // Process continuation content
    if (continuationContent.length > 0 && options.useContinuationMarkers) {
      const continuationText = continuationContent
        .map(node => nodeProcessor(node, context.depth))
        .filter(text => text.trim())
        .join('\n\n')
        .trim();
      
      if (continuationText) {
        result += this.processContinuationContent(continuationText, context, options);
      }
    } else if (continuationContent.length > 0) {
      // For formats that don't use continuation markers, add with proper spacing
      const continuationText = continuationContent
        .map(node => nodeProcessor(node, context.depth))
        .filter(text => text.trim())
        .join('\n')
        .trim();
      
      if (continuationText) {
        if (context.format === 'markdown') {
          // Markdown uses indentation for continuation
          const indent = ' '.repeat((context.depth - 1) * (options.indentSize || 4));
          const indentedContent = continuationText
            .split('\n')
            .map(line => line.trim() ? `${indent}${line}` : line)
            .join('\n');
          result += '\n' + indentedContent;
        } else {
          result += '\n' + continuationText;
        }
      }
    }
    
    return result;
  }
  
  /**
   * Process definition term (dt element)
   */
  private processDefinitionTerm(
    element: Element,
    context: ListContext,
    options: ListProcessingOptions,
    nodeProcessor: (node: Node, depth: number) => string
  ): string {
    const content = Array.from(element.childNodes)
      .map(node => nodeProcessor(node, context.depth))
      .join('')
      .trim();
    
    if (context.format === 'asciidoc') {
      return `${content}::`;
    } else if (context.format === 'markdown') {
      return `**${content}**`;
    } else {
      return content;
    }
  }
  
  /**
   * Process definition description (dd element)
   */
  private processDefinitionDescription(
    element: Element,
    context: ListContext,
    options: ListProcessingOptions,
    nodeProcessor: (node: Node, depth: number) => string
  ): string {
    const content = Array.from(element.childNodes)
      .map(node => nodeProcessor(node, context.depth))
      .join('')
      .trim();
    
    if (context.format === 'asciidoc') {
      return content;
    } else if (context.format === 'markdown') {
      return `: ${content}`;
    } else {
      return content;
    }
  }
  
  /**
   * Handle MadCap sibling list patterns
   */
  private processMadcapSiblingLists(
    element: Element,
    context: ListContext,
    options: ListProcessingOptions,
    nodeProcessor: (node: Node, depth: number) => string
  ): ListProcessingResult {
    const siblingLists = this.detectSiblingLists(element, context);
    let combinedContent = '';
    let maxDepth = 0;
    let totalLists = 0;
    
    for (const siblingList of siblingLists) {
      const analysis = ListAnalyzer.analyzeListStructure(siblingList);
      const siblingContext: ListContext = {
        ...context,
        depth: context.depth + 1 // Treat siblings as nested
      };
      
      const listContent = this.processRegularList(
        siblingList,
        analysis,
        siblingContext,
        options,
        nodeProcessor
      );
      
      if (combinedContent) {
        combinedContent += '\n' + listContent;
      } else {
        combinedContent = listContent;
      }
      
      maxDepth = Math.max(maxDepth, analysis.depth + 1);
      totalLists++;
    }
    
    return {
      content: combinedContent,
      metadata: {
        listCount: totalLists,
        maxDepth,
        hasAlphabetical: false,
        hasMixedContent: true,
        warnings: [...this.warnings, 'Processed MadCap sibling list pattern']
      }
    };
  }
  
  /**
   * Detect sibling lists (MadCap pattern)
   */
  detectSiblingLists(element: Element, context: ListContext): Element[] {
    const siblings: Element[] = [element];
    
    // Look for subsequent sibling lists of the same type
    let nextSibling = element.nextElementSibling;
    while (nextSibling) {
      if (nextSibling.tagName.toLowerCase() === element.tagName.toLowerCase()) {
        if (nextSibling.classList.contains('sub-list') ||
            nextSibling.getAttribute('data-depth')) {
          siblings.push(nextSibling);
          nextSibling = nextSibling.nextElementSibling;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    
    return siblings;
  }
  
  /**
   * Get appropriate list marker for the context
   */
  getListMarker(
    listType: 'ol' | 'ul' | 'dl',
    depth: number,
    index: number,
    context: ListContext,
    options: ListProcessingOptions
  ): string {
    if (context.format === 'asciidoc') {
      return this.getAsciiDocMarker(listType, depth, options);
    } else if (context.format === 'markdown') {
      return this.getMarkdownMarker(listType, index, depth, options);
    } else {
      return ''; // HTML doesn't use text markers
    }
  }
  
  /**
   * Get AsciiDoc list marker
   */
  private getAsciiDocMarker(
    listType: 'ol' | 'ul' | 'dl',
    depth: number,
    options: ListProcessingOptions
  ): string {
    switch (listType) {
      case 'ol':
        return '.'.repeat(depth + 1);
      case 'ul':
        return '*'.repeat(depth + 1);
      case 'dl':
        return ''; // Definition lists don't use markers
      default:
        return '.';
    }
  }
  
  /**
   * Get Markdown list marker
   */
  private getMarkdownMarker(
    listType: 'ol' | 'ul' | 'dl',
    index: number,
    depth: number,
    options: ListProcessingOptions
  ): string {
    const indent = ' '.repeat(depth * (options.indentSize || 4));
    
    switch (listType) {
      case 'ol':
        return `${indent}${index + 1}.`;
      case 'ul':
        return `${indent}-`;
      case 'dl':
        return `${indent}:`; // Definition list syntax
      default:
        return `${indent}-`;
    }
  }
  
  /**
   * Process continuation content with appropriate markers
   */
  processContinuationContent(
    content: string,
    context: ListContext,
    options: ListProcessingOptions
  ): string {
    if (context.format === 'asciidoc' && options.useContinuationMarkers) {
      // AsciiDoc uses + for continuation
      return '\n+\n' + content;
    } else if (context.format === 'markdown') {
      // Markdown uses indentation
      const indent = ' '.repeat(context.depth * (options.indentSize || 4));
      const indentedContent = content
        .split('\n')
        .map(line => line.trim() ? `${indent}${line}` : line)
        .join('\n');
      return '\n' + indentedContent;
    } else {
      // HTML preserves structure
      return '\n' + content;
    }
  }
  
  /**
   * Generate final list output in the appropriate format
   */
  private generateListOutput(
    items: string[],
    analysis: ReturnType<typeof ListAnalyzer.analyzeListStructure>,
    context: ListContext,
    options: ListProcessingOptions
  ): string {
    if (context.format === 'asciidoc') {
      return this.generateAsciiDocOutput(items, analysis, context, options);
    } else if (context.format === 'markdown') {
      return this.generateMarkdownOutput(items, analysis, context, options);
    } else {
      return this.generateHtmlOutput(items, analysis, context, options);
    }
  }
  
  /**
   * Generate AsciiDoc-specific output
   */
  private generateAsciiDocOutput(
    items: string[],
    analysis: ReturnType<typeof ListAnalyzer.analyzeListStructure>,
    context: ListContext,
    options: ListProcessingOptions
  ): string {
    const marker = this.getAsciiDocMarker(analysis.type, context.depth, options);
    let result = '';
    
    // Add alphabetical marker if needed
    if (analysis.isAlphabetical && options.useAlphabeticalMarkers && analysis.type === 'ol') {
      result += '[loweralpha]\n';
    }
    
    // Add items with markers
    const formattedItems = items.map(item => {
      if (analysis.type === 'dl') {
        return item; // Definition lists handle their own formatting
      }
      return `${marker} ${item}`;
    });
    
    result += formattedItems.join('\n');
    
    // Add proper spacing after list
    if (context.depth === 0) {
      result += '\n\n';
    }
    
    return result;
  }
  
  /**
   * Generate Markdown-specific output
   */
  private generateMarkdownOutput(
    items: string[],
    analysis: ReturnType<typeof ListAnalyzer.analyzeListStructure>,
    context: ListContext,
    options: ListProcessingOptions
  ): string {
    const formattedItems = items.map((item, index) => {
      const marker = this.getMarkdownMarker(analysis.type, index, context.depth, options);
      return `${marker} ${item}`;
    });
    
    return formattedItems.join('\n');
  }
  
  /**
   * Generate HTML-specific output
   */
  private generateHtmlOutput(
    items: string[],
    analysis: ReturnType<typeof ListAnalyzer.analyzeListStructure>,
    context: ListContext,
    options: ListProcessingOptions
  ): string {
    const tag = analysis.type;
    const itemTag = analysis.type === 'dl' ? 'dd' : 'li';
    
    const itemsHtml = items.map(item => `  <${itemTag}>${item}</${itemTag}>`).join('\n');
    
    return `<${tag}>\n${itemsHtml}\n</${tag}>`;
  }
}

/**
 * Factory function to create the consolidated processor with format-specific defaults
 */
export function createListProcessor(format: 'asciidoc' | 'markdown' | 'html'): ConsolidatedListProcessor {
  return new ConsolidatedListProcessor();
}

/**
 * Backward compatibility wrapper for existing code
 */
export class ListProcessor extends ConsolidatedListProcessor {
  /**
   * Legacy method signature support
   */
  convertList(
    element: Element,
    depth: number,
    nodeProcessor: (node: Node, depth: number) => string,
    format: 'asciidoc' | 'markdown' | 'html' = 'asciidoc'
  ): string {
    const context = ListContextFactory.createContext(depth, format);
    const options = ListContextFactory.createDefaultOptions(format);
    
    const result = this.processListElement(element, context, options, nodeProcessor);
    return result.content;
  }
}
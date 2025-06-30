import { JSDOM } from 'jsdom';

export interface PerformanceMetrics {
  contentSize: number;
  elementCount: number;
  processingTime: number;
  memoryUsage: number;
}

export interface OptimizationResult {
  optimizedContent: string;
  metrics: PerformanceMetrics;
  warnings: string[];
}

/**
 * Performance optimizer for large document conversions
 * Handles 100KB+ files efficiently with streaming and chunking
 */
export class PerformanceOptimizer {
  private readonly CHUNK_SIZE = 10000; // Characters per chunk
  private readonly MAX_ELEMENTS_PER_BATCH = 1000;
  private readonly MEMORY_THRESHOLD_MB = 100;

  /**
   * Optimize large document processing
   */
  async optimizeDocumentProcessing(
    html: string,
    processingFunction: (chunk: string) => Promise<string>
  ): Promise<OptimizationResult> {
    const startTime = Date.now();
    const initialMemory = this.getMemoryUsage();
    const warnings: string[] = [];

    // Check if optimization is needed
    if (html.length < 50000) {
      // Small document - process normally
      const result = await processingFunction(html);
      return {
        optimizedContent: result,
        metrics: {
          contentSize: html.length,
          elementCount: this.countElements(html),
          processingTime: Date.now() - startTime,
          memoryUsage: this.getMemoryUsage() - initialMemory
        },
        warnings
      };
    }

    warnings.push(`Large document detected (${Math.round(html.length / 1024)}KB), using performance optimization`);

    // Split into manageable chunks
    const chunks = this.splitIntoChunks(html);
    let optimizedContent = '';

    // Process chunks with memory monitoring
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Monitor memory usage
      const currentMemory = this.getMemoryUsage();
      if (currentMemory > this.MEMORY_THRESHOLD_MB) {
        warnings.push(`High memory usage detected (${currentMemory}MB), forcing garbage collection`);
        this.forceGarbageCollection();
      }

      // Process chunk
      const processedChunk = await processingFunction(chunk);
      optimizedContent += processedChunk;

      // Progress logging for very large documents
      if (chunks.length > 10 && i % 5 === 0) {
        console.log(`Processed ${i + 1}/${chunks.length} chunks (${Math.round((i + 1) / chunks.length * 100)}%)`);
      }
    }

    return {
      optimizedContent,
      metrics: {
        contentSize: html.length,
        elementCount: this.countElements(html),
        processingTime: Date.now() - startTime,
        memoryUsage: this.getMemoryUsage() - initialMemory
      },
      warnings
    };
  }

  /**
   * Split HTML into logical chunks while preserving element boundaries
   */
  private splitIntoChunks(html: string): string[] {
    const chunks: string[] = [];
    
    // Try to parse as DOM first to split at element boundaries
    try {
      const dom = new JSDOM(html, { contentType: 'text/html' });
      const document = dom.window.document;
      const body = document.body;
      
      if (!body) {
        // Fallback to simple text chunking
        return this.splitTextIntoChunks(html);
      }

      const elements = Array.from(body.children);
      let currentChunk = '';
      let currentSize = 0;

      for (const element of elements) {
        const elementHtml = element.outerHTML;
        const elementSize = elementHtml.length;

        // If single element is too large, split it further
        if (elementSize > this.CHUNK_SIZE) {
          if (currentChunk) {
            chunks.push(currentChunk);
            currentChunk = '';
            currentSize = 0;
          }
          
          // Split large element by inner content
          const subChunks = this.splitLargeElement(element);
          chunks.push(...subChunks);
          continue;
        }

        // Add to current chunk if it fits
        if (currentSize + elementSize <= this.CHUNK_SIZE) {
          currentChunk += elementHtml;
          currentSize += elementSize;
        } else {
          // Start new chunk
          if (currentChunk) {
            chunks.push(currentChunk);
          }
          currentChunk = elementHtml;
          currentSize = elementSize;
        }
      }

      // Add final chunk
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      return chunks;

    } catch (error) {
      console.warn('Failed to parse DOM for chunking, falling back to text splitting:', error);
      return this.splitTextIntoChunks(html);
    }
  }

  /**
   * Split large single element into manageable pieces
   */
  private splitLargeElement(element: Element): string[] {
    const chunks: string[] = [];
    const tagName = element.tagName.toLowerCase();
    
    // Handle tables specially - split by rows
    if (tagName === 'table') {
      const rows = Array.from(element.querySelectorAll('tr'));
      let currentChunk = `<${tagName}`;
      
      // Copy attributes
      for (const attr of element.attributes) {
        currentChunk += ` ${attr.name}="${attr.value}"`;
      }
      currentChunk += '>';
      
      let currentSize = currentChunk.length;
      let rowsInChunk = 0;

      for (const row of rows) {
        const rowHtml = row.outerHTML;
        
        if (currentSize + rowHtml.length > this.CHUNK_SIZE && rowsInChunk > 0) {
          // Close current table chunk
          currentChunk += `</${tagName}>`;
          chunks.push(currentChunk);
          
          // Start new table chunk
          currentChunk = `<${tagName}`;
          for (const attr of element.attributes) {
            currentChunk += ` ${attr.name}="${attr.value}"`;
          }
          currentChunk += '>';
          currentSize = currentChunk.length;
          rowsInChunk = 0;
        }
        
        currentChunk += rowHtml;
        currentSize += rowHtml.length;
        rowsInChunk++;
      }
      
      // Close final chunk
      currentChunk += `</${tagName}>`;
      chunks.push(currentChunk);
      
      return chunks;
    }

    // Handle lists - split by items
    if (tagName === 'ul' || tagName === 'ol') {
      const items = Array.from(element.querySelectorAll('li'));
      let currentChunk = `<${tagName}`;
      
      // Copy attributes
      for (const attr of element.attributes) {
        currentChunk += ` ${attr.name}="${attr.value}"`;
      }
      currentChunk += '>';
      
      let currentSize = currentChunk.length;
      let itemsInChunk = 0;

      for (const item of items) {
        const itemHtml = item.outerHTML;
        
        if (currentSize + itemHtml.length > this.CHUNK_SIZE && itemsInChunk > 0) {
          // Close current list chunk
          currentChunk += `</${tagName}>`;
          chunks.push(currentChunk);
          
          // Start new list chunk
          currentChunk = `<${tagName}`;
          for (const attr of element.attributes) {
            currentChunk += ` ${attr.name}="${attr.value}"`;
          }
          currentChunk += '>';
          currentSize = currentChunk.length;
          itemsInChunk = 0;
        }
        
        currentChunk += itemHtml;
        currentSize += itemHtml.length;
        itemsInChunk++;
      }
      
      // Close final chunk
      currentChunk += `</${tagName}>`;
      chunks.push(currentChunk);
      
      return chunks;
    }

    // For other large elements, fallback to text splitting
    return this.splitTextIntoChunks(element.outerHTML);
  }

  /**
   * Simple text-based chunking fallback
   */
  private splitTextIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    
    for (let i = 0; i < text.length; i += this.CHUNK_SIZE) {
      chunks.push(text.slice(i, i + this.CHUNK_SIZE));
    }
    
    return chunks;
  }

  /**
   * Count elements in HTML for metrics
   */
  private countElements(html: string): number {
    const tagMatches = html.match(/<[^>]+>/g);
    return tagMatches ? tagMatches.length : 0;
  }

  /**
   * Get current memory usage in MB
   */
  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
  }

  /**
   * Force garbage collection if available
   */
  private forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
    } else {
      console.warn('Garbage collection not available. Run with --expose-gc flag for better memory management.');
    }
  }

  /**
   * Optimize DOM processing for large documents
   */
  optimizeDOMProcessing(document: Document): void {
    // Remove unnecessary whitespace text nodes
    this.removeExcessiveWhitespace(document);
    
    // Batch process similar elements
    this.batchProcessElements(document);
  }

  /**
   * Remove excessive whitespace text nodes to reduce memory usage
   */
  private removeExcessiveWhitespace(document: Document): void {
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      4, // NodeFilter.SHOW_TEXT
      {
        acceptNode: (node) => {
          if (node.nodeType === 3) { // TEXT_NODE
            const text = node.textContent || '';
            // Remove text nodes that are only whitespace and longer than necessary
            if (text.match(/^\s+$/) && text.length > 2) {
              return 1; // NodeFilter.FILTER_ACCEPT
            }
          }
          return 2; // NodeFilter.FILTER_REJECT
        }
      }
    );

    const nodesToRemove: Node[] = [];
    let node;
    while (node = walker.nextNode()) {
      nodesToRemove.push(node);
    }

    // Remove nodes in separate pass to avoid walker invalidation
    nodesToRemove.forEach(node => {
      node.parentNode?.removeChild(node);
    });
  }

  /**
   * Process similar elements in batches for efficiency
   */
  private batchProcessElements(document: Document): void {
    // Group elements by tag name for batch processing
    const elementGroups = new Map<string, Element[]>();
    
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
      const tagName = element.tagName.toLowerCase();
      if (!elementGroups.has(tagName)) {
        elementGroups.set(tagName, []);
      }
      elementGroups.get(tagName)!.push(element);
    }

    // Process large groups in batches
    for (const [tagName, elements] of elementGroups) {
      if (elements.length > this.MAX_ELEMENTS_PER_BATCH) {
        console.log(`Processing ${elements.length} ${tagName} elements in batches`);
        
        for (let i = 0; i < elements.length; i += this.MAX_ELEMENTS_PER_BATCH) {
          const batch = elements.slice(i, i + this.MAX_ELEMENTS_PER_BATCH);
          this.processBatch(batch);
          
          // Yield control occasionally for very large batches
          if (i % (this.MAX_ELEMENTS_PER_BATCH * 5) === 0) {
            setTimeout(() => {}, 0);
          }
        }
      }
    }
  }

  /**
   * Process a batch of similar elements
   */
  private processBatch(elements: Element[]): void {
    // This could be extended with specific optimizations per element type
    // For now, just ensure they're processed efficiently
    elements.forEach(element => {
      // Basic cleanup operations
      this.cleanupElement(element);
    });
  }

  /**
   * Cleanup individual element
   */
  private cleanupElement(element: Element): void {
    // Remove empty style attributes
    if (element.hasAttribute('style') && !element.getAttribute('style')?.trim()) {
      element.removeAttribute('style');
    }
    
    // Remove empty class attributes
    if (element.hasAttribute('class') && !element.getAttribute('class')?.trim()) {
      element.removeAttribute('class');
    }
  }
}
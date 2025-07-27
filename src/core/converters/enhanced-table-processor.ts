/**
 * Enhanced Table Processor - Advanced AsciiDoc table conversion
 * 
 * Provides sophisticated table conversion capabilities with proper formatting,
 * column sizing, cell formatting, and advanced table features.
 */

export interface TableCell {
  content: string;
  isHeader: boolean;
  colspan?: number;
  rowspan?: number;
  alignment?: 'left' | 'center' | 'right';
  format?: 'normal' | 'emphasis' | 'strong' | 'monospace';
}

export interface TableRow {
  cells: TableCell[];
  isHeader: boolean;
}

export interface TableOptions {
  /** Enable automatic column width calculation */
  autoColumnWidths: boolean;
  /** Preserve cell formatting (bold, italic, code) */
  preserveFormatting: boolean;
  /** Table frame style */
  frame: 'all' | 'topbot' | 'sides' | 'none';
  /** Grid style */
  grid: 'all' | 'rows' | 'cols' | 'none';
  /** Table width as percentage */
  width?: number;
  /** Custom column specifications */
  columnSpecs?: string[];
  /** Table title/caption */
  title?: string;
  /** Enable striped rows */
  stripes?: 'even' | 'odd' | 'hover' | 'none';
}

export class EnhancedTableProcessor {
  private options: TableOptions;

  constructor(options: Partial<TableOptions> = {}) {
    this.options = {
      autoColumnWidths: true,
      preserveFormatting: true,
      frame: 'all',
      grid: 'all',
      ...options
    };
  }

  /**
   * Convert HTML table to enhanced AsciiDoc table
   */
  convertTable(tableElement: HTMLTableElement, options?: Partial<TableOptions>): string {
    const tableOptions = { ...this.options, ...options };
    
    // Extract table structure
    const tableData = this.extractTableData(tableElement);
    if (tableData.length === 0) return '';

    // Calculate column specifications
    const columnSpecs = this.calculateColumnSpecs(tableData, tableOptions);
    
    // Generate AsciiDoc table
    return this.generateAsciiDocTable(tableData, columnSpecs, tableOptions, tableElement);
  }

  /**
   * Extract structured data from HTML table
   */
  private extractTableData(table: HTMLTableElement): TableRow[] {
    const rows: TableRow[] = [];
    
    // Process thead
    const thead = table.querySelector('thead');
    if (thead) {
      const headerRows = Array.from(thead.querySelectorAll('tr'));
      headerRows.forEach(row => {
        rows.push(this.processTableRow(row, true));
      });
    }

    // Process tbody
    const tbody = table.querySelector('tbody') || table;
    const bodyRows = Array.from(tbody.querySelectorAll('tr'));
    bodyRows.forEach(row => {
      // Skip if this row is already processed in thead
      if (!thead || !thead.contains(row)) {
        rows.push(this.processTableRow(row, false));
      }
    });

    return rows;
  }

  /**
   * Process a single table row
   */
  private processTableRow(row: HTMLTableRowElement, isHeader: boolean): TableRow {
    const cells: TableCell[] = [];
    const cellElements = Array.from(row.querySelectorAll('td, th'));

    cellElements.forEach(cellElement => {
      const cell = this.processTableCell(cellElement, isHeader);
      cells.push(cell);
    });

    return { cells, isHeader };
  }

  /**
   * Process a single table cell
   */
  private processTableCell(cellElement: Element, defaultHeader: boolean): TableCell {
    const isHeader = cellElement.tagName.toLowerCase() === 'th' || defaultHeader;
    
    // Extract cell content with formatting
    const content = this.extractCellContent(cellElement);
    
    // Extract cell attributes
    const colspan = parseInt(cellElement.getAttribute('colspan') || '1');
    const rowspan = parseInt(cellElement.getAttribute('rowspan') || '1');
    
    // Determine alignment
    const alignment = this.determineCellAlignment(cellElement);
    
    // Determine format
    const format = this.determineCellFormat(cellElement);

    return {
      content,
      isHeader,
      colspan: colspan > 1 ? colspan : undefined,
      rowspan: rowspan > 1 ? rowspan : undefined,
      alignment: alignment !== 'left' ? alignment : undefined,
      format: format !== 'normal' ? format : undefined
    };
  }

  /**
   * Extract cell content preserving formatting
   */
  private extractCellContent(cell: Element): string {
    if (!this.options.preserveFormatting) {
      return this.cleanTextContent(cell.textContent || '');
    }

    // Process child nodes to preserve formatting
    let content = '';
    
    for (const child of Array.from(cell.childNodes)) {
      if (child.nodeType === 3) { // Text node
        content += child.textContent || '';
      } else if (child.nodeType === 1) { // Element node
        const element = child as Element;
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent || '';
        
        switch (tagName) {
          case 'strong':
          case 'b':
            content += `*${text}*`;
            break;
          case 'em':
          case 'i':
            content += `_${text}_`;
            break;
          case 'code':
            content += `\`${text}\``;
            break;
          case 'br':
            content += ' +\n';
            break;
          case 'a':
            const href = element.getAttribute('href');
            if (href) {
              content += `link:${href}[${text}]`;
            } else {
              content += text;
            }
            break;
          default:
            content += text;
        }
      }
    }

    return this.cleanTextContent(content);
  }

  /**
   * Clean and normalize text content
   */
  private cleanTextContent(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\|/g, '\\|') // Escape pipes
      .replace(/\n/g, ' +\n') // Handle line breaks
      .trim();
  }

  /**
   * Determine cell alignment from HTML attributes and styles
   */
  private determineCellAlignment(cell: Element): 'left' | 'center' | 'right' {
    // Check align attribute
    const align = cell.getAttribute('align');
    if (align) {
      const normalized = align.toLowerCase();
      if (['center', 'right'].includes(normalized)) {
        return normalized as 'center' | 'right';
      }
    }

    // Check CSS text-align
    const style = cell.getAttribute('style') || '';
    if (style.includes('text-align: center')) return 'center';
    if (style.includes('text-align: right')) return 'right';

    return 'left';
  }

  /**
   * Determine cell format based on content
   */
  private determineCellFormat(cell: Element): 'normal' | 'emphasis' | 'strong' | 'monospace' {
    // Check if entire cell content is formatted
    const children = Array.from(cell.children);
    
    if (children.length === 1) {
      const child = children[0];
      const tagName = child.tagName.toLowerCase();
      
      if (['strong', 'b'].includes(tagName)) return 'strong';
      if (['em', 'i'].includes(tagName)) return 'emphasis';
      if (tagName === 'code') return 'monospace';
    }

    return 'normal';
  }

  /**
   * Calculate column specifications
   */
  private calculateColumnSpecs(tableData: TableRow[], options: TableOptions): string[] {
    if (options.columnSpecs) {
      return options.columnSpecs;
    }

    if (!options.autoColumnWidths || tableData.length === 0) {
      const colCount = Math.max(...tableData.map(row => row.cells.length));
      return Array(colCount).fill('1');
    }

    // Calculate relative column widths based on content
    const colCount = Math.max(...tableData.map(row => row.cells.length));
    const columnWidths: number[] = Array(colCount).fill(0);

    tableData.forEach(row => {
      row.cells.forEach((cell, index) => {
        if (index < columnWidths.length) {
          const contentLength = cell.content.length;
          columnWidths[index] = Math.max(columnWidths[index], contentLength);
        }
      });
    });

    // Convert to relative proportions
    const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    if (totalWidth === 0) {
      return Array(colCount).fill('1');
    }

    return columnWidths.map(width => {
      const proportion = Math.round((width / totalWidth) * 10);
      return Math.max(1, proportion).toString();
    });
  }

  /**
   * Generate the final AsciiDoc table
   */
  private generateAsciiDocTable(
    tableData: TableRow[], 
    columnSpecs: string[], 
    options: TableOptions,
    originalTable: HTMLTableElement
  ): string {
    let result = '';

    // Add table caption if present
    const caption = originalTable.querySelector('caption') || 
                   (options.title ? { textContent: options.title } : null);
    if (caption) {
      result += `.${caption.textContent?.trim() || ''}\n`;
    }

    // Build table attributes
    const attributes: string[] = [];
    
    // Column specifications
    attributes.push(`cols="${columnSpecs.join(',')}"`);

    // Frame and grid
    if (options.frame !== 'all') {
      attributes.push(`frame="${options.frame}"`);
    }
    if (options.grid !== 'all') {
      attributes.push(`grid="${options.grid}"`);
    }

    // Width
    if (options.width) {
      attributes.push(`width="${options.width}%"`);
    }

    // Stripes
    if (options.stripes && options.stripes !== 'none') {
      attributes.push(`stripes="${options.stripes}"`);
    }

    // Add table header with attributes
    if (attributes.length > 0) {
      result += `[${attributes.join(', ')}]\n`;
    }
    result += '|===\n';

    // Process rows
    let headerSectionProcessed = false;
    
    tableData.forEach((row, rowIndex) => {
      // Add header separator if transitioning from headers to body
      if (!headerSectionProcessed && !row.isHeader && rowIndex > 0) {
        // Check if previous rows were headers
        const hasHeaders = tableData.slice(0, rowIndex).some(r => r.isHeader);
        if (hasHeaders) {
          result += '\n'; // Empty line to separate header from body
          headerSectionProcessed = true;
        }
      }

      // Process cells in this row
      row.cells.forEach(cell => {
        result += this.generateCellContent(cell);
      });
    });

    result += '|===\n\n';
    return result;
  }

  /**
   * Generate content for a single cell
   */
  private generateCellContent(cell: TableCell): string {
    let cellPrefix = '|';
    
    // Add cell format specifiers
    const specifiers: string[] = [];
    
    // Colspan/rowspan
    if (cell.colspan && cell.colspan > 1) {
      specifiers.push(`${cell.colspan}+`);
    }
    if (cell.rowspan && cell.rowspan > 1) {
      specifiers.push(`.${cell.rowspan}+`);
    }

    // Alignment
    if (cell.alignment) {
      const alignSymbol = cell.alignment === 'center' ? '^' : 
                         cell.alignment === 'right' ? '>' : '<';
      specifiers.push(alignSymbol);
    }

    // Format
    if (cell.format) {
      const formatSymbol = cell.format === 'strong' ? 's' :
                          cell.format === 'emphasis' ? 'e' :
                          cell.format === 'monospace' ? 'm' : '';
      if (formatSymbol) {
        specifiers.push(formatSymbol);
      }
    }

    // Add specifiers if any
    if (specifiers.length > 0) {
      cellPrefix += specifiers.join('');
    }

    return `${cellPrefix}${cell.content}\n`;
  }

  /**
   * Update table processing options
   */
  updateOptions(newOptions: Partial<TableOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Get current table processing options
   */
  getOptions(): TableOptions {
    return { ...this.options };
  }
}

/**
 * Convenience function for quick table conversion
 */
export function convertTableToAsciiDoc(
  tableElement: HTMLTableElement, 
  options?: Partial<TableOptions>
): string {
  const processor = new EnhancedTableProcessor(options);
  return processor.convertTable(tableElement);
}
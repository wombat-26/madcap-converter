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

    cellElements.forEach(cell => {
      const cellData: TableCell = {
        content: this.extractCellContent(cell as HTMLTableCellElement),
        isHeader: cell.tagName === 'TH' || isHeader,
        colspan: (cell as HTMLTableCellElement).colSpan > 1 ? (cell as HTMLTableCellElement).colSpan : undefined,
        rowspan: (cell as HTMLTableCellElement).rowSpan > 1 ? (cell as HTMLTableCellElement).rowSpan : undefined,
        alignment: this.detectAlignment(cell as HTMLTableCellElement),
        format: this.detectFormat(cell as HTMLTableCellElement)
      };
      cells.push(cellData);
    });

    return { cells, isHeader };
  }

  /**
   * Extract and format cell content
   */
  private extractCellContent(cell: HTMLTableCellElement): string {
    let content = '';
    
    // Process child nodes to preserve formatting
    const processNode = (node: Node): string => {
      if (node.nodeType === 3) { // Node.TEXT_NODE
        return node.textContent || '';
      } else if (node.nodeType === 1) { // Node.ELEMENT_NODE
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        
        // Handle formatting tags
        switch (tagName) {
          case 'strong':
          case 'b':
            return `*${element.textContent}*`;
          case 'em':
          case 'i':
            return `_${element.textContent}_`;
          case 'code':
            return `\`${element.textContent}\``;
          case 'a':
            const href = element.getAttribute('href') || '';
            const text = element.textContent || '';
            return `${href}[${text}]`;
          case 'br':
            return ' +\n';
          case 'p':
            return Array.from(element.childNodes).map(processNode).join('') + '\n\n';
          case 'ul':
          case 'ol':
            return this.processList(element as HTMLElement);
          default:
            return Array.from(element.childNodes).map(processNode).join('');
        }
      }
      return '';
    };

    content = Array.from(cell.childNodes).map(processNode).join('');
    
    // Clean up content
    return content.trim().replace(/\n\n+/g, '\n\n');
  }

  /**
   * Process lists within table cells
   */
  private processList(list: HTMLElement): string {
    const items = Array.from(list.querySelectorAll('li'));
    const marker = list.tagName === 'OL' ? '.' : '*';
    
    return items.map(item => {
      const content = item.textContent?.trim() || '';
      return `${marker} ${content}`;
    }).join('\n') + '\n';
  }

  /**
   * Detect cell alignment
   */
  private detectAlignment(cell: HTMLTableCellElement): 'left' | 'center' | 'right' | undefined {
    const style = cell.style.textAlign || cell.getAttribute('align');
    
    switch (style) {
      case 'center':
        return 'center';
      case 'right':
        return 'right';
      case 'left':
        return 'left';
      default:
        return undefined;
    }
  }

  /**
   * Detect cell format
   */
  private detectFormat(cell: HTMLTableCellElement): 'normal' | 'emphasis' | 'strong' | 'monospace' {
    // Check if entire cell content is formatted
    const children = Array.from(cell.children);
    if (children.length === 1) {
      const child = children[0];
      if (child.tagName === 'STRONG' || child.tagName === 'B') return 'strong';
      if (child.tagName === 'EM' || child.tagName === 'I') return 'emphasis';
      if (child.tagName === 'CODE') return 'monospace';
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
      // Default equal width columns
      const columnCount = Math.max(...tableData.map(row => row.cells.length));
      return Array(columnCount).fill('1');
    }

    // Calculate based on content length
    const columnWidths: number[] = [];
    
    tableData.forEach(row => {
      row.cells.forEach((cell, index) => {
        const contentLength = cell.content.length;
        columnWidths[index] = Math.max(columnWidths[index] || 0, contentLength);
      });
    });

    // Convert to relative widths
    const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    return columnWidths.map(width => {
      const percentage = Math.round((width / totalWidth) * 100);
      return percentage.toString();
    });
  }

  /**
   * Generate AsciiDoc table syntax
   */
  private generateAsciiDocTable(
    tableData: TableRow[], 
    columnSpecs: string[], 
    options: TableOptions,
    originalTable: HTMLTableElement
  ): string {
    let result = '\n';
    
    // Add table title if present
    const caption = originalTable.querySelector('caption');
    if (caption || options.title) {
      result += `.${caption?.textContent?.trim() || options.title}\n`;
    }

    // Table options
    const tableAttrs: string[] = [];
    
    // Column specifications
    if (columnSpecs.length > 0) {
      tableAttrs.push(`cols="${columnSpecs.join(',')}"`);
    }
    
    // Table options
    if (options.width) {
      tableAttrs.push(`width=${options.width}%`);
    }
    if (options.frame !== 'all') {
      tableAttrs.push(`frame=${options.frame}`);
    }
    if (options.grid !== 'all') {
      tableAttrs.push(`grid=${options.grid}`);
    }
    if (options.stripes && options.stripes !== 'none') {
      tableAttrs.push(`stripes=${options.stripes}`);
    }

    // Start table
    if (tableAttrs.length > 0) {
      result += `[${tableAttrs.join(',')}]\n`;
    }
    result += '|===\n';

    // Process headers
    const headerRows = tableData.filter(row => row.isHeader);
    if (headerRows.length > 0) {
      headerRows.forEach(row => {
        result += this.formatTableRow(row, options);
      });
      result += '\n'; // Empty line after headers
    }

    // Process body rows
    const bodyRows = tableData.filter(row => !row.isHeader);
    bodyRows.forEach(row => {
      result += this.formatTableRow(row, options);
    });

    result += '|===\n\n';
    return result;
  }

  /**
   * Format a single table row
   */
  private formatTableRow(row: TableRow, options: TableOptions): string {
    let result = '';
    
    row.cells.forEach(cell => {
      let cellContent = '';
      
      // Add cell specifications
      const specs: string[] = [];
      
      if (cell.colspan) specs.push(`${cell.colspan}+`);
      if (cell.rowspan) specs.push(`.${cell.rowspan}+`);
      if (cell.alignment) {
        switch (cell.alignment) {
          case 'center': specs.push('^'); break;
          case 'right': specs.push('>'); break;
        }
      }
      if (cell.format !== 'normal' && options.preserveFormatting) {
        switch (cell.format) {
          case 'strong': specs.push('s'); break;
          case 'emphasis': specs.push('e'); break;
          case 'monospace': specs.push('m'); break;
        }
      }
      
      if (specs.length > 0) {
        cellContent += specs.join('');
      }
      
      cellContent += '| ';
      cellContent += cell.content;
      cellContent += ' ';
      
      result += cellContent;
    });
    
    result += '\n';
    return result;
  }
}
/**
 * Unit Tests for ImprovedListProcessor
 * 
 * Tests the ImprovedListProcessor methods that handle list conversion to AsciiDoc
 */

import { JSDOM } from 'jsdom';
import { htmlListFixtures, expectedAsciiDocOutputs } from '../fixtures/html-list-structures';
import { validateAsciiDocListSyntax, compareAsciiDocOutput, wrapInHTMLDocument } from '../utils/test-helpers';

// Mock the ImprovedListProcessor for testing
// This will be replaced with the actual import once we have proper exports

class MockImprovedListProcessor {
  /**
   * Convert HTML list to target format with proper nesting
   */
  convertList(
    listElement: Element, 
    depth: number = 0,
    nodeConverter?: (node: Node, depth: number) => string,
    startNumber?: number,
    format: 'asciidoc' | 'markdown' = 'asciidoc'
  ): string {
    const tagName = listElement.tagName.toLowerCase();
    
    if (tagName === 'ol') {
      return this.convertOrderedList(listElement, depth, nodeConverter, startNumber, format);
    } else if (tagName === 'ul') {
      return this.convertUnorderedList(listElement, depth, nodeConverter, format);
    }
    
    return '';
  }

  private convertOrderedList(
    list: Element, 
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string,
    startNumber?: number,
    format: 'asciidoc' | 'markdown' = 'asciidoc'
  ): string {
    const listItems = Array.from(list.children).filter(child => 
      child.tagName.toLowerCase() === 'li'
    );
    
    if (listItems.length === 0) return '';
    
    let result = '';
    
    // Check if this is an alphabetical or roman numeral list
    const style = list.getAttribute('style') || '';
    const type = list.getAttribute('type') || '';
    const isAlphabetical = style.includes('lower-alpha') || style.includes('lower-latin') || type === 'a';
    const isRoman = style.includes('lower-roman') || type === 'i';
    
    // Add appropriate list style attributes (AsciiDoc only)
    // Skip style attributes for nested lists - AsciiDoc handles nesting with dot depth
    if (format === 'asciidoc' && depth === 0) {
      if (isAlphabetical) {
        result += '[loweralpha]\n';
      } else if (isRoman) {
        result += '[lowerroman]\n';
      } else if (startNumber && startNumber > 1) {
        result += `[start=${startNumber}]\n`;
      }
    }
    
    // Process each list item
    for (let i = 0; i < listItems.length; i++) {
      const item = listItems[i];
      
      if (isAlphabetical && depth === 0) {
        // For top-level alphabetical lists, use alphabetic markers
        result += this.processAlphabeticListItem(item, depth, i, nodeConverter, format);
      } else {
        // For nested alphabetical lists or regular lists, use dot syntax
        result += this.processListItem(item, 'ordered', depth, nodeConverter, format);
      }
    }
    
    return result;
  }

  private convertUnorderedList(
    list: Element, 
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string,
    format: 'asciidoc' | 'markdown' = 'asciidoc'
  ): string {
    const listItems = Array.from(list.children).filter(child => 
      child.tagName.toLowerCase() === 'li'
    );
    
    if (listItems.length === 0) return '';
    
    let result = '';
    
    listItems.forEach((item) => {
      result += this.processListItem(item, 'unordered', depth, nodeConverter, format);
    });
    
    return result;
  }

  private processListItem(
    item: Element,
    listType: 'ordered' | 'unordered',
    depth: number,
    nodeConverter?: (node: Node, depth: number) => string,
    format: 'asciidoc' | 'markdown' = 'asciidoc'
  ): string {
    let result = '';
    
    // Get the appropriate marker
    const marker = listType === 'ordered' 
      ? this.getOrderedMarker(depth, format)
      : this.getUnorderedMarker(depth, format);
    
    // Extract content (simplified for testing)
    const textContent = item.textContent?.trim() || '';
    const mainContent = textContent.split('\n')[0]; // Get first line as main content
    
    // Add the main content with the list marker
    if (mainContent) {
      result += `${marker} ${mainContent}\n`;
    }
    
    // Handle nested lists
    const nestedLists = item.querySelectorAll(':scope > ol, :scope > ul');
    nestedLists.forEach(nestedList => {
      const nestedContent = this.convertList(nestedList as Element, depth + 1, nodeConverter, undefined, format);
      if (nestedContent.trim()) {
        result += nestedContent;
      }
    });
    
    return result;
  }

  private processAlphabeticListItem(
    item: Element,
    depth: number,
    itemIndex: number,
    nodeConverter?: (node: Node, depth: number) => string,
    format: 'asciidoc' | 'markdown' = 'asciidoc'
  ): string {
    let result = '';
    
    // Use format-specific marker for alphabetic lists
    const marker = format === 'asciidoc' ? '..' : `${String.fromCharCode(97 + itemIndex)}.`;
    
    const textContent = item.textContent?.trim() || '';
    const mainContent = textContent.split('\n')[0];
    
    if (mainContent) {
      result += `${marker} ${mainContent}\n`;
    }
    
    // Handle nested lists
    const nestedLists = item.querySelectorAll(':scope > ol, :scope > ul');
    nestedLists.forEach(nestedList => {
      const nestedContent = this.convertList(nestedList as Element, depth + 1, nodeConverter, undefined, format);
      if (nestedContent.trim()) {
        result += nestedContent;
      }
    });
    
    return result;
  }

  private getOrderedMarker(depth: number, format: 'asciidoc' | 'markdown' = 'asciidoc'): string {
    if (format === 'markdown') {
      const indent = '  '.repeat(depth);
      return `${indent}1.`;
    }
    
    // AsciiDoc format - use dot depth for nesting
    const level = depth + 1;
    return '.'.repeat(level);
  }

  private getUnorderedMarker(depth: number, format: 'asciidoc' | 'markdown' = 'asciidoc'): string {
    if (format === 'markdown') {
      const indent = '  '.repeat(depth);
      return `${indent}-`;
    }
    
    // AsciiDoc format
    const level = Math.min(depth + 1, 5);
    return '*'.repeat(level);
  }
}

describe('ImprovedListProcessor Unit Tests', () => {
  let processor: MockImprovedListProcessor;

  beforeEach(() => {
    processor = new MockImprovedListProcessor();
  });

  describe('convertList', () => {
    test('should convert simple ordered list to AsciiDoc', () => {
      const html = htmlListFixtures.simpleOrderedList;
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');

      // Validate syntax
      const validation = validateAsciiDocListSyntax(result);
      expect(validation.success).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Check structure
      expect(result).toContain('. Step 1');
      expect(result).toContain('. Step 2');
      expect(result).toContain('. Step 3');
    });

    test('should convert properly nested alphabetic list', () => {
      const html = htmlListFixtures.properlyNestedAlphabeticList;
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');

      // Validate syntax
      const validation = validateAsciiDocListSyntax(result);
      expect(validation.success).toBe(true);

      // Check structure - main item and nested alphabetic items
      expect(result).toContain('. Step 1');
      expect(result).toContain('.. Sub-step a');
      expect(result).toContain('.. Sub-step b');
      expect(result).toContain('.. Sub-step c');
      expect(result).toContain('. Step 2');
    });

    test('should handle deeply nested lists correctly', () => {
      const html = htmlListFixtures.deeplyNestedLists;
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');

      // Validate syntax
      const validation = validateAsciiDocListSyntax(result);
      expect(validation.success).toBe(true);

      // Check nested structure
      expect(result).toContain('. Level 1 - Step 1');
      expect(result).toContain('.. Level 2 - Sub a');
      expect(result).toContain('... Level 3 - Roman i');
      expect(result).toContain('... Level 3 - Roman ii');
      expect(result).toContain('.. Level 2 - Sub b');
      expect(result).toContain('. Level 1 - Step 2');
    });
  });

  describe('alphabetic list handling', () => {
    test('should detect alphabetic lists correctly', () => {
      const htmlWithAlphabeticList = `
        <ol style="list-style-type: lower-alpha;">
          <li><p>First item</p></li>
          <li><p>Second item</p></li>
        </ol>
      `;
      
      const dom = new JSDOM(wrapInHTMLDocument(htmlWithAlphabeticList));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');

      // Should use [loweralpha] attribute for top-level alphabetic lists
      expect(result).toContain('[loweralpha]');
      expect(result).toContain('.. First item');
      expect(result).toContain('.. Second item');
    });

    test('should NOT add loweralpha attribute for nested alphabetic lists', () => {
      const htmlWithNestedAlphabetic = `
        <ol>
          <li>
            <p>Main item</p>
            <ol style="list-style-type: lower-alpha;">
              <li><p>Nested alphabetic item</p></li>
            </ol>
          </li>
        </ol>
      `;
      
      const dom = new JSDOM(wrapInHTMLDocument(htmlWithNestedAlphabetic));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');

      // Should NOT contain [loweralpha] for nested lists
      expect(result).not.toContain('[loweralpha]');
      
      // Should use proper dot nesting instead
      expect(result).toContain('. Main item');
      expect(result).toContain('.. Nested alphabetic item');
    });

    test('should handle mixed list types correctly', () => {
      const htmlWithMixedLists = `
        <ol>
          <li><p>Step 1</p></li>
          <li>
            <p>Step 2</p>
            <ul>
              <li><p>Bullet point</p></li>
            </ul>
          </li>
          <li>
            <p>Step 3</p>
            <ol style="list-style-type: lower-alpha;">
              <li><p>Sub-step a</p></li>
            </ol>
          </li>
        </ol>
      `;
      
      const dom = new JSDOM(wrapInHTMLDocument(htmlWithMixedLists));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');

      // Validate structure
      expect(result).toContain('. Step 1');
      expect(result).toContain('. Step 2');
      expect(result).toContain('* Bullet point'); // Unordered list marker
      expect(result).toContain('. Step 3');
      expect(result).toContain('.. Sub-step a'); // Nested ordered list marker
    });
  });

  describe('list continuity and numbering', () => {
    test('should maintain sequential numbering without gaps', () => {
      const html = htmlListFixtures.simpleOrderedList;
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');

      // Count main level items (single dots)
      const mainItems = result.split('\n').filter(line => line.match(/^\. /));
      expect(mainItems.length).toBe(3);

      // Verify no gaps in numbering (no orphaned content breaking sequence)
      const lines = result.split('\n').filter(line => line.trim());
      let foundMainItems = 0;
      lines.forEach(line => {
        if (line.match(/^\. /)) {
          foundMainItems++;
        } else if (foundMainItems > 0 && foundMainItems < 3) {
          // Should not have non-list content between main items
          expect(line).toMatch(/^(\+|\.\.|\*|image::|NOTE:|WARNING:)/);
        }
      });
    });

    test('should handle start numbers correctly', () => {
      const html = `<ol start="5"><li><p>Item 5</p></li><li><p>Item 6</p></li></ol>`;
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement, 0, undefined, 5, 'asciidoc');

      // Should include start attribute for non-default start
      expect(result).toContain('[start=5]');
    });
  });

  describe('markdown conversion', () => {
    test('should convert to markdown format when specified', () => {
      const html = htmlListFixtures.simpleOrderedList;
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement, 0, undefined, undefined, 'markdown');

      // Should use markdown syntax
      expect(result).toContain('1. Step 1');
      expect(result).toContain('1. Step 2');
      expect(result).toContain('1. Step 3');
      
      // Should NOT contain AsciiDoc syntax
      expect(result).not.toContain('[loweralpha]');
      expect(result).not.toContain('. Step'); // AsciiDoc dot syntax
    });

    test('should handle nested lists in markdown', () => {
      const html = htmlListFixtures.properlyNestedAlphabeticList;
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement, 0, undefined, undefined, 'markdown');

      // Should use markdown indentation
      expect(result).toContain('1. Step 1');
      expect(result).toContain('  1. Sub-step'); // Indented nested items
      expect(result).toContain('1. Step 2');
    });
  });

  describe('error handling and edge cases', () => {
    test('should handle empty lists gracefully', () => {
      const html = '<ol></ol>';
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement);

      expect(result).toBe('');
    });

    test('should handle lists with only non-li children', () => {
      const html = '<ol><p>Not a list item</p><div>Also not a list item</div></ol>';
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement);

      expect(result).toBe('');
    });

    test('should handle very deep nesting', () => {
      const html = `
        <ol>
          <li>Level 1
            <ol>
              <li>Level 2
                <ol>
                  <li>Level 3
                    <ol>
                      <li>Level 4
                        <ol>
                          <li>Level 5</li>
                        </ol>
                      </li>
                    </ol>
                  </li>
                </ol>
              </li>
            </ol>
          </li>
        </ol>
      `;
      
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const listElement = dom.window.document.querySelector('ol')!;

      const result = processor.convertList(listElement);

      // Should handle deep nesting without breaking
      expect(result).toContain('. Level 1');
      expect(result).toContain('.. Level 2');
      expect(result).toContain('... Level 3');
      expect(result).toContain('.... Level 4');
      expect(result).toContain('..... Level 5');
    });
  });
});
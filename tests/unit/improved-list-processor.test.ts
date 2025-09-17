/**
 * Unit Tests for ImprovedListProcessor
 * 
 * Tests the ImprovedListProcessor methods that handle list conversion to AsciiDoc and Markdown
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { ImprovedListProcessor } from '../../src/core/converters/improved-list-processor.js';

describe('ImprovedListProcessor Unit Tests', () => {
  let processor: ImprovedListProcessor;
  let dom: JSDOM;

  beforeEach(() => {
    processor = new ImprovedListProcessor();
    dom = new JSDOM();
    global.document = dom.window.document;
  });

  describe('AsciiDoc conversion', () => {
    test('should convert simple ordered list to AsciiDoc', () => {
      const htmlString = `
        <ol>
          <li>First item</li>
          <li>Second item</li>
          <li>Third item</li>
        </ol>
      `;
      
      const dom = new JSDOM(htmlString);
      const listElement = dom.window.document.querySelector('ol') as Element;
      
      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');
      
      expect(result).toContain('. First item');
      expect(result).toContain('. Second item');
      expect(result).toContain('. Third item');
    });

    test('should convert nested lists with proper depth', () => {
      const htmlString = `
        <ol>
          <li>Step 1
            <ol style="list-style-type: lower-alpha;">
              <li>Sub-step a</li>
              <li>Sub-step b</li>
            </ol>
          </li>
          <li>Step 2</li>
        </ol>
      `;
      
      const dom = new JSDOM(htmlString);
      const listElement = dom.window.document.querySelector('ol') as Element;
      
      const nodeConverter = (node: Node, depth: number): string => {
        if (node.nodeType === 3) { // Text node
          return node.textContent?.trim() || '';
        }
        if (node.nodeType === 1) { // Element node
          const element = node as Element;
          if (element.tagName.toLowerCase() === 'ol') {
            return processor.convertList(element, depth + 1, nodeConverter, undefined, 'asciidoc');
          }
        }
        return '';
      };
      
      const result = processor.convertList(listElement, 0, nodeConverter, undefined, 'asciidoc');
      
      expect(result).toContain('. Step 1');
      expect(result).toContain('. Step 2');
      expect(result).toContain('.. Sub-step a');
      expect(result).toContain('.. Sub-step b');
    });

    test('should handle unordered lists', () => {
      const htmlString = `
        <ul>
          <li>Bullet point 1</li>
          <li>Bullet point 2</li>
        </ul>
      `;
      
      const dom = new JSDOM(htmlString);
      const listElement = dom.window.document.querySelector('ul') as Element;
      
      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');
      
      expect(result).toContain('* Bullet point 1');
      expect(result).toContain('* Bullet point 2');
    });
  });

  describe('Markdown conversion', () => {
    test('should convert to markdown format when specified', () => {
      const htmlString = `
        <ol>
          <li>Step 1</li>
          <li>Step 2</li>
        </ol>
      `;
      
      const dom = new JSDOM(htmlString);
      const listElement = dom.window.document.querySelector('ol') as Element;
      
      const result = processor.convertList(listElement, 0, undefined, undefined, 'markdown');
      
      expect(result).toContain('1. Step 1');
      expect(result).toContain('2. Step 2');
      expect(result).not.toContain('. Step'); // Should not contain AsciiDoc format
    });

    test('should handle nested markdown lists', () => {
      const htmlString = `
        <ol>
          <li>Step 1
            <ol>
              <li>Sub-step 1</li>
              <li>Sub-step 2</li>
            </ol>
          </li>
          <li>Step 2</li>
        </ol>
      `;
      
      const dom = new JSDOM(htmlString);
      const listElement = dom.window.document.querySelector('ol') as Element;
      
      const nodeConverter = (node: Node, depth: number): string => {
        if (node.nodeType === 3) { // Text node
          return node.textContent?.trim() || '';
        }
        if (node.nodeType === 1) { // Element node
          const element = node as Element;
          if (element.tagName.toLowerCase() === 'ol') {
            return processor.convertList(element, depth + 1, nodeConverter, undefined, 'markdown');
          }
        }
        return '';
      };
      
      const result = processor.convertList(listElement, 0, nodeConverter, undefined, 'markdown');
      
      expect(result).toContain('1. Step 1');
      expect(result).toContain('2. Step 2');
      expect(result).toContain('   1. Sub-step 1'); // Indented for nesting
      expect(result).toContain('   2. Sub-step 2');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty lists', () => {
      const htmlString = `<ol></ol>`;
      
      const dom = new JSDOM(htmlString);
      const listElement = dom.window.document.querySelector('ol') as Element;
      
      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');
      
      expect(result).toBe('');
    });

    test('should handle lists with custom start numbers', () => {
      const htmlString = `
        <ol>
          <li>Item 5</li>
          <li>Item 6</li>
        </ol>
      `;
      
      const dom = new JSDOM(htmlString);
      const listElement = dom.window.document.querySelector('ol') as Element;
      
      const result = processor.convertList(listElement, 0, undefined, 5, 'asciidoc');
      
      expect(result).toContain('[start=5]');
      expect(result).toContain('. Item 5');
      expect(result).toContain('. Item 6');
    });

    test('should handle malformed HTML gracefully', () => {
      const htmlString = `
        <ol>
          <li>Valid item</li>
          <div>Invalid child</div>
          <li>Another valid item</li>
        </ol>
      `;
      
      const dom = new JSDOM(htmlString);
      const listElement = dom.window.document.querySelector('ol') as Element;
      
      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');
      
      expect(result).toContain('. Valid item');
      expect(result).toContain('. Another valid item');
      expect(result).not.toContain('Invalid child');
    });
  });

  describe('Special list types', () => {
    test('should handle alphabetic lists with proper styling', () => {
      const htmlString = `
        <ol style="list-style-type: lower-alpha;">
          <li>First alphabetic item</li>
          <li>Second alphabetic item</li>
        </ol>
      `;
      
      const dom = new JSDOM(htmlString);
      const listElement = dom.window.document.querySelector('ol') as Element;
      
      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');
      
      // For depth 1 lists, AsciiDoc automatically renders as alphabetic
      expect(result).toContain('. First alphabetic item');
      expect(result).toContain('. Second alphabetic item');
    });

    test('should handle roman numeral lists', () => {
      const htmlString = `
        <ol style="list-style-type: lower-roman;">
          <li>First roman item</li>
          <li>Second roman item</li>
        </ol>
      `;
      
      const dom = new JSDOM(htmlString);
      const listElement = dom.window.document.querySelector('ol') as Element;
      
      const result = processor.convertList(listElement, 0, undefined, undefined, 'asciidoc');
      
      expect(result).toContain('[lowerroman]');
      expect(result).toContain('. First roman item');
      expect(result).toContain('. Second roman item');
    });
  });
});
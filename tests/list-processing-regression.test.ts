import { describe, test, expect, beforeEach } from '@jest/globals';
import { DocumentService } from '../src/document-service.js';
import { ConversionOptions } from '../src/types/index.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Regression Test Suite for List Processing
 * 
 * This suite captures the current behavior of list processing across all converters
 * to prevent regressions when consolidating the multiple list processing paths.
 * 
 * Architecture Issues Being Tested:
 * 1. Multiple list processors (Improved, Enhanced, Reliable)
 * 2. Overlapping list handling in AsciiDocConverter
 * 3. Preprocessing vs conversion conflicts
 * 4. Context synchronization between processors
 */
describe('List Processing Regression Tests', () => {
  let documentService: DocumentService;
  
  beforeEach(() => {
    documentService = new DocumentService();
  });

  // Test cases for current behavior - these outputs should remain stable
  const testCases = [
    {
      name: 'Simple ordered list',
      html: `<ol><li>First item</li><li>Second item</li><li>Third item</li></ol>`,
      expectedPatterns: {
        asciidoc: [/^\. First item$/m, /^\. Second item$/m, /^\. Third item$/m],
        'writerside-markdown': [/^1\. First item$/m, /^2\. Second item$/m, /^3\. Third item$/m]
      }
    },
    {
      name: 'Nested ordered lists',
      html: `<ol><li>First item<ol><li>Sub item 1</li><li>Sub item 2</li></ol></li><li>Second item</li></ol>`,
      expectedPatterns: {
        asciidoc: [/^\. First item$/m, /^\.\. Sub item 1$/m, /^\.\. Sub item 2$/m, /^\. Second item$/m],
        'writerside-markdown': [/^1\. First item$/m, /^    1\. Sub item 1$/m, /^    2\. Sub item 2$/m, /^2\. Second item$/m]
      }
    },
    {
      name: 'Mixed list types',
      html: `<ol><li>First item</li></ol><ul><li>Bullet one</li><li>Bullet two</li></ul>`,
      expectedPatterns: {
        asciidoc: [/^\. First item$/m, /^\* Bullet one$/m, /^\* Bullet two$/m],
        'writerside-markdown': [/^1\. First item$/m, /^- Bullet one$/m, /^- Bullet two$/m]
      }
    },
    {
      name: 'List with continuation content',
      html: `<ol><li>First item<p>Continuation paragraph</p></li><li>Second item</li></ol>`,
      expectedPatterns: {
        asciidoc: [/^\. First item$/m, /^\+$/m, /^Continuation paragraph$/m, /^\. Second item$/m],
        'writerside-markdown': [/^1\. First item$/m, /^   Continuation paragraph$/m, /^2\. Second item$/m]
      }
    },
    {
      name: 'MadCap sibling list pattern',
      html: `<ol><li>Parent item</li></ol><ol class="sub-list"><li>Child item 1</li><li>Child item 2</li></ol>`,
      expectedPatterns: {
        asciidoc: [/^\. Parent item$/m],
        'writerside-markdown': [/^1\. Parent item$/m]
      }
    },
    {
      name: 'List with alphabetical formatting',
      html: `<ol class="loweralpha"><li>First alpha</li><li>Second alpha</li></ol>`,
      expectedPatterns: {
        asciidoc: [/\[loweralpha\]/],
        'writerside-markdown': [/^1\. First alpha$/m, /^2\. Second alpha$/m]
      }
    },
    {
      name: 'Deep nested lists (5 levels)',
      html: `<ol><li>L1<ol><li>L2<ol><li>L3<ol><li>L4<ol><li>L5</li></ol></li></ol></li></ol></li></ol></li></ol>`,
      expectedPatterns: {
        asciidoc: [/^\. L1$/m, /^\.\. L2$/m, /^\.\.\. L3$/m, /^\.\.\.\. L4$/m, /^\.\.\.\.\. L5$/m],
        'writerside-markdown': [/^1\. L1$/m, /^    1\. L2$/m, /^        1\. L3$/m]
      }
    },
    {
      name: 'List with inline elements',
      html: `<ol><li>Item with <strong>bold</strong> text</li><li>Item with <em>italic</em> text</li></ol>`,
      expectedPatterns: {
        asciidoc: [/^\. Item with \*bold\* text$/m, /^\. Item with _italic_ text$/m],
        'writerside-markdown': [/^1\. Item with \*\*bold\*\* text$/m, /^2\. Item with \*italic\* text$/m]
      }
    },
    {
      name: 'List with images',
      html: `<ol><li>Text item</li><li>Item with image <img src="test.png" alt="Test Image"></li></ol>`,
      expectedPatterns: {
        asciidoc: [/^\. Text item$/m, /image:/],
        'writerside-markdown': [/^1\. Text item$/m, /!\[Test Image\]/]
      }
    },
    {
      name: 'Complex mixed content list',
      html: `<ol><li>First<p>Paragraph</p><ul><li>Nested bullet</li></ul></li><li>Second</li></ol>`,
      expectedPatterns: {
        asciidoc: [/^\. First$/m, /^\+$/m, /^Paragraph$/m, /^\*\* Nested bullet$/m, /^\. Second$/m],
        'writerside-markdown': [/^1\. First$/m, /^   Paragraph$/m, /^   - Nested bullet$/m, /^2\. Second$/m]
      }
    }
  ];

  // Test current AsciiDoc conversion behavior
  describe('AsciiDoc Converter Current Behavior', () => {
    testCases.forEach(testCase => {
      test(`should handle ${testCase.name} correctly`, async () => {
        const options: ConversionOptions = {
          format: 'asciidoc' as const,
          inputType: 'html' as const,
          extractVariables: false
        };

        const result = await documentService.convertString(testCase.html, options);
        expect(result.content).toBeDefined();
        
        const content = result.content;
        
        // Verify expected patterns exist
        const expectedPatterns = testCase.expectedPatterns.asciidoc;
        expectedPatterns.forEach((pattern, index) => {
          expect(content).toMatch(pattern);
        });
        
        // Store baseline output for comparison
        const baselineDir = path.join(process.cwd(), 'tests', 'baselines', 'asciidoc');
        await fs.mkdir(baselineDir, { recursive: true });
        const filename = testCase.name.replace(/\s+/g, '-').toLowerCase() + '.adoc';
        await fs.writeFile(path.join(baselineDir, filename), content);
      });
    });
  });

  // Test current Writerside Markdown conversion behavior  
  describe('Writerside Markdown Converter Current Behavior', () => {
    testCases.forEach(testCase => {
      test(`should handle ${testCase.name} correctly`, async () => {
        const options: ConversionOptions = {
          format: 'writerside-markdown' as const,
          inputType: 'html' as const,
          extractVariables: false
        };

        const result = await documentService.convertString(testCase.html, options);
        expect(result.content).toBeDefined();
        
        const content = result.content;
        
        // Verify expected patterns exist
        const expectedPatterns = testCase.expectedPatterns['writerside-markdown'];
        expectedPatterns.forEach((pattern, index) => {
          expect(content).toMatch(pattern);
        });
        
        // Store baseline output for comparison
        const baselineDir = path.join(process.cwd(), 'tests', 'baselines', 'writerside-markdown');
        await fs.mkdir(baselineDir, { recursive: true });
        const filename = testCase.name.replace(/\s+/g, '-').toLowerCase() + '.md';
        await fs.writeFile(path.join(baselineDir, filename), content);
      });
    });
  });

  // Test edge cases that could cause regressions
  describe('Edge Cases and Regression Risks', () => {
    test('should handle empty lists without crashing', async () => {
      const html = '<ol></ol><ul></ul>';
      const options: ConversionOptions = {
        format: 'asciidoc' as const,
        inputType: 'html' as const
      };

      const result = await documentService.convertString(html, options);
      expect(result.content).toBeDefined();
    });

    test('should handle lists with only whitespace', async () => {
      const html = '<ol><li>   </li><li>\n\t\n</li></ol>';
      const options: ConversionOptions = {
        format: 'asciidoc' as const,
        inputType: 'html' as const
      };

      const result = await documentService.convertString(html, options);
      expect(result.content).toBeDefined();
    });

    test('should handle malformed nested structures', async () => {
      const html = '<ol><li>Item<ol><li>Nested</ol></li></ol>';
      const options: ConversionOptions = {
        format: 'asciidoc' as const,
        inputType: 'html' as const
      };

      const result = await documentService.convertString(html, options);
      expect(result.content).toBeDefined();
    });

    test('should handle lists after sections (context switching)', async () => {
      const html = '<h2>Section</h2><ol><li>First</li><li>Second</li></ol><h3>Subsection</h3><ul><li>Bullet</li></ul>';
      const options: ConversionOptions = {
        format: 'asciidoc' as const,
        inputType: 'html' as const
      };

      const result = await documentService.convertString(html, options);
      expect(result.content).toBeDefined();
      
      // Should have proper section breaks and list formatting
      expect(result.content).toMatch(/=== Section/);
      expect(result.content).toMatch(/==== Subsection/);
      expect(result.content).toMatch(/^\. First$/m);
      expect(result.content).toMatch(/^\* Bullet$/m);
    });

    test('should handle MadCap dropdown containers with lists', async () => {
      const html = '<div class="MCDropDown"><div class="dropdown-content"><ol><li>In dropdown</li></ol></div></div>';
      const options: ConversionOptions = {
        format: 'asciidoc' as const,
        inputType: 'html' as const
      };

      const result = await documentService.convertString(html, options);
      expect(result.content).toBeDefined();
    });
  });

  // Performance baseline tests
  describe('Performance Baselines', () => {
    test('should handle large nested lists efficiently', async () => {
      // Generate a large nested list structure
      let html = '<ol>';
      for (let i = 1; i <= 100; i++) {
        html += `<li>Item ${i}`;
        if (i % 10 === 0) {
          html += '<ol>';
          for (let j = 1; j <= 5; j++) {
            html += `<li>Sub item ${j}</li>`;
          }
          html += '</ol>';
        }
        html += '</li>';
      }
      html += '</ol>';

      const options: ConversionOptions = {
        format: 'asciidoc' as const,
        inputType: 'html' as const
      };

      const startTime = Date.now();
      const result = await documentService.convertString(html, options);
      const endTime = Date.now();

      expect(result.content).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });
});
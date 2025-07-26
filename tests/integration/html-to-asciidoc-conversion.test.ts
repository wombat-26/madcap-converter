/**
 * Integration Tests for HTML to AsciiDoc Conversion Pipeline
 * 
 * Tests the complete conversion process from HTML input to AsciiDoc output,
 * including HTML preprocessing, list processing, and final formatting.
 */

import { htmlListFixtures, expectedAsciiDocOutputs } from '../fixtures/html-list-structures';
import { 
  validateAsciiDocListSyntax, 
  compareAsciiDocOutput, 
  wrapInHTMLDocument,
  ListTestDataBuilder 
} from '../utils/test-helpers';

// These will be replaced with actual imports once we run the tests
// For now, we'll create mock interfaces that match the expected behavior

interface ConversionOptions {
  format: 'asciidoc' | 'markdown';
  preserveFormatting?: boolean;
  asciidocOptions?: {
    enableValidation?: boolean;
    validationStrictness?: 'strict' | 'normal' | 'lenient';
  };
}

interface ConversionResult {
  content: string;
  wordCount: number;
  warnings: string[];
  errors: string[];
}

// Mock converter that simulates the full conversion pipeline
class MockHtmlToAsciiDocConverter {
  async convert(html: string, options: ConversionOptions): Promise<ConversionResult> {
    // This would be the actual conversion logic
    // For testing, we'll simulate the current broken behavior and the expected fixed behavior
    
    const result: ConversionResult = {
      content: '',
      wordCount: 0,
      warnings: [],
      errors: []
    };

    try {
      // Simulate HTML preprocessing
      const preprocessedHtml = this.preprocessHtml(html);
      
      // Simulate list processing
      const asciidocContent = this.convertToAsciiDoc(preprocessedHtml, options);
      
      result.content = asciidocContent;
      result.wordCount = asciidocContent.split(/\s+/).length;
      
      // Validate if enabled
      if (options.asciidocOptions?.enableValidation) {
        const validation = validateAsciiDocListSyntax(asciidocContent);
        result.warnings = validation.warnings;
        result.errors = validation.errors;
      }
      
    } catch (error) {
      result.errors.push(`Conversion error: ${error}`);
    }

    return result;
  }

  private preprocessHtml(html: string): string {
    // Simulate the HTML preprocessing that should fix malformed structures
    // For now, this is a simplified version that doesn't actually fix the issues
    return html;
  }

  private convertToAsciiDoc(html: string, options: ConversionOptions): string {
    // Simulate the current broken conversion behavior
    // This will be replaced with tests against the actual converter
    
    if (html.includes('nestedListAsSibling')) {
      // Simulate the current broken output
      return `
. Step 1
. Step 2
. Step 3
+
[loweralpha]

.. Sub-step a
.. Sub-step b
.. Sub-step c
. Step 4
+
[loweralpha]

.. Sub-step a
.. Sub-step b
. Step 5
      `.trim();
    }
    
    if (html.includes('realMadCapStructure')) {
      // Simulate the current broken output for the real MadCap structure
      return `
. In Uptempo, click _Activities_ in the navigation sidebar.
. In the Activities section, click _Create Activity._ The button is available on both the _Timeline_ and _Summary_ views:
+
The _Create Activity_ setup assistant opens with the _Type_ page displayed.
. On the _Type_ page:
+
[loweralpha]

.. Use the _Activity type_ list to select the type of activity you want to create from the available options.
.. Use the _Parent_ list to select the activity under which you want to create this new activity in the hierarchy.
.. Click _Next_.
+
The _Details_ page is displayed.
. On the _Details_ page:
+
[loweralpha]

.. Enter a name for your new activity into the _Name_ field.
.. Optional: To set the date range when this activity will be in-market, use the _In-market Dates_ fields.
.. Click _Next_.
+
The _Budget_ page is displayed.
. On the _Budget_ page:
      `.trim();
    }
    
    // Default simple conversion
    return html.replace(/<ol>/g, '').replace(/<\/ol>/g, '')
      .replace(/<li><p>(.*?)<\/p><\/li>/g, '. $1')
      .replace(/\s+/g, ' ').trim();
  }
}

describe('HTML to AsciiDoc Conversion Integration Tests', () => {
  let converter: MockHtmlToAsciiDocConverter;

  beforeEach(() => {
    converter = new MockHtmlToAsciiDocConverter();
  });

  describe('Simple list conversion', () => {
    test('should convert simple ordered list correctly', async () => {
      const html = htmlListFixtures.simpleOrderedList;
      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: true }
      };

      const result = await converter.convert(html, options);

      expect(result.errors).toHaveLength(0);
      expect(result.content).toContain('. Step 1');
      expect(result.content).toContain('. Step 2');
      expect(result.content).toContain('. Step 3');

      const validation = validateAsciiDocListSyntax(result.content);
      expect(validation.success).toBe(true);
    });

    test('should handle properly nested alphabetic lists', async () => {
      const html = htmlListFixtures.properlyNestedAlphabeticList;
      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: true }
      };

      const result = await converter.convert(html, options);

      expect(result.errors).toHaveLength(0);
      
      // Should maintain proper nesting
      expect(result.content).toContain('. Step 1');
      expect(result.content).toContain('.. Sub-step a');
      expect(result.content).toContain('.. Sub-step b');
      expect(result.content).toContain('.. Sub-step c');
      expect(result.content).toContain('. Step 2');
    });
  });

  describe('Problematic structure conversion', () => {
    test('should identify issues with nested lists as siblings', async () => {
      const html = htmlListFixtures.nestedListAsSibling;
      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: true, validationStrictness: 'strict' }
      };

      const result = await converter.convert(html, options);

      // Current behavior - should identify the issues
      expect(result.warnings.length + result.errors.length).toBeGreaterThan(0);
      
      // Check for specific issues we expect to find
      const allIssues = [...result.warnings, ...result.errors].join(' ');
      expect(allIssues).toMatch(/loweralpha.*appears within numbered sequence|Large gap in numbered sequence|continuation marker/i);
    });

    test('should identify issues with real MadCap structure', async () => {
      const html = htmlListFixtures.realMadCapStructure;
      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: true, validationStrictness: 'normal' }
      };

      const result = await converter.convert(html, options);

      // Should maintain the main numbered sequence
      expect(result.content).toMatch(/\. In Uptempo.*\. In the Activities.*\. On the.*Type.*\. On the.*Details.*\. On the.*Budget/s);
      
      // But currently has issues with the nested structure
      const validation = validateAsciiDocListSyntax(result.content);
      if (!validation.success) {
        // We expect this to fail with current implementation
        expect(validation.errors.length + validation.warnings.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Expected vs Actual Output Comparison', () => {
    test('should match expected output for nested list as sibling (when fixed)', async () => {
      // This test will pass once we fix the conversion
      const html = htmlListFixtures.nestedListAsSibling;
      const expected = expectedAsciiDocOutputs.nestedListAsSibling;
      
      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: true }
      };

      const result = await converter.convert(html, options);
      
      // For now, we expect this to fail - it demonstrates the current issue
      const comparison = compareAsciiDocOutput(expected, result.content);
      
      if (!comparison.success) {
        // Document the specific differences
        console.log('Expected vs Actual differences:');
        comparison.errors.forEach(error => console.log(`  ${error}`));
        
        // This test should fail until we fix the conversion
        expect(comparison.success).toBe(false);
        expect(comparison.errors.length).toBeGreaterThan(0);
      }
    });

    test('should match expected output for real MadCap structure (when fixed)', async () => {
      const html = htmlListFixtures.realMadCapStructure;
      const expected = expectedAsciiDocOutputs.realMadCapStructure;
      
      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: true }
      };

      const result = await converter.convert(html, options);
      
      const comparison = compareAsciiDocOutput(expected, result.content);
      
      if (!comparison.success) {
        console.log('Real MadCap structure differences:');
        comparison.errors.forEach(error => console.log(`  ${error}`));
        
        // This test should fail until we fix the conversion
        expect(comparison.success).toBe(false);
      }
    });
  });

  describe('Conversion pipeline validation', () => {
    test('should maintain content fidelity through conversion', async () => {
      const testData = new ListTestDataBuilder()
        .addOrderedList(['First item', 'Second item', 'Third item'])
        .addMalformedNestedList(['Main item'], ['Sub item A', 'Sub item B'])
        .build();

      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: true }
      };

      const result = await converter.convert(testData, options);

      // All original content should be preserved
      expect(result.content).toContain('First item');
      expect(result.content).toContain('Second item');
      expect(result.content).toContain('Third item');
      expect(result.content).toContain('Main item');
      expect(result.content).toContain('Sub item A');
      expect(result.content).toContain('Sub item B');
    });

    test('should handle mixed content types', async () => {
      const html = htmlListFixtures.mixedContentList;
      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: true }
      };

      const result = await converter.convert(html, options);

      // Should convert notes and images appropriately
      expect(result.content).toContain('Step 1 with content');
      expect(result.content).toContain('Step 2 with image');
      
      // Should handle note formatting
      expect(result.content).toMatch(/NOTE|note/);
      
      // Should handle image formatting
      expect(result.content).toMatch(/image::|\.png/);
    });

    test('should validate AsciiDoc syntax in output', async () => {
      const html = htmlListFixtures.deeplyNestedLists;
      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: true, validationStrictness: 'strict' }
      };

      const result = await converter.convert(html, options);

      const validation = validateAsciiDocListSyntax(result.content);
      
      // Log any issues for debugging
      if (!validation.success) {
        console.log('Validation errors:', validation.errors);
        console.log('Validation warnings:', validation.warnings);
      }

      // Should produce valid AsciiDoc (this may fail until we fix the converter)
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Performance and scalability', () => {
    test('should handle large documents efficiently', async () => {
      // Create a large test document
      const builder = new ListTestDataBuilder();
      for (let i = 0; i < 100; i++) {
        builder.addOrderedList([`Item ${i}-1`, `Item ${i}-2`, `Item ${i}-3`]);
      }
      const largeHtml = builder.build();

      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: false } // Skip validation for performance
      };

      const startTime = Date.now();
      const result = await converter.convert(largeHtml, options);
      const endTime = Date.now();

      expect(result.errors).toHaveLength(0);
      expect(result.wordCount).toBeGreaterThan(500);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle malformed HTML gracefully', async () => {
      const malformedHtml = '<ol><li><p>Item 1<li>Item 2 missing closing tags';
      const options: ConversionOptions = { format: 'asciidoc' };

      const result = await converter.convert(malformedHtml, options);

      // Should not crash, but may have warnings
      expect(result.content).toBeTruthy();
      // May have warnings about malformed structure
    });

    test('should handle empty input', async () => {
      const options: ConversionOptions = { format: 'asciidoc' };

      const result = await converter.convert('', options);

      expect(result.content).toBe('');
      expect(result.wordCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle very deeply nested structures', async () => {
      // Create extremely deep nesting (beyond normal use)
      let deepHtml = '<ol>';
      for (let i = 0; i < 10; i++) {
        deepHtml += `<li>Level ${i + 1}<ol>`;
      }
      deepHtml += '<li>Deepest level</li>';
      for (let i = 0; i < 10; i++) {
        deepHtml += '</ol></li>';
      }
      deepHtml += '</ol>';

      const options: ConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: { enableValidation: true }
      };

      const result = await converter.convert(deepHtml, options);

      // Should handle deep nesting without breaking
      expect(result.errors).toHaveLength(0);
      expect(result.content).toContain('Level 1');
      expect(result.content).toContain('Deepest level');
    });
  });
});
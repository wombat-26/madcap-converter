/**
 * Integration Tests for HTML to AsciiDoc Conversion Pipeline
 * 
 * Tests the complete conversion process from HTML input to AsciiDoc output,
 * including HTML preprocessing, list processing, and final formatting.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { AsciiDocConverter } from '../../src/core/converters/asciidoc-converter.js';
import { HTMLPreprocessor } from '../../src/core/services/html-preprocessor.js';
import { ConversionOptions, ConversionResult } from '../../src/core/types/index.js';

describe('HTML to AsciiDoc Conversion Integration Tests', () => {
  let converter: AsciiDocConverter;
  let preprocessor: HTMLPreprocessor;

  beforeEach(() => {
    converter = new AsciiDocConverter();
    preprocessor = new HTMLPreprocessor();
  });

  describe('Simple list conversion', () => {
    test('should handle properly nested alphabetic lists', async () => {
      const htmlInput = `
        <ol>
          <li>Step 1
            <ol style="list-style-type: lower-alpha;">
              <li>Sub-step a</li>
              <li>Sub-step b</li>
              <li>Sub-step c</li>
            </ol>
          </li>
          <li>Step 2</li>
        </ol>
      `;

      const options: ConversionOptions = {
        format: 'asciidoc',
        preserveFormatting: true
      };

      const result = await converter.convert(htmlInput, options);
      
      expect(result.content).toContain('. Step 1');
      expect(result.content).toContain('. Step 2');
      expect(result.content).toContain('.. Sub-step a');
      expect(result.content).toContain('.. Sub-step b');
      expect(result.content).toContain('.. Sub-step c');
    });

    test('should handle complex nested lists', async () => {
      const htmlInput = `
        <ol>
          <li>Step 1</li>
          <li>Step 2</li>
          <li>Step 3
            <ol style="list-style-type: lower-alpha;">
              <li>Sub-step a</li>
              <li>Sub-step b</li>
              <li>Sub-step c</li>
            </ol>
          </li>
          <li>Step 4
            <ol style="list-style-type: lower-alpha;">
              <li>Sub-step a</li>
              <li>Sub-step b</li>
            </ol>
          </li>
          <li>Step 5</li>
        </ol>
      `;

      const options: ConversionOptions = {
        format: 'asciidoc',
        preserveFormatting: true
      };

      const result = await converter.convert(htmlInput, options);
      
      // Check main list items
      expect(result.content).toContain('. Step 1');
      expect(result.content).toContain('. Step 2');
      expect(result.content).toContain('. Step 3');
      expect(result.content).toContain('. Step 4');
      expect(result.content).toContain('. Step 5');
      
      // Check nested items use proper depth-based syntax
      expect(result.content).toContain('.. Sub-step a');
      expect(result.content).toContain('.. Sub-step b');
      expect(result.content).toContain('.. Sub-step c');
    });
  });

  describe('MadCap structure conversion', () => {
    test('should handle real MadCap structure properly', async () => {
      const htmlInput = `
        <ol>
          <li>In Uptempo, click <i>Activities</i> in the navigation sidebar.</li>
          <li>In the Activities section, click <i>Create Activity.</i> The button is available on both the <i>Timeline</i> and <i>Summary</i> views:
            <p>The <i>Create Activity</i> setup assistant opens with the <i>Type</i> page displayed.</p>
          </li>
          <li>On the <i>Type</i> page:
            <ol style="list-style-type: lower-alpha;">
              <li>Use the <i>Activity type</i> list to select the type of activity you want to create from the available options.</li>
              <li>Use the <i>Parent</i> list to select the activity under which you want to create this new activity in the hierarchy.</li>
              <li>Click <i>Next</i>.
                <p>The <i>Details</i> page is displayed.</p>
              </li>
            </ol>
          </li>
          <li>On the <i>Details</i> page:
            <ol style="list-style-type: lower-alpha;">
              <li>Enter a name for your new activity into the <i>Name</i> field.</li>
              <li>Optional: To set the date range when this activity will be in-market, use the <i>In-market Dates</i> fields.</li>
              <li>Click <i>Next</i>.
                <p>The <i>Budget</i> page is displayed.</p>
              </li>
            </ol>
          </li>
          <li>On the <i>Budget</i> page:</li>
        </ol>
      `;

      const options: ConversionOptions = {
        format: 'asciidoc',
        preserveFormatting: true
      };

      const result = await converter.convert(htmlInput, options);
      
      // Check that main steps are properly converted
      expect(result.content).toContain('. In Uptempo, click _Activities_ in the navigation sidebar.');
      expect(result.content).toContain('. In the Activities section, click _Create Activity._');
      expect(result.content).toContain('. On the _Type_ page:');
      expect(result.content).toContain('. On the _Details_ page:');
      expect(result.content).toContain('. On the _Budget_ page:');
      
      // Check nested items
      expect(result.content).toContain('.. Use the _Activity type_ list');
      expect(result.content).toContain('.. Use the _Parent_ list');
      expect(result.content).toContain('.. Click _Next_');
      expect(result.content).toContain('.. Enter a name for your new activity');
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle empty input', async () => {
      const options: ConversionOptions = {
        format: 'asciidoc'
      };

      const result = await converter.convert('', options);
      expect(result.errors.length).toBe(0);
      expect(result.content.trim()).toBe('');
    });

    test('should handle malformed HTML', async () => {
      const htmlInput = `<ol><li>Unclosed item<ol><li>Nested unclosed</ol></ol>`;
      
      const options: ConversionOptions = {
        format: 'asciidoc'
      };

      const result = await converter.convert(htmlInput, options);
      expect(result.errors.length).toBe(0); // Should not throw errors
      expect(result.content).toContain('. '); // Should produce some list content
    });
  });

  describe('Formatting preservation', () => {
    test('should preserve italic formatting', async () => {
      const htmlInput = `<ol><li>Click <i>Button</i> to continue</li></ol>`;
      
      const options: ConversionOptions = {
        format: 'asciidoc',
        preserveFormatting: true
      };

      const result = await converter.convert(htmlInput, options);
      expect(result.content).toContain('Click _Button_ to continue');
    });

    test('should preserve bold formatting', async () => {
      const htmlInput = `<ol><li>Press <b>Enter</b> to submit</li></ol>`;
      
      const options: ConversionOptions = {
        format: 'asciidoc',
        preserveFormatting: true
      };

      const result = await converter.convert(htmlInput, options);
      expect(result.content).toContain('Press *Enter* to submit');
    });
  });
});
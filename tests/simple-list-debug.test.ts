import { describe, test, expect } from '@jest/globals';
import { AsciiDocConverter } from '../src/core/converters/asciidoc-converter.js';
import { ConversionOptions } from '../src/core/types/index.js';

describe('Simple List Debug Tests', () => {
  let converter: AsciiDocConverter;

  beforeEach(() => {
    converter = new AsciiDocConverter();
  });

  test('should debug basic alphabetic list processing', async () => {
    // Very simple HTML with alphabetic list
    const simpleHtml = `<ol style="list-style-type: lower-alpha;">
        <li>First item</li>
        <li>Second item</li>
        <li>Third item</li>
    </ol>`;

    const options: ConversionOptions = {
      format: 'asciidoc',
      inputType: 'html',
      preserveFormatting: true
    };

    const result = await converter.convert(simpleHtml, options);
    
    console.log('=== SIMPLE LIST DEBUG ===');
    console.log('Input HTML:');
    console.log(simpleHtml);
    console.log('\nOutput AsciiDoc:');
    console.log(result.content);
    console.log('=== END DEBUG ===');

    // Check what we actually get
    expect(result.content).toBeDefined();
    
    // Log what patterns are found
    const lines = result.content.split('\n');
    console.log('\nAnalyzing lines:');
    lines.forEach((line, index) => {
      if (line.trim()) {
        console.log(`Line ${index}: "${line}"`);
        if (line.match(/\[loweralpha\]/)) console.log('  -> Found [loweralpha] marker');
        if (line.match(/^[a-z]\.\s/)) console.log('  -> Found alphabetic list item');
        if (line.match(/^\.\.\s/)) console.log('  -> Found dot list item');
      }
    });
  });

  test('should debug nested list processing', async () => {
    // Simple nested list
    const nestedHtml = `<ol>
      <li>Main item
        <ol style="list-style-type: lower-alpha;">
          <li>Sub item A</li>
          <li>Sub item B</li>
        </ol>
      </li>
    </ol>`;

    const options: ConversionOptions = {
      format: 'asciidoc',
      inputType: 'html',
      preserveFormatting: true
    };

    const result = await converter.convert(nestedHtml, options);
    
    console.log('=== NESTED LIST DEBUG ===');
    console.log('Input HTML:');
    console.log(nestedHtml);
    console.log('\nOutput AsciiDoc:');
    console.log(result.content);
    console.log('=== END NESTED DEBUG ===');
  });
});
import { describe, test, expect } from '@jest/globals';
import { AsciiDocConverter } from '../src/core/converters/asciidoc-converter.js';
import { ConversionOptions } from '../src/core/types/index.js';

describe('Numbering Debug Tests', () => {
  let converter: AsciiDocConverter;

  beforeEach(() => {
    converter = new AsciiDocConverter();
  });

  test('should debug consecutive numbered list items', async () => {
    // HTML similar to user's screenshot - multiple ol elements
    // ORDER: In HTML, the nested list comes BEFORE the paragraph
    const htmlWithConsecutiveLists = `
    <ol>
        <li>On the Type page:
            <ol style="list-style-type: lower-alpha;">
                <li>Use the Activity type list</li>
                <li>Use the Parent list</li>
                <li>Click Next</li>
            </ol>
            <p>The Details page is displayed.</p>
        </li>
    </ol>
    <ol>
        <li>On the Details page:
            <ol style="list-style-type: lower-alpha;">
                <li>Enter a name</li>
                <li>Set the date range</li>
                <li>Complete attributes</li>
                <li>Click Next</li>
            </ol>
            <p>The Budget page is displayed.</p>
        </li>
    </ol>
    <ol>
        <li>On the Budget page:
            <ol style="list-style-type: lower-alpha;">
                <li>Enter cost estimate</li>
                <li>Connect to investment</li>
                <li>Click Next</li>
            </ol>
            <p>The Impact page is displayed.</p>
        </li>
    </ol>`;

    const options: ConversionOptions = {
      format: 'asciidoc',
      inputType: 'html',
      preserveFormatting: true
    };

    const result = await converter.convert(htmlWithConsecutiveLists, options);
    
    console.log('=== NUMBERING DEBUG ===');
    console.log('Input HTML (structure):');
    console.log('- Multiple <ol> elements (should continue numbering)');
    console.log('\nOutput AsciiDoc:');
    console.log(result.content);
    console.log('=== END NUMBERING DEBUG ===');

    // The issue: each ol becomes a separate ". " item instead of continuing ". .. ..."
    // Should produce: 
    // . On the Type page:
    // . On the Details page:  (NOT ". " again)
    // . On the Budget page:   (NOT ". " again)
  });

  test('should debug single ol with multiple items', async () => {
    // Single ol with multiple li elements
    const singleOlMultipleItems = `
    <ol>
        <li>First main item</li>
        <li>Second main item</li>
        <li>Third main item</li>
    </ol>`;

    const options: ConversionOptions = {
      format: 'asciidoc',
      inputType: 'html',
      preserveFormatting: true
    };

    const result = await converter.convert(singleOlMultipleItems, options);
    
    console.log('=== SINGLE OL DEBUG ===');
    console.log('Output AsciiDoc:');
    console.log(result.content);
    console.log('=== END SINGLE OL DEBUG ===');

    // This should work correctly and show:
    // . First main item
    // . Second main item  
    // . Third main item
  });
});
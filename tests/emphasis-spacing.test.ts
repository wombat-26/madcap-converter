import { describe, it, expect } from '@jest/globals';
import WritersideMarkdownConverter from '../src/core/converters/writerside-markdown-converter.js';
import { ConversionOptions } from '../src/core/types/index.js';

describe('Emphasis Spacing Tests', () => {
  const converters = [
    { name: 'WritersideMarkdownConverter', instance: new WritersideMarkdownConverter() }
  ];

  const testCases = [
    {
      name: 'emphasis with text after',
      input: '<p>The <em>panel</em>is not showing.</p>',
      expected: 'The *panel* is not showing.'
    },
    {
      name: 'emphasis with text before',
      input: '<p>Click<em>here</em> to continue.</p>',
      expected: 'Click *here* to continue.'
    },
    {
      name: 'emphasis with spaces around',
      input: '<p>The <em>Activities</em> panel is important.</p>',
      expected: 'The *Activities* panel is important.'
    },
    {
      name: 'strong with text after',
      input: '<p>This is <strong>important</strong>information.</p>',
      expected: 'This is **important** information.'
    },
    {
      name: 'emphasis with punctuation',
      input: '<p>This is <em>important</em>.</p>',
      expected: 'This is *important*.'
    },
    {
      name: 'multiple emphasis without spaces',
      input: '<p><em>First</em><em>Second</em></p>',
      expected: '*First**Second*'
    },
    {
      name: 'emphasis at start',
      input: '<p><em>Note</em> this carefully.</p>',
      expected: '*Note* this carefully.'
    },
    {
      name: 'emphasis at end',
      input: '<p>This is <em>important</em></p>',
      expected: 'This is *important*'
    },
    {
      name: 'nested emphasis and strong',
      input: '<p>The <em>very <strong>important</strong> point</em> here.</p>',
      expected: 'The *very **important** point* here.'
    },
    {
      name: 'italic tag instead of em',
      input: '<p>The <i>panel</i>is broken.</p>',
      expected: 'The *panel* is broken.'
    },
    {
      name: 'bold tag instead of strong',
      input: '<p>The <b>panel</b>is broken.</p>',
      expected: 'The **panel** is broken.'
    }
  ];

  converters.forEach(({ name, instance }) => {
    describe(name, () => {
      testCases.forEach(({ name: testName, input, expected }) => {
        it(testName, async () => {
          const options: ConversionOptions = {
            format: instance.format,
            preserveFormatting: false
          };
          
          const result = await instance.convert(input, options);
          const output = result.content.trim();
          
          // For better error messages, show the actual vs expected
          if (output !== expected) {
            console.log(`\n${name} - ${testName}:`);
            console.log(`Input:    "${input}"`);
            console.log(`Expected: "${expected}"`);
            console.log(`Actual:   "${output}"`);
            
            // Show character-by-character comparison for debugging
            const maxLen = Math.max(expected.length, output.length);
            for (let i = 0; i < maxLen; i++) {
              if (expected[i] !== output[i]) {
                console.log(`First difference at position ${i}:`);
                console.log(`  Expected: "${expected[i]}" (char code: ${expected.charCodeAt(i)})`);
                console.log(`  Actual:   "${output[i]}" (char code: ${output.charCodeAt(i)})`);
                break;
              }
            }
          }
          
          expect(output).toBe(expected);
        });
      });
    });
  });
});
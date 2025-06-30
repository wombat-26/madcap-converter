/**
 * Debug Note Conversion
 * 
 * Focused test to understand note conversion issues
 */

import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function debugNoteConversion() {
  console.log('🔍 Debugging Note Conversion');
  console.log('='.repeat(40));

  const asciidocConverter = new AsciiDocConverter();
  const preprocessor = new MadCapPreprocessor();

  const testHTML = `<div class="note">
    <p><span class="noteInDiv">Note:</span>&#160;</p>
    <p>This is an important note with additional details.</p>
  </div>`;

  console.log('📝 Input HTML:');
  console.log(testHTML);
  console.log('\n' + '-'.repeat(40));

  try {
    // Step 1: Preprocess
    console.log('📋 Step 1: Preprocessing...');
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(testHTML);
    console.log('Preprocessed HTML:');
    console.log(preprocessedHTML);
    console.log('\n' + '-'.repeat(40));

    // Step 2: Convert
    console.log('📋 Step 2: Converting to AsciiDoc...');
    const result = await asciidocConverter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });

    console.log('📄 Final AsciiDoc:');
    console.log(result.content);
    console.log('\n' + '-'.repeat(40));

    // Check for specific patterns
    console.log('🔍 Pattern Analysis:');
    console.log(`Contains "NOTE:": ${result.content.includes('NOTE:')}`);
    console.log(`Contains "[NOTE]": ${result.content.includes('[NOTE]')}`);
    console.log(`Contains "====": ${result.content.includes('====')}`);
    console.log(`Line count: ${result.content.split('\n').length}`);

    // Show line by line
    console.log('\n📝 Line by line:');
    result.content.split('\n').forEach((line, index) => {
      console.log(`${index + 1}: "${line}"`);
    });

  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log('Starting Note Conversion Debug...\n');
debugNoteConversion().catch(console.error);
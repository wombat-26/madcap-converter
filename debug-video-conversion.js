/**
 * Debug Video Conversion
 */

import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function debugVideoConversion() {
  console.log('🎥 Debugging Video Conversion');
  console.log('='.repeat(40));

  const asciidocConverter = new AsciiDocConverter();
  const preprocessor = new MadCapPreprocessor();

  const testHTML = `<p>
    <object MadCap:HTML5Video="true" src="../IntActVideo/CreatActi.mp4" MadCap:Param_controls="true" MadCap:Param_muted="false" MadCap:Param_loop="false" MadCap:Param_autoplay="false">
    </object>
  </p>`;

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

    // Check for video pattern
    console.log('🔍 Pattern Analysis:');
    console.log(`Contains "video::": ${result.content.includes('video::')}`);
    console.log(`Contains video path: ${result.content.includes('CreatActi.mp4')}`);
    console.log(`Contains "controls": ${result.content.includes('controls')}`);

  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log('Starting Video Conversion Debug...\n');
debugVideoConversion().catch(console.error);
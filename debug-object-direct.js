/**
 * Debug Object Element Directly
 */

import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function debugObjectDirect() {
  console.log('🎥 Testing Object Element Directly');
  console.log('='.repeat(40));

  const asciidocConverter = new AsciiDocConverter();

  const testHTML = `<html><head></head><body>
    <object MadCap:HTML5Video="true" src="../IntActVideo/CreatActi.mp4" MadCap:Param_controls="true" MadCap:Param_muted="false" MadCap:Param_loop="false" MadCap:Param_autoplay="false">
    </object>
  </body></html>`;

  console.log('📝 Input HTML (direct to converter):');
  console.log(testHTML);
  console.log('\n' + '-'.repeat(40));

  try {
    // Convert directly without preprocessing
    console.log('📋 Converting directly to AsciiDoc...');
    const result = await asciidocConverter.convert(testHTML, {
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

console.log('Testing Object Element Directly...\n');
debugObjectDirect().catch(console.error);
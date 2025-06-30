/**
 * Test Continuation Fix
 * Verify that nested lists now have proper continuation markers
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function testContinuationFix() {
  console.log('🔧 TESTING CONTINUATION FIX');
  console.log('='.repeat(50));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const converter = new AsciiDocConverter();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    
    console.log('📊 Converting with continuation marker fix...');
    
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    const result = await converter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });
    
    // Save the output
    writeFileSync('./CONTINUATION-FIX.adoc', result.content);
    
    // Check the specific problematic area
    const lines = result.content.split('\n');
    const connectingIndex = lines.findIndex(line => 
      line.includes('On the activity where you want to connect investments'));
    
    if (connectingIndex >= 0) {
      console.log('✅ Found target list item\n');
      
      console.log('📋 STRUCTURE AFTER FIX:');
      
      for (let i = connectingIndex - 1; i < Math.min(connectingIndex + 8, lines.length); i++) {
        const line = lines[i];
        const lineNum = `${i + 1}`.padStart(3, ' ');
        
        if (line === '+') {
          console.log(`${lineNum}: ${line} ✅ CONTINUATION MARKER`);
        } else if (line === '[loweralpha]') {
          console.log(`${lineNum}: ${line} ✅ ALPHABETICAL MARKER`);
        } else if (line.match(/^\. /)) {
          console.log(`${lineNum}: ${line.substring(0, 50)}... ✅ MAIN ITEM`);
        } else if (line.match(/^\.\. /)) {
          console.log(`${lineNum}: ${line.substring(0, 50)}... ✅ SUB ITEM`);
        } else if (line.trim()) {
          console.log(`${lineNum}: ${line.substring(0, 50)}...`);
        } else {
          console.log(`${lineNum}: (empty line)`);
        }
      }
      
      // Check if we have the correct structure
      let foundContinuation = false;
      let foundAlphaAfterContinuation = false;
      
      for (let i = connectingIndex; i < Math.min(connectingIndex + 5, lines.length); i++) {
        if (lines[i] === '+') {
          foundContinuation = true;
        } else if (foundContinuation && lines[i] === '[loweralpha]') {
          foundAlphaAfterContinuation = true;
          break;
        }
      }
      
      console.log('\n📊 VALIDATION:');
      console.log(`   Continuation marker found: ${foundContinuation ? '✅' : '❌'}`);
      console.log(`   [loweralpha] after continuation: ${foundAlphaAfterContinuation ? '✅' : '❌'}`);
      
      if (foundContinuation && foundAlphaAfterContinuation) {
        console.log('\n🎉 SUCCESS! Nested list structure is now correct!');
        console.log('   Sub-items should now be properly indented under main item 1');
      } else {
        console.log('\n❌ Issue still exists - nested list structure not fixed');
      }
    }
    
    console.log('\n📁 Output saved to: CONTINUATION-FIX.adoc');

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

testContinuationFix().catch(console.error);
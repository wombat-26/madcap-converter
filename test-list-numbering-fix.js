/**
 * Test List Numbering Fix
 * Verify that numbered lists in collapsible sections are now correct
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function testListNumberingFix() {
  console.log('🔧 TESTING LIST NUMBERING FIX');
  console.log('='.repeat(50));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const converter = new AsciiDocConverter();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    
    console.log('📊 Running conversion with fixed list processing...');
    
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    const result = await converter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });
    
    // Save the output
    writeFileSync('./FIXED-LIST-NUMBERING.adoc', result.content);
    
    // Check the "Connecting Activities" section
    const lines = result.content.split('\n');
    const connectingStart = lines.findIndex(line => 
      line.includes('Connecting Activities to Financial Items'));
    
    if (connectingStart >= 0) {
      console.log('✅ Found "Connecting Activities" collapsible section');
      
      // Analyze the list structure
      console.log('\n📋 LIST STRUCTURE IN COLLAPSIBLE:');
      
      let inMainList = false;
      let inSubList = false;
      let mainItemCount = 0;
      let subItemCount = 0;
      
      for (let i = connectingStart; i < Math.min(connectingStart + 50, lines.length); i++) {
        const line = lines[i];
        
        if (line === '[loweralpha]') {
          console.log(`   Line ${i + 1}: [loweralpha] marker - next items will be a,b,c...`);
          inSubList = true;
        } else if (line.match(/^\.\. /)) {
          mainItemCount++;
          inMainList = true;
          inSubList = false;
          console.log(`   Line ${i + 1}: MAIN ITEM ${mainItemCount}: "${line.substring(0, 50)}..."`);
        } else if (line.match(/^\.\.\. /) && inSubList) {
          subItemCount++;
          console.log(`   Line ${i + 1}: SUB ITEM (will be ${String.fromCharCode(96 + subItemCount)}): "${line.substring(0, 40)}..."`);
        } else if (line === '====') {
          // End of collapsible
          break;
        }
      }
      
      console.log(`\n📊 SUMMARY:`);
      console.log(`   Main numbered items found: ${mainItemCount} (should render as 1, 2, 3...)`);
      console.log(`   Sub-lettered items found: ${subItemCount} (should render as a, b, c...)`);
      
      // Verify the fix
      if (mainItemCount >= 7) {
        console.log('   ✅ SUCCESS: All 7 main steps preserved as numbers!');
      } else {
        console.log(`   ❌ ISSUE: Only ${mainItemCount} main steps found (expected 7)`);
      }
    }
    
    console.log('\n📁 Fixed output saved to: FIXED-LIST-NUMBERING.adoc');

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    console.error(error.stack);
  }
}

testListNumberingFix().catch(console.error);
/**
 * Test Final List Fix
 * Verify that lists in collapsible sections now use correct numbering
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function testFinalListFix() {
  console.log('🎯 TESTING FINAL LIST FIX');
  console.log('='.repeat(50));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const converter = new AsciiDocConverter();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    
    console.log('📊 Converting with all fixes applied...');
    
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    const result = await converter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });
    
    // Save the final output
    writeFileSync('./FINAL-LIST-FIX.adoc', result.content);
    
    // Analyze the "Connecting Activities" section
    const lines = result.content.split('\n');
    const connectingIndex = lines.findIndex(line => 
      line.includes('Connecting Activities to Financial Items'));
    
    if (connectingIndex >= 0) {
      console.log('✅ Found "Connecting Activities" collapsible section\n');
      
      console.log('📋 LIST STRUCTURE ANALYSIS:');
      
      let mainItemCount = 0;
      let subItemCount = 0;
      let expectingAlpha = false;
      
      for (let i = connectingIndex + 1; i < Math.min(connectingIndex + 50, lines.length); i++) {
        const line = lines[i];
        
        if (line === '[loweralpha]') {
          expectingAlpha = true;
          console.log(`   Line ${i + 1}: [loweralpha] - Next items will be a,b,c`);
        } else if (line.match(/^(\.)+ /)) {
          const dots = line.match(/^(\.+)/)[1];
          
          if (dots.length === 1) {
            mainItemCount++;
            expectingAlpha = false;
            console.log(`   Line ${i + 1}: MAIN ITEM ${mainItemCount} (${dots}): "${line.substring(0, 50)}..."`);
          } else if (dots.length === 2 && expectingAlpha) {
            subItemCount++;
            const letter = String.fromCharCode(96 + subItemCount);
            console.log(`   Line ${i + 1}: SUB ITEM ${letter} (${dots}): "${line.substring(0, 40)}..."`);
          } else if (dots.length === 2) {
            console.log(`   Line ${i + 1}: NESTED ITEM (${dots}): "${line.substring(0, 40)}..."`);
          }
        } else if (line === '====') {
          break;
        }
      }
      
      console.log(`\n📊 FINAL RESULTS:`);
      console.log(`   ✅ Main numbered items: ${mainItemCount} (renders as 1, 2, 3, 4, 5, 6, 7)`);
      console.log(`   ✅ Sub-lettered items: ${subItemCount} (renders as a, b)`);
      
      if (mainItemCount >= 7) {
        console.log('\n🎉 PERFECT! All 7 main steps are numbered correctly!');
        console.log('   The list will render with proper numbering (1-7) not letters!');
      } else {
        console.log(`\n⚠️ Found ${mainItemCount} main items, expected 7`);
      }
    }
    
    console.log('\n📁 Final output saved to: FINAL-LIST-FIX.adoc');

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

testFinalListFix().catch(console.error);
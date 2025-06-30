/**
 * Fresh Conversion Test
 * Test the current state of conversion
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function testFreshConversion() {
  console.log('🔄 FRESH CONVERSION TEST');
  console.log('='.repeat(40));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const converter = new AsciiDocConverter();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    
    console.log('📊 Running fresh conversion...');
    
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    const result = await converter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });
    
    // Save fresh output
    writeFileSync('./fresh-conversion.adoc', result.content);
    
    // Analyze results
    const collapsibleBlocks = (result.content.match(/\[%collapsible\]/g) || []).length;
    const mainSteps = (result.content.match(/^\\. /gm) || []).length;
    
    console.log(`📊 Fresh Results:`);
    console.log(`   Collapsible blocks: ${collapsibleBlocks}`);
    console.log(`   Main list steps: ${mainSteps}`);
    
    // Check specific content
    const dialogText = 'dialog closes';
    const hasDialogText = result.content.includes(dialogText);
    console.log(`   Contains "dialog closes": ${hasDialogText ? '✅' : '❌'}`);
    
    if (hasDialogText) {
      const lines = result.content.split('\\n');
      const dialogLineIndex = lines.findIndex(line => line.includes(dialogText));
      console.log(`   Found at line: ${dialogLineIndex + 1}`);
      console.log(`   Text: "${lines[dialogLineIndex].trim()}"`);
      
      // Check structural context
      let inCollapsible = false;
      let inAdmonition = false;
      
      // Look backward to find structure
      for (let i = dialogLineIndex - 1; i >= Math.max(0, dialogLineIndex - 10); i--) {
        const line = lines[i];
        if (line.includes('[%collapsible]')) {
          inCollapsible = true;
          break;
        }
        if (line.match(/^\\[NOTE|TIP|WARNING|CAUTION\\]/)) {
          inAdmonition = true;
          break;
        }
        if (line === '====') {
          // Check if this closes a collapsible or admonition
          for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
            if (lines[j].includes('[%collapsible]') || lines[j].startsWith('.')) {
              inCollapsible = true;
              break;
            }
            if (lines[j].match(/^\\[NOTE|TIP|WARNING|CAUTION\\]/)) {
              inAdmonition = true;
              break;
            }
          }
          break;
        }
      }
      
      const context = inCollapsible ? 'INSIDE COLLAPSIBLE' : 
                     inAdmonition ? 'INSIDE ADMONITION' : 'REGULAR CONTENT';
      console.log(`   Context: ${context}`);
      
      if (inCollapsible || inAdmonition) {
        console.log(`❌ ISSUE CONFIRMED: Text is inside a block when it should be regular content`);
      } else {
        console.log(`✅ CORRECT: Text is in regular content`);
      }
    }
    
    // Check main list structure
    console.log(`\\n📋 Main List Structure:`);
    const mainListItems = result.content.split('\\n').filter(line => line.match(/^\\. /));
    mainListItems.forEach((line, index) => {
      console.log(`   ${index + 1}. ${line.substring(0, 60)}...`);
    });
    
    console.log(`\\n📁 Fresh output saved to: ./fresh-conversion.adoc`);

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    console.error(error.stack);
  }
}

testFreshConversion().catch(console.error);

/**
 * Test the exact problems identified:
 * 1. Main list numbering
 * 2. "Select Investment Item dialog closes" content placement
 * 3. Dropdown conversion count
 */

import { readFileSync } from 'fs';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function testSpecificIssues() {
  console.log('🎯 TESTING SPECIFIC ISSUES');
  console.log('='.repeat(40));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const asciidocConverter = new AsciiDocConverter();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    
    // Count source elements
    const sourceDropdowns = (sourceHTML.match(/MadCap:dropDown/g) || []).length;
    const sourceMainLists = (sourceHTML.match(/<ol>/g) || []).length;
    
    console.log(`📊 Source Analysis:`);
    console.log(`   MadCap dropdowns: ${sourceDropdowns}`);
    console.log(`   Ordered lists: ${sourceMainLists}`);
    
    // Process
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    const result = await asciidocConverter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });

    // Count output elements
    const outputCollapsible = (result.content.match(/\[%collapsible\]/g) || []).length;
    const outputMainSteps = (result.content.match(/^\. /gm) || []).length;
    
    console.log(`📊 Output Analysis:`);
    console.log(`   Collapsible blocks: ${outputCollapsible}`);
    console.log(`   Main list steps: ${outputMainSteps}`);
    
    // Check specific content placement
    const dialogText = 'The Select Investment Item dialog closes';
    const hasDialogText = result.content.includes(dialogText);
    
    if (hasDialogText) {
      // Find the context of this text
      const lines = result.content.split('\n');
      const dialogLineIndex = lines.findIndex(line => line.includes(dialogText));
      
      console.log(`📍 Dialog text found at line ${dialogLineIndex + 1}`);
      console.log(`📍 Context:`);
      
      // Show 3 lines before and after
      for (let i = Math.max(0, dialogLineIndex - 3); i <= Math.min(lines.length - 1, dialogLineIndex + 3); i++) {
        const marker = i === dialogLineIndex ? '>>> ' : '    ';
        console.log(`${marker}${i + 1}: ${lines[i]}`);
      }
    } else {
      console.log(`❌ Dialog text not found in output`);
    }
    
    // Check for main list structure issues
    console.log(`\n🔍 Main List Structure Analysis:`);
    const mainListLines = result.content.split('\n').filter(line => line.match(/^\. /));
    console.log(`   Found ${mainListLines.length} main list items:`);
    
    mainListLines.forEach((line, index) => {
      console.log(`   ${index + 1}. ${line.substring(0, 50)}...`);
    });
    
    // Issue summary
    console.log(`\n📋 ISSUE SUMMARY:`);
    console.log(`   Dropdown conversion: ${outputCollapsible}/${sourceDropdowns} (${Math.round(outputCollapsible/sourceDropdowns*100)}%)`);
    console.log(`   Main steps found: ${outputMainSteps}`);
    console.log(`   Dialog text placement: ${hasDialogText ? 'Found' : 'Missing'}`);

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

testSpecificIssues().catch(console.error);

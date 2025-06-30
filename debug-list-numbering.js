/**
 * Debug List Numbering Issue
 * Check why numbered lists in collapsible sections are becoming lowercase letters
 */

import { readFileSync } from 'fs';

async function debugListNumbering() {
  console.log('🔍 DEBUGGING LIST NUMBERING IN COLLAPSIBLE SECTIONS');
  console.log('='.repeat(50));

  try {
    // Read the preprocessed HTML to see what we're starting with
    const preprocessedHTML = readFileSync('./debug-preprocessed.html', 'utf-8');
    
    console.log('📊 ANALYZING PREPROCESSED HTML');
    
    // Find the "Connecting Activities to Financial Items" section
    const connectingStart = preprocessedHTML.indexOf('Connecting Activities to Financial Items');
    if (connectingStart >= 0) {
      console.log('✅ Found "Connecting Activities to Financial Items" section');
      
      // Extract a portion of the HTML around this section
      const snippet = preprocessedHTML.substring(connectingStart - 200, connectingStart + 2000);
      
      // Look for ordered lists
      const olMatches = snippet.match(/<ol[^>]*>/g) || [];
      console.log(`   Found ${olMatches.length} <ol> tags in this section`);
      
      olMatches.forEach((match, index) => {
        console.log(`   ${index + 1}. ${match}`);
      });
      
      // Look for list items
      const liMatches = snippet.match(/<li>/g) || [];
      console.log(`   Found ${liMatches.length} <li> tags in this section`);
    }
    
    // Now check the final AsciiDoc output
    console.log('\n📊 ANALYZING ASCIIDOC OUTPUT');
    const asciidocOutput = readFileSync('./test-fixed-output.adoc', 'utf-8');
    
    // Find the collapsible section
    const collapsibleStart = asciidocOutput.indexOf('.Connecting Activities to Financial Items');
    if (collapsibleStart >= 0) {
      console.log('✅ Found collapsible section in AsciiDoc');
      
      // Extract the content of this section
      const sectionStart = collapsibleStart;
      const sectionEnd = asciidocOutput.indexOf('====', asciidocOutput.indexOf('====', collapsibleStart) + 1);
      const sectionContent = asciidocOutput.substring(sectionStart, sectionEnd);
      
      console.log('\n📋 Section content analysis:');
      const lines = sectionContent.split('\n');
      
      // Look for list markers
      let inLowerAlpha = false;
      lines.forEach((line, index) => {
        if (line.includes('[loweralpha]')) {
          inLowerAlpha = true;
          console.log(`   Line ${index + 1}: [loweralpha] marker found`);
        }
        if (line.match(/^\.\. /)) {
          console.log(`   Line ${index + 1}: "${line.substring(0, 60)}..." ${inLowerAlpha ? '(will be a,b,c)' : '(will be 1,2,3)'}`);
        }
        if (line.match(/^\.\.\. /)) {
          console.log(`   Line ${index + 1}: "${line.substring(0, 60)}..." (sub-item)`);
        }
      });
    }
    
    // Check the HTML structure more carefully
    console.log('\n📊 DETAILED HTML STRUCTURE ANALYSIS');
    const htmlLines = preprocessedHTML.split('\n');
    
    // Find the dropdown div
    const dropdownLine = htmlLines.findIndex(line => 
      line.includes('madcap-dropdown') && line.includes('Connecting Activities'));
    
    if (dropdownLine >= 0) {
      console.log(`Found dropdown at line ${dropdownLine + 1}`);
      
      // Look for the first <ol> after this
      for (let i = dropdownLine; i < Math.min(dropdownLine + 50, htmlLines.length); i++) {
        const line = htmlLines[i];
        if (line.includes('<ol')) {
          console.log(`   Line ${i + 1}: ${line.trim()}`);
          
          // Check if it has style attribute
          if (line.includes('style=')) {
            const styleMatch = line.match(/style="([^"]*)"/);
            if (styleMatch) {
              console.log(`   Style attribute: "${styleMatch[1]}"`);
              if (styleMatch[1].includes('lower-alpha')) {
                console.log('   ❌ PROBLEM: This <ol> has lower-alpha style!');
              }
            }
          }
          break;
        }
      }
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
  }
}

debugListNumbering().catch(console.error);
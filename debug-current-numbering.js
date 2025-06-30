/**
 * Debug Current Numbering Issue
 * Test the exact file to see what's wrong with the list structure
 */

import { readFileSync, writeFileSync } from 'fs';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function debugCurrentNumbering() {
  console.log('🔍 DEBUGGING CURRENT NUMBERING ISSUE');
  console.log('='.repeat(60));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  
  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    const preprocessor = new MadCapPreprocessor();
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    
    // Save the preprocessed HTML for inspection
    writeFileSync('./debug-preprocessed-numbering.html', preprocessedHTML);
    console.log('📁 Saved preprocessed HTML to debug-preprocessed-numbering.html');
    
    const converter = new AsciiDocConverter();
    const result = await converter.convert(preprocessedHTML, {
      format: 'asciidoc',
      inputPath: sourceFile,
      asciidocOptions: { 
        useCollapsibleBlocks: true,
        enableValidation: false 
      }
    });
    
    // Save the full output
    writeFileSync('./debug-current-numbering.adoc', result.content);
    console.log('📁 Saved current AsciiDoc output to debug-current-numbering.adoc');
    
    // Find the problematic section "Connecting Activities to Financial Items"
    const lines = result.content.split('\n');
    let inConnectingSection = false;
    let connectingLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('Connecting Activities to Financial Items')) {
        inConnectingSection = true;
        connectingLines.push(`LINE ${i + 1}: ${line}`);
        continue;
      }
      
      if (inConnectingSection) {
        connectingLines.push(`LINE ${i + 1}: ${line}`);
        
        // Stop at the next collapsible section or end of significant content
        if (line.includes('[%collapsible]') && !line.includes('Connecting Activities')) {
          break;
        }
        
        // Stop after reasonable amount of content
        if (connectingLines.length > 50) {
          break;
        }
      }
    }
    
    console.log('\n📋 CONNECTING ACTIVITIES SECTION:');
    console.log('='.repeat(50));
    connectingLines.forEach(line => {
      if (line.includes('+')) {
        console.log(`${line} <-- CONTINUATION`);
      } else if (line.includes('[loweralpha]')) {
        console.log(`${line} <-- ALPHABETICAL MARKER`);
      } else if (line.match(/LINE \d+: \. /)) {
        console.log(`${line} <-- MAIN ITEM`);
      } else if (line.match(/LINE \d+: \.\. /)) {
        console.log(`${line} <-- SUB ITEM`);
      } else {
        console.log(line);
      }
    });
    
    // Also analyze the HTML structure
    console.log('\n📋 ANALYZING HTML STRUCTURE FOR LISTS:');
    console.log('='.repeat(50));
    
    // Find the collapsible section in HTML
    const connectingMatch = preprocessedHTML.match(/<div[^>]*class="[^"]*collapsible[^"]*"[^>]*[^>]*title="[^"]*Connecting[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (connectingMatch) {
      console.log('✅ Found Connecting Activities section in HTML');
      const sectionHTML = connectingMatch[1];
      
      // Extract the ordered lists
      const olMatches = sectionHTML.match(/<ol[^>]*>([\s\S]*?)<\/ol>/gi);
      if (olMatches) {
        console.log(`📊 Found ${olMatches.length} ordered lists in the section`);
        olMatches.forEach((olHTML, index) => {
          console.log(`\n--- ORDERED LIST ${index + 1} ---`);
          console.log(olHTML.substring(0, 300) + (olHTML.length > 300 ? '...' : ''));
          
          // Check for style attribute
          const styleMatch = olHTML.match(/<ol[^>]*style="([^"]*)"[^>]*>/);
          if (styleMatch) {
            console.log(`📝 Style: ${styleMatch[1]}`);
          }
        });
      }
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
    console.error(error.stack);
  }
}

debugCurrentNumbering().catch(console.error);
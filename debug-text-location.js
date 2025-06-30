/**
 * Debug Text Location
 * Find where "Select Investment Item dialog closes" actually appears
 */

import { readFileSync } from 'fs';

async function debugTextLocation() {
  console.log('🔍 FINDING TEXT LOCATION');
  console.log('='.repeat(40));

  try {
    const finalOutput = readFileSync('./debug-final.adoc', 'utf-8');
    
    // Search for various forms of the text
    const searchPatterns = [
      'Select Investment Item dialog closes',
      'Select Investment Item',
      'dialog closes',
      '_Select Investment Item_',
      'Investment Item'
    ];
    
    console.log('📍 Searching for text patterns in final output:');
    
    searchPatterns.forEach(pattern => {
      const found = finalOutput.includes(pattern);
      console.log(`   "${pattern}": ${found ? '✅' : '❌'}`);
      
      if (found) {
        const lines = finalOutput.split('\n');
        const lineIndex = lines.findIndex(line => line.includes(pattern));
        if (lineIndex >= 0) {
          console.log(`      Found at line ${lineIndex + 1}: "${lines[lineIndex].trim()}"`);
          
          // Show context
          console.log(`      Context:`);
          for (let i = Math.max(0, lineIndex - 2); i <= Math.min(lines.length - 1, lineIndex + 2); i++) {
            const marker = i === lineIndex ? '>>>' : '   ';
            console.log(`      ${marker} ${i + 1}: ${lines[i]}`);
          }
        }
      }
    });
    
    // Check where this text appears in the document structure
    const lines = finalOutput.split('\n');
    const targetLineIndex = lines.findIndex(line => line.includes('Select Investment Item'));
    
    if (targetLineIndex >= 0) {
      console.log(`\n📊 DOCUMENT STRUCTURE ANALYSIS:`);
      console.log(`   Text found at line: ${targetLineIndex + 1}`);
      
      // Look for nearby structural elements
      let inCollapsible = false;
      let inAdmonition = false;
      let currentSection = '';
      
      for (let i = Math.max(0, targetLineIndex - 10); i <= Math.min(lines.length - 1, targetLineIndex + 5); i++) {
        const line = lines[i];
        
        if (line.includes('[%collapsible]')) {
          inCollapsible = true;
          console.log(`   Line ${i + 1}: COLLAPSIBLE BLOCK START`);
        } else if (line.includes('====') && inCollapsible) {
          if (lines[i-1] && lines[i-1].startsWith('.')) {
            console.log(`   Line ${i + 1}: COLLAPSIBLE CONTENT START`);
          } else {
            inCollapsible = false;
            console.log(`   Line ${i + 1}: COLLAPSIBLE BLOCK END`);
          }
        } else if (line.match(/^\[NOTE|TIP|WARNING|CAUTION\]/)) {
          inAdmonition = true;
          console.log(`   Line ${i + 1}: ADMONITION START`);
        } else if (line === '====') {
          inAdmonition = false;
          console.log(`   Line ${i + 1}: ADMONITION END`);
        } else if (line.match(/^=+ /)) {
          currentSection = line;
          console.log(`   Line ${i + 1}: SECTION: ${line}`);
        }
        
        if (i === targetLineIndex) {
          const context = inCollapsible ? 'INSIDE COLLAPSIBLE BLOCK' : 
                         inAdmonition ? 'INSIDE ADMONITION' : 'REGULAR CONTENT';
          console.log(`   Line ${i + 1}: TARGET TEXT (${context}): ${line}`);
        }
      }
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
  }
}

debugTextLocation().catch(console.error);
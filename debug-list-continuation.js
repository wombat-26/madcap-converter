/**
 * Debug List Continuation
 * Check why sub-lists aren't properly nested with continuation markers
 */

import { readFileSync } from 'fs';

async function debugListContinuation() {
  console.log('🔍 DEBUGGING LIST CONTINUATION ISSUE');
  console.log('='.repeat(50));

  try {
    // Check the current output
    const output = readFileSync('./FINAL-LIST-FIX.adoc', 'utf-8');
    const lines = output.split('\n');
    
    // Find the problematic section
    const startIndex = lines.findIndex(line => 
      line.includes('On the activity where you want to connect investments'));
    
    if (startIndex >= 0) {
      console.log('📋 CURRENT OUTPUT STRUCTURE:');
      
      for (let i = startIndex - 2; i < Math.min(startIndex + 10, lines.length); i++) {
        const line = lines[i];
        const lineNum = `${i + 1}`.padStart(3, ' ');
        
        // Highlight structural elements
        if (line === '+') {
          console.log(`${lineNum}: ${line} <-- CONTINUATION MARKER`);
        } else if (line === '[loweralpha]') {
          console.log(`${lineNum}: ${line} <-- ALPHABETICAL LIST MARKER`);
        } else if (line.match(/^\. /)) {
          console.log(`${lineNum}: ${line.substring(0, 60)}... <-- MAIN ITEM`);
        } else if (line.match(/^\.\. /)) {
          console.log(`${lineNum}: ${line.substring(0, 60)}... <-- SUB ITEM`);
        } else {
          console.log(`${lineNum}: ${line.substring(0, 60)}...`);
        }
      }
      
      console.log('\n❌ PROBLEM IDENTIFIED:');
      console.log('   No continuation marker (+) between main item and [loweralpha]');
      console.log('   This causes sub-list to appear at same level as main list');
      
      console.log('\n✅ CORRECT STRUCTURE SHOULD BE:');
      console.log('   . Main list item');
      console.log('   +                    <-- CONTINUATION MARKER NEEDED HERE');
      console.log('   [loweralpha]');
      console.log('   .. Sub item a');
      console.log('   .. Sub item b');
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
  }
}

debugListContinuation().catch(console.error);
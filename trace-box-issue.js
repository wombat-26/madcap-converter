/**
 * Trace Box Issue
 * Find exactly where "Select Investment Item dialog closes" is being wrapped in a block
 */

import { readFileSync } from 'fs';

async function traceBoxIssue() {
  console.log('🔍 TRACING BOX ISSUE');
  console.log('='.repeat(40));

  try {
    const output = readFileSync('./fresh-conversion.adoc', 'utf-8');
    const lines = output.split('\n');
    
    // Find the problematic text
    const targetText = 'Select Investment Item';
    const dialogText = 'dialog closes';
    
    console.log('📍 Finding problematic text:');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes(dialogText)) {
        console.log(`\n🎯 FOUND AT LINE ${i + 1}: "${line}"`);
        
        // Show context - 10 lines before and after
        console.log('\n📋 CONTEXT:');
        for (let j = Math.max(0, i - 10); j <= Math.min(lines.length - 1, i + 10); j++) {
          const marker = j === i ? '>>> ' : '    ';
          const lineContent = lines[j];
          
          // Highlight structural elements
          let lineType = '';
          if (lineContent.includes('[%collapsible]')) lineType = ' [COLLAPSIBLE START]';
          else if (lineContent.match(/^\[NOTE|TIP|WARNING|CAUTION\]/)) lineType = ' [ADMONITION START]';
          else if (lineContent === '====') lineType = ' [BLOCK DELIMITER]';
          else if (lineContent.startsWith('.') && lines[j-1] && lines[j-1].includes('[%collapsible]')) lineType = ' [COLLAPSIBLE TITLE]';
          else if (lineContent.startsWith('.. ')) lineType = ' [LIST ITEM]';
          else if (lineContent === '+') lineType = ' [CONTINUATION]';
          else if (lineContent.match(/^=+ /)) lineType = ' [HEADING]';
          
          console.log(`${marker}${j + 1}: ${lineContent}${lineType}`);
        }
        break;
      }
    }
    
    // Analyze the structure around this text
    const dialogLineIndex = lines.findIndex(line => line.includes(dialogText));
    
    if (dialogLineIndex >= 0) {
      console.log('\n🔍 STRUCTURE ANALYSIS:');
      
      // Look backwards to find what block structure this is in
      let blockType = 'NONE';
      let blockStart = -1;
      
      for (let i = dialogLineIndex - 1; i >= Math.max(0, dialogLineIndex - 20); i--) {
        const line = lines[i];
        
        if (line.includes('[%collapsible]')) {
          blockType = 'COLLAPSIBLE';
          blockStart = i;
          break;
        }
        if (line.match(/^\[NOTE|TIP|WARNING|CAUTION\]/)) {
          blockType = 'ADMONITION';
          blockStart = i;
          break;
        }
        if (line === '====') {
          // Check what this starts
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            if (lines[j].includes('[%collapsible]')) {
              blockType = 'COLLAPSIBLE';
              blockStart = j;
              break;
            }
            if (lines[j].match(/^\[NOTE|TIP|WARNING|CAUTION\]/)) {
              blockType = 'ADMONITION';
              blockStart = j;
              break;
            }
          }
          break;
        }
      }
      
      console.log(`   Block type: ${blockType}`);
      console.log(`   Block starts at line: ${blockStart + 1}`);
      
      if (blockStart >= 0) {
        console.log(`   Block start content: "${lines[blockStart]}"`);
        if (lines[blockStart + 1]) console.log(`   Next line: "${lines[blockStart + 1]}"`);
        if (lines[blockStart + 2]) console.log(`   Line after: "${lines[blockStart + 2]}"`);
      }
      
      // This confirms the issue - the text should NOT be in any block
      if (blockType !== 'NONE') {
        console.log(`\n❌ CONFIRMED ISSUE: Text is inside ${blockType} block`);
        console.log(`   This text should be regular paragraph content, not in any block structure`);
        
        // Find which collapsible block it's in
        if (blockType === 'COLLAPSIBLE') {
          const titleLine = blockStart + 1;
          if (lines[titleLine] && lines[titleLine].startsWith('.')) {
            const title = lines[titleLine].substring(1);
            console.log(`   Inside collapsible block: "${title}"`);
          }
        }
      } else {
        console.log(`\n✅ Text appears to be in regular content (but rendering shows otherwise)`);
        console.log(`   This suggests an issue with block boundaries or continuation markers`);
      }
    }

  } catch (error) {
    console.error(`❌ Trace failed: ${error.message}`);
  }
}

traceBoxIssue().catch(console.error);
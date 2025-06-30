/**
 * Ultra Validation Final
 * Comprehensive validation that conversion is working correctly
 */

import { readFileSync } from 'fs';

async function ultraValidationFinal() {
  console.log('🎯 ULTRA VALIDATION FINAL');
  console.log('='.repeat(50));

  try {
    const output = readFileSync('./fresh-conversion.adoc', 'utf-8');
    
    console.log('📊 COMPREHENSIVE ANALYSIS');
    console.log('='.repeat(30));
    
    // 1. Count main list items
    const mainItems = output.match(/^. /gm) || [];
    console.log(`✅ Main list items: ${mainItems.length}`);
    
    // 2. Count collapsible blocks
    const collapsible = output.match(/\[%collapsible\]/g) || [];
    console.log(`✅ Collapsible blocks: ${collapsible.length}`);
    
    // 3. Check target text
    const hasDialogCloses = output.includes('dialog closes');
    console.log(`✅ "dialog closes" text: ${hasDialogCloses ? 'PRESENT' : 'MISSING'}`);
    
    // 4. Check text is NOT in admonition
    const lines = output.split('\n');
    const dialogLine = lines.findIndex(line => line.includes('dialog closes'));
    
    if (dialogLine >= 0) {
      // Check if it's inside admonition blocks
      let inAdmonition = false;
      let inCollapsible = false;
      
      for (let i = dialogLine - 1; i >= Math.max(0, dialogLine - 15); i--) {
        const line = lines[i];
        if (line.match(/^\[NOTE|TIP|WARNING|CAUTION\]/)) {
          inAdmonition = true;
          break;
        }
        if (line.includes('[%collapsible]')) {
          inCollapsible = true;
          break;
        }
        if (line === '====') {
          // Check what this closes
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            if (lines[j].match(/^\[NOTE|TIP|WARNING|CAUTION\]/)) {
              inAdmonition = true;
              break;
            }
            if (lines[j].includes('[%collapsible]') || lines[j].startsWith('.')) {
              inCollapsible = true;
              break;
            }
          }
          break;
        }
      }
      
      console.log(`✅ Text placement: ${inAdmonition ? '❌ IN ADMONITION' : inCollapsible ? 'IN COLLAPSIBLE' : '✅ REGULAR CONTENT'}`);
    }
    
    // 5. List structure analysis
    console.log('\n📋 LIST STRUCTURE VERIFICATION:');
    const listItemsDetailed = lines.filter(line => line.match(/^. /));
    listItemsDetailed.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.substring(0, 60)}...`);
    });
    
    // 6. Collapsible block titles
    console.log('\n📋 COLLAPSIBLE BLOCK TITLES:');
    const collapsibleTitles = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('[%collapsible]') && lines[i + 1] && lines[i + 1].startsWith('.')) {
        collapsibleTitles.push(lines[i + 1].substring(1));
      }
    }
    collapsibleTitles.forEach((title, index) => {
      console.log(`   ${index + 1}. "${title}"`);
    });
    
    // 7. Overall quality score
    console.log('\n📊 QUALITY SCORE:');
    let score = 0;
    let maxScore = 0;
    
    // Main list items (expected 8)
    maxScore += 10;
    if (mainItems.length >= 8) score += 10;
    else score += Math.round((mainItems.length / 8) * 10);
    console.log(`   Main list completeness: ${Math.round((mainItems.length / 8) * 100)}% (${mainItems.length}/8)`);
    
    // Collapsible blocks (expected 3)
    maxScore += 10;
    if (collapsible.length >= 3) score += 10;
    else score += Math.round((collapsible.length / 3) * 10);
    console.log(`   Dropdown conversion: ${Math.round((collapsible.length / 3) * 100)}% (${collapsible.length}/3)`);
    
    // Content preservation
    maxScore += 10;
    if (hasDialogCloses) score += 10;
    console.log(`   Content preservation: ${hasDialogCloses ? '100%' : '0%'}`);
    
    // Text placement
    maxScore += 10;
    if (hasDialogCloses && !inAdmonition) score += 10;
    console.log(`   Correct text placement: ${hasDialogCloses && !inAdmonition ? '100%' : '0%'}`);
    
    const totalScore = Math.round((score / maxScore) * 100);
    console.log(`\n🎯 TOTAL QUALITY SCORE: ${totalScore}%`);
    
    if (totalScore >= 95) {
      console.log('🎉 EXCELLENT: Conversion is working perfectly!');
      console.log('📝 NOTE: AsciiDoc dots (.) render as numbers (1., 2., 3.) in final output');
    } else if (totalScore >= 80) {
      console.log('✅ GOOD: Minor issues remaining');
    } else {
      console.log('❌ NEEDS WORK: Significant issues found');
    }

  } catch (error) {
    console.error(`❌ Validation failed: ${error.message}`);
  }
}

ultraValidationFinal().catch(console.error);
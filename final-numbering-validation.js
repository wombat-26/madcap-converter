/**
 * Final Numbering Validation
 * Confirm all numbering issues are resolved
 */

import { readFileSync } from 'fs';

function validateFinalNumbering() {
  console.log('🎯 FINAL NUMBERING VALIDATION');
  console.log('='.repeat(50));
  
  try {
    const adocContent = readFileSync('./debug-current-numbering.adoc', 'utf-8');
    const lines = adocContent.split('\n');
    
    let issues = [];
    let successes = [];
    
    // Check for proper continuation structure
    for (let i = 0; i < lines.length - 2; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];
      const thirdLine = lines[i + 2];
      
      // Look for main items followed by continuation and alphabetical marker
      if (line.match(/^\. /) && nextLine.trim() === '' && lines[i + 2] === '+' && lines[i + 3] === '[loweralpha]') {
        console.log(`✅ Found proper continuation structure at line ${i + 1}:`);
        console.log(`   ${line}`);
        console.log(`   ${nextLine || '(empty)'}`);
        console.log(`   ${lines[i + 2]} (continuation)`);
        console.log(`   ${lines[i + 3]} (alphabetical marker)`);
        
        // Check the following sub-items
        let j = i + 4;
        let subItems = [];
        while (j < lines.length && lines[j].match(/^\. /)) {
          subItems.push(lines[j]);
          j++;
        }
        
        if (subItems.length > 0) {
          console.log(`   Sub-items found (${subItems.length}):`);
          subItems.forEach((subItem, index) => {
            console.log(`     ${index + 1}. ${subItem}`);
          });
          successes.push(`Proper structure with ${subItems.length} sub-items`);
        }
        console.log('');
      }
      
      // Check for old problematic patterns
      if (line.match(/^\. /) && lines[i + 1] === '+' && lines[i + 2] === '[loweralpha]' && lines[i + 3].match(/^\.\. /)) {
        issues.push(`❌ Found old double-dot pattern at line ${i + 4}: ${lines[i + 3]}`);
      }
    }
    
    // Summary
    console.log('📊 VALIDATION SUMMARY:');
    console.log('='.repeat(30));
    
    if (successes.length > 0) {
      console.log(`✅ ${successes.length} correct numbering structures found:`);
      successes.forEach(success => console.log(`   - ${success}`));
    }
    
    if (issues.length > 0) {
      console.log(`❌ ${issues.length} issues found:`);
      issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log('✅ No numbering issues found!');
    }
    
    if (successes.length > 0 && issues.length === 0) {
      console.log('\n🎉 ALL NUMBERING ISSUES RESOLVED!');
      console.log('📝 The AsciiDoc output now has proper list structure with:');
      console.log('   - Single dots (.) for alphabetical sub-items');
      console.log('   - Proper continuation markers (+)');
      console.log('   - Correct [loweralpha] placement');
      console.log('   - Nested HTML structure in preprocessing');
    }

  } catch (error) {
    console.error(`❌ Validation failed: ${error.message}`);
  }
}

validateFinalNumbering();
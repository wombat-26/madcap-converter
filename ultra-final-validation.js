/**
 * Ultra Final Validation
 * Comprehensive meticulous testing to verify all issues are resolved
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function ultraFinalValidation() {
  console.log('🎯 ULTRA FINAL VALIDATION');
  console.log('='.repeat(60));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const converter = new AsciiDocConverter();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    
    console.log('📊 FINAL CONVERSION TEST');
    console.log('-'.repeat(30));
    
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    const result = await converter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });
    
    // Save the FINAL output
    writeFileSync('./FINAL-FIXED-OUTPUT.adoc', result.content);
    console.log('📁 Final output saved to: FINAL-FIXED-OUTPUT.adoc');
    
    // COMPREHENSIVE TESTING
    console.log('\n🔍 COMPREHENSIVE ISSUE VERIFICATION:');
    console.log('='.repeat(40));
    
    // 1. Check main issue: "Select Investment Item dialog closes" placement
    const dialogText = 'Select Investment Item.*dialog closes';
    const dialogMatch = result.content.match(new RegExp(dialogText));
    const lines = result.content.split('\n');
    let hasContinuation = false;
    let inBlock = false;
    
    if (dialogMatch) {
      const dialogLineIndex = lines.findIndex(line => line.match(new RegExp(dialogText)));
      const prevLine = lines[dialogLineIndex - 1] || '';
      hasContinuation = prevLine.trim() === '+';
      
      console.log(`✅ 1. CRITICAL TEXT FOUND: Line ${dialogLineIndex + 1}`);
      console.log(`   Content: "${lines[dialogLineIndex].substring(0, 80)}..."`);
      console.log(`   Previous line: "${prevLine}"`);
      console.log(`   Has continuation (+): ${hasContinuation ? '❌ FAILED' : '✅ FIXED'}`);
      
      // Check if it's in any block structure
      let blockType = '';
      
      for (let i = dialogLineIndex - 1; i >= Math.max(0, dialogLineIndex - 10); i--) {
        const line = lines[i];
        if (line.includes('[%collapsible]')) {
          inBlock = true;
          blockType = 'COLLAPSIBLE';
          break;
        }
        if (line.match(/^\[NOTE|TIP|WARNING|CAUTION\]/)) {
          inBlock = true;
          blockType = 'ADMONITION';
          break;
        }
        if (line === '====') {
          // Check what this delimiter is for
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            if (lines[j].includes('[%collapsible]')) {
              inBlock = true;
              blockType = 'COLLAPSIBLE';
              break;
            }
            if (lines[j].match(/^\[NOTE|TIP|WARNING|CAUTION\]/)) {
              inBlock = true;
              blockType = 'ADMONITION';
              break;
            }
          }
          break;
        }
      }
      
      console.log(`   Text placement: ${inBlock ? '❌ IN ' + blockType + ' BLOCK' : '✅ REGULAR CONTENT'}`);
    } else {
      console.log(`❌ 1. CRITICAL TEXT MISSING: "Select Investment Item dialog closes" not found`);
    }
    
    // 2. Check collapsible blocks (dropdowns)
    const collapsibleBlocks = result.content.match(/\[%collapsible\]/g) || [];
    console.log(`\n✅ 2. COLLAPSIBLE BLOCKS: ${collapsibleBlocks.length}/3 expected`);
    
    // Find titles
    const collapsibleTitles = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('[%collapsible]') && lines[i + 1] && lines[i + 1].startsWith('.')) {
        collapsibleTitles.push(lines[i + 1].substring(1));
      }
    }
    collapsibleTitles.forEach((title, index) => {
      console.log(`   ${index + 1}. "${title}"`);
    });
    
    // 3. Check main list structure
    const mainSteps = result.content.match(/^\\. /gm) || [];
    console.log(`\n✅ 3. MAIN LIST STEPS: ${mainSteps.length} found`);
    
    // Show the steps
    const stepLines = lines.filter(line => line.match(/^\\. /));
    stepLines.slice(0, 5).forEach((step, index) => {
      console.log(`   ${index + 1}. ${step.substring(0, 60)}...`);
    });
    if (stepLines.length > 5) {
      console.log(`   ... and ${stepLines.length - 5} more steps`);
    }
    
    // 4. Check for orphaned continuation markers
    const orphanedMarkers = result.content.match(/\\n\\+\\n/g) || [];
    console.log(`\n✅ 4. ORPHANED CONTINUATION MARKERS: ${orphanedMarkers.length}`);
    if (orphanedMarkers.length > 0) {
      console.log(`   ❌ Found ${orphanedMarkers.length} orphaned + markers (should be 0)`);
    }
    
    // 5. Check alphabetical list markers
    const lowerAlphaMarkers = result.content.match(/\\[loweralpha\\]/g) || [];
    console.log(`\n✅ 5. ALPHABETICAL LIST MARKERS: ${lowerAlphaMarkers.length} found`);
    
    // OVERALL SCORE
    console.log('\n🎯 FINAL QUALITY ASSESSMENT:');
    console.log('='.repeat(40));
    
    let score = 0;
    let maxScore = 0;
    
    // Critical issue fixed  
    maxScore += 40;
    const textFixed = dialogMatch && !hasContinuation && !inBlock;
    if (textFixed) {
      score += 40;
      console.log(`✅ Critical Issue (Dialog Text): FIXED (40/40 points)`);
    } else {
      console.log(`❌ Critical Issue (Dialog Text): NOT FIXED (0/40 points)`);
    }
    
    // Collapsible blocks
    maxScore += 20;
    if (collapsibleBlocks.length >= 3) {
      score += 20;
      console.log(`✅ Collapsible Blocks: PERFECT (20/20 points)`);
    } else {
      const partial = Math.round((collapsibleBlocks.length / 3) * 20);
      score += partial;
      console.log(`⚠️ Collapsible Blocks: PARTIAL (${partial}/20 points)`);
    }
    
    // List structure
    maxScore += 20;
    if (mainSteps.length >= 8) {
      score += 20;
      console.log(`✅ List Structure: EXCELLENT (20/20 points)`);
    } else {
      const partial = Math.round((mainSteps.length / 8) * 20);
      score += partial;
      console.log(`⚠️ List Structure: PARTIAL (${partial}/20 points)`);
    }
    
    // Clean formatting
    maxScore += 20;
    if (orphanedMarkers.length === 0) {
      score += 20;
      console.log(`✅ Clean Formatting: PERFECT (20/20 points)`);
    } else {
      score += Math.max(0, 20 - orphanedMarkers.length * 5);
      console.log(`⚠️ Clean Formatting: ISSUES (${Math.max(0, 20 - orphanedMarkers.length * 5)}/20 points)`);
    }
    
    const finalScore = Math.round((score / maxScore) * 100);
    console.log(`\n🏆 FINAL SCORE: ${finalScore}%`);
    
    if (finalScore >= 95) {
      console.log('🎉 EXCELLENT: All issues resolved! Conversion is perfect!');
      console.log('📝 The text should now appear as regular paragraph content.');
    } else if (finalScore >= 80) {
      console.log('✅ GOOD: Major issues resolved, minor issues remain.');
    } else {
      console.log('❌ NEEDS MORE WORK: Significant issues still present.');
    }

  } catch (error) {
    console.error(`❌ Validation failed: ${error.message}`);
    console.error(error.stack);
  }
}

ultraFinalValidation().catch(console.error);
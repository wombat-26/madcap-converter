/**
 * Debug Missing Content
 * Track where content is being lost in the conversion pipeline
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function debugMissingContent() {
  console.log('🔍 DEBUGGING MISSING CONTENT');
  console.log('='.repeat(50));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const asciidocConverter = new AsciiDocConverter();

  try {
    // Step 1: Check source
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    const targetText = 'Select Investment Item</i> dialog closes';
    
    console.log('📋 STEP 1: Source HTML Analysis');
    console.log(`   Source size: ${sourceHTML.length} characters`);
    console.log(`   Contains target text: ${sourceHTML.includes(targetText) ? '✅' : '❌'}`);
    
    if (sourceHTML.includes(targetText)) {
      const lines = sourceHTML.split('\n');
      const targetLineIndex = lines.findIndex(line => line.includes(targetText));
      console.log(`   Found at line: ${targetLineIndex + 1}`);
      console.log(`   Context: "${lines[targetLineIndex].trim()}"`);
    }

    // Count dropdowns in source
    const sourceDropdowns = (sourceHTML.match(/MadCap:dropDown/g) || []).length;
    console.log(`   MadCap dropdowns in source: ${sourceDropdowns}`);

    // Step 2: Check after preprocessing
    console.log('\n📋 STEP 2: After MadCap Preprocessing');
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    console.log(`   Preprocessed size: ${preprocessedHTML.length} characters`);
    console.log(`   Contains target text: ${preprocessedHTML.includes(targetText) ? '✅' : '❌'}`);
    
    if (preprocessedHTML.includes(targetText)) {
      const lines = preprocessedHTML.split('\n');
      const targetLineIndex = lines.findIndex(line => line.includes(targetText));
      console.log(`   Found at line: ${targetLineIndex + 1}`);
      console.log(`   Context: "${lines[targetLineIndex].trim()}"`);
    }

    // Count dropdowns after preprocessing
    const preprocessedDropdowns = (preprocessedHTML.match(/MadCap:dropDown/g) || []).length;
    console.log(`   MadCap dropdowns after preprocessing: ${preprocessedDropdowns}`);
    console.log(`   Dropdown preservation: ${Math.round(preprocessedDropdowns/sourceDropdowns*100)}%`);

    // Step 3: Check after conversion
    console.log('\n📋 STEP 3: After AsciiDoc Conversion');
    const result = await asciidocConverter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });
    
    console.log(`   Final size: ${result.content.length} characters`);
    console.log(`   Contains target text: ${result.content.includes(targetText) ? '✅' : '❌'}`);
    
    // Check for similar text that might indicate transformation
    const similarTexts = [
      'dialog closes',
      'Investment Item',
      'dialog is displayed',
      'Investment Item dialog',
      'Select Investment'
    ];
    
    console.log('\n🔍 Searching for similar text patterns:');
    similarTexts.forEach(text => {
      const found = result.content.includes(text);
      console.log(`   "${text}": ${found ? '✅' : '❌'}`);
    });

    // Count collapsible blocks in output
    const outputCollapsible = (result.content.match(/\\[%collapsible\\]/g) || []).length;
    console.log(`   Collapsible blocks in output: ${outputCollapsible}`);

    // Find where content might be getting lost
    console.log('\n📊 CONTENT LOSS ANALYSIS:');
    
    if (sourceHTML.includes(targetText) && !preprocessedHTML.includes(targetText)) {
      console.log('❌ CONTENT LOST DURING PREPROCESSING');
      console.log('   Issue: MadCap preprocessor is removing or corrupting content');
    } else if (preprocessedHTML.includes(targetText) && !result.content.includes(targetText)) {
      console.log('❌ CONTENT LOST DURING CONVERSION');
      console.log('   Issue: AsciiDoc converter is removing or corrupting content');
    } else if (!sourceHTML.includes(targetText)) {
      console.log('❌ CONTENT NOT IN SOURCE');
      console.log('   Issue: Text not found in original file');
    } else {
      console.log('✅ CONTENT PRESERVED BUT TRANSFORMED');
      console.log('   Issue: Text might be modified during conversion');
    }

    // Dropdown analysis
    console.log('\n📊 DROPDOWN CONVERSION ANALYSIS:');
    console.log(`   Source dropdowns: ${sourceDropdowns}`);
    console.log(`   After preprocessing: ${preprocessedDropdowns} (${Math.round(preprocessedDropdowns/sourceDropdowns*100)}%)`);
    console.log(`   Final collapsible blocks: ${outputCollapsible} (${Math.round(outputCollapsible/sourceDropdowns*100)}%)`);
    
    if (preprocessedDropdowns < sourceDropdowns) {
      console.log('❌ DROPDOWNS LOST DURING PREPROCESSING');
    } else if (outputCollapsible < preprocessedDropdowns) {
      console.log('❌ DROPDOWNS LOST DURING CONVERSION');
    }

    // Save debug outputs
    writeFileSync('./debug-preprocessed.html', preprocessedHTML);
    writeFileSync('./debug-final.adoc', result.content);
    console.log('\n📁 Debug files saved:');
    console.log('   ./debug-preprocessed.html - After preprocessing');
    console.log('   ./debug-final.adoc - Final output');

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
  }
}

debugMissingContent().catch(console.error);
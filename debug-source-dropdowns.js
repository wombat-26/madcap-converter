/**
 * Debug Source HTML Dropdowns
 * Find where the 24 dropdowns are in source and why only 3 survive preprocessing
 */

import { readFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function debugSourceDropdowns() {
  console.log('🔍 DEBUGGING SOURCE DROPDOWNS');
  console.log('='.repeat(50));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    
    console.log('📊 ANALYZING SOURCE HTML');
    console.log(`   Source size: ${sourceHTML.length} characters`);
    
    // Find all MadCap dropdown elements
    const madcapDropdowns = [...sourceHTML.matchAll(/MadCap:dropDown/g)];
    console.log(`   MadCap:dropDown elements: ${madcapDropdowns.length}`);
    
    // Find dropdown bodies and heads
    const dropDownBodies = [...sourceHTML.matchAll(/MadCap:dropDownBody/g)];
    const dropDownHeads = [...sourceHTML.matchAll(/MadCap:dropDownHead/g)];
    
    console.log(`   MadCap:dropDownBody elements: ${dropDownBodies.length}`);
    console.log(`   MadCap:dropDownHead elements: ${dropDownHeads.length}`);
    
    // Find actual dropdown tags with attributes
    const dropdownTagRegex = /<MadCap:dropDown[^>]*>/g;
    const dropdownTags = [...sourceHTML.matchAll(dropdownTagRegex)];
    
    console.log(`\n📋 MadCap Dropdown Tags Found:`);
    dropdownTags.forEach((match, index) => {
      console.log(`   ${index + 1}. ${match[0]}`);
    });
    
    // Find dropdown heads with titles
    const dropdownHeadRegex = /<MadCap:dropDownHead[^>]*>(.*?)<\/MadCap:dropDownHead>/gs;
    const dropdownHeads = [...sourceHTML.matchAll(dropdownHeadRegex)];
    
    console.log(`\n📋 Dropdown Heads with Titles:`);
    dropdownHeads.forEach((match, index) => {
      const title = match[1].replace(/<[^>]*>/g, '').trim(); // Strip HTML tags
      console.log(`   ${index + 1}. "${title}"`);
    });
    
    // Test preprocessing step by step
    console.log('\n🔧 TESTING PREPROCESSING');
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    
    // Check what survives preprocessing
    const survivingDropdowns = [...preprocessedHTML.matchAll(/madcap-dropdown/g)];
    console.log(`   Surviving dropdown elements: ${survivingDropdowns.length}`);
    
    // Find the specific surviving titles
    const survivingTitles = [...preprocessedHTML.matchAll(/data-title="([^"]*)"/g)];
    console.log(`\n📍 Surviving dropdown titles:`);
    survivingTitles.forEach((match, index) => {
      console.log(`   ${index + 1}. "${match[1]}"`);
    });
    
    // Calculate loss
    const totalDropdowns = dropdownHeads.length;
    const surviving = survivingTitles.length;
    const lost = totalDropdowns - surviving;
    
    console.log(`\n📊 DROPOUT ANALYSIS:`);
    console.log(`   Original dropdowns: ${totalDropdowns}`);
    console.log(`   Surviving after preprocessing: ${surviving}`);
    console.log(`   Lost during preprocessing: ${lost} (${Math.round(lost/totalDropdowns*100)}%)`);
    
    if (lost > 0) {
      console.log(`\n❌ ${lost} dropdowns are being lost during MadCap preprocessing!`);
      console.log(`   This explains why only ${surviving} reach the AsciiDoc converter.`);
      console.log(`   The AsciiDoc converter is working correctly - the issue is in preprocessing.`);
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
    console.error(error.stack);
  }
}

debugSourceDropdowns().catch(console.error);
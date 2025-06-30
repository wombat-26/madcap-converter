/**
 * Simple Debug for Collapsible Block Detection
 * Use regex to analyze preprocessed HTML
 */

import { readFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function debugSimpleCollapsible() {
  console.log('🔍 SIMPLE COLLAPSIBLE DEBUG');
  console.log('='.repeat(40));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    
    console.log('📊 ANALYZING PREPROCESSED HTML WITH REGEX');
    
    // Find all div elements with collapsible-block class
    const collapsibleRegex = /<div[^>]*class="[^"]*collapsible-block[^"]*"[^>]*data-title="([^"]*)"[^>]*>/g;
    const matches = [...preprocessedHTML.matchAll(collapsibleRegex)];
    
    console.log(`✅ Found ${matches.length} collapsible block divs:`);
    matches.forEach((match, index) => {
      console.log(`   ${index + 1}. Title: "${match[1]}"`);
      console.log(`      HTML: ${match[0].substring(0, 80)}...`);
    });
    
    // Also check for any madcap-dropdown that might not have collapsible-block
    const dropdownRegex = /<div[^>]*class="[^"]*madcap-dropdown[^"]*"[^>]*>/g;
    const dropdownMatches = [...preprocessedHTML.matchAll(dropdownRegex)];
    
    console.log(`\n📊 Found ${dropdownMatches.length} madcap-dropdown divs total`);
    
    // Test conversion
    console.log('\n🔧 TESTING CONVERSION');
    const converter = new AsciiDocConverter();
    
    const options = {
      format: 'asciidoc',
      asciidocOptions: { 
        useCollapsibleBlocks: true
      }
    };
    
    console.log('Conversion options:', JSON.stringify(options, null, 2));
    
    const result = await converter.convert(preprocessedHTML, options);
    
    // Count output
    const outputCollapsible = (result.content.match(/\[%collapsible\]/g) || []).length;
    
    console.log(`\n📊 RESULTS:`);
    console.log(`   Preprocessed collapsible divs: ${matches.length}`);
    console.log(`   Output collapsible blocks: ${outputCollapsible}`);
    console.log(`   Conversion rate: ${Math.round(outputCollapsible/matches.length*100)}%`);
    
    if (outputCollapsible < matches.length) {
      console.log(`\n❌ MISSING: ${matches.length - outputCollapsible} collapsible blocks lost!`);
      
      // Find the specific collapsible titles in output
      const titleRegex = /\[%collapsible\]\n\.([^\n]+)/g;
      const outputTitles = [...result.content.matchAll(titleRegex)].map(m => m[1]);
      
      console.log('\n📍 Titles found in output:');
      outputTitles.forEach((title, index) => {
        console.log(`   ${index + 1}. "${title}"`);
      });
      
      console.log('\n📍 Expected titles from preprocessed:');
      matches.forEach((match, index) => {
        const found = outputTitles.includes(match[1]);
        console.log(`   ${index + 1}. "${match[1]}" ${found ? '✅' : '❌'}`);
      });
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
    console.error(error.stack);
  }
}

debugSimpleCollapsible().catch(console.error);
/**
 * Debug Collapsible Block Detection
 * Trace why only 3/24 dropdowns are being converted
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import * as cheerio from 'cheerio';

async function debugCollapsibleDetection() {
  console.log('🔍 DEBUGGING COLLAPSIBLE BLOCK DETECTION');
  console.log('='.repeat(50));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    
    // Parse preprocessed HTML with Cheerio to analyze div elements
    const $ = cheerio.load(preprocessedHTML);
    
    console.log('📊 ANALYZING DIV ELEMENTS IN PREPROCESSED HTML');
    
    let collapsibleCount = 0;
    let totalDivs = 0;
    
    $('div').each((index, element) => {
      totalDivs++;
      const $el = $(element);
      const className = $el.attr('class') || '';
      const dataTitle = $el.attr('data-title') || '';
      
      if (className.includes('collapsible-block')) {
        collapsibleCount++;
        console.log(`✅ Collapsible div #${collapsibleCount}:`);
        console.log(`   Class: "${className}"`);
        console.log(`   Title: "${dataTitle}"`);
        console.log(`   HTML: ${$el.toString().substring(0, 100)}...`);
      } else if (className.includes('madcap-dropdown')) {
        console.log(`❓ MadCap dropdown without collapsible-block:`);
        console.log(`   Class: "${className}"`);
        console.log(`   Title: "${dataTitle}"`);
      }
    });
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total divs: ${totalDivs}`);
    console.log(`   Collapsible-block divs: ${collapsibleCount}`);
    
    // Now test the actual conversion with detailed options logging
    console.log('\n🔧 TESTING ASCIIDOC CONVERSION WITH DEBUG');
    
    // Create a custom converter that logs the collapsible detection
    const converter = new AsciiDocConverter();
    
    const options = {
      format: 'asciidoc',
      asciidocOptions: { 
        useCollapsibleBlocks: true,
        debug: true  // Add debug flag
      }
    };
    
    console.log(`📋 Conversion options:`, JSON.stringify(options, null, 2));
    
    const result = await converter.convert(preprocessedHTML, options);
    
    // Count collapsible blocks in output
    const outputCollapsible = (result.content.match(/\[%collapsible\]/g) || []).length;
    console.log(`\n📊 Final Results:`);
    console.log(`   Expected collapsible blocks: ${collapsibleCount}`);
    console.log(`   Actual collapsible blocks: ${outputCollapsible}`);
    console.log(`   Conversion rate: ${Math.round(outputCollapsible/collapsibleCount*100)}%`);
    
    if (outputCollapsible < collapsibleCount) {
      console.log(`\n❌ ${collapsibleCount - outputCollapsible} dropdowns were lost during conversion!`);
      
      // Find specific lines with collapsible blocks in output
      const outputLines = result.content.split('\n');
      const collapsibleLines = outputLines
        .map((line, index) => ({ line, index: index + 1 }))
        .filter(({ line }) => line.includes('[%collapsible]'));
      
      console.log('\n📍 Collapsible blocks found in output:');
      collapsibleLines.forEach(({ line, index }) => {
        console.log(`   Line ${index}: ${line}`);
      });
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
    console.error(error.stack);
  }
}

debugCollapsibleDetection().catch(console.error);
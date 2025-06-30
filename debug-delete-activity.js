#!/usr/bin/env node

import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';
import { readFileSync } from 'fs';

console.log('=== DEBUGGING DELETE ACTIVITY CONVERSION ===\n');

const testFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-08 DeleteActivity.htm';
const htmlContent = readFileSync(testFile, 'utf8');

console.log('=== SOURCE HTML STRUCTURE ===');
console.log('Lines 7-28 (warning div + ordered list):');
const lines = htmlContent.split('\n');
lines.slice(6, 28).forEach((line, i) => {
  console.log(`${i + 7}: ${line}`);
});

const converter = new WritersideMarkdownConverter();

async function testConversion() {
  try {
    const options = {
      format: 'writerside-markdown',
      inputType: 'madcap',
      inputPath: testFile
    };
    
    const result = await converter.convert(htmlContent, options);
    
    console.log('\n=== FULL CONVERSION OUTPUT ===');
    console.log(result.content);
    
    console.log('\n=== ANALYSIS ===');
    
    // Check if the warning admonition is correct
    const warningMatch = result.content.match(/>.*?\*\*Attention!.*?\*\*.*?{style="warning"}/s);
    if (warningMatch) {
      console.log('✅ Warning admonition found and formatted correctly');
    } else {
      console.log('❌ Warning admonition not found or malformed');
    }
    
    // Check if list items are present
    const listMatches = result.content.match(/^\d+\./gm) || [];
    console.log(`📝 Found ${listMatches.length} numbered list items`);
    
    if (listMatches.length < 4) {
      console.log('❌ Missing list items! Expected 4, found ' + listMatches.length);
      
      // Check if first list item got absorbed into admonition
      if (result.content.includes('In the side navigation, click') && 
          !result.content.match(/^1\.\s+In the side navigation/m)) {
        console.log('🔍 First list item may be absorbed into admonition');
      }
    } else {
      console.log('✅ All list items appear to be present');
    }
    
    // Check for orphaned paragraphs
    const orphanedMatches = [
      'The activity\'s Details panel is displayed',
      'A security prompt is displayed'
    ];
    
    orphanedMatches.forEach((text, i) => {
      if (result.content.includes(text)) {
        console.log(`✅ Orphaned paragraph ${i + 1} found: "${text}..."`);
      } else {
        console.log(`❌ Orphaned paragraph ${i + 1} missing: "${text}..."`);
      }
    });
    
  } catch (error) {
    console.error('Conversion failed:', error.message);
  }
}

testConversion();
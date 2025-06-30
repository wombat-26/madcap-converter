/**
 * Debug processListItem
 * Add console.log to see if nested-list blocks are being processed
 */

import { readFileSync } from 'fs';

async function debugProcessListItem() {
  console.log('🔍 DEBUGGING processListItem METHOD');
  console.log('='.repeat(50));

  try {
    // Read the current TypeScript source
    const source = readFileSync('/Users/meckardt/mecode/madcap-converter/src/converters/improved-list-processor.ts', 'utf-8');
    
    // Check if debug logging exists
    if (source.includes('console.log')) {
      console.log('✅ Debug logging already exists in source');
    } else {
      console.log('❌ No debug logging found - will add some');
      
      // Add debug logging temporarily
      const modifiedSource = source.replace(
        'content.additionalBlocks.forEach(block => {',
        `content.additionalBlocks.forEach(block => {
      console.log('🔍 Processing additional block:', block.type);`
      ).replace(
        'result += \'+\\n\';',
        `console.log('✅ Adding continuation marker for nested-list');
        result += '+\\n';`
      );
      
      // Save temporarily for testing
      const fs = await import('fs');
      fs.writeFileSync('./debug-improved-list-processor.ts', modifiedSource);
      console.log('📝 Created debug version of the file');
    }
    
    // Try to understand the structure better
    console.log('\n📋 ANALYZING CURRENT IMPLEMENTATION:');
    
    // Extract the key method
    const processListItemMatch = source.match(/content\.additionalBlocks\.forEach\(block => \{([\s\S]*?)\}\);/);
    if (processListItemMatch) {
      console.log('📄 Current additionalBlocks processing:');
      console.log(processListItemMatch[0]);
    }
    
    // Extract the nested list detection
    const nestedListMatch = source.match(/if \(tagName === 'ol' \|\| tagName === 'ul'\) \{([\s\S]*?)\}/);
    if (nestedListMatch) {
      console.log('\n📄 Current nested list detection:');
      console.log(nestedListMatch[0]);
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
  }
}

debugProcessListItem().catch(console.error);
#!/usr/bin/env node

import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';

console.log('=== TESTING POST-PROCESSING CORRUPTION ===\n');

const converter = new WritersideMarkdownConverter();

// Test input that mimics the raw output before post-processing
const testInput = `﻿ 
 
 # Deleting an Activity

 
> **Attention! Data loss!**
>
> Deleting an activity cannot be reverted. In addition, there may be changes to budgets, groupings and other associated items.
{style="warning"}


 
1. In the side navigation, click *> Activities*..
2. Click the name or timeline of the activity you want to delete.

The activity's *Details panel* is displayed on the right side.
3. In the *Details panel*, click the \`…\` button at the bottom right and select *Delete Activity*..

A security prompt is displayed.
4. Click *Delete*..

 The activity will be deleted.

 
 `;

console.log('=== INPUT TO POST-PROCESSING ===');
console.log('Input numbered items:', (testInput.match(/^\d+\./gm) || []).length);
console.log('Input length:', testInput.length);

console.log('\n=== APPLYING POST-PROCESSING ===');
const result = converter.postProcessMarkdown(testInput);

console.log('\n=== POST-PROCESSING RESULT ===');
console.log('Output numbered items:', (result.match(/^\d+\./gm) || []).length);
console.log('Output length:', result.length);

console.log('\n=== VISUAL COMPARISON ===');
console.log('Before (around list area):');
const beforeList = testInput.substring(testInput.indexOf('{style="warning"}'), testInput.indexOf('4. Click'));
console.log(JSON.stringify(beforeList));

console.log('\nAfter (around list area):');
const afterList = result.substring(result.indexOf('{style="warning"}'), result.indexOf('4. Click') !== -1 ? result.indexOf('4. Click') : result.length);
console.log(JSON.stringify(afterList));

console.log('\n=== SPECIFIC ISSUE ANALYSIS ===');
// Check if admonition and first list item are merged
if (result.includes('{style="warning"} 1.')) {
  console.log('❌ ISSUE CONFIRMED: Admonition merged with first list item');
} else {
  console.log('✅ Admonition spacing preserved');
}

// Check for missing list items
const inputItems = (testInput.match(/^\d+\./gm) || []).length;
const outputItems = (result.match(/^\d+\./gm) || []).length;
if (outputItems < inputItems) {
  console.log(`❌ ISSUE CONFIRMED: Lost ${inputItems - outputItems} list items during post-processing`);
} else {
  console.log('✅ All list items preserved');
}

console.log('\n=== FULL OUTPUT ===');
console.log(result);
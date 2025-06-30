#!/usr/bin/env node

import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';

console.log('=== DEBUGGING ADMONITION CONVERSION ===\n');

const admonitionHtml = `
<html>
<body>
<div class="warning">
    <p><span class="warningInDiv">Attention!&nbsp;Data loss!</span></p>
    <p>Deleting an activity cannot be reverted. In addition, there may be changes to budgets, groupings and other associated items.</p>
</div>
</body>
</html>
`;

const converter = new WritersideMarkdownConverter();

async function testAdmonition() {
  try {
    const options = {
      format: 'writerside-markdown',
      inputType: 'madcap',
      inputPath: '/test/path/test.htm'
    };
    
    const result = await converter.convert(admonitionHtml, options);
    
    console.log('ADMONITION OUTPUT:');
    console.log(result.content);
    console.log('\n=== ANALYSIS ===');
    
    const lines = result.content.split('\n');
    console.log('Output lines:');
    lines.forEach((line, i) => console.log(`${i + 1}: "${line}"`));
    
    // Check if content is properly separated
    const admonitionMatch = result.content.match(/> \*\*Attention![^}]+{style="warning"}/s);
    if (admonitionMatch) {
      console.log('\nAdmonition block found:');
      console.log(admonitionMatch[0]);
      
      const admonitionLines = admonitionMatch[0].split('\n');
      console.log(`\nAdmonition has ${admonitionLines.length} lines`);
      admonitionLines.forEach((line, i) => console.log(`  ${i + 1}: "${line}"`));
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testAdmonition();
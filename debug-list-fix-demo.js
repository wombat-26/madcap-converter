import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

// This demonstrates the issue and proposed fix for list processing

const problematicHtml = `
<ol>
  <li>First main item</li>
  <li>Second main item
    <ol style="list-style-type: lower-alpha;">
      <li>Sub item a</li>
      <li>Sub item b</li>
    </ol>
  </li>
  <li>Third main item</li>
</ol>
`;

console.log('=== CURRENT OUTPUT (PROBLEMATIC) ===');
console.log(`. First main item`);
console.log(`. Second main item`);
console.log(`+`);
console.log(`+`);
console.log(`[loweralpha]`);
console.log(`. Sub item a`);
console.log(`. Sub item b`);
console.log(`. Third main item`);

console.log('\n=== CORRECT ASCIIDOC OUTPUT ===');
console.log(`. First main item`);
console.log(`. Second main item`);
console.log(`+`);
console.log(`[loweralpha]`);
console.log(`.. Sub item a`);
console.log(`.. Sub item b`);
console.log(`. Third main item`);

console.log('\n=== ANALYSIS ===');
console.log('The issue is that [loweralpha] is being added as a separate line');
console.log('before the list items, when it should be an attribute on the list.');
console.log('');
console.log('In AsciiDoc, nested lists with alphabetical numbering should:');
console.log('1. Use double dots (..) for nested ordered lists');
console.log('2. Have [loweralpha] as an attribute, not a separate line');
console.log('3. Only need a single + continuation marker');

console.log('\n=== THE FIX ===');
console.log('The improved-list-processor.ts needs to be modified:');
console.log('');
console.log('1. Remove the lines that add [loweralpha] on its own line');
console.log('2. Instead, when processing list items in an alphabetical list,');
console.log('   use alphabetical markers (a., b., c.) directly');
console.log('3. Or use the proper nesting syntax with .. for nested ordered lists');

// Demonstrate proper nested list handling
console.log('\n=== PROPER NESTED LIST EXAMPLE ===');
const nestedExample = `
. First item
. Second item with nested list:
+
.. Nested item one (will be a.)
.. Nested item two (will be b.)
.. Nested item three (will be c.)
. Third item
`;
console.log(nestedExample);

console.log('\n=== ALTERNATIVE WITH EXPLICIT ALPHABETICAL ===');
const explicitAlpha = `
. First item
. Second item with nested list:
+
[loweralpha]
.. Nested item one
.. Nested item two
.. Nested item three
. Third item
`;
console.log(explicitAlpha);

console.log('\n=== RECOMMENDATIONS ===');
console.log('1. For nested ordered lists, use .. (double dots) for proper nesting');
console.log('2. The [loweralpha] attribute can be used but should be on same line as first item');
console.log('3. Only one + continuation marker is needed between parent and nested list');
console.log('4. Remove the double + signs that are appearing in the output');
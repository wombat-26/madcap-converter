#!/usr/bin/env node

import { JSDOM } from 'jsdom';

console.log('=== DEBUGGING ADMONITION ISSUE ===\n');

const admonitionHtml = `
<div class="warning">
    <p><span class="warningInDiv">Attention!&nbsp;Data loss!</span></p>
    <p>Deleting an activity cannot be reverted. In addition, there may be changes to budgets, groupings and other associated items.</p>
</div>
`;

const dom = new JSDOM(admonitionHtml);
const document = dom.window.document;
const warningDiv = document.querySelector('div.warning');

console.log('Original HTML:');
console.log(admonitionHtml);

console.log('\nDiv children:');
Array.from(warningDiv.children).forEach((child, i) => {
  console.log(`${i + 1}. <${child.tagName.toLowerCase()}> with ${child.children.length} children`);
  if (child.children.length > 0) {
    Array.from(child.children).forEach((grandchild, j) => {
      console.log(`   ${j + 1}. <${grandchild.tagName.toLowerCase()}> class="${grandchild.className}" text="${grandchild.textContent}"`);
    });
  }
  console.log(`   Text content: "${child.textContent}"`);
});

// Simulate the converter logic
const titleSpan = warningDiv.querySelector('.warningInDiv, .noteInDiv, .tipInDiv');
console.log('\nTitle span found:', !!titleSpan);
if (titleSpan) {
  console.log('Title span text:', `"${titleSpan.textContent}"`);
  
  // Clone and remove title span
  const clone = warningDiv.cloneNode(true);
  const titleSpanClone = clone.querySelector('.warningInDiv, .noteInDiv, .tipInDiv');
  if (titleSpanClone && titleSpanClone.parentNode) {
    titleSpanClone.parentNode.removeChild(titleSpanClone);
  }
  
  console.log('\nAfter removing title span:');
  console.log('Clone innerHTML:', clone.innerHTML);
}

console.log('\nExpected result:');
console.log('Title: "Attention! Data loss!"');
console.log('Content: "Deleting an activity cannot be reverted. In addition, there may be changes to budgets, groupings and other associated items."');
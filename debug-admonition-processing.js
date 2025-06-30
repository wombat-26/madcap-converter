#!/usr/bin/env node

import { JSDOM } from 'jsdom';

console.log('=== DEBUGGING ADMONITION PROCESSING STEP BY STEP ===\n');

// Test with the actual problem HTML from the file
const problematicHtml = `
<div class="note">
    <p><span class="noteInDiv">Note:</span>&#160;</p>
    <p>You can also create a new activity directly under an existing activity, which will automatically set that activity as the new activity's parent. For details, see <a href="01-02-3 CreateActivityAddUnder.htm">Create New Activities Directly Under Existing Activities</a>.</p>
</div>
`;

console.log('Input HTML:');
console.log(problematicHtml);

const dom = new JSDOM(problematicHtml);
const document = dom.window.document;
const noteDiv = document.querySelector('div.note');

// Step 1: Extract title
const titleSpan = noteDiv.querySelector('.warningInDiv, .noteInDiv, .tipInDiv');
const title = (titleSpan.textContent || '').replace(/&nbsp;/g, ' ').trim();
console.log(`\n1. Extracted title: "${title}"`);

// Step 2: Remove title paragraph
const clone = noteDiv.cloneNode(true);
const titleSpanClone = clone.querySelector('.warningInDiv, .noteInDiv, .tipInDiv');
if (titleSpanClone && titleSpanClone.parentNode) {
  const titleParagraph = titleSpanClone.parentNode;
  if (titleParagraph && titleParagraph.parentNode) {
    titleParagraph.parentNode.removeChild(titleParagraph);
  }
}

console.log('\n2. After removing title paragraph:');
console.log('Clone HTML:', clone.innerHTML);

// Step 3: Simulate convertDomToMarkdown on remaining content
function simulateConvertDomToMarkdown(element) {
  let result = '';
  
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === document.TEXT_NODE) {
      const text = (node.textContent || '').trim();
      if (text) {
        result += text;
      }
    } else if (node.nodeType === document.ELEMENT_NODE) {
      if (node.tagName.toLowerCase() === 'p') {
        const pContent = (node.textContent || '').trim();
        if (pContent) {
          result += pContent + '\n\n';
        }
      } else if (node.tagName.toLowerCase() === 'a') {
        const href = node.getAttribute('href') || '';
        const text = node.textContent || '';
        result += `[${text}](${href.replace(/\.htm$/, '.html')})`;
      } else {
        result += node.textContent || '';
      }
    }
  }
  
  return result.trim();
}

const content = simulateConvertDomToMarkdown(clone);
console.log(`\n3. Extracted content: "${content}"`);

// Step 4: Build admonition with \n\n separator
const admonitionContent = `**${title}**\n\n${content}`;
console.log(`\n4. Combined content: ${JSON.stringify(admonitionContent)}`);

// Step 5: Split and quote lines
const lines = admonitionContent.split('\n');
console.log(`\n5. Split into ${lines.length} lines:`);
lines.forEach((line, i) => console.log(`   ${i + 1}: ${JSON.stringify(line)}`));

const quotedLines = lines.map(line => {
  const trimmed = line.trim();
  return trimmed ? `> ${trimmed}` : '>';
}).join('\n');

console.log(`\n6. Final quoted result:`);
console.log(quotedLines);

console.log(`\n7. Expected result:`);
console.log('> **Note:**');
console.log('>');
console.log('> You can also create a new activity directly under...');

console.log(`\n8. Issue analysis:`);
if (lines.length >= 3 && lines[1] === '') {
  console.log('✅ Separator logic is working correctly');
  if (!quotedLines.includes('>\n>')) {
    console.log('❌ But quoted lines are not preserving empty line');
  } else {
    console.log('✅ Quoted lines preserve empty line correctly');
  }
} else {
  console.log('❌ Separator logic failed - no empty line in split');
}
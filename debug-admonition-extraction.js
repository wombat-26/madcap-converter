#!/usr/bin/env node

import { JSDOM } from 'jsdom';

console.log('=== DEBUGGING CONTENT EXTRACTION ===\n');

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
console.log(warningDiv.outerHTML);

// Simulate the extraction process exactly as the converter does
const titleSpan = warningDiv.querySelector('.warningInDiv, .noteInDiv, .tipInDiv');
let title = '';
let content = '';

if (titleSpan) {
  title = (titleSpan.textContent || '').replace(/&nbsp;/g, ' ').trim();
  console.log(`\nExtracted title: "${title}"`);
  
  // Remove the entire paragraph containing the title span
  const clone = warningDiv.cloneNode(true);
  console.log('\nClone before removal:');
  console.log(clone.innerHTML);
  
  const titleSpanClone = clone.querySelector('.warningInDiv, .noteInDiv, .tipInDiv');
  if (titleSpanClone && titleSpanClone.parentNode) {
    const titleParagraph = titleSpanClone.parentNode;
    console.log('\nTitle paragraph to remove:');
    console.log(titleParagraph.outerHTML);
    
    if (titleParagraph && titleParagraph.parentNode) {
      titleParagraph.parentNode.removeChild(titleParagraph);
    }
  }
  
  console.log('\nClone after removal:');
  console.log(clone.innerHTML);
  
  // Simulate convertDomToMarkdown for the remaining content
  const remainingParagraphs = Array.from(clone.querySelectorAll('p'));
  console.log(`\nRemaining paragraphs: ${remainingParagraphs.length}`);
  remainingParagraphs.forEach((p, i) => {
    console.log(`${i + 1}: "${p.textContent}"`);
  });
  
  // This should be the extracted content
  content = remainingParagraphs.map(p => p.textContent?.trim()).filter(Boolean).join('\n\n');
  console.log(`\nExtracted content: "${content}"`);
}

console.log('\n=== BUILDING ADMONITION ===');
const admonitionContent = `**${title}**\n\n${content}`;
console.log('Admonition content:', JSON.stringify(admonitionContent));

const lines = admonitionContent.split('\n');
console.log(`Lines: ${lines.length}`);
lines.forEach((line, i) => console.log(`${i + 1}: "${line}"`));
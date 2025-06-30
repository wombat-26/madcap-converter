#!/usr/bin/env node

import { JSDOM } from 'jsdom';

console.log('=== DEBUGGING EMPHASIS ESCAPING ISSUE ===\n');

// Minimal test case
const testHtml = `<p>Click <i>Delete Activity</i> to proceed.</p>`;

console.log('Input HTML:', testHtml);

const dom = new JSDOM(testHtml);
const document = dom.window.document;
const paragraph = document.querySelector('p');

console.log('\nDOM structure:');
for (const node of Array.from(paragraph.childNodes)) {
  if (node.nodeType === document.TEXT_NODE) {
    console.log(`TEXT_NODE: "${node.textContent}"`);
  } else if (node.nodeType === document.ELEMENT_NODE) {
    console.log(`ELEMENT_NODE: <${node.tagName.toLowerCase()}> containing "${node.textContent}"`);
  }
}

// Simulate the conversion process
function simulateConversion() {
  let result = '';
  
  for (const node of Array.from(paragraph.childNodes)) {
    if (node.nodeType === document.TEXT_NODE) {
      // This is what the converter does for text nodes
      const text = node.textContent || '';
      const escaped = text.replace(/_/g, '\\_'); // Simulating escapeMarkdownText
      console.log(`\nProcessing TEXT_NODE: "${text}" -> "${escaped}"`);
      result += escaped;
    } else if (node.nodeType === document.ELEMENT_NODE) {
      // This is what happens for <i> elements
      const content = node.textContent || '';
      const emphasis = `*${content}*`; // Simulating handleEmphasis
      console.log(`Processing ELEMENT_NODE: "${content}" -> "${emphasis}"`);
      result += emphasis;
    }
  }
  
  console.log(`\nFinal result: "${result}"`);
  return result;
}

simulateConversion();

console.log('\n=== EXPECTED vs ACTUAL ===');
console.log('Expected: "Click *Delete Activity* to proceed."');
console.log('Actual:   "Click \\_Delete Activity\\_ to proceed." (if bug exists)');
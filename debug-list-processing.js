#!/usr/bin/env node

import { JSDOM } from 'jsdom';

const problemHtml = `
<ol>
    <li><p>In the side navigation, click <i>&gt;&#160;Activities</i>.</p></li>
    <li><p>Click the name or timeline of the activity you want to delete.</p></li>
    <p>The activity's <i>Details panel</i> is displayed on the right side.</p>
    <li><p>In the <i>Details panel</i>, click the <span class="Keyboard">…</span> button at the bottom right and select <i>Delete Activity</i>.</p></li>
    <p>A security prompt is displayed.</p>
    <li><p>Click <i>Delete</i>.</p></li>
</ol>`;

console.log('=== ORDERED LIST CHILDREN ANALYSIS ===');

const dom = new JSDOM(problemHtml);
const document = dom.window.document;
const ol = document.querySelector('ol');

console.log('OL element found:', !!ol);
console.log('OL children count:', ol.children.length);
console.log('OL childNodes count:', ol.childNodes.length);

console.log('\n=== CHILDREN ANALYSIS ===');
Array.from(ol.children).forEach((child, i) => {
  console.log(`${i}: <${child.tagName.toLowerCase()}> - "${(child.textContent || '').trim().substring(0, 50)}..."`);
});

console.log('\n=== CHILD NODES ANALYSIS (includes text nodes) ===');
Array.from(ol.childNodes).forEach((node, i) => {
  if (node.nodeType === document.TEXT_NODE) {
    const text = (node.textContent || '').trim();
    if (text) {
      console.log(`${i}: TEXT_NODE - "${text}"`);
    } else {
      console.log(`${i}: TEXT_NODE - [whitespace/empty]`);
    }
  } else if (node.nodeType === document.ELEMENT_NODE) {
    const elem = node;
    console.log(`${i}: ELEMENT_NODE - <${elem.tagName.toLowerCase()}> - "${(elem.textContent || '').trim().substring(0, 50)}..."`);
  }
});

console.log('\n=== EXPECTED PROCESSING ORDER ===');
console.log('The handleOrderedList method should process:');
Array.from(ol.children).forEach((child, i) => {
  const tagName = child.tagName.toLowerCase();
  const content = (child.textContent || '').trim().substring(0, 30);
  if (tagName === 'li') {
    console.log(`${i + 1}. List item: "${content}..."`);
  } else if (tagName === 'p') {
    console.log(`${i + 1}. Orphaned paragraph → should become list item: "${content}..."`);
  }
});

console.log('\n=== SIMULATED CONVERTER LOGIC ===');
let listItemIndex = 0;
const startNum = 1;

Array.from(ol.children).forEach((child) => {
  const tagName = child.tagName.toLowerCase();
  const content = (child.textContent || '').trim().substring(0, 40);
  
  if (tagName === 'li') {
    const marker = `${startNum + listItemIndex}.`;
    console.log(`Process LI: ${marker} ${content}...`);
    listItemIndex++;
  } else {
    // This is the orphaned content handling logic
    if (content) {
      const marker = `${startNum + listItemIndex}.`;
      console.log(`Process ORPHANED: ${marker} ${content}...`);
      listItemIndex++;
    }
  }
});

console.log(`\nFinal listItemIndex: ${listItemIndex} (should be 4)`);
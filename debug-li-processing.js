import fs from 'fs/promises';
import { JSDOM } from 'jsdom';

const content = await fs.readFile('/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-08 DeleteActivity.htm', 'utf8');

// Parse with JSDOM like the converter does
const dom = new JSDOM(content);
const document = dom.window.document;

// Find the problematic list item
const ol = document.querySelector('ol');
const listItems = Array.from(ol.children).filter(child => child.tagName.toLowerCase() === 'li');

// Find the 4th list item (which contains "Click Delete")
const targetLi = listItems[3]; // 0-indexed, so 3 = 4th item
console.log('=== TARGET LIST ITEM ===');
console.log('LI HTML:', targetLi.outerHTML);

console.log('\n=== LI CHILD NODES ===');
Array.from(targetLi.childNodes).forEach((node, i) => {
  if (node.nodeType === 3) { // TEXT_NODE
    console.log(`${i}: TEXT_NODE - "${node.textContent}"`);
  } else if (node.nodeType === 1) { // ELEMENT_NODE
    console.log(`${i}: ELEMENT_NODE - <${node.tagName.toLowerCase()}>`);
  }
});

// Look at the paragraph inside
const p = targetLi.querySelector('p');
console.log('\n=== PARAGRAPH ANALYSIS ===');
console.log('P HTML:', p.outerHTML);

console.log('\n=== P CHILD NODES ===');
Array.from(p.childNodes).forEach((node, i) => {
  if (node.nodeType === 3) { // TEXT_NODE
    console.log(`${i}: TEXT_NODE - "${node.textContent}"`);
  } else if (node.nodeType === 1) { // ELEMENT_NODE
    console.log(`${i}: ELEMENT_NODE - <${node.tagName.toLowerCase()}> - "${node.textContent}"`);
  }
});

// Focus on the italic element and what follows it
const italic = p.querySelector('i');
console.log('\n=== ITALIC ELEMENT ANALYSIS ===');
console.log('Italic HTML:', italic.outerHTML);
console.log('Italic text content:', JSON.stringify(italic.textContent));

console.log('\n=== NEXT SIBLING ANALYSIS ===');
const nextSibling = italic.nextSibling;
if (nextSibling) {
  console.log('Next sibling exists:', true);
  console.log('Next sibling type:', nextSibling.nodeType === 3 ? 'TEXT_NODE' : 'ELEMENT_NODE');
  console.log('Next sibling content:', JSON.stringify(nextSibling.textContent || ''));
  console.log('Next sibling raw:', nextSibling);
} else {
  console.log('Next sibling exists:', false);
}

// Also check all siblings
console.log('\n=== ALL SIBLINGS OF ITALIC ===');
let current = italic.parentNode.firstChild;
let index = 0;
while (current) {
  const isCurrent = current === italic;
  const marker = isCurrent ? ' <-- ITALIC' : '';
  if (current.nodeType === 3) {
    console.log(`${index}: TEXT_NODE - "${current.textContent}"${marker}`);
  } else if (current.nodeType === 1) {
    console.log(`${index}: ELEMENT_NODE - <${current.tagName.toLowerCase()}> - "${current.textContent}"${marker}`);
  }
  current = current.nextSibling;
  index++;
}
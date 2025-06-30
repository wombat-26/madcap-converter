import fs from 'fs/promises';
import { JSDOM } from 'jsdom';

const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

// Debug the period issue specifically
const input = '<p>Click <i>Delete</i>.</p>';

console.log('=== DOM Analysis ===');
const dom = new JSDOM(input);
const document = dom.window.document;
const p = document.querySelector('p');
console.log('P innerHTML:', p.innerHTML);
console.log('P childNodes:');
Array.from(p.childNodes).forEach((node, i) => {
  if (node.nodeType === 3) { // TEXT_NODE
    console.log(`  ${i}: TEXT_NODE - "${node.textContent}"`);
  } else if (node.nodeType === 1) { // ELEMENT_NODE
    console.log(`  ${i}: ELEMENT_NODE - <${node.tagName.toLowerCase()}> - "${node.textContent}"`);
  }
});

const italic = p.querySelector('i');
console.log('Next sibling of italic:', italic.nextSibling?.textContent ? JSON.stringify(italic.nextSibling.textContent) : 'none');

console.log('\n=== Conversion Test ===');
const converter = new WritersideMarkdownConverter();
const result = await converter.convert(input, {
  format: 'writerside-markdown',
  inputType: 'html'
});

console.log('Result:', JSON.stringify(result.content));
console.log('Expected: "Click *Delete*."');
console.log('Missing period:', !result.content.includes('*Delete*.'));
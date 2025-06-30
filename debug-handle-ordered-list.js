#!/usr/bin/env node

import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';
import { JSDOM } from 'jsdom';

console.log('=== TESTING handleOrderedList DIRECTLY ===\n');

const testHtml = `
<ol>
    <li><p>In the side navigation, click <i>&gt;&#160;Activities</i>.</p></li>
    <li><p>Click the name or timeline of the activity you want to delete.</p></li>
    <p>The activity's <i>Details panel</i> is displayed on the right side.</p>
    <li><p>In the <i>Details panel</i>, click the <span class="Keyboard">…</span> button at the bottom right and select <i>Delete Activity</i>.</p></li>
    <p>A security prompt is displayed.</p>
    <li><p>Click <i>Delete</i>.</p></li>
</ol>`;

const dom = new JSDOM(testHtml);
const document = dom.window.document;
const ol = document.querySelector('ol');

const converter = new WritersideMarkdownConverter();

// Access the private method using bracket notation
const handleOrderedList = converter.handleOrderedList || converter['handleOrderedList'];

if (typeof handleOrderedList === 'function') {
  try {
    const result = handleOrderedList.call(converter, ol, document, 0);
    console.log('handleOrderedList result:');
    console.log(JSON.stringify(result));
    console.log('\nVisual result:');
    console.log(result.replace(/\n/g, '\\n\n'));
    
    // Count numbered items
    const numberedItems = (result.match(/^\d+\./gm) || []).length;
    console.log(`\nNumbered items found: ${numberedItems} (expected: 6)`);
    
  } catch (error) {
    console.error('Error calling handleOrderedList:', error.message);
    console.log('Method exists but failed to execute');
  }
} else {
  console.log('handleOrderedList method not accessible - checking alternative access...');
  
  // Try to access through prototype
  const proto = Object.getPrototypeOf(converter);
  console.log('Available methods:', Object.getOwnPropertyNames(proto).filter(name => name.includes('List')));
}
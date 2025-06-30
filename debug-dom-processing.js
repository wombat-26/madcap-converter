#!/usr/bin/env node

import { JSDOM } from 'jsdom';

const problemHtml = `
<body>
    <h1>Deleting an Activity</h1>
    <div class="warning">
        <p><span class="warningInDiv">Attention! Data loss!</span></p>
        <p>Deleting an activity cannot be reverted. In addition, there may be changes to budgets, groupings and other associated items.</p>
    </div>
    <ol>
        <li><p>In the side navigation, click <i>&gt; Activities</i>.</p></li>
        <li><p>Click the name or timeline of the activity you want to delete.</p></li>
        <p>The activity's Details panel is displayed on the right side.</p>
        <li><p>In the Details panel, click the ... button at the bottom right and select Delete Activity.</p></li>
        <p>A security prompt is displayed.</p>
        <li><p>Click Delete.</p></li>
    </ol>
    <p>The activity will be deleted.</p>
</body>`;

console.log('=== DOM STRUCTURE ANALYSIS ===');

const dom = new JSDOM(problemHtml);
const document = dom.window.document;
const body = document.body;

console.log('Body child nodes:');
Array.from(body.childNodes).forEach((node, i) => {
  if (node.nodeType === document.TEXT_NODE) {
    const text = (node.textContent || '').trim();
    if (text) {
      console.log(`${i}: TEXT_NODE - "${text}"`);
    } else {
      console.log(`${i}: TEXT_NODE - [whitespace/empty]`);
    }
  } else if (node.nodeType === document.ELEMENT_NODE) {
    const elem = node;
    console.log(`${i}: ELEMENT_NODE - <${elem.tagName.toLowerCase()}> (class: "${elem.className || 'none'}")`);
    
    if (elem.tagName.toLowerCase() === 'ol') {
      console.log('   OL children:');
      Array.from(elem.childNodes).forEach((child, j) => {
        if (child.nodeType === document.TEXT_NODE) {
          const text = (child.textContent || '').trim();
          if (text) {
            console.log(`     ${j}: TEXT_NODE - "${text}"`);
          } else {
            console.log(`     ${j}: TEXT_NODE - [whitespace]`);
          }
        } else if (child.nodeType === document.ELEMENT_NODE) {
          console.log(`     ${j}: ELEMENT_NODE - <${child.tagName.toLowerCase()}>`);
          if (child.tagName.toLowerCase() === 'p') {
            console.log(`        Content: "${(child.textContent || '').trim()}"`);
          }
        }
      });
    }
  }
});

// Test specific issue: What happens when we process div.warning followed by ol?
console.log('\n=== SEQUENTIAL PROCESSING TEST ===');

const warningDiv = body.querySelector('div.warning');
const orderList = body.querySelector('ol');

console.log('1. Warning div found:', !!warningDiv);
console.log('2. Ordered list found:', !!orderList);

if (warningDiv && orderList) {
  console.log('3. Warning div is immediately followed by OL:', warningDiv.nextElementSibling === orderList);
  
  // Check what's between them
  let currentNode = warningDiv.nextSibling;
  console.log('4. Nodes between warning and OL:');
  while (currentNode && currentNode !== orderList) {
    if (currentNode.nodeType === document.TEXT_NODE) {
      const text = (currentNode.textContent || '');
      console.log(`   TEXT: "${text}" (length: ${text.length})`);
    } else if (currentNode.nodeType === document.ELEMENT_NODE) {
      console.log(`   ELEMENT: <${currentNode.tagName.toLowerCase()}>`);
    }
    currentNode = currentNode.nextSibling;
  }
}
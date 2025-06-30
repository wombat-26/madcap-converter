/**
 * Debug the list content extraction to see what's happening with paragraphs
 */

import { JSDOM } from 'jsdom';

const testHtml = `
<li>
<p>First paragraph in list item.</p>
<p>Second paragraph should have continuation marker.</p>
</li>
`;

function debugListItemStructure() {
  console.log('Debugging list item structure...\n');
  
  const dom = new JSDOM(testHtml);
  const listItem = dom.window.document.querySelector('li');
  
  if (!listItem) {
    console.error('No list item found');
    return;
  }
  
  console.log('=== List Item Analysis ===');
  console.log(`Number of child nodes: ${listItem.childNodes.length}`);
  console.log(`Number of child elements: ${listItem.children.length}`);
  
  console.log('\n=== Child Nodes Analysis ===');
  Array.from(listItem.childNodes).forEach((child, index) => {
    if (child.nodeType === 3) { // Text node
      const text = child.textContent || '';
      if (text.trim()) {
        console.log(`  ${index}: Text node: "${text.replace(/\n/g, '\\n')}"`);
      } else {
        console.log(`  ${index}: Empty/whitespace text node`);
      }
    } else if (child.nodeType === 1) { // Element node
      const element = child;
      console.log(`  ${index}: Element: ${element.tagName.toLowerCase()}`);
      console.log(`    Text content: "${element.textContent?.trim()}"`);
    }
  });
  
  console.log('\n=== Child Elements Analysis ===');
  Array.from(listItem.children).forEach((child, index) => {
    const element = child;
    console.log(`  ${index}: Element: ${element.tagName.toLowerCase()}`);
    console.log(`    Text content: "${element.textContent?.trim()}"`);
  });
  
  console.log('\n=== Expected Processing Flow ===');
  console.log('1. First <p> should become mainContent');
  console.log('2. Second <p> should become an additionalBlock with type "paragraph"');
  console.log('3. additionalBlocks with type "paragraph" should get "+" continuation markers');
}

debugListItemStructure();
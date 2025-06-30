/**
 * Debug with custom logging in list processor
 */

import { JSDOM } from 'jsdom';

// Copy the extractListItemContent logic with debug logging
function debugExtractListItemContent(item, depth = 0, nodeConverter) {
  console.log('\n=== Starting extractListItemContent ===');
  let mainContent = '';
  const additionalBlocks = [];
  let currentInlineContent = '';
  let hasSetMainContent = false;
  
  const children = Array.from(item.childNodes);
  console.log(`Processing ${children.length} child nodes`);
  
  // Helper to flush inline content
  const flushInlineContent = () => {
    if (currentInlineContent.trim()) {
      console.log(`Flushing inline content: "${currentInlineContent.trim()}"`);
      if (!hasSetMainContent) {
        mainContent = currentInlineContent.trim();
        hasSetMainContent = true;
        console.log(`Set as mainContent: "${mainContent}"`);
      } else {
        additionalBlocks.push({
          type: 'paragraph',
          content: currentInlineContent.trim()
        });
        console.log(`Added to additionalBlocks as paragraph: "${currentInlineContent.trim()}"`);
      }
      currentInlineContent = '';
    }
  };
  
  // Process children
  for (const child of children) {
    if (child.nodeType === 3) { // Text node
      const text = (child.textContent || '').trim();
      if (text) {
        console.log(`Processing text node: "${text}"`);
        currentInlineContent += currentInlineContent ? ' ' + text : text;
      }
    } else if (child.nodeType === 1) { // Element node
      const element = child;
      const tagName = element.tagName.toLowerCase();
      console.log(`Processing element: ${tagName}`);
      
      if (tagName === 'p') {
        // Paragraphs are block level
        flushInlineContent();
        const pContent = nodeConverter ? nodeConverter(element, depth) : element.textContent?.trim() || '';
        console.log(`Paragraph content from nodeConverter: "${pContent}"`);
        if (pContent) {
          if (!hasSetMainContent) {
            mainContent = pContent;
            hasSetMainContent = true;
            console.log(`Set paragraph as mainContent: "${mainContent}"`);
          } else {
            additionalBlocks.push({
              type: 'paragraph',
              content: pContent
            });
            console.log(`Added paragraph to additionalBlocks: "${pContent}"`);
          }
        }
      }
    }
  }
  
  // Flush any remaining inline content
  flushInlineContent();
  
  console.log(`\nFinal result:`);
  console.log(`  mainContent: "${mainContent}"`);
  console.log(`  additionalBlocks: ${additionalBlocks.length} blocks`);
  additionalBlocks.forEach((block, index) => {
    console.log(`    [${index}] ${block.type}: "${block.content}"`);
  });
  
  return { mainContent, additionalBlocks };
}

const testHtml = `
<li>
<p>First paragraph in list item.</p>
<p>Second paragraph should have continuation marker.</p>
</li>
`;

function runDebugTest() {
  const dom = new JSDOM(testHtml);
  const listItem = dom.window.document.querySelector('li');
  
  // Simple nodeConverter that just returns text content
  const simpleNodeConverter = (node, depth) => {
    if (node.nodeType === 1) { // Element node
      return node.textContent?.trim() || '';
    }
    return '';
  };
  
  const result = debugExtractListItemContent(listItem, 0, simpleNodeConverter);
  
  console.log('\n=== Analysis ===');
  if (result.additionalBlocks.length > 0) {
    console.log('✅ Additional blocks found - continuation markers should be added');
  } else {
    console.log('❌ No additional blocks - this is the problem!');
  }
}

runDebugTest();
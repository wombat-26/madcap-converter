import { ImprovedListProcessor } from './build/converters/improved-list-processor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { JSDOM } from 'jsdom';

async function debugExtractContent() {
  console.log('Debugging extractListItemContent...\n');
  
  const listProcessor = new ImprovedListProcessor();
  const converter = new AsciiDocConverter();
  
  // Create the exact list item from the file
  const testHtml = `
    <li>
      <p>In the <i>Investment Item</i> list, find the investment you want to connect. Click an investment item's <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button to connect it to the activity.</p>
    </li>
  `;
  
  const dom = new JSDOM(testHtml);
  const listItem = dom.window.document.querySelector('li');
  
  if (listItem) {
    // Create a node converter function that uses the AsciiDoc converter
    const nodeConverter = (node, depth) => {
      return converter.nodeToAsciiDoc(node, depth, { format: 'asciidoc', inputType: 'html' });
    };
    
    // Call extractListItemContent directly to see what it returns
    const content = listProcessor.extractListItemContent(listItem, 0, nodeConverter);
    
    console.log('=== EXTRACT LIST ITEM CONTENT RESULT ===');
    console.log(`Main content: "${content.mainContent}"`);
    console.log(`Additional blocks count: ${content.additionalBlocks.length}`);
    
    content.additionalBlocks.forEach((block, index) => {
      console.log(`Additional block ${index}:`);
      console.log(`  Type: ${block.type}`);
      console.log(`  Content: "${block.content}"`);
    });
  }
}

debugExtractContent();
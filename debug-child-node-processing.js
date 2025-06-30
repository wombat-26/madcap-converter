import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { JSDOM } from 'jsdom';

async function debugChildNodeProcessing() {
  console.log('Debugging child node processing...\n');
  
  const converter = new AsciiDocConverter();
  
  // Create the exact paragraph from the list item with proper context
  const testHtml = `<ol><li><p>Click an investment item's <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button to connect it to the activity.</p></li></ol>`;
  
  const dom = new JSDOM(testHtml);
  const paragraph = dom.window.document.querySelector('p');
  
  if (paragraph) {
    console.log('=== CHILD NODES PROCESSING ===');
    
    Array.from(paragraph.childNodes).forEach((child, index) => {
      console.log(`\nChild ${index}:`);
      console.log(`  Type: ${child.nodeType} (${child.nodeType === 3 ? 'TEXT' : child.nodeType === 1 ? 'ELEMENT' : 'OTHER'})`);
      console.log(`  Tag: ${child.nodeType === 1 ? child.tagName : 'N/A'}`);
      console.log(`  Content: "${child.textContent}"`);
      
      if (child.nodeType === 1) {
        console.log(`  Class: ${child.className || 'none'}`);
      }
      
      // Process this child through the converter
      const childResult = converter.nodeToAsciiDoc(child, 1, { format: 'asciidoc', inputType: 'html' });
      console.log(`  Processed result: "${childResult}"`);
      console.log(`  Result length: ${childResult.length}`);
      console.log(`  Contains newlines: ${childResult.includes('\\n')}`);
      
      if (childResult.includes('\\n')) {
        const lines = childResult.split('\\n');
        console.log(`  Split into ${lines.length} lines:`);
        lines.forEach((line, lineIndex) => {
          console.log(`    ${lineIndex}: "${line}"`);
        });
      }
    });
  }
}

debugChildNodeProcessing();
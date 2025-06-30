import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { JSDOM } from 'jsdom';

async function debugParagraphProcessing() {
  console.log('Debugging paragraph processing...\n');
  
  const converter = new AsciiDocConverter();
  
  // Create the exact paragraph from the list item - include list structure for proper context
  const testHtml = `<ol><li><p>In the <i>Investment Item</i> list, find the investment you want to connect. Click an investment item's <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button to connect it to the activity.</p></li></ol>`;
  
  const dom = new JSDOM(testHtml);
  const paragraph = dom.window.document.querySelector('p');
  
  if (paragraph) {
    // Call the converter's nodeToAsciiDoc method directly
    const result = converter.nodeToAsciiDoc(paragraph, 0, { format: 'asciidoc', inputType: 'html' });
    
    console.log('=== PARAGRAPH PROCESSING RESULT ===');
    console.log(`Result: "${result}"`);
    console.log(`Length: ${result.length}`);
    console.log(`Contains newlines: ${result.includes('\n')}`);
    console.log(`Contains double newlines: ${result.includes('\n\n')}`);
    
    // Show what gets split on newlines
    const lines = result.split('\n');
    console.log(`\n=== SPLIT ON NEWLINES (${lines.length} parts) ===`);
    lines.forEach((line, index) => {
      console.log(`${index}: "${line}"`);
    });
  }
}

debugParagraphProcessing();
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { JSDOM } from 'jsdom';

async function debugListProcessingComplete() {
  console.log('Debugging complete list processing...\n');
  
  const converter = new AsciiDocConverter();
  
  // Create the exact list structure from the file
  const testHtml = `
    <ol>
      <li>
        <p>In the <i>Investment Item</i> list, find the investment you want to connect. Click an investment item's <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button to connect it to the activity.</p>
      </li>
    </ol>
  `;
  
  const dom = new JSDOM(testHtml);
  const listElement = dom.window.document.querySelector('ol');
  
  if (listElement) {
    // Call the converter's nodeToAsciiDoc method on the full list
    const result = converter.nodeToAsciiDoc(listElement, 0, { format: 'asciidoc', inputType: 'html' });
    
    console.log('=== COMPLETE LIST PROCESSING RESULT ===');
    console.log(`Result:\n"${result}"`);
    
    // Show what gets split on newlines
    const lines = result.split('\n');
    console.log(`\n=== SPLIT ON NEWLINES (${lines.length} parts) ===`);
    lines.forEach((line, index) => {
      console.log(`${String(index).padStart(2, ' ')}: "${line}"`);
    });
    
    // Check if image is inline or separate
    const hasInlineImage = result.includes("item's image:../Images/GUI-Elemente/Link Activity.png[Link Activity,18] _Link_ button");
    const isOnSeparateLine = lines.some(line => line.trim() === 'image:../Images/GUI-Elemente/Link Activity.png[Link Activity,18]');
    
    console.log(`\n=== ANALYSIS ===`);
    console.log(`Image inline with text: ${hasInlineImage}`);
    console.log(`Image on separate line: ${isOnSeparateLine}`);
  }
}

debugListProcessingComplete();
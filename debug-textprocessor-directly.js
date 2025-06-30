import { TextProcessor } from './build/converters/text-processor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { JSDOM } from 'jsdom';

async function debugTextProcessorDirectly() {
  console.log('Debugging TextProcessor directly...\n');
  
  const textProcessor = new TextProcessor();
  const converter = new AsciiDocConverter();
  
  // Create the exact paragraph with proper context
  const testHtml = `<ol><li><p>Click an investment item's <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button to connect it to the activity.</p></li></ol>`;
  
  const dom = new JSDOM(testHtml);
  const paragraph = dom.window.document.querySelector('p');
  
  if (paragraph) {
    console.log('=== CALLING TEXTPROCESSOR.PROCESSCHILDNODES DIRECTLY ===');
    
    // Call the TextProcessor directly like the main converter does
    const result = textProcessor.processChildNodes(
      Array.from(paragraph.childNodes),
      (child) => converter.nodeToAsciiDoc(child, 1, { format: 'asciidoc', inputType: 'html' })
    );
    
    console.log(`TextProcessor result: "${result}"`);
    console.log(`Length: ${result.length}`);
    console.log(`Contains newlines: ${result.includes('\\n')}`);
    
    if (result.includes('\\n')) {
      const lines = result.split('\\n');
      console.log(`\\nSplit into ${lines.length} lines:`);
      lines.forEach((line, index) => {
        console.log(`${index}: "${line}"`);
      });
    }
  }
}

debugTextProcessorDirectly();
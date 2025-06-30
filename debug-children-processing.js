import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { JSDOM } from 'jsdom';

const testHtml = `<p>For instructions, see <a href="#Configur">Configuring Planned Impact</a>.</p>`;

async function debugChildrenProcessing() {
  console.log('=== Test HTML ===');
  console.log(testHtml);
  
  // Let's manually trace what should happen
  const dom = new JSDOM(testHtml);
  const linkElement = dom.window.document.querySelector('a');
  
  console.log('\n=== Link Element Analysis ===');
  console.log('Tag name:', linkElement?.tagName);
  console.log('Href:', linkElement?.getAttribute('href'));
  console.log('Text content:', linkElement?.textContent);
  console.log('Child nodes:', linkElement?.childNodes.length);
  
  if (linkElement) {
    // Check if it's a simple text node
    const hasOnlyTextNode = linkElement.childNodes.length === 1 && linkElement.childNodes[0].nodeType === 3;
    console.log('Has only text node:', hasOnlyTextNode);
    if (hasOnlyTextNode) {
      console.log('Text node content:', linkElement.childNodes[0].textContent);
    }
  }
  
  // Now let's trace through the converter logic
  const converter = new AsciiDocConverter();
  
  // We need to patch the nodeToAsciiDoc method to add logging
  const originalNodeToAsciiDoc = converter['nodeToAsciiDoc'].bind(converter);
  converter['nodeToAsciiDoc'] = function(node, depth, options) {
    if (node.nodeType === 1) {
      const element = node;
      if (element.tagName.toLowerCase() === 'a') {
        console.log('\n=== Processing anchor element ===');
        console.log('Element:', element.outerHTML);
        console.log('Href:', element.getAttribute('href'));
        console.log('Text content:', element.textContent);
        console.log('Child nodes count:', element.childNodes.length);
        
        // Check what children would be
        if (element.childNodes.length === 1 && element.childNodes[0].nodeType === 3) {
          console.log('Single text node detected');
          console.log('Text:', element.childNodes[0].textContent);
        }
      }
    }
    
    const result = originalNodeToAsciiDoc.call(this, node, depth, options);
    
    if (node.nodeType === 1 && node.tagName.toLowerCase() === 'a') {
      console.log('Result for anchor:', result);
    }
    
    return result;
  };
  
  const result = await converter.convert(testHtml, {
    inputType: 'html'
  });
  
  console.log('\n=== Final Result ===');
  console.log(result.content);
}

debugChildrenProcessing();
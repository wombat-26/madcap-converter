import { JSDOM } from 'jsdom';
import { TextProcessor } from './build/converters/text-processor.js';

const testCases = [
  '<a href="#Configur">Configuring Planned Impact</a>',
  '<a href="#Test">Simple Text</a>',
  '<a href="#Another">Text with <em>emphasis</em></a>'
];

async function debugTextProcessor() {
  const processor = new TextProcessor();
  
  for (const testHtml of testCases) {
    console.log(`\n=== Testing: ${testHtml} ===`);
    
    const dom = new JSDOM(testHtml);
    const element = dom.window.document.querySelector('a');
    
    if (element) {
      // Test what TextProcessor does with the child nodes
      const processed = processor.processChildNodes(
        Array.from(element.childNodes),
        (node) => {
          if (node.nodeType === 3) {
            return node.textContent || '';
          } else if (node.nodeType === 1) {
            const el = node;
            if (el.tagName.toLowerCase() === 'em') {
              return `_${el.textContent}_`;
            }
            return el.textContent || '';
          }
          return '';
        }
      );
      
      console.log('Original text:', element.textContent);
      console.log('Processed text:', processed);
      console.log('Child nodes:', element.childNodes.length);
      
      // Also test with simpler approach
      const simpleText = element.childNodes.length === 1 && element.childNodes[0].nodeType === 3
        ? element.childNodes[0].textContent || ''
        : element.textContent || '';
      
      console.log('Simple approach:', simpleText);
    }
  }
}

debugTextProcessor();
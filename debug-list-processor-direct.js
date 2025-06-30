/**
 * Direct test of ImprovedListProcessor to debug paragraph handling
 */

import { JSDOM } from 'jsdom';
import { ImprovedListProcessor } from './build/converters/improved-list-processor.js';

const testHtml = `
<ol>
<li>
<p>First paragraph in list item.</p>
<p>Second paragraph should have continuation marker.</p>
</li>
<li>Single paragraph item.</li>
<li>
<p>Another first paragraph.</p>
<p>Another second paragraph.</p>
<p>Third paragraph in same list item.</p>
</li>
</ol>
`;

async function debugListProcessor() {
  console.log('Testing ImprovedListProcessor directly...\n');
  
  try {
    const dom = new JSDOM(testHtml);
    const listElement = dom.window.document.querySelector('ol');
    
    if (!listElement) {
      console.error('No list element found');
      return;
    }
    
    const processor = new ImprovedListProcessor();
    
    // Simple nodeConverter that just returns text content
    const simpleNodeConverter = (node, depth) => {
      if (node.nodeType === 3) { // Text node
        return node.textContent || '';
      } else if (node.nodeType === 1) { // Element node
        return node.textContent || '';
      }
      return '';
    };
    
    const result = processor.convertList(listElement, 0, simpleNodeConverter);
    
    console.log('=== Direct Processor Output ===');
    console.log(result);
    console.log('\n=== End Output ===\n');
    
    // Analyze the result
    const lines = result.split('\n');
    const continuationMarkers = lines.filter(line => line.trim() === '+');
    console.log(`Found ${continuationMarkers.length} continuation markers (+)`);
    
    if (continuationMarkers.length === 0) {
      console.log('ERROR: No continuation markers found!');
      console.log('Expected continuation markers for additional paragraphs.');
    } else {
      console.log('SUCCESS: Found continuation markers.');
    }
    
  } catch (error) {
    console.error('Error during processing:', error);
  }
}

debugListProcessor();
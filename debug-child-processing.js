import { JSDOM } from 'jsdom';

// Minimal test to see what each child produces
function debugChildProcessing() {
  console.log('Debugging child node processing...\n');
  
  const testHtml = `<p>Click an investment item's <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button to connect it to the activity.</p>`;
  
  const dom = new JSDOM(testHtml);
  const paragraph = dom.window.document.querySelector('p');
  
  if (paragraph) {
    console.log('=== CHILD NODES ===');
    Array.from(paragraph.childNodes).forEach((child, index) => {
      console.log(`Child ${index}:`);
      console.log(`  Type: ${child.nodeType} (${child.nodeType === 3 ? 'TEXT' : child.nodeType === 1 ? 'ELEMENT' : 'OTHER'})`);
      console.log(`  Tag: ${child.nodeType === 1 ? child.tagName : 'N/A'}`);
      console.log(`  Content: "${child.textContent}"`);
      console.log(`  Class: ${child.nodeType === 1 ? child.className : 'N/A'}`);
      console.log('');
    });
  }
}

debugChildProcessing();
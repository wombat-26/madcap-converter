import { JSDOM } from 'jsdom';

const testHTML = '<p>The <em>panel</em>is not showing.</p>';

console.log('Input HTML:', testHTML);

const dom = new JSDOM(testHTML);
const document = dom.window.document;
const paragraph = document.querySelector('p');

console.log('\nDOM structure analysis:');
console.log('Child nodes of paragraph:');

for (let i = 0; i < paragraph.childNodes.length; i++) {
  const node = paragraph.childNodes[i];
  console.log(`Node ${i}:`);
  console.log(`  Type: ${node.nodeType} (${node.nodeType === 3 ? 'TEXT' : node.nodeType === 1 ? 'ELEMENT' : 'OTHER'})`);
  console.log(`  Content: "${node.textContent}"`);
  if (node.nodeType === 1) {
    console.log(`  Tag: ${node.tagName}`);
  }
}

console.log('\nTesting emphasis element siblings:');
const em = paragraph.querySelector('em');
console.log('Previous sibling:', em.previousSibling ? `"${em.previousSibling.textContent}"` : 'null');
console.log('Next sibling:', em.nextSibling ? `"${em.nextSibling.textContent}"` : 'null');

if (em.nextSibling) {
  console.log('Next sibling node type:', em.nextSibling.nodeType);
  console.log('Next sibling starts with non-whitespace?', /^[^\s]/.test(em.nextSibling.textContent));
}
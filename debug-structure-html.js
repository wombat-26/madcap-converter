const fs = await import('fs/promises');
const path = await import('path');
const { JSDOM } = await import('jsdom');

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Analyzing Original HTML Structure ===');
const dom = new JSDOM(content);
const document = dom.window.document;

// Find the OL and see what precedes it
const ol = document.querySelector('ol');
if (ol) {
  console.log('\n--- OL Found ---');
  console.log('OL parent:', ol.parentElement?.tagName);
  console.log('OL previous sibling:', ol.previousElementSibling?.tagName);
  console.log('OL previous sibling content:', ol.previousElementSibling?.textContent?.trim().substring(0, 100));
  
  // Check what comes before the OL in the DOM
  let current = ol.previousElementSibling;
  let count = 0;
  console.log('\n--- Elements before OL ---');
  while (current && count < 5) {
    console.log(`${count + 1}. ${current.tagName}: ${current.textContent?.trim().substring(0, 50)}`);
    current = current.previousElementSibling;
    count++;
  }
  
  // Look for any LI elements that might be getting involved
  const listItems = document.querySelectorAll('li');
  console.log('\n--- LI elements in document ---');
  listItems.forEach((li, i) => {
    console.log(`LI ${i + 1}: ${li.textContent?.trim().substring(0, 50)}`);
    console.log(`  Parent: ${li.parentElement?.tagName}`);
  });
}
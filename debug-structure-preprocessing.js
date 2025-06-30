const MadCapPreprocessor = (await import('./build/services/madcap-preprocessor.js')).MadCapPreprocessor;
const { JSDOM } = await import('jsdom');
const fs = await import('fs/promises');
const path = await import('path');

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Before Preprocessing ===');
console.log('Original OL count:', (content.match(/<ol[^>]*>/g) || []).length);

const preprocessor = new MadCapPreprocessor();
const result = await preprocessor.preprocessMadCapContent(content, filePath, 'writerside-markdown');

console.log('\n=== After Preprocessing ===');
console.log('Processed OL count:', (result.match(/<ol[^>]*>/g) || []).length);

// Check the DOM structure
const dom = new JSDOM(result);
const document = dom.window.document;
const olElements = document.querySelectorAll('ol');
console.log('\nOL elements found:', olElements.length);

olElements.forEach((ol, i) => {
  console.log(`\nOL ${i + 1}:`);
  console.log('Parent element:', ol.parentElement?.tagName);
  console.log('Parent class:', ol.parentElement?.className);
  console.log('OL HTML:', ol.outerHTML.substring(0, 200) + '...');
});
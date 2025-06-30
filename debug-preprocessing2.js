const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;
const { JSDOM } = await import('jsdom');
const fs = await import('fs/promises');
const path = await import('path');

const converter = new WritersideMarkdownConverter();

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const originalContent = await fs.readFile(filePath, 'utf8');

console.log('=== Testing Preprocessing ===');

// Step 1: Show original HTML around the ol element
const olMatch = originalContent.match(/<ol[^>]*>[\s\S]*?<\/ol>/);
if (olMatch) {
  console.log('Original OL element:', olMatch[0].substring(0, 300) + '...');
}

// Step 2: See what happens during HTML preprocessing  
const preprocessedHtml = await converter.htmlPreprocessor.preprocess(originalContent);
const olMatchPreprocessed = preprocessedHtml.match(/<ol[^>]*>[\s\S]*?<\/ol>/);
if (olMatchPreprocessed) {
  console.log('\nAfter HTML preprocessing:', olMatchPreprocessed[0].substring(0, 300) + '...');
}

// Step 3: Check DOM structure
const dom = new JSDOM(preprocessedHtml);
const document = dom.window.document;
const olElement = document.querySelector('ol');
if (olElement) {
  console.log('\nDOM structure:');
  console.log('OL element:', olElement.outerHTML.substring(0, 300) + '...');
  console.log('Parent element:', olElement.parentElement?.tagName);
  console.log('Parent parent element:', olElement.parentElement?.parentElement?.tagName);
}
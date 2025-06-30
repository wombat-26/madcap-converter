const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;
const fs = await import('fs/promises');
const path = await import('path');

// Patch the method to add debugging
const originalHandleMixedOrderedList = WritersideMarkdownConverter.prototype.handleMixedOrderedList;
WritersideMarkdownConverter.prototype.handleMixedOrderedList = function(element, document) {
  console.log('\n=== handleMixedOrderedList called ===');
  console.log('Element HTML:', element.outerHTML.substring(0, 200) + '...');
  console.log('Children count:', element.children.length);
  
  const result = originalHandleMixedOrderedList.call(this, element, document);
  console.log('Result:', JSON.stringify(result));
  return result;
};

const originalHandleOrderedList = WritersideMarkdownConverter.prototype.handleOrderedList;
WritersideMarkdownConverter.prototype.handleOrderedList = function(element, document, indentLevel = 0) {
  console.log('\n=== handleOrderedList called ===');
  console.log('Element HTML:', element.outerHTML.substring(0, 200) + '...');
  console.log('Indent level:', indentLevel);
  
  const result = originalHandleOrderedList.call(this, element, document, indentLevel);
  console.log('Result:', JSON.stringify(result));
  return result;
};

const converter = new WritersideMarkdownConverter();

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Testing Structure.htm ===');
const result = await converter.convert(content, {
  format: 'writerside-markdown',
  inputType: 'html',
  inputPath: filePath
});

console.log('\n=== Final Result ===');
console.log('Contains 1. Activity:', result.content.includes('1. **Activity Hierarchy:**'));
console.log('Contains a. Activity:', result.content.includes('a. **Activity Hierarchy:**'));

// Show the list section
const lines = result.content.split('\n');
const listStart = lines.findIndex(line => line.includes('**Activity Hierarchy:**'));
if (listStart >= 0) {
  console.log('\nList section:');
  for (let i = Math.max(0, listStart - 2); i <= Math.min(lines.length - 1, listStart + 8); i++) {
    console.log(`${i}: ${JSON.stringify(lines[i])}`);
  }
}
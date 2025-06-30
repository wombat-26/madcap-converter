const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;
const fs = await import('fs/promises');
const path = await import('path');

// Patch the handleListItem method to add debugging
const originalHandleListItem = WritersideMarkdownConverter.prototype.handleListItem;
WritersideMarkdownConverter.prototype.handleListItem = function(item, document, marker, indentLevel) {
  console.log(`\n=== handleListItem called ===`);
  console.log('Marker:', marker);
  console.log('Indent level:', indentLevel);
  console.log('Item HTML:', item.outerHTML.substring(0, 200) + '...');
  
  // Check for nested lists
  const nestedOls = item.querySelectorAll('ol');
  const nestedUls = item.querySelectorAll('ul');
  console.log('Nested OLs:', nestedOls.length);
  console.log('Nested ULs:', nestedUls.length);
  
  if (nestedOls.length > 0) {
    console.log('Found nested OL:', nestedOls[0].outerHTML.substring(0, 100) + '...');
  }
  
  const result = originalHandleListItem.call(this, item, document, marker, indentLevel);
  console.log('handleListItem result:', JSON.stringify(result));
  return result;
};

const converter = new WritersideMarkdownConverter();

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Testing List Item Processing ===');
const result = await converter.convert(content, {
  format: 'writerside-markdown',
  inputType: 'html',
  inputPath: filePath
});

console.log('\n=== Final Check ===');
console.log('Final result contains a.:', result.content.includes('a. **Activity Hierarchy:**'));
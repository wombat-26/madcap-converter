import fs from 'fs/promises';

const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

// Patch the converter methods to add debugging
const originalHandleEmphasis = WritersideMarkdownConverter.prototype.handleEmphasis;
WritersideMarkdownConverter.prototype.handleEmphasis = function(element, content) {
  const result = originalHandleEmphasis.call(this, element, content);
  if (content.includes('Delete')) {
    console.log('=== EMPHASIS PROCESSING ===');
    console.log('Input content:', JSON.stringify(content));
    console.log('Next sibling:', element.nextSibling?.textContent ? JSON.stringify(element.nextSibling.textContent) : 'none');
    console.log('Output result:', JSON.stringify(result));
  }
  return result;
};

const originalConvertDomToMarkdown = WritersideMarkdownConverter.prototype.convertDomToMarkdown;
WritersideMarkdownConverter.prototype.convertDomToMarkdown = function(element, document) {
  if (element.tagName && element.tagName.toLowerCase() === 'p' && element.textContent.includes('Delete')) {
    console.log('=== PARAGRAPH PROCESSING ===');
    console.log('P element content:', JSON.stringify(element.textContent));
    console.log('P innerHTML:', element.innerHTML);
    console.log('P child nodes:');
    Array.from(element.childNodes).forEach((node, i) => {
      if (node.nodeType === 3) {
        console.log(`  ${i}: TEXT_NODE - "${node.textContent}"`);
      } else if (node.nodeType === 1) {
        console.log(`  ${i}: ELEMENT_NODE - <${node.tagName.toLowerCase()}> - "${node.textContent}"`);
      }
    });
  }
  
  const result = originalConvertDomToMarkdown.call(this, element, document);
  
  if (element.tagName && element.tagName.toLowerCase() === 'p' && element.textContent.includes('Delete')) {
    console.log('P conversion result:', JSON.stringify(result));
  }
  
  return result;
};

const converter = new WritersideMarkdownConverter();
const inputFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-08 DeleteActivity.htm';
const content = await fs.readFile(inputFile, 'utf8');

console.log('Running conversion with debug tracing...\n');

const result = await converter.convert(content, {
  format: 'writerside-markdown',
  inputType: 'html',
  inputPath: inputFile
});

console.log('\n=== FINAL RESULT SECTION ===');
const startIdx = result.content.indexOf('4. Click');
const endIdx = result.content.indexOf('deleted.', startIdx) + 8;
const section = result.content.substring(startIdx, endIdx);
console.log('Final section:', JSON.stringify(section));
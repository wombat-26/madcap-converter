import fs from 'fs/promises';

const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

// Patch methods to add debugging
const originalConvertDomToMarkdown = WritersideMarkdownConverter.prototype.convertDomToMarkdown;
WritersideMarkdownConverter.prototype.convertDomToMarkdown = function(element, document) {
  const result = originalConvertDomToMarkdown.call(this, element, document);
  
  if (element.tagName && element.tagName.toLowerCase() === 'p' && element.textContent.includes('Delete')) {
    console.log('=== P Element Processing ===');
    console.log('Element innerHTML:', element.innerHTML);
    console.log('DOM result:', JSON.stringify(result));
  }
  
  return result;
};

const originalHandleParagraph = WritersideMarkdownConverter.prototype.handleParagraph;
WritersideMarkdownConverter.prototype.handleParagraph = function(element, content, document) {
  if (content.includes('Delete')) {
    console.log('=== Handle Paragraph ===');
    console.log('Input content:', JSON.stringify(content));
    console.log('Trimmed content:', JSON.stringify(content.trim()));
  }
  
  const result = originalHandleParagraph.call(this, element, content, document);
  
  if (content.includes('Delete')) {
    console.log('Paragraph result:', JSON.stringify(result));
  }
  
  return result;
};

const originalPostProcess = WritersideMarkdownConverter.prototype.postProcessMarkdown;
WritersideMarkdownConverter.prototype.postProcessMarkdown = function(content) {
  if (content.includes('Delete')) {
    console.log('=== Post Process Input ===');
    console.log('Pre-post-process:', JSON.stringify(content));
  }
  
  const result = originalPostProcess.call(this, content);
  
  if (content.includes('Delete')) {
    console.log('Post-process result:', JSON.stringify(result));
  }
  
  return result;
};

const converter = new WritersideMarkdownConverter();
const input = '<p>Click <i>Delete</i>.</p>';

console.log('=== Starting Conversion ===');
console.log('Input:', input);

const result = await converter.convert(input, {
  format: 'writerside-markdown',
  inputType: 'html'
});

console.log('\n=== Final Result ===');
console.log('Result:', JSON.stringify(result.content));
console.log('Missing period:', !result.content.includes('.'));
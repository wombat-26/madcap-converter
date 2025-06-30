const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

// Patch the post-processing method to add debugging
const converter = new WritersideMarkdownConverter();
const originalPostProcess = converter.postProcessMarkdown;

converter.postProcessMarkdown = function(content) {
  console.log('\n=== Post-processing steps ===');
  console.log('Input to post-processing:', content);
  
  // Call original method
  const result = originalPostProcess.call(this, content);
  
  console.log('Output from post-processing:', result);
  return result;
};

// Also patch removeFilePathArtifacts
const originalRemoveArtifacts = converter.removeFilePathArtifacts;
converter.removeFilePathArtifacts = function(content) {
  console.log('\n=== removeFilePathArtifacts ===');
  console.log('Input:', content);
  
  const result = originalRemoveArtifacts.call(this, content);
  
  console.log('Output:', result);
  return result;
};

// Test conversion
const html = '<img src="https://example.com/image.png" alt="External">';
console.log('Converting:', html);

const result = await converter.convert(html, {
  format: 'writerside-markdown',
  inputType: 'html'
});

console.log('\nFinal result:', result.content);
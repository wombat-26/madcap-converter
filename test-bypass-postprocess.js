const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

const converter = new WritersideMarkdownConverter();

// Override the postProcessMarkdown method to bypass it
const originalPostProcess = converter.postProcessMarkdown.bind(converter);
converter.postProcessMarkdown = function(content) {
  console.log('[DEBUG] Input to postProcessMarkdown:', content);
  const result = originalPostProcess.call(this, content);
  console.log('[DEBUG] Output from postProcessMarkdown:', result);
  return result;
};

// Test the exact user case
const userCase = '<p>Some text with image: <img src="../Images/Funktionen/Linked Paths 1.png" alt="Linked Paths"></p>';

console.log('=== Testing With Post-Processing Debug ===\n');

const result = await converter.convert(userCase, {
  format: 'writerside-markdown',
  inputType: 'html'
});

console.log('\nFinal result:', result.content);

// Now test bypassing post-processing entirely
console.log('\n=== Testing WITHOUT Post-Processing ===\n');

converter.postProcessMarkdown = function(content) {
  console.log('[DEBUG] Post-processing BYPASSED');
  return content; // Return content unchanged
};

const resultNoPostProcess = await converter.convert(userCase, {
  format: 'writerside-markdown',
  inputType: 'html'
});

console.log('Result without post-processing:', resultNoPostProcess.content);

// Extract paths from both results
const pathWithPostProcess = result.content.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
const pathWithoutPostProcess = resultNoPostProcess.content.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];

console.log('\nComparison:');
console.log('With post-processing:    ', pathWithPostProcess);
console.log('Without post-processing: ', pathWithoutPostProcess);
console.log('Post-processing is the culprit:', pathWithPostProcess !== pathWithoutPostProcess ? 'YES' : 'NO');
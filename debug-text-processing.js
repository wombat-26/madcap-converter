const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

// Create an instance to access the methods
const converter = new WritersideMarkdownConverter();

// Test the text cleaning methods
const testPeriod = '.';
console.log('Original text:', JSON.stringify(testPeriod));

// Test cleanTextContent (this is private, so we'll test through conversion)
console.log('Testing text processing pipeline...');

// Let's trace through a simple conversion step by step
const input = '<p>Test.</p>';
console.log('Input HTML:', input);

const result = await converter.convert(input, {
  format: 'writerside-markdown',
  inputType: 'html'
});

console.log('Result:', JSON.stringify(result.content));
console.log('Contains period:', result.content.includes('.'));

// Test another case
const input2 = '<p>Test<span>.</span></p>';
console.log('\nInput with span period:', input2);

const result2 = await converter.convert(input2, {
  format: 'writerside-markdown',
  inputType: 'html'
});

console.log('Result2:', JSON.stringify(result2.content));
console.log('Contains period:', result2.content.includes('.'));
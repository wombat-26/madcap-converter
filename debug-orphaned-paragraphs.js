const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

const converter = new WritersideMarkdownConverter();

const input = `
  <ol>
    <li><p>Step one</p></li>
    <p>Additional information</p>
    <li><p>Step two</p></li>
  </ol>
`;

console.log('=== Testing Orphaned Paragraphs ===');
console.log('Input:', input);

const result = await converter.convert(input, {
  format: 'writerside-markdown',
  inputType: 'html'
});

console.log('\n=== Result ===');
console.log('Content:', JSON.stringify(result.content));
console.log('\n=== Content (visible) ===');
console.log(result.content);

console.log('\n=== Test Expectations ===');
console.log('Contains "1. Step one.":', result.content.includes('1. Step one.'));
console.log('Contains "Additional information":', result.content.includes('Additional information'));
console.log('Contains "2. Step two.":', result.content.includes('2. Step two.'));
import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';

const converter = new WritersideMarkdownConverter();

console.log('Testing emphasis spacing...');

const testCases = [
  '<p>The <em>panel</em>is not showing.</p>',
  '<p>Click<em>here</em> to continue.</p>',
  '<p>This is <em>important</em>.</p>'
];

for (const input of testCases) {
  console.log(`\nInput: ${input}`);
  
  try {
    const options = {
      format: 'writerside-markdown',
      preserveFormatting: false
    };
    
    const result = await converter.convert(input, options);
    console.log(`Output: "${result.content.trim()}"`);
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }
}
import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';

const converter = new WritersideMarkdownConverter();

console.log('Testing what the converter actually returns...');

const input = '<p>The <em>panel</em>is not showing.</p>';
console.log(`Input: ${input}`);

const options = {
  format: 'writerside-markdown',
  preserveFormatting: false
};

try {
  const result = await converter.convert(input, options);
  
  console.log(`\nRaw result.content:`);
  console.log(`"${result.content}"`);
  console.log(`Length: ${result.content.length}`);
  console.log(`Chars:`, [...result.content].map(c => c === '\n' ? '\\n' : c));
  
  console.log(`\nAfter trim():`);
  const trimmed = result.content.trim();
  console.log(`"${trimmed}"`);
  console.log(`Length: ${trimmed.length}`);
  console.log(`Chars:`, [...trimmed].map(c => c === '\n' ? '\\n' : c));
  
  // Check if period is at the end
  console.log(`\nEnds with period? ${result.content.endsWith('.')}`);
  console.log(`Trimmed ends with period? ${trimmed.endsWith('.')}`);
  
} catch (error) {
  console.log(`Error: ${error.message}`);
}
import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';

const converter = new WritersideMarkdownConverter();

// Test cleanTextContent method
const testTexts = [
  "The ",
  "is not showing.",
  " ",
  ".",
  "text",
  "  multiple  spaces  "
];

console.log('Testing cleanTextContent method:');

for (const text of testTexts) {
  // We need to access the private method, let's create a test wrapper
  const cleaned = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2009/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\t/g, ' ')
    .replace(/   +/g, ' ');
    
  let result;
  if (cleaned.match(/^[.!?;:,\s]+$/)) {
    result = cleaned;
  } else {
    result = cleaned.trim();
  }
  
  console.log(`Input: "${text}" (length: ${text.length})`);
  console.log(`Output: "${result}" (length: ${result.length})`);
  console.log('---');
}
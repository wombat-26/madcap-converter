const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;
const { JSDOM } = await import('jsdom');

// Test the DOM parsing and conversion directly
const htmlAfterVariableProcessing = '<p>Company: <var name="General.CompanyName"/></p>';

console.log('=== DOM Conversion Test ===');
console.log('HTML after variable processing:', htmlAfterVariableProcessing);

const dom = new JSDOM(htmlAfterVariableProcessing);
const document = dom.window.document;

console.log('\n=== DOM Structure ===');
console.log('Body HTML:', document.body.innerHTML);

// Find all elements
const allElements = document.body.querySelectorAll('*');
console.log('\n=== All Elements ===');
allElements.forEach((el, i) => {
  console.log(`${i}: ${el.tagName.toLowerCase()} - ${el.outerHTML}`);
});

// Test the converter
const converter = new WritersideMarkdownConverter();
const result = converter.convertDomToMarkdown(document.body, document);

console.log('\n=== Conversion Result ===');
console.log('Result:', JSON.stringify(result));
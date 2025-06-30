const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

const converter = new WritersideMarkdownConverter();

// Test inline vs block behavior
const inlineTest = '<p>Click <img src="../Images/GUI-Elemente/SearchCircle.png" class="IconInline" width="16"> to search.</p>';
const blockTest = '<p><img src="../Images/Screenshots/main.png" width="400" alt="Main screen"></p>';

console.log('=== Testing Inline vs Block Image Behavior ===\n');

console.log('1. Inline image test:');
const inlineResult = await converter.convert(inlineTest, {
  format: 'writerside-markdown',
  inputType: 'html'
});
console.log('Input: ', inlineTest);
console.log('Output:', inlineResult.content.trim());
console.log('Path:  ', inlineResult.content.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1]);

console.log('\n2. Block image test:');
const blockResult = await converter.convert(blockTest, {
  format: 'writerside-markdown',
  inputType: 'html'
});
console.log('Input: ', blockTest);
console.log('Output:', blockResult.content.trim());
console.log('Path:  ', blockResult.content.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1]);

// Check that both have the correct ../images/Images/ prefix
const inlinePath = inlineResult.content.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
const blockPath = blockResult.content.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];

console.log('\n=== Results Summary ===');
console.log('Inline image path starts with ../images/Images/:', inlinePath?.startsWith('../images/Images/') ? '✅' : '❌');
console.log('Block image path starts with ../images/Images/ :', blockPath?.startsWith('../images/Images/') ? '✅' : '❌');
console.log('Inline image remains inline (no line breaks)  :', !inlineResult.content.includes('\n![') ? '✅' : '❌');
console.log('Block image has proper spacing               :', blockResult.content.includes('\n![') ? '✅' : '❌');
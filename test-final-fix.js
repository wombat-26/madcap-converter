const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

const converter = new WritersideMarkdownConverter();

// Test the exact user case
const userCase = '<p>In the *Activities* view, click <img src="../Images/Funktionen/Linked Paths 1.png" class="IconInline" width="16"> to open.</p>';

console.log('=== Testing User\'s Final Case ===\n');

const result = await converter.convert(userCase, {
  format: 'writerside-markdown',
  inputType: 'html'
});

console.log('Input HTML:', userCase);
console.log('\nOutput markdown:', result.content);

// Extract the image path
const pathMatch = result.content.match(/!\[[^\]]*\]\(([^)]+)\)/);
if (pathMatch) {
  console.log('\nExtracted image path:', pathMatch[1]);
  console.log('Expected path:        ../images/Images/Funktionen/Linked Paths 1.png');
  console.log('SUCCESS:', pathMatch[1] === '../images/Images/Funktionen/Linked Paths 1.png' ? '✅' : '❌');
} else {
  console.log('❌ No image path found in output');
}

// Test additional cases 
const testCases = [
  {
    name: 'Standard relative path',
    html: '<img src="../Images/GUI-Elemente/SearchCircle.png" alt="Search">',
    expected: '../images/Images/GUI-Elemente/SearchCircle.png'
  },
  {
    name: 'Double images path',
    html: '<img src="/images/Images/GUI-Elemente/CloseCircle.png" alt="Close">',
    expected: '../images/Images/GUI-Elemente/CloseCircle.png'
  },
  {
    name: 'Resources path',
    html: '<img src="../Resources/Images/Buttons/OK.png" alt="OK">',
    expected: '../images/Images/Buttons/OK.png'
  }
];

console.log('\n=== Testing Additional Cases ===\n');

for (const test of testCases) {
  const result = await converter.convert(test.html, {
    format: 'writerside-markdown',
    inputType: 'html'
  });
  
  const pathMatch = result.content.match(/!\[[^\]]*\]\(([^)]+)\)/);
  const actualPath = pathMatch ? pathMatch[1] : 'Not found';
  const success = actualPath === test.expected ? '✅' : '❌';
  
  console.log(`${success} ${test.name}`);
  console.log(`  Expected: ${test.expected}`);
  console.log(`  Actual:   ${actualPath}`);
  console.log('---');
}
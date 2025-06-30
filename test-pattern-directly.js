// Test the regex pattern directly
const testText = '../images/Images/Funktionen/Linked Paths 1.png';

console.log('=== Testing Regex Pattern Directly ===\n');

console.log('Original text:', testText);

// Old pattern (problematic)
const oldPattern = /([.!?;:])\1+/g;
const oldResult = testText.replace(oldPattern, '$1');
console.log('Old pattern result:', oldResult);

// New pattern (fixed)
const newPattern = /([.!?;:])\1+(?!\/)/g;
const newResult = testText.replace(newPattern, '$1');
console.log('New pattern result:', newResult);

// Test with different inputs
const testCases = [
  '../images/test.png',
  './images/test.png', 
  'Text with.. double periods.',
  'Text with... triple periods.',
  'Normal text with !!! exclamations',
  'Path ../folder/file.txt',
  'Another../ weird case'
];

console.log('\n=== Testing Various Cases ===');
for (const testCase of testCases) {
  const fixed = testCase.replace(newPattern, '$1');
  console.log(`"${testCase}" -> "${fixed}" ${testCase === fixed ? '(no change)' : '(CHANGED)'}`);
}
// Test the regex patterns
const testStrings = [
  'For instructions, see <<Configur,Configuring Planned Impact>>.',
  'Some <strong>HTML</strong> content',
  'Mixed <<anchor,text>> and <em>HTML</em>',
  '<p>Paragraph</p>',
  '<<test>> simple anchor',
  '<<test,with text>> anchor with text'
];

console.log('=== Testing original regex ===');
const originalRegex = /<[^>]+>/g;
testStrings.forEach(str => {
  const result = str.replace(originalRegex, '');
  console.log(`"${str}" => "${result}"`);
});

console.log('\n=== Testing proposed fix ===');
const fixedRegex = /<(?!<[^>]+>>)[^>]+>/g;
testStrings.forEach(str => {
  const result = str.replace(fixedRegex, '');
  console.log(`"${str}" => "${result}"`);
});

console.log('\n=== Better regex approach ===');
// A better approach: only match HTML-like tags, not AsciiDoc cross-references
const betterRegex = /<(?![<>])[^>]*>/g;
testStrings.forEach(str => {
  const result = str.replace(betterRegex, '');
  console.log(`"${str}" => "${result}"`);
});

console.log('\n=== Even better: match actual HTML tags ===');
// Match HTML tags but not AsciiDoc xrefs (which don't have tag names after <)
const htmlOnlyRegex = /<\/?[a-zA-Z][^>]*>/g;
testStrings.forEach(str => {
  const result = str.replace(htmlOnlyRegex, '');
  console.log(`"${str}" => "${result}"`);
});
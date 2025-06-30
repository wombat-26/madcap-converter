const MadCapPreprocessor = (await import('./build/services/madcap-preprocessor.js')).MadCapPreprocessor;
const { JSDOM } = await import('jsdom');
const fs = await import('fs/promises');
const path = await import('path');

// Patch the shouldNestSiblingList method to add debugging
const originalShouldNestSiblingList = MadCapPreprocessor.prototype.shouldNestSiblingList;
MadCapPreprocessor.prototype.shouldNestSiblingList = function(listItem, candidateList) {
  console.log('\n=== shouldNestSiblingList Debug ===');
  console.log('List item text:', JSON.stringify(listItem.textContent?.trim().substring(0, 50)));
  console.log('Candidate list tag:', candidateList.tagName);
  
  // Check siblings between list item and candidate list
  let sibling = listItem.nextElementSibling;
  const siblingsInBetween = [];
  while (sibling && sibling !== candidateList) {
    siblingsInBetween.push(`${sibling.tagName}: ${sibling.textContent?.trim().substring(0, 30)}`);
    sibling = sibling.nextElementSibling;
  }
  console.log('Siblings between:', siblingsInBetween);
  
  const result = originalShouldNestSiblingList.call(this, listItem, candidateList);
  console.log('Should nest result:', result);
  return result;
};

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Testing Structure.htm shouldNestSiblingList ===');
const preprocessor = new MadCapPreprocessor();
const result = await preprocessor.preprocessMadCapContent(content, filePath, 'writerside-markdown');

console.log('\n=== Final Check ===');
const dom = new JSDOM(result);
const document = dom.window.document;
const olElement = document.querySelector('ol');
if (olElement) {
  console.log('OL parent:', olElement.parentElement?.tagName);
  if (olElement.parentElement?.tagName === 'LI') {
    console.log('❌ OL is nested inside LI');
  } else {
    console.log('✅ OL is properly at body level');
  }
}
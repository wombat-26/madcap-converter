const MadCapPreprocessor = (await import('./build/services/madcap-preprocessor.js')).MadCapPreprocessor;
const { JSDOM } = await import('jsdom');
const fs = await import('fs/promises');
const path = await import('path');

// Patch the shouldNestSiblingList method to add debugging
const originalShouldNestSiblingList = MadCapPreprocessor.prototype.shouldNestSiblingList;
MadCapPreprocessor.prototype.shouldNestSiblingList = function(listItem, candidateList) {
  console.log('\n=== shouldNestSiblingList called ===');
  console.log('List item text:', JSON.stringify(listItem.textContent?.trim().substring(0, 100)));
  console.log('Candidate list items:', candidateList.querySelectorAll('li').length);
  console.log('List item parent tag:', listItem.parentElement?.tagName);
  console.log('Grandparent tag:', listItem.parentElement?.parentElement?.tagName);
  
  const result = originalShouldNestSiblingList.call(this, listItem, candidateList);
  console.log('Should nest:', result);
  return result;
};

const preprocessor = new MadCapPreprocessor();

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Testing MadCap Preprocessing ===');
const result = await preprocessor.preprocessMadCapContent(content, filePath, 'writerside-markdown');

console.log('\n=== Check if OL is nested ===');
const dom = new JSDOM(result);
const document = dom.window.document;
const olElement = document.querySelector('ol');
if (olElement) {
  console.log('OL parent:', olElement.parentElement?.tagName);
  console.log('OL grandparent:', olElement.parentElement?.parentElement?.tagName);
  if (olElement.parentElement?.tagName === 'LI') {
    console.log('❌ OL is nested inside LI - problem still exists');
  } else {
    console.log('✅ OL is not nested inside LI - problem fixed');
  }
}
const MadCapPreprocessor = (await import('./build/services/madcap-preprocessor.js')).MadCapPreprocessor;
const { JSDOM } = await import('jsdom');
const fs = await import('fs/promises');
const path = await import('path');

// Patch the fixListNesting method to add debugging
const originalFixListNesting = MadCapPreprocessor.prototype.fixListNesting;
MadCapPreprocessor.prototype.fixListNesting = function(document) {
  console.log('\n=== fixListNesting called ===');
  
  const allLists = Array.from(document.querySelectorAll('ol, ul'));
  console.log('Found lists:', allLists.length);
  
  return originalFixListNesting.call(this, document);
};

// Also patch shouldNestSiblingList
const originalShouldNestSiblingList = MadCapPreprocessor.prototype.shouldNestSiblingList;
MadCapPreprocessor.prototype.shouldNestSiblingList = function(listItem, candidateList) {
  console.log('\n=== shouldNestSiblingList called ===');
  console.log('List item text:', JSON.stringify(listItem.textContent?.trim().substring(0, 50)));
  console.log('Candidate list tag:', candidateList.tagName);
  console.log('Candidate list items count:', candidateList.querySelectorAll('li').length);
  
  const result = originalShouldNestSiblingList.call(this, listItem, candidateList);
  console.log('Should nest result:', result);
  return result;
};

const preprocessor = new MadCapPreprocessor();

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Testing MadCap Preprocessing ===');
const result = await preprocessor.preprocessMadCapContent(content, filePath, 'writerside-markdown');

console.log('\n=== Check final structure ===');
const dom = new JSDOM(result);
const document = dom.window.document;
const olElement = document.querySelector('ol');
if (olElement) {
  console.log('OL parent:', olElement.parentElement?.tagName);
  if (olElement.parentElement?.tagName === 'LI') {
    console.log('❌ OL is still nested inside LI');
    console.log('Parent LI text:', JSON.stringify(olElement.parentElement.textContent?.trim().substring(0, 100)));
  } else {
    console.log('✅ OL is not nested inside LI');
  }
}
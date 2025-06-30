const MadCapPreprocessor = (await import('./build/services/madcap-preprocessor.js')).MadCapPreprocessor;
const { JSDOM } = await import('jsdom');
const fs = await import('fs/promises');
const path = await import('path');

// Patch cleanupDOMStructure to see what happens step by step
const originalCleanupDOMStructure = MadCapPreprocessor.prototype.cleanupDOMStructure;
MadCapPreprocessor.prototype.cleanupDOMStructure = function(document, outputFormat) {
  console.log('\n=== Before cleanupDOMStructure ===');
  const ol = document.querySelector('ol');
  if (ol) {
    console.log('OL parent before cleanup:', ol.parentElement?.tagName);
    console.log('OL previous sibling before cleanup:', ol.previousElementSibling?.tagName);
  }
  
  // Call original method
  const result = originalCleanupDOMStructure.call(this, document, outputFormat);
  
  console.log('\n=== After cleanupDOMStructure ===');
  const olAfter = document.querySelector('ol');
  if (olAfter) {
    console.log('OL parent after cleanup:', olAfter.parentElement?.tagName);
    console.log('OL previous sibling after cleanup:', olAfter.previousElementSibling?.tagName);
  }
  
  return result;
};

// Patch fixListNesting to see what happens
const originalFixListNesting = MadCapPreprocessor.prototype.fixListNesting;
MadCapPreprocessor.prototype.fixListNesting = function(document) {
  console.log('\n=== Before fixListNesting ===');
  const ol = document.querySelector('ol');
  if (ol) {
    console.log('OL parent before fixListNesting:', ol.parentElement?.tagName);
  }
  
  const result = originalFixListNesting.call(this, document);
  
  console.log('\n=== After fixListNesting ===');
  const olAfter = document.querySelector('ol');
  if (olAfter) {
    console.log('OL parent after fixListNesting:', olAfter.parentElement?.tagName);
  }
  
  return result;
};

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Testing Structure.htm DOM Processing Steps ===');
const preprocessor = new MadCapPreprocessor();
const result = await preprocessor.preprocessMadCapContent(content, filePath, 'writerside-markdown');
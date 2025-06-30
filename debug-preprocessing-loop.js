const MadCapPreprocessor = (await import('./build/services/madcap-preprocessor.js')).MadCapPreprocessor;
const { JSDOM } = await import('jsdom');
const fs = await import('fs/promises');
const path = await import('path');

// Patch the processListStructures method to add debugging
const originalProcessListStructures = MadCapPreprocessor.prototype.processListStructures;
MadCapPreprocessor.prototype.processListStructures = function(document) {
  console.log('\n=== processListStructures called ===');
  
  // Add debugging to the list item processing loop
  const allListItems = Array.from(document.querySelectorAll('li'));
  console.log('Found list items:', allListItems.length);
  
  for (const listItem of allListItems) {
    let nextSibling = listItem.nextElementSibling;
    console.log('\n--- Processing list item ---');
    console.log('List item text:', JSON.stringify(listItem.textContent?.trim().substring(0, 50)));
    console.log('Next sibling tag:', nextSibling?.tagName);
    
    if (nextSibling && (nextSibling.tagName.toLowerCase() === 'ol' || nextSibling.tagName.toLowerCase() === 'ul')) {
      console.log('Found sibling list:', nextSibling.tagName);
      
      // Check if this looks like a genuine sub-list vs a separate document section
      const shouldNest = this.shouldNestSiblingList(listItem, nextSibling);
      console.log('Should nest result:', shouldNest);
      
      if (shouldNest) {
        console.log('🔄 Nesting list under list item');
        const listToMove = nextSibling;
        nextSibling = nextSibling.nextElementSibling; // Save next before moving
        
        // Nest this sub-list under the list item
        listItem.appendChild(listToMove);
      } else {
        console.log('✅ Keeping lists separate');
      }
    } else {
      console.log('No sibling list to process');
    }
  }
  
  // Continue with original method logic
  return originalProcessListStructures.call(this, document);
};

const preprocessor = new MadCapPreprocessor();

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Testing MadCap Preprocessing ===');
const result = await preprocessor.preprocessMadCapContent(content, filePath, 'writerside-markdown');
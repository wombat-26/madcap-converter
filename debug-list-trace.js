import fs from 'fs/promises';

const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

// Patch the handleMixedOrderedList method to add debugging
const originalHandleMixedOrderedList = WritersideMarkdownConverter.prototype.handleMixedOrderedList;
WritersideMarkdownConverter.prototype.handleMixedOrderedList = function(element, document) {
  console.log('=== HANDLE MIXED ORDERED LIST ===');
  
  const children = Array.from(element.children);
  console.log(`Processing ${children.length} children`);
  
  let result = '';
  let listItemNumber = 1;
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const tagName = child.tagName.toLowerCase();
    
    if (tagName === 'li') {
      console.log(`\n--- Processing LI ${listItemNumber} ---`);
      console.log('LI innerHTML:', child.innerHTML);
      
      let listItemText = '';
      
      // Process child nodes of LI
      for (const childNode of Array.from(child.childNodes)) {
        if (childNode.nodeType === document.TEXT_NODE) {
          const text = this.cleanTextContent(childNode.textContent || '');
          if (text.trim()) {
            console.log('Adding TEXT_NODE:', JSON.stringify(text));
            listItemText += this.escapeMarkdownText(text);
          }
        } else if (childNode.nodeType === document.ELEMENT_NODE) {
          const elem = childNode;
          const elemContent = this.convertElementToMarkdown(elem, document);
          console.log('Adding ELEMENT content:', JSON.stringify(elemContent));
          listItemText += elemContent;
        }
      }
      
      const cleanItemText = listItemText.trim();
      console.log('cleanItemText:', JSON.stringify(cleanItemText));
      
      if (cleanItemText) {
        // Check if list item should end with punctuation
        let finalItemText = cleanItemText;
        const hasPunctuation = finalItemText.match(/[.!?;:]$/);
        console.log('Has ending punctuation:', !!hasPunctuation);
        
        if (finalItemText && !hasPunctuation) {
          console.log('Checking if should add punctuation...');
          const words = finalItemText.split(/\s+/);
          const isCompleteSentence = words.length >= 2 && 
                                     /^[A-Z]/.test(finalItemText) && 
                                     /[a-z]/i.test(finalItemText) &&
                                     !finalItemText.match(/^(Note|Tip|Warning|Caution):/i) &&
                                     !finalItemText.match(/^(e\.g\.|i\.e\.|etc\.)$/i) &&
                                     !finalItemText.match(/^(vs\.|cf\.|et al\.)$/i);
          console.log('Is complete sentence:', isCompleteSentence);
          if (isCompleteSentence) {
            finalItemText += '.';
            console.log('Added period, finalItemText:', JSON.stringify(finalItemText));
          }
        }
        
        // Add to result
        if (result.trim() && !result.endsWith('\n\n')) {
          result += '\n';
        }
        result += `${listItemNumber}. ${finalItemText}\n\n`;
        console.log('Added to result:', JSON.stringify(`${listItemNumber}. ${finalItemText}\n\n`));
        listItemNumber++;
      }
    }
  }
  
  console.log('Final list result:', JSON.stringify(result));
  return result.trimEnd() + '\n\n\n';
};

const converter = new WritersideMarkdownConverter();
const inputFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-08 DeleteActivity.htm';
const content = await fs.readFile(inputFile, 'utf8');

console.log('Running conversion with list processing debug...\n');

const result = await converter.convert(content, {
  format: 'writerside-markdown',
  inputType: 'html',
  inputPath: inputFile
});

console.log('\n=== FINAL CHECK ===');
const hasDeletePeriod = result.content.includes('*Delete*.');
const missingDeletePeriod = result.content.includes('*Delete*\n');
console.log('Has Delete with period:', hasDeletePeriod);
console.log('Missing Delete period:', missingDeletePeriod);
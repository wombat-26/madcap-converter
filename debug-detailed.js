const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

// Patch the method to add debugging
const originalHandleMixedOrderedList = WritersideMarkdownConverter.prototype.handleMixedOrderedList;
WritersideMarkdownConverter.prototype.handleMixedOrderedList = function(element, document) {
  console.log('\n=== handleMixedOrderedList Debug ===');
  
  let result = '';
  let listItemNumber = 1;
  
  const children = Array.from(element.children);
  console.log('Children found:', children.length);
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const tagName = child.tagName.toLowerCase();
    console.log(`\nProcessing child ${i}: ${tagName}`);
    console.log('Child outerHTML:', child.outerHTML);
    
    if (tagName === 'li') {
      console.log('Processing list item...');
      let listItemText = '';
      
      for (const childNode of Array.from(child.childNodes)) {
        if (childNode.nodeType === document.TEXT_NODE) {
          const text = this.cleanTextContent(childNode.textContent || '');
          if (text.trim()) {
            listItemText += this.escapeMarkdownText(text);
          }
        } else if (childNode.nodeType === document.ELEMENT_NODE) {
          const elem = childNode;
          const elemContent = this.convertElementToMarkdown(elem, document);
          console.log(`  Element content from ${elem.tagName}: ${JSON.stringify(elemContent)}`);
          listItemText += elemContent;
        }
      }
      
      const cleanItemText = listItemText.trim();
      console.log(`  Clean item text: ${JSON.stringify(cleanItemText)}`);
      
      if (cleanItemText) {
        let finalItemText = cleanItemText;
        if (finalItemText && !finalItemText.match(/[.!?;:]$/)) {
          const words = finalItemText.split(/\s+/);
          const isCompleteSentence = words.length >= 2 && 
                                   /^[A-Z]/.test(finalItemText) && 
                                   /[a-z]/i.test(finalItemText) &&
                                   !finalItemText.match(/^(Note|Tip|Warning|Caution):/i) &&
                                   !finalItemText.match(/^(e\.g\.|i\.e\.|etc\.)$/i) &&
                                   !finalItemText.match(/^(vs\.|cf\.|et al\.)$/i);
          if (isCompleteSentence) {
            finalItemText += '.';
          }
        }
        
        console.log(`  Final item text: ${JSON.stringify(finalItemText)}`);
        
        if (result.trim() && !result.endsWith('\n\n')) {
          result += '\n';
        }
        result += `${listItemNumber}. ${finalItemText}\n\n`;
        console.log(`  Result so far: ${JSON.stringify(result)}`);
        listItemNumber++;
      }
    } else {
      console.log('Processing orphaned content...');
      const orphanedContent = this.convertElementToMarkdown(child, document).trim();
      console.log(`  Orphaned content: ${JSON.stringify(orphanedContent)}`);
      
      if (orphanedContent) {
        if (result.trim() && !result.endsWith('\n\n')) {
          result += '\n\n';
        }
        result += `${orphanedContent}\n\n`;
        console.log(`  Result after orphaned: ${JSON.stringify(result)}`);
      }
    }
  }
  
  const finalResult = result.trimEnd() + '\n\n\n';
  console.log(`\nFinal result: ${JSON.stringify(finalResult)}`);
  return finalResult;
};

const converter = new WritersideMarkdownConverter();

const input = `
  <ol>
    <li><p>Step one</p></li>
    <p>Additional information</p>
    <li><p>Step two</p></li>
  </ol>
`;

const result = await converter.convert(input, {
  format: 'writerside-markdown',
  inputType: 'html'
});

console.log('\n=== Final Output ===');
console.log(JSON.stringify(result.content));
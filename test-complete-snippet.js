import { DocumentService } from './build/document-service.js';
import fs from 'fs';

async function testCompleteSnippet() {
  console.log('Testing complete snippet output...\n');
  
  const service = new DocumentService();
  const htmlFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  
  try {
    const result = await service.convertFile(htmlFile, {
      format: 'asciidoc',
      preserveFormatting: false,
      extractVariables: true
    });
    
    // Find the note section and show more context
    const lines = result.content.split('\n');
    const noteStartIndex = lines.findIndex(line => line.includes('[NOTE]'));
    
    if (noteStartIndex !== -1) {
      console.log('=== COMPLETE NOTE SECTION ===\n');
      
      // Show from NOTE start to the next list item or significant content
      let endIndex = noteStartIndex + 1;
      let foundEnd = false;
      
      for (let i = noteStartIndex + 1; i < lines.length && !foundEnd; i++) {
        const line = lines[i].trim();
        
        // Stop at next list item, section, or when we've gone far enough
        if (line.match(/^\.\./)) {  // Next list item
          endIndex = i;
          foundEnd = true;
        } else if (line.match(/^=/)) {  // Next section
          endIndex = i;
          foundEnd = true;
        } else if (i > noteStartIndex + 20) {  // Safety limit
          endIndex = i;
          foundEnd = true;
        } else {
          endIndex = i + 1;
        }
      }
      
      for (let i = noteStartIndex; i < endIndex; i++) {
        console.log(`${i + 1}: ${lines[i]}`);
      }
      
      // Check if the second paragraph content is anywhere in the document
      console.log('\n=== SEARCHING FOR MISSING CONTENT ===');
      
      const searchTerms = [
        'Dependent attribute Tooltip',
        'controlling attribute',
        'multi-select field',
        'combination of the valid options'
      ];
      
      searchTerms.forEach(term => {
        const found = lines.find(line => line.toLowerCase().includes(term.toLowerCase()));
        console.log(`"${term}": ${found ? 'FOUND' : 'NOT FOUND'}`);
        if (found) {
          const lineNum = lines.indexOf(found) + 1;
          console.log(`  Line ${lineNum}: ${found.substring(0, 100)}...`);
        }
      });
      
    } else {
      console.log('NOTE section not found');
    }
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

testCompleteSnippet();
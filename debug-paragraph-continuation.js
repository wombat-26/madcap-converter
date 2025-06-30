/**
 * Debug paragraph continuation in list items
 */

import { DocumentService } from './build/document-service.js';

const testHtml = `
<html>
<body>
<h1>Test Paragraph Continuation</h1>

<ol>
<li>
<p>First paragraph in list item.</p>
<p>Second paragraph should have continuation marker.</p>
</li>
<li>Single paragraph item.</li>
<li>
<p>Another first paragraph.</p>
<p>Another second paragraph.</p>
<p>Third paragraph in same list item.</p>
</li>
</ol>

</body>
</html>
`;

async function debugParagraphContinuation() {
  console.log('Testing paragraph continuation in list items...\n');
  
  try {
    const docService = new DocumentService();
    
    const options = {
      format: 'asciidoc',
      inputType: 'html',
      preserveFormatting: true,
      variableOptions: {
        extractVariables: false
      }
    };
    
    const result = await docService.convertString(testHtml, options);
    
    console.log('=== AsciiDoc Output ===');
    console.log(result.content);
    console.log('\n=== End Output ===\n');
    
    // Analyze continuation markers
    const lines = result.content.split('\n');
    const continuationMarkers = lines.filter(line => line.trim() === '+');
    console.log(`Found ${continuationMarkers.length} continuation markers (+)`);
    
    // Show context around continuation markers
    lines.forEach((line, index) => {
      if (line.trim() === '+') {
        console.log(`\nContinuation marker at line ${index + 1}:`);
        console.log(`  Before: "${lines[index - 1] || ''}"`);
        console.log(`  Marker: "${line}"`);
        console.log(`  After:  "${lines[index + 1] || ''}"`);
      }
    });
    
  } catch (error) {
    console.error('Error during conversion:', error);
  }
}

debugParagraphContinuation();
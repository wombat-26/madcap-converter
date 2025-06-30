import { DocumentService } from './build/document-service.js';

async function debugMixedParagraph() {
  console.log('Debugging mixed image+text paragraph processing...\n');
  
  const service = new DocumentService();
  
  // Create a simplified test HTML that mimics the snippet structure
  const testHtml = `
    <html>
      <body>
        <p>
          <img src="../Images/GUI-Elemente/Dependent_attribute_Tooltip.png" />
          <br />The options that you can select in the dependent attribute are controlled by the value of the controlling attribute.
        </p>
      </body>
    </html>
  `;
  
  try {
    const result = await service.convertString(testHtml, {
      inputType: 'html',
      format: 'asciidoc',
      preserveFormatting: false
    });
    
    console.log('=== RESULT ===');
    console.log(result.content);
    
    // Show each line
    const lines = result.content.split('\n');
    console.log('\n=== LINE BY LINE ===');
    lines.forEach((line, index) => {
      if (line.includes('image:') || line.includes('options')) {
        console.log(`${index + 1}: "${line}"`);
      }
    });
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

debugMixedParagraph();
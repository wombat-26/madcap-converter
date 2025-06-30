import { DocumentService } from './build/document-service.js';

async function debugIconInlineClass() {
  console.log('Debugging IconInline class detection...\n');
  
  const service = new DocumentService();
  
  // Create test HTML that exactly matches the file structure
  const testHtml = `
    <html>
      <body>
        <p>In the <i>Investment Item</i> list, find the investment you want to connect. Click an investment item's <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button to connect it to the activity.</p>
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
      if (line.includes('image:') || line.includes('Investment') || line.includes('Link') || line.includes('connect')) {
        console.log(`${index + 1}: "${line}"`);
      }
    });
    
    // Check if the image is properly inline
    const hasInlineImage = result.content.includes('image:../Images/GUI-Elemente/Link Activity.png[Link Activity,18]');
    const isInlineInText = result.content.includes("Click an investment item's image:../Images/GUI-Elemente/Link Activity.png[Link Activity,18] _Link_ button");
    
    console.log(`\n=== IMAGE ANALYSIS ===`);
    console.log(`Has inline image syntax: ${hasInlineImage}`);
    console.log(`Image is properly embedded in text: ${isInlineInText}`);
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

debugIconInlineClass();
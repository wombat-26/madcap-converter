import { DocumentService } from './build/document-service.js';

async function debugInlineIcon() {
  console.log('Debugging inline icon processing...\n');
  
  const service = new DocumentService();
  
  // Create test HTML that mimics the problematic structure
  const testHtml = `
    <html>
      <body>
        <p>. In the <em>Investment Item</em> list, find the investment you want to connect. Click an investment item's
        <img src="../Images/GUI-Elemente/Link Activity.png" alt="Link Activity" width="18" height="18">
        <em>Link</em> button to connect it to the activity.</p>
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
      if (line.includes('image:') || line.includes('Investment') || line.includes('Link')) {
        console.log(`${index + 1}: "${line}"`);
      }
    });
    
    // Check if the image is inline or block
    const hasInlineImage = result.content.includes('image:../Images/GUI-Elemente/Link Activity.png[Link Activity,18]');
    const hasBlockImage = result.content.includes('image::../Images/GUI-Elemente/Link Activity.png[Link Activity,18]');
    
    console.log(`\n=== IMAGE TYPE DETECTION ===`);
    console.log(`Inline image (expected): ${hasInlineImage}`);
    console.log(`Block image (problem): ${hasBlockImage}`);
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

debugInlineIcon();
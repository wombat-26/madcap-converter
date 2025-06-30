import { DocumentService } from './build/document-service.js';

async function debugListInline() {
  console.log('Debugging list inline processing...\n');
  
  const service = new DocumentService();
  
  // Create test HTML that matches the actual list structure from the file
  const testHtml = `
    <html>
      <body>
        <ol>
          <li>
            <p>In the <i>Investment Item</i> list, find the investment you want to connect. Click an investment item's <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button to connect it to the activity.</p>
          </li>
        </ol>
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
    
    // Show each line with numbers
    const lines = result.content.split('\n');
    console.log('\n=== LINE BY LINE ===');
    lines.forEach((line, index) => {
      console.log(`${String(index + 1).padStart(2, ' ')}: "${line}"`);
    });
    
    // Check if the image is inline or separated
    const hasInlineImage = result.content.includes("item's image:../Images/GUI-Elemente/Link Activity.png[Link Activity,18] _Link_ button");
    const isOnSeparateLine = result.content.includes('\nimage:../Images/GUI-Elemente/Link Activity.png[Link Activity,18]\n');
    
    console.log(`\n=== ANALYSIS ===`);
    console.log(`Image inline with text: ${hasInlineImage}`);
    console.log(`Image on separate line: ${isOnSeparateLine}`);
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

debugListInline();
import { DocumentService } from './build/document-service.js';

async function testRealInlineIcon() {
  console.log('Testing real file with inline icons...\n');
  
  const service = new DocumentService();
  const htmlFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  
  try {
    const result = await service.convertFile(htmlFile, {
      format: 'asciidoc',
      preserveFormatting: false,
      asciidocOptions: {
        useCollapsibleBlocks: true
      }
    });
    
    // Look for the specific section with the Link Activity icon
    const lines = result.content.split('\n');
    const linkActivityLines = lines.filter(line => 
      line.includes('Link Activity') || 
      (line.includes('Investment Item') && line.includes('connect'))
    );
    
    console.log('=== LINES WITH LINK ACTIVITY ===');
    linkActivityLines.forEach((line, index) => {
      const lineNum = lines.indexOf(line) + 1;
      console.log(`${lineNum}: ${line}`);
    });
    
    // Check if inline images are working correctly
    const inlineIconCount = (result.content.match(/image:[^:]/g) || []).length;
    const blockIconCount = (result.content.match(/image::[^:]/g) || []).length;
    
    console.log(`\n=== IMAGE TYPE SUMMARY ===`);
    console.log(`Inline images (image:): ${inlineIconCount}`);
    console.log(`Block images (image::): ${blockIconCount}`);
    
    // Check for specific pattern improvements
    const hasInlineText = result.content.includes('Click an investment item') && 
                         result.content.includes('image:../Images/GUI-Elemente/Link Activity.png') &&
                         !result.content.includes('\nimage:../Images/GUI-Elemente/Link Activity.png\n');
    
    console.log(`\nInline icon properly embedded in text: ${hasInlineText}`);
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

testRealInlineIcon();
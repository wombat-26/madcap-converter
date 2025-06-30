import { DocumentService } from './build/document-service.js';

async function testRealFileConversion() {
  const service = new DocumentService();
  
  const inputFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const outputFile = '/tmp/test-xref-conversion.adoc';
  
  console.log('Converting:', inputFile);
  
  try {
    const result = await service.convertFile(inputFile, outputFile, {
      format: 'asciidoc'
    });
    
    console.log('\nConversion successful!');
    console.log('Output file:', outputFile);
    
    // Check if the xref was converted correctly
    const { promises: fs } = await import('fs');
    const content = await fs.readFile(outputFile, 'utf-8');
    
    // Look for the specific line
    const lines = content.split('\n');
    const xrefLines = lines.filter(line => line.includes('For instructions, see'));
    
    console.log('\n=== Lines containing "For instructions, see" ===');
    xrefLines.forEach((line, i) => {
      console.log(`${i + 1}: ${line}`);
    });
    
    // Check if we have the correct anchor syntax
    const hasCorrectAnchors = xrefLines.some(line => line.includes('<<') && line.includes('>>'));
    console.log('\nHas correct anchor syntax:', hasCorrectAnchors);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testRealFileConversion();
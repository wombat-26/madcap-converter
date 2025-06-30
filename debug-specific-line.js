import { DocumentService } from './build/document-service.js';

async function debugSpecificLine() {
  console.log('Debugging specific line 108-110...\n');
  
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
    
    // Get lines around 108-110
    const lines = result.content.split('\n');
    const startLine = 105;
    const endLine = 115;
    
    console.log('=== LINES AROUND 108-110 ===');
    for (let i = startLine; i <= endLine; i++) {
      if (lines[i-1]) {
        const marker = (i >= 108 && i <= 110) ? ' >>> ' : '     ';
        console.log(`${marker}${i}: "${lines[i-1]}"`);
      }
    }
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

debugSpecificLine();
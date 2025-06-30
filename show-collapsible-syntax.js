import { DocumentService } from './build/document-service.js';

async function showCollapsibleSyntax() {
  console.log('Showing actual collapsible block syntax...\n');
  
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
    
    const lines = result.content.split('\n');
    
    // Find the first collapsible block and show its complete syntax
    const collapsibleStart = lines.findIndex(line => line.includes('[%collapsible]'));
    
    if (collapsibleStart !== -1) {
      console.log('=== FIRST COLLAPSIBLE BLOCK SYNTAX ===\n');
      
      // Show lines around the first collapsible block
      const start = Math.max(0, collapsibleStart - 2);
      const end = Math.min(lines.length, collapsibleStart + 15);
      
      for (let i = start; i < end; i++) {
        const marker = i === collapsibleStart ? ' >>> ' : '     ';
        console.log(`${marker}${i + 1}: ${lines[i]}`);
      }
      
      // Also check if the syntax is correct
      console.log('\n=== SYNTAX ANALYSIS ===');
      
      const collapsibleLine = lines[collapsibleStart];
      const titleLine = lines[collapsibleStart + 1];
      const delimiterLine = lines[collapsibleStart + 2];
      
      console.log(`Collapsible marker: "${collapsibleLine}"`);
      console.log(`Title line: "${titleLine}"`);
      console.log(`Delimiter: "${delimiterLine}"`);
      
      // Check if syntax matches AsciiDoc collapsible format
      const isCorrectSyntax = 
        collapsibleLine.trim() === '[%collapsible]' &&
        titleLine.startsWith('.') &&
        /^={4,}$/.test(delimiterLine.trim());
      
      console.log(`\nSyntax is correct: ${isCorrectSyntax}`);
      
      if (!isCorrectSyntax) {
        console.log('Expected format:');
        console.log('[%collapsible]');
        console.log('.Title Here');
        console.log('====');
        console.log('content...');
        console.log('====');
      }
    } else {
      console.log('No collapsible blocks found!');
    }
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

showCollapsibleSyntax();
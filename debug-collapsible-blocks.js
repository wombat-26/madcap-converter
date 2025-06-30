import { DocumentService } from './build/document-service.js';

async function debugCollapsibleBlocks() {
  console.log('Debugging collapsible blocks processing...\n');
  
  const service = new DocumentService();
  const htmlFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  
  try {
    // Test with collapsible blocks enabled
    console.log('=== TESTING WITH COLLAPSIBLE BLOCKS ENABLED ===\n');
    
    const resultWithCollapsible = await service.convertFile(htmlFile, {
      format: 'asciidoc',
      preserveFormatting: false,
      asciidocOptions: {
        useCollapsibleBlocks: true
      }
    });
    
    // Look for collapsible block syntax
    const lines = resultWithCollapsible.content.split('\n');
    
    // Search for sections that should be collapsible
    const sectionLines = lines.filter(line => 
      line.includes('Connecting Activities') || 
      line.includes('Configuring Planned') ||
      line.includes('Related tasks') ||
      line.includes('[%collapsible]') ||
      line.includes('====')
    );
    
    console.log('Relevant lines from output:');
    sectionLines.forEach((line, index) => {
      const lineNum = lines.indexOf(line) + 1;
      console.log(`${lineNum}: ${line}`);
    });
    
    // Check for collapsible syntax specifically
    const collapsibleCount = lines.filter(line => line.includes('[%collapsible]')).length;
    const delimiterCount = lines.filter(line => /^={4,}$/.test(line.trim())).length;
    
    console.log(`\nCollapsible blocks found: ${collapsibleCount}`);
    console.log(`Delimiter blocks found: ${delimiterCount}`);
    
    // Test without collapsible blocks for comparison
    console.log('\n=== TESTING WITHOUT COLLAPSIBLE BLOCKS (comparison) ===\n');
    
    const resultWithoutCollapsible = await service.convertFile(htmlFile, {
      format: 'asciidoc',
      preserveFormatting: false,
      asciidocOptions: {
        useCollapsibleBlocks: false
      }
    });
    
    const linesWithout = resultWithoutCollapsible.content.split('\n');
    const sectionLinesWithout = linesWithout.filter(line => 
      line.includes('Connecting Activities') || 
      line.includes('Configuring Planned') ||
      line.includes('Related tasks')
    );
    
    console.log('Without collapsible blocks:');
    sectionLinesWithout.forEach((line) => {
      const lineNum = linesWithout.indexOf(line) + 1;
      console.log(`${lineNum}: ${line}`);
    });
    
    // Compare the differences
    console.log('\n=== COMPARISON ===');
    console.log(`With collapsible: ${collapsibleCount} collapsible blocks`);
    console.log(`Without collapsible: ${linesWithout.filter(line => line.includes('[%collapsible]')).length} collapsible blocks`);
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

debugCollapsibleBlocks();
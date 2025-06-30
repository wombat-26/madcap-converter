import { DocumentService } from './build/document-service.js';
import fs from 'fs';

async function testSnippetDirect() {
  console.log('Testing snippet processing directly...\n');
  
  const service = new DocumentService();
  
  // Read the problematic HTML file
  const htmlFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const htmlContent = fs.readFileSync(htmlFile, 'utf-8');
  
  try {
    // Convert using the file path method which should trigger proper preprocessing
    const result = await service.convertFile(htmlFile, {
      format: 'asciidoc',
      preserveFormatting: false,
      extractVariables: true
    });
    
    console.log('=== SNIPPET AREA OUTPUT ===\n');
    
    // Find lines around the snippet
    const lines = result.content.split('\n');
    const snippetIndex = lines.findIndex(line => line.includes('📄 Content') || line.includes('additional attribute fields'));
    
    if (snippetIndex !== -1) {
      const start = Math.max(0, snippetIndex - 3);
      const end = Math.min(lines.length, snippetIndex + 10);
      
      for (let i = start; i < end; i++) {
        const marker = i === snippetIndex ? ' >>> ' : '     ';
        console.log(`${marker}${i + 1}: ${lines[i]}`);
      }
    } else {
      // Look for dependency-related content
      const dependencyIndex = lines.findIndex(line => line.toLowerCase().includes('dependency') || line.toLowerCase().includes('controlling'));
      if (dependencyIndex !== -1) {
        console.log('Found processed snippet content:');
        const start = Math.max(0, dependencyIndex - 2);
        const end = Math.min(lines.length, dependencyIndex + 8);
        
        for (let i = start; i < end; i++) {
          console.log(`${i + 1}: ${lines[i]}`);
        }
      } else {
        console.log('No snippet or dependency content found');
      }
    }
    
    // Check if there are any warnings or metadata
    if (result.metadata && result.metadata.warnings) {
      console.log('\n=== WARNINGS ===');
      result.metadata.warnings.forEach(warning => console.log(`  ${warning}`));
    }
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

testSnippetDirect();
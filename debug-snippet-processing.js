import { DocumentService } from './build/document-service.js';
import fs from 'fs';
import { resolve, dirname } from 'path';

async function debugSnippetProcessing() {
  console.log('Debugging snippet processing...\n');
  
  const service = new DocumentService();
  
  // Test just the snippet path resolution
  const htmlFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const snippetSrc = '../Resources/Snippets/NoteActionDependency.flsnp';
  const expectedSnippetPath = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/Resources/Snippets/NoteActionDependency.flsnp';
  
  console.log('=== PATH RESOLUTION TEST ===');
  console.log(`HTML file: ${htmlFile}`);
  console.log(`Snippet src: ${snippetSrc}`);
  
  const resolvedPath = resolve(dirname(htmlFile), snippetSrc);
  console.log(`Resolved path: ${resolvedPath}`);
  console.log(`Expected path: ${expectedSnippetPath}`);
  console.log(`Paths match: ${resolvedPath === expectedSnippetPath}`);
  
  // Check if files exist
  console.log(`\n=== FILE EXISTENCE CHECK ===`);
  console.log(`HTML file exists: ${fs.existsSync(htmlFile)}`);
  console.log(`Resolved snippet exists: ${fs.existsSync(resolvedPath)}`);
  console.log(`Expected snippet exists: ${fs.existsSync(expectedSnippetPath)}`);
  
  // Check what's in the directory
  const snippetsDir = dirname(expectedSnippetPath);
  console.log(`\n=== SNIPPETS DIRECTORY CONTENT ===`);
  console.log(`Snippets dir: ${snippetsDir}`);
  if (fs.existsSync(snippetsDir)) {
    const files = fs.readdirSync(snippetsDir);
    console.log(`Files in snippets directory:`);
    files.forEach(file => console.log(`  ${file}`));
    
    // Look for files that might match
    const matches = files.filter(file => file.toLowerCase().includes('noteaction') || file.toLowerCase().includes('dependency'));
    if (matches.length > 0) {
      console.log(`\nPotential matches:`);
      matches.forEach(file => console.log(`  ${file}`));
    }
  } else {
    console.log('Snippets directory does not exist');
  }
  
  // Test actual conversion to see what error occurs
  console.log(`\n=== CONVERSION TEST ===`);
  try {
    const htmlContent = fs.readFileSync(htmlFile, 'utf-8');
    
    // Extract just the snippet block part for testing
    const snippetMatch = htmlContent.match(/<MadCap:snippetBlock[^>]*src="([^"]*)"[^>]*\/>/);
    if (snippetMatch) {
      console.log(`Found snippet reference: ${snippetMatch[0]}`);
      console.log(`Snippet src attribute: ${snippetMatch[1]}`);
    }
    
    const result = await service.convertString(htmlContent, {
      inputType: 'html',
      format: 'asciidoc',
      preserveFormatting: false,
      extractVariables: true,
      inputPath: htmlFile
    });
    
    // Look for the snippet placeholder in the result
    const lines = result.content.split('\n');
    const snippetLines = lines.filter(line => line.includes('📄 Content') || line.includes('Snippet from'));
    
    console.log(`\nSnippet placeholder lines found: ${snippetLines.length}`);
    snippetLines.forEach(line => console.log(`  ${line}`));
    
    // Look for the actual snippet content if it was processed
    const dependencyLines = lines.filter(line => line.toLowerCase().includes('dependency') || line.toLowerCase().includes('controlling'));
    console.log(`\nDependency-related lines found: ${dependencyLines.length}`);
    dependencyLines.forEach(line => console.log(`  ${line.substring(0, 100)}...`));
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

debugSnippetProcessing();
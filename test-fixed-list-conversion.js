import { DocumentService } from './build/document-service.js';
import fs from 'fs';

async function testFixedConversion() {
  console.log('Testing fixed list conversion...\n');
  
  const service = new DocumentService();
  
  // Read the problematic HTML file
  const htmlContent = fs.readFileSync('/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm', 'utf-8');
  
  try {
    // Convert to AsciiDoc
    const result = await service.convertString(htmlContent, {
      inputType: 'html',
      format: 'asciidoc',
      preserveFormatting: false,
      extractVariables: true
    });
    
    console.log('=== CONVERSION RESULT ===\n');
    console.log(result.content);
    
    // Analyze the output for specific issues
    console.log('\n=== ANALYSIS ===\n');
    
    const lines = result.content.split('\n');
    
    // Check for proper list numbering
    const mainListItems = lines.filter(line => /^[0-9]+\.\s/.test(line));
    console.log(`Main list items found: ${mainListItems.length}`);
    console.log('First few main items:');
    mainListItems.slice(0, 5).forEach(item => console.log(`  ${item}`));
    
    // Check for nested lists with proper markers
    const nestedListItems = lines.filter(line => /^\.\.\s/.test(line));
    console.log(`\nNested list items found: ${nestedListItems.length}`);
    console.log('First few nested items:');
    nestedListItems.slice(0, 5).forEach(item => console.log(`  ${item}`));
    
    // Check for orphaned [loweralpha] markers
    const loweralphaLines = lines.filter(line => line.trim() === '[loweralpha]');
    console.log(`\nOrphaned [loweralpha] markers: ${loweralphaLines.length}`);
    
    // Check for double continuation markers
    let doublePlusCount = 0;
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].trim() === '+' && lines[i + 1].trim() === '+') {
        doublePlusCount++;
      }
    }
    console.log(`Double continuation markers (++): ${doublePlusCount}`);
    
    // Check specific problem areas
    console.log('\n=== CHECKING SPECIFIC SECTIONS ===\n');
    
    // Find "On the Type page:" section
    const typePageIndex = lines.findIndex(line => line.includes('On the _Type_ page:'));
    if (typePageIndex !== -1) {
      console.log('Found "On the Type page:" section:');
      console.log(lines.slice(typePageIndex, typePageIndex + 10).join('\n'));
    }
    
    // Save the output for review
    fs.writeFileSync('test-fixed-list-output.adoc', result.content);
    console.log('\n✅ Output saved to test-fixed-list-output.adoc');
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

testFixedConversion();
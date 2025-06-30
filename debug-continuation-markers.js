import { DocumentService } from './build/document-service.js';
import fs from 'fs';

async function debugContinuationMarkers() {
  console.log('Debugging continuation marker issues...\n');
  
  const service = new DocumentService();
  
  // Read the problematic HTML file
  const htmlContent = fs.readFileSync('/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm', 'utf-8');
  
  // Extract just the problematic section from HTML
  const startIndex = htmlContent.indexOf('The <i>Select Investment Item</i> dialog closes');
  const endIndex = htmlContent.indexOf('Click on a subsection to expand it');
  
  if (startIndex !== -1 && endIndex !== -1) {
    const problemSection = htmlContent.slice(startIndex, endIndex + 100);
    console.log('=== PROBLEMATIC HTML SECTION ===\n');
    console.log(problemSection);
    console.log('\n');
    
    // Also show the structure more clearly
    const parser = new DOMParser();
    console.log('=== HTML STRUCTURE ANALYSIS ===\n');
    
    // Find the ol element that contains this section
    const olStartIndex = htmlContent.lastIndexOf('<ol', startIndex);
    const olEndIndex = htmlContent.indexOf('</ol>', endIndex) + 5;
    
    if (olStartIndex !== -1 && olEndIndex !== -1) {
      const olSection = htmlContent.slice(olStartIndex, olEndIndex);
      console.log('HTML section causing the issue:');
      console.log(olSection.substring(0, 1000) + '...');
    }
  }
  
  try {
    // Convert to AsciiDoc
    const result = await service.convertString(htmlContent, {
      inputType: 'html',
      format: 'asciidoc',
      preserveFormatting: false,
      extractVariables: true
    });
    
    // Find the problematic section in the output
    const lines = result.content.split('\n');
    const budgetLineIndex = lines.findIndex(line => line.includes('BudgetTabConnectedSpend'));
    
    if (budgetLineIndex !== -1) {
      console.log('\n=== ASCIIDOC OUTPUT AROUND PROBLEM ===\n');
      console.log(lines.slice(budgetLineIndex - 10, budgetLineIndex + 10).join('\n'));
      
      // Check for orphaned + markers
      console.log('\n=== ORPHANED + MARKERS ===\n');
      const orphanedPlus = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const prevLine = i > 0 ? lines[i - 1] : '';
        const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
        
        if (line.trim() === '+') {
          // Check if this + is orphaned (not part of a proper list continuation)
          const isOrphaned = !prevLine.match(/^[.*]{1,5}\s/) && // Not after list item
                            !nextLine.match(/^[.*]{1,5}\s/) && // Not before list item
                            !nextLine.trim().startsWith('image::') && // Not before block image
                            !nextLine.trim().startsWith('[NOTE]') && // Not before admonition
                            nextLine.trim() !== ''; // Not before empty line
          
          if (isOrphaned) {
            orphanedPlus.push({
              lineNumber: i + 1,
              context: lines.slice(Math.max(0, i - 2), i + 3)
            });
          }
        }
      }
      
      console.log(`Found ${orphanedPlus.length} orphaned + markers:`);
      orphanedPlus.forEach(marker => {
        console.log(`\nLine ${marker.lineNumber}:`);
        console.log(marker.context.join('\n'));
        console.log('---');
      });
    }
    
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

debugContinuationMarkers();
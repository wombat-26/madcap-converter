/**
 * Debug Exact Structure
 * Understand the exact nesting to fix the [loweralpha] placement
 */

import { readFileSync } from 'fs';

async function debugExactStructure() {
  console.log('🔍 DEBUG EXACT HTML STRUCTURE');
  console.log('='.repeat(50));

  try {
    const preprocessedHTML = readFileSync('./debug-preprocessed.html', 'utf-8');
    
    // Find the specific section
    const startIndex = preprocessedHTML.indexOf('Connecting Activities to Financial Items');
    const endIndex = preprocessedHTML.indexOf('</div>', startIndex + 1000); // Find closing div
    
    if (startIndex >= 0 && endIndex >= 0) {
      const section = preprocessedHTML.substring(startIndex - 100, endIndex + 6);
      
      console.log('📋 HTML STRUCTURE OF PROBLEMATIC SECTION:');
      console.log('```html');
      
      // Pretty print with indentation
      const lines = section.split('>');
      let indent = 0;
      
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('</')) {
          indent = Math.max(0, indent - 2);
        }
        
        if (trimmed) {
          const formatted = ' '.repeat(indent) + trimmed + (index < lines.length - 1 ? '>' : '');
          console.log(formatted);
          
          // Highlight important elements
          if (trimmed.includes('<ol') || trimmed.includes('<li')) {
            console.log(' '.repeat(indent) + '^^^^^ IMPORTANT');
          }
        }
        
        if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/')) {
          indent += 2;
        }
      });
      
      console.log('```');
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
  }
}

debugExactStructure().catch(console.error);
import { JSDOM } from 'jsdom';
import { readFile } from 'fs/promises';

async function debugSteps() {
  try {
    const content = await readFile('/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell/Impressum.htm', 'utf8');
    
    // Step 1: Normalize like MadCapPreprocessor does
    let cleanedHtml = content.replace(/<head[\s\S]*?<\/head>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<MadCap:variable([^>]*?)\s*\/>/gi, '<MadCap:variable$1></MadCap:variable>');
    cleanedHtml = cleanedHtml.replace(/<madcap:variable([^>]*?)\s*\/>/gi, '<madcap:variable$1></madcap:variable>');
    
    // Step 2: Parse with JSDOM
    const dom = new JSDOM(cleanedHtml, { contentType: 'text/html' });
    const document = dom.window.document;
    
    function countVariablesInParagraphs(label) {
      console.log(`\n=== ${label} ===`);
      const paragraphs = document.querySelectorAll('p');
      console.log(`Total paragraphs: ${paragraphs.length}`);
      
      let targetFound = false;
      paragraphs.forEach((p, index) => {
        const vars = p.querySelectorAll('MadCap\\:variable, madcap\\:variable');
        if (vars.length > 0) {
          const varNames = Array.from(vars).map(v => v.getAttribute('name')).join(', ');
          console.log(`  P${index + 1}: ${vars.length} vars (${varNames})`);
          
          // Check if this is our target paragraph
          if (varNames.includes('General.CompanyName') && varNames.includes('General.StreetAddress')) {
            targetFound = true;
            console.log(`    >>> TARGET PARAGRAPH FOUND <<<`);
          }
        }
      });
      
      if (!targetFound) {
        console.log(`  >>> TARGET PARAGRAPH MISSING <<<`);
      }
      
      return paragraphs.length;
    }
    
    // Check after initial parsing
    const initialCount = countVariablesInParagraphs('After initial JSDOM parsing');
    
    // Step 3: Simulate removeSkipConditionElements
    console.log('\n=== Simulating removeSkipConditionElements ===');
    // This method looks for elements with specific condition patterns - should not affect our content
    const conditionalElements = document.querySelectorAll('[madcap\\:conditions], [data-mc-conditions]');
    console.log(`Found ${conditionalElements.length} conditional elements`);
    countVariablesInParagraphs('After removeSkipConditionElements simulation');
    
    // Step 4: Check if preserveVariables flag would affect anything
    console.log('\n=== Variable preservation check ===');
    const allVars = document.querySelectorAll('MadCap\\:variable, madcap\\:variable');
    console.log(`Total variables in document: ${allVars.length}`);
    
    // Final count
    const finalCount = countVariablesInParagraphs('Final state');
    
    if (initialCount !== finalCount) {
      console.log(`\n❌ PARAGRAPHS LOST: ${initialCount} → ${finalCount}`);
    } else {
      console.log(`\n✅ PARAGRAPHS PRESERVED: ${finalCount}`);
    }
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugSteps();
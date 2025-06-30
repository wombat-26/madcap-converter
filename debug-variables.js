import { JSDOM } from 'jsdom';
import { readFile } from 'fs/promises';

async function debugDOM() {
  try {
    const content = await readFile('/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell/Impressum.htm', 'utf8');
    
    // Parse with JSDOM
    const dom = new JSDOM(content, { contentType: 'text/html' });
    const document = dom.window.document;
    
    console.log('=== All paragraphs ===');
    const paragraphs = document.querySelectorAll('p');
    paragraphs.forEach((p, index) => {
      console.log(`P${index + 1}: ${p.outerHTML.substring(0, 150)}...`);
      
      // Check for variables in this paragraph
      const variables = p.querySelectorAll('MadCap\\:variable, madcap\\:variable');
      if (variables.length > 0) {
        console.log(`  Variables found: ${variables.length}`);
        variables.forEach((v, vIndex) => {
          console.log(`    Var${vIndex + 1}: ${v.getAttribute('name')} - "${v.textContent}"`);
        });
      }
    });
    
    console.log('\n=== All variables in document ===');
    const allVars = document.querySelectorAll('MadCap\\:variable, madcap\\:variable');
    allVars.forEach((v, index) => {
      console.log(`Var${index + 1}: name="${v.getAttribute('name')}" content="${v.textContent}" parent="${v.parentElement?.tagName}"`);
    });
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugDOM();
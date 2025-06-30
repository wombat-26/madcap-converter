import { JSDOM } from 'jsdom';
import { readFile } from 'fs/promises';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function debugPreprocessed() {
  try {
    const content = await readFile('/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell/Impressum.htm', 'utf8');
    
    console.log('=== Original content (first 500 chars) ===');
    console.log(content.substring(0, 500));
    
    // Create preprocessor and set preserve variables
    const preprocessor = new MadCapPreprocessor();
    preprocessor.setExtractVariables(false);
    preprocessor.setPreserveVariables(true);
    
    console.log('\n=== Processing with MadCap preprocessor ===');
    const preprocessed = await preprocessor.preprocessMadCapContent(
      content, 
      '/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell/Impressum.htm', 
      'writerside-markdown'
    );
    
    console.log('\n=== Preprocessed content (first 1000 chars) ===');
    console.log(preprocessed.substring(0, 1000));
    
    // Parse with JSDOM
    const dom = new JSDOM(preprocessed, { contentType: 'text/html' });
    const document = dom.window.document;
    
    console.log('\n=== Variables after preprocessing ===');
    const allVars = document.querySelectorAll('MadCap\\:variable, madcap\\:variable');
    allVars.forEach((v, index) => {
      console.log(`Var${index + 1}: name="${v.getAttribute('name')}" content="${v.textContent}" parent="${v.parentElement?.tagName}"`);
    });
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugPreprocessed();
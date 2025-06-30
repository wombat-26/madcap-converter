import { JSDOM } from 'jsdom';
import { readFile } from 'fs/promises';

async function debugStepByStep() {
  try {
    const content = await readFile('/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell/Impressum.htm', 'utf8');
    
    console.log('=== Step 1: Remove Microsoft properties ===');
    // Mimic the removeMicrosoftProperties function
    let cleanedHtml = content;
    
    // Remove the entire <head> section completely
    cleanedHtml = cleanedHtml.replace(/<head[\s\S]*?<\/head>/gi, '');
    
    // Remove any remaining link, meta, style, script tags
    cleanedHtml = cleanedHtml.replace(/<link[^>]*>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<meta[^>]*>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<style[\s\S]*?<\/style>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
    
    // Convert self-closing MadCap variable tags to regular tags
    cleanedHtml = cleanedHtml.replace(
      /<MadCap:variable([^>]*?)\s*\/>/gi,
      '<MadCap:variable$1></MadCap:variable>'
    );
    
    // Also handle lowercase variations
    cleanedHtml = cleanedHtml.replace(
      /<madcap:variable([^>]*?)\s*\/>/gi,
      '<madcap:variable$1></madcap:variable>'
    );
    
    console.log('After normalization (first 800 chars):');
    console.log(cleanedHtml.substring(0, 800));
    
    console.log('\n=== Step 2: Parse with JSDOM ===');
    const dom = new JSDOM(cleanedHtml, { contentType: 'text/html' });
    const document = dom.window.document;
    
    console.log('After JSDOM parsing:');
    const body = document.body;
    console.log(body ? body.innerHTML.substring(0, 800) : 'NO BODY FOUND');
    
    console.log('\n=== Step 3: Check paragraphs ===');
    const paragraphs = document.querySelectorAll('p');
    console.log(`Found ${paragraphs.length} paragraphs`);
    
    paragraphs.forEach((p, index) => {
      const vars = p.querySelectorAll('MadCap\\:variable, madcap\\:variable');
      console.log(`P${index + 1}: ${vars.length} variables - ${p.outerHTML.substring(0, 100)}...`);
    });
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugStepByStep();
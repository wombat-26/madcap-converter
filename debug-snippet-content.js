import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import fs from 'fs';
import { JSDOM } from 'jsdom';

async function debugSnippetContent() {
  console.log('Debugging snippet content processing...\n');
  
  // Read the snippet file directly
  const snippetPath = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/Resources/Snippets/NoteActionDependency.flsnp';
  const snippetContent = fs.readFileSync(snippetPath, 'utf-8');
  
  console.log('=== RAW SNIPPET CONTENT ===');
  console.log(snippetContent);
  
  console.log('\n=== PARSED SNIPPET STRUCTURE ===');
  
  // Parse the snippet with JSDOM
  const dom = new JSDOM(snippetContent, { contentType: 'text/html' });
  const document = dom.window.document;
  const body = document.body;
  
  if (body) {
    console.log(`Body children count: ${body.children.length}`);
    Array.from(body.children).forEach((child, index) => {
      console.log(`  ${index + 1}. <${child.tagName.toLowerCase()}>`);
      if (child.textContent && child.textContent.trim()) {
        console.log(`     Text: "${child.textContent.trim().substring(0, 100)}..."`);
      }
      if (child.querySelector('img')) {
        const imgs = child.querySelectorAll('img');
        console.log(`     Images: ${imgs.length}`);
        imgs.forEach((img, i) => {
          console.log(`       ${i + 1}. src="${img.getAttribute('src')}"`);
        });
      }
    });
  }
  
  // Test the preprocessor directly
  console.log('\n=== PREPROCESSOR TEST ===');
  
  const preprocessor = new MadCapPreprocessor();
  
  // Create a test HTML document with the snippet reference
  const testHtml = `
    <html>
      <body>
        <p>Test content before snippet.</p>
        <MadCap:snippetBlock src="../Resources/Snippets/NoteActionDependency.flsnp" />
        <p>Test content after snippet.</p>
      </body>
    </html>
  `;
  
  const testPath = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/test.htm';
  
  try {
    const processedHtml = await preprocessor.preprocess(testHtml, testPath);
    
    console.log('Processed HTML:');
    console.log(processedHtml);
    
    // Parse the processed result
    const processedDom = new JSDOM(processedHtml, { contentType: 'text/html' });
    const processedBody = processedDom.window.document.body;
    
    console.log('\n=== PROCESSED STRUCTURE ===');
    if (processedBody) {
      Array.from(processedBody.children).forEach((child, index) => {
        console.log(`${index + 1}. <${child.tagName.toLowerCase()}> class="${child.className}"`);
        if (child.textContent && child.textContent.trim()) {
          console.log(`   Text: "${child.textContent.trim().substring(0, 150)}..."`);
        }
      });
    }
    
  } catch (error) {
    console.error('Preprocessor error:', error);
  }
}

debugSnippetContent();
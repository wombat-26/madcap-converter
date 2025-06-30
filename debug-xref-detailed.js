import { JSDOM } from 'jsdom';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

const testHtml = `
<!DOCTYPE html>
<html>
<body>
<p>For instructions, see <MadCap:xref href="#Configur">Configuring Planned Impact</MadCap:xref>.</p>
<p>Another example: <madcap:xref href="#Test">Test Link</madcap:xref></p>
<p>External link: <MadCap:xref href="somefile.htm#anchor">External Reference</MadCap:xref></p>
</body>
</html>`;

async function debugXrefProcessing() {
  console.log('=== Original HTML ===');
  console.log(testHtml);
  
  // Create DOM
  const dom = new JSDOM(testHtml);
  const document = dom.window.document;
  
  // Find all xref elements manually
  console.log('\n=== Manual search for xref elements ===');
  const allElements = document.getElementsByTagName('*');
  for (const element of allElements) {
    const tagName = element.tagName;
    if (tagName.toLowerCase().includes('xref')) {
      console.log('Found xref element:', {
        tagName: tagName,
        outerHTML: element.outerHTML,
        href: element.getAttribute('href'),
        textContent: element.textContent
      });
    }
  }
  
  // Try querySelector
  console.log('\n=== querySelector results ===');
  const queryResults = document.querySelectorAll('madcap\\:xref, MadCap\\:xref');
  console.log('Found', queryResults.length, 'elements with querySelector');
  
  // Process with MadCapPreprocessor
  const preprocessor = new MadCapPreprocessor();
  const processed = await preprocessor.preprocess(testHtml);
  
  console.log('\n=== After MadCap preprocessing ===');
  console.log(processed);
  
  // Check what happened to xrefs
  const processedDom = new JSDOM(processed);
  const links = processedDom.window.document.querySelectorAll('a');
  console.log('\n=== Links in processed document ===');
  links.forEach((link, i) => {
    console.log(`Link ${i + 1}:`, {
      outerHTML: link.outerHTML,
      href: link.getAttribute('href'),
      textContent: link.textContent
    });
  });
}

debugXrefProcessing();
import { promises as fs } from 'fs';
import { JSDOM } from 'jsdom';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { HTMLPreprocessor } from './build/services/html-preprocessor.js';
import { VariableExtractor } from './build/services/variable-extractor.js';

const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';

async function debugXrefConversion() {
  try {
    // Read the source HTML
    const html = await fs.readFile(sourceFile, 'utf-8');
    
    // Extract the specific line with the xref
    const xrefLine = html.split('\n').find(line => line.includes('For instructions, see <MadCap:xref'));
    console.log('Original xref line:', xrefLine);
    
    // Create a minimal test case with just this xref
    const testHtml = `
<!DOCTYPE html>
<html>
<body>
<p>For instructions, see <MadCap:xref href="#Configur">Configuring Planned Impact</MadCap:xref>.</p>
</body>
</html>`;
    
    console.log('\n=== Test HTML ===');
    console.log(testHtml);
    
    // Step 1: Preprocess HTML
    const preprocessor = new HTMLPreprocessor();
    const preprocessed = await preprocessor.preprocess(testHtml, {
      projectDir: '/Volumes/Envoy Pro/Flare/Plan_EN'
    });
    
    console.log('\n=== After Preprocessing ===');
    console.log(preprocessed);
    
    // Step 2: Parse with JSDOM
    const dom = new JSDOM(preprocessed);
    const xrefElements = dom.window.document.querySelectorAll('a[data-mc-xref]');
    console.log('\n=== Found xref elements ===');
    xrefElements.forEach((el, i) => {
      console.log(`Xref ${i + 1}:`, {
        outerHTML: el.outerHTML,
        textContent: el.textContent,
        href: el.getAttribute('href'),
        'data-mc-xref-text': el.getAttribute('data-mc-xref-text')
      });
    });
    
    // Step 3: Convert to AsciiDoc
    const converter = new AsciiDocConverter();
    const result = await converter.convert(preprocessed, {
      inputPath: sourceFile,
      projectDir: '/Volumes/Envoy Pro/Flare/Plan_EN'
    });
    
    console.log('\n=== AsciiDoc Result ===');
    console.log(result.content);
    
    // Also test with the actual full file
    console.log('\n\n=== Testing with full file ===');
    const fullPreprocessed = await preprocessor.preprocess(html, {
      projectDir: '/Volumes/Envoy Pro/Flare/Plan_EN'
    });
    
    // Find the specific section in the preprocessed HTML
    const fullDom = new JSDOM(fullPreprocessed);
    const paragraphs = fullDom.window.document.querySelectorAll('p');
    for (const p of paragraphs) {
      if (p.textContent.includes('For instructions, see')) {
        console.log('\nFound paragraph:', p.outerHTML);
        const links = p.querySelectorAll('a');
        links.forEach(link => {
          console.log('Link in paragraph:', {
            outerHTML: link.outerHTML,
            textContent: link.textContent,
            href: link.getAttribute('href')
          });
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugXrefConversion();
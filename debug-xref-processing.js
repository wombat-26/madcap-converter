import { JSDOM } from 'jsdom';
import { DocumentService } from './build/document-service.js';

const testHtml = `
<!DOCTYPE html>
<html>
<body>
<p>For instructions, see <MadCap:xref href="#Configur">Configuring Planned Impact</MadCap:xref>.</p>
</body>
</html>`;

async function debugFullConversion() {
  console.log('=== Original HTML ===');
  console.log(testHtml);
  
  const service = new DocumentService();
  
  // Test conversion to AsciiDoc
  const result = await service.convertString(testHtml, {
    format: 'asciidoc',
    inputType: 'html',
    projectDir: '/Volumes/Envoy Pro/Flare/Plan_EN'
  });
  
  console.log('\n=== AsciiDoc Result ===');
  console.log(result.content);
  
  // Check if the xref text is preserved
  const hasPlannedImpact = result.content.includes('Configuring Planned Impact');
  const hasGreaterThan = result.content.includes(' >');
  
  console.log('\n=== Analysis ===');
  console.log('Contains "Configuring Planned Impact":', hasPlannedImpact);
  console.log('Contains " >":', hasGreaterThan);
  
  // Let's also check what happens step by step
  console.log('\n=== Step-by-step processing ===');
  
  // 1. Parse with JSDOM
  const dom = new JSDOM(testHtml);
  const xrefElements = dom.window.document.querySelectorAll('madcap\\:xref, MadCap\\:xref');
  console.log('Found xref elements:', xrefElements.length);
  xrefElements.forEach(el => {
    console.log('- href:', el.getAttribute('href'));
    console.log('- text:', el.textContent);
  });
}

debugFullConversion();
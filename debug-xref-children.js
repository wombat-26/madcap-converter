import { JSDOM } from 'jsdom';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

const testHtml = `<p>For instructions, see <MadCap:xref href="#Configur">Configuring Planned Impact</MadCap:xref>.</p>`;

async function debugChildren() {
  console.log('=== Original HTML ===');
  console.log(testHtml);
  
  // First preprocess with MadCap
  const preprocessor = new MadCapPreprocessor();
  const dom = new JSDOM(testHtml);
  
  // Manually process xrefs like the preprocessor does
  const xrefs = dom.window.document.querySelectorAll('madcap\\:xref, MadCap\\:xref');
  console.log('\n=== Found xrefs ===');
  xrefs.forEach(xref => {
    const href = xref.getAttribute('href');
    const text = xref.textContent;
    console.log('Xref:', { href, text });
    
    // Simulate what processXrefs does
    const link = dom.window.document.createElement('a');
    link.setAttribute('href', href);
    link.textContent = text || `See ${href}`;
    
    console.log('Created link:', {
      outerHTML: link.outerHTML,
      textContent: link.textContent
    });
  });
  
  // Now let's see what the converter does with a simple anchor link
  const simpleLink = `<p>For instructions, see <a href="#Configur">Configuring Planned Impact</a>.</p>`;
  console.log('\n=== Testing simple anchor link ===');
  console.log(simpleLink);
  
  const converter = new AsciiDocConverter();
  const result = await converter.convert(simpleLink, {
    inputType: 'html'
  });
  
  console.log('\n=== AsciiDoc Result ===');
  console.log(result.content);
  
  // Let's also check what happens with DOM traversal
  const linkDom = new JSDOM(simpleLink);
  const linkElement = linkDom.window.document.querySelector('a');
  console.log('\n=== Link element analysis ===');
  console.log('Element:', linkElement?.outerHTML);
  console.log('TextContent:', linkElement?.textContent);
  console.log('InnerHTML:', linkElement?.innerHTML);
  console.log('ChildNodes:', linkElement?.childNodes.length);
  if (linkElement) {
    linkElement.childNodes.forEach((node, i) => {
      console.log(`Child ${i}:`, {
        nodeType: node.nodeType,
        nodeName: node.nodeName,
        nodeValue: node.nodeValue,
        textContent: node.textContent
      });
    });
  }
}

debugChildren();
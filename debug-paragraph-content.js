import { JSDOM } from 'jsdom';
import { readFile } from 'fs/promises';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function debugParagraphContent() {
  try {
    const content = await readFile('/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell/Impressum.htm', 'utf8');
    
    // Create preprocessor and set preserve variables
    const preprocessor = new MadCapPreprocessor();
    preprocessor.setExtractVariables(false);
    preprocessor.setPreserveVariables(true);
    
    const preprocessed = await preprocessor.preprocessMadCapContent(
      content, 
      '/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell/Impressum.htm', 
      'writerside-markdown'
    );
    
    // Parse the result
    const dom = new JSDOM(preprocessed, { contentType: 'text/html' });
    const document = dom.window.document;
    
    console.log('=== Paragraph content analysis ===');
    const paragraphs = document.querySelectorAll('p');
    
    paragraphs.forEach((p, index) => {
      const vars = p.querySelectorAll('MadCap\\:variable, madcap\\:variable');
      const hasVariables = vars.length > 0;
      
      // Mimic the WritersideMarkdownConverter's convertDomToMarkdown for this paragraph
      let paragraphContent = '';
      
      for (const node of Array.from(p.childNodes)) {
        if (node.nodeType === document.TEXT_NODE) {
          const rawText = node.textContent || '';
          if (rawText) {
            // Clean and escape the text (simplified version)
            const text = rawText.replace(/\\s+/g, ' ').trim();
            paragraphContent += text;
          }
        } else if (node.nodeType === document.ELEMENT_NODE) {
          const elem = node;
          const tagName = elem.tagName.toLowerCase();
          
          if (tagName === 'madcap:variable') {
            const varName = elem.getAttribute('name');
            paragraphContent += `<var name="${varName}"/>`;
          } else if (tagName === 'br') {
            paragraphContent += '  \\n'; // Hard line break
          } else {
            // For other elements, just get their text content
            paragraphContent += elem.textContent || '';
          }
        }
      }
      
      // Clean the content like WritersideMarkdownConverter does
      const cleanContent = paragraphContent.replace(/^\\n+|\\n+$/g, '');
      const isEmpty = !cleanContent;
      
      console.log(`P${index + 1}: ${hasVariables ? `${vars.length} vars` : 'no vars'}`);
      console.log(`  Raw content: "${paragraphContent}"`);
      console.log(`  Clean content: "${cleanContent}"`);
      console.log(`  Empty after cleaning: ${isEmpty}`);
      
      if (hasVariables) {
        const varNames = Array.from(vars).map(v => v.getAttribute('name')).join(', ');
        console.log(`  Variables: ${varNames}`);
        
        if (isEmpty) {
          console.log(`  ❌ THIS PARAGRAPH WILL BE REMOVED (empty after cleaning)`);
        }
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugParagraphContent();
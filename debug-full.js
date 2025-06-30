import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';
import { JSDOM } from 'jsdom';

// Create a debug converter that logs each step
class FullDebugConverter extends WritersideMarkdownConverter {
  convertDomToMarkdown(element, document) {
    console.log(`\nconvertDomToMarkdown called on: ${element.tagName || 'TEXT'}`);
    let result = '';
    
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === document.TEXT_NODE) {
        // Handle text nodes - preserve ALL content including punctuation and spaces
        const rawText = node.textContent || '';
        console.log(`  Processing TEXT node: "${rawText}"`);
        if (rawText) { // Process any non-empty text content
          const text = this.cleanTextContent(rawText);
          console.log(`  After cleanTextContent: "${text}"`);
          const escaped = this.escapeMarkdownText(text);
          console.log(`  After escapeMarkdownText: "${escaped}"`);
          result += escaped;
        }
      } else if (node.nodeType === document.ELEMENT_NODE) {
        const elem = node;
        console.log(`  Processing ELEMENT node: ${elem.tagName}`);
        const elementResult = this.convertElementToMarkdown(elem, document);
        console.log(`  Element result: "${elementResult}"`);
        result += elementResult;
      }
    }
    
    console.log(`convertDomToMarkdown result: "${result}"`);
    return result;
  }
  
  handleParagraph(element, content, document) {
    console.log(`\nhandleParagraph called with content: "${content}"`);
    const result = super.handleParagraph(element, content, document);
    console.log(`handleParagraph result: "${result}"`);
    return result;
  }
  
  postProcessMarkdown(content) {
    console.log(`\npostProcessMarkdown input: "${content}"`);
    const result = super.postProcessMarkdown(content);
    console.log(`postProcessMarkdown result: "${result}"`);
    return result;
  }
}

const converter = new FullDebugConverter();

console.log('Full debug trace...');

const input = '<p>The <em>panel</em>is not showing.</p>';
console.log(`Input: ${input}`);

const options = {
  format: 'writerside-markdown',
  preserveFormatting: false
};

try {
  const result = await converter.convert(input, options);
  console.log(`\nFinal output: "${result.content.trim()}"`);
} catch (error) {
  console.log(`Error: ${error.message}`);
}
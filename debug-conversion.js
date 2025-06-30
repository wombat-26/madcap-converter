import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';
import { JSDOM } from 'jsdom';

// Create a subclass with debug logging
class DebugWritersideMarkdownConverter extends WritersideMarkdownConverter {
  handleEmphasis(element, content) {
    console.log(`\nhandleEmphasis called:`);
    console.log(`  content: "${content}"`);
    
    // Check for immediately following punctuation in the next sibling text node
    const followingPunctuation = this.getFollowingPunctuation(element);
    console.log(`  followingPunctuation: "${followingPunctuation}"`);
    
    // Check if there's a text node following this element that starts with non-whitespace
    const nextSibling = element.nextSibling;
    console.log(`  nextSibling exists: ${!!nextSibling}`);
    if (nextSibling) {
      console.log(`  nextSibling nodeType: ${nextSibling.nodeType}`);
      console.log(`  nextSibling textContent: "${nextSibling.textContent}"`);
    }
    
    const needsTrailingSpace = nextSibling && 
                               nextSibling.nodeType === 3 && // TEXT_NODE 
                               nextSibling.textContent && 
                               /^[^\s]/.test(nextSibling.textContent) &&
                               !followingPunctuation;
                               
    console.log(`  needsTrailingSpace: ${needsTrailingSpace}`);
    
    let result;
    if (followingPunctuation) {
      // Put punctuation outside the emphasis markers
      result = `*${content.trim()}*${followingPunctuation}`;
    } else if (needsTrailingSpace) {
      // Add space after emphasis if followed by non-whitespace text
      result = `*${content.trim()}* `;
    } else {
      result = `*${content}*`;
    }
    
    console.log(`  result: "${result}"`);
    return result;
  }
  
  getFollowingPunctuation(element) {
    const nextSibling = element.nextSibling;
    if (nextSibling && nextSibling.nodeType === 3) { // TEXT_NODE
      const textContent = nextSibling.textContent || '';
      // Match punctuation at the start of the text node
      const punctuationMatch = textContent.match(/^[.!?;:,]+/);
      if (punctuationMatch) {
        // Don't modify the DOM - just return the punctuation
        // We'll clean up duplicates in post-processing
        return punctuationMatch[0];
      }
    }
    return '';
  }
}

const converter = new DebugWritersideMarkdownConverter();

console.log('Testing emphasis spacing with debug logging...');

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
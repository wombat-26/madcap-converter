// Test the exact input that goes into postProcessMarkdown
const exactInput = "The *panel* is not showing.\n\n";

console.log(`Testing postProcessMarkdown with exact input:`);
console.log(`Input: "${exactInput}"`);
console.log(`Input length: ${exactInput.length}`);
console.log(`Input chars:`, [...exactInput].map(c => c === '\n' ? '\\n' : c));

// Import the actual converter and test
import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';

const converter = new WritersideMarkdownConverter();

// We can't call private method directly, so let's recreate the post-processing logic
function testPostProcessMarkdown(content) {
  if (!content || typeof content !== 'string') {
    return content || '';
  }
  
  let processed = content;
  console.log(`Starting postProcessMarkdown with: "${processed}"`);
  
  // Fix excessive blank lines
  processed = processed.replace(/\n{4,}/g, '\n\n\n');
  console.log(`After blank line fix 1: "${processed}"`);
  
  processed = processed.replace(/\n{3}/g, '\n\n');
  console.log(`After blank line fix 2: "${processed}"`);
  
  // Heading spacing
  processed = processed.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
  processed = processed.replace(/(#{1,6}[^\n]*)\n([^\n#])/g, '$1\n\n$2');
  processed = processed.replace(/(#{1,6}[^\n]*)\n(#{1,6}\s)/g, '$1\n\n$2');
  processed = processed.replace(/\n{3,}/g, '\n\n');
  console.log(`After heading spacing: "${processed}"`);
  
  // Test list spacing by calling a simple version
  const lines = processed.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    console.log(`Processing line ${i}: "${currentLine}"`);
    result.push(currentLine);
  }
  
  processed = result.join('\n');
  console.log(`After list spacing simulation: "${processed}"`);
  
  // Emphasis cleanup
  processed = processed.replace(/\*([^*]*?)\s{2,}([^*]*?)\*/g, '*$1 $2*');
  processed = processed.replace(/\*\*([^*]*?)\s{2,}([^*]*?)\*\*/g, '**$1 $2**');
  processed = processed.replace(/\*\s+([^*]+?)\s+\*/g, '*$1*');
  processed = processed.replace(/\*\*\s+([^*]+?)\s+\*\*/g, '**$1**');
  console.log(`After emphasis cleanup: "${processed}"`);
  
  // Test removeFilePathArtifacts logic
  processed = processed.replace(/\.(htm|html|aspx|php|jsp)$/gm, '');
  processed = processed.replace(/\.(htm|html|aspx|php|jsp)\s*$/gm, '');
  console.log(`After file artifact removal: "${processed}"`);
  
  // Remove trailing whitespace
  processed = processed.replace(/[ \t]+$/gm, '');
  console.log(`After trailing whitespace removal: "${processed}"`);
  
  // Ensure single newline at end
  processed = processed.replace(/\n*$/, '\n');
  console.log(`After final newline fix: "${processed}"`);
  
  return processed;
}

const result = testPostProcessMarkdown(exactInput);
console.log(`\nFinal result: "${result}"`);
console.log(`Final result length: ${result.length}`);
console.log(`Final result chars:`, [...result].map(c => c === '\n' ? '\\n' : c));
import fs from 'fs/promises';

const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

// Patch the postProcessMarkdown method to add debugging
const originalPostProcess = WritersideMarkdownConverter.prototype.postProcessMarkdown;
WritersideMarkdownConverter.prototype.postProcessMarkdown = function(content) {
  console.log('=== POST-PROCESS DEBUGGING ===');
  
  const deleteSection = content.substring(content.indexOf('4. Click'), content.indexOf('4. Click') + 20);
  console.log('Before post-processing Delete section:', JSON.stringify(deleteSection));
  
  let processed = content;
  
  // Fix spacing issues first - before other processing
  processed = this.fixSpacingIssues(processed);
  const afterSpacing = processed.substring(processed.indexOf('4. Click'), processed.indexOf('4. Click') + 20);
  console.log('After fixSpacingIssues:', JSON.stringify(afterSpacing));
  
  // Fix punctuation spacing after general spacing fixes
  processed = this.fixPunctuationSpacing(processed);
  const afterPunctuation = processed.substring(processed.indexOf('4. Click'), processed.indexOf('4. Click') + 20);
  console.log('After fixPunctuationSpacing:', JSON.stringify(afterPunctuation));
  
  // Continue with rest of original method...
  const result = originalPostProcess.call(this, content);
  
  const finalSection = result.substring(result.indexOf('4. Click'), result.indexOf('4. Click') + 20);
  console.log('Final result Delete section:', JSON.stringify(finalSection));
  
  return result;
};

// Also patch fixPunctuationSpacing specifically
const originalFixPunctuation = WritersideMarkdownConverter.prototype.fixPunctuationSpacing;
WritersideMarkdownConverter.prototype.fixPunctuationSpacing = function(content) {
  console.log('=== FIX PUNCTUATION SPACING ===');
  
  const beforeSection = content.substring(content.indexOf('4. Click'), content.indexOf('4. Click') + 20);
  console.log('Before fixPunctuationSpacing Delete section:', JSON.stringify(beforeSection));
  
  let processed = content;
  
  // Remove spaces before punctuation marks (but preserve newlines)
  const beforeRemoveSpaces = processed.substring(processed.indexOf('4. Click'), processed.indexOf('4. Click') + 20);
  processed = processed.replace(/ +([.!?;:,\)\]}>])/g, '$1');
  const afterRemoveSpaces = processed.substring(processed.indexOf('4. Click'), processed.indexOf('4. Click') + 20);
  console.log('After remove spaces before punctuation:', JSON.stringify(afterRemoveSpaces));
  
  // Fix emphasis before punctuation - remove spaces (but only single spaces, not multiple)
  processed = processed.replace(/\* ([.!?;:,])/g, '*$1');
  const afterEmphasisFix = processed.substring(processed.indexOf('4. Click'), processed.indexOf('4. Click') + 20);
  console.log('After emphasis punctuation fix:', JSON.stringify(afterEmphasisFix));
  
  return originalFixPunctuation.call(this, content);
};

const converter = new WritersideMarkdownConverter();
const inputFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-08 DeleteActivity.htm';
const content = await fs.readFile(inputFile, 'utf8');

const result = await converter.convert(content, {
  format: 'writerside-markdown',
  inputType: 'html',
  inputPath: inputFile
});

console.log('\n=== FINAL VERIFICATION ===');
console.log('Result includes Delete with period:', result.content.includes('*Delete*.'));
console.log('Result includes Delete without period:', result.content.includes('*Delete*\n'));
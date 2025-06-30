import fs from 'fs/promises';

const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

// Completely override postProcessMarkdown to debug each step
WritersideMarkdownConverter.prototype.postProcessMarkdown = function(content) {
  console.log('=== DETAILED POST-PROCESS DEBUG ===');
  
  let processed = content;
  
  function checkDeleteSection(label) {
    const section = processed.substring(processed.indexOf('4. Click'), processed.indexOf('4. Click') + 20);
    console.log(`${label}: ${JSON.stringify(section)}`);
  }
  
  checkDeleteSection('Initial');
  
  // Fix spacing issues first - before other processing
  processed = this.fixSpacingIssues(processed);
  checkDeleteSection('After fixSpacingIssues');
  
  // Fix punctuation spacing after general spacing fixes
  processed = this.fixPunctuationSpacing(processed);
  checkDeleteSection('After fixPunctuationSpacing');
  
  // Fix excessive blank lines (CommonMark allows any number but 2 is standard)
  processed = processed.replace(/\n{4,}/g, '\n\n\n');
  checkDeleteSection('After fix 4+ newlines');
  
  processed = processed.replace(/\n{3}/g, '\n\n');
  checkDeleteSection('After fix 3 newlines');
  
  // Ensure proper spacing around headings (before and after)
  processed = processed.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2'); // Add blank line before headings
  checkDeleteSection('After heading spacing 1');
  
  processed = processed.replace(/(#{1,6}[^\n]*)\n([^\n#])/g, '$1\n\n$2'); // Add blank line after headings
  checkDeleteSection('After heading spacing 2');
  
  // Special case: ensure spacing between consecutive headings
  processed = processed.replace(/(#{1,6}[^\n]*)\n(#{1,6}\s)/g, '$1\n\n$2');
  checkDeleteSection('After consecutive headings');
  
  // Fix potential triple newlines created by heading spacing
  processed = processed.replace(/\n{3,}/g, '\n\n');
  checkDeleteSection('After fix triple newlines');
  
  // Protect Writerside admonitions from line merging
  processed = this.protectAdmonitionSpacing(processed);
  checkDeleteSection('After protectAdmonitionSpacing');
  
  // Ensure proper spacing around lists
  processed = this.fixListSpacing(processed);
  checkDeleteSection('After fixListSpacing');
  
  return processed;
};

const converter = new WritersideMarkdownConverter();
const inputFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-08 DeleteActivity.htm';
const content = await fs.readFile(inputFile, 'utf8');

const result = await converter.convert(content, {
  format: 'writerside-markdown',
  inputType: 'html',
  inputPath: inputFile
});

console.log('\n=== FINAL CHECK ===');
console.log('Final result includes period:', result.content.includes('*Delete*.'));
console.log('Final result missing period:', result.content.includes('*Delete*\n'));
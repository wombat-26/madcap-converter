const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

const converter = new WritersideMarkdownConverter();

// Override fixSpacingIssues to debug each step
const originalFixSpacingIssues = converter.fixSpacingIssues.bind(converter);
converter.fixSpacingIssues = function(content) {
  console.log('[DEBUG] fixSpacingIssues input:', JSON.stringify(content));
  console.log('[DEBUG] Input contains "../":', content.includes('../'));
  console.log('[DEBUG] Input contains "./":', content.includes('./'));
  
  let processed = content;
  
  // Step 1: Fix missing spaces before emphasis markers
  const step1 = processed.replace(/([^\s\n])\*(\w)/g, '$1 *$2');
  const step2 = step1.replace(/([^\s\n])\*\*(\w)/g, '$1 **$2');
  
  if (step2 !== processed) {
    console.log('[DEBUG] After emphasis spacing: "../":', step2.includes('../'), ', "./":', step2.includes('./'));
  }
  processed = step2;
  
  // Step 3: Fix missing spaces after emphasis markers
  const step3 = processed.replace(/(\w)\*([^\s\n*.!?;:,\)\]}>])/g, '$1* $2');
  const step4 = step3.replace(/(\w)\*\*([^\s\n*.!?;:,\)\]}>])/g, '$1** $2');
  
  if (step4 !== step2) {
    console.log('[DEBUG] After emphasis end spacing: "../":', step4.includes('../'), ', "./":', step4.includes('./'));
  }
  processed = step4;
  
  // Step 5: Fix double punctuation patterns
  const step5 = processed.replace(/([.!?;:])\1+/g, '$1');
  const step6 = step5.replace(/\.,,/g, '.');
  const step7 = step6.replace(/,,/g, ',');
  
  if (step7 !== step4) {
    console.log('[DEBUG] After punctuation fixes: "../":', step7.includes('../'), ', "./":', step7.includes('./'));
  }
  processed = step7;
  
  // Step 8: Fix missing spaces after punctuation
  const step8 = processed.replace(/([.!?:])([A-Z])/g, '$1 $2');
  const step9 = step8.replace(/([,;])([a-zA-Z])/g, '$1 $2');
  
  if (step9 !== step7) {
    console.log('[DEBUG] After punctuation spacing: "../":', step9.includes('../'), ', "./":', step9.includes('./'));
  }
  processed = step9;
  
  // Step 10: Fix malformed emphasis patterns
  const step10 = processed.replace(/> \*\* ([^*]+?)\*\*/g, '> **$1**');
  const step11 = step10.replace(/\*\s*\*([^*]+?)\*\s*\*/g, '**$1**');
  
  if (step11 !== step9) {
    console.log('[DEBUG] After malformed emphasis: "../":', step11.includes('../'), ', "./":', step11.includes('./'));
  }
  processed = step11;
  
  // Step 12: Fix missing punctuation at end of sentences
  const step12 = processed.replace(/([a-z])(\n\d+\.)/g, '$1.$2');
  const step13 = step12.replace(/deleted\n$/g, 'deleted.\n');
  const step14 = step13.replace(/([a-z])(\s*\n*$)/g, '$1.$2');
  
  if (step14 !== step11) {
    console.log('[DEBUG] After sentence punctuation: "../":', step14.includes('../'), ', "./":', step14.includes('./'));
    console.log('[DEBUG] Step 12 result:', JSON.stringify(step12));
    console.log('[DEBUG] Step 13 result:', JSON.stringify(step13));
    console.log('[DEBUG] Step 14 result:', JSON.stringify(step14));
  }
  processed = step14;
  
  // Step 15: Fix line break issues around block elements
  const step15 = processed.replace(/(\w)\n(\d+\.)/g, '$1\n\n$2');
  const step16 = step15.replace(/\.\n(\d+\.)/g, '.\n\n$1');
  
  if (step16 !== step14) {
    console.log('[DEBUG] After line break fixes: "../":', step16.includes('../'), ', "./":', step16.includes('./'));
  }
  processed = step16;
  
  console.log('[DEBUG] fixSpacingIssues final result:', JSON.stringify(processed));
  console.log('[DEBUG] Final contains "../":', processed.includes('../'));
  console.log('[DEBUG] Final contains "./":', processed.includes('./'));
  
  return processed;
};

// Test the exact case
const testContent = 'Some text with image:\n\n\n![Linked Paths](../images/Images/Funktionen/Linked Paths 1.png)\n\n';

console.log('=== Testing fixSpacingIssues Step by Step ===\n');

const result = converter.fixSpacingIssues(testContent);
console.log('\nFinal result from fixSpacingIssues:', JSON.stringify(result));
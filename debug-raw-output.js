#!/usr/bin/env node

import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';
import { readFileSync } from 'fs';

console.log('=== DEBUGGING RAW CONVERTER OUTPUT ===\n');

const testFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-08 DeleteActivity.htm';
const htmlContent = readFileSync(testFile, 'utf8');

const converter = new WritersideMarkdownConverter();

// Monkey patch the postProcessMarkdown method to capture raw output
const originalPostProcess = converter.postProcessMarkdown;
converter.postProcessMarkdown = function(content) {
  console.log('=== RAW OUTPUT BEFORE POST-PROCESSING ===');
  console.log(JSON.stringify(content)); // Show raw with newlines
  console.log('\n=== RAW OUTPUT VISUAL ===');
  console.log(content.replace(/\n/g, '\\n\n'));
  
  const result = originalPostProcess.call(this, content);
  
  console.log('\n=== OUTPUT AFTER POST-PROCESSING ===');
  console.log(JSON.stringify(result));
  console.log('\n=== FINAL OUTPUT VISUAL ===');
  console.log(result.replace(/\n/g, '\\n\n'));
  
  return result;
};

async function testConversion() {
  try {
    const options = {
      format: 'writerside-markdown',
      inputType: 'madcap',
      inputPath: testFile
    };
    
    await converter.convert(htmlContent, options);
    
  } catch (error) {
    console.error('Conversion failed:', error.message);
  }
}

testConversion();
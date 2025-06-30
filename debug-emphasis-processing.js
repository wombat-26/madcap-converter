#!/usr/bin/env node

import { DocumentService } from './build/document-service.js';

async function debugEmphasisProcessing() {
  console.log('🔍 Debug: Emphasis processing in converter');
  console.log('==========================================');
  
  const documentService = new DocumentService();
  
  // Convert just one problematic sentence
  const testHtml = `<p>In the side navigation, click <i>&gt;&nbsp;Activities</i>.</p>`;
  
  console.log('Input HTML:', testHtml);
  
  // Test the converter directly
  const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;
  const converter = new WritersideMarkdownConverter();
  
  const result = await converter.convert(testHtml, {
    format: 'writerside-markdown',
    inputType: 'html'
  });
  
  console.log('Output markdown:', JSON.stringify(result.content));
  console.log('Actual output:');
  console.log(result.content);
}

debugEmphasisProcessing().catch(console.error);
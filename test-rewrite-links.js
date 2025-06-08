#!/usr/bin/env node

import { DocumentService } from './build/document-service.js';
import { promises as fs } from 'fs';

async function testWithRewriteLinks() {
  const documentService = new DocumentService();
  const inputPath = "/Volumes/Envoy Pro/Flare/Spend EN/Content/Home.htm";
  const outputPath = "/Users/meckardt/mecode/document-converter/test-rewrite-links.adoc";
  
  try {
    console.log('Testing with rewriteLinks enabled...\n');
    
    const result = await documentService.convertFile(
      inputPath,
      outputPath,
      {
        format: 'asciidoc',
        preserveFormatting: true,
        extractImages: true,
        rewriteLinks: true  // Enable this to see if .htm gets converted
      }
    );
    
    console.log('Conversion completed successfully!');
    console.log('Metadata:');
    console.log(JSON.stringify(result.metadata, null, 2));
    
    const convertedContent = await fs.readFile(outputPath, 'utf8');
    console.log('\n' + '='.repeat(80));
    console.log('CONVERTED ASCIIDOC CONTENT (with rewriteLinks=true):');
    console.log('='.repeat(80));
    console.log(convertedContent);
    console.log('='.repeat(80));
    
    // Check if .htm extensions are now converted
    const htmLinks = convertedContent.match(/link:[^[]*\.htm[^[]*\[/g);
    if (htmLinks) {
      console.log('\n❌ .HTM EXTENSIONS STILL NOT CONVERTED:');
      htmLinks.forEach(link => console.log(`  - ${link}`));
    } else {
      console.log('\n✅ All .htm extensions converted to .adoc');
    }
    
  } catch (error) {
    console.error('Conversion failed:', error);
  }
}

testWithRewriteLinks();
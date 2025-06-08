#!/usr/bin/env node

import { DocumentService } from './build/document-service.js';
import { promises as fs } from 'fs';

async function testConversion() {
  const documentService = new DocumentService();
  const inputPath = "/Volumes/Envoy Pro/Flare/Spend EN/Content/Home.htm";
  const outputPath = "/Users/meckardt/mecode/document-converter/test-home-conversion.adoc";
  
  try {
    console.log(`Converting file: ${inputPath}`);
    console.log(`Output will be saved to: ${outputPath}`);
    console.log('Starting conversion...\n');
    
    const result = await documentService.convertFile(
      inputPath,
      outputPath,
      {
        format: 'asciidoc',
        preserveFormatting: true,
        extractImages: true
      }
    );
    
    console.log('Conversion completed successfully!');
    console.log('Metadata:');
    console.log(JSON.stringify(result.metadata, null, 2));
    
    // Also read and display the converted content
    const convertedContent = await fs.readFile(outputPath, 'utf8');
    console.log('\n' + '='.repeat(80));
    console.log('CONVERTED ASCIIDOC CONTENT:');
    console.log('='.repeat(80));
    console.log(convertedContent);
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('Conversion failed:', error);
    
    // If the file doesn't exist, let's try to read the original file to see what's there
    try {
      console.log('\nAttempting to read the source file to diagnose the issue...');
      const sourceContent = await fs.readFile(inputPath, 'utf8');
      console.log('Source file content (first 1000 characters):');
      console.log(sourceContent.substring(0, 1000));
    } catch (readError) {
      console.error('Could not read source file:', readError.message);
    }
  }
}

testConversion();
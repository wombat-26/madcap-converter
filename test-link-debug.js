#!/usr/bin/env node

import { DocumentService } from './build/document-service.js';
import { promises as fs } from 'fs';

async function debugLinkIssues() {
  console.log('='.repeat(80));
  console.log('DEBUGGING LINK AND IMAGE FORMATTING ISSUES');
  console.log('='.repeat(80));
  
  // Read the source HTML to see the original structure
  const inputPath = "/Volumes/Envoy Pro/Flare/Spend EN/Content/Home.htm";
  
  try {
    const sourceContent = await fs.readFile(inputPath, 'utf8');
    console.log('\nSOURCE HTML CONTENT:');
    console.log('-'.repeat(40));
    console.log(sourceContent);
    console.log('-'.repeat(40));
    
    // Now convert and analyze specific issues
    const documentService = new DocumentService();
    const result = await documentService.convertFile(
      inputPath,
      "/Users/meckardt/mecode/document-converter/debug-link-issues.adoc",
      {
        format: 'asciidoc',
        preserveFormatting: true,
        extractImages: true
      }
    );
    
    const convertedContent = await fs.readFile("/Users/meckardt/mecode/document-converter/debug-link-issues.adoc", 'utf8');
    
    console.log('\nCONVERTED ASCIIDOC:');
    console.log('-'.repeat(40));
    console.log(convertedContent);
    console.log('-'.repeat(40));
    
    // Analyze specific issues
    console.log('\nISSUE ANALYSIS:');
    console.log('-'.repeat(40));
    
    // Check for malformed link syntax
    const malformedLinks = convertedContent.match(/link:[^[]+\[image:[^\]]+\[\]\]/g);
    if (malformedLinks) {
      console.log('❌ MALFORMED LINK SYNTAX FOUND:');
      malformedLinks.forEach(link => console.log(`  - ${link}`));
    } else {
      console.log('✅ No malformed link syntax found');
    }
    
    // Check for missing line breaks
    const missingBreaks = convertedContent.match(/\.\s*==/g);
    if (missingBreaks) {
      console.log('❌ MISSING LINE BREAKS BEFORE HEADERS:');
      missingBreaks.forEach(issue => console.log(`  - "${issue}"`));
    } else {
      console.log('✅ No missing line breaks before headers found');
    }
    
    // Check for .htm extensions
    const htmLinks = convertedContent.match(/link:[^[]*\.htm[^[]*\[/g);
    if (htmLinks) {
      console.log('❌ .HTM EXTENSIONS NOT CONVERTED:');
      htmLinks.forEach(link => console.log(`  - ${link}`));
    } else {
      console.log('✅ All .htm extensions converted to .adoc');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugLinkIssues();
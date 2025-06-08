#!/usr/bin/env node

import { DocumentService } from './build/document-service.js';
import { promises as fs } from 'fs';

async function finalConversionTest() {
  const documentService = new DocumentService();
  const inputPath = "/Volumes/Envoy Pro/Flare/Spend EN/Content/Home.htm";
  const outputPath = "/Users/meckardt/mecode/document-converter/test-final-fixed.adoc";
  
  try {
    console.log('🧪 FINAL CONVERSION TEST - ALL FIXES APPLIED');
    console.log('='.repeat(60));
    
    const result = await documentService.convertFile(
      inputPath,
      outputPath,
      {
        format: 'asciidoc',
        preserveFormatting: true,
        extractImages: true,
        rewriteLinks: true  // Enable this to convert .htm to .adoc
      }
    );
    
    const convertedContent = await fs.readFile(outputPath, 'utf8');
    console.log('\n📄 CONVERTED ASCIIDOC OUTPUT:');
    console.log('-'.repeat(40));
    console.log(convertedContent);
    console.log('-'.repeat(40));
    
    console.log('\n🔍 ISSUE ANALYSIS:');
    console.log('-'.repeat(40));
    
    // Check for multiple document titles
    const titles = convertedContent.match(/^= .+$/gm);
    if (titles && titles.length > 1) {
      console.log('❌ Multiple document titles found:', titles.length);
    } else {
      console.log('✅ Single document title: ' + (titles?.[0] || 'None'));
    }
    
    // Check for malformed link syntax
    const clickableImages = convertedContent.match(/link:[^[]+\[image:[^\]]+\[\]\]/g);
    if (clickableImages) {
      console.log('ℹ️  Clickable images found (valid AsciiDoc):');
      clickableImages.forEach(link => console.log(`  - ${link}`));
    }
    
    // Check for missing line breaks before headers
    const missingBreaks = convertedContent.match(/[^\n](==+\s+)/g);
    if (missingBreaks) {
      console.log('❌ Missing line breaks before headers:');
      missingBreaks.forEach(issue => console.log(`  - "${issue}"`));
    } else {
      console.log('✅ All headers have proper line breaks');
    }
    
    // Check for internal .htm extensions
    const internalHtmLinks = convertedContent.match(/link:[^[]*\.htm[^[]*\[/g)?.filter(link => 
      !link.includes('http') && !link.includes('knowledge.uptempo.io')
    );
    if (internalHtmLinks && internalHtmLinks.length > 0) {
      console.log('❌ Internal .htm extensions not converted:');
      internalHtmLinks.forEach(link => console.log(`  - ${link}`));
    } else {
      console.log('✅ All internal links converted to .adoc');
    }
    
    // Check external links are preserved
    const externalHtmLinks = convertedContent.match(/link:https?:[^[]*\.htm[^[]*\[/g);
    if (externalHtmLinks) {
      console.log('✅ External .htm links preserved:');
      externalHtmLinks.forEach(link => console.log(`  - ${link}`));
    }
    
    console.log('\n📊 CONVERSION METADATA:');
    console.log('-'.repeat(40));
    console.log(JSON.stringify(result.metadata, null, 2));
    
    console.log('\n🎉 CONVERSION COMPLETED SUCCESSFULLY!');
    
  } catch (error) {
    console.error('❌ Conversion failed:', error);
  }
}

finalConversionTest();
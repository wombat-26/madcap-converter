#!/usr/bin/env node

import { BatchService } from './build/batch-service.js';
import { ZendeskConverter } from './build/converters/zendesk-converter.js';
import { writeFile } from 'fs/promises';
import { join } from 'path';

async function runConversion() {
  const batchService = new BatchService();
  
  const options = {
    format: 'zendesk',
    recursive: true,
    preserveStructure: true,
    copyImages: true,
    preserveFormatting: true,
    extractImages: true,
    zendeskOptions: {
      generateTags: true,
      generateStylesheet: true,
      ignoreVideos: true,
      inlineStyles: false,
      sanitizeHtml: true,
      maxTags: 10
    }
  };

  const inputDir = "/Volumes/Envoy Pro/Flare/Administration EN/Content";
  const outputDir = "/Volumes/Envoy Pro/ZendeskOutputAdmin";

  try {
    console.log('Starting MadCap Flare to Zendesk conversion...');
    console.log(`Input: ${inputDir}`);
    console.log(`Output: ${outputDir}`);
    console.log('Options:', JSON.stringify(options, null, 2));
    
    const result = await batchService.convertFolder(inputDir, outputDir, options);
    
    console.log('\n📊 Conversion Results:');
    console.log(`- Total files found: ${result.totalFiles}`);
    console.log(`- Successfully converted: ${result.convertedFiles}`);
    console.log(`- Skipped files: ${result.skippedFiles}`);
    console.log(`- Errors: ${result.errors.length}`);
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => {
        console.log(`  - ${error.file}: ${error.error}`);
      });
    }
    
    console.log('\n✅ Converted files:');
    result.results.slice(0, 10).forEach(r => {
      console.log(`  - ${r.inputPath} → ${r.outputPath}`);
    });
    
    if (result.results.length > 10) {
      console.log(`  ... and ${result.results.length - 10} more files`);
    }
    
    // Generate external stylesheet since generateStylesheet was requested
    if (options.zendeskOptions.generateStylesheet) {
      console.log('\n📄 Generating external Zendesk stylesheet...');
      
      // Create a ZendeskConverter instance to get the stylesheet
      const zendeskConverter = new ZendeskConverter();
      const stylesheet = zendeskConverter.generateZendeskStylesheet();
      
      const stylesheetPath = join(outputDir, 'zendesk-styles.css');
      await writeFile(stylesheetPath, stylesheet, 'utf8');
      
      console.log(`✅ External stylesheet generated: ${stylesheetPath}`);
    }
    
    console.log('\n🎉 Conversion completed successfully!');
    
  } catch (error) {
    console.error('❌ Conversion failed:', error);
    process.exit(1);
  }
}

runConversion();
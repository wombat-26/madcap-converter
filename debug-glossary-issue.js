/**
 * Debug script to investigate glossary file discovery and parsing
 */

import { FlgloParser } from './src/core/services/flglo-parser.js';
import { stat, readdir } from 'fs/promises';
import { join } from 'path';

async function debugGlossaryDiscovery() {
  console.log('🔍 === GLOSSARY DEBUG INVESTIGATION ===');
  
  const glossaryPath = '/Volumes/Envoy Pro/Flare/CampaignPl EN/Project/Glossaries/Terminology.flglo';
  const projectPath = '/Volumes/Envoy Pro/Flare/CampaignPl EN';
  
  console.log(`📚 Target FLGLO file: ${glossaryPath}`);
  console.log(`📁 Project path: ${projectPath}`);
  
  // Step 1: Check if the file exists
  console.log('\n🔍 Step 1: File Existence Check');
  try {
    const fileStats = await stat(glossaryPath);
    console.log(`✅ File exists: ${glossaryPath}`);
    console.log(`📊 File size: ${fileStats.size} bytes`);
    console.log(`📅 Last modified: ${fileStats.mtime}`);
  } catch (error) {
    console.log(`❌ File does not exist or is not accessible: ${glossaryPath}`);
    console.log(`   Error: ${error.message}`);
    return;
  }
  
  // Step 2: Check project directory structure
  console.log('\n🔍 Step 2: Project Directory Structure');
  try {
    const projectContents = await readdir(projectPath);
    console.log(`📁 Project root contents: ${projectContents.join(', ')}`);
    
    const projectDir = join(projectPath, 'Project');
    try {
      const projectDirContents = await readdir(projectDir);
      console.log(`📁 Project/folder contents: ${projectDirContents.join(', ')}`);
      
      const glossariesDir = join(projectDir, 'Glossaries');
      try {
        const glossariesContents = await readdir(glossariesDir);
        console.log(`📁 Project/Glossaries contents: ${glossariesContents.join(', ')}`);
      } catch (error) {
        console.log(`❌ Cannot read Project/Glossaries directory: ${error.message}`);
      }
    } catch (error) {
      console.log(`❌ Cannot read Project directory: ${error.message}`);
    }
  } catch (error) {
    console.log(`❌ Cannot read project root: ${error.message}`);
  }
  
  // Step 3: Test FlgloParser discovery
  console.log('\n🔍 Step 3: FlgloParser Auto-Discovery');
  const parser = new FlgloParser([]);
  try {
    const discoveredFiles = await parser.findGlossaryFiles(projectPath);
    console.log(`📚 Discovered ${discoveredFiles.length} glossary files:`);
    discoveredFiles.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file}`);
    });
    
    if (!discoveredFiles.includes(glossaryPath)) {
      console.log(`⚠️ Target file NOT found in discovery results!`);
      console.log(`   Expected: ${glossaryPath}`);
    }
  } catch (error) {
    console.log(`❌ Error during discovery: ${error.message}`);
  }
  
  // Step 4: Test direct parsing of the FLGLO file
  console.log('\n🔍 Step 4: Direct FLGLO File Parsing');
  try {
    const result = await parser.parseGlossaryFile(glossaryPath);
    console.log(`✅ Successfully parsed FLGLO file!`);
    console.log(`📊 Total entries: ${result.metadata.totalEntries}`);
    console.log(`📋 Has conditions: ${result.metadata.hasConditions}`);
    console.log(`📚 Available entries: ${result.entries.length}`);
    
    if (result.entries.length > 0) {
      console.log(`📖 First few entries:`);
      result.entries.slice(0, 5).forEach((entry, index) => {
        console.log(`   ${index + 1}. ${entry.terms.join(', ')} - ${entry.definition.substring(0, 100)}...`);
      });
    } else {
      console.log(`⚠️ No entries were parsed from the FLGLO file!`);
      console.log(`   This could be due to condition filtering or file format issues.`);
    }
  } catch (error) {
    console.log(`❌ Error parsing FLGLO file: ${error.message}`);
    console.log(`   Stack trace: ${error.stack}`);
  }
  
  // Step 5: Check with different condition filters
  console.log('\n🔍 Step 5: Testing Condition Filtering');
  try {
    const conditions = [
      [],  // No filtering
      ['Status.XX Deprecated'],  // Filter deprecated content
      ['deprecated', 'obsolete']  // Filter other deprecated variations
    ];
    
    for (const conditionFilter of conditions) {
      console.log(`\n   Testing with conditions: ${conditionFilter.length === 0 ? 'none' : conditionFilter.join(', ')}`);
      const filterParser = new FlgloParser(conditionFilter);
      const result = await filterParser.parseGlossaryFile(glossaryPath);
      console.log(`   Results: ${result.entries.length} entries (from ${result.metadata.totalEntries} total)`);
    }
  } catch (error) {
    console.log(`❌ Error testing condition filtering: ${error.message}`);
  }
  
  console.log('\n✅ === DEBUG INVESTIGATION COMPLETE ===');
}

// Run the debug investigation
debugGlossaryDiscovery().catch(error => {
  console.error(`💥 Fatal error during debugging: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
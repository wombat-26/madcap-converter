/**
 * Simple Test of User's Specific File
 * Tests: /Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm
 */

import { readFileSync, writeFileSync } from 'fs';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function testUserFile() {
  console.log('🎯 Testing USER PROVIDED FILE');
  console.log('='.repeat(50));
  console.log('File: /Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm');
  console.log('');

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const asciidocConverter = new AsciiDocConverter();

  try {
    // Read the exact file the user provided
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    console.log(`📁 SOURCE FILE ANALYSIS:`);
    console.log(`   Size: ${sourceHTML.length} characters`);
    console.log(`   Lines: ${sourceHTML.split('\n').length}`);

    // Check what's actually in the source
    console.log(`\n📊 WHAT'S IN THE SOURCE FILE:`);
    console.log(`   Has ordered lists: ${sourceHTML.includes('<ol>') ? '✅' : '❌'}`);
    console.log(`   Has nested lists (lower-alpha): ${sourceHTML.includes('lower-alpha') ? '✅' : '❌'}`);
    console.log(`   Has MadCap dropdowns: ${sourceHTML.includes('MadCap:dropDown') ? '✅' : '❌'}`);
    console.log(`   Has MadCap snippets: ${sourceHTML.includes('MadCap:snippet') ? '✅' : '❌'}`);
    console.log(`   Has cross-references: ${sourceHTML.includes('MadCap:xref') ? '✅' : '❌'}`);
    console.log(`   Has note elements: ${sourceHTML.includes('class="note"') ? '✅' : '❌'}`);
    console.log(`   Has images: ${sourceHTML.includes('<img') ? '✅' : '❌'}`);
    console.log(`   Has videos: ${sourceHTML.includes('MadCap:HTML5Video') ? '✅' : '❌'}`);

    // Step 1: Preprocess
    console.log(`\n🔄 STEP 1: MadCap Preprocessing...`);
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    console.log(`   Preprocessed size: ${preprocessedHTML.length} characters`);

    // Step 2: Convert to AsciiDoc
    console.log(`\n📝 STEP 2: Converting to AsciiDoc...`);
    const result = await asciidocConverter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: {
        useCollapsibleBlocks: true,
        enableValidation: true,
        autoColumnWidths: true
      }
    });

    console.log(`   Converted size: ${result.content.length} characters`);
    console.log(`   Size ratio: ${Math.round((result.content.length / sourceHTML.length) * 100)}%`);

    // Check what we got in the output
    console.log(`\n📊 WHAT'S IN THE CONVERTED OUTPUT:`);
    console.log(`   Document title: ${result.content.includes('= Create a New Activity') ? '✅' : '❌'}`);
    console.log(`   Main ordered lists: ${result.content.includes('. ') ? '✅' : '❌'}`);
    console.log(`   Nested lists: ${result.content.includes('.. ') ? '✅' : '❌'}`);
    console.log(`   Lower-alpha marker: ${result.content.includes('[loweralpha]') ? '✅' : '❌'}`);
    console.log(`   Collapsible blocks: ${result.content.includes('[%collapsible]') ? '✅' : '❌'}`);
    console.log(`   Dropdown content: ${result.content.includes('Connecting Activities') ? '✅' : '❌'}`);
    console.log(`   Note blocks: ${result.content.includes('[NOTE]') ? '✅' : '❌'}`);
    console.log(`   Inline notes: ${result.content.includes('NOTE:') ? '✅' : '❌'}`);
    console.log(`   Images: ${result.content.includes('image:') ? '✅' : '❌'}`);
    console.log(`   Block images: ${result.content.includes('image::') ? '✅' : '❌'}`);
    console.log(`   Cross-references: ${result.content.includes('xref:') ? '✅' : '❌'}`);
    console.log(`   Video elements: ${result.content.includes('video::') ? '✅' : '❌'}`);

    // Save the output for the user to inspect
    const outputFile = './USER-FILE-CONVERSION-OUTPUT.adoc';
    writeFileSync(outputFile, result.content);
    console.log(`\n📁 OUTPUT SAVED TO: ${outputFile}`);

    // Show first 30 lines so user can see the structure
    console.log(`\n📄 FIRST 30 LINES OF CONVERTED OUTPUT:`);
    console.log('=' + '='.repeat(60));
    result.content.split('\n').slice(0, 30).forEach((line, index) => {
      console.log(`${(index + 1).toString().padStart(3)}: ${line}`);
    });
    console.log('=' + '='.repeat(60));

    // Compare to user's specific concerns from the screenshot
    console.log(`\n🎯 USER'S SPECIFIC REQUIREMENTS (from screenshot comparison):`);
    
    // Check for the structure visible in the left vs right comparison
    const checks = [
      {
        requirement: 'Main numbered steps structure preserved',
        check: result.content.includes('. In Uptempo, click') && result.content.includes('. In the Activities section'),
        details: 'Should have numbered list items like "1. In Uptempo..." and "2. In the Activities..."'
      },
      {
        requirement: 'Alphabetical sub-steps (a, b, c) working',
        check: result.content.includes('[loweralpha]') && result.content.includes('.. Use the') && result.content.includes('.. Use the'),
        details: 'Should have [loweralpha] marker and .. sub-items for a, b, c steps'
      },
      {
        requirement: 'Dropdown sections converted to collapsible',
        check: result.content.includes('[%collapsible]') && result.content.includes('.Connecting Activities to Financial Items'),
        details: 'MadCap dropdowns should become AsciiDoc collapsible blocks'
      },
      {
        requirement: 'Note elements properly converted',
        check: result.content.includes('[NOTE]') || result.content.includes('NOTE:'),
        details: 'Note divs should become AsciiDoc note admonitions'
      },
      {
        requirement: 'Images properly referenced',
        check: result.content.includes('image::') && result.content.includes('CreateActivity.png'),
        details: 'Images should be converted with proper paths'
      }
    ];

    checks.forEach((check, index) => {
      const status = check.check ? '✅ PASS' : '❌ FAIL';
      console.log(`   ${status} ${check.requirement}`);
      if (!check.check) {
        console.log(`        Details: ${check.details}`);
      }
    });

    const passedChecks = checks.filter(c => c.check).length;
    console.log(`\n📊 USER REQUIREMENTS SCORE: ${passedChecks}/${checks.length} (${Math.round((passedChecks/checks.length)*100)}%)`);

    if (passedChecks === checks.length) {
      console.log(`\n🎉 SUCCESS! All user requirements from the screenshot comparison are met!`);
      console.log(`The conversion now matches the expected structure from the user's comparison.`);
    } else {
      console.log(`\n⚠️  ISSUES FOUND: ${checks.length - passedChecks} requirements not fully met.`);
      console.log(`Please check the output file for details: ${outputFile}`);
    }

  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    
    if (error instanceof Error && error.message.includes('ENOENT')) {
      console.log(`\n💡 The file path might be incorrect or the file is not accessible.`);
      console.log(`   Tried to read: ${sourceFile}`);
      console.log(`   Please verify the file exists and is readable.`);
    }
  }
}

console.log('Testing the exact file provided by the user...\n');
testUserFile().catch(console.error);
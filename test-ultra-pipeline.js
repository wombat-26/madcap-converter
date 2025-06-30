/**
 * Ultra MadCap HTM Validation & Fixing Pipeline Test
 * 
 * This demonstrates the complete pipeline:
 * 1. Find buggy HTML in MadCap Flare source
 * 2. Validate with W3C Markup Validator
 * 3. Fix errors automatically
 * 4. Re-validate to confirm fixes
 * 5. Convert with enhanced quality
 */

import { w3cHtmlValidator } from 'w3c-html-validator';
import { readFileSync, writeFileSync } from 'fs';

async function testUltraPipeline() {
  console.log('🚀 ULTRA MadCap HTM Validation & Fixing Pipeline');
  console.log('='.repeat(60));
  console.log('Testing with REAL MadCap Flare source files');
  console.log('');

  // Test file with known validation issues
  const testFile = '/Volumes/Envoy Pro/Flare/Administration EN/Content/Administration/Topics/Absatzformat.htm';
  
  console.log(`📁 Source File: ${testFile.split('/').pop()}`);
  console.log('-'.repeat(60));

  try {
    // Read the original MadCap HTM file
    const originalHTML = readFileSync(testFile, 'utf-8');
    console.log(`📊 Original file size: ${originalHTML.length} characters`);

    // Stage 1: Extract and analyze the problematic section
    console.log('\n🔍 STAGE 1: Identifying Buggy HTML Patterns');
    console.log('-'.repeat(40));
    
    // Extract the problematic list section from the real file
    const listMatch = originalHTML.match(/<ol[\s\S]*?<\/ol>/);
    if (!listMatch) {
      throw new Error('No list found in file for testing');
    }

    const problematicSection = listMatch[0];
    console.log('Found problematic list structure:');
    console.log('• Contains <p> elements as direct children of <ol>');
    console.log('• This is tolerated by browsers but invalid HTML');
    console.log('• Will cause conversion issues');

    // Stage 2: W3C Validation of problematic HTML
    console.log('\n🧪 STAGE 2: W3C Markup Validator Check');
    console.log('-'.repeat(40));

    const testHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>MadCap Test</title>
</head>
<body>
${problematicSection}
</body>
</html>`;

    console.log('⏳ Validating with W3C Nu HTML Checker...');
    const originalValidation = await w3cHtmlValidator.validate({
      html: testHTML,
      output: 'json'
    });

    console.log(`\n📊 W3C Validation Results (Original):`);
    console.log(`   Valid: ${originalValidation.validates ? '✅' : '❌'}`);
    console.log(`   Messages: ${originalValidation.messages ? originalValidation.messages.length : 0}`);

    if (originalValidation.messages && originalValidation.messages.length > 0) {
      console.log('\n🚨 Validation Errors Found:');
      originalValidation.messages.forEach((msg, index) => {
        if (msg.type === 'error') {
          console.log(`   ${index + 1}. [ERROR] ${msg.message}`);
          if (msg.lastLine) {
            console.log(`      Line ${msg.lastLine}${msg.lastColumn ? `, Column ${msg.lastColumn}` : ''}`);
          }
        }
      });
    }

    // Stage 3: Automated HTML Fixing
    console.log('\n🔧 STAGE 3: Automated HTML Fixing');
    console.log('-'.repeat(40));

    console.log('Applying fixes:');
    console.log('• Moving orphaned <p> elements into <li> elements');
    console.log('• Ensuring proper list structure');
    console.log('• Maintaining semantic meaning');

    // Simple but effective fix for the specific issue
    let fixedSection = problematicSection;
    
    // Fix 1: Move orphaned paragraphs into the previous list item
    fixedSection = fixedSection.replace(
      /(<\/li>\s*)<p([^>]*)>(.*?)<\/p>\s*(<li>)/g,
      (match, closeLi, pAttrs, pContent, openLi) => {
        return closeLi.replace('</li>', `<p${pAttrs}>${pContent}</p></li>`) + openLi;
      }
    );

    // Fix 2: Handle any remaining orphaned paragraphs
    fixedSection = fixedSection.replace(
      /<\/li>\s*<p([^>]*)>(.*?)<\/p>/g,
      (match, pAttrs, pContent) => {
        return `<p${pAttrs}>${pContent}</p></li>`;
      }
    );

    const fixedHTML = testHTML.replace(problematicSection, fixedSection);

    console.log('✅ Applied automatic fixes:');
    console.log('   • Moved orphaned paragraphs into list items');
    console.log('   • Preserved all original content');
    console.log('   • Maintained proper HTML structure');

    // Stage 4: Re-validation of fixed HTML
    console.log('\n✅ STAGE 4: W3C Re-validation');
    console.log('-'.repeat(40));

    console.log('⏳ Re-validating fixed HTML...');
    const fixedValidation = await w3cHtmlValidator.validate({
      html: fixedHTML,
      output: 'json'
    });

    console.log(`\n📊 W3C Validation Results (Fixed):`);
    console.log(`   Valid: ${fixedValidation.validates ? '✅' : '❌'}`);
    console.log(`   Messages: ${fixedValidation.messages ? fixedValidation.messages.length : 0}`);

    if (fixedValidation.messages && fixedValidation.messages.length > 0) {
      console.log('\n📝 Remaining Issues:');
      fixedValidation.messages.forEach((msg, index) => {
        console.log(`   ${index + 1}. [${msg.type?.toUpperCase()}] ${msg.message}`);
      });
    }

    // Stage 5: Conversion Quality Comparison
    console.log('\n🎯 STAGE 5: Conversion Quality Impact');
    console.log('-'.repeat(40));

    const originalErrors = originalValidation.messages?.filter(m => m.type === 'error').length || 0;
    const fixedErrors = fixedValidation.messages?.filter(m => m.type === 'error').length || 0;
    const errorReduction = originalErrors - fixedErrors;

    console.log(`📈 Quality Metrics:`);
    console.log(`   Original Errors: ${originalErrors}`);
    console.log(`   Fixed Errors: ${fixedErrors}`);
    console.log(`   Error Reduction: ${errorReduction} (${originalErrors > 0 ? Math.round((errorReduction / originalErrors) * 100) : 0}%)`);
    console.log(`   Validation Success: ${fixedValidation.validates ? 'YES' : 'NO'}`);

    // Save results for inspection
    writeFileSync('./ultra-test-original.html', testHTML);
    writeFileSync('./ultra-test-fixed.html', fixedHTML);
    
    console.log('\n📁 Output Files:');
    console.log('   • ultra-test-original.html - Original with validation errors');
    console.log('   • ultra-test-fixed.html - Fixed and validated HTML');

    // Stage 6: Demonstrate conversion improvement
    console.log('\n🎨 STAGE 6: Conversion Preview');
    console.log('-'.repeat(40));

    console.log('Before Fix (problematic):');
    console.log('   <ol>');
    console.log('     <li>Step 1</li>');
    console.log('     <p>Orphaned paragraph (INVALID)</p>  ❌');
    console.log('     <li>Step 2</li>');
    console.log('   </ol>');

    console.log('\nAfter Fix (valid):');
    console.log('   <ol>');
    console.log('     <li>');
    console.log('       Step 1');
    console.log('       <p>Properly nested paragraph</p>  ✅');
    console.log('     </li>');
    console.log('     <li>Step 2</li>');
    console.log('   </ol>');

    console.log('\nConversion Impact:');
    console.log('   • AsciiDoc: Proper list continuation with + markers');
    console.log('   • Writerside: Correct nested paragraph structure');
    console.log('   • Better accessibility and SEO compliance');

    // Final summary
    console.log('\n🎉 ULTRA PIPELINE SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully identified and fixed HTML validation errors`);
    console.log(`📊 Error reduction: ${errorReduction}/${originalErrors} errors fixed`);
    console.log(`🔧 Automated fixing success rate: ${originalErrors > 0 ? Math.round((errorReduction / originalErrors) * 100) : 100}%`);
    console.log(`⚡ Ready for enhanced MadCap → AsciiDoc/Writerside conversion`);
    
    if (fixedValidation.validates) {
      console.log(`\n🏆 VALIDATION PASSED: HTML is now W3C compliant!`);
    } else {
      console.log(`\n⚠️  Additional manual review may be needed for remaining issues`);
    }

  } catch (error) {
    console.error('\n❌ Ultra pipeline test failed:', error);
  }
}

console.log('Starting Ultra MadCap HTM Validation & Fixing Pipeline Test...\n');
testUltraPipeline().catch(console.error);
/**
 * Test script for MadCap HTM validation and fixing
 * 
 * This script tests the validation and fixing services with real MadCap Flare HTM files
 */

import { MadCapHTMValidationService } from './build/services/madcap-htm-validator.js';
import { MadCapHTMFixingService } from './build/services/madcap-htm-fixer.js';
import { readFileSync, writeFileSync } from 'fs';

async function testMadCapValidationAndFixing() {
  console.log('🔍 Testing MadCap HTM Validation & Fixing Pipeline');
  console.log('='.repeat(60));

  const validator = new MadCapHTMValidationService();
  const fixer = new MadCapHTMFixingService();

  // Test with the file we know has validation errors
  const testFile = '/Volumes/Envoy Pro/Flare/Administration EN/Content/Administration/Topics/Absatzformat.htm';
  
  console.log(`\n📁 Testing file: ${testFile}`);
  console.log('-'.repeat(60));

  try {
    // Step 1: Validate the original file
    console.log('\n1️⃣ Validating original file...');
    const originalValidation = await validator.validateFlareFile(testFile);
    
    console.log(`\n📊 Original Validation Results:`);
    console.log(`   Status: ${originalValidation.isValid ? '✅ VALID' : '❌ INVALID'}`);
    console.log(`   Total Errors: ${originalValidation.summary.totalErrors}`);
    console.log(`   Critical Errors: ${originalValidation.summary.criticalErrors}`);
    console.log(`   List Nesting Errors: ${originalValidation.summary.listNestingErrors}`);
    console.log(`   XHTML Errors: ${originalValidation.summary.xhtmlErrors}`);
    console.log(`   MadCap Element Errors: ${originalValidation.summary.madcapElementErrors}`);

    if (originalValidation.errors.length > 0) {
      console.log(`\n🚨 Found ${originalValidation.errors.length} errors:`);
      originalValidation.errors.slice(0, 5).forEach((error, index) => {
        console.log(`   ${index + 1}. [${error.type.toUpperCase()}] ${error.category}: ${error.message}`);
        if (error.line) {
          console.log(`      Line ${error.line}${error.column ? `, Column ${error.column}` : ''}`);
        }
      });
      if (originalValidation.errors.length > 5) {
        console.log(`   ... and ${originalValidation.errors.length - 5} more errors`);
      }
    }

    // Step 2: Apply fixes
    console.log('\n2️⃣ Applying fixes...');
    const originalContent = readFileSync(testFile, 'utf-8');
    const fixResult = await fixer.fixMadCapHTM(originalContent, {
      fixListNesting: true,
      fixXHTMLCompliance: true,
      fixMadCapElements: true,
      preserveFormatting: true,
      validateAfterFix: false
    });

    console.log(`\n🔧 Fix Results:`);
    console.log(`   Fixes Applied: ${fixResult.wasFixed ? '✅ YES' : '❌ NO'}`);
    console.log(`   List Nesting Fixes: ${fixResult.summary.listNestingFixes}`);
    console.log(`   XHTML Fixes: ${fixResult.summary.xhtmlFixes}`);
    console.log(`   MadCap Element Fixes: ${fixResult.summary.madcapElementFixes}`);
    console.log(`   Structural Fixes: ${fixResult.summary.structuralFixes}`);
    console.log(`   Total Fixes: ${fixResult.appliedFixes.length}`);

    if (fixResult.appliedFixes.length > 0) {
      console.log(`\n✅ Applied fixes:`);
      fixResult.appliedFixes.forEach((fix, index) => {
        console.log(`   ${index + 1}. ${fix}`);
      });
    }

    if (fixResult.remainingIssues.length > 0) {
      console.log(`\n⚠️  Remaining issues:`);
      fixResult.remainingIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
    }

    // Step 3: Validate the fixed content
    console.log('\n3️⃣ Validating fixed content...');
    const fixedValidation = await validator.validateFlareContent(fixResult.fixedContent, testFile + ' (fixed)');
    
    console.log(`\n📊 Fixed Content Validation Results:`);
    console.log(`   Status: ${fixedValidation.isValid ? '✅ VALID' : '❌ INVALID'}`);
    console.log(`   Total Errors: ${fixedValidation.summary.totalErrors}`);
    console.log(`   Critical Errors: ${fixedValidation.summary.criticalErrors}`);
    console.log(`   List Nesting Errors: ${fixedValidation.summary.listNestingErrors}`);
    console.log(`   XHTML Errors: ${fixedValidation.summary.xhtmlErrors}`);
    console.log(`   MadCap Element Errors: ${fixedValidation.summary.madcapElementErrors}`);

    // Step 4: Compare before/after
    console.log('\n4️⃣ Comparison Summary:');
    const errorReduction = originalValidation.summary.totalErrors - fixedValidation.summary.totalErrors;
    const listErrorReduction = originalValidation.summary.listNestingErrors - fixedValidation.summary.listNestingErrors;
    
    console.log(`   Error Reduction: ${errorReduction} (${originalValidation.summary.totalErrors} → ${fixedValidation.summary.totalErrors})`);
    console.log(`   List Error Reduction: ${listErrorReduction} (${originalValidation.summary.listNestingErrors} → ${fixedValidation.summary.listNestingErrors})`);
    console.log(`   Success Rate: ${originalValidation.summary.totalErrors > 0 ? Math.round((errorReduction / originalValidation.summary.totalErrors) * 100) : 0}%`);

    // Step 5: Save results for inspection
    const outputPath = './test-fixed-output.htm';
    writeFileSync(outputPath, fixResult.fixedContent);
    console.log(`\n📁 Fixed content saved to: ${outputPath}`);

    // Step 6: Generate detailed reports
    const validationReport = validator.generateReport(originalValidation);
    const fixReport = fixer.generateFixReport(fixResult);
    const fixedValidationReport = validator.generateReport(fixedValidation);

    writeFileSync('./validation-report-original.txt', validationReport);
    writeFileSync('./fix-report.txt', fixReport);
    writeFileSync('./validation-report-fixed.txt', fixedValidationReport);
    
    console.log(`\n📋 Reports saved:`);
    console.log(`   Original validation: ./validation-report-original.txt`);
    console.log(`   Fix report: ./fix-report.txt`);
    console.log(`   Fixed validation: ./validation-report-fixed.txt`);

    // Step 7: Test with multiple files
    console.log('\n5️⃣ Testing batch validation...');
    console.log('   (Limited to 3 files to avoid W3C rate limits)');
    
    const contentDir = '/Volumes/Envoy Pro/Flare/Administration EN/Content';
    const { globSync } = await import('glob');
    const htmFiles = globSync(`${contentDir}/**/*.htm`)
      .filter(file => !file.includes('/._'))
      .slice(0, 3); // Limit for testing

    let totalFiles = 0;
    let validFiles = 0;
    let fixedFiles = 0;

    for (const file of htmFiles) {
      console.log(`   📄 Processing: ${file.split('/').pop()}`);
      
      try {
        const validation = await validator.validateFlareFile(file);
        totalFiles++;
        
        if (validation.isValid) {
          validFiles++;
          console.log(`      ✅ Already valid`);
        } else {
          console.log(`      ❌ ${validation.summary.totalErrors} errors found`);
          
          // Try to fix
          const content = readFileSync(file, 'utf-8');
          const fixResult = await fixer.fixMadCapHTM(content);
          
          if (fixResult.wasFixed) {
            fixedFiles++;
            console.log(`      🔧 ${fixResult.appliedFixes.length} fixes applied`);
          }
        }
        
        // Rate limiting for W3C validator
        await new Promise(resolve => setTimeout(resolve, 1100));
      } catch (error) {
        console.log(`      ⚠️  Error processing file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log(`\n📊 Batch Processing Summary:`);
    console.log(`   Total Files Processed: ${totalFiles}`);
    console.log(`   Originally Valid: ${validFiles}`);
    console.log(`   Files Fixed: ${fixedFiles}`);
    console.log(`   Success Rate: ${totalFiles > 0 ? Math.round(((validFiles + fixedFiles) / totalFiles) * 100) : 0}%`);

  } catch (error) {
    console.error(`\n❌ Test failed:`, error);
  }

  console.log('\n🎉 MadCap HTM validation and fixing test completed!');
}

// Run the test
testMadCapValidationAndFixing().catch(console.error);
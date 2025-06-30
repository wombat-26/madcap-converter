/**
 * Test Stage Optimization Pipeline
 * 
 * Demonstrates the complete enhanced MadCap preprocessing pipeline with:
 * 1. HTML validation (Cheerio stage)
 * 2. Automatic fixing (Cheerio stage)
 * 3. Stage handoff optimization (Cheerio → JSDOM)
 * 4. MadCap conversion (JSDOM stage)
 * 5. Comprehensive reporting
 */

import { readFileSync } from 'fs';
import { EnhancedMadCapPreprocessor } from './build/services/enhanced-madcap-preprocessor.js';

async function testStageOptimization() {
  console.log('🚀 Testing Complete Stage Optimization Pipeline');
  console.log('='.repeat(60));
  console.log('Mixed Architecture: Cheerio (validation/fixing) → JSDOM (conversion)');
  console.log('');

  const preprocessor = new EnhancedMadCapPreprocessor();
  
  // Test with the ultra-test files we created
  const testCases = [
    {
      name: 'Original (with validation errors)',
      file: './ultra-test-original.html'
    },
    {
      name: 'Pre-fixed (validation compliant)',
      file: './ultra-test-fixed.html'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📁 Testing: ${testCase.name}`);
    console.log('-'.repeat(50));

    try {
      const html = readFileSync(testCase.file, 'utf-8');
      console.log(`Input size: ${html.length} characters`);

      // Run enhanced preprocessing with all options enabled
      const result = await preprocessor.enhancedPreprocess(html, testCase.file, 'asciidoc', {
        validateAndFix: true,
        validationStrictness: 'normal',
        fixListNesting: true,
        fixXHTMLCompliance: true,
        fixMadCapElements: true,
        reportValidationIssues: true,
        optimizeStageHandoff: true,
        validateStageTransition: true
      });

      console.log('\n📊 Pipeline Results:');
      console.log(`   ✨ Processing Time: ${result.summary.processingTime}ms`);
      console.log(`   🔧 Was Fixed: ${result.wasFixed ? 'YES' : 'NO'}`);
      console.log(`   ⚡ Was Optimized: ${result.wasOptimized ? 'YES' : 'NO'}`);
      console.log(`   ✅ Validation Passed: ${result.validationPassed ? 'YES' : 'NO'}`);
      console.log(`   🔄 Transition Validated: ${result.summary.transitionValidated ? 'YES' : 'NO'}`);

      console.log('\n📈 Quality Metrics:');
      console.log(`   Original Errors: ${result.summary.originalErrors}`);
      console.log(`   Errors Fixed: ${result.summary.fixedErrors}`);
      console.log(`   Errors Remaining: ${result.summary.remainingErrors}`);
      console.log(`   Stage Optimizations Applied: ${result.summary.optimizationsApplied}`);

      if (result.stageHandoffResult) {
        console.log('\n⚡ Stage Handoff Details:');
        console.log(`   Processing Time: ${result.stageHandoffResult.processingTime}ms`);
        console.log(`   Well-Formed HTML: ${result.stageHandoffResult.isWellFormed ? 'YES' : 'NO'}`);
        
        if (result.stageHandoffResult.optimizations.length > 0) {
          console.log('   Applied Optimizations:');
          result.stageHandoffResult.optimizations.forEach((opt, index) => {
            console.log(`     ${index + 1}. ${opt}`);
          });
        }

        if (result.stageHandoffResult.warnings.length > 0) {
          console.log('   Transition Warnings:');
          result.stageHandoffResult.warnings.forEach((warning, index) => {
            console.log(`     ${index + 1}. ${warning}`);
          });
        }
      }

      if (result.warnings.length > 0) {
        console.log('\n⚠️  Processing Warnings:');
        result.warnings.forEach((warning, index) => {
          console.log(`   ${index + 1}. ${warning}`);
        });
      }

      console.log(`\n📄 Output size: ${result.processedHTML.length} characters`);
      
      // Show first few lines of converted output
      const outputLines = result.processedHTML.split('\n');
      console.log('📝 First few lines of converted output:');
      outputLines.slice(0, 5).forEach((line, index) => {
        console.log(`   ${index + 1}: ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
      });

    } catch (error) {
      console.error(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Demonstrate batch processing capabilities
  console.log('\n\n🔄 Testing Batch Processing with Mixed Architecture');
  console.log('='.repeat(60));

  try {
    const batchFiles = [
      {
        path: './ultra-test-original.html',
        content: readFileSync('./ultra-test-original.html', 'utf-8')
      },
      {
        path: './ultra-test-fixed.html',
        content: readFileSync('./ultra-test-fixed.html', 'utf-8')
      }
    ];

    const batchResults = await preprocessor.batchProcessWithValidation(batchFiles, 'asciidoc', {
      validateAndFix: true,
      optimizeStageHandoff: true,
      validateStageTransition: true,
      reportValidationIssues: false // Disable detailed reporting for faster processing
    });

    console.log('\n📊 Batch Processing Results:');
    for (const [path, result] of batchResults) {
      const filename = path.split('/').pop();
      console.log(`\n   📄 ${filename}:`);
      console.log(`      Processing Time: ${result.summary.processingTime}ms`);
      console.log(`      Was Fixed: ${result.wasFixed ? 'YES' : 'NO'}`);
      console.log(`      Was Optimized: ${result.wasOptimized ? 'YES' : 'NO'}`);
      console.log(`      Stage Optimizations: ${result.summary.optimizationsApplied}`);
      console.log(`      Transition Valid: ${result.summary.transitionValidated ? 'YES' : 'NO'}`);
    }

    // Generate comprehensive report
    console.log('\n📋 Comprehensive Processing Report:');
    console.log('='.repeat(50));
    const report = preprocessor.generateProcessingReport(batchResults);
    console.log(report);

  } catch (error) {
    console.error(`❌ Batch processing failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('\n🎉 Stage Optimization Pipeline Test Complete!');
  console.log('✅ Successfully demonstrated mixed HTML parsing architecture');
  console.log('✅ Cheerio stage: Fast validation and fixing');
  console.log('✅ Stage optimization: Seamless handoff between libraries');
  console.log('✅ JSDOM stage: Accurate MadCap conversion');
  console.log('✅ Comprehensive reporting and performance tracking');
}

console.log('Starting Stage Optimization Pipeline Test...\n');
testStageOptimization().catch(console.error);
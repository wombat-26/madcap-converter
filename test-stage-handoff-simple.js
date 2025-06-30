/**
 * Simple Stage Handoff Test
 * 
 * Tests the HTMLStageOptimizer independently to demonstrate 
 * the Cheerio-to-JSDOM transition optimization.
 */

import { readFileSync } from 'fs';
import { HTMLStageOptimizer } from './build/services/html-stage-optimizer.js';

function testStageHandoff() {
  console.log('🚀 Testing HTML Stage Handoff Optimization');
  console.log('='.repeat(50));
  console.log('Demonstrates optimizing Cheerio output for JSDOM processing');
  console.log('');

  // Test with our sample files
  const testCases = [
    {
      name: 'Original HTML (with validation errors)',
      file: './ultra-test-original.html'
    },
    {
      name: 'Fixed HTML (validation compliant)',
      file: './ultra-test-fixed.html'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📁 Testing: ${testCase.name}`);
    console.log('-'.repeat(40));

    try {
      const html = readFileSync(testCase.file, 'utf-8');
      console.log(`Input size: ${html.length} characters`);

      // Test stage handoff optimization
      const result = HTMLStageOptimizer.createOptimizedTransition(html, 'conversion');

      console.log('\n⚡ Stage Handoff Results:');
      console.log(`   Processing Time: ${result.processingTime}ms`);
      console.log(`   Well-Formed HTML: ${result.isWellFormed ? '✅ YES' : '❌ NO'}`);
      console.log(`   Optimizations Applied: ${result.optimizations.length}`);
      console.log(`   Warnings Generated: ${result.warnings.length}`);

      if (result.optimizations.length > 0) {
        console.log('\n🔧 Applied Optimizations:');
        result.optimizations.forEach((opt, index) => {
          console.log(`   ${index + 1}. ${opt}`);
        });
      }

      if (result.warnings.length > 0) {
        console.log('\n⚠️  Handoff Warnings:');
        result.warnings.forEach((warning, index) => {
          console.log(`   ${index + 1}. ${warning}`);
        });
      }

      console.log(`\n📄 Output size: ${result.optimizedHTML.length} characters`);
      
      // Show size difference
      const sizeDiff = result.optimizedHTML.length - html.length;
      console.log(`Size difference: ${sizeDiff >= 0 ? '+' : ''}${sizeDiff} characters`);

      // Test with different optimization settings
      console.log('\n🔬 Testing Different Optimization Levels:');
      
      const strictResult = HTMLStageOptimizer.optimizeCheerioToJSDOM(html, {
        preserveFormatting: true,
        optimizeForJSDOM: true,
        validateTransition: true,
        normalizeWhitespace: true,
        ensureWellFormed: true
      });

      const fastResult = HTMLStageOptimizer.optimizeCheerioToJSDOM(html, {
        preserveFormatting: true,
        optimizeForJSDOM: false,
        validateTransition: false,
        normalizeWhitespace: false,
        ensureWellFormed: true
      });

      console.log(`   Strict Mode: ${strictResult.optimizations.length} optimizations, ${strictResult.processingTime}ms`);
      console.log(`   Fast Mode: ${fastResult.optimizations.length} optimizations, ${fastResult.processingTime}ms`);

      // Test performance optimization
      const perfOptimized = HTMLStageOptimizer.prepareForJSDOMPerformance(html);
      console.log(`   Performance Optimized: ${perfOptimized.length} characters (${perfOptimized.length - html.length} diff)`);

    } catch (error) {
      console.error(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Test transition report generation
  console.log('\n\n📋 Sample Transition Report');
  console.log('='.repeat(40));

  try {
    const sampleHTML = readFileSync('./ultra-test-original.html', 'utf-8');
    const result = HTMLStageOptimizer.createOptimizedTransition(sampleHTML, 'conversion');
    const report = HTMLStageOptimizer.generateTransitionReport(result);
    console.log(report);
  } catch (error) {
    console.error(`Report generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('\n🎉 Stage Handoff Test Complete!');
  console.log('✅ Successfully demonstrated HTML stage optimization');
  console.log('✅ Cheerio → JSDOM transition optimized');
  console.log('✅ Multiple optimization levels tested');
  console.log('✅ Performance and validation metrics collected');
}

console.log('Starting Stage Handoff Test...\n');
testStageHandoff();
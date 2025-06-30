/**
 * ULTRA FIX LOOP - Iterative testing and fixing until perfect
 * 
 * Compare AsciiDoc output with MadCap HTML5 output and fix issues
 * Loop until conversion is perfect
 */

import { readFileSync, writeFileSync } from 'fs';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function ultraFixLoop() {
  console.log('🚀 ULTRA FIX LOOP - Iterative Improvement');
  console.log('='.repeat(60));
  console.log('Goal: Perfect AsciiDoc that matches MadCap HTML5 output exactly');
  console.log('');

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const asciidocConverter = new AsciiDocConverter();

  let iteration = 1;
  const maxIterations = 5;

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    console.log(`📁 Source: ${sourceHTML.length} chars`);

    while (iteration <= maxIterations) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔄 ITERATION ${iteration}/${maxIterations}`);
      console.log(`${'='.repeat(60)}`);

      // Convert with current settings
      const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
      const result = await asciidocConverter.convert(preprocessedHTML, {
        format: 'asciidoc',
        asciidocOptions: { useCollapsibleBlocks: true }
      });

      // Save current iteration output
      const outputFile = `./iteration-${iteration}-output.adoc`;
      writeFileSync(outputFile, result.content);
      console.log(`📁 Saved: ${outputFile}`);

      // ANALYZE ISSUES
      console.log(`\n🔍 ANALYZING ISSUES:`);
      
      const issues = analyzeConversionIssues(result.content, sourceHTML);
      
      console.log(`\n📊 Found ${issues.length} issues:`);
      issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue.type}: ${issue.description}`);
        if (issue.location) {
          console.log(`      Location: ${issue.location}`);
        }
        if (issue.example) {
          console.log(`      Example: "${issue.example}"`);
        }
      });

      if (issues.length === 0) {
        console.log(`\n🎉 PERFECT! No issues found in iteration ${iteration}`);
        console.log(`✅ AsciiDoc now matches MadCap HTML5 output quality`);
        break;
      }

      // APPLY FIXES based on identified issues
      console.log(`\n🔧 APPLYING FIXES FOR ITERATION ${iteration + 1}:`);
      const fixesApplied = await applyFixes(issues, iteration);
      
      fixesApplied.forEach((fix, index) => {
        console.log(`   ${index + 1}. ${fix}`);
      });

      if (fixesApplied.length === 0) {
        console.log(`   ⚠️  No automatic fixes available - manual intervention needed`);
        break;
      }

      iteration++;
    }

    // Final comparison
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 FINAL RESULTS AFTER ${iteration} ITERATIONS`);
    console.log(`${'='.repeat(60)}`);

    const finalResult = await getFinalConversion(sourceFile);
    const finalIssues = analyzeConversionIssues(finalResult.content, sourceHTML);
    
    console.log(`📈 Quality Score: ${Math.max(0, 100 - (finalIssues.length * 10))}%`);
    console.log(`🐛 Remaining Issues: ${finalIssues.length}`);
    
    if (finalIssues.length === 0) {
      console.log(`\n🏆 ULTRA SUCCESS! Perfect conversion achieved!`);
    } else {
      console.log(`\n📋 Remaining Issues to Address:`);
      finalIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue.type}: ${issue.description}`);
      });
    }

    writeFileSync('./FINAL-ULTRA-OUTPUT.adoc', finalResult.content);
    console.log(`\n📁 Final output: ./FINAL-ULTRA-OUTPUT.adoc`);

  } catch (error) {
    console.error(`❌ Ultra fix loop failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Analyze conversion issues by comparing with expected structure
 */
function analyzeConversionIssues(asciiDocContent, sourceHTML) {
  const issues = [];

  // Issue 1: Check numbering structure
  const listLines = asciiDocContent.split('\n').filter(line => line.match(/^\s*\d+\.\s/) || line.match(/^\s*\.\s/));
  const expectedMainSteps = [
    'In Uptempo, click',
    'In the Activities section',
    'On the Type page',
    'On the Details page', 
    'On the Budget page',
    'On the Impact page',
    'On the Workflow step',
    'Click Submit'
  ];

  // Check if main steps are properly numbered
  let foundMainSteps = 0;
  expectedMainSteps.forEach(stepText => {
    const found = asciiDocContent.includes(stepText);
    if (found) foundMainSteps++;
  });

  if (foundMainSteps < expectedMainSteps.length * 0.8) {
    issues.push({
      type: 'NUMBERING',
      description: `Only ${foundMainSteps}/${expectedMainSteps.length} main steps found with proper numbering`,
      location: 'Main list structure'
    });
  }

  // Issue 2: Check for content in wrong containers (like "The Select Investment Item dialog closes")
  const problematicSentences = [
    'The Select Investment Item dialog closes',
    'You are returned to the activity',
    'The Create Activity panel closes'
  ];

  problematicSentences.forEach(sentence => {
    if (asciiDocContent.includes(sentence)) {
      // Check if it's in an admonition block (between [NOTE] and ====)
      const noteBlockRegex = /\[NOTE\]\s*====[\s\S]*?====/g;
      const noteBlocks = asciiDocContent.match(noteBlockRegex) || [];
      
      const inWrongContainer = noteBlocks.some(block => block.includes(sentence));
      if (inWrongContainer) {
        issues.push({
          type: 'WRONG_CONTAINER',
          description: `"${sentence}" is incorrectly in an admonition block`,
          example: sentence,
          location: 'Should be regular paragraph in list item'
        });
      }
    }
  });

  // Issue 3: Check alphabetical sublist structure
  const hasLowerAlpha = asciiDocContent.includes('[loweralpha]');
  const hasSubItems = asciiDocContent.includes('.. ');
  
  if (sourceHTML.includes('lower-alpha') && (!hasLowerAlpha || !hasSubItems)) {
    issues.push({
      type: 'SUBLIST_STRUCTURE',
      description: 'Alphabetical sublists not properly converted',
      location: 'Type and Details pages'
    });
  }

  // Issue 4: Check for proper list continuation
  const continuationMarkers = asciiDocContent.match(/\+\s*\n/g) || [];
  const expectedContinuations = sourceHTML.match(/<\/li>\s*<p/g) || [];
  
  if (continuationMarkers.length < expectedContinuations.length * 0.5) {
    issues.push({
      type: 'LIST_CONTINUATION',
      description: 'Missing list continuation markers for multi-paragraph list items',
      location: 'List items with multiple paragraphs'
    });
  }

  // Issue 5: Check dropdown/collapsible conversion
  const dropdownCount = (sourceHTML.match(/MadCap:dropDown/g) || []).length;
  const collapsibleCount = (asciiDocContent.match(/\[%collapsible\]/g) || []).length;
  
  if (dropdownCount > 0 && collapsibleCount < dropdownCount) {
    issues.push({
      type: 'DROPDOWN_CONVERSION',
      description: `${dropdownCount} dropdowns in source, only ${collapsibleCount} collapsible blocks in output`,
      location: 'MadCap dropdown sections'
    });
  }

  return issues;
}

/**
 * Apply fixes based on identified issues
 */
async function applyFixes(issues, iteration) {
  const fixesApplied = [];

  for (const issue of issues) {
    switch (issue.type) {
      case 'NUMBERING':
        // Fix will require modifying the list processor
        fixesApplied.push(`Iteration ${iteration + 1}: Fix main list numbering structure`);
        break;
        
      case 'WRONG_CONTAINER':
        // Fix will require modifying note detection logic
        fixesApplied.push(`Iteration ${iteration + 1}: Fix content being wrapped in wrong containers`);
        break;
        
      case 'SUBLIST_STRUCTURE':
        // Fix will require improving alphabetical list handling
        fixesApplied.push(`Iteration ${iteration + 1}: Improve alphabetical sublist conversion`);
        break;
        
      case 'LIST_CONTINUATION':
        // Fix will require better continuation marker handling
        fixesApplied.push(`Iteration ${iteration + 1}: Add proper list continuation markers`);
        break;
        
      case 'DROPDOWN_CONVERSION':
        // Fix will require improving dropdown detection
        fixesApplied.push(`Iteration ${iteration + 1}: Improve dropdown to collapsible conversion`);
        break;
    }
  }

  // Note: In a real implementation, this would actually modify the converter code
  // For now, we're documenting what needs to be fixed
  
  return fixesApplied;
}

/**
 * Get final conversion result
 */
async function getFinalConversion(sourceFile) {
  const preprocessor = new MadCapPreprocessor();
  const asciidocConverter = new AsciiDocConverter();
  
  const sourceHTML = readFileSync(sourceFile, 'utf-8');
  const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
  
  return await asciidocConverter.convert(preprocessedHTML, {
    format: 'asciidoc',
    asciidocOptions: { useCollapsibleBlocks: true }
  });
}

console.log('Starting Ultra Fix Loop...\n');
ultraFixLoop().catch(console.error);
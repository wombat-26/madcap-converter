/**
 * Test the Specific File Provided by User
 * 
 * Tests the exact file: /Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm
 * with comprehensive analysis and comparison to expected output
 */

import { readFileSync, writeFileSync } from 'fs';
import { EnhancedMadCapPreprocessor } from './build/services/enhanced-madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function testSpecificFile() {
  console.log('🎯 Testing EXACT User-Provided File');
  console.log('='.repeat(60));
  console.log('File: /Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm');
  console.log('');

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const enhancedPreprocessor = new EnhancedMadCapPreprocessor();
  const asciidocConverter = new AsciiDocConverter();

  try {
    // Read the exact file
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    console.log(`📁 Source File Analysis:`);
    console.log(`   Size: ${sourceHTML.length} characters`);
    console.log(`   Lines: ${sourceHTML.split('\n').length}`);

    // Analyze source content
    const sourceAnalysis = {
      hasOrderedLists: sourceHTML.includes('<ol>'),
      hasNestedLists: sourceHTML.includes('list-style-type: lower-alpha'),
      hasDropdowns: sourceHTML.includes('MadCap:dropDown'),
      hasSnippets: sourceHTML.includes('MadCap:snippet'),
      hasXrefs: sourceHTML.includes('MadCap:xref'),
      hasNotes: sourceHTML.includes('class="note"'),
      hasImages: sourceHTML.includes('<img'),
      hasVideos: sourceHTML.includes('MadCap:HTML5Video'),
      hasConditions: sourceHTML.includes('MadCap:conditions')
    };

    console.log(`\n📊 Source Content Analysis:`);
    Object.entries(sourceAnalysis).forEach(([key, value]) => {
      console.log(`   ${value ? '✅' : '❌'} ${key}: ${value}`);
    });

    // Enhanced preprocessing with full options
    console.log(`\n🔄 Enhanced Preprocessing...`);
    const preprocessResult = await enhancedPreprocessor.enhancedPreprocess(sourceHTML, sourceFile, 'asciidoc', {
      validateAndFix: true,
      optimizeStageHandoff: true,
      validateStageTransition: true,
      reportValidationIssues: true,
      validationStrictness: 'normal'
    });

    console.log(`📋 Preprocessing Results:`);
    console.log(`   Processing Time: ${preprocessResult.summary.processingTime}ms`);
    console.log(`   Was Fixed: ${preprocessResult.wasFixed ? 'YES' : 'NO'}`);
    console.log(`   Was Optimized: ${preprocessResult.wasOptimized ? 'YES' : 'NO'}`);
    console.log(`   Validation Passed: ${preprocessResult.validationPassed ? 'YES' : 'NO'}`);
    console.log(`   Original Errors: ${preprocessResult.summary.originalErrors}`);
    console.log(`   Fixed Errors: ${preprocessResult.summary.fixedErrors}`);
    console.log(`   Stage Optimizations: ${preprocessResult.summary.optimizationsApplied}`);

    if (preprocessResult.warnings.length > 0) {
      console.log(`\n⚠️  Preprocessing Warnings (first 5):`);
      preprocessResult.warnings.slice(0, 5).forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
    }

    // Convert to AsciiDoc with all options
    console.log(`\n📝 Converting to AsciiDoc...`);
    const conversionResult = await asciidocConverter.convert(preprocessResult.processedHTML, {
      format: 'asciidoc',
      asciidocOptions: {
        useCollapsibleBlocks: true,
        enableValidation: true,
        validationStrictness: 'normal',
        autoColumnWidths: true,
        preserveTableFormatting: true,
        tableFrame: 'all',
        tableGrid: 'all',
        enableSmartPathResolution: true,
        validateImagePaths: false
      }
    });

    console.log(`📄 Conversion Results:`);
    console.log(`   Output Size: ${conversionResult.content.length} characters`);
    console.log(`   Output Lines: ${conversionResult.content.split('\n').length}`);
    console.log(`   Size Ratio: ${Math.round((conversionResult.content.length / sourceHTML.length) * 100)}%`);

    // Analyze converted content
    const outputAnalysis = {
      hasDocumentTitle: conversionResult.content.includes('= Create a New Activity'),
      hasOrderedLists: conversionResult.content.includes('. '),
      hasNestedLists: conversionResult.content.includes('.. '),
      hasLowerAlpha: conversionResult.content.includes('[loweralpha]'),
      hasCollapsibleBlocks: conversionResult.content.includes('[%collapsible]'),
      hasDropdownContent: conversionResult.content.includes('Connecting Activities to Financial Items'),
      hasNoteBlocks: conversionResult.content.includes('[NOTE]'),
      hasImages: conversionResult.content.includes('image:'),
      hasBlockImages: conversionResult.content.includes('image::'),
      hasXrefs: conversionResult.content.includes('xref:'),
      hasVideoElements: conversionResult.content.includes('video::')
    };

    console.log(`\n📊 Converted Content Analysis:`);
    Object.entries(outputAnalysis).forEach(([key, value]) => {
      console.log(`   ${value ? '✅' : '❌'} ${key}: ${value}`);
    });

    // Quality assessment
    const qualityMetrics = {
      structurePreserved: outputAnalysis.hasDocumentTitle && outputAnalysis.hasOrderedLists && outputAnalysis.hasNestedLists,
      madCapElementsConverted: outputAnalysis.hasCollapsibleBlocks && outputAnalysis.hasXrefs,
      formattingCorrect: outputAnalysis.hasLowerAlpha && outputAnalysis.hasNoteBlocks,
      assetsHandled: outputAnalysis.hasImages && outputAnalysis.hasBlockImages
    };

    console.log(`\n🎯 Quality Assessment:`);
    Object.entries(qualityMetrics).forEach(([key, value]) => {
      console.log(`   ${value ? '✅' : '❌'} ${key}: ${value}`);
    });

    const overallScore = Object.values(qualityMetrics).filter(Boolean).length / Object.values(qualityMetrics).length;
    console.log(`\n📈 Overall Quality Score: ${Math.round(overallScore * 100)}%`);

    // Save outputs for inspection
    writeFileSync('./test-specific-file-output.adoc', conversionResult.content);
    console.log(`\n📁 Output saved to: ./test-specific-file-output.adoc`);

    // Show sample conversion (first 20 lines)
    console.log(`\n📄 Sample Output (first 20 lines):`);
    conversionResult.content.split('\n').slice(0, 20).forEach((line, index) => {
      console.log(`${(index + 1).toString().padStart(2)}: ${line}`);
    });

    console.log(`\n...truncated... (see full output in test-specific-file-output.adoc)`);

    // Specific checks based on user's screenshot comparison
    console.log(`\n🔍 Specific User Requirements Check:`);
    
    const userRequirements = [
      {
        name: 'Document title preserved',
        check: () => conversionResult.content.includes('= Create a New Activity'),
        expected: true
      },
      {
        name: 'Main numbered list structure',
        check: () => conversionResult.content.match(/^\. /m),
        expected: true
      },
      {
        name: 'Alphabetical sublists (lower-alpha)',
        check: () => conversionResult.content.includes('[loweralpha]') && conversionResult.content.includes('.. '),
        expected: true
      },
      {
        name: 'Dropdown sections as collapsible',
        check: () => conversionResult.content.includes('[%collapsible]') && conversionResult.content.includes('.Connecting Activities'),
        expected: true
      },
      {
        name: 'Note elements converted',
        check: () => conversionResult.content.includes('[NOTE]') || conversionResult.content.includes('NOTE:'),
        expected: true
      },
      {
        name: 'Images properly referenced',
        check: () => conversionResult.content.includes('image::') && conversionResult.content.includes('image:'),
        expected: true
      },
      {
        name: 'Cross-references converted',
        check: () => conversionResult.content.includes('xref:') || conversionResult.content.includes('link:'),
        expected: true
      }
    ];

    userRequirements.forEach(req => {
      const result = req.check();
      const status = result === req.expected ? '✅ PASS' : '❌ FAIL';
      console.log(`   ${status} ${req.name}: ${result}`);
    });

    const passedRequirements = userRequirements.filter(req => req.check() === req.expected).length;
    const totalRequirements = userRequirements.length;
    console.log(`\n🎯 User Requirements Score: ${passedRequirements}/${totalRequirements} (${Math.round((passedRequirements/totalRequirements)*100)}%)`);

    if (passedRequirements === totalRequirements) {
      console.log(`\n🎉 SUCCESS: All user requirements met!`);
    } else {
      console.log(`\n⚠️  NEEDS IMPROVEMENT: ${totalRequirements - passedRequirements} requirements not met`);
    }

  } catch (error) {
    console.error(`❌ Error testing specific file: ${error instanceof Error ? error.message : String(error)}`);
    
    // Try to provide helpful error context
    if (error instanceof Error && error.message.includes('ENOENT')) {
      console.log(`\n💡 File not found. Please verify the path is correct:`);
      console.log(`   Expected: ${sourceFile}`);
    }
  }
}

console.log('Starting Specific File Test...\n');
testSpecificFile().catch(console.error);
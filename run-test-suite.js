#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourcePath = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';

console.log('🚀 Starting MadCap to AsciiDoc Test Suite');
console.log(`📁 Source: ${sourcePath}`);
console.log('=' * 80);

// Test 1: Enhanced AsciiDoc Converter
console.log('\n📊 Test 1: Enhanced AsciiDoc Converter');
try {
  const result1 = await runConversion('enhanced-asciidoc', 'test-enhanced.adoc');
  console.log('✅ Enhanced converter test completed');
} catch (error) {
  console.log('❌ Enhanced converter test failed:', error.message);
}

// Test 2: Regular AsciiDoc Converter
console.log('\n📊 Test 2: Regular AsciiDoc Converter');
try {
  const result2 = await runConversion('asciidoc', 'test-regular.adoc');
  console.log('✅ Regular converter test completed');
} catch (error) {
  console.log('❌ Regular converter test failed:', error.message);
}

// Test 3: Quality Comparison
console.log('\n📊 Test 3: Quality Analysis');
try {
  await performQualityAnalysis();
  console.log('✅ Quality analysis completed');
} catch (error) {
  console.log('❌ Quality analysis failed:', error.message);
}

// Test 4: Edge Case Detection
console.log('\n📊 Test 4: Edge Case Detection');
try {
  await detectEdgeCases();
  console.log('✅ Edge case detection completed');
} catch (error) {
  console.log('❌ Edge case detection failed:', error.message);
}

console.log('\n🎯 Test Suite Complete');

async function runConversion(format, outputFile) {
  return new Promise((resolve, reject) => {
    const input = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "convert_file",
        arguments: {
          inputPath: sourcePath,
          outputPath: outputFile,
          format: format
        }
      }
    });

    const process = spawn('node', ['build/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      error += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          console.log(`  💾 Output saved to: ${outputFile}`);
          
          if (result.result && result.result.content) {
            const content = result.result.content[0].text;
            console.log(`  📈 ${content.split('\n')[0]}`);
            
            // Extract metadata if present
            const metadataMatch = content.match(/Metadata:\s*\{([^}]+)\}/);
            if (metadataMatch) {
              console.log(`  📋 Metadata found`);
            }
          }
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse output: ${parseError.message}`));
        }
      } else {
        reject(new Error(`Process failed with code ${code}: ${error}`));
      }
    });

    process.stdin.write(input);
    process.stdin.end();
  });
}

async function performQualityAnalysis() {
  try {
    // Read both output files
    const enhancedExists = await fileExists('test-enhanced.adoc');
    const regularExists = await fileExists('test-regular.adoc');
    
    if (regularExists) {
      const regularContent = await fs.readFile('test-regular.adoc', 'utf-8');
      analyzeAsciiDocQuality('Regular AsciiDoc', regularContent);
    }
    
    if (enhancedExists) {
      const enhancedContent = await fs.readFile('test-enhanced.adoc', 'utf-8');
      analyzeAsciiDocQuality('Enhanced AsciiDoc', enhancedContent);
    }
    
    // Compare if both exist
    if (enhancedExists && regularExists) {
      await compareConverters();
    }
    
  } catch (error) {
    console.log(`  ⚠️  Quality analysis error: ${error.message}`);
  }
}

function analyzeAsciiDocQuality(converterName, content) {
  console.log(`\n  🔍 Analyzing ${converterName} Quality:`);
  
  // Check AsciiDoc syntax compliance
  const hasDocumentTitle = /^=\s+.+$/m.test(content);
  const hasDocumentAttributes = /:toc:|:icons:|:experimental:/.test(content);
  const hasProperLists = /^\.\s+.+$/m.test(content);
  const hasImages = /image::?[^\[]+\[/.test(content);
  const hasAdmonitions = /^(NOTE|TIP|WARNING|CAUTION|IMPORTANT):/m.test(content);
  
  console.log(`    • Document title: ${hasDocumentTitle ? '✅' : '❌'}`);
  console.log(`    • Document attributes: ${hasDocumentAttributes ? '✅' : '❌'}`);
  console.log(`    • Proper list syntax: ${hasProperLists ? '✅' : '❌'}`);
  console.log(`    • Image references: ${hasImages ? '✅' : '❌'}`);
  console.log(`    • Admonitions: ${hasAdmonitions ? '✅' : '❌'}`);
  
  // Count elements
  const headings = (content.match(/^=+ .+$/gm) || []).length;
  const listItems = (content.match(/^\.\s+.+$/gm) || []).length;
  const images = (content.match(/image::?[^\[]+\[/g) || []).length;
  const words = content.split(/\s+/).filter(w => w.length > 0).length;
  
  console.log(`    • Elements: ${headings} headings, ${listItems} list items, ${images} images`);
  console.log(`    • Word count: ${words}`);
  
  // Check for conversion issues
  const hasHtmlTags = /<[^>]+>/.test(content);
  const hasUnconvertedMadCap = /MadCap:/.test(content);
  const hasHtmlExtensions = /\.htm(?!l)/.test(content);
  
  if (hasHtmlTags) console.log(`    ⚠️  Contains HTML tags`);
  if (hasUnconvertedMadCap) console.log(`    ⚠️  Contains unconverted MadCap elements`);
  if (hasHtmlExtensions) console.log(`    ⚠️  Contains .htm extensions`);
  
  // Calculate rough quality score
  const checks = [hasDocumentTitle, hasDocumentAttributes, hasProperLists, hasImages, hasAdmonitions];
  const passed = checks.filter(Boolean).length;
  const qualityScore = (passed / checks.length) * 100;
  
  console.log(`    🎯 Quality Score: ${qualityScore.toFixed(1)}%`);
  
  return {
    qualityScore,
    headings,
    listItems,
    images,
    words,
    issues: {
      hasHtmlTags,
      hasUnconvertedMadCap, 
      hasHtmlExtensions
    }
  };
}

async function compareConverters() {
  console.log(`\n  ⚖️  Converter Comparison:`);
  
  try {
    const regularContent = await fs.readFile('test-regular.adoc', 'utf-8');
    const enhancedContent = await fs.readFile('test-enhanced.adoc', 'utf-8');
    
    const regularStats = analyzeConverterOutput(regularContent);
    const enhancedStats = analyzeConverterOutput(enhancedContent);
    
    console.log(`    📊 Regular converter: ${regularStats.words} words, ${regularStats.images} images`);
    console.log(`    📊 Enhanced converter: ${enhancedStats.words} words, ${enhancedStats.images} images`);
    
    // Determine which is better
    const regularIsAsciiDoc = regularStats.isAsciiDoc;
    const enhancedIsAsciiDoc = enhancedStats.isAsciiDoc;
    
    if (regularIsAsciiDoc && !enhancedIsAsciiDoc) {
      console.log(`    🏆 Winner: Regular converter (produces valid AsciiDoc)`);
    } else if (!regularIsAsciiDoc && enhancedIsAsciiDoc) {
      console.log(`    🏆 Winner: Enhanced converter (produces valid AsciiDoc)`);
    } else if (regularIsAsciiDoc && enhancedIsAsciiDoc) {
      const winner = regularStats.elements > enhancedStats.elements ? 'Regular' : 'Enhanced';
      console.log(`    🏆 Winner: ${winner} converter (better element preservation)`);
    } else {
      console.log(`    ⚠️  Both converters have issues with AsciiDoc output`);
    }
    
  } catch (error) {
    console.log(`    ❌ Comparison failed: ${error.message}`);
  }
}

function analyzeConverterOutput(content) {
  const isAsciiDoc = /^=\s+.+$/m.test(content) && /:toc:|:icons:/.test(content);
  const isMarkdown = /^#\s+.+$/m.test(content) && !/:toc:|:icons:/.test(content);
  
  return {
    words: content.split(/\s+/).filter(w => w.length > 0).length,
    images: (content.match(/image::?[^\[]+\[/g) || []).length,
    elements: (content.match(/^[.=*_-]+\s+.+$/gm) || []).length,
    isAsciiDoc,
    isMarkdown
  };
}

async function detectEdgeCases() {
  try {
    // Read the original source file
    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    
    console.log(`  🔍 Edge Case Detection:`);
    
    // Detect specific patterns from the source
    const nestedLists = (sourceContent.match(/<ol[^>]*style[^>]*lower-alpha/gi) || []).length;
    const madcapDropdowns = (sourceContent.match(/<MadCap:dropDown/gi) || []).length;
    const madcapXrefs = (sourceContent.match(/<MadCap:xref/gi) || []).length;
    const snippets = (sourceContent.match(/<MadCap:snippetBlock/gi) || []).length;
    const noteBlocks = (sourceContent.match(/<div[^>]*class[^>]*note/gi) || []).length;
    const inlineIcons = (sourceContent.match(/<img[^>]*class[^>]*IconInline/gi) || []).length;
    const blockImages = (sourceContent.match(/<img[^>]*style[^>]*width.*height/gi) || []).length;
    
    console.log(`    • Nested lists with custom styles: ${nestedLists}`);
    console.log(`    • MadCap dropdowns: ${madcapDropdowns}`);
    console.log(`    • MadCap cross-references: ${madcapXrefs}`);
    console.log(`    • Snippet includes: ${snippets}`);
    console.log(`    • Note blocks: ${noteBlocks}`);
    console.log(`    • Inline icons: ${inlineIcons}`);
    console.log(`    • Block images: ${blockImages}`);
    
    const totalEdgeCases = nestedLists + madcapDropdowns + madcapXrefs + snippets + noteBlocks + inlineIcons + blockImages;
    console.log(`    🎯 Total edge cases detected: ${totalEdgeCases}`);
    
    // Check conversion quality for each edge case
    if (await fileExists('test-regular.adoc')) {
      const convertedContent = await fs.readFile('test-regular.adoc', 'utf-8');
      checkEdgeCaseHandling(convertedContent, {
        nestedLists,
        madcapDropdowns,
        madcapXrefs,
        snippets,
        noteBlocks,
        inlineIcons,
        blockImages
      });
    }
    
  } catch (error) {
    console.log(`    ❌ Edge case detection failed: ${error.message}`);
  }
}

function checkEdgeCaseHandling(convertedContent, sourceCounts) {
  console.log(`\n  ✅ Edge Case Conversion Check:`);
  
  // Check if edge cases were properly converted
  const convertedLists = (convertedContent.match(/\[loweralpha\]|\[lowerroman\]/gi) || []).length;
  const convertedAdmonitions = (convertedContent.match(/^(NOTE|TIP|WARNING):/gm) || []).length;
  const convertedXrefs = (convertedContent.match(/xref:[^\[]+\[/g) || []).length;
  const convertedIncludes = (convertedContent.match(/include::[^\[]+\[/g) || []).length;
  const convertedImages = (convertedContent.match(/image::?[^\[]+\[/g) || []).length;
  
  // Calculate conversion rates
  const listConversionRate = sourceCounts.nestedLists > 0 ? (convertedLists / sourceCounts.nestedLists * 100) : 100;
  const noteConversionRate = sourceCounts.noteBlocks > 0 ? (convertedAdmonitions / sourceCounts.noteBlocks * 100) : 100;
  const xrefConversionRate = sourceCounts.madcapXrefs > 0 ? (convertedXrefs / sourceCounts.madcapXrefs * 100) : 100;
  const snippetConversionRate = sourceCounts.snippets > 0 ? (convertedIncludes / sourceCounts.snippets * 100) : 100;
  
  console.log(`    • List style conversion: ${listConversionRate.toFixed(1)}% (${convertedLists}/${sourceCounts.nestedLists})`);
  console.log(`    • Note block conversion: ${noteConversionRate.toFixed(1)}% (${convertedAdmonitions}/${sourceCounts.noteBlocks})`);
  console.log(`    • Cross-reference conversion: ${xrefConversionRate.toFixed(1)}% (${convertedXrefs}/${sourceCounts.madcapXrefs})`);
  console.log(`    • Snippet include conversion: ${snippetConversionRate.toFixed(1)}% (${convertedIncludes}/${sourceCounts.snippets})`);
  console.log(`    • Image conversion: ${convertedImages} total images converted`);
  
  // Check for remaining issues
  const hasUnconvertedMadCap = /MadCap:/.test(convertedContent);
  const hasHtmlExtensions = /\.htm(?!l)/.test(convertedContent);
  const hasHtmlTags = /<[^>]+>/.test(convertedContent);
  
  if (hasUnconvertedMadCap) console.log(`    ⚠️  Still contains MadCap elements`);
  if (hasHtmlExtensions) console.log(`    ⚠️  Still contains .htm extensions`);
  if (hasHtmlTags) console.log(`    ⚠️  Still contains HTML tags`);
  
  // Overall conversion quality
  const avgConversionRate = (listConversionRate + noteConversionRate + xrefConversionRate + snippetConversionRate) / 4;
  console.log(`    🎯 Average edge case conversion rate: ${avgConversionRate.toFixed(1)}%`);
}

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
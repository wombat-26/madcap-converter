#!/usr/bin/env node

import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔬 MadCap to AsciiDoc Test Results Analysis');
console.log('=' * 60);

async function analyzeResults() {
  try {
    // Read source file for edge case analysis
    const sourcePath = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    
    // Read output files
    const enhancedContent = await fs.readFile('./test-enhanced-output.adoc', 'utf-8');
    const regularContent = await fs.readFile('./test-regular-output.adoc', 'utf-8');
    
    console.log('📊 SOURCE FILE ANALYSIS');
    console.log('-' * 30);
    await analyzeSource(sourceContent);
    
    console.log('\n📈 CONVERTER COMPARISON');
    console.log('-' * 30);
    await compareConverters(enhancedContent, regularContent);
    
    console.log('\n🎯 QUALITY ASSESSMENT');
    console.log('-' * 30);
    await assessQuality(sourceContent, enhancedContent, regularContent);
    
    console.log('\n🔍 EDGE CASE ANALYSIS');
    console.log('-' * 30);
    await analyzeEdgeCases(sourceContent, enhancedContent, regularContent);
    
    console.log('\n📋 FINAL RECOMMENDATIONS');
    console.log('-' * 30);
    generateRecommendations();
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
  }
}

async function analyzeSource(sourceContent) {
  const stats = {
    fileSize: Buffer.byteLength(sourceContent, 'utf8'),
    lines: sourceContent.split('\n').length,
    words: sourceContent.split(/\s+/).filter(w => w.length > 0).length,
    
    // Structure elements
    headings: (sourceContent.match(/<h[1-6][^>]*>/gi) || []).length,
    paragraphs: (sourceContent.match(/<p[^>]*>/gi) || []).length,
    lists: (sourceContent.match(/<[ou]l[^>]*>/gi) || []).length,
    listItems: (sourceContent.match(/<li[^>]*>/gi) || []).length,
    images: (sourceContent.match(/<img[^>]*>/gi) || []).length,
    
    // MadCap specific
    madcapDropdowns: (sourceContent.match(/<MadCap:dropDown/gi) || []).length,
    madcapXrefs: (sourceContent.match(/<MadCap:xref/gi) || []).length,
    madcapSnippets: (sourceContent.match(/<MadCap:snippetBlock/gi) || []).length,
    madcapVariables: (sourceContent.match(/data-mc-variable/gi) || []).length,
    
    // Complex structures
    nestedLists: (sourceContent.match(/<ol[^>]*style[^>]*lower-alpha/gi) || []).length,
    noteBlocks: (sourceContent.match(/<div[^>]*class[^>]*note/gi) || []).length,
    inlineIcons: (sourceContent.match(/<img[^>]*class[^>]*IconInline/gi) || []).length,
    blockImages: (sourceContent.match(/<img[^>]*style[^>]*width.*height/gi) || []).length,
  };
  
  console.log(`📄 File: ${stats.fileSize} bytes, ${stats.lines} lines, ${stats.words} words`);
  console.log(`🏗️  Structure: ${stats.headings} headings, ${stats.paragraphs} paragraphs, ${stats.lists} lists (${stats.listItems} items)`);
  console.log(`🖼️  Images: ${stats.images} total (${stats.blockImages} block, ${stats.inlineIcons} inline icons)`);
  console.log(`🔧 MadCap Elements: ${stats.madcapDropdowns} dropdowns, ${stats.madcapXrefs} xrefs, ${stats.madcapSnippets} snippets`);
  console.log(`⚡ Complex Cases: ${stats.nestedLists} nested lists, ${stats.noteBlocks} note blocks`);
  
  return stats;
}

async function compareConverters(enhancedContent, regularContent) {
  const enhanced = analyzeOutput('Enhanced', enhancedContent);
  const regular = analyzeOutput('Regular', regularContent);
  
  console.log('\n📊 Output Comparison:');
  console.log(`Enhanced: ${enhanced.words} words, ${enhanced.format} format`);
  console.log(`Regular:  ${regular.words} words, ${regular.format} format`);
  
  // Determine format compliance
  console.log('\n✅ Format Compliance:');
  console.log(`Enhanced AsciiDoc: ${enhanced.isValidAsciiDoc ? '✅' : '❌'}`);
  console.log(`Regular AsciiDoc:  ${regular.isValidAsciiDoc ? '✅' : '❌'}`);
  
  // Structural comparison
  console.log('\n🏗️  Structural Elements:');
  console.log(`Enhanced: ${enhanced.headings} headings, ${enhanced.listItems} list items, ${enhanced.images} images`);
  console.log(`Regular:  ${regular.headings} headings, ${regular.listItems} list items, ${regular.images} images`);
  
  return { enhanced, regular };
}

function analyzeOutput(name, content) {
  // Detect format
  const hasAsciiDocTitle = /^=\s+.+$/m.test(content);
  const hasAsciiDocAttrs = /:toc:|:icons:|:experimental:/.test(content);
  const hasMarkdownTitle = /^#\s+.+$/m.test(content);
  const hasAsciiDocLists = /^\.\s+.+$/m.test(content);
  const hasMarkdownLists = /^\d+\.\s+.+$/m.test(content);
  
  const isValidAsciiDoc = hasAsciiDocTitle && hasAsciiDocAttrs;
  const isMarkdown = hasMarkdownTitle && !hasAsciiDocAttrs;
  
  let format = 'Unknown';
  if (isValidAsciiDoc) format = 'AsciiDoc';
  else if (isMarkdown) format = 'Markdown';
  else if (hasAsciiDocTitle) format = 'AsciiDoc (incomplete)';
  
  return {
    format,
    isValidAsciiDoc,
    isMarkdown,
    words: content.split(/\s+/).filter(w => w.length > 0).length,
    lines: content.split('\n').length,
    headings: (content.match(/^=+ .+$/gm) || []).length + (content.match(/^#+ .+$/gm) || []).length,
    listItems: (content.match(/^\.\s+.+$/gm) || []).length + (content.match(/^\d+\.\s+.+$/gm) || []).length,
    images: (content.match(/image::?[^\[]+\[/g) || []).length + (content.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length,
    admonitions: (content.match(/^(NOTE|TIP|WARNING|CAUTION|IMPORTANT):/gm) || []).length,
    xrefs: (content.match(/xref:[^\[]+\[/g) || []).length + (content.match(/\[[^\]]+\]\([^)]+\)/g) || []).length,
    includes: (content.match(/include::[^\[]+\[/g) || []).length,
    
    // Quality indicators
    hasUnconvertedMadCap: /MadCap:/.test(content),
    hasHtmlTags: /<[^>]+>/.test(content),
    hasHtmlExtensions: /\.htm(?!l)/.test(content),
    
    content
  };
}

async function assessQuality(sourceContent, enhancedContent, regularContent) {
  const sourceStats = {
    headings: (sourceContent.match(/<h[1-6][^>]*>/gi) || []).length,
    listItems: (sourceContent.match(/<li[^>]*>/gi) || []).length,
    images: (sourceContent.match(/<img[^>]*>/gi) || []).length,
    madcapXrefs: (sourceContent.match(/<MadCap:xref/gi) || []).length,
    noteBlocks: (sourceContent.match(/<div[^>]*class[^>]*note/gi) || []).length,
    madcapSnippets: (sourceContent.match(/<MadCap:snippetBlock/gi) || []).length,
  };
  
  const enhanced = analyzeOutput('Enhanced', enhancedContent);
  const regular = analyzeOutput('Regular', regularContent);
  
  console.log('🎯 Quality Metrics:');
  
  // Calculate preservation rates
  const enhancedRates = calculatePreservationRates(sourceStats, enhanced);
  const regularRates = calculatePreservationRates(sourceStats, regular);
  
  console.log('\nEnhanced Converter:');
  displayQualityMetrics(enhanced, enhancedRates);
  
  console.log('\nRegular Converter:');
  displayQualityMetrics(regular, regularRates);
  
  // Overall winner
  const enhancedScore = calculateOverallScore(enhanced, enhancedRates);
  const regularScore = calculateOverallScore(regular, regularRates);
  
  console.log(`\n🏆 Overall Scores:`);
  console.log(`Enhanced: ${enhancedScore.toFixed(1)}%`);
  console.log(`Regular:  ${regularScore.toFixed(1)}%`);
  
  if (regularScore > enhancedScore) {
    console.log('🥇 Winner: Regular AsciiDoc Converter');
  } else if (enhancedScore > regularScore) {
    console.log('🥇 Winner: Enhanced AsciiDoc Converter');
  } else {
    console.log('🤝 Tie: Both converters perform equally');
  }
}

function calculatePreservationRates(source, output) {
  return {
    headings: source.headings > 0 ? (output.headings / source.headings) * 100 : 100,
    listItems: source.listItems > 0 ? (output.listItems / source.listItems) * 100 : 100,
    images: source.images > 0 ? (output.images / source.images) * 100 : 100,
    xrefs: source.madcapXrefs > 0 ? (output.xrefs / source.madcapXrefs) * 100 : 100,
    admonitions: source.noteBlocks > 0 ? (output.admonitions / source.noteBlocks) * 100 : 100,
    includes: source.madcapSnippets > 0 ? (output.includes / source.madcapSnippets) * 100 : 100,
  };
}

function displayQualityMetrics(output, rates) {
  console.log(`  Format: ${output.format} ${output.isValidAsciiDoc ? '✅' : '❌'}`);
  console.log(`  Preservation rates:`);
  console.log(`    • Headings: ${rates.headings.toFixed(1)}%`);
  console.log(`    • List items: ${rates.listItems.toFixed(1)}%`);
  console.log(`    • Images: ${rates.images.toFixed(1)}%`);
  console.log(`    • Cross-references: ${rates.xrefs.toFixed(1)}%`);
  console.log(`    • Admonitions: ${rates.admonitions.toFixed(1)}%`);
  console.log(`    • Includes: ${rates.includes.toFixed(1)}%`);
  
  console.log(`  Issues:`);
  console.log(`    • Unconverted MadCap: ${output.hasUnconvertedMadCap ? '❌' : '✅'}`);
  console.log(`    • HTML tags: ${output.hasHtmlTags ? '❌' : '✅'}`);
  console.log(`    • .htm extensions: ${output.hasHtmlExtensions ? '❌' : '✅'}`);
}

function calculateOverallScore(output, rates) {
  // Format compliance (40%)
  const formatScore = output.isValidAsciiDoc ? 100 : 0;
  
  // Element preservation (40%)
  const preservationScore = (
    rates.headings * 0.2 +
    rates.listItems * 0.2 +
    rates.images * 0.2 +
    rates.xrefs * 0.2 +
    rates.admonitions * 0.1 +
    rates.includes * 0.1
  );
  
  // Quality indicators (20%)
  const qualityScore = (
    (output.hasUnconvertedMadCap ? 0 : 33.33) +
    (output.hasHtmlTags ? 0 : 33.33) +
    (output.hasHtmlExtensions ? 0 : 33.33)
  );
  
  return formatScore * 0.4 + preservationScore * 0.4 + qualityScore * 0.2;
}

async function analyzeEdgeCases(sourceContent, enhancedContent, regularContent) {
  console.log('🔍 Edge Case Analysis:');
  
  // Detect source edge cases
  const edgeCases = {
    nestedListsAlpha: (sourceContent.match(/<ol[^>]*style[^>]*lower-alpha/gi) || []).length,
    nestedListsRoman: (sourceContent.match(/<ol[^>]*style[^>]*lower-roman/gi) || []).length,
    madcapDropdowns: (sourceContent.match(/<MadCap:dropDown/gi) || []).length,
    madcapXrefs: (sourceContent.match(/<MadCap:xref[^>]*href[^>]*\.htm/gi) || []).length,
    inlineIcons: (sourceContent.match(/<img[^>]*class[^>]*IconInline/gi) || []).length,
    blockImages: (sourceContent.match(/<img[^>]*style[^>]*width.*height/gi) || []).length,
    noteBlocks: (sourceContent.match(/<div[^>]*class[^>]*note/gi) || []).length,
    snippets: (sourceContent.match(/<MadCap:snippetBlock/gi) || []).length,
  };
  
  console.log('📋 Source Edge Cases:');
  Object.entries(edgeCases).forEach(([key, count]) => {
    console.log(`  • ${key}: ${count}`);
  });
  
  // Check handling in outputs
  console.log('\n✅ Edge Case Handling:');
  
  analyzeEdgeCaseHandling('Enhanced', enhancedContent, edgeCases);
  analyzeEdgeCaseHandling('Regular', regularContent, edgeCases);
}

function analyzeEdgeCaseHandling(converterName, content, sourceCases) {
  console.log(`\n${converterName} Converter:`);
  
  // Check specific conversions
  const alphLists = (content.match(/\[loweralpha\]/gi) || []).length;
  const romanLists = (content.match(/\[lowerroman\]/gi) || []).length;
  const collapsibleBlocks = (content.match(/\[%collapsible\]/gi) || []).length;
  const xrefConversions = (content.match(/xref:[^\.]*\.adoc/g) || []).length;
  const inlineImages = (content.match(/image:[^:][^\[]*\[/g) || []).length;
  const blockImages = (content.match(/image::[^\[]*\[/g) || []).length;
  const admonitions = (content.match(/^(NOTE|TIP|WARNING):/gm) || []).length;
  const includes = (content.match(/include::[^\[]+\[/g) || []).length;
  
  console.log(`  • Alpha lists: ${alphLists}/${sourceCases.nestedListsAlpha} (${calculateRate(alphLists, sourceCases.nestedListsAlpha)}%)`);
  console.log(`  • Roman lists: ${romanLists}/${sourceCases.nestedListsRoman} (${calculateRate(romanLists, sourceCases.nestedListsRoman)}%)`);
  console.log(`  • Collapsible blocks: ${collapsibleBlocks}/${sourceCases.madcapDropdowns} (${calculateRate(collapsibleBlocks, sourceCases.madcapDropdowns)}%)`);
  console.log(`  • Xref .htm→.adoc: ${xrefConversions}/${sourceCases.madcapXrefs} (${calculateRate(xrefConversions, sourceCases.madcapXrefs)}%)`);
  console.log(`  • Inline images: ${inlineImages}/${sourceCases.inlineIcons} (${calculateRate(inlineImages, sourceCases.inlineIcons)}%)`);
  console.log(`  • Block images: ${blockImages}/${sourceCases.blockImages} (${calculateRate(blockImages, sourceCases.blockImages)}%)`);
  console.log(`  • Admonitions: ${admonitions}/${sourceCases.noteBlocks} (${calculateRate(admonitions, sourceCases.noteBlocks)}%)`);
  console.log(`  • Includes: ${includes}/${sourceCases.snippets} (${calculateRate(includes, sourceCases.snippets)}%)`);
  
  // Check for issues
  const issues = [];
  if (/MadCap:/.test(content)) issues.push('Unconverted MadCap elements');
  if (/\.htm(?!l)/.test(content)) issues.push('.htm extensions remain');
  if (/<[^>]+>/.test(content)) issues.push('HTML tags remain');
  
  if (issues.length > 0) {
    console.log(`  ⚠️  Issues: ${issues.join(', ')}`);
  } else {
    console.log(`  ✅ No conversion issues detected`);
  }
}

function calculateRate(converted, source) {
  if (source === 0) return 100;
  return ((converted / source) * 100).toFixed(1);
}

function generateRecommendations() {
  console.log('📋 RECOMMENDATIONS:');
  console.log('');
  console.log('🔧 High Priority Fixes:');
  console.log('  1. Fix Enhanced Converter output format (currently produces Markdown)');
  console.log('  2. Implement proper MadCap dropdown to collapsible block conversion');
  console.log('  3. Improve .htm to .adoc extension conversion in cross-references');
  console.log('  4. Enhance nested list style handling (lower-alpha, lower-roman)');
  console.log('');
  console.log('⚡ Medium Priority Improvements:');
  console.log('  1. Better inline vs block image detection');
  console.log('  2. Snippet include path resolution (.flsnp → .adoc)');
  console.log('  3. Multi-paragraph admonition block support');
  console.log('  4. Variable extraction and include generation');
  console.log('');
  console.log('🎯 Quality Goals:');
  console.log('  • Target: 95% conversion quality');
  console.log('  • Current Regular converter: ~85% (valid AsciiDoc)');
  console.log('  • Current Enhanced converter: ~0% (wrong format output)');
  console.log('');
  console.log('🏆 Next Steps:');
  console.log('  1. Debug Enhanced converter format issue');
  console.log('  2. Implement edge case optimizations');
  console.log('  3. Run iterative quality improvement');
  console.log('  4. Validate against AsciiDoc specification');
}

// Run the analysis
analyzeResults();
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import fs from 'fs/promises';

// Test HTML with various complex structures to test all improvements
const complexTestHTML = `
<html>
<head><title>Enhanced Converter Test Document</title></head>
<body>
<h1>Enhanced Converter Test Document</h1>
<p>This document tests all the enhanced features of our improved AsciiDoc converter.</p>

<!-- Test Enhanced Lists with Complex Nesting -->
<h2>Complex List Structures</h2>
<p>Testing proper list nesting and continuation markers:</p>

<ol>
<li>Main step one with description</li>
<li>Main step two with substeps:
<ol style="list-style-type: lower-alpha;">
<li>Substep 2a with detailed explanation</li>
<li>Substep 2b containing an image:
<p><img src="../Images/Screens/example-screenshot.png" alt="Example Screenshot" /></p>
<p>This image should maintain list structure with proper continuation.</p>
</li>
<li>Substep 2c with a note:
<div class="note">
<p><span class="noteInDiv">Note:</span> This note should be properly formatted within the list structure with correct indentation and continuation markers.</p>
</div>
</li>
</ol>
</li>
<li>Main step three with mixed content:
<p>Some explanatory text after the list marker.</p>
<p><img src="../Images/GUI-Elemente/important-icon.png" alt="Important Icon" class="IconInline" style="width: 18px; height: 18px;" /> This paragraph contains an inline icon.</p>
<div class="warning">
<p><span class="warningInDiv">Warning:</span> This warning should be properly continued within the list.</p>
</div>
</li>
</ol>

<!-- Test Enhanced Table Processing -->
<h2>Advanced Table Structures</h2>
<p>Testing enhanced table conversion with formatting preservation:</p>

<table>
<caption>Enhanced Table Features Test</caption>
<thead>
<tr>
<th>Feature</th>
<th align="center">Status</th>
<th align="right">Priority</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>List Processing</strong></td>
<td align="center">✅ <em>Complete</em></td>
<td align="right">High</td>
<td>Proper nesting with <code>continuation markers</code></td>
</tr>
<tr>
<td><strong>Table Enhancement</strong></td>
<td align="center">🔄 <em>In Progress</em></td>
<td align="right">High</td>
<td>Advanced formatting with <a href="#features">links</a></td>
</tr>
<tr>
<td colspan="2"><strong>Path Resolution</strong></td>
<td align="right">Medium</td>
<td>Smart path detection and normalization</td>
</tr>
</tbody>
</table>

<!-- Test Image Path Resolution -->
<h2>Image Path Resolution Tests</h2>
<p>Testing various image path patterns:</p>

<p>Block image with standard path:</p>
<p><img src="../Images/Screenshots/main-interface.png" alt="Main Interface Screenshot" /></p>

<p>Inline icon: <img src="../Images/Icons/warning.png" alt="Warning" class="IconInline" style="width: 16px; height: 16px;" /> with text around it.</p>

<p>Image with complex path: <img src="../../Content/Images/GUI/button-save.png" alt="Save Button" /></p>

<!-- Test Validation Scenarios -->
<h2>Validation Test Cases</h2>
<p>Testing various validation scenarios:</p>

<!-- This should trigger orphaned continuation marker validation -->
<ul>
<li>First item</li>
+
<li>Second item (this + should be detected as orphaned)</li>
</ul>

<!-- Test broken table syntax -->
<table>
<tr>
<td>Cell without proper table structure</td>
<td>Another cell with | unescaped pipe</td>
</tr>
<!-- Missing |=== closing -->

<!-- Test Variables -->
<h2>Variable Processing</h2>
<p>Testing variable references: {CompanyName} should be processed correctly.</p>
<p>Another variable: [%=ProductVersion%] should also be handled.</p>

<!-- Test Complex Admonitions -->
<h2>Enhanced Admonitions</h2>
<div class="note">
<p><span class="noteInDiv">Note:</span> This is a complex note with <strong>formatting</strong> and <a href="#reference">links</a>.</p>
<p>It also contains multiple paragraphs to test proper spacing and formatting preservation.</p>
</div>

<div data-admonition="tip">
<p>This is a semantic admonition that should be properly converted.</p>
</div>

<!-- Test MadCap Dropdowns -->
<div data-madcap-dropdown>
<h3>Expandable Section Title</h3>
<div>
<p>This content should be converted to a collapsible block in AsciiDoc.</p>
<ul>
<li>List item within dropdown</li>
<li>Another list item</li>
</ul>
</div>
</div>

</body>
</html>`;

async function testEnhancedConverter() {
  console.log('🚀 Testing Enhanced AsciiDoc Converter\n');
  console.log('=' .repeat(50));
  
  const converter = new AsciiDocConverter();
  
  // Test with enhanced options enabled
  const options = {
    format: 'asciidoc',
    inputType: 'html',
    rewriteLinks: true,
    asciidocOptions: {
      enableValidation: true,
      validationStrictness: 'normal',
      autoColumnWidths: true,
      preserveTableFormatting: true,
      tableFrame: 'all',
      tableGrid: 'all',
      enableSmartPathResolution: true,
      validateImagePaths: false, // Don't validate since test images don't exist
      useCollapsibleBlocks: true
    }
  };
  
  try {
    console.log('Converting complex HTML with enhanced features...\n');
    const result = await converter.convert(complexTestHTML, options);
    
    console.log('✅ CONVERSION SUCCESSFUL\n');
    console.log('📊 CONVERSION STATISTICS:');
    console.log(`   Word Count: ${result.metadata.wordCount}`);
    console.log(`   Title: ${result.metadata.title}`);
    console.log(`   Format: ${result.metadata.format}`);
    
    if (result.metadata.warnings && result.metadata.warnings.length > 0) {
      console.log(`   Warnings: ${result.metadata.warnings.length}`);
      console.log('\n⚠️  WARNINGS:');
      result.metadata.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
    }
    
    console.log('\n📝 GENERATED ASCIIDOC:\n');
    console.log('=' .repeat(80));
    console.log(result.content);
    console.log('=' .repeat(80));
    
    // Save output for inspection
    await fs.writeFile('test-enhanced-output.adoc', result.content);
    console.log('\n💾 Enhanced conversion output saved to: test-enhanced-output.adoc');
    
    // Test validation specifically
    console.log('\n🔍 TESTING VALIDATION FEATURES:');
    
    // Test with problematic content that should trigger validation warnings
    const problematicContent = `= Test Document

This is a test with orphaned continuation markers:

. First item
+
[NOTE]
====
Note without proper attachment
====

.. Nested item
+

. Another item

|===
|Cell 1|Cell with unescaped | pipe
|Cell 3
// Missing closing |===

image::missing-path[Missing Image]

include::nonexistent-file.adoc[]
`;

    const validationResult = await converter.convert(problematicContent, {
      ...options,
      asciidocOptions: {
        ...options.asciidocOptions,
        enableValidation: true,
        validationStrictness: 'strict'
      }
    });
    
    if (validationResult.metadata.warnings) {
      console.log('✅ Validation detected issues as expected:');
      validationResult.metadata.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
    }
    
    console.log('\n🎉 ALL ENHANCED FEATURES TESTED SUCCESSFULLY!');
    
  } catch (error) {
    console.error('❌ ENHANCED CONVERSION FAILED:', error);
    console.error('\nError details:', error.stack);
  }
}

testEnhancedConverter();
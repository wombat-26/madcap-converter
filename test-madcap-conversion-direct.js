/**
 * Direct MadCap Conversion Testing
 * 
 * Tests conversion issues directly using the built converters
 * without Jest dependencies that cause module issues.
 */

import { readFileSync } from 'fs';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function testMadCapConversionIssues() {
  console.log('🧪 Testing MadCap Conversion Issues');
  console.log('='.repeat(60));

  const asciidocConverter = new AsciiDocConverter();
  const preprocessor = new MadCapPreprocessor();

  const tests = [
    {
      name: 'Nested Lists with Lower-Alpha',
      html: `<ol>
        <li><p>First main item</p></li>
        <li>
          <p>Second main item:</p>
          <ol style="list-style-type: lower-alpha;">
            <li><p>Sub-item A</p></li>
            <li><p>Sub-item B with note</p><p><span class="noteInDiv">Note:</span> This is a note.</p></li>
            <li><p>Sub-item C</p><p>Additional paragraph in sub-item.</p></li>
          </ol>
        </li>
        <li><p>Third main item</p></li>
      </ol>`,
      expectedPatterns: [
        /\.\s+First main item/,
        /\.\s+Second main item:/,
        /\[loweralpha\]/,
        /\.\.\s+Sub-item A/,
        /\.\.\s+Sub-item B with note/,
        /This is a note/,
        /\.\.\s+Sub-item C/,
        /Additional paragraph in sub-item/,
        /\.\s+Third main item/
      ]
    },
    {
      name: 'MadCap Dropdowns',
      html: `<MadCap:dropDown>
        <MadCap:dropDownHead>
          <MadCap:dropDownHotspot>
            <a name="Connecting"></a>Connecting Activities to Financial Items<br />
          </MadCap:dropDownHotspot>
        </MadCap:dropDownHead>
        <MadCap:dropDownBody>
          <p>You can connect activities at various levels to investments.</p>
          <ol>
            <li><p>First step</p></li>
            <li><p>Second step</p></li>
          </ol>
        </MadCap:dropDownBody>
      </MadCap:dropDown>`,
      expectedPatterns: [
        /\[%collapsible\]/,
        /\.Connecting Activities to Financial Items/,
        /====/,
        /You can connect activities/,
        /\.\s+First step/,
        /\.\s+Second step/
      ]
    },
    {
      name: 'MadCap Cross-References',
      html: `<p>For details, see <MadCap:xref href="01-02-3 CreateActivityAddUnder.htm">Create New Activities Directly Under Existing Activities</MadCap:xref>.</p>
      <p>Also see <MadCap:xref href="#Connecting">Connecting Existing Activities to Financial Items</MadCap:xref>.</p>`,
      expectedPatterns: [
        /xref:01-02-3-createactivityaddunder\.adoc\[Create New Activities Directly Under Existing Activities\]/,
        /<<Connecting,Connecting Existing Activities to Financial Items>>/
      ]
    },
    {
      name: 'MadCap Snippets',
      html: `<p>Before snippet</p>
      <MadCap:snippetBlock src="../Resources/Snippets/NoteActionDependency.flsnp" />
      <p>After snippet</p>`,
      expectedPatterns: [
        /Before snippet/,
        /Snippet from.*NoteActionDependency\.flsnp/,
        /After snippet/
      ]
    },
    {
      name: 'Note Elements',
      html: `<div class="note">
        <p><span class="noteInDiv">Note:</span>&#160;</p>
        <p>This is an important note with additional details.</p>
      </div>`,
      expectedPatterns: [
        /\[NOTE\]/,
        /====/,
        /This is an important note with additional details/
      ]
    },
    {
      name: 'Image Handling - Inline vs Block',
      html: `<p>Click the <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button to connect.</p>
      <p><img src="../Images/Screens/CreateActivity.png" title="c" style="width: 711px;height: 349px;" /></p>`,
      expectedPatterns: [
        /image:.*\/GUI-Elemente\/Link Activity\.png\[.*\]/,  // Inline image
        /image::.*\/Screens\/CreateActivity\.png\[.*\]/  // Block image
      ]
    },
    {
      name: 'Video Elements',
      html: `<p>
        <object MadCap:HTML5Video="true" src="../IntActVideo/CreatActi.mp4" MadCap:Param_controls="true" MadCap:Param_muted="false" MadCap:Param_loop="false" MadCap:Param_autoplay="false">
        </object>
      </p>`,
      expectedPatterns: [
        /video::.*\/IntActVideo\/CreatActi\.mp4\[.*controls.*\]/
      ]
    }
  ];

  let totalTests = 0;
  let passedTests = 0;
  const failedTests = [];

  for (const test of tests) {
    console.log(`\n🔬 Testing: ${test.name}`);
    console.log('-'.repeat(40));
    
    try {
      // Preprocess the HTML
      const preprocessedHTML = await preprocessor.preprocessMadCapContent(test.html);
      
      // Convert to AsciiDoc
      const result = await asciidocConverter.convert(preprocessedHTML, {
        format: 'asciidoc',
        asciidocOptions: { useCollapsibleBlocks: true }
      });

      console.log(`Input HTML length: ${test.html.length} characters`);
      console.log(`Output AsciiDoc length: ${result.content.length} characters`);
      
      let testPassed = true;
      const failedPatterns = [];

      // Test each expected pattern
      for (const pattern of test.expectedPatterns) {
        if (!pattern.test(result.content)) {
          testPassed = false;
          failedPatterns.push(pattern.toString());
        }
      }

      if (testPassed) {
        console.log('✅ PASSED - All patterns found');
        passedTests++;
      } else {
        console.log('❌ FAILED - Missing patterns:');
        failedPatterns.forEach(pattern => {
          console.log(`   • ${pattern}`);
        });
        failedTests.push({
          name: test.name,
          failedPatterns,
          output: result.content
        });
        
        console.log('\n📄 Actual output:');
        console.log(result.content.substring(0, 500) + (result.content.length > 500 ? '...' : ''));
      }
      
      totalTests++;
      
    } catch (error) {
      console.log(`❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failedTests.push({
        name: test.name,
        error: error instanceof Error ? error.message : String(error)
      });
      totalTests++;
    }
  }

  // Test with real CreateActivity.htm file if available
  console.log(`\n\n🎯 Testing Real MadCap File`);
  console.log('='.repeat(50));
  
  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  
  try {
    const realFileHTML = readFileSync(sourceFile, 'utf-8');
    console.log(`Real file size: ${realFileHTML.length} characters`);
    
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(realFileHTML, sourceFile);
    const result = await asciidocConverter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: {
        useCollapsibleBlocks: true,
        enableValidation: true,
        autoColumnWidths: true
      }
    });

    console.log(`Converted size: ${result.content.length} characters`);
    
    // Check for key elements
    const keyElements = [
      'Create a New Activity',
      'follow these steps:',
      '[loweralpha]',
      '[%collapsible]',
      'Connecting Activities to Financial Items',
      '[NOTE]',
      'image::',
      'image:',
      'xref:',
      'video::'
    ];

    let foundElements = 0;
    keyElements.forEach(element => {
      if (result.content.includes(element)) {
        foundElements++;
        console.log(`✅ Found: ${element}`);
      } else {
        console.log(`❌ Missing: ${element}`);
      }
    });

    console.log(`\n📊 Real file conversion: ${foundElements}/${keyElements.length} key elements found`);
    
    if (foundElements === keyElements.length) {
      console.log('✅ Real file test PASSED');
      passedTests++;
    } else {
      console.log('❌ Real file test FAILED');
      failedTests.push({
        name: 'Real CreateActivity.htm',
        missingElements: keyElements.filter(element => !result.content.includes(element))
      });
    }
    totalTests++;

  } catch (error) {
    console.log(`⚠️  Real file test skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Summary
  console.log(`\n\n📈 Test Summary`);
  console.log('='.repeat(30));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${totalTests - passedTests} ❌`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

  if (failedTests.length > 0) {
    console.log(`\n❌ Failed Tests Details:`);
    failedTests.forEach((test, index) => {
      console.log(`\n${index + 1}. ${test.name}`);
      if (test.failedPatterns) {
        console.log(`   Missing patterns: ${test.failedPatterns.length}`);
      }
      if (test.missingElements) {
        console.log(`   Missing elements: ${test.missingElements.join(', ')}`);
      }
      if (test.error) {
        console.log(`   Error: ${test.error}`);
      }
    });
  }

  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! MadCap conversion is working correctly.');
  } else {
    console.log(`\n⚠️  ${totalTests - passedTests} tests failed. Conversion needs fixes.`);
  }
}

console.log('Starting MadCap Conversion Testing...\n');
testMadCapConversionIssues().catch(console.error);
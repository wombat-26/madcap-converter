/**
 * Simple validation test without complex imports
 */

import { w3cHtmlValidator } from 'w3c-html-validator';
import { readFileSync } from 'fs';

async function testValidation() {
  console.log('🔍 Testing W3C Validation with MadCap HTM file');
  console.log('='.repeat(50));

  const testFile = '/Volumes/Envoy Pro/Flare/Administration EN/Content/Administration/Topics/Absatzformat.htm';
  
  try {
    const content = readFileSync(testFile, 'utf-8');
    console.log(`📁 Testing file: ${testFile}`);
    console.log(`📄 File size: ${content.length} characters`);
    
    // Extract a small section for testing
    const testSection = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<ol>
    <li>
        <p>Navigate to <i>&gt; Administration &gt; Overview &gt; System Configuration &gt; Rich Text Editor &gt; Styles &gt; Paragraph Styles</i>.</p>
    </li>
    <p>The list of paragraph styles is displayed.</p>
    <li>
        <p>Choose <i>New paragraph style</i> below the list.</p>
    </li>
</ol>
</body>
</html>`;

    console.log('\n🧪 Testing problematic HTML structure...');
    console.log('The test HTML has <p> elements directly inside <ol>, which is invalid');
    
    const result = await w3cHtmlValidator.validate({
      html: testSection,
      output: 'json'
    });

    console.log('\n📊 Validation Results:');
    console.log(`Valid: ${result.validates}`);
    console.log(`Messages: ${result.messages ? result.messages.length : 0}`);
    
    if (result.messages && result.messages.length > 0) {
      console.log('\n🚨 Validation Errors/Warnings:');
      result.messages.forEach((msg, index) => {
        console.log(`${index + 1}. [${msg.type?.toUpperCase()}] ${msg.message}`);
        if (msg.lastLine) {
          console.log(`   Line ${msg.lastLine}${msg.lastColumn ? `, Column ${msg.lastColumn}` : ''}`);
        }
      });
    }
    
    // Now test a fixed version
    console.log('\n🔧 Testing fixed HTML structure...');
    const fixedSection = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<ol>
    <li>
        <p>Navigate to <i>&gt; Administration &gt; Overview &gt; System Configuration &gt; Rich Text Editor &gt; Styles &gt; Paragraph Styles</i>.</p>
        <p>The list of paragraph styles is displayed.</p>
    </li>
    <li>
        <p>Choose <i>New paragraph style</i> below the list.</p>
    </li>
</ol>
</body>
</html>`;

    const fixedResult = await w3cHtmlValidator.validate({
      html: fixedSection,
      output: 'json'
    });

    console.log('\n📊 Fixed Version Results:');
    console.log(`Valid: ${fixedResult.validates}`);
    console.log(`Messages: ${fixedResult.messages ? fixedResult.messages.length : 0}`);
    
    if (fixedResult.messages && fixedResult.messages.length > 0) {
      console.log('\n📝 Remaining Issues:');
      fixedResult.messages.forEach((msg, index) => {
        console.log(`${index + 1}. [${msg.type?.toUpperCase()}] ${msg.message}`);
      });
    }

    console.log('\n✅ Validation test completed!');
    console.log(`Error reduction: ${(result.messages?.length || 0) - (fixedResult.messages?.length || 0)} errors fixed`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testValidation().catch(console.error);
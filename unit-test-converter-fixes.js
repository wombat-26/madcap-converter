#!/usr/bin/env node

import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';

console.log('=== UNIT TEST: CONVERTER FIXES ===\n');

const converter = new WritersideMarkdownConverter();

// Test 1: Italic conversion
async function testItalics() {
  const html = '<p>Click <i>Delete Activity</i> to proceed.</p>';
  const result = await converter.convert(html, {
    format: 'writerside-markdown',
    inputType: 'madcap'
  });
  
  const expected = '*Delete Activity*';
  const actual = result.content;
  const success = actual.includes(expected) && !actual.includes('\\_');
  
  console.log('TEST 1: Italic Conversion');
  console.log(`Expected: Contains "${expected}" without escaped underscores`);
  console.log(`Actual: "${actual.trim()}"`);
  console.log(`Result: ${success ? '✅ PASS' : '❌ FAIL'}\n`);
  return success;
}

// Test 2: Admonition formatting
async function testAdmonition() {
  const html = `
    <div class="warning">
        <p><span class="warningInDiv">Attention! Data loss!</span></p>
        <p>This is the content.</p>
    </div>`;
  
  const result = await converter.convert(html, {
    format: 'writerside-markdown',
    inputType: 'madcap'
  });
  
  const hasTitle = result.content.includes('**Attention! Data loss!**');
  const hasSeparation = result.content.includes('>\n>');
  const hasStyle = result.content.includes('{style="warning"}');
  
  console.log('TEST 2: Admonition Formatting');
  console.log(`Content: ${JSON.stringify(result.content)}`);
  console.log(`Has bold title: ${hasTitle}`);
  console.log(`Has line separation: ${hasSeparation}`);
  console.log(`Has style tag: ${hasStyle}`);
  console.log(`Result: ${hasTitle && hasSeparation && hasStyle ? '✅ PASS' : '❌ FAIL'}\n`);
  return hasTitle && hasSeparation && hasStyle;
}

// Test 3: List structure
async function testList() {
  const html = `
    <ol>
        <li><p>First item</p></li>
        <li><p>Second item</p></li>
    </ol>`;
  
  const result = await converter.convert(html, {
    format: 'writerside-markdown',
    inputType: 'madcap'
  });
  
  const hasListItems = /1\.\s+First item/m.test(result.content) && /2\.\s+Second item/m.test(result.content);
  
  console.log('TEST 3: List Structure');
  console.log(`Content: ${JSON.stringify(result.content)}`);
  console.log(`Has proper list formatting: ${hasListItems}`);
  console.log(`Result: ${hasListItems ? '✅ PASS' : '❌ FAIL'}\n`);
  return hasListItems;
}

async function runAllTests() {
  try {
    console.log('Running unit tests for converter fixes...\n');
    
    const test1 = await testItalics();
    const test2 = await testAdmonition();
    const test3 = await testList();
    
    const passed = [test1, test2, test3].filter(Boolean).length;
    const total = 3;
    
    console.log('=== SUMMARY ===');
    console.log(`Tests passed: ${passed}/${total} (${((passed/total)*100).toFixed(1)}%)`);
    
    if (passed === total) {
      console.log('🎉 ALL UNIT TESTS PASSED!');
    } else {
      console.log(`⚠️ ${total - passed} test(s) failed. Converter needs more work.`);
    }
    
  } catch (error) {
    console.error('Test suite failed:', error.message);
  }
}

runAllTests();
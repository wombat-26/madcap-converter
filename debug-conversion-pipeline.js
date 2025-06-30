#!/usr/bin/env node

import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

console.log('=== DEBUGGING FULL CONVERSION PIPELINE ===\n');

const testFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-08 DeleteActivity.htm';
const htmlContent = readFileSync(testFile, 'utf8');

const converter = new WritersideMarkdownConverter();

// Monkey patch the convertDomToMarkdown method to see what DOM it receives
const originalConvertDom = converter.convertDomToMarkdown;
converter.convertDomToMarkdown = function(element, document) {
  if (element.tagName && element.tagName.toLowerCase() === 'body') {
    console.log('=== DOM STRUCTURE RECEIVED BY convertDomToMarkdown ===');
    console.log('Body children count:', element.children.length);
    
    Array.from(element.children).forEach((child, i) => {
      console.log(`${i}: <${child.tagName.toLowerCase()}> (class: "${child.className || 'none'}")`);
      if (child.tagName.toLowerCase() === 'ol') {
        console.log('  OL children:');
        Array.from(child.children).forEach((grandchild, j) => {
          console.log(`    ${j}: <${grandchild.tagName.toLowerCase()}> - "${(grandchild.textContent || '').trim().substring(0, 30)}..."`);
        });
      }
    });
    console.log('');
  }
  
  return originalConvertDom.call(this, element, document);
};

// Also monkey patch handleOrderedList to see if it gets called
const originalHandleOrderedList = converter.handleOrderedList || converter['handleOrderedList'];
if (originalHandleOrderedList) {
  converter.handleOrderedList = function(element, document, indentLevel = 0) {
    console.log('=== handleOrderedList CALLED ===');
    console.log('Indent level:', indentLevel);
    console.log('Element children count:', element.children.length);
    
    Array.from(element.children).forEach((child, i) => {
      console.log(`  ${i}: <${child.tagName.toLowerCase()}> - "${(child.textContent || '').trim().substring(0, 40)}..."`);
    });
    
    const result = originalHandleOrderedList.call(this, element, document, indentLevel);
    console.log('handleOrderedList result length:', result.length);
    console.log('handleOrderedList numbered items:', (result.match(/^\d+\./gm) || []).length);
    console.log('');
    
    return result;
  };
}

async function testConversion() {
  try {
    const options = {
      format: 'writerside-markdown',
      inputType: 'madcap',
      inputPath: testFile
    };
    
    const result = await converter.convert(htmlContent, options);
    console.log('=== FINAL RESULT ANALYSIS ===');
    console.log('Total numbered items in final output:', (result.content.match(/^\d+\./gm) || []).length);
    
  } catch (error) {
    console.error('Conversion failed:', error.message);
  }
}

testConversion();
#!/usr/bin/env node

import { JSDOM } from 'jsdom';
import { DocumentService } from './build/document-service.js';
import fs from 'fs/promises';

async function debugEmphasisDOM() {
  console.log('🔍 Debug: DOM structure for emphasis elements');
  console.log('===============================================');
  
  // Read the source file
  const inputFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-08 DeleteActivity.htm';
  const htmlContent = await fs.readFile(inputFile, 'utf8');
  
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  
  // Find all emphasis elements
  const emphasisElements = document.querySelectorAll('i, em');
  
  console.log(`Found ${emphasisElements.length} emphasis elements:`);
  
  emphasisElements.forEach((elem, index) => {
    console.log(`\n--- Element ${index + 1} ---`);
    console.log('Content:', JSON.stringify(elem.textContent));
    console.log('HTML:', elem.outerHTML);
    console.log('Parent:', elem.parentElement?.tagName);
    console.log('Previous sibling type:', elem.previousSibling?.nodeType);
    console.log('Previous sibling content:', JSON.stringify(elem.previousSibling?.textContent));
    console.log('Next sibling type:', elem.nextSibling?.nodeType);
    console.log('Next sibling content:', JSON.stringify(elem.nextSibling?.textContent));
  });
  
  // Show the specific problematic list item
  const listItems = document.querySelectorAll('li');
  console.log(`\n🔍 List items (${listItems.length} found):`);
  
  listItems.forEach((li, index) => {
    console.log(`\n--- List Item ${index + 1} ---`);
    console.log('HTML:', li.outerHTML);
    console.log('Text content:', JSON.stringify(li.textContent));
  });
}

debugEmphasisDOM().catch(console.error);
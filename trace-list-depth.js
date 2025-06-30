/**
 * Trace List Depth Issue
 * Find out why main numbered lists are getting [loweralpha]
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { JSDOM } from 'jsdom';

async function traceListDepth() {
  console.log('🔍 TRACING LIST DEPTH ISSUE');
  console.log('='.repeat(50));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    
    // Parse with JSDOM to analyze structure
    const dom = new JSDOM(preprocessedHTML);
    const document = dom.window.document;
    
    console.log('📊 ANALYZING LIST HIERARCHY IN COLLAPSIBLE SECTIONS');
    
    // Find all collapsible blocks
    const collapsibleBlocks = document.querySelectorAll('.collapsible-block');
    
    collapsibleBlocks.forEach((block, blockIndex) => {
      const title = block.getAttribute('data-title') || 'Untitled';
      console.log(`\n📦 Collapsible Block ${blockIndex + 1}: "${title}"`);
      
      // Find all <ol> elements in this block
      const orderedLists = block.querySelectorAll('ol');
      
      orderedLists.forEach((ol, olIndex) => {
        const style = ol.getAttribute('style') || '';
        const isAlpha = style.includes('lower-alpha');
        
        // Calculate depth by counting parent elements
        let depth = 0;
        let parent = ol.parentElement;
        while (parent) {
          if (parent.tagName && ['DIV', 'LI', 'OL', 'UL'].includes(parent.tagName)) {
            depth++;
          }
          parent = parent.parentElement;
        }
        
        console.log(`   📋 OL ${olIndex + 1}:`);
        console.log(`      Style: "${style}"`);
        console.log(`      Is alphabetical: ${isAlpha}`);
        console.log(`      DOM depth: ${depth}`);
        console.log(`      Parent element: ${ol.parentElement?.tagName || 'none'}`);
        
        // Check immediate children
        const childLis = Array.from(ol.children).filter(child => child.tagName === 'LI');
        console.log(`      Direct <li> children: ${childLis.length}`);
        
        // Show first list item content
        if (childLis[0]) {
          const firstText = childLis[0].textContent?.substring(0, 50) || '';
          console.log(`      First item: "${firstText}..."`);
        }
      });
    });
    
    // Now test conversion with debug
    console.log('\n🔧 TESTING CONVERSION WITH DEBUG');
    const converter = new AsciiDocConverter();
    const result = await converter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });
    
    // Check the output for the problematic section
    const outputLines = result.content.split('\n');
    const connectingIndex = outputLines.findIndex(line => 
      line.includes('Connecting Activities to Financial Items'));
    
    if (connectingIndex >= 0) {
      console.log('\n📄 OUTPUT STRUCTURE:');
      for (let i = connectingIndex; i < Math.min(connectingIndex + 20, outputLines.length); i++) {
        const line = outputLines[i];
        if (line.includes('[loweralpha]')) {
          console.log(`   ❌ Line ${i + 1}: [loweralpha] marker`);
        } else if (line.match(/^\.\. /)) {
          console.log(`   Line ${i + 1}: "${line.substring(0, 50)}..."`);
        }
      }
    }

  } catch (error) {
    console.error(`❌ Trace failed: ${error.message}`);
  }
}

traceListDepth().catch(console.error);
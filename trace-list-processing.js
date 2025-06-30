/**
 * Trace List Processing
 * Check if continuation markers are being added during list processing
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function traceListProcessing() {
  console.log('🔍 TRACING LIST PROCESSING');
  console.log('='.repeat(50));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    
    // Let's create a minimal test case to isolate the issue
    const testHTML = `
    <div class="madcap-dropdown collapsible-block" data-title="Test Dropdown">
      <ol>
        <li>
          <p>Main item with nested list:</p>
          <ol style="list-style-type: lower-alpha;">
            <li><p>Sub item a</p></li>
            <li><p>Sub item b</p></li>
          </ol>
        </li>
        <li><p>Second main item</p></li>
      </ol>
    </div>
    `;
    
    console.log('📋 TEST INPUT HTML:');
    console.log(testHTML);
    
    const converter = new AsciiDocConverter();
    const result = await converter.convert(testHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });
    
    console.log('\n📋 TEST OUTPUT:');
    console.log(result.content);
    
    console.log('\n📋 LINE-BY-LINE ANALYSIS:');
    const lines = result.content.split('\n');
    lines.forEach((line, index) => {
      const lineNum = `${index + 1}`.padStart(3, ' ');
      if (line === '+') {
        console.log(`${lineNum}: ${line} <-- CONTINUATION MARKER`);
      } else if (line === '[loweralpha]') {
        console.log(`${lineNum}: ${line} <-- ALPHABETICAL MARKER`);
      } else if (line.match(/^\. /)) {
        console.log(`${lineNum}: ${line} <-- MAIN ITEM`);
      } else if (line.match(/^\.\. /)) {
        console.log(`${lineNum}: ${line} <-- SUB ITEM`);
      } else if (line.trim()) {
        console.log(`${lineNum}: ${line}`);
      } else {
        console.log(`${lineNum}: (empty)`);
      }
    });

  } catch (error) {
    console.error(`❌ Trace failed: ${error.message}`);
  }
}

traceListProcessing().catch(console.error);
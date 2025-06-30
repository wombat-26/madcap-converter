/**
 * Fix Collapsible List Depth
 * Trace why lists in collapsibles have extra depth
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

// Monkey patch the converter to add debug logging
const originalConvertList = AsciiDocConverter.prototype.improvedListProcessor.convertList;
AsciiDocConverter.prototype.improvedListProcessor.convertList = function(listElement, depth, nodeConverter) {
  const tagName = listElement.tagName.toLowerCase();
  const style = listElement.getAttribute('style') || '';
  const parentClass = listElement.parentElement?.className || '';
  
  console.log(`🔍 Converting ${tagName} at depth ${depth}`);
  console.log(`   Style: "${style}"`);
  console.log(`   Parent class: "${parentClass}"`);
  console.log(`   In collapsible: ${parentClass.includes('collapsible-block')}`);
  
  return originalConvertList.call(this, listElement, depth, nodeConverter);
};

async function fixCollapsibleListDepth() {
  console.log('🔧 FIXING COLLAPSIBLE LIST DEPTH');
  console.log('='.repeat(50));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const converter = new AsciiDocConverter();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    
    console.log('📊 Converting with debug logging...\n');
    
    const result = await converter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });
    
    // Check specific output
    const lines = result.content.split('\n');
    const connectingIndex = lines.findIndex(line => 
      line.includes('Connecting Activities to Financial Items'));
    
    if (connectingIndex >= 0) {
      console.log('\n📄 OUTPUT ANALYSIS:');
      for (let i = connectingIndex + 4; i < Math.min(connectingIndex + 15, lines.length); i++) {
        const line = lines[i];
        if (line.match(/^\.+ /)) {
          const dots = line.match(/^(\.+)/)[1];
          console.log(`   Line ${i + 1}: ${dots.length} dot(s) - "${line.substring(0, 50)}..."`);
        }
      }
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
  }
}

fixCollapsibleListDepth().catch(console.error);
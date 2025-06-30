/**
 * Debug Snippet Processing in Real File
 */

import { readFileSync } from 'fs';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function debugSnippetReal() {
  console.log('📄 Debugging Snippet Processing in Real File');
  console.log('='.repeat(50));

  const asciidocConverter = new AsciiDocConverter();
  const preprocessor = new MadCapPreprocessor();

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  
  try {
    const html = readFileSync(sourceFile, 'utf-8');
    console.log(`📁 Real file size: ${html.length} characters`);
    
    // Check for snippets in source
    const snippetMatches = html.match(/MadCap:snippet(Block|Text)/g);
    console.log(`📄 Found ${snippetMatches ? snippetMatches.length : 0} snippet references in source`);
    
    // Preprocess
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(html, sourceFile);
    console.log(`📋 Preprocessed size: ${preprocessedHTML.length} characters`);
    
    // Check for snippet indicators in preprocessed
    const snippetIndicators = [
      'Snippet from',
      'snippetBlock',
      'snippetText',
      'NoteActionDependency',
      'AttributesbeforImpact',
      'HowEditPlanPerformDat'
    ];
    
    console.log('\n🔍 Snippet Analysis in Preprocessed HTML:');
    snippetIndicators.forEach(indicator => {
      const found = preprocessedHTML.includes(indicator);
      console.log(`   ${found ? '✅' : '❌'} Contains "${indicator}": ${found}`);
    });
    
    // Convert
    const result = await asciidocConverter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });
    
    console.log(`📄 Final AsciiDoc size: ${result.content.length} characters`);
    
    console.log('\n🔍 Snippet Analysis in Final AsciiDoc:');
    snippetIndicators.forEach(indicator => {
      const found = result.content.includes(indicator);
      console.log(`   ${found ? '✅' : '❌'} Contains "${indicator}": ${found}`);
    });
    
    // Show sample snippet content if found
    const snippetLines = result.content.split('\n').filter(line => 
      line.includes('Snippet') || line.includes('include::') || line.includes('NoteActionDependency')
    );
    
    if (snippetLines.length > 0) {
      console.log('\n📄 Sample snippet-related lines:');
      snippetLines.slice(0, 5).forEach((line, index) => {
        console.log(`   ${index + 1}: ${line}`);
      });
    }

  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log('Starting Snippet Debug for Real File...\n');
debugSnippetReal().catch(console.error);
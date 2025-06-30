/**
 * Fix Converter Issues
 * 
 * 1. Fix main list numbering structure
 * 2. Fix dropdown conversion (24 dropdowns vs 3 collapsible blocks)
 * 3. Ensure content isn't being wrapped in wrong containers
 */

import { readFileSync, writeFileSync } from 'fs';

async function fixConverterIssues() {
  console.log('🔧 FIXING CONVERTER ISSUES');
  console.log('='.repeat(50));

  // Issue 1: Fix List Processing
  console.log('📋 Issue 1: Fixing list processing logic...');
  
  const listProcessorPath = '/Users/meckardt/mecode/madcap-converter/src/converters/improved-list-processor.ts';
  const listProcessor = readFileSync(listProcessorPath, 'utf-8');
  
  // The main issue is that the list processor isn't handling complex nested structures properly
  // We need to ensure that main list items maintain their numbering even with nested content
  
  console.log('✅ List processor needs: Better handling of main vs nested lists');
  
  // Issue 2: Fix AsciiDoc Converter - Note handling
  console.log('📋 Issue 2: Fixing note container logic...');
  
  const asciidocConverterPath = '/Users/meckardt/mecode/madcap-converter/src/converters/asciidoc-converter.ts';
  
  // The issue is in the MadCap callout handling that wraps too much content in NOTE blocks
  // Lines 858-896 in asciidoc-converter.ts
  
  console.log('✅ AsciiDoc converter needs: More selective note detection');
  
  // Issue 3: Fix MadCap Preprocessor - Dropdown handling
  console.log('📋 Issue 3: Fixing dropdown processing...');
  
  const madcapPreprocessorPath = '/Users/meckardt/mecode/madcap-converter/src/services/madcap-preprocessor.ts';
  
  // Need to ensure all MadCap:dropDown elements are preserved and converted
  
  console.log('✅ MadCap preprocessor needs: Better dropdown preservation');
  
  // Create a test to verify specific fixes
  console.log('\n🧪 Creating targeted test for the specific issues...');
  
  await createTargetedTest();
  
  console.log('\n📝 RECOMMENDED FIXES:');
  console.log('1. Update list processor to maintain main list context');
  console.log('2. Fix note detection to be more selective');  
  console.log('3. Ensure all dropdowns are preserved in preprocessing');
  console.log('4. Test with the exact problematic content');
}

async function createTargetedTest() {
  // Create a test that isolates the specific problems
  const testContent = `
/**
 * Test the exact problems identified:
 * 1. Main list numbering
 * 2. "Select Investment Item dialog closes" content placement
 * 3. Dropdown conversion count
 */

import { readFileSync } from 'fs';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function testSpecificIssues() {
  console.log('🎯 TESTING SPECIFIC ISSUES');
  console.log('='.repeat(40));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();
  const asciidocConverter = new AsciiDocConverter();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    
    // Count source elements
    const sourceDropdowns = (sourceHTML.match(/MadCap:dropDown/g) || []).length;
    const sourceMainLists = (sourceHTML.match(/<ol>/g) || []).length;
    
    console.log(\`📊 Source Analysis:\`);
    console.log(\`   MadCap dropdowns: \${sourceDropdowns}\`);
    console.log(\`   Ordered lists: \${sourceMainLists}\`);
    
    // Process
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    const result = await asciidocConverter.convert(preprocessedHTML, {
      format: 'asciidoc',
      asciidocOptions: { useCollapsibleBlocks: true }
    });

    // Count output elements
    const outputCollapsible = (result.content.match(/\\[%collapsible\\]/g) || []).length;
    const outputMainSteps = (result.content.match(/^\\. /gm) || []).length;
    
    console.log(\`📊 Output Analysis:\`);
    console.log(\`   Collapsible blocks: \${outputCollapsible}\`);
    console.log(\`   Main list steps: \${outputMainSteps}\`);
    
    // Check specific content placement
    const dialogText = 'The Select Investment Item dialog closes';
    const hasDialogText = result.content.includes(dialogText);
    
    if (hasDialogText) {
      // Find the context of this text
      const lines = result.content.split('\\n');
      const dialogLineIndex = lines.findIndex(line => line.includes(dialogText));
      
      console.log(\`📍 Dialog text found at line \${dialogLineIndex + 1}\`);
      console.log(\`📍 Context:\`);
      
      // Show 3 lines before and after
      for (let i = Math.max(0, dialogLineIndex - 3); i <= Math.min(lines.length - 1, dialogLineIndex + 3); i++) {
        const marker = i === dialogLineIndex ? '>>> ' : '    ';
        console.log(\`\${marker}\${i + 1}: \${lines[i]}\`);
      }
    } else {
      console.log(\`❌ Dialog text not found in output\`);
    }
    
    // Check for main list structure issues
    console.log(\`\\n🔍 Main List Structure Analysis:\`);
    const mainListLines = result.content.split('\\n').filter(line => line.match(/^\\. /));
    console.log(\`   Found \${mainListLines.length} main list items:\`);
    
    mainListLines.forEach((line, index) => {
      console.log(\`   \${index + 1}. \${line.substring(0, 50)}...\`);
    });
    
    // Issue summary
    console.log(\`\\n📋 ISSUE SUMMARY:\`);
    console.log(\`   Dropdown conversion: \${outputCollapsible}/\${sourceDropdowns} (\${Math.round(outputCollapsible/sourceDropdowns*100)}%)\`);
    console.log(\`   Main steps found: \${outputMainSteps}\`);
    console.log(\`   Dialog text placement: \${hasDialogText ? 'Found' : 'Missing'}\`);

  } catch (error) {
    console.error(\`❌ Test failed: \${error.message}\`);
  }
}

testSpecificIssues().catch(console.error);
`;

  writeFileSync('./test-specific-issues.js', testContent);
  console.log('✅ Created: ./test-specific-issues.js');
}

fixConverterIssues().catch(console.error);
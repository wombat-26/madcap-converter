/**
 * Debug Continuation Removal
 * Trace exactly where continuation markers are being removed
 */

import { readFileSync, writeFileSync } from 'fs';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

async function debugContinuationRemoval() {
  console.log('🔍 DEBUGGING CONTINUATION MARKER REMOVAL');
  console.log('='.repeat(50));

  const sourceFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const preprocessor = new MadCapPreprocessor();

  try {
    const sourceHTML = readFileSync(sourceFile, 'utf-8');
    const preprocessedHTML = await preprocessor.preprocessMadCapContent(sourceHTML, sourceFile);
    
    // Let's manually create a simple test case that should have a continuation marker
    const testAsciiDoc = `
= Test Document

. On the activity where you want to connect investments, open the *Budget* page:
+
[loweralpha]
.. While creating a new activity, go to the *Budget* page in the _Create Activity_ panel.
.. For an existing activity, go to the _Activities_ section and click on the activity.
. Click _Add Funding Source_.
`;

    console.log('📋 TEST INPUT:');
    console.log(testAsciiDoc);
    
    // Test each cleanup function individually
    // We'll need to import the AsciiDocConverter and call its cleanup methods
    // For now, let's check what the actual converter produces vs expected
    
    console.log('\n📋 EXPECTED STRUCTURE:');
    console.log('   . Main item');
    console.log('   +                    <-- CONTINUATION MARKER');
    console.log('   [loweralpha]');
    console.log('   .. Sub item a');
    console.log('   .. Sub item b');
    
    console.log('\n📋 CURRENT OUTPUT ANALYSIS:');
    const output = readFileSync('./CONTINUATION-FIX.adoc', 'utf-8');
    
    // Find areas where we have [loweralpha] and check what's before it
    const lines = output.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === '[loweralpha]') {
        console.log(`\n   Found [loweralpha] at line ${i + 1}:`);
        console.log(`     Line ${i - 1}: "${lines[i - 2] || '(none)'}"`);
        console.log(`     Line ${i}: "${lines[i - 1] || '(none)'}"`);
        console.log(`     Line ${i + 1}: "${lines[i]}" <-- [loweralpha]`);
        console.log(`     Line ${i + 2}: "${lines[i + 1] || '(none)'}"`);
        
        // Check if there's a continuation marker
        if (lines[i - 1] === '+') {
          console.log('     ✅ Has continuation marker');
        } else if (lines[i - 1].trim() === '') {
          if (lines[i - 2] === '+') {
            console.log('     ✅ Has continuation marker (with blank line)');
          } else {
            console.log('     ❌ NO continuation marker');
          }
        } else {
          console.log('     ❌ NO continuation marker');
        }
      }
    }

  } catch (error) {
    console.error(`❌ Debug failed: ${error.message}`);
  }
}

debugContinuationRemoval().catch(console.error);
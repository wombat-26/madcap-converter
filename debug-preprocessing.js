#!/usr/bin/env node

import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

console.log('=== DEBUGGING PREPROCESSING ===\n');

const problematicHtml = `
<?xml version="1.0" encoding="utf-8"?>
<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
    <head></head>
    <body>
        <h1>Deleting an Activity</h1>
        <div class="warning">
            <p><span class="warningInDiv">Attention!&#160;Data loss!</span></p>
            <p>Deleting an activity cannot be reverted. In addition, there may be changes to budgets, groupings and other associated items.</p>
        </div>
        <ol>
            <li>
                <p>In the side navigation, click <i>&gt;&#160;Activities</i>.</p>
            </li>
            <li>
                <p>Click the name or timeline of the activity you want to delete.</p>
            </li>
            <p>The activity's <i>Details panel</i> is displayed on the right side. </p>
            <li>
                <p>In the <i>Details panel</i>, click the <span class="Keyboard">…</span> button at the bottom right and select <i>Delete Activity</i>.</p>
            </li>
            <p>A security prompt is displayed.</p>
            <li>
                <p>Click <i>Delete</i>.</p>
            </li>
        </ol>
        <p>The activity will be deleted.</p>
    </body>
</html>
`;

async function debugPreprocessing() {
  try {
    const preprocessor = new MadCapPreprocessor();
    preprocessor.setPreserveVariables(true);
    
    const preprocessed = await preprocessor.preprocessMadCapContent(
      problematicHtml, 
      '/test/path/Content/test.htm', 
      'writerside-markdown'
    );
    
    console.log('PREPROCESSED HTML:');
    console.log(preprocessed);
    console.log('\n=== ANALYSIS ===');
    
    // Check if the orphaned <p> elements are still there
    if (preprocessed.includes('<ol>') && preprocessed.includes('</ol>')) {
      const olMatch = preprocessed.match(/<ol[^>]*>(.*?)<\/ol>/s);
      if (olMatch) {
        console.log('\nList content:');
        console.log(olMatch[1]);
        
        // Check for orphaned <p> elements
        const orphanedP = olMatch[1].match(/<p[^>]*>(?:(?!<li>).)*?<\/p>/gs);
        if (orphanedP) {
          console.log(`\n❌ Found ${orphanedP.length} orphaned <p> elements inside <ol>:`);
          orphanedP.forEach((p, i) => console.log(`${i + 1}. ${p.trim()}`));
        } else {
          console.log('\n✅ No orphaned <p> elements found');
        }
      }
    }
    
    // Check italic elements
    const italics = preprocessed.match(/<i[^>]*>.*?<\/i>/gs);
    if (italics) {
      console.log(`\nItalic elements found: ${italics.length}`);
      italics.forEach((italic, i) => console.log(`${i + 1}. ${italic}`));
    }
    
  } catch (error) {
    console.error('Preprocessing failed:', error.message);
  }
}

debugPreprocessing();
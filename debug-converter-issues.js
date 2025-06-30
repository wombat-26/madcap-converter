#!/usr/bin/env node

import WritersideMarkdownConverter from './build/converters/writerside-markdown-converter.js';

console.log('=== DEBUGGING CONVERTER FORMATTING ISSUES ===\n');

// The actual HTML content that's causing issues
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

const converter = new WritersideMarkdownConverter();

async function debugConversion() {
  try {
    const options = {
      format: 'writerside-markdown',
      inputType: 'madcap',
      inputPath: '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-08 DeleteActivity.htm'
    };
    
    const result = await converter.convert(problematicHtml, options);
    
    console.log('=== CURRENT OUTPUT ===');
    console.log(result.content);
    console.log('\n=== ANALYSIS ===');
    
    // Check for specific issues
    const issues = [];
    
    if (result.content.includes('\\_')) {
      issues.push('❌ Broken italics with escaped underscores found');
    }
    
    if (result.content.includes('click \_>')) {
      issues.push('❌ Broken navigation formatting found');
    }
    
    // Check list structure
    const lines = result.content.split('\n');
    let inList = false;
    let listItemCount = 0;
    let orphanedText = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^\d+\./.test(line)) {
        inList = true;
        listItemCount++;
      } else if (inList && line && !line.startsWith(' ') && !line.startsWith('\t') && !/^\d+\./.test(line) && !line.startsWith('>') && !line.startsWith('#')) {
        orphanedText.push(`Line ${i + 1}: "${line}"`);
      } else if (line === '') {
        // Empty line might end list context
        if (inList && i + 1 < lines.length && !lines[i + 1].trim().startsWith(' ') && !/^\d+\./.test(lines[i + 1])) {
          inList = false;
        }
      }
    }
    
    if (orphanedText.length > 0) {
      issues.push('❌ Orphaned text not properly indented in lists:');
      orphanedText.forEach(text => issues.push(`   ${text}`));
    }
    
    // Check admonition formatting
    if (!result.content.includes('**Attention!')) {
      issues.push('❌ Warning header not properly bolded');
    }
    
    // Check HTML entities
    if (result.content.includes('&#160;')) {
      issues.push('❌ HTML entities not properly decoded');
    }
    
    console.log('Issues found:');
    if (issues.length === 0) {
      console.log('✅ No formatting issues detected');
    } else {
      issues.forEach(issue => console.log(issue));
    }
    
    console.log(`\nTotal list items: ${listItemCount}`);
    console.log(`Orphaned text segments: ${orphanedText.length}`);
    
  } catch (error) {
    console.error('Conversion failed:', error.message);
    console.error(error.stack);
  }
}

debugConversion();
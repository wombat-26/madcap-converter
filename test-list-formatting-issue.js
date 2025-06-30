/**
 * Test case to reproduce list formatting issues in AsciiDoc conversion
 * Based on the MadCap Flare "Create a New Activity" content shown in user screenshots
 */

import { DocumentService } from './build/document-service.js';

// Sample HTML content representing the "Create a New Activity" structure
const testHtml = `
<html>
<body>
<h1>Create a New Activity</h1>

<h2>Table of Contents</h2>
<ul>
<li>Connecting Activities to Financial Items</li>
<li>Understanding Budget Setup</li>
<li>Related Links</li>
</ul>

<p>To create a new activity, follow these steps:</p>

<ol>
<li>In Uptempo, click Activities in the navigation sidebar.</li>
<li>In the Activities section, click Create Activity. The button is available on both the Timeline and Summary views.</li>
<li>
<p>Complete the Activity creation:</p>
<ol type="a">
<li>In the Create Activity setup assistant, select with the Key icons displayed.</li>
<li>For adding an activity, go to the Activities section and click on the activity in the hierarchy to select.</li>
<li>Click Add Activity. The button is available on both the Timeline and Summary views.</li>
</ol>
</li>
</ol>

<h2>Connecting Activities to Financial Items</h2>
<p>You can connect activities as financial level goals, campaigns, programs, etc to link multiple investments in Uptempo Spend. You can use this either as part of creating an activity, or as an existing strategy.</p>

<p>To connect activities to investments, follow these steps:</p>

<ol>
<li>
<p>On the activity where you want to connect investments, open the Budget page.</p>
<p>While creating a new activity, go to the Create Activity panel.</p>
</li>
<li>On an existing activity, go to the Activities section and click on the activity in the hierarchy to open in Details panel, then click the Budget tab.</li>
<li>Click Add Funding Source.</li>
</ol>

</body>
</html>
`;

async function testListFormatting() {
  console.log('Testing list formatting conversion...\n');
  
  try {
    const docService = new DocumentService();
    
    // Convert to AsciiDoc
    const options = {
      format: 'asciidoc',
      inputType: 'html',
      preserveFormatting: true,
      variableOptions: {
        extractVariables: false
      }
    };
    
    const result = await docService.convertString(testHtml, options);
    
    console.log('=== AsciiDoc Output ===');
    console.log(result.content);
    console.log('\n=== End Output ===\n');
    
    // Analyze the output for potential issues
    const lines = result.content.split('\n');
    console.log('=== Analysis ===');
    
    // Check for proper list markers
    const orderedListLines = lines.filter(line => /^\.*\s/.test(line));
    console.log(`Found ${orderedListLines.length} ordered list items:`);
    orderedListLines.forEach((line, index) => {
      console.log(`  ${index + 1}: "${line}"`);
    });
    
    // Check for alphabetical list markers
    const alphaMarkers = lines.filter(line => line.includes('[loweralpha]'));
    console.log(`\nFound ${alphaMarkers.length} alphabetical list markers:`);
    alphaMarkers.forEach((marker, index) => {
      console.log(`  ${index + 1}: "${marker}"`);
    });
    
    // Check for continuation markers
    const continuationMarkers = lines.filter(line => line.trim() === '+');
    console.log(`\nFound ${continuationMarkers.length} continuation markers (+)`);
    
    // Check for nested list structure
    const nestedItems = lines.filter(line => /^\.{2,}\s/.test(line));
    console.log(`\nFound ${nestedItems.length} nested list items (.. or more dots):`);
    nestedItems.forEach((line, index) => {
      console.log(`  ${index + 1}: "${line}"`);
    });
    
  } catch (error) {
    console.error('Error during conversion:', error);
  }
}

testListFormatting();
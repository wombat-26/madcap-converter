import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import fs from 'fs/promises';

// Create a test HTML with nested lists similar to the MadCap structure
const testHTML = `
<html>
<head><title>Create a New Activity</title></head>
<body>
<h1>Create a New Activity</h1>
<p>To create a new activity, follow these steps:</p>

<ol>
<li>In Uptempo, click <em>Activities</em> in the navigation sidebar.</li>
<li>In the Activities section, click <em>Create Activity.</em> The button is available on both the <em>Timeline</em> and <em>Summary</em> views:
<p><img src="../Images/Screens/CreateActivity.png" alt="CreateActivity" /></p>
<p>The <em>Create Activity</em> setup assistant opens with the <em>Type</em> page displayed.</p>
</li>
</ol>

<div class="note">
<p><span class="noteInDiv">Note:</span> You can also create a new activity directly under an existing activity, which will automatically set that activity as the new activity's parent.</p>
</div>

<ol start="3">
<li>On the <em>Type</em> page:
<ol style="list-style-type: lower-alpha;">
<li>Use the <em>Activity type</em> list to select the type of activity you want to create from the available options. You can also type a keyword into the field to search for matching options.</li>
<li>Use the <em>Parent</em> list to select the activity under which you want to create this new activity in the hierarchy. You can also type a keyword into the field to search for matching options.</li>
</ol>

<div class="note">
<p><span class="noteInDiv">Note:</span> Depending on the rules set up in your Uptempo environment, selecting a parent activity may be optional for some activity types.</p>
</div>

<ol style="list-style-type: lower-alpha;" start="3">
<li>Click <em>Next</em>.</li>
</ol>
<p>The <strong>Details</strong> page is displayed.</p>
</li>

<li>On the <strong>Details</strong> page:
<ol style="list-style-type: lower-alpha;">
<li>Enter a name for your new activity into the <em>Name</em> field.</li>
<li>Optional: To set the date range when this activity will be in-market, use the <em>In-market Dates</em> fields to choose a start and end date.</li>
<li>Depending on the activity type you selected, additional attribute fields may be displayed. Complete any other attributes as needed: if an attribute is marked with an asterisk (*), it is required and you must select or enter a value before you can proceed.</li>
</ol>

<div class="note">
<p><span class="noteInDiv">Note:</span> If you see the icons <img src="../Images/GUI-Elemente/Controlling attribute.png" alt="Controlling Attribute" style="width: 18px; height: 18px;" class="IconInline" /> and <img src="../Images/GUI-Elemente/Dependent attribute.png" alt="Dependent Attribute" style="width: 18px; height: 18px;" class="IconInline" /> next to an attribute name, then these attributes are part of a dependency.</p>
</div>

<p><img src="../Images/GUI-Elemente/Dependent attribute Tooltip.png" alt="Dependent Attribute Tooltip" /> The options that you can select in the dependent attribute are controlled by the value of the controlling attribute.</p>

<ol style="list-style-type: lower-alpha;" start="4">
<li>Click <em>Next</em>.</li>
</ol>
<p>The <strong>Budget</strong> page is displayed.</p>
</li>

<li>On the <strong>Budget</strong> page:
<ol style="list-style-type: lower-alpha;">
<li>Optional: To enter a cost estimate for this activity, use the Estimated Costs field.</li>
<li>Optional: To connect this activity to an investment, click <em>Add funding source</em>.</li>
<li>Click <em>Next</em>.</li>
</ol>
<p>The <em>Impact</em> page is displayed.</p>
</li>
</ol>

<h2>Related tasks</h2>
<ul>
<li>Create New Activities Directly Under Existing Activities</li>
</ul>
</body>
</html>`;

async function testImprovedConverter() {
  console.log('Testing improved AsciiDoc converter with nested lists...\n');
  
  const converter = new AsciiDocConverter();
  const options = {
    format: 'asciidoc',
    inputType: 'html',
    rewriteLinks: true
  };
  
  try {
    const result = await converter.convert(testHTML, options);
    console.log('=== CONVERTED ASCIIDOC ===\n');
    console.log(result.content);
    
    // Save to file for inspection
    await fs.writeFile('test-improved-lists-output.adoc', result.content);
    console.log('\n=== Output saved to test-improved-lists-output.adoc ===');
  } catch (error) {
    console.error('Conversion error:', error);
  }
}

testImprovedConverter();
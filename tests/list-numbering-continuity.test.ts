import { describe, test, expect, beforeEach } from '@jest/globals';
import { AsciiDocConverter } from '../src/core/converters/asciidoc-converter.js';
import { ConversionOptions } from '../src/core/types/index.js';

describe('List Numbering Continuity Tests', () => {
  let converter: AsciiDocConverter;

  beforeEach(() => {
    converter = new AsciiDocConverter();
  });

  test('should maintain sequential numbering 1-8 for interrupted main list', async () => {
    // Simplified version of the problematic HTML structure
    const problematicHTML = `
    <h1>Create a New Activity</h1>
    <p>To create a new activity, follow these steps:</p>
    <ol>
        <li>
            <p>In Uptempo, click Activities in the navigation sidebar.</p>
        </li>
        <li>
            <p>In the Activities section, click Create Activity.</p>
            <p>The Create Activity setup assistant opens.</p>
        </li>
        <li>
            <p>On the Type page:</p>
        </li>
        <ol style="list-style-type: lower-alpha;">
            <li><p>Use the Activity type list to select the type.</p></li>
            <li><p>Use the Parent list to select the parent activity.</p></li>
            <li><p>Click Next.</p></li>
        </ol>
        <li>
            <p>On the Details page:</p>
            <ol style="list-style-type: lower-alpha;">
                <li><p>Enter a name for your new activity.</p></li>
                <li><p>Set the date range when this activity will be in-market.</p></li>
                <li><p>Click Next.</p></li>
            </ol>
        </li>
        <li>
            <p>On the Budget page:</p>
            <ol style="list-style-type: lower-alpha;">
                <li><p>Enter a cost estimate for this activity.</p></li>
                <li><p>Connect this activity to an investment.</p></li>
                <li><p>Click Next.</p></li>
            </ol>
        </li>
        <li>
            <p>On the Impact page:</p>
            <ol style="list-style-type: lower-alpha;">
                <li><p>Configure the performance data here.</p></li>
                <li><p>If no additional steps, skip to step 8.</p></li>
                <li><p>If Workflow step available, click Next.</p></li>
            </ol>
        </li>
        <li>
            <p>On the Workflow step:</p>
            <ol style="list-style-type: lower-alpha;">
                <li><p>Decide when the workflow will be started.</p></li>
                <li><p>Select or clear the checkbox as needed.</p></li>
            </ol>
        </li>
        <li>
            <p>Click Submit to finish creating the activity.</p>
        </li>
    </ol>`;

    const options: ConversionOptions = {
      format: 'asciidoc',
      inputType: 'html',
      preserveFormatting: true
    };

    const result = await converter.convert(problematicHTML, options);
    
    console.log('=== LIST NUMBERING CONTINUITY TEST ===');
    console.log('Output AsciiDoc:');
    console.log(result.content);
    console.log('=== END TEST ===');

    // Verify that we get sequential main numbering 1-8
    const lines = result.content.split('\n');
    const mainListItems = lines.filter(line => line.trim().match(/^\.\s+/));
    
    console.log('Main list items found:');
    mainListItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.trim()}`);
    });

    // Should have exactly 8 main items
    expect(mainListItems.length).toBe(8);
    
    // Verify the content of each main item (they should be sequential steps)
    expect(mainListItems[0]).toContain('In Uptempo, click Activities');
    expect(mainListItems[1]).toContain('In the Activities section, click Create Activity');
    expect(mainListItems[2]).toContain('On the Type page');
    expect(mainListItems[3]).toContain('On the Details page');
    expect(mainListItems[4]).toContain('On the Budget page');
    expect(mainListItems[5]).toContain('On the Impact page');
    expect(mainListItems[6]).toContain('On the Workflow step');
    expect(mainListItems[7]).toContain('Click Submit to finish');
    
    // Verify alphabetic nested lists exist  
    expect(result.content).toContain('.. Use the Activity type list');
    expect(result.content).toContain('.. Enter a name for your new activity');
    expect(result.content).toContain('.. Enter a cost estimate');
    expect(result.content).toContain('.. Configure the performance data');
    expect(result.content).toContain('.. Decide when the workflow');
  });

  test('should maintain list continuity across content interruptions', async () => {
    // Test with images and notes between list items
    const htmlWithInterruptions = `
    <h1>Test Document</h1>
    <ol>
        <li>First step</li>
        <li>Second step with content
            <p>Additional paragraph</p>
            <img src="test.png" alt="test" />
            <div class="note">Important note</div>
        </li>
        <li>Third step</li>
        <li>Fourth step</li>
    </ol>`;

    const options: ConversionOptions = {
      format: 'asciidoc',
      inputType: 'html',
      preserveFormatting: true
    };

    const result = await converter.convert(htmlWithInterruptions, options);
    
    console.log('=== INTERRUPTION TEST ===');
    console.log('Output AsciiDoc:');
    console.log(result.content);
    console.log('=== END TEST ===');

    // Should maintain sequential numbering despite interruptions
    const lines = result.content.split('\n');
    const mainListItems = lines.filter(line => line.trim().match(/^\.\s+/));
    
    expect(mainListItems.length).toBe(4);
    expect(mainListItems[0]).toContain('First step');
    expect(mainListItems[1]).toContain('Second step');
    expect(mainListItems[2]).toContain('Third step');
    expect(mainListItems[3]).toContain('Fourth step');
  });
});
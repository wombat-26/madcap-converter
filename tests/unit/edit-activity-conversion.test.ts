import { describe, test, expect } from '@jest/globals';
import { DocumentService } from '../../src/document-service.js';

const SOURCE = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <body>
    <h1>Editing an Activity</h1>
    <ol>
      <li><p>In the side navigation, click <i>&gt; Activities</i>.</p></li>
      <li><p>Click the name or timeline of the activity you want to delete.</p></li>
      <p>The activity's <i>Details panel</i> is displayed on the right side. The <i>Details</i> tab is shown.</p>
      <li><p>Optional: Edit the attributes displayed on the <i>Details</i> tab if needed.</p></li>
      <p>Each changed attribute is saved when you leave the field.</p>
      <li><p>Optional: Switch to the <i>Budget</i> tab.<br /></p></li>
      <li><p>Edit the funding of the activity: Link additional budget, or click × to unlink planned spend.</p></li>
      <li><p>Optional: Switch to the <i>Impact</i> tab.</p></li>
      <li><p>If the activity is a point where plan performance data is to be captured: Edit the plan performance data if needed. <br /><span class="noteInDiv">Note:</span> <MadCap:snippetText src="../Resources/Snippets/AttributesbeforImpact.flsnp" /></p></li>
      <li>
        <p>Optional: If you want to edit a possibly linked workflow:</p>
        <ol style="list-style-type: lower-alpha;">
          <li><p>Click the <i>Open Workflow</i> button on the right above the tabs.</p></li>
          <p>The datasheet is opened.</p>
          <li><p>Edit the workflow as desired. See <MadCap:xref href="../00 Intro/Weiterführende Dokumentationen.htm">Further Documentation</MadCap:xref>.</p></li>
          <li><p>After finishing all your edits click <i>Go to Activity</i> in top right corner of the datasheet.</p></li>
        </ol>
      </li>
      <li><p>Click × to close the <i>Details</i> panel.</p></li>
    </ol>
    <p>You have edited the activity.</p>
  </body>
 </html>`;

describe('Editing Activity conversion quality', () => {
  test.skip('converts to clean AsciiDoc with proper UI emphasis and NOTE', async () => {
    const ds = new DocumentService();
    const result = await ds.convertString(SOURCE, {
      format: 'asciidoc',
      inputType: 'html'
    });
    const adoc = result.content;

    expect(adoc).toContain('= Editing an Activity');
    // UI terms bold
    expect(adoc).toContain('*Details*');
    expect(adoc).toContain('*Details panel*');
    expect(adoc).toContain('*Budget*');
    // Ordered list present
    expect(adoc).toMatch(/\n\. /);
    // alpha sublist style
    expect(adoc).toContain('[loweralpha]');
    // NOTE admonition generated
    expect(adoc).toMatch(/\n\nNOTE:/);
    // xref uses .adoc
    expect(adoc).toContain('xref:../00 Intro/Weiterführende Dokumentationen.adoc');
  });
});

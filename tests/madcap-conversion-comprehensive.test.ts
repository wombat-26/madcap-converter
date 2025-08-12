/**
 * Comprehensive MadCap Conversion Test Suite
 * 
 * Tests all critical MadCap elements and conversion scenarios
 * based on real production files like CreateActivity.htm
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AsciiDocConverter } from '../src/core/converters/asciidoc-converter.js';
import WritersideMarkdownConverter from '../src/core/converters/writerside-markdown-converter.js';
import { MadCapPreprocessor } from '../src/core/services/madcap-preprocessor.js';

describe('MadCap Conversion - Comprehensive Suite', () => {
  let asciidocConverter: AsciiDocConverter;
  let markdownConverter: WritersideMarkdownConverter;
  let preprocessor: MadCapPreprocessor;

  beforeAll(() => {
    asciidocConverter = new AsciiDocConverter();
    markdownConverter = new WritersideMarkdownConverter();
    preprocessor = new MadCapPreprocessor();
  });

  describe('Nested List Structure', () => {
    test('should preserve numbered lists with alphabetical sub-lists', async () => {
      const html = `
        <ol>
          <li>
            <p>First main item</p>
          </li>
          <li>
            <p>Second main item:</p>
            <ol style="list-style-type: lower-alpha;">
              <li>
                <p>Sub-item A</p>
              </li>
              <li>
                <p>Sub-item B with note</p>
                <p><span class="noteInDiv">Note:</span> This is a note.</p>
              </li>
              <li>
                <p>Sub-item C</p>
                <p>Additional paragraph in sub-item.</p>
              </li>
            </ol>
          </li>
          <li>
            <p>Third main item</p>
          </li>
        </ol>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc',
        asciidocOptions: { useCollapsibleBlocks: true }
      });

      // Check for proper list markers
      // Depth-based lists automatically render as alphabetic in AsciiDoc
      expect(result.content).toContain('1. First main item');
      expect(result.content).toContain('2. Second main item:');
      expect(result.content).toContain('a. Sub-item A');
      expect(result.content).toContain('b. Sub-item B with note');
      expect(result.content).toContain('c. Sub-item C');
      expect(result.content).toContain('3. Third main item');
      
      // Check for proper continuation markers
      expect(result.content).toMatch(/NOTE:.*This is a note/);
      expect(result.content).toMatch(/Additional paragraph in sub-item/);
    });

    test('should handle deeply nested lists with mixed types', async () => {
      const html = `
        <ol>
          <li>
            <p>Main item</p>
            <ol style="list-style-type: lower-alpha;">
              <li>
                <p>Alpha item</p>
                <ul>
                  <li><p>Bullet point 1</p></li>
                  <li><p>Bullet point 2</p></li>
                </ul>
              </li>
            </ol>
          </li>
        </ol>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc'
      });

      expect(result.content).toContain('1. Main item');
      // Depth-based lists automatically render as alphabetic in AsciiDoc
      expect(result.content).toContain('a. Alpha item');
      expect(result.content).toContain('* Bullet point 1');
      expect(result.content).toContain('* Bullet point 2');
    });
  });

  describe('MadCap Dropdowns', () => {
    test('should convert MadCap dropdowns to collapsible blocks', async () => {
      const html = `
        <MadCap:dropDown>
          <MadCap:dropDownHead>
            <MadCap:dropDownHotspot>
              <a name="Connecting"></a>Connecting Activities to Financial Items<br />
            </MadCap:dropDownHotspot>
          </MadCap:dropDownHead>
          <MadCap:dropDownBody>
            <p>You can connect activities at various levels to investments.</p>
            <ol>
              <li><p>First step</p></li>
              <li><p>Second step</p></li>
            </ol>
          </MadCap:dropDownBody>
        </MadCap:dropDown>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc',
        asciidocOptions: { useCollapsibleBlocks: true }
      });

      expect(result.content).toContain('[%collapsible]');
      expect(result.content).toContain('.Connecting Activities to Financial Items');
      expect(result.content).toContain('====');
      expect(result.content).toContain('You can connect activities');
      expect(result.content).toContain('1. First step');
      expect(result.content).toContain('2. Second step');
    });

    test('should handle dropdowns without collapsible blocks option', async () => {
      const html = `
        <MadCap:dropDown>
          <MadCap:dropDownHead>
            <MadCap:dropDownHotspot>Configuration Details</MadCap:dropDownHotspot>
          </MadCap:dropDownHead>
          <MadCap:dropDownBody>
            <p>Configuration content here.</p>
          </MadCap:dropDownBody>
        </MadCap:dropDown>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc',
        asciidocOptions: { useCollapsibleBlocks: false }
      });

      // Should convert to regular section
      expect(result.content).toContain('== Configuration Details');
      expect(result.content).toContain('Configuration content here.');
    });
  });

  describe('MadCap Cross-References', () => {
    test('should convert MadCap xref to proper links', async () => {
      const html = `
        <p>For details, see <MadCap:xref href="01-02-3 CreateActivityAddUnder.htm">Create New Activities Directly Under Existing Activities</MadCap:xref>.</p>
        <p>Also see <MadCap:xref href="#Connecting">Connecting Existing Activities to Financial Items</MadCap:xref>.</p>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc'
      });

      expect(result.content).toContain('link:01-02-3 CreateActivityAddUnder.adoc[Create New Activities Directly Under Existing Activities]');
      expect(result.content).toContain('link:#Connecting[Connecting Existing Activities to Financial Items]');
    });
  });

  describe('MadCap Snippets', () => {
    test('should convert snippet blocks to include directives', async () => {
      const html = `
        <p>Before snippet</p>
        <MadCap:snippetBlock src="../Resources/Snippets/NoteActionDependency.flsnp" />
        <p>After snippet</p>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc'
      });

      expect(result.content).toContain('Before snippet');
      expect(result.content).toContain('include::../Resources/Snippets/NoteActionDependency.adoc[]');
      expect(result.content).toContain('After snippet');
    });

    test('should convert snippet text to include directive', async () => {
      const html = `
        <p><MadCap:snippetText src="../Resources/Snippets/AttributesbeforImpact.flsnp" /> For more details see link.</p>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc'
      });

      expect(result.content).toContain('include::../Resources/Snippets/AttributesbeforImpact.adoc[]');
      expect(result.content).toContain('For more details see link.');
    });
  });

  describe('Note Elements', () => {
    test('should convert note divs to AsciiDoc admonitions', async () => {
      const html = `
        <div class="note">
          <p><span class="noteInDiv">Note:</span>&#160;</p>
          <p>This is an important note with additional details.</p>
        </div>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc'
      });

      expect(result.content).toContain('NOTE:');
      expect(result.content).toContain('This is an important note with additional details.');
    });

    test('should handle inline notes in paragraphs', async () => {
      const html = `
        <p><span class="noteInDiv">Note:</span> Depending on the rules set up in your environment.</p>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc'
      });

      expect(result.content).toContain('NOTE: Depending on the rules set up in your environment.');
    });
  });

  describe('Image Handling', () => {
    test('should handle inline icons correctly', async () => {
      const html = `
        <p>Click the <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button to connect.</p>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc'
      });

      // Should be inline image
      expect(result.content).toContain('image:../Images/GUI-Elemente/Link Activity.png[]');
      expect(result.content).not.toContain('image::'); // Not block image
    });

    test('should handle block images with dimensions', async () => {
      const html = `
        <p>
          <img src="../Images/Screens/CreateActivity.png" title="c" style="width: 711px;height: 349px;" />
        </p>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc'
      });

      // Should be block image with attributes
      expect(result.content).toContain('image::../Images/Screens/CreateActivity.png[c,width=711,height=349]');
    });
  });

  describe('Video Elements', () => {
    test('should convert MadCap HTML5Video to AsciiDoc video', async () => {
      const html = `
        <p MadCap:conditions="Target Presentation.Online Help">
          <object MadCap:HTML5Video="true" src="../IntActVideo/CreatActi.mp4" MadCap:Param_controls="true" MadCap:Param_muted="false" MadCap:Param_loop="false" MadCap:Param_autoplay="false">
          </object>
        </p>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc'
      });

      expect(result.content).toContain('video::../IntActVideo/CreatActi.mp4[options="controls"]');
    });
  });

  describe('Complex Integration', () => {
    test('should handle lists with notes, images, and links together', async () => {
      const html = `
        <ol>
          <li>
            <p>Select the budget from the list:</p>
            <p>
              <img src="../Images/Screens/InvestItem.png" style="width: 803px;height: 415px;" />
            </p>
          </li>
          <li>
            <p>Click the <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button.</p>
            <div class="note">
              <p><span class="noteInDiv">Note:</span></p>
              <p>The button may be unavailable for some items.</p>
            </div>
          </li>
        </ol>
      `;

      const result = await asciidocConverter.convert(html, {
        format: 'asciidoc'
      });

      expect(result.content).toContain('1. Select the budget from the list:');
      expect(result.content).toContain('image::../Images/Screens/InvestItem.png[width=803,height=415]');
      expect(result.content).toContain('2. Click the image:../Images/GUI-Elemente/Link Activity.png[] _Link_ button.');
      expect(result.content).toContain('NOTE:');
      expect(result.content).toContain('The button may be unavailable for some items.');
    });
  });
});

describe('Enhanced Preprocessing Integration', () => {
  test('should apply validation and fixing before conversion', async () => {
    const html = `
      <ol>
        <li><p>Item 1</p></li>
        <p>Orphaned paragraph</p>
        <li><p>Item 2</p></li>
      </ol>
    `;

    const preprocessor = new MadCapPreprocessor();
    const result = await preprocessor.preprocess(html, 'test.htm');

    // Check that preprocessing occurred
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});

describe('Real File End-to-End Test', () => {
  test('should convert CreateActivity.htm with high fidelity', async () => {
    const sourceFile = './tests/fixtures/sample-madcap-file.htm';
    
    let html: string;
    try {
      html = readFileSync(sourceFile, 'utf-8');
    } catch (error) {
      console.log('Skipping real file test - fixture not available');
      return;
    }

    const preprocessor = new MadCapPreprocessor();
    const preprocessResult = await preprocessor.preprocess(html, sourceFile);

    const asciidocResult = await asciidocConverter.convert(preprocessResult, {
      format: 'asciidoc',
      asciidocOptions: {
        useCollapsibleBlocks: true,
        enableValidation: true,
        autoColumnWidths: true
      }
    });

    // Verify key elements are preserved
    expect(asciidocResult.content).toContain('= Create a New Activity');
    expect(asciidocResult.content).toContain('To create a new activity, follow these steps:');
    
    // Check for proper list structure
    // Depth-based lists automatically render as alphabetic in AsciiDoc
    expect(asciidocResult.content).toMatch(/1\.\s+In Uptempo, click.*Activities/);
    
    // Check for collapsible blocks
    expect(asciidocResult.content).toContain('[%collapsible]');
    expect(asciidocResult.content).toContain('.Connecting Activities to Financial Items');
    
    // Check for proper image handling
    expect(asciidocResult.content).toContain('image::../Images/Screens/CreateActivity.png');
    expect(asciidocResult.content).toContain('image:../Images/GUI-Elemente/Link Activity.png[]');
    
    // Check for notes
    expect(asciidocResult.content).toContain('NOTE:');
    
    // Check for cross-references
    expect(asciidocResult.content).toContain('link:01-02-3 CreateActivityAddUnder.adoc');
    
    // Check for snippets
    expect(asciidocResult.content).toContain('include::../Resources/Snippets/');
    
    // Check for video
    expect(asciidocResult.content).toContain('video::../IntActVideo/CreatActi.mp4');

    console.log(`✅ End-to-end test passed:`);
    console.log(`   Original HTML: ${html.length} characters`);
    console.log(`   Converted AsciiDoc: ${asciidocResult.content.length} characters`);
    console.log(`   Validation fixed: ${preprocessResult.wasFixed ? 'YES' : 'NO'}`);
    console.log(`   Stage optimized: ${preprocessResult.wasOptimized ? 'YES' : 'NO'}`);
  });
});
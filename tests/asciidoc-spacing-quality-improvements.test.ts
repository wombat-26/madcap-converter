/**
 * @jest-environment node
 */

import { AsciiDocConverter } from '../src/core/converters/asciidoc-converter';

describe('AsciiDoc Spacing Quality Improvements', () => {
  let converter: AsciiDocConverter;

  beforeEach(() => {
    converter = new AsciiDocConverter();
  });

  describe('Bold Text Spacing', () => {
    it('should add proper spacing around bold elements in flowing text', async () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body>
            <h1>Test Document</h1>
            <p>In side navigation, click<strong>Activities</strong>.</p>
            <p>In the<strong>Activities</strong>view, click the button.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, { format: 'asciidoc' });
      const content = result.content;

      // Should have proper spacing around bold elements
      expect(content).toContain('click *Activities*.');
      expect(content).toContain('In the *Activities* view,');
      
      // Should NOT have bold elements attached to adjacent words
      expect(content).not.toContain('click*Activities*');
      expect(content).not.toContain('the*Activities*view');
    });

    it('should handle multiple bold elements in same paragraph', async () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body>
            <h1>Test</h1>
            <p>Click<strong>Add New</strong>and select<strong>Attribute</strong>from the menu.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, { format: 'asciidoc' });
      const content = result.content;

      expect(content).toContain('Click *Add New* and select *Attribute* from');
      expect(content).not.toContain('Click*Add New*and');
      expect(content).not.toContain('select*Attribute*from');
    });
  });

  describe('Image Macro Spacing', () => {
    it('should add proper spacing before inline images in flowing text', async () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body>
            <h1>Test</h1>
            <p>In the Activities view, click<img src="Images/GUI-Elemente/Gearwheel_15x15.png" alt="Gearwheel" class="IconInline" width="15" height="15" />.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, { format: 'asciidoc' });
      const content = result.content;

      // Should have proper spacing before image macro
      expect(content).toContain('click image:Images/GUI-Elemente/Gearwheel_15x15.png[Gearwheel');
      
      // Should NOT have image macro attached to preceding word
      expect(content).not.toContain('clickimage:Images/');
    });

    it('should handle images with bold text together', async () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body>
            <h1>Test</h1>
            <p>Click<strong>Settings</strong>then click<img src="Images/icon.png" alt="Icon" class="IconInline" width="16" height="16" />to continue.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, { format: 'asciidoc' });
      const content = result.content;

      expect(content).toContain('Click *Settings* then click image:Images/icon.png[Icon');
      expect(content).not.toContain('Click*Settings*then');
      expect(content).not.toContain('clickimage:Images/');
    });
  });

  describe('Complex Text Flow Scenarios', () => {
    it('should handle the users original problematic example correctly', async () => {
      const html = `
        <html>
          <head><title>Creating an Attribute</title></head>
          <body>
            <h1>Creating an Attribute</h1>
            <ol>
              <li>In side navigation, click<strong>Activities</strong>.</li>
              <li>In the<strong>Activities</strong>view, click<img src="Images/GUI-Elemente/Gearwheel_15x15.png" alt="Gearwheel" class="IconInline" width="15" height="15" />.</li>
            </ol>
            <p>The settings for configuration are displayed.</p>
            <ol>
              <li>Click<strong>Attribute Definitions</strong>in the menu on the left side.</li>
            </ol>
          </body>
        </html>
      `;

      const result = await converter.convert(html, { format: 'asciidoc' });
      const content = result.content;

      // Verify all the issues are fixed
      expect(content).toContain('click *Activities*.');
      expect(content).toContain('In the *Activities* view, click image:Images/GUI-Elemente/Gearwheel_15x15.png[Gearwheel');
      expect(content).toContain('Click *Attribute Definitions* in the menu');
      
      // Verify the problematic patterns are gone
      expect(content).not.toContain('click*Activities*');
      expect(content).not.toContain('clickimage:');
      expect(content).not.toContain('Click*Attribute');
      expect(content).not.toContain('the*Activities*view');
    });

    it('should maintain proper sentence flow with mixed elements', async () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body>
            <h1>Mixed Elements</h1>
            <p>First click<strong>Save</strong>, then navigate to<strong>Settings</strong>and click<img src="icon.png" alt="Icon" class="IconInline" />to confirm.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, { format: 'asciidoc' });
      const content = result.content;

      expect(content).toContain('First click *Save*, then navigate to *Settings* and click image:icon.png[Icon');
      
      // Check for proper word boundaries throughout
      expect(content).not.toContain('click*Save*,');
      expect(content).not.toContain('to*Settings*and');
      expect(content).not.toContain('clickimage:icon.png');
    });
  });

  describe('Edge Cases and Punctuation', () => {
    it('should handle punctuation correctly around formatted elements', async () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body>
            <h1>Punctuation Test</h1>
            <p>The<strong>Activity</strong>: click<strong>Save</strong>. Next, click<img src="icon.png" alt="Icon" class="IconInline" />!</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, { format: 'asciidoc' });
      const content = result.content;

      expect(content).toContain('The *Activity*: click *Save*. Next, click image:icon.png[Icon');
      
      // Verify punctuation spacing is maintained
      expect(content).not.toContain('The*Activity*:');
      expect(content).not.toContain('click*Save*.');
      expect(content).not.toContain('clickimage:icon.png');
    });

    it('should handle whitespace normalization without over-trimming', async () => {
      const html = `
        <html>
          <head><title>Whitespace Test</title></head>
          <body>
            <h1>Whitespace Test</h1>
            <p>Text   with    multiple    spaces between<strong>bold</strong>words should be normalized.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, { format: 'asciidoc' });
      const content = result.content;

      // Should normalize multiple spaces to single spaces
      expect(content).toContain('Text with multiple spaces between *bold* words');
      
      // Should not have excessive whitespace
      expect(content).not.toContain('   ');
      expect(content).not.toContain('between*bold*words');
    });
  });

  describe('Regression Tests', () => {
    it('should not break existing functionality for normal paragraphs', async () => {
      const html = `
        <html>
          <head><title>Normal Text</title></head>
          <body>
            <h1>Normal Text</h1>
            <p>This is a normal paragraph with no special formatting.</p>
            <p>This paragraph has some <em>italic</em> text in it.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, { format: 'asciidoc' });
      
      expect(result.content).toContain('This is a normal paragraph');
      expect(result.content).toContain('has some _italic_ text');
    });

    it('should not break list processing', async () => {
      const html = `
        <html>
          <head><title>List Test</title></head>
          <body>
            <h1>List Test</h1>
            <ol>
              <li>First item with<strong>bold</strong>text</li>
              <li>Second item with<img src="icon.png" alt="Icon" class="IconInline" />image</li>
            </ol>
          </body>
        </html>
      `;

      const result = await converter.convert(html, { format: 'asciidoc' });
      
      expect(result.content).toContain('. First item with *bold* text');
      expect(result.content).toContain('. Second item with image:icon.png[Icon');
    });
  });
});
import { describe, it, expect, beforeEach } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { AsciiDocConverter } from '../src/core/converters/asciidoc-converter.js';

describe('AsciiDocConverter - Image Line Break Handling', () => {
  let converter: AsciiDocConverter;

  beforeEach(() => {
    converter = new AsciiDocConverter();
  });

  describe('Block Image Line Breaks', () => {
    it('should add proper line breaks before standalone block images', async () => {
      const html = `
        <html>
          <body>
            <p>This is some text before the image.</p>
            <p><img src="images/screenshot.png" alt="Screenshot"></p>
            <p>This is some text after the image.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        format: 'asciidoc',
        inputType: 'html'
      });

      // Check that the block image has proper spacing
      expect(result.content).toContain('This is some text before the image.\n\n');
      expect(result.content).toContain('\n\nimage::images/screenshot.png[Screenshot]\n\n');
      expect(result.content).toContain('This is some text after the image.');
    });

    it('should handle block images in their own paragraph with only alt text', async () => {
      const html = `
        <html>
          <body>
            <p>Previous paragraph.</p>
            <p><img src="images/example.png" alt="Example Image">Example Image</p>
            <p>Next paragraph.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        format: 'asciidoc',
        inputType: 'html'
      });

      // Should treat as block image with proper spacing
      expect(result.content).toContain('Previous paragraph.\n\n');
      expect(result.content).toMatch(/\n\nimage::images\/example\.png\[Example Image\]/);
    });

    it('should handle inline images without extra line breaks', async () => {
      const html = `
        <html>
          <body>
            <p>Click the <img src="icons/button.png" alt="Button" width="16" height="16"> button to continue.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        format: 'asciidoc',
        inputType: 'html'
      });

      // Inline image should not have extra line breaks
      expect(result.content).toContain('Click the image:icons/button.png[Button] button to continue.');
      expect(result.content).not.toContain('\n\nimage:');
    });

    it('should handle IconInline class images properly', async () => {
      const html = `
        <html>
          <body>
            <p>Click <img src="GUI/icon.png" alt="Icon" class="IconInline"> to save.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        format: 'asciidoc',
        inputType: 'html'
      });

      // IconInline should be inline with size constraint
      expect(result.content).toContain('Click image:GUI/icon.png[Icon, 18] to save.');
    });

    it('should handle images in list items as inline by design', async () => {
      const html = `
        <html>
          <body>
            <ol>
              <li>First step</li>
              <li>Click the button:
                <img src="screens/button-screenshot.png" alt="Button Screenshot">
              </li>
              <li>Third step</li>
            </ol>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        format: 'asciidoc',
        inputType: 'html'
      });

      // Images in list items are converted as separate list items
      expect(result.content).toMatch(/\. image:screens\/button-screenshot\.png\[Button Screenshot\]/);
    });

    it('should preserve spacing for multiple consecutive block images', async () => {
      const html = `
        <html>
          <body>
            <p>Here are the screenshots:</p>
            <p><img src="images/screen1.png" alt="Screen 1"></p>
            <p><img src="images/screen2.png" alt="Screen 2"></p>
            <p>End of screenshots.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        format: 'asciidoc',
        inputType: 'html'
      });

      // Each block image should have proper spacing
      expect(result.content).toContain('Here are the screenshots:');
      expect(result.content).toMatch(/\n\nimage::images\/screen1\.png\[Screen 1\]/);
      expect(result.content).toMatch(/\n\nimage::images\/screen2\.png\[Screen 2\]/);
      expect(result.content).toContain('End of screenshots.');
    });
  });
});
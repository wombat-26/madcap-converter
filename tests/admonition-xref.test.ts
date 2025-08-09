import { AsciiDocConverter } from '../src/core/converters/asciidoc-converter';

describe('AsciiDoc Converter - Admonitions and Cross-references', () => {
  let converter: AsciiDocConverter;

  beforeEach(() => {
    converter = new AsciiDocConverter();
  });

  describe('Admonition Processing', () => {
    test('should handle MadCap NOTE with separate content paragraph', async () => {
      const html = `
        <html>
          <body>
            <div class="note">
              <p><span class="noteInDiv">Note:</span>&#160;</p>
              <p>You can also create a new activity directly under an existing activity, which will automatically set that activity as the new activity's parent. For details, see <a href="01-02-3 CreateActivityAddUnder.htm">Create New Activities Directly Under Existing Activities</a>.</p>
            </div>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        resourcePath: '/test',
        outputPath: '/test',
        enableSnippets: false,
        enableTOC: false
      });

      console.log('Admonition test result:', result);
      console.log('Result content:', result?.content);
      
      // Should contain proper NOTE format with content
      expect(result?.content).toContain('NOTE: You can also create a new activity');
      expect(result.content).toContain('xref:01-02-3 CreateActivityAddUnder.adoc[Create New Activities Directly Under Existing Activities]');
      // Should not have empty NOTE
      expect(result.content).not.toContain('NOTE: Create New Activities Directly Under Existing Activities');
    });

    test('should handle MadCap NOTE with inline content', async () => {
      const html = `
        <html>
          <body>
            <p><span class="noteInDiv">Note:</span> This is an inline note with content in the same paragraph.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        resourcePath: '/test', 
        outputPath: '/test',
        enableSnippets: false,
        enableTOC: false
      });

      expect(result.content).toContain('NOTE: This is an inline note with content in the same paragraph.');
    });

    test('should handle MadCap WARNING blocks', async () => {
      const html = `
        <html>
          <body>
            <div class="warning">
              <p><span class="warningInDiv">Warning:</span></p>
              <p>This action cannot be undone.</p>
            </div>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        resourcePath: '/test',
        outputPath: '/test', 
        enableSnippets: false,
        enableTOC: false
      });

      expect(result.content).toContain('WARNING: This action cannot be undone.');
    });
  });

  describe('Cross-reference Processing', () => {
    test('should fix spacing between text and cross-references', async () => {
      const html = `
        <html>
          <body>
            <p>For instructions, see <a href="01-00 Activities.htm#Estimating">Estimating Activity Costs</a>.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        resourcePath: '/test',
        outputPath: '/test',
        enableSnippets: false, 
        enableTOC: false
      });

      console.log('Cross-reference test result:', result?.content);
      
      // Should have proper spacing: "see xref:" not "seexref:"
      expect(result.content).toContain('see xref:01-00 Activities.adoc#Estimating[Estimating Activity Costs]');
      expect(result.content).not.toContain('seexref:');
    });

    test('should handle MadCap:xref elements', async () => {
      const html = `
        <html>
          <body>
            <p>For details, see <MadCap:xref href="01-02-3 CreateActivityAddUnder.htm">Create New Activities Directly Under Existing Activities</MadCap:xref>.</p>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        resourcePath: '/test',
        outputPath: '/test',
        enableSnippets: false,
        enableTOC: false
      });

      expect(result.content).toContain('see xref:01-02-3 CreateActivityAddUnder.adoc[Create New Activities Directly Under Existing Activities]');
      expect(result.content).not.toContain('seexref:');
    });
  });

  describe('List Processing', () => {
    test('should handle nested ordered lists without duplication', async () => {
      const html = `
        <html>
          <body>
            <ol>
              <li>
                <p>Item 1</p>
                <ol style="list-style-type: lower-alpha;">
                  <li><p>Sub item a</p></li>
                  <li><p>Sub item b</p></li>
                </ol>
              </li>
              <li><p>Item 2</p></li>
            </ol>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        resourcePath: '/test',
        outputPath: '/test',
        enableSnippets: false,
        enableTOC: false
      });

      console.log('List test result:', result?.content);

      // Should not contain duplicate content
      const lines = result.content.split('\n');
      const subItemACount = lines.filter(line => line.includes('Sub item a')).length;
      const subItemBCount = lines.filter(line => line.includes('Sub item b')).length;
      
      expect(subItemACount).toBe(1);
      expect(subItemBCount).toBe(1);
      
      // Should have proper nesting markers
      expect(result.content).toContain('. Item 1');
      expect(result.content).toContain('.. Sub item a');
      expect(result.content).toContain('.. Sub item b');
      expect(result.content).toContain('. Item 2');
    });
  });

  describe('Integration Test', () => {
    test('should handle complex document with all fixes', async () => {
      const html = `
        <html>
          <body>
            <h1>Test Document</h1>
            <p>To perform this task, follow these steps:</p>
            <ol>
              <li>
                <p>First step</p>
                <ol style="list-style-type: lower-alpha;">
                  <li><p>Sub step a</p></li>
                  <li><p>Sub step b</p></li>
                </ol>
              </li>
              <li><p>Second step</p></li>
            </ol>
            <div class="note">
              <p><span class="noteInDiv">Note:</span>&#160;</p>
              <p>This is important information. For more details, see <a href="reference.htm">Reference Guide</a>.</p>
            </div>
          </body>
        </html>
      `;

      const result = await converter.convert(html, {
        resourcePath: '/test',
        outputPath: '/test',
        enableSnippets: false,
        enableTOC: false
      });

      console.log('Integration test result:', result?.content);

      // Check all fixes work together
      expect(result.content).toContain('= Test Document');
      expect(result.content).toContain('. First step');
      expect(result.content).toContain('.. Sub step a');
      expect(result.content).toContain('.. Sub step b');
      expect(result.content).toContain('. Second step');
      expect(result.content).toContain('NOTE: This is important information');
      expect(result.content).toContain('see xref:reference.adoc[Reference Guide]');
      
      // Check no duplicates
      const lines = result.content.split('\n');
      const subStepACount = lines.filter(line => line.includes('Sub step a')).length;
      expect(subStepACount).toBe(1);
      
      // Check no broken formatting
      expect(result.content).not.toContain('seexref:');
      expect(result.content).not.toContain('NOTE: Reference Guide');
    });
  });
});
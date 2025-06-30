import { describe, it, expect, beforeEach } from '@jest/globals';
import WritersideMarkdownConverter from '../src/converters/writerside-markdown-converter.js';

describe('WritersideMarkdownConverter - Options Testing', () => {
  let converter: WritersideMarkdownConverter;

  beforeEach(() => {
    converter = new WritersideMarkdownConverter();
  });

  describe('enableSemanticMarkup option', () => {
    const testHtml = `
      <div class="mc-note">
        <p><strong>Note:</strong> This is important information.</p>
      </div>
    `;

    it('should use semantic XML tags when enableSemanticMarkup is true', async () => {
      const result = await converter.convert(testHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableSemanticMarkup: true
        }
      });

      expect(result.content).toContain('<note>');
      expect(result.content).toContain('</note>');
      expect(result.content).toContain('**Note:** This is important information.');
    });

    it('should use regular blockquote admonitions when enableSemanticMarkup is false', async () => {
      const result = await converter.convert(testHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableSemanticMarkup: false
        }
      });

      expect(result.content).toContain('> **Note:**');
      expect(result.content).toContain('{style="note"}');
      expect(result.content).not.toContain('<note>');
    });

    it('should handle warning admonitions with semantic markup', async () => {
      const warningHtml = '<div class="mc-warning"><p><strong>Warning:</strong> Be careful!</p></div>';
      
      const result = await converter.convert(warningHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableSemanticMarkup: true
        }
      });

      expect(result.content).toContain('<warning>');
      expect(result.content).toContain('</warning>');
    });

    it('should handle tip admonitions with semantic markup', async () => {
      const tipHtml = '<div class="mc-tip"><p><strong>Tip:</strong> Pro tip!</p></div>';
      
      const result = await converter.convert(tipHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableSemanticMarkup: true
        }
      });

      expect(result.content).toContain('<tip>');
      expect(result.content).toContain('</tip>');
    });
  });

  describe('enableProcedureBlocks option', () => {
    const procedureHtml = `
      <div class="mc-procedure">
        <h3>Installation Steps</h3>
        <ol>
          <li>Download the installer</li>
          <li>Run the setup wizard</li>
          <li>Complete the configuration</li>
        </ol>
      </div>
    `;

    it('should create procedure blocks when enableProcedureBlocks is true', async () => {
      const result = await converter.convert(procedureHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableProcedureBlocks: true
        }
      });

      expect(result.content).toContain('<procedure title="Installation Steps"');
      expect(result.content).toContain('<step>Download the installer</step>');
      expect(result.content).toContain('<step>Run the setup wizard</step>');
      expect(result.content).toContain('<step>Complete the configuration</step>');
      expect(result.content).toContain('</procedure>');
    });

    it('should use regular lists when enableProcedureBlocks is false', async () => {
      const result = await converter.convert(procedureHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableProcedureBlocks: false
        }
      });

      expect(result.content).toContain('### Installation Steps');
      expect(result.content).toContain('1. Download the installer');
      expect(result.content).toContain('2. Run the setup wizard');
      expect(result.content).toContain('3. Complete the configuration');
      expect(result.content).not.toContain('<procedure>');
    });

    it('should handle procedures without title', async () => {
      const noTitleHtml = `
        <div class="mc-procedure">
          <ol>
            <li>First step</li>
            <li>Second step</li>
          </ol>
        </div>
      `;

      const result = await converter.convert(noTitleHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableProcedureBlocks: true
        }
      });

      expect(result.content).toContain('<procedure title="Procedure"');
      expect(result.content).toContain('<step>First step</step>');
    });

    it('should generate valid element IDs from titles', async () => {
      const specialTitleHtml = `
        <div class="mc-procedure">
          <h3>Complex Title with Special Characters! & Spaces</h3>
          <ol><li>Test step</li></ol>
        </div>
      `;

      const result = await converter.convert(specialTitleHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableProcedureBlocks: true
        }
      });

      expect(result.content).toMatch(/id="complex-title-with-special-characters-spaces"/);
    });
  });

  describe('enableCollapsibleBlocks option', () => {
    const collapsibleHtml = `
      <div class="mc-dropdown">
        <button class="mc-dropdown-head">Click to expand</button>
        <div class="mc-dropdown-body">
          <p>Hidden content that can be expanded</p>
          <p>More details here</p>
        </div>
      </div>
    `;

    it('should create collapsible blocks when enableCollapsibleBlocks is true', async () => {
      const result = await converter.convert(collapsibleHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableCollapsibleBlocks: true
        }
      });

      expect(result.content).toContain('<collapsible title="Click to expand">');
      expect(result.content).toContain('Hidden content that can be expanded');
      expect(result.content).toContain('More details here');
      expect(result.content).toContain('</collapsible>');
    });

    it('should use regular content when enableCollapsibleBlocks is false', async () => {
      const result = await converter.convert(collapsibleHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableCollapsibleBlocks: false
        }
      });

      expect(result.content).toContain('Click to expand');
      expect(result.content).toContain('Hidden content that can be expanded');
      expect(result.content).not.toContain('<collapsible>');
    });

    it('should handle collapsible with heading instead of button', async () => {
      const headingCollapsibleHtml = `
        <div class="mc-dropdown">
          <h4>Advanced Settings</h4>
          <div class="mc-dropdown-body">
            <p>Advanced configuration options</p>
          </div>
        </div>
      `;

      const result = await converter.convert(headingCollapsibleHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableCollapsibleBlocks: true
        }
      });

      expect(result.content).toContain('<collapsible title="Advanced Settings">');
      expect(result.content).toContain('Advanced configuration options');
    });
  });

  describe('enableTabs option', () => {
    const tabsHtml = `
      <div class="mc-tabs">
        <div class="mc-tab-head">
          <button class="mc-tab">Windows</button>
          <button class="mc-tab">macOS</button>
        </div>
        <div class="mc-tab-body">
          <div class="mc-tab-content">Windows-specific instructions</div>
          <div class="mc-tab-content">macOS-specific instructions</div>
        </div>
      </div>
    `;

    it('should create tab groups when enableTabs is true', async () => {
      const result = await converter.convert(tabsHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableTabs: true
        }
      });

      expect(result.content).toContain('<tabs>');
      expect(result.content).toContain('<tab title="Windows">');
      expect(result.content).toContain('<tab title="macOS">');
      expect(result.content).toContain('Windows-specific instructions');
      expect(result.content).toContain('macOS-specific instructions');
      expect(result.content).toContain('</tabs>');
    });

    it('should use sequential content when enableTabs is false', async () => {
      const result = await converter.convert(tabsHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableTabs: false
        }
      });

      expect(result.content).toContain('Windows macOS');
      expect(result.content).toContain('Windows-specific instructions');
      expect(result.content).toContain('macOS-specific instructions');
      expect(result.content).not.toContain('<tabs>');
    });

    it('should handle empty tabs gracefully', async () => {
      const emptyTabsHtml = '<div class="mc-tabs"><div class="mc-tab-head"></div></div>';

      const result = await converter.convert(emptyTabsHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableTabs: true
        }
      });

      expect(result.content.trim()).toContain('No tabs found');
    });
  });

  describe('mergeSnippets option', () => {
    const snippetHtml = `
      <div data-mc-snippet="common-warning.flsnp">
        <p>This content comes from a snippet file</p>
      </div>
    `;

    it('should create include directives when mergeSnippets is false', async () => {
      const result = await converter.convert(snippetHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          mergeSnippets: false
        }
      });

      expect(result.content).toContain('<include from="common-warning.md"');
      expect(result.content).toContain('element-id="common-warning-flsnp"');
    });

    it('should merge content inline when mergeSnippets is true (default)', async () => {
      const result = await converter.convert(snippetHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          mergeSnippets: true
        }
      });

      expect(result.content).toContain('This content comes from a snippet file');
      expect(result.content).not.toContain('<include');
    });

    it('should generate valid element IDs from snippet filenames', async () => {
      const complexSnippetHtml = '<div data-mc-snippet="Complex-File_Name.flsnp"><p>Content</p></div>';

      const result = await converter.convert(complexSnippetHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          mergeSnippets: false
        }
      });

      expect(result.content).toContain('<include from="Complex-File_Name.md"');
      expect(result.content).toMatch(/element-id="complex-file-name-flsnp"/);
    });
  });

  describe('Multiple options interaction', () => {
    const complexHtml = `
      <div class="mc-note">
        <p><strong>Note:</strong> Important information</p>
      </div>
      <div class="mc-procedure">
        <h3>Setup Process</h3>
        <ol>
          <li>Download software</li>
          <li>Install application</li>
        </ol>
      </div>
      <div data-mc-snippet="footer.flsnp">
        <p>Footer content</p>
      </div>
    `;

    it('should apply multiple enabled options correctly', async () => {
      const result = await converter.convert(complexHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableSemanticMarkup: true,
          enableProcedureBlocks: true,
          mergeSnippets: false
        }
      });

      // Should use semantic admonition
      expect(result.content).toContain('<note>');
      expect(result.content).toContain('</note>');

      // Should use procedure blocks
      expect(result.content).toContain('<procedure title="Setup Process"');
      expect(result.content).toContain('<step>Download software</step>');

      // Should use include directives
      expect(result.content).toContain('<include from="footer.md"');
    });

    it('should fall back to regular markdown when options are disabled', async () => {
      const result = await converter.convert(complexHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableSemanticMarkup: false,
          enableProcedureBlocks: false,
          mergeSnippets: true
        }
      });

      // Should use regular admonition
      expect(result.content).toContain('> **Note:**');
      expect(result.content).toContain('{style="note"}');

      // Should use regular list
      expect(result.content).toContain('1. Download software');
      expect(result.content).toContain('2. Install application');

      // Should merge snippet content
      expect(result.content).toContain('Footer content');
      expect(result.content).not.toContain('<include');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle missing writersideOptions gracefully', async () => {
      const html = '<div class="mc-note"><p>Test</p></div>';

      const result = await converter.convert(html, {
        format: 'writerside-markdown',
        inputType: 'html'
        // No writersideOptions provided
      });

      // Should use default behavior (regular admonitions)
      expect(result.content).toContain('> Test');
      expect(result.content).toContain('{style="note"}');
    });

    it('should handle empty elements gracefully', async () => {
      const emptyProcedureHtml = '<div class="mc-procedure"><h3>Empty Procedure</h3></div>';

      const result = await converter.convert(emptyProcedureHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableProcedureBlocks: true
        }
      });

      expect(result.content.trim()).toContain('<step>No steps found</step>');
    });

    it('should handle nested structures correctly', async () => {
      const nestedHtml = `
        <div class="mc-procedure">
          <h3>Complex Procedure</h3>
          <ol>
            <li>
              Step 1 with <strong>emphasis</strong>
              <div class="mc-note">
                <p>Note within step</p>
              </div>
            </li>
          </ol>
        </div>
      `;

      const result = await converter.convert(nestedHtml, {
        format: 'writerside-markdown',
        inputType: 'html',
        writersideOptions: {
          enableProcedureBlocks: true,
          enableSemanticMarkup: true
        }
      });

      expect(result.content).toContain('<procedure');
      expect(result.content).toContain('<step>');
      expect(result.content).toContain('**emphasis**');
    });
  });
});
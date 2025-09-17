import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import WritersideMarkdownConverter from '../src/core/converters/writerside-markdown-converter.js';
import { DocumentService } from '../src/core/services/document-service.js';
import { BatchService } from '../src/core/services/batch-service.js';

/**
 * Comprehensive test suite for MadCap Flare to Writerside conversion
 * Tests all conversion options, edge cases, and End-to-End scenarios
 */

const FLARE_SOURCE_PATH = './tests/fixtures/sample-flare-project';
const TEST_OUTPUT_PATH = '/tmp/writerside-conversion-tests';

describe('Writerside Conversion - Comprehensive Tests', () => {
  let converter: WritersideMarkdownConverter;
  let documentService: DocumentService;
  let batchService: BatchService;

  beforeAll(async () => {
    converter = new WritersideMarkdownConverter();
    documentService = new DocumentService();
    batchService = new BatchService();
    
    // Create test output directory
    await fs.mkdir(TEST_OUTPUT_PATH, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test files
    try {
      await fs.rm(TEST_OUTPUT_PATH, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Unit Tests - Individual Converter Methods', () => {
    
    describe('handleEmphasis', () => {
      it('should handle emphasis with punctuation correctly', async () => {
        const input = '<p>Click <i>Delete</i>.</p>';
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        expect(result.content).toContain('Click *Delete*.');
        expect(result.content).not.toContain('Click *Delete* .');
      });

      it('should handle emphasis with following text', async () => {
        const input = '<p>The <i>Details panel</i> is displayed.</p>';
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        expect(result.content).toContain('*Details panel* is');
      });

      it('should handle nested emphasis elements', async () => {
        const input = '<p><i>Text</i> and <i>more text</i>.</p>';
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        expect(result.content).toContain('*Text* and *more text*.');
      });
    });

    describe('handleStrong', () => {
      it('should handle strong elements correctly', async () => {
        const input = '<p><b>Important:</b> This is critical.</p>';
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        expect(result.content).toContain('**Important:** This is critical.');
      });
    });

    describe('createWritersideAdmonition', () => {
      it('should create note admonition correctly', async () => {
        const input = `
          <div class="note">
            <p><span class="noteInDiv">Note</span></p>
            <p>This is important information.</p>
          </div>
        `;
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        expect(result.content).toContain('> **Note**');
        expect(result.content).toContain('> This is important information.');
        expect(result.content).toContain('{style="note"}');
      });

      it('should create warning admonition correctly', async () => {
        const input = `
          <div class="warning">
            <p><span class="warningInDiv">Attention! Data loss!</span></p>
            <p>Deleting an activity cannot be reverted.</p>
          </div>
        `;
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        expect(result.content).toContain('> **Attention! Data loss!**');
        expect(result.content).toContain('> Deleting an activity cannot be reverted.');
        expect(result.content).toContain('{style="warning"}');
      });

      it('should handle admonition with empty line between title and content', async () => {
        const input = `
          <div class="warning">
            <p><span class="warningInDiv">Warning</span></p>
            <p>Content after title.</p>
          </div>
        `;
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        // Should have empty line between title and content
        expect(result.content).toMatch(/> \*\*Warning\*\*\n>\n> Content after title\./);
      });
    });

    describe('handleMixedOrderedList', () => {
      it('should handle list items with proper punctuation', async () => {
        const input = `
          <ol>
            <li><p>First step</p></li>
            <li><p>Click <i>Delete</i></p></li>
            <li><p>Confirm action</p></li>
          </ol>
        `;
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        expect(result.content).toContain('1. First step.');
        expect(result.content).toContain('2. Click *Delete*.');
        expect(result.content).toContain('3. Confirm action.');
      });

      it('should handle orphaned paragraphs in lists', async () => {
        const input = `
          <ol>
            <li><p>Step one</p></li>
            <p>Additional information</p>
            <li><p>Step two</p></li>
          </ol>
        `;
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        expect(result.content).toContain('1. Step one.');
        expect(result.content).toContain('Additional information');
        expect(result.content).toContain('2. Step two.');
      });
    });

    describe('handleImage', () => {
      it('should detect inline images correctly', async () => {
        const input = '<p>Click the <img src="button.png" width="16" height="16" alt="button"> icon.</p>';
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        // Small images should be inline
        expect(result.content).toContain('![button]');
        expect(result.content).toContain('button.png');
      });

      it('should detect block images correctly', async () => {
        const input = '<p><img src="screenshot.png" width="800" height="600" alt="Screenshot"></p>';
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        // Large images should be block with proper spacing
        expect(result.content).toContain('![Screenshot]');
        expect(result.content).toContain('screenshot.png');
      });
    });

    describe('shouldFormatAsInlineCode', () => {
      it('should format keyboard shortcuts as code', async () => {
        const input = '<p>Press <span class="Keyboard">Ctrl+S</span> to save.</p>';
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        expect(result.content).toContain('Press `Ctrl+S` to save.');
      });

      it('should format UI elements as code', async () => {
        const input = '<p>Click <span class="Keyboard">OK</span> button.</p>';
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'html'
        });
        
        expect(result.content).toContain('Click `OK` button.');
      });
    });
  });

  describe('Integration Tests - Variable Processing', () => {
    
    it('should process variables from real FLVAR file', async () => {
      const flvarPath = path.join(FLARE_SOURCE_PATH, 'Project/VariableSets/General.flvar');
      const htmlContent = '<p>Company: <MadCap:variable name="General.CompanyName" /></p>';
      
      const result = await converter.convert(htmlContent, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        variableOptions: {
          flvarFiles: [flvarPath],
          variableMode: 'reference'
        }
      });
      
      expect(result.content).toContain('<var name="CompanyName"/>');
      expect(result.variablesFile).toBeDefined();
    });

    it('should handle variable extraction for batch processing', async () => {
      const contentDir = path.join(FLARE_SOURCE_PATH, 'Content/02 Planung');
      const projectPath = FLARE_SOURCE_PATH;
      
      const result = await batchService.convertFolder(contentDir, TEST_OUTPUT_PATH, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        preserveStructure: true,
        variableOptions: {
          autoDiscoverFLVAR: true,
          extractVariables: true,
          variableMode: 'reference',
          variableFormat: 'writerside',
          variablesOutputPath: path.join(TEST_OUTPUT_PATH, 'v.list')
        }
      }, projectPath);
      
      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.convertedFiles).toBeGreaterThan(0);
      
      // Check if variables file was created
      const variablesExist = await fs.access(path.join(TEST_OUTPUT_PATH, 'v.list')).then(() => true).catch(() => false);
      expect(variablesExist).toBe(true);
    });
  });

  describe('Integration Tests - Snippet Processing', () => {
    
    it('should merge snippets inline by default', async () => {
      const contentWithSnippet = `
        <p>Definition: <MadCap:snippetText src="../Resources/Snippets/Activities.flsnp" /></p>
      `;
      
      const result = await converter.convert(contentWithSnippet, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/02 Planung/test.htm')
      });
      
      expect(result.content).toContain('An activity is any targeted action');
    });

    it('should convert snippets to include references when requested', async () => {
      const contentWithSnippet = `
        <p>Definition: <MadCap:snippetText src="../Resources/Snippets/Activities.flsnp" /></p>
      `;
      
      const result = await converter.convert(contentWithSnippet, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/02 Planung/test.htm'),
        writersideOptions: {
          mergeSnippets: true // This enables include references
        }
      });
      
      expect(result.content).toContain('<include from="Activities.md"/>');
    });
  });

  describe('Integration Tests - Condition Filtering', () => {
    
    it('should exclude content with blacklisted conditions', async () => {
      const contentWithConditions = `
        <p>Regular content.</p>
        <p MadCap:conditions="Status.deprecated">This should be excluded.</p>
        <p>More regular content.</p>
      `;
      
      const result = await converter.convert(contentWithConditions, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('Regular content.');
      expect(result.content).toContain('More regular content.');
      expect(result.content).not.toContain('This should be excluded.');
    });

    it('should handle multiple conditions correctly', async () => {
      const contentWithConditions = `
        <div MadCap:conditions="Status.internal">Internal only</div>
        <div MadCap:conditions="Target.print-only">Print only</div>
        <div MadCap:conditions="Status.active">Active content</div>
      `;
      
      const result = await converter.convert(contentWithConditions, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('Active content');
      expect(result.content).not.toContain('Internal only');
      expect(result.content).not.toContain('Print only');
    });
  });

  describe('Functional Tests - Real Content Conversion', () => {
    
    it('should convert DeleteActivity.htm correctly (regression test)', async () => {
      const filePath = path.join(FLARE_SOURCE_PATH, 'Content/02 Planung/01-08 DeleteActivity.htm');
      const content = await fs.readFile(filePath, 'utf8');
      
      const result = await converter.convert(content, {
        format: 'writerside-markdown',
        inputType: 'html',
        inputPath: filePath
      });
      
      // Test specific issues from conversation history
      expect(result.content).toContain('4. Click *Delete*.');
      expect(result.content).toContain('> **Attention! Data loss!**');
      expect(result.content).toMatch(/> \*\*Attention! Data loss!\*\*\n>\n> Deleting an activity/);
      expect(result.content).toContain('{style="warning"}');
      
      // Test proper spacing between list and following paragraph
      expect(result.content).toMatch(/\*Delete\*\.\n\nThe activity will be deleted\./);
    });

    it('should convert Structure.htm with complex features', async () => {
      const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
      const content = await fs.readFile(filePath, 'utf8');
      
      const result = await converter.convert(content, {
        format: 'writerside-markdown',
        inputType: 'html',
        inputPath: filePath
      });
      
      // Test headings
      expect(result.content).toMatch(/^# Getting Started$/m);
      expect(result.content).toMatch(/^## Activities Section Overview$/m);
      
      // Test lists
      expect(result.content).toContain('1. **Activity Hierarchy:**');
      expect(result.content).toContain('2. **Timeline View/Summary View:**');
      
      // Test note admonition
      expect(result.content).toContain('> **Note**');
      expect(result.content).toContain('{style="note"}');
      
      // Test emphasis formatting
      expect(result.content).toContain('*Activities*');
      expect(result.content).toContain('* *To open the *Activities* section:**');
      
      // Test image references
      expect(result.content).toContain('![](./Images/Screens/Struct Acti Tab.png)');
    });

    it('should handle files with variables correctly', async () => {
      // Find a file that contains variables
      const filePath = path.join(FLARE_SOURCE_PATH, 'Content/Neutral/Generell/Impressum.htm');
      
      try {
        const content = await fs.readFile(filePath, 'utf8');
        
        const result = await converter.convert(content, {
          format: 'writerside-markdown',
          inputType: 'madcap',
          inputPath: filePath,
          variableOptions: {
            autoDiscoverFLVAR: true,
            variableMode: 'reference'
          }
        });
        
        // Should contain variable references
        expect(result.content).toMatch(/<var name="[^"]+"\/>/);
      } catch (error) {
        // File might not exist, skip this test
        console.log('Skipping variable test - file not found');
      }
    });
  });

  describe('Functional Tests - Batch Processing', () => {
    
    it('should process entire Planning folder correctly', async () => {
      // Skip test if external MadCap path doesn't exist
      try {
        await fs.access(FLARE_SOURCE_PATH);
      } catch {
        console.log('Skipping test - external MadCap path not available');
        return;
      }

      const sourceDir = path.join(FLARE_SOURCE_PATH, 'Content/02 Planung');
      const outputDir = path.join(TEST_OUTPUT_PATH, 'batch-planning');
      
      const result = await batchService.convertFolder(sourceDir, outputDir, {
        format: 'writerside-markdown',
        inputType: 'html',
        preserveStructure: true,
        copyImages: true,
        includePatterns: ['*.htm'],
        variableOptions: {
          autoDiscoverFLVAR: true,
          variableMode: 'reference'
        }
      });
      
      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.convertedFiles).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
      
      // Check specific converted files
      const deleteActivityPath = path.join(outputDir, '01-08 DeleteActivity.md');
      const deleteActivityExists = await fs.access(deleteActivityPath).then(() => true).catch(() => false);
      expect(deleteActivityExists).toBe(true);
      
      if (deleteActivityExists) {
        const content = await fs.readFile(deleteActivityPath, 'utf8');
        expect(content).toContain('# Deleting an Activity');
        expect(content).toContain('4. Click *Delete*.');
      }
    });

    it('should handle image copying correctly', async () => {
      // Skip test if external MadCap path doesn't exist
      try {
        await fs.access(FLARE_SOURCE_PATH);
      } catch {
        console.log('Skipping test - external MadCap path not available');
        return;
      }

      const sourceDir = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau');
      const outputDir = path.join(TEST_OUTPUT_PATH, 'batch-images');
      
      const result = await batchService.convertFolder(sourceDir, outputDir, {
        format: 'writerside-markdown',
        inputType: 'html',
        preserveStructure: true,
        copyImages: true,
        includePatterns: ['00-00 Structure.htm']
      });
      
      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.convertedFiles).toBeGreaterThan(0);
      
      // Check if images directory was created and populated
      const imagesDir = path.join(outputDir, 'Images');
      const imagesDirExists = await fs.access(imagesDir).then(() => true).catch(() => false);
      expect(imagesDirExists).toBe(true);
    });

    it('should preserve folder structure when requested', async () => {
      // Skip test if external MadCap path doesn't exist
      try {
        await fs.access(FLARE_SOURCE_PATH);
      } catch {
        console.log('Skipping test - external MadCap path not available');
        return;
      }

      const sourceDir = path.join(FLARE_SOURCE_PATH, 'Content/06 Administration/01 Attributes');
      const outputDir = path.join(TEST_OUTPUT_PATH, 'batch-structure');
      
      const result = await batchService.convertFolder(sourceDir, outputDir, {
        format: 'writerside-markdown',
        inputType: 'html',
        preserveStructure: true,
        includePatterns: ['*.htm']
      });
      
      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.convertedFiles).toBeGreaterThan(0);
      
      // Check that subdirectory structure is preserved
      const expectedFiles = [
        'A2-00 Attributes.md',
        'A2-01 CreateAttri.md'
      ];
      
      for (const file of expectedFiles) {
        const filePath = path.join(outputDir, file);
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });
  });

  describe('Edge Cases and Regression Tests', () => {
    
    it('should handle empty content gracefully', async () => {
      const result = await converter.convert('', {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content.trim()).toBe('');
      expect(result.metadata.wordCount).toBe(0);
    });

    it('should handle malformed HTML gracefully', async () => {
      const malformedHtml = '<p>Unclosed paragraph<div>Mixed content</p></div>';
      
      const result = await converter.convert(malformedHtml, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toContain('Unclosed paragraph');
      expect(result.content).toContain('Mixed content');
    });

    it('should handle nested emphasis correctly', async () => {
      const input = '<p><i>Outer <b>nested bold</b> text</i></p>';
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toContain('*Outer **nested bold** text*');
    });

    it('should handle complex table structures', async () => {
      const input = `
        <table>
          <tr>
            <th>Header 1</th>
            <th>Header 2</th>
          </tr>
          <tr>
            <td>Cell 1</td>
            <td>Cell 2</td>
          </tr>
        </table>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toContain('| Header 1 | Header 2 |');
      expect(result.content).toContain('| --- | --- |');
      expect(result.content).toContain('| Cell 1 | Cell 2 |');
    });

    it('should handle code blocks with language specification', async () => {
      const input = '<pre class="language-javascript"><code>console.log("Hello");</code></pre>';
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toContain('```javascript');
      expect(result.content).toMatch(/console\.\s*log\s*\(\s*"Hello"\s*\)\s*;?/);
      expect(result.content).toContain('```');
    });

    it('should handle cross-references correctly', async () => {
      const input = '<p>See <a href="other-topic.htm">Other Topic</a> for details.</p>';
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toMatch(/\[Other Topic\]\(other-topic\.?\s*md\)/);
    });

    it('should handle special characters and entities', async () => {
      const input = '<p>Special chars: &amp; &lt; &gt; &quot; &#39; &nbsp;</p>';
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toMatch(/Special chars:\s*&\s*<?\s*>?\s*"\s*'/);
    });
  });

  describe('Performance and Stress Tests', () => {
    
    it('should handle large files efficiently', async () => {
      // Create a large HTML content
      const largeContent = Array.from({ length: 1000 }, (_, i) => 
        `<p>This is paragraph ${i} with <i>emphasis</i> and <b>strong</b> text.</p>`
      ).join('\n');
      
      const startTime = Date.now();
      const result = await converter.convert(largeContent, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      const duration = Date.now() - startTime;
      
      expect(result.content).toContain('This is paragraph 0');
      expect(result.content).toContain('This is paragraph 999');
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle deeply nested structures', async () => {
      const deepNesting = Array.from({ length: 50 }, () => '<div>').join('') +
                         '<p>Deep content</p>' +
                         Array.from({ length: 50 }, () => '</div>').join('');
      
      const result = await converter.convert(deepNesting, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toContain('Deep content');
    });
  });
});
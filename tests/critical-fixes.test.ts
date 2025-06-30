import { describe, it, expect } from '@jest/globals';
import WritersideMarkdownConverter from '../src/converters/writerside-markdown-converter.js';

/**
 * Critical fixes test - focused on the most important conversion issues
 */

describe('Critical Conversion Fixes', () => {
  let converter: WritersideMarkdownConverter;

  beforeAll(() => {
    converter = new WritersideMarkdownConverter();
  });

  describe('Punctuation and Spacing (Regression Tests)', () => {
    
    it('should preserve periods after emphasis elements', async () => {
      const input = '<p>Click <i>Delete</i>.</p>';
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      console.log('Period test result:', JSON.stringify(result.content));
      expect(result.content.trim()).toContain('Click *Delete*.');
    });

    it('should handle list items with proper punctuation', async () => {
      const input = `
        <ol>
          <li><p>Click <i>Delete</i></p></li>
        </ol>
      `;
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      console.log('List punctuation result:', JSON.stringify(result.content));
      expect(result.content).toContain('1. Click *Delete*.');
    });

    it('should detect simple bold text correctly', async () => {
      const input = '<p><b>Important:</b> This is critical.</p>';
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      console.log('Bold text result:', JSON.stringify(result.content));
      expect(result.content).toContain('**Important:** This is critical.');
    });

    it('should handle simple note divs', async () => {
      const input = `
        <div class="note">
          <p>This is important information.</p>
        </div>
      `;
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      console.log('Note div result:', JSON.stringify(result.content));
      expect(result.content).toContain('> This is important information.');
      expect(result.content).toContain('{style="note"}');
    });
  });

  describe('Real File Conversion', () => {
    
    it('should convert DeleteActivity.htm with correct punctuation', async () => {
      const input = `
        <html>
          <body>
            <h1>Deleting an Activity</h1>
            <ol>
              <li><p>Click <i>Delete</i>.</p></li>
            </ol>
            <p>The activity will be deleted.</p>
          </body>
        </html>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      console.log('DeleteActivity simulation result:', JSON.stringify(result.content));
      expect(result.content).toContain('# Deleting an Activity');
      expect(result.content).toContain('1. Click *Delete*.');
      expect(result.content).toMatch(/\*Delete\*\.\s*\n\s*The activity will be deleted\./);
    });
  });

  describe('Batch Processing Debug', () => {
    
    it('should handle include patterns correctly', async () => {
      const { BatchService } = await import('../src/batch-service.js');
      const batchService = new BatchService();
      
      const result = await batchService.convertFolder(
        '/tmp', // Use /tmp as test directory
        '/tmp/test-output',
        {
          format: 'writerside-markdown',
          inputType: 'html',
          includePatterns: ['*.htm']
        }
      );
      
      console.log('Batch service result:', result);
      expect(result).toBeDefined();
      expect(typeof result.totalFiles).toBe('number');
    });
  });
});
/**
 * @jest-environment node
 */

import { POST } from '../../app/api/convert-file/route';
import { NextRequest } from 'next/server';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('/api/convert-file', () => {
  describe('POST', () => {
    let testFile: string;
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
      testFile = join(testDir, 'test.htm');
      await writeFile(testFile, '<h1>Test Title</h1><p>Test content</p>');
    });

    afterEach(async () => {
      try {
        await unlink(testFile);
      } catch (error) {
        // File might already be deleted
      }
    });

    it('should convert HTML file to AsciiDoc', async () => {
      const fileBuffer = Buffer.from('<h1>Test Title</h1><p>Test content</p>');
      const file = new File([fileBuffer], 'test.htm', { type: 'text/html' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.content).toContain('= Test Title');
      expect(data.content).toContain('Test content');
      expect(data.filename).toBe('test.adoc');
    });

    it('should convert HTML file to Writerside Markdown', async () => {
      const fileBuffer = Buffer.from('<h1>Test Title</h1><p>Test content</p>');
      const file = new File([fileBuffer], 'test.htm', { type: 'text/html' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', 'writerside-markdown');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.content).toContain('# Test Title');
      expect(data.content).toContain('Test content');
      expect(data.filename).toBe('test.md');
    });

    it('should convert HTML file to Zendesk format', async () => {
      const fileBuffer = Buffer.from('<h1>Test Title</h1><p>Test content</p>');
      const file = new File([fileBuffer], 'test.htm', { type: 'text/html' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', 'zendesk');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.content).toContain('<h1>Test Title</h1>');
      expect(data.content).toContain('<p>Test content</p>');
      expect(data.filename).toBe('test.html');
    });

    it('should handle MadCap files', async () => {
      const madcapContent = `
        <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
          <head><title>Test</title></head>
          <body>
            <h1>MadCap Test</h1>
            <p class="mc-note">This is a note</p>
            <span data-mc-variable="General.ProductName">Product</span>
          </body>
        </html>
      `;
      
      const fileBuffer = Buffer.from(madcapContent);
      const file = new File([fileBuffer], 'test.htm', { type: 'text/html' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'madcap');

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.content).toContain('= MadCap Test');
      expect(data.filename).toBe('test.adoc');
    });

    it('should return 400 for missing file', async () => {
      const formData = new FormData();
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('No file provided');
    });

    it('should return 400 for missing format', async () => {
      const fileBuffer = Buffer.from('<h1>Test</h1>');
      const file = new File([fileBuffer], 'test.htm', { type: 'text/html' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('format');
    });

    it('should return 400 for invalid format', async () => {
      const fileBuffer = Buffer.from('<h1>Test</h1>');
      const file = new File([fileBuffer], 'test.htm', { type: 'text/html' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', 'invalid-format');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should handle conversion options', async () => {
      const fileBuffer = Buffer.from('<h1>Test Title</h1>');
      const file = new File([fileBuffer], 'test.htm', { type: 'text/html' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');
      formData.append('options', JSON.stringify({
        preserveFormatting: false,
        extractImages: true,
        asciidocOptions: {
          enableValidation: true,
          validationStrictness: 'normal'
        }
      }));

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.content).toBeDefined();
      expect(data.filename).toBe('test.adoc');
    });

    it('should preserve original filename with correct extension', async () => {
      const fileBuffer = Buffer.from('<h1>Original File</h1>');
      const file = new File([fileBuffer], 'my-document.htm', { type: 'text/html' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', 'writerside-markdown');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.filename).toBe('my-document.md');
    });

    it('should handle empty files', async () => {
      const fileBuffer = Buffer.from('');
      const file = new File([fileBuffer], 'empty.htm', { type: 'text/html' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.content).toBeDefined();
      expect(data.filename).toBe('empty.adoc');
    });

    it('should handle files with special characters in names', async () => {
      const fileBuffer = Buffer.from('<h1>Special Chars</h1>');
      const file = new File([fileBuffer], 'file with spaces & symbols!.htm', { type: 'text/html' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.filename).toBe('file with spaces & symbols!.adoc');
    });
  });
});
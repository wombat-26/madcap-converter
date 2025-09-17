/**
 * @jest-environment node
 */

import { POST } from '../../app/api/batch-convert/route';
import { NextRequest } from 'next/server';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('/api/batch-convert', () => {
  describe('POST', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `batch-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await rm(testDir, { recursive: true });
      } catch (error) {
        // Directory might already be removed
      }
    });

    it('should convert multiple HTML files to AsciiDoc', async () => {
      const files = [
        new File([Buffer.from('<h1>File 1</h1><p>Content 1</p>')], 'file1.htm', { type: 'text/html' }),
        new File([Buffer.from('<h1>File 2</h1><p>Content 2</p>')], 'file2.htm', { type: 'text/html' })
      ];

      // Mock webkitRelativePath for folder structure simulation
      (files[0] as any).webkitRelativePath = 'project/file1.htm';
      (files[1] as any).webkitRelativePath = 'project/file2.htm';

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');
      formData.append('preserveStructure', 'true');
      formData.append('renameFiles', 'false');
      formData.append('outputFolderName', 'converted-project');

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/zip');
      expect(response.headers.get('content-disposition')).toContain('converted-project.zip');
    });

    it('should convert multiple files to Writerside Markdown', async () => {
      const files = [
        new File([Buffer.from('<h1>Guide 1</h1><p>Step 1</p>')], 'guide1.htm', { type: 'text/html' }),
        new File([Buffer.from('<h1>Guide 2</h1><p>Step 2</p>')], 'guide2.htm', { type: 'text/html' })
      ];

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('format', 'writerside-markdown');
      formData.append('inputType', 'html');
      formData.append('preserveStructure', 'false');
      formData.append('renameFiles', 'true');

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/zip');
    });

    it('should handle MadCap project files', async () => {
      const madcapFiles = [
        new File([Buffer.from(`
          <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
            <head><title>Overview</title></head>
            <body>
              <h1>Project Overview</h1>
              <p class="mc-note">Important note</p>
            </body>
          </html>
        `)], 'overview.htm', { type: 'text/html' }),
        new File([Buffer.from(`
          <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
            <head><title>Getting Started</title></head>
            <body>
              <h1>Getting Started</h1>
              <span data-mc-variable="General.ProductName">Product</span>
            </body>
          </html>
        `)], 'getting-started.htm', { type: 'text/html' })
      ];

      // Simulate folder structure
      (madcapFiles[0] as any).webkitRelativePath = 'madcap-project/Content/overview.htm';
      (madcapFiles[1] as any).webkitRelativePath = 'madcap-project/Content/getting-started.htm';

      const formData = new FormData();
      madcapFiles.forEach(file => formData.append('files', file));
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'madcap');
      formData.append('preserveStructure', 'true');
      formData.append('renameFiles', 'false');
      formData.append('outputFolderName', 'converted-madcap');

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toContain('converted-madcap.zip');
    });

    it('should return 400 for no files provided', async () => {
      const formData = new FormData();
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('No files provided');
    });

    it('should return 400 for missing format', async () => {
      const files = [
        new File([Buffer.from('<h1>Test</h1>')], 'test.htm', { type: 'text/html' })
      ];

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
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
      const files = [
        new File([Buffer.from('<h1>Test</h1>')], 'test.htm', { type: 'text/html' })
      ];

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('format', 'invalid-format');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should handle mixed file types in batch', async () => {
      const files = [
        new File([Buffer.from('<h1>HTML File</h1>')], 'html-file.htm', { type: 'text/html' }),
        new File([Buffer.from('<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd"><body><h1>MadCap File</h1></body></html>')], 'madcap-file.htm', { type: 'text/html' })
      ];

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html'); // Should auto-detect MadCap

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should handle conversion options in batch mode', async () => {
      const files = [
        new File([Buffer.from('<h1>Test File</h1><p>Content</p>')], 'test.htm', { type: 'text/html' })
      ];

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');
      formData.append('options', JSON.stringify({
        preserveFormatting: true,
        asciidocOptions: {
          enableValidation: true,
          validationStrictness: 'normal'
        }
      }));

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/zip');
    });

    it('should handle file renaming in batch mode', async () => {
      const files = [
        new File([Buffer.from('<h1>Document 1</h1>')], 'doc1.htm', { type: 'text/html' }),
        new File([Buffer.from('<h1>Document 2</h1>')], 'doc2.htm', { type: 'text/html' })
      ];

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('format', 'writerside-markdown');
      formData.append('inputType', 'html');
      formData.append('renameFiles', 'true');
      formData.append('fileNamePattern', '{originalName}-converted');

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should preserve folder structure when requested', async () => {
      const files = [
        new File([Buffer.from('<h1>Root File</h1>')], 'root.htm', { type: 'text/html' }),
        new File([Buffer.from('<h1>Sub File</h1>')], 'sub.htm', { type: 'text/html' })
      ];

      // Simulate folder structure with webkitRelativePath
      (files[0] as any).webkitRelativePath = 'project/root.htm';
      (files[1] as any).webkitRelativePath = 'project/subfolder/sub.htm';

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');
      formData.append('preserveStructure', 'true');

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should flatten structure when preserveStructure is false', async () => {
      const files = [
        new File([Buffer.from('<h1>File 1</h1>')], 'file1.htm', { type: 'text/html' }),
        new File([Buffer.from('<h1>File 2</h1>')], 'file2.htm', { type: 'text/html' })
      ];

      // Simulate nested folder structure
      (files[0] as any).webkitRelativePath = 'project/deep/nested/file1.htm';
      (files[1] as any).webkitRelativePath = 'project/another/path/file2.htm';

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');
      formData.append('preserveStructure', 'false');

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should handle large batch conversions', async () => {
      const files = Array.from({ length: 10 }, (_, i) => 
        new File([Buffer.from(`<h1>Document ${i + 1}</h1><p>Content for document ${i + 1}</p>`)], `doc${i + 1}.htm`, { type: 'text/html' })
      );

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('format', 'asciidoc');
      formData.append('inputType', 'html');

      const request = new NextRequest('http://localhost:3000/api/batch-convert', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/zip');
    });
  });
});
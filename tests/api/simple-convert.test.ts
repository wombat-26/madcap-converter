/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock the conversion services to avoid ESM import issues
jest.mock('../../src/core/simple-document-service', () => ({
  SimpleDocumentService: jest.fn().mockImplementation(() => ({
    convertString: jest.fn().mockResolvedValue({
      content: '= Test Title\n\nTest content',
      metadata: { format: 'asciidoc' }
    }),
    convertFile: jest.fn().mockResolvedValue({
      content: '= Test Title\n\nTest content',
      metadata: { format: 'asciidoc' }
    })
  }))
}));

jest.mock('../../src/core/simple-batch-service', () => ({
  SimpleBatchService: jest.fn().mockImplementation(() => ({
    convertFiles: jest.fn().mockResolvedValue({
      zipBuffer: Buffer.from('mock zip content'),
      processedFiles: 2,
      errors: []
    })
  }))
}));

describe('API Routes Integration Tests', () => {
  describe('Convert Text API', () => {
    it('should handle text conversion request', async () => {
      // Import after mocking
      const { POST } = await import('../../app/api/convert/route');
      
      const requestData = {
        content: '<h1>Test Title</h1><p>Test content</p>',
        inputType: 'html',
        format: 'asciidoc',
        options: {
          preserveFormatting: true
        }
      };

      const request = new NextRequest('http://localhost:3000/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.content).toContain('= Test Title');
    });

    it('should return 400 for invalid input', async () => {
      const { POST } = await import('../../app/api/convert/route');
      
      const requestData = {
        content: '',
        inputType: 'invalid',
        format: 'asciidoc'
      };

      const request = new NextRequest('http://localhost:3000/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });

  describe('Convert File API', () => {
    it('should handle file conversion request', async () => {
      const { POST } = await import('../../app/api/convert-file/route');
      
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
      expect(data.filename).toBe('test.adoc');
    });

    it('should return 400 for missing file', async () => {
      const { POST } = await import('../../app/api/convert-file/route');
      
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
  });

  describe('Batch Convert API', () => {
    it('should handle batch conversion request', async () => {
      const { POST } = await import('../../app/api/batch-convert/route');
      
      const files = [
        new File([Buffer.from('<h1>File 1</h1><p>Content 1</p>')], 'file1.htm', { type: 'text/html' }),
        new File([Buffer.from('<h1>File 2</h1><p>Content 2</p>')], 'file2.htm', { type: 'text/html' })
      ];

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
    });

    it('should return 400 for no files provided', async () => {
      const { POST } = await import('../../app/api/batch-convert/route');
      
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
  });
});
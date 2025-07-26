/**
 * @jest-environment node
 */

import { POST } from '../../app/api/convert/route';
import { NextRequest } from 'next/server';

describe('/api/convert', () => {
  describe('POST', () => {
    it('should convert simple HTML to AsciiDoc', async () => {
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
      expect(data.content).toContain('Test content');
    });

    it('should convert HTML to Writerside Markdown', async () => {
      const requestData = {
        content: '<h1>Test Title</h1><p>Test content</p>',
        inputType: 'html',
        format: 'writerside-markdown',
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
      expect(data.content).toContain('# Test Title');
      expect(data.content).toContain('Test content');
    });

    it('should return 400 for invalid input', async () => {
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

    it('should return 400 for missing required fields', async () => {
      const requestData = {
        content: '<h1>Test</h1>'
        // Missing inputType and format
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
      expect(data.error).toContain('Invalid request data');
    });

    it('should handle conversion options correctly', async () => {
      const requestData = {
        content: '<h1>Test Title</h1>',
        inputType: 'html',
        format: 'asciidoc',
        options: {
          preserveFormatting: false,
          extractImages: true,
          asciidocOptions: {
            enableValidation: true,
            validationStrictness: 'strict'
          }
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
      expect(data.content).toBeDefined();
    });

    it('should return error for invalid JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      const response = await POST(request);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should handle MadCap content', async () => {
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

      const requestData = {
        content: madcapContent,
        inputType: 'madcap',
        format: 'asciidoc',
        options: {
          variableOptions: {
            extractVariables: true,
            variableMode: 'flatten'
          }
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
      expect(data.content).toContain('= MadCap Test');
    });
  });
});
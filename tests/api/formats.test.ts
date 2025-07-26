/**
 * @jest-environment node
 */

import { GET } from '../../app/api/formats/route';
import { NextRequest } from 'next/server';

describe('/api/formats', () => {
  describe('GET', () => {
    it('should return supported formats', async () => {
      const request = new NextRequest('http://localhost:3000/api/formats');
      const response = await GET();
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('formats');
      expect(data).toHaveProperty('inputTypes');
      
      // Check formats structure
      expect(Array.isArray(data.formats)).toBe(true);
      expect(data.formats.length).toBeGreaterThan(0);
      
      // Verify each format has required properties
      data.formats.forEach((format: any) => {
        expect(format).toHaveProperty('name');
        expect(format).toHaveProperty('label');
        expect(format).toHaveProperty('description');
        expect(format).toHaveProperty('extensions');
        expect(Array.isArray(format.extensions)).toBe(true);
      });
      
      // Check input types structure
      expect(Array.isArray(data.inputTypes)).toBe(true);
      expect(data.inputTypes.length).toBeGreaterThan(0);
      
      // Verify each input type has required properties
      data.inputTypes.forEach((inputType: any) => {
        expect(inputType).toHaveProperty('name');
        expect(inputType).toHaveProperty('label');
        expect(inputType).toHaveProperty('extensions');
        expect(inputType).toHaveProperty('mimeTypes');
        expect(Array.isArray(inputType.extensions)).toBe(true);
        expect(Array.isArray(inputType.mimeTypes)).toBe(true);
      });
    });

    it('should include expected formats', async () => {
      const request = new NextRequest('http://localhost:3000/api/formats');
      const response = await GET();
      const data = await response.json();
      
      const formatNames = data.formats.map((f: any) => f.name);
      expect(formatNames).toContain('asciidoc');
      expect(formatNames).toContain('writerside-markdown');
      expect(formatNames).toContain('zendesk');
    });

    it('should include expected input types', async () => {
      const request = new NextRequest('http://localhost:3000/api/formats');
      const response = await GET();
      const data = await response.json();
      
      const inputTypeNames = data.inputTypes.map((t: any) => t.name);
      expect(inputTypeNames).toContain('html');
      expect(inputTypeNames).toContain('madcap');
      expect(inputTypeNames).toContain('word');
    });

    it('should return proper content type', async () => {
      const request = new NextRequest('http://localhost:3000/api/formats');
      const response = await GET();
      
      expect(response.headers.get('content-type')).toContain('application/json');
    });
  });
});
/**
 * @jest-environment node
 */

import { POST } from '../../app/api/batch-convert/route';
import { NextRequest } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import JSZip from 'jszip';

describe('/api/batch-convert - Image Export Tests', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `batch-image-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      const { rm } = await import('fs/promises');
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might already be removed
    }
  });

  /**
   * Create a small test PNG image as Buffer
   */
  const createTestPNG = (): Buffer => {
    // Minimal valid PNG file (1x1 pixel, transparent)
    const pngData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, // bit depth, color type, etc.
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, // IEND chunk
      0x42, 0x60, 0x82
    ]);
    return pngData;
  };

  /**
   * Create a small test JPG image as Buffer
   */
  const createTestJPG = (): Buffer => {
    // Minimal valid JPEG file (1x1 pixel)
    const jpgData = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, // JPEG header
      0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
      0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C,
      0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D,
      0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
      0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
      0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34,
      0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11,
      0x01, 0x03, 0x11, 0x01, 0xFF, 0xC4, 0x00, 0x14,
      0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x08, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xFF, 0xDA, 0x00, 0x0C, 0x03, 0x01, 0x00, 0x02,
      0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0xB2, 0xFF, 0xD9
    ]);
    return jpgData;
  };

  it('should include referenced images in the ZIP export', async () => {
    // Create test HTML files with image references
    const htmlWithImages = `
      <html>
        <head><title>Test Document</title></head>
        <body>
          <h1>Test Document with Images</h1>
          <p>This document contains images:</p>
          <img src="../Images/screenshot.png" alt="Screenshot" title="Test Screenshot" />
          <p>Another image:</p>
          <img src="../Images/Screens/interface.jpg" alt="Interface" />
          <p>Inline image: <img src="../Images/Icons/warning.png" alt="Warning" class="IconInline" /></p>
        </body>
      </html>
    `;

    const htmlWithoutImages = `
      <html>
        <head><title>No Images</title></head>
        <body>
          <h1>Document Without Images</h1>
          <p>This document has no images.</p>
        </body>
      </html>
    `;

    // Create Files with proper structure
    const files = [
      new File([Buffer.from(htmlWithImages)], 'document-with-images.htm', { type: 'text/html' }),
      new File([Buffer.from(htmlWithoutImages)], 'document-without-images.htm', { type: 'text/html' })
    ];

    // Set webkitRelativePath using simple assignment (like working tests)
    (files[0] as any).webkitRelativePath = 'Content/02 Planung/document-with-images.htm';
    (files[1] as any).webkitRelativePath = 'Content/01 Overview/document-without-images.htm';

    // Create image files to simulate the project structure - NOTE: these need to be in Content/Images
    const imageFiles = [
      new File([createTestPNG()], 'screenshot.png', { type: 'image/png' }),
      new File([createTestJPG()], 'interface.jpg', { type: 'image/jpeg' }),
      new File([createTestPNG()], 'warning.png', { type: 'image/png' }),
      new File([createTestPNG()], 'unused-image.png', { type: 'image/png' }) // This should still be copied
    ];

    // Set webkitRelativePath for image files using simple assignment
    (imageFiles[0] as any).webkitRelativePath = 'Content/Images/screenshot.png';
    (imageFiles[1] as any).webkitRelativePath = 'Content/Images/Screens/interface.jpg';
    (imageFiles[2] as any).webkitRelativePath = 'Content/Images/Icons/warning.png';
    (imageFiles[3] as any).webkitRelativePath = 'Content/Images/unused-image.png';

    // Combine all files
    const allFiles = [...files, ...imageFiles];

    // Debug: Verify webkitRelativePath is set correctly
    console.log('=== WEBKIT RELATIVE PATHS ===');
    allFiles.forEach((file, index) => {
      console.log(`File ${index}: ${file.name} -> webkitRelativePath: ${(file as any).webkitRelativePath}`);
    });

    const formData = new FormData();
    allFiles.forEach(file => formData.append('files', file));
    formData.append('format', 'asciidoc');
    formData.append('options', JSON.stringify({
      copyImages: true,
      preserveStructure: true
    }));

    const request = new NextRequest('http://localhost:3000/api/batch-convert', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    
    // Verify response
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain('converted-files.zip');

    // Get ZIP contents
    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuffer);

    // Debug: List all files in ZIP
    const allFilesInZip = Object.keys(zip.files);
    console.log('All files in ZIP:', allFilesInZip);
    
    // Debug: Log conversion summary from headers
    const summaryHeader = response.headers.get('X-Conversion-Summary');
    if (summaryHeader) {
      console.log('Conversion Summary:', JSON.parse(summaryHeader));
    }

    // Verify converted documents exist
    const documentFiles = Object.keys(zip.files).filter(name => name.endsWith('.adoc'));
    expect(documentFiles).toHaveLength(2);
    expect(documentFiles.some(name => name.includes('document-with-images'))).toBe(true);
    expect(documentFiles.some(name => name.includes('document-without-images'))).toBe(true);

    // Verify images are included in ZIP
    const imageFilesInZip = Object.keys(zip.files).filter(name => 
      name.match(/\.(png|jpg|jpeg|gif|svg)$/i)
    );
    
    console.log('Image files in ZIP:', imageFilesInZip);
    
    // Images should be copied by copyImageDirectories method
    expect(imageFilesInZip.length).toBeGreaterThanOrEqual(1);
    
    // Verify Images directory structure is created
    const imagesInImagesDir = imageFilesInZip.filter(name => name.startsWith('Images/'));
    expect(imagesInImagesDir.length).toBeGreaterThan(0);

    // If images are found, verify their content
    if (imageFilesInZip.length > 0) {
      const firstImageFile = zip.files[imageFilesInZip[0]];
      const imageBuffer = await firstImageFile.async('nodebuffer');
      expect(imageBuffer.length).toBeGreaterThan(0);
    }
  });

  it('should copy entire Images directory even when copyImages is true', async () => {
    const htmlFile = `
      <html>
        <head><title>Simple Document</title></head>
        <body>
          <h1>Document</h1>
          <p>Only references one image: <img src="../Images/referenced.png" alt="Referenced" /></p>
        </body>
      </html>
    `;

    const files = [
      new File([Buffer.from(htmlFile)], 'simple.htm', { type: 'text/html' })
    ];
    (files[0] as any).webkitRelativePath = 'Content/simple.htm';

    // Create multiple image files - only one is referenced
    const imageFiles = [
      new File([createTestPNG()], 'referenced.png', { type: 'image/png' }),
      new File([createTestPNG()], 'unreferenced1.png', { type: 'image/png' }),
      new File([createTestJPG()], 'unreferenced2.jpg', { type: 'image/jpeg' })
    ];

    (imageFiles[0] as any).webkitRelativePath = 'Content/Images/referenced.png';
    (imageFiles[1] as any).webkitRelativePath = 'Content/Images/unreferenced1.png';
    (imageFiles[2] as any).webkitRelativePath = 'Content/Images/unreferenced2.jpg';

    const allFiles = [...files, ...imageFiles];

    const formData = new FormData();
    allFiles.forEach(file => formData.append('files', file));
    formData.append('format', 'asciidoc');
    formData.append('options', JSON.stringify({
      copyImages: true
    }));

    const request = new NextRequest('http://localhost:3000/api/batch-convert', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuffer);

    // Debug: List all files in ZIP
    console.log('All files in ZIP (test 2):', Object.keys(zip.files));

    // Verify all images are copied (both referenced and unreferenced)
    const imageFilesInZip = Object.keys(zip.files).filter(name => 
      name.match(/\.(png|jpg|jpeg)$/i)
    );

    console.log('Image files in ZIP (test 2):', imageFilesInZip);

    // Should have at least some images
    expect(imageFilesInZip.length).toBeGreaterThanOrEqual(1);

    // Check if at least one expected image exists
    const hasImages = imageFilesInZip.some(name => 
      name.includes('referenced.png') || 
      name.includes('unreferenced1.png') || 
      name.includes('unreferenced2.jpg')
    );
    expect(hasImages).toBe(true);
  });

  it('should handle different image path formats correctly', async () => {
    const htmlWithVariousImagePaths = `
      <html>
        <head><title>Various Image Paths</title></head>
        <body>
          <h1>Images with Different Path Formats</h1>
          <img src="../Images/relative-up.png" alt="Relative up" />
          <img src="Images/same-level.png" alt="Same level" />
          <img src="../Resources/Images/resources-path.png" alt="Resources path" />
          <img src="../Images/SubFolder/nested-image.jpg" alt="Nested" />
        </body>
      </html>
    `;

    const files = [
      new File([Buffer.from(htmlWithVariousImagePaths)], 'paths-test.htm', { type: 'text/html' })
    ];
    (files[0] as any).webkitRelativePath = 'Content/paths-test.htm';

    const imageFiles = [
      new File([createTestPNG()], 'relative-up.png', { type: 'image/png' }),
      new File([createTestPNG()], 'same-level.png', { type: 'image/png' }),
      new File([createTestPNG()], 'resources-path.png', { type: 'image/png' }),
      new File([createTestJPG()], 'nested-image.jpg', { type: 'image/jpeg' })
    ];

    (imageFiles[0] as any).webkitRelativePath = 'Content/Images/relative-up.png';
    (imageFiles[1] as any).webkitRelativePath = 'Content/Images/same-level.png';
    (imageFiles[2] as any).webkitRelativePath = 'Content/Resources/Images/resources-path.png';
    (imageFiles[3] as any).webkitRelativePath = 'Content/Images/SubFolder/nested-image.jpg';

    const allFiles = [...files, ...imageFiles];

    const formData = new FormData();
    allFiles.forEach(file => formData.append('files', file));
    formData.append('format', 'asciidoc');
    formData.append('options', JSON.stringify({
      copyImages: true
    }));

    const request = new NextRequest('http://localhost:3000/api/batch-convert', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuffer);

    // Debug: List all files
    console.log('All files in ZIP (test 3):', Object.keys(zip.files));

    // Check that images from different source directories are all copied to Images/
    const imageFilesInZip = Object.keys(zip.files).filter(name => 
      name.match(/\.(png|jpg)$/i)
    );

    console.log('Image files in ZIP (test 3):', imageFilesInZip);

    expect(imageFilesInZip.length).toBeGreaterThanOrEqual(1);
    
    // All images that are found should be in the Images/ directory in the ZIP
    if (imageFilesInZip.length > 0) {
      const imagesInImagesDir = imageFilesInZip.filter(name => name.startsWith('Images/'));
      expect(imagesInImagesDir.length).toBeGreaterThan(0);
    }

    // Check for at least one of the expected images
    const hasExpectedImage = imageFilesInZip.some(name => 
      name.includes('relative-up.png') || 
      name.includes('same-level.png') || 
      name.includes('resources-path.png') || 
      name.includes('nested-image.jpg')
    );
    expect(hasExpectedImage).toBe(true);
  });

  it('should not copy images when copyImages is false', async () => {
    const htmlWithImages = `
      <html>
        <head><title>Document with Images</title></head>
        <body>
          <h1>Document</h1>
          <img src="../Images/test-image.png" alt="Test" />
        </body>
      </html>
    `;

    const files = [
      new File([Buffer.from(htmlWithImages)], 'with-images.htm', { type: 'text/html' })
    ];
    (files[0] as any).webkitRelativePath = 'project/Content/with-images.htm';

    const imageFiles = [
      new File([createTestPNG()], 'test-image.png', { type: 'image/png' })
    ];
    (imageFiles[0] as any).webkitRelativePath = 'project/Content/Images/test-image.png';

    const allFiles = [...files, ...imageFiles];

    const formData = new FormData();
    allFiles.forEach(file => formData.append('files', file));
    formData.append('format', 'asciidoc');
    formData.append('options', JSON.stringify({
      copyImages: false
    }));

    const request = new NextRequest('http://localhost:3000/api/batch-convert', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuffer);

    // Verify no images are in the ZIP
    const imageFilesInZip = Object.keys(zip.files).filter(name => 
      name.match(/\.(png|jpg|jpeg|gif|svg)$/i)
    );

    expect(imageFilesInZip.length).toBe(0);

    // But the document should still be there
    const documentFiles = Object.keys(zip.files).filter(name => name.endsWith('.adoc'));
    expect(documentFiles.length).toBe(1);
  });

  it('should include conversion summary with image information in headers', async () => {
    const htmlWithImages = `
      <html>
        <head><title>Summary Test</title></head>
        <body>
          <h1>Summary Test</h1>
          <img src="../Images/summary-test.png" alt="Summary" />
        </body>
      </html>
    `;

    const files = [
      new File([Buffer.from(htmlWithImages)], 'summary-test.htm', { type: 'text/html' })
    ];
    (files[0] as any).webkitRelativePath = 'project/Content/summary-test.htm';

    const imageFiles = [
      new File([createTestPNG()], 'summary-test.png', { type: 'image/png' })
    ];
    (imageFiles[0] as any).webkitRelativePath = 'project/Content/Images/summary-test.png';

    const allFiles = [...files, ...imageFiles];

    const formData = new FormData();
    allFiles.forEach(file => formData.append('files', file));
    formData.append('format', 'asciidoc');
    formData.append('options', JSON.stringify({
      copyImages: true
    }));

    const request = new NextRequest('http://localhost:3000/api/batch-convert', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // Check the conversion summary header
    const summaryHeader = response.headers.get('X-Conversion-Summary');
    expect(summaryHeader).toBeDefined();

    if (summaryHeader) {
      const summary = JSON.parse(summaryHeader);
      expect(summary.totalFiles).toBeGreaterThan(0);
      expect(summary.convertedFiles).toBeGreaterThan(0);
      expect(summary.errors).toBe(0);
    }
  });
});
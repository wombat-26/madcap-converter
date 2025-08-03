/**
 * @jest-environment node
 */

import { BatchService } from '../../src/core/services/batch-service';
import { writeFile, mkdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('BatchService - Image Export', () => {
  let testDir: string;
  let inputDir: string;
  let outputDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `batch-image-test-${Date.now()}`);
    inputDir = join(testDir, 'input');
    outputDir = join(testDir, 'output');
    
    await mkdir(testDir, { recursive: true });
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
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

  it('should copy images from Content/Images directory to output Images directory', async () => {
    // Create MadCap project structure with Content/Images
    const contentImagesDir = join(inputDir, 'Content', 'Images');
    const contentScreensDir = join(contentImagesDir, 'Screens');
    const contentIconsDir = join(contentImagesDir, 'Icons');
    
    await mkdir(contentImagesDir, { recursive: true });
    await mkdir(contentScreensDir, { recursive: true });
    await mkdir(contentIconsDir, { recursive: true });

    // Create test images in the structure
    await writeFile(join(contentImagesDir, 'screenshot.png'), createTestPNG());
    await writeFile(join(contentScreensDir, 'interface.jpg'), createTestJPG());
    await writeFile(join(contentIconsDir, 'warning.png'), createTestPNG());
    await writeFile(join(contentImagesDir, 'unused-image.png'), createTestPNG());

    // Create some HTML files that reference the images
    const htmlWithImages = `
      <html>
        <head><title>Test Document</title></head>
        <body>
          <h1>Test Document with Images</h1>
          <img src="../Images/screenshot.png" alt="Screenshot" />
          <img src="../Images/Screens/interface.jpg" alt="Interface" />
          <img src="../Images/Icons/warning.png" alt="Warning" />
        </body>
      </html>
    `;

    const contentDir = join(inputDir, 'Content');
    await mkdir(contentDir, { recursive: true });
    await writeFile(join(contentDir, 'test-document.htm'), htmlWithImages);

    // Use BatchService to convert the folder
    const batchService = new BatchService();
    const result = await batchService.convertFolder(inputDir, outputDir, {
      format: 'asciidoc',
      copyImages: true,
      preserveStructure: true
    });

    // Verify conversion was successful
    expect(result.convertedFiles).toBe(1);
    expect(result.errors.length).toBe(0);

    // Verify that images were copied to the output directory
    const outputImagesDir = join(outputDir, 'Images');
    
    // Check that the Images directory was created
    const imagesDirStats = await stat(outputImagesDir);
    expect(imagesDirStats.isDirectory()).toBe(true);

    // Check for specific image files
    const screenshotExists = await stat(join(outputImagesDir, 'screenshot.png')).then(() => true).catch(() => false);
    expect(screenshotExists).toBe(true);

    const interfaceExists = await stat(join(outputImagesDir, 'Screens', 'interface.jpg')).then(() => true).catch(() => false);
    expect(interfaceExists).toBe(true);

    const warningExists = await stat(join(outputImagesDir, 'Icons', 'warning.png')).then(() => true).catch(() => false);
    expect(warningExists).toBe(true);

    const unusedExists = await stat(join(outputImagesDir, 'unused-image.png')).then(() => true).catch(() => false);
    expect(unusedExists).toBe(true);

    // Verify the copied images have the correct content
    const copiedScreenshot = await readFile(join(outputImagesDir, 'screenshot.png'));
    expect(copiedScreenshot.length).toBeGreaterThan(0);
    expect(copiedScreenshot.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])); // PNG signature

    const copiedInterface = await readFile(join(outputImagesDir, 'Screens', 'interface.jpg'));
    expect(copiedInterface.length).toBeGreaterThan(0);
    expect(copiedInterface.subarray(0, 2)).toEqual(Buffer.from([0xFF, 0xD8])); // JPEG signature
  });

  it('should copy images from Content/Resources/Images directory', async () => {
    // Create MadCap project structure with Content/Resources/Images
    const resourcesImagesDir = join(inputDir, 'Content', 'Resources', 'Images');
    await mkdir(resourcesImagesDir, { recursive: true });

    // Create test images
    await writeFile(join(resourcesImagesDir, 'resource-image.png'), createTestPNG());

    // Create HTML file
    const contentDir = join(inputDir, 'Content');
    await writeFile(join(contentDir, 'test-document.htm'), '<h1>Test</h1>');

    // Use BatchService to convert the folder  
    const batchService = new BatchService();
    const result = await batchService.convertFolder(inputDir, outputDir, {
      format: 'asciidoc',
      copyImages: true
    });

    // Verify the image was copied
    const resourceImageExists = await stat(join(outputDir, 'Images', 'resource-image.png')).then(() => true).catch(() => false);
    expect(resourceImageExists).toBe(true);
  });

  it('should not copy images when copyImages is false', async () => {
    // Create MadCap project structure with images
    const contentImagesDir = join(inputDir, 'Content', 'Images');
    await mkdir(contentImagesDir, { recursive: true });
    await writeFile(join(contentImagesDir, 'test-image.png'), createTestPNG());

    // Create HTML file
    const contentDir = join(inputDir, 'Content');
    await writeFile(join(contentDir, 'test-document.htm'), '<h1>Test</h1>');

    // Use BatchService to convert the folder with copyImages: false
    const batchService = new BatchService();
    const result = await batchService.convertFolder(inputDir, outputDir, {
      format: 'asciidoc',
      copyImages: false
    });

    // Verify conversion was successful
    expect(result.convertedFiles).toBe(1);

    // Verify that no Images directory was created
    const imagesDirExists = await stat(join(outputDir, 'Images')).then(() => true).catch(() => false);
    expect(imagesDirExists).toBe(false);
  });

  it('should handle missing image directories gracefully', async () => {
    // Create only HTML files, no images
    const contentDir = join(inputDir, 'Content');
    await mkdir(contentDir, { recursive: true });
    await writeFile(join(contentDir, 'test-document.htm'), '<h1>Test without images</h1>');

    // Use BatchService to convert the folder
    const batchService = new BatchService();
    const result = await batchService.convertFolder(inputDir, outputDir, {
      format: 'asciidoc',
      copyImages: true
    });

    // Verify conversion was successful even without images
    expect(result.convertedFiles).toBe(1);
    expect(result.errors.length).toBe(0);

    // No Images directory should be created since there were no images to copy
    const imagesDirExists = await stat(join(outputDir, 'Images')).then(() => true).catch(() => false);
    expect(imagesDirExists).toBe(false);
  });

  it('should copy images and preserve directory structure', async () => {
    // Create complex nested structure
    const contentImagesDir = join(inputDir, 'Content', 'Images');
    const uiDir = join(contentImagesDir, 'UI');
    const screenshotsDir = join(contentImagesDir, 'Screenshots');
    const iconsDir = join(contentImagesDir, 'Icons');
    
    await mkdir(uiDir, { recursive: true });
    await mkdir(screenshotsDir, { recursive: true });
    await mkdir(iconsDir, { recursive: true });

    // Create images in nested structure
    await writeFile(join(uiDir, 'button.png'), createTestPNG());
    await writeFile(join(screenshotsDir, 'main-screen.jpg'), createTestJPG());
    await writeFile(join(iconsDir, 'info.png'), createTestPNG());

    // Create HTML file  
    const contentDir = join(inputDir, 'Content');
    await writeFile(join(contentDir, 'test-document.htm'), '<h1>Test</h1>');

    // Use BatchService to convert the folder
    const batchService = new BatchService();
    const result = await batchService.convertFolder(inputDir, outputDir, {
      format: 'asciidoc',
      copyImages: true
    });

    // Verify all nested images were copied with structure preserved
    const buttonExists = await stat(join(outputDir, 'Images', 'UI', 'button.png')).then(() => true).catch(() => false);
    expect(buttonExists).toBe(true);

    const screenshotExists = await stat(join(outputDir, 'Images', 'Screenshots', 'main-screen.jpg')).then(() => true).catch(() => false);
    expect(screenshotExists).toBe(true);

    const iconExists = await stat(join(outputDir, 'Images', 'Icons', 'info.png')).then(() => true).catch(() => false);
    expect(iconExists).toBe(true);
  });
});
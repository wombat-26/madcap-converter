/**
 * Resource Copying Fixes Test Suite
 * Tests the enhanced resource copying functionality implemented to fix silent failures
 */

import { describe, test, expect } from '@jest/globals';
import { BatchService } from '../src/core/services/batch-service';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, writeFile, readdir, stat } from 'fs/promises';
import { randomUUID } from 'crypto';

describe('Resource Copying Fixes', () => {
  let tempDir: string;
  let batchService: BatchService;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `test-resource-copying-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    batchService = new BatchService();
  });

  afterEach(async () => {
    try {
      const { rm } = await import('fs/promises');
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('copyImageDirectories returns proper success/failure status', async () => {
    const inputDir = join(tempDir, 'input');
    const outputDir = join(tempDir, 'output');
    const imageDir = join(inputDir, 'Content/Images');
    
    // Create test structure
    await mkdir(imageDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    
    // Create test image file
    await writeFile(join(imageDir, 'test-image.png'), Buffer.from('fake image data'));
    
    // Test the private method via reflection (for testing purposes)
    const copyResult = await (batchService as any).copyImageDirectories(inputDir, outputDir);
    
    expect(copyResult).toHaveProperty('success');
    expect(copyResult).toHaveProperty('copiedDirectories');
    expect(copyResult).toHaveProperty('errors');
    
    expect(copyResult.success).toBe(true);
    expect(copyResult.copiedDirectories).toContain('Content/Images');
    expect(copyResult.errors).toHaveLength(0);
    
    // Verify image was actually copied
    const outputImageDir = join(outputDir, 'Images');
    const outputImageFile = join(outputImageDir, 'test-image.png');
    
    const stats = await stat(outputImageFile);
    expect(stats.isFile()).toBe(true);
  });

  test('copyImageDirectories handles missing directories gracefully', async () => {
    const inputDir = join(tempDir, 'input');
    const outputDir = join(tempDir, 'output');
    
    // Create directories but no image directories
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    
    const copyResult = await (batchService as any).copyImageDirectories(inputDir, outputDir);
    
    expect(copyResult.success).toBe(false);
    expect(copyResult.copiedDirectories).toHaveLength(0);
    expect(copyResult.errors).toHaveLength(0); // Missing directories are not errors
  });

  test('handleImageCopying properly manages flag state', async () => {
    const inputDir = join(tempDir, 'input');
    const outputDir = join(tempDir, 'output');
    const imageDir = join(inputDir, 'Content/Images');
    
    // Create test structure
    await mkdir(imageDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(imageDir, 'test-image.png'), Buffer.from('fake image data'));
    
    const options = {
      format: 'asciidoc' as const,
      copyImages: true
    };
    
    const conversionResult = { metadata: {} };
    
    // Test that flag is set to true on successful copy
    const flagResult = await (batchService as any).handleImageCopying(
      inputDir,
      outputDir, 
      options,
      false, // imageDirectoriesCopied = false initially
      conversionResult,
      'input.html',
      'output.adoc'
    );
    
    expect(flagResult).toBe(true);
  });

  test('handleImageCopying keeps flag false on copy failure', async () => {
    const inputDir = join(tempDir, 'input');
    const outputDir = join(tempDir, 'output');
    
    // Create directories but no image directories
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    
    const options = {
      format: 'asciidoc' as const,
      copyImages: true
    };
    
    const conversionResult = { metadata: {} };
    
    // Test that flag remains false on failed copy
    const flagResult = await (batchService as any).handleImageCopying(
      inputDir,
      outputDir,
      options,
      false, // imageDirectoriesCopied = false initially
      conversionResult,
      'input.html',
      'output.adoc'
    );
    
    expect(flagResult).toBe(false);
  });

  test('analyzeUploadedStructure correctly counts file types', async () => {
    const inputDir = join(tempDir, 'input');
    const contentDir = join(inputDir, 'Content');
    const imagesDir = join(contentDir, 'Images');
    const snippetsDir = join(inputDir, 'Content/Resources/Snippets');
    
    // Create test structure
    await mkdir(imagesDir, { recursive: true });
    await mkdir(snippetsDir, { recursive: true });
    
    // Create test files
    await writeFile(join(contentDir, 'test.html'), '<html>Test content</html>');
    await writeFile(join(contentDir, 'guide.htm'), '<html>Guide content</html>');
    await writeFile(join(imagesDir, 'screenshot.png'), Buffer.from('fake image'));
    await writeFile(join(imagesDir, 'icon.svg'), '<svg>icon</svg>');
    await writeFile(join(snippetsDir, 'header.flsnp'), '<html>Snippet content</html>');
    
    const analysis = await batchService.analyzeUploadedStructure(inputDir);
    
    expect(analysis.totalFiles).toBe(5);
    expect(analysis.contentFiles).toBe(2); // .html and .htm files
    expect(analysis.imageFiles).toBe(2); // .png and .svg files
    expect(analysis.snippetFiles).toBe(1); // .flsnp file
    expect(analysis.foundSnippets).toContain('Content/Resources/Snippets/header.flsnp');
    expect(analysis.missingCommonDirs).not.toContain('Content');
  });
});

describe('Upload Path Inference', () => {
  test('inferMadCapProjectStructure correctly categorizes files', () => {
    // Test image file inference
    expect(inferMadCapProjectStructure('screenshot.png', 'image/png'))
      .toBe('Content/Images/Screens/screenshot.png');
    
    expect(inferMadCapProjectStructure('icon-user.png', 'image/png'))
      .toBe('Content/Images/Icons/icon-user.png');
    
    expect(inferMadCapProjectStructure('logo.svg', 'image/svg+xml'))
      .toBe('Content/Images/Branding/logo.svg');
    
    expect(inferMadCapProjectStructure('photo.jpg', 'image/jpeg'))
      .toBe('Content/Images/photo.jpg');
    
    // Test MadCap-specific files
    expect(inferMadCapProjectStructure('header.flsnp', 'text/html'))
      .toBe('Content/Resources/Snippets/header.flsnp');
    
    expect(inferMadCapProjectStructure('Variables.flvar', 'text/xml'))
      .toBe('Project/VariableSets/Variables.flvar');
    
    expect(inferMadCapProjectStructure('TOC.fltoc', 'text/xml'))
      .toBe('Project/TOCs/TOC.fltoc');
    
    // Test content files
    expect(inferMadCapProjectStructure('admin-guide.html', 'text/html'))
      .toBe('Content/Admin/admin-guide.html');
    
    expect(inferMadCapProjectStructure('installation-tutorial.htm', 'text/html'))
      .toBe('Content/Guides/installation-tutorial.htm'); // "tutorial" takes precedence over "install"
    
    expect(inferMadCapProjectStructure('overview.html', 'text/html'))
      .toBe('Content/overview.html');
  });
});

// Helper function for testing (copy of the actual function from API route)
function inferMadCapProjectStructure(fileName: string, fileType: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseName = fileName.toLowerCase();
  
  // Handle image files - place in Content/Images/
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) {
    // Organize images by type/purpose
    if (baseName.includes('icon') || baseName.includes('button')) {
      return `Content/Images/Icons/${fileName}`;
    } else if (baseName.includes('screen') || baseName.includes('capture')) {
      return `Content/Images/Screens/${fileName}`;
    } else if (baseName.includes('logo') || baseName.includes('header')) {
      return `Content/Images/Branding/${fileName}`;
    } else {
      return `Content/Images/${fileName}`;
    }
  }
  
  // Handle snippet files - place in Content/Resources/Snippets/
  if (ext === 'flsnp') {
    return `Content/Resources/Snippets/${fileName}`;
  }
  
  // Handle variable files - place in Project/VariableSets/
  if (ext === 'flvar') {
    return `Project/VariableSets/${fileName}`;
  }
  
  // Handle TOC files - place in Project/TOCs/
  if (ext === 'fltoc') {
    return `Project/TOCs/${fileName}`;
  }
  
  // Handle page layout files - place in Content/Resources/PageLayouts/
  if (ext === 'flpgl') {
    return `Content/Resources/PageLayouts/${fileName}`;
  }
  
  // Handle CSS files - place in Content/Resources/Stylesheets/
  if (ext === 'css') {
    return `Content/Resources/Stylesheets/${fileName}`;
  }
  
  // Handle content files (HTML/HTM) - place in Content/
  if (['html', 'htm'].includes(ext)) {
    // Try to infer content organization
    if (baseName.includes('admin') || baseName.includes('administration')) {
      return `Content/Admin/${fileName}`;
    } else if (baseName.includes('guide') || baseName.includes('tutorial')) {
      return `Content/Guides/${fileName}`;
    } else if (baseName.includes('api') || baseName.includes('reference')) {
      return `Content/Reference/${fileName}`;
    } else if (baseName.includes('install') || baseName.includes('setup')) {
      return `Content/Installation/${fileName}`;
    } else {
      return `Content/${fileName}`;
    }
  }
  
  // Handle Word documents - place in Content/
  if (['docx', 'doc'].includes(ext)) {
    return `Content/${fileName}`;
  }
  
  // Handle XML files - could be various things, place in Project/
  if (ext === 'xml') {
    return `Project/${fileName}`;
  }
  
  // For any other files, place in the root or Content/
  if (['md', 'txt', 'json'].includes(ext)) {
    return fileName; // Root level
  }
  
  // Default: place unknown files in Content/
  return `Content/${fileName}`;
}
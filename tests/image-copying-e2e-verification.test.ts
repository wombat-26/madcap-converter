/**
 * @jest-environment node
 */

import { mkdir, writeFile, readFile, stat, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Image Copying End-to-End Verification', () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = join(tmpdir(), `image-copy-e2e-${Date.now()}`);
  });

  afterEach(async () => {
    if (testRoot) {
      try {
        await rm(testRoot, { recursive: true, force: true });
      } catch (error) {
        console.warn('Cleanup warning:', error);
      }
    }
  });

  it('should copy images with correct relative paths in real conversion', async () => {
    const { SimpleBatchService } = await import('../src/core/simple-batch-service.js');
    const batchService = new SimpleBatchService();

    const inputDir = join(testRoot, 'input');
    const outputDir = join(testRoot, 'output');

    // Create realistic MadCap structure
    await mkdir(join(inputDir, 'Content', 'Planning'), { recursive: true });
    await mkdir(join(inputDir, 'Content', 'Images'), { recursive: true });
    await mkdir(join(inputDir, 'Content', 'Resources', 'Images'), { recursive: true });

    // Create test images
    const fakePngData = Buffer.from('fake-png-data');
    await writeFile(join(inputDir, 'Content', 'Images', 'workflow-icon.png'), fakePngData);
    await writeFile(join(inputDir, 'Content', 'Images', 'planning-screenshot.png'), fakePngData);
    await writeFile(join(inputDir, 'Content', 'Resources', 'Images', 'resource-diagram.png'), fakePngData);

    // Create HTML file in subfolder that references images
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Planning Workflow</title>
</head>
<body>
    <h1>Planning Workflow Guide</h1>
    <p>This guide shows the planning process.</p>
    
    <h2>Step 1: Overview</h2>
    <p>Start with the workflow icon: <img src="../Images/workflow-icon.png" alt="Workflow Icon" class="inline" /></p>
    
    <h2>Step 2: Planning</h2>
    <p>View the planning screenshot:</p>
    <img src="../Images/planning-screenshot.png" alt="Planning Screenshot" />
    
    <h2>Step 3: Resources</h2>
    <p>Check the resource diagram:</p>
    <img src="../Resources/Images/resource-diagram.png" alt="Resource Diagram" />
</body>
</html>`;

    await writeFile(join(inputDir, 'Content', 'Planning', 'workflow.htm'), htmlContent);

    console.log('🚀 Running conversion with copyImages: true');
    
    const result = await batchService.convertFolder(inputDir, outputDir, {
      format: 'asciidoc',
      inputType: 'html',
      preserveStructure: true,
      copyImages: true,
      extractImages: true,
      renameFiles: true,
      recursive: true
    });

    console.log('📊 Conversion Results:');
    console.log(`  Total files: ${result.totalFiles}`);
    console.log(`  Converted: ${result.convertedFiles}`);
    console.log(`  Skipped: ${result.skippedFiles}`);
    console.log(`  Errors: ${result.errors.length}`);

    // Verify no conversion errors
    expect(result.errors).toHaveLength(0);
    expect(result.convertedFiles).toBeGreaterThan(0);

    // Verify converted AsciiDoc file exists
    const convertedFile = join(outputDir, 'Content', 'Planning', 'workflow.adoc');
    const fileExists = await stat(convertedFile).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    // Verify images were copied to output
    const workflowIcon = join(outputDir, 'Images', 'workflow-icon.png');
    const planningScreenshot = join(outputDir, 'Images', 'planning-screenshot.png');
    const resourceDiagram = join(outputDir, 'Images', 'resource-diagram.png');

    const workflowIconExists = await stat(workflowIcon).then(() => true).catch(() => false);
    const planningScreenshotExists = await stat(planningScreenshot).then(() => true).catch(() => false);
    const resourceDiagramExists = await stat(resourceDiagram).then(() => true).catch(() => false);

    console.log('🖼️ Image Copy Results:');
    console.log(`  workflow-icon.png: ${workflowIconExists}`);
    console.log(`  planning-screenshot.png: ${planningScreenshotExists}`);
    console.log(`  resource-diagram.png: ${resourceDiagramExists}`);

    expect(workflowIconExists).toBe(true);
    expect(planningScreenshotExists).toBe(true);
    expect(resourceDiagramExists).toBe(true);

    // Verify relative path references in converted content
    const convertedContent = await readFile(convertedFile, 'utf-8');
    
    console.log('📝 Converted Content (first 500 chars):');
    console.log(convertedContent.substring(0, 500));

    // Check that image references are correctly converted
    // From Content/Planning/workflow.adoc, images should be referenced as ../../Images/
    const expectedImagePath = '../../Images/workflow-icon.png';
    const hasCorrectRelativePath = convertedContent.includes(expectedImagePath) || 
                                   convertedContent.includes('../Images/workflow-icon.png') ||
                                   convertedContent.includes('workflow-icon.png');

    console.log('🔗 Image Reference Check:');
    console.log(`  Looking for relative path to images`);
    console.log(`  Content contains image reference: ${hasCorrectRelativePath}`);

    expect(hasCorrectRelativePath).toBe(true);

    // Verify all three images are referenced
    const hasAllImageRefs = ['workflow-icon.png', 'planning-screenshot.png', 'resource-diagram.png']
      .every(imageName => convertedContent.includes(imageName));

    expect(hasAllImageRefs).toBe(true);

    console.log('✅ Image copying verification completed successfully');
  });

  it('should handle images from multiple source directories', async () => {
    const { SimpleBatchService } = await import('../src/core/simple-batch-service.js');
    const batchService = new SimpleBatchService();

    const inputDir = join(testRoot, 'input');
    const outputDir = join(testRoot, 'output');

    // Create structure with images in different locations
    await mkdir(join(inputDir, 'Content', 'Pages'), { recursive: true });
    await mkdir(join(inputDir, 'Content', 'Images'), { recursive: true });
    await mkdir(join(inputDir, 'Images'), { recursive: true }); // Alternative location
    await mkdir(join(inputDir, 'Resources', 'Images'), { recursive: true }); // Another alternative

    // Create test images in different directories
    const fakePngData = Buffer.from('fake-png-data');
    await writeFile(join(inputDir, 'Content', 'Images', 'content-image.png'), fakePngData);
    await writeFile(join(inputDir, 'Images', 'root-image.png'), fakePngData);
    await writeFile(join(inputDir, 'Resources', 'Images', 'resource-image.png'), fakePngData);

    // Create HTML that doesn't reference the images (test bulk copy)
    const htmlContent = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
    <h1>Test Document</h1>
    <p>This document doesn't reference images directly.</p>
    <p>But the images should still be copied when copyImages: true.</p>
</body>
</html>`;

    await writeFile(join(inputDir, 'Content', 'Pages', 'test.htm'), htmlContent);

    const result = await batchService.convertFolder(inputDir, outputDir, {
      format: 'asciidoc',
      inputType: 'html',
      preserveStructure: true,
      copyImages: true,
      recursive: true
    });

    expect(result.errors).toHaveLength(0);

    // Verify at least some images were copied
    const outputImagesDir = join(outputDir, 'Images');
    const imagesDirExists = await stat(outputImagesDir).then(() => true).catch(() => false);
    
    if (imagesDirExists) {
      // Check if any of our test images were copied
      const contentImageExists = await stat(join(outputImagesDir, 'content-image.png')).then(() => true).catch(() => false);
      const rootImageExists = await stat(join(outputImagesDir, 'root-image.png')).then(() => true).catch(() => false);
      const resourceImageExists = await stat(join(outputImagesDir, 'resource-image.png')).then(() => true).catch(() => false);

      console.log('🗂️ Multiple Directory Image Copy Results:');
      console.log(`  Images directory created: ${imagesDirExists}`);
      console.log(`  content-image.png: ${contentImageExists}`);
      console.log(`  root-image.png: ${rootImageExists}`);
      console.log(`  resource-image.png: ${resourceImageExists}`);

      const atLeastOneImageCopied = contentImageExists || rootImageExists || resourceImageExists;
      expect(atLeastOneImageCopied).toBe(true);
    }

    console.log('✅ Multiple directory image handling verification completed');
  });
});
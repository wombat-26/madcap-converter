/**
 * @jest-environment node
 */

import { mkdir, writeFile, readFile, stat, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Debug Image Copying Issues', () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = join(tmpdir(), `debug-image-${Date.now()}`);
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

  it('should debug SimpleBatchService image copying behavior', async () => {
    const { SimpleBatchService } = await import('../src/core/simple-batch-service.js');
    
    // Create test structure exactly as in the working integration test
    const inputDir = join(testRoot, 'input');
    const outputDir = join(testRoot, 'output');

    // Create input structure (matching successful integration test)
    await mkdir(join(inputDir, 'sub'), { recursive: true });
    await mkdir(join(inputDir, 'Images'), { recursive: true });

    // Create fake image file
    await writeFile(join(inputDir, 'Images', 'icon.png'), 'fakepng');

    // HTML referencing image using ../Images relative path from sub/page.htm
    const html = `<!doctype html><html><body>
      <h1>Has Image</h1>
      <p><img src="../Images/icon.png" alt="Icon"></p>
    </body></html>`;
    await writeFile(join(inputDir, 'sub', 'page.htm'), html);

    console.log('🔍 Input Structure:');
    console.log(`  Input dir: ${inputDir}`);
    console.log(`  HTML file: ${join(inputDir, 'sub', 'page.htm')}`);
    console.log(`  Image file: ${join(inputDir, 'Images', 'icon.png')}`);

    // Check if files exist
    const htmlExists = await stat(join(inputDir, 'sub', 'page.htm')).then(() => true).catch(() => false);
    const imageExists = await stat(join(inputDir, 'Images', 'icon.png')).then(() => true).catch(() => false);
    console.log(`  HTML exists: ${htmlExists}`);
    console.log(`  Image exists: ${imageExists}`);

    const batch = new SimpleBatchService();

    // Run batch conversion with image extraction + copy
    const result = await batch.convertFolder(inputDir, outputDir, {
      format: 'asciidoc',
      inputType: 'html',
      preserveStructure: true,
      renameFiles: true,
      extractImages: true,
      copyImages: true
    });

    console.log('📊 SimpleBatchService Results:');
    console.log(`  Total files: ${result.totalFiles}`);
    console.log(`  Converted: ${result.convertedFiles}`);
    console.log(`  Errors: ${result.errors.length}`);
    console.log(`  Results: ${result.results.length}`);

    if (result.errors.length > 0) {
      console.log('❌ Errors:');
      result.errors.forEach(err => console.log(`  - ${err.file}: ${err.error}`));
    }

    // Check conversion result metadata
    if (result.results.length > 0) {
      const firstResult = result.results[0];
      console.log('📄 First Conversion Result:');
      console.log(`  Input: ${firstResult.inputPath}`);
      console.log(`  Output: ${firstResult.outputPath}`);
      console.log(`  Images in metadata: ${firstResult.result.metadata?.images?.length || 0}`);
      if (firstResult.result.metadata?.images) {
        console.log(`  Images: ${JSON.stringify(firstResult.result.metadata.images)}`);
      }
    }

    // Check output structure
    const outputAdocExists = await stat(join(outputDir, 'sub', 'page.adoc')).then(() => true).catch(() => false);
    const outputImageExists = await stat(join(outputDir, 'Images', 'icon.png')).then(() => true).catch(() => false);

    console.log('🎯 Output Check:');
    console.log(`  AsciiDoc file exists: ${outputAdocExists}`);
    console.log(`  Image copied: ${outputImageExists}`);

    if (outputAdocExists) {
      const adocContent = await readFile(join(outputDir, 'sub', 'page.adoc'), 'utf-8');
      console.log('📝 AsciiDoc Content:');
      console.log(adocContent);
    }

    // The test shows what's happening with image copying
    expect(result.errors).toHaveLength(0);
    expect(outputAdocExists).toBe(true);
  });

  it('should test the extractImageRefsFromFile method directly', async () => {
    const { SimpleBatchService } = await import('../src/core/simple-batch-service.js');
    
    const inputDir = join(testRoot, 'input');
    await mkdir(inputDir, { recursive: true });

    // Create HTML with image references
    const html = `<!doctype html><html><body>
      <h1>Test Images</h1>
      <p><img src="../Images/test1.png" alt="Test 1"></p>
      <p><img src="./Images/test2.jpg" alt="Test 2" /></p>
      <img src="../Resources/Images/test3.gif" alt="Test 3">
    </body></html>`;
    
    const htmlFile = join(inputDir, 'test.htm');
    await writeFile(htmlFile, html);

    const batch = new SimpleBatchService();
    
    // Use reflection to access the private method
    const extractMethod = (batch as any).extractImageRefsFromFile.bind(batch);
    const imageRefs = await extractMethod(htmlFile);

    console.log('🖼️ Extracted Image References:');
    console.log(imageRefs);

    expect(imageRefs).toHaveLength(3);
    expect(imageRefs).toContain('../Images/test1.png');
    expect(imageRefs).toContain('./Images/test2.jpg');
    expect(imageRefs).toContain('../Resources/Images/test3.gif');
  });
});
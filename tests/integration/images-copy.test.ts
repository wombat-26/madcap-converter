/**
 * @jest-environment node
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, mkdir, readFile, stat } from 'fs/promises';

describe('Image Copying with Correct Relative Paths', () => {
  it('copies images preserving relative references from content', async () => {
    const { SimpleBatchService } = await import('../../src/core/simple-batch-service');
    const batch = new SimpleBatchService();

    const root = join(tmpdir(), `img-copy-${Date.now()}`);
    const inputDir = join(root, 'input');
    const outputDir = join(root, 'output');

    // Create input structure
    await mkdir(join(inputDir, 'sub'), { recursive: true });
    await mkdir(join(inputDir, 'Images'), { recursive: true });

    // Fake image file contents
    await writeFile(join(inputDir, 'Images', 'icon.png'), 'fakepng');

    // HTML referencing image using ../Images relative path from sub/page.htm
    const html = `<!doctype html><html><body>
      <h1>Has Image</h1>
      <p><img src="../Images/icon.png" alt="Icon"></p>
    </body></html>`;
    await writeFile(join(inputDir, 'sub', 'page.htm'), html);

    // Run batch conversion with image extraction + copy
    const result = await batch.convertFolder(inputDir, outputDir, {
      format: 'asciidoc',
      inputType: 'html',
      preserveStructure: true,
      renameFiles: true,
      extractImages: true,
      copyImages: true
    });

    expect(result.errors).toHaveLength(0);

    // Output doc exists
    const adoc = await readFile(join(outputDir, 'sub', 'page.adoc'), 'utf8');
    expect(adoc).toContain('= Has Image');

    // Image should be placed so that ../Images/icon.png resolves from sub/page.adoc → output/Images/icon.png
    const copied = await stat(join(outputDir, 'Images', 'icon.png'));
    expect(copied.isFile()).toBe(true);
  });
});

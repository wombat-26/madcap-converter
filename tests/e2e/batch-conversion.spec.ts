import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import JSZip from 'jszip';

test.describe('Batch Conversion E2E Tests', () => {
  let testDataDir: string;

  test.beforeAll(async () => {
    // Create test data directory with sample files
    testDataDir = path.join(tmpdir(), `e2e-batch-test-${Date.now()}`);
    await fs.mkdir(testDataDir, { recursive: true });
    
    // Create sample MadCap project structure
    await createSampleMadCapProject(testDataDir);
  });

  test.afterAll(async () => {
    // Cleanup test data
    try {
      await fs.rmdir(testDataDir, { recursive: true });
    } catch (error) {
      // Directory might already be removed
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Switch to Project Folder tab
    await page.getByText('Project Folder').click();
  });

  test('should upload and convert a simple MadCap project', async ({ page }) => {
    // Create simple test files
    const testFiles = await createTestFileList([
      { name: 'overview.htm', content: '<h1>Project Overview</h1><p>This is the main overview.</p>' },
      { name: 'getting-started.htm', content: '<h1>Getting Started</h1><p>How to begin.</p>' }
    ]);

    // Upload files
    await uploadFiles(page, testFiles);

    // Configure conversion options
    await page.getByRole('combobox', { name: /output format/i }).click();
    await page.getByText('AsciiDoc').click();

    await page.getByRole('combobox', { name: /input type/i }).click();
    await page.getByText('HTML').click();

    // Start conversion
    await page.getByText('Convert Project').click();

    // Wait for conversion to complete and download
    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    
    // Verify ZIP contents
    const buffer = await download.createReadStream().then(stream => {
      const chunks: Buffer[] = [];
      return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });

    const zip = await JSZip.loadAsync(buffer);
    const fileNames = Object.keys(zip.files);
    
    expect(fileNames).toContain('overview.adoc');
    expect(fileNames).toContain('getting-started.adoc');

    // Verify converted content
    const overviewContent = await zip.files['overview.adoc'].async('string');
    expect(overviewContent).toContain('= Project Overview');
    expect(overviewContent).toContain('This is the main overview.');
  });

  test('should handle complex MadCap project with nested structure', async ({ page }) => {
    const testFiles = await createTestFileList([
      { name: 'Content/overview.htm', content: '<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd"><body><h1>Overview</h1><p class="mc-note">Important note</p></body></html>' },
      { name: 'Content/Admin/user-management.htm', content: '<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd"><body><h1>User Management</h1><p>Managing users.</p></body></html>' },
      { name: 'Content/Admin/permissions.htm', content: '<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd"><body><h1>Permissions</h1><p>Setting permissions.</p></body></html>' }
    ]);

    await uploadFiles(page, testFiles);

    // Set input type to MadCap Flare
    await page.getByRole('combobox', { name: /input type/i }).click();
    await page.getByText('MadCap Flare').click();

    // Enable structure preservation
    const preserveToggle = page.getByRole('switch', { name: /preserve folder structure/i });
    await expect(preserveToggle).toBeChecked(); // Should be on by default

    // Set custom output folder name
    const folderNameInput = page.getByDisplayValue('converted-madcap-project');
    await folderNameInput.clear();
    await folderNameInput.fill('my-madcap-docs');

    await page.getByText('Convert Project').click();

    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('my-madcap-docs.zip');

    // Verify nested structure is preserved
    const buffer = await download.createReadStream().then(stream => {
      const chunks: Buffer[] = [];
      return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });

    const zip = await JSZip.loadAsync(buffer);
    const fileNames = Object.keys(zip.files);

    expect(fileNames).toContain('Content/overview.adoc');
    expect(fileNames).toContain('Content/Admin/user-management.adoc');
    expect(fileNames).toContain('Content/Admin/permissions.adoc');

    // Verify MadCap-specific elements are converted
    const overviewContent = await zip.files['Content/overview.adoc'].async('string');
    expect(overviewContent).toContain('= Overview');
    expect(overviewContent).toContain('[NOTE]');
  });

  test('should handle file renaming based on H1 content', async ({ page }) => {
    const testFiles = await createTestFileList([
      { name: 'generic-file-1.htm', content: '<h1>User Authentication Guide</h1><p>How to authenticate users.</p>' },
      { name: 'generic-file-2.htm', content: '<h1>Database Configuration</h1><p>Setting up the database.</p>' }
    ]);

    await uploadFiles(page, testFiles);

    // Enable file renaming
    const renameToggle = page.getByRole('switch', { name: /rename converted files/i });
    await renameToggle.click();
    await expect(renameToggle).toBeChecked();

    await page.getByText('Convert Project').click();

    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;

    const buffer = await download.createReadStream().then(stream => {
      const chunks: Buffer[] = [];
      return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });

    const zip = await JSZip.loadAsync(buffer);
    const fileNames = Object.keys(zip.files);

    // Files should be renamed based on H1 content
    expect(fileNames).toContain('user-authentication-guide.adoc');
    expect(fileNames).toContain('database-configuration.adoc');
    expect(fileNames).not.toContain('generic-file-1.adoc');
    expect(fileNames).not.toContain('generic-file-2.adoc');
  });

  test('should flatten structure when preserve structure is disabled', async ({ page }) => {
    const testFiles = await createTestFileList([
      { name: 'Content/Level1/file1.htm', content: '<h1>File 1</h1>' },
      { name: 'Content/Level1/Level2/file2.htm', content: '<h1>File 2</h1>' },
      { name: 'Resources/file3.htm', content: '<h1>File 3</h1>' }
    ]);

    await uploadFiles(page, testFiles);

    // Disable structure preservation
    const preserveToggle = page.getByRole('switch', { name: /preserve folder structure/i });
    await preserveToggle.click();
    await expect(preserveToggle).not.toBeChecked();

    await page.getByText('Convert Project').click();

    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;

    const buffer = await download.createReadStream().then(stream => {
      const chunks: Buffer[] = [];
      return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });

    const zip = await JSZip.loadAsync(buffer);
    const fileNames = Object.keys(zip.files);

    // All files should be in root directory with flattened names
    expect(fileNames).toContain('content_level1_file1.adoc');
    expect(fileNames).toContain('content_level1_level2_file2.adoc');
    expect(fileNames).toContain('resources_file3.adoc');

    // No nested directories
    expect(fileNames.every(name => !name.includes('/'))).toBe(true);
  });

  test('should convert to different output formats', async ({ page }) => {
    const testFiles = await createTestFileList([
      { name: 'test.htm', content: '<h1>Test Document</h1><p>This is <strong>bold</strong> text.</p>' }
    ]);

    // Test Writerside Markdown conversion
    await uploadFiles(page, testFiles);

    await page.getByRole('combobox', { name: /output format/i }).click();
    await page.getByText('Writerside Markdown').click();

    await page.getByText('Convert Project').click();

    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;

    const buffer = await download.createReadStream().then(stream => {
      const chunks: Buffer[] = [];
      return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });

    const zip = await JSZip.loadAsync(buffer);
    const fileNames = Object.keys(zip.files);

    expect(fileNames).toContain('test.md');

    const content = await zip.files['test.md'].async('string');
    expect(content).toContain('# Test Document');
    expect(content).toContain('**bold**');
  });

  test('should handle conversion errors gracefully', async ({ page }) => {
    // Create files with various issues
    const testFiles = await createTestFileList([
      { name: 'valid.htm', content: '<h1>Valid File</h1><p>This is valid.</p>' },
      { name: 'empty.htm', content: '' },
      { name: 'malformed.htm', content: '<h1>Malformed <p>Invalid HTML' }
    ]);

    await uploadFiles(page, testFiles);

    await page.getByText('Convert Project').click();

    // Should still proceed with conversion
    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    // Check if error messages are displayed
    const errorMessages = page.getByText(/error/i);
    if (await errorMessages.count() > 0) {
      // Some files might have failed conversion
      await expect(errorMessages.first()).toBeVisible();
    }
  });

  test('should show conversion progress for large batches', async ({ page }) => {
    // Create a larger set of files
    const testFiles = await createTestFileList(
      Array.from({ length: 10 }, (_, i) => ({
        name: `doc${i + 1}.htm`,
        content: `<h1>Document ${i + 1}</h1><p>Content for document ${i + 1}.</p>`
      }))
    );

    await uploadFiles(page, testFiles);

    await page.getByText('Convert Project').click();

    // Should show progress indicator
    await expect(page.getByText(/converting/i)).toBeVisible();
    
    // Progress should eventually complete
    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  test('should handle mixed file types in project folder', async ({ page }) => {
    const testFiles = await createTestFileList([
      { name: 'document.htm', content: '<h1>HTML Document</h1>' },
      { name: 'readme.txt', content: 'This is a text file' },
      { name: 'image.png', content: 'fake-png-data', binary: true },
      { name: 'madcap.htm', content: '<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd"><h1>MadCap File</h1></html>' }
    ]);

    await uploadFiles(page, testFiles);

    await page.getByText('Convert Project').click();

    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;

    const buffer = await download.createReadStream().then(stream => {
      const chunks: Buffer[] = [];
      return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });

    const zip = await JSZip.loadAsync(buffer);
    const fileNames = Object.keys(zip.files);

    // Only supported files should be converted
    expect(fileNames).toContain('document.adoc');
    expect(fileNames).toContain('madcap.adoc');
    expect(fileNames).not.toContain('readme.txt');
    expect(fileNames).not.toContain('image.png');
  });

  test('should validate folder upload requirements', async ({ page }) => {
    // Try to convert without uploading files
    await page.getByText('Convert Project').click();

    // Should show validation error
    await expect(page.getByText(/no files selected/i)).toBeVisible();

    // Upload single file (not a folder)
    const singleFile = await createTestFileList([
      { name: 'single.htm', content: '<h1>Single File</h1>' }
    ]);

    await uploadFiles(page, singleFile);

    // Should accept single file upload for project conversion
    await page.getByText('Convert Project').click();

    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  test('should handle advanced conversion options', async ({ page }) => {
    const testFiles = await createTestFileList([
      { name: 'advanced.htm', content: '<h1>Advanced Document</h1><p>With <span data-mc-variable="General.ProductName">variables</span></p>' }
    ]);

    await uploadFiles(page, testFiles);

    // Enable advanced options if available
    const advancedToggle = page.getByText(/advanced options/i).or(page.getByText(/show options/i));
    if (await advancedToggle.count() > 0) {
      await advancedToggle.click();

      // Configure specific options if they appear
      const preserveFormattingToggle = page.getByRole('switch', { name: /preserve formatting/i });
      if (await preserveFormattingToggle.count() > 0) {
        await preserveFormattingToggle.click();
      }

      const extractVariablesToggle = page.getByRole('switch', { name: /extract variables/i });
      if (await extractVariablesToggle.count() > 0) {
        await extractVariablesToggle.click();
      }
    }

    await page.getByText('Convert Project').click();

    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });
});

// Helper functions

async function createSampleMadCapProject(baseDir: string): Promise<void> {
  const contentDir = path.join(baseDir, 'Content');
  await fs.mkdir(contentDir, { recursive: true });

  const files = [
    {
      path: path.join(contentDir, 'overview.htm'),
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
        <head><title>Project Overview</title></head>
        <body>
          <h1>Project Overview</h1>
          <p>This is the main project overview document.</p>
          <div class="mc-note">
            <p>This is an important note.</p>
          </div>
        </body>
      </html>`
    },
    {
      path: path.join(contentDir, 'getting-started.htm'),
      content: `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
        <head><title>Getting Started</title></head>
        <body>
          <h1>Getting Started</h1>
          <p>Learn how to get started with <span data-mc-variable="General.ProductName">Our Product</span>.</p>
          <ol>
            <li>First step</li>
            <li>Second step</li>
            <li>Third step</li>
          </ol>
        </body>
      </html>`
    }
  ];

  for (const file of files) {
    await fs.writeFile(file.path, file.content);
  }
}

async function createTestFileList(fileDefinitions: Array<{ 
  name: string; 
  content: string; 
  binary?: boolean 
}>): Promise<Array<{ name: string; content: Buffer; type: string; webkitRelativePath: string }>> {
  return fileDefinitions.map(def => ({
    name: path.basename(def.name),
    content: def.binary ? Buffer.from(def.content, 'binary') : Buffer.from(def.content, 'utf-8'),
    type: def.name.endsWith('.htm') || def.name.endsWith('.html') ? 'text/html' : 'text/plain',
    webkitRelativePath: def.name
  }));
}

async function uploadFiles(page: Page, files: Array<{ 
  name: string; 
  content: Buffer; 
  type: string; 
  webkitRelativePath: string 
}>): Promise<void> {
  // Set up file chooser promise before clicking
  const fileChooserPromise = page.waitForEvent('filechooser');
  
  // Click the upload area
  await page.getByText('Drop your project folder here or click to browse').click();
  
  const fileChooser = await fileChooserPromise;
  
  // Convert our test files to the format expected by Playwright
  const playwrightFiles = files.map(file => ({
    name: file.name,
    mimeType: file.type,
    buffer: file.content
  }));
  
  await fileChooser.setFiles(playwrightFiles);
  
  // Wait for files to be processed
  await page.waitForTimeout(1000);
}
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('MadCap Converter E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the main page', async ({ page }) => {
    // Check that the page loads and shows the main heading
    await expect(page.getByText('MadCap Converter')).toBeVisible();
    await expect(page.getByText('Convert MadCap Flare files to various formats')).toBeVisible();
    
    // Check that both tabs are present
    await expect(page.getByText('Single File')).toBeVisible();
    await expect(page.getByText('Project Folder')).toBeVisible();
    
    // Check that theme toggle is present
    await expect(page.getByRole('button', { name: /toggle theme/i })).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Initially on Single File tab
    await expect(page.getByText('Drop your file here or click to browse')).toBeVisible();
    
    // Switch to Project Folder tab
    await page.getByText('Project Folder').click();
    await expect(page.getByText('Drop your project folder here or click to browse')).toBeVisible();
    
    // Switch back to Single File tab
    await page.getByText('Single File').click();
    await expect(page.getByText('Drop your file here or click to browse')).toBeVisible();
  });

  test('should change format selection', async ({ page }) => {
    // Click on format dropdown
    await page.getByRole('combobox', { name: /output format/i }).click();
    
    // Select Writerside Markdown
    await page.getByText('Writerside Markdown').click();
    
    // Verify selection
    await expect(page.getByDisplayValue('Writerside Markdown')).toBeVisible();
  });

  test('should change input type selection', async ({ page }) => {
    // Click on input type dropdown  
    await page.getByRole('combobox', { name: /input type/i }).click();
    
    // Select MadCap Flare
    await page.getByText('MadCap Flare').click();
    
    // Verify selection
    await expect(page.getByDisplayValue('MadCap Flare')).toBeVisible();
  });

  test('should convert text input', async ({ page }) => {
    // Enter HTML content in textarea
    const htmlContent = '<h1>Test Title</h1><p>This is a test paragraph.</p>';
    await page.getByPlaceholder('Paste your HTML content here...').fill(htmlContent);
    
    // Click convert button
    await page.getByText('Convert').click();
    
    // Wait for conversion to complete and check for converted content
    await page.waitForSelector('[data-testid="converted-content"]', { timeout: 10000 });
    
    // Check that AsciiDoc content is displayed
    const convertedContent = page.getByTestId('converted-content');
    await expect(convertedContent).toContainText('= Test Title');
    await expect(convertedContent).toContainText('This is a test paragraph.');
  });

  test('should handle conversion errors gracefully', async ({ page }) => {
    // Leave input empty and try to convert
    await page.getByText('Convert').click();
    
    // Should show error message
    await expect(page.getByText(/error/i)).toBeVisible({ timeout: 5000 });
  });

  test('should toggle batch conversion options', async ({ page }) => {
    // Switch to Project Folder tab
    await page.getByText('Project Folder').click();
    
    // Check that batch options are visible
    await expect(page.getByText('Preserve folder structure')).toBeVisible();
    await expect(page.getByText('Rename converted files')).toBeVisible();
    
    // Toggle preserve structure (should be on by default)
    const preserveToggle = page.getByRole('switch', { name: /preserve folder structure/i });
    await expect(preserveToggle).toBeChecked();
    await preserveToggle.click();
    await expect(preserveToggle).not.toBeChecked();
    
    // Toggle rename files (should be off by default)
    const renameToggle = page.getByRole('switch', { name: /rename converted files/i });
    await expect(renameToggle).not.toBeChecked();
    await renameToggle.click();
    await expect(renameToggle).toBeChecked();
  });

  test('should update output folder name', async ({ page }) => {
    // Switch to Project Folder tab
    await page.getByText('Project Folder').click();
    
    // Find and update output folder name
    const folderNameInput = page.getByDisplayValue('converted-madcap-project');
    await folderNameInput.clear();
    await folderNameInput.fill('my-custom-project');
    
    await expect(folderNameInput).toHaveValue('my-custom-project');
  });

  test('should handle theme switching', async ({ page }) => {
    // Click theme toggle
    const themeToggle = page.getByRole('button', { name: /toggle theme/i });
    await themeToggle.click();
    
    // Check that theme changed (this would depend on your theme implementation)
    // You might check for dark mode classes or CSS properties
    const html = page.locator('html');
    await expect(html).toHaveAttribute('class', /dark/);
  });

  test('should show loading state during conversion', async ({ page }) => {
    // Enter content
    await page.getByPlaceholder('Paste your HTML content here...').fill('<h1>Test</h1>');
    
    // Click convert and immediately check for loading state
    await page.getByText('Convert').click();
    
    // Should show loading text briefly
    await expect(page.getByText('Converting...')).toBeVisible();
    
    // Should return to normal state
    await expect(page.getByText('Convert')).toBeVisible({ timeout: 10000 });
  });

  test('should handle different format conversions', async ({ page }) => {
    const testContent = '<h1>Test Title</h1><p>Test content with <strong>bold</strong> text.</p>';
    
    // Test AsciiDoc conversion
    await page.getByPlaceholder('Paste your HTML content here...').fill(testContent);
    await page.getByText('Convert').click();
    await page.waitForSelector('[data-testid="converted-content"]', { timeout: 10000 });
    let convertedContent = page.getByTestId('converted-content');
    await expect(convertedContent).toContainText('= Test Title');
    
    // Clear content
    await page.getByTestId('converted-content').locator('button[aria-label="Clear"]').click();
    
    // Test Writerside Markdown conversion
    await page.getByRole('combobox', { name: /output format/i }).click();
    await page.getByText('Writerside Markdown').click();
    
    await page.getByPlaceholder('Paste your HTML content here...').fill(testContent);
    await page.getByText('Convert').click();
    await page.waitForSelector('[data-testid="converted-content"]', { timeout: 10000 });
    convertedContent = page.getByTestId('converted-content');
    await expect(convertedContent).toContainText('# Test Title');
    await expect(convertedContent).toContainText('**bold**');
  });

  test('should provide download functionality', async ({ page }) => {
    // Convert some content
    await page.getByPlaceholder('Paste your HTML content here...').fill('<h1>Download Test</h1>');
    await page.getByText('Convert').click();
    await page.waitForSelector('[data-testid="converted-content"]', { timeout: 10000 });
    
    // Set up download promise before clicking
    const downloadPromise = page.waitForEvent('download');
    
    // Click download button
    await page.getByRole('button', { name: /download/i }).click();
    
    // Wait for download
    const download = await downloadPromise;
    
    // Check download properties
    expect(download.suggestedFilename()).toMatch(/\.adoc$/);
  });

  test('should handle file upload', async ({ page }) => {
    // Create a temporary test file
    const testContent = '<h1>File Upload Test</h1><p>This content came from a file.</p>';
    
    // Set up file chooser
    const fileChooserPromise = page.waitForEvent('filechooser');
    
    // Click the file upload area
    await page.getByText('Drop your file here or click to browse').click();
    
    const fileChooser = await fileChooserPromise;
    
    // Create a temporary file
    const testFile = {
      name: 'test.htm',
      mimeType: 'text/html',
      buffer: Buffer.from(testContent)
    };
    
    await fileChooser.setFiles([testFile]);
    
    // Wait for file to be processed and conversion to complete
    await page.waitForSelector('[data-testid="converted-content"]', { timeout: 10000 });
    
    // Check converted content
    const convertedContent = page.getByTestId('converted-content');
    await expect(convertedContent).toContainText('= File Upload Test');
    await expect(convertedContent).toContainText('This content came from a file.');
  });

  test('should handle drag and drop', async ({ page }) => {
    // This test simulates drag and drop behavior
    const dropZone = page.getByText('Drop your file here or click to browse').locator('..');
    
    // Create test file data
    const testContent = '<h1>Drag Drop Test</h1>';
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    
    // Simulate file drop
    await page.evaluate(async (args) => {
      const [dropZoneSelector, content] = args;
      const dropZone = document.querySelector(dropZoneSelector);
      const file = new File([content], 'drag-test.htm', { type: 'text/html' });
      
      const dt = new DataTransfer();
      dt.items.add(file);
      
      const dropEvent = new DragEvent('drop', {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true
      });
      
      dropZone?.dispatchEvent(dropEvent);
    }, ['[data-testid="file-drop-zone"]', testContent]);
    
    // Wait for processing
    await page.waitForTimeout(1000);
    
    // This test might need adjustment based on actual drag/drop implementation
  });
});
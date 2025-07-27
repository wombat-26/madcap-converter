/**
 * @jest-environment node
 */

import { BatchService } from '../../src/core/services/batch-service.js';
import { DocumentService } from '../../src/core/services/document-service.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

describe('Batch Conversion Pipeline Integration Tests', () => {
  let batchService: BatchService;
  let testProjectDir: string;
  let outputDir: string;

  beforeAll(async () => {
    batchService = new BatchService();
    
    // Create test project directory
    testProjectDir = join(tmpdir(), `integration-test-${Date.now()}`);
    outputDir = join(tmpdir(), `integration-output-${Date.now()}`);
    
    await fs.mkdir(testProjectDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    
    // Create realistic test project structure
    await createRealisticTestProject(testProjectDir);
  });

  afterAll(async () => {
    // Cleanup test directories
    try {
      await fs.rmdir(testProjectDir, { recursive: true });
      await fs.rmdir(outputDir, { recursive: true });
    } catch (error) {
      // Directories might already be removed
    }
  });

  describe('Complete MadCap Project Conversion', () => {
    it('should convert a complete MadCap project with all components', async () => {
      const options = {
        format: 'asciidoc' as const,
        preserveStructure: true,
        copyImages: true,
        renameFiles: false,
        variableOptions: {
          extractVariables: true,
          variableMode: 'include' as const,
          variableFormat: 'adoc' as const
        }
      };

      const result = await batchService.convertFolder(testProjectDir, outputDir, options);

      // Verify basic conversion results
      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.convertedFiles).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      // Verify file structure preservation
      const outputFiles = await getAllFiles(outputDir);
      expect(outputFiles).toContain('Content/overview.adoc');
      expect(outputFiles).toContain('Content/Admin/user-management.adoc');
      expect(outputFiles).toContain('Content/Guides/getting-started.adoc');

      // Verify content conversion quality
      const overviewContent = await fs.readFile(join(outputDir, 'Content/overview.adoc'), 'utf-8');
      expect(overviewContent).toContain('= Project Overview');
      expect(overviewContent).toContain('[NOTE]');
      expect(overviewContent).toContain('Important information');

      // Verify table conversion
      const userMgmtContent = await fs.readFile(join(outputDir, 'Content/Admin/user-management.adoc'), 'utf-8');
      expect(userMgmtContent).toContain('|===');
      expect(userMgmtContent).toContain('| Name | Role | Permissions');

      // Verify list conversion
      const guideContent = await fs.readFile(join(outputDir, 'Content/Guides/getting-started.adoc'), 'utf-8');
      expect(guideContent).toContain('. First step');
      expect(guideContent).toContain('[loweralpha]');
      expect(guideContent).toContain('.. Sub-step a');

      // Verify images were copied
      const imageFiles = await getAllFiles(outputDir);
      expect(imageFiles.some(f => f.includes('screenshot.png'))).toBe(true);
      expect(imageFiles.some(f => f.includes('icon.svg'))).toBe(true);

      // Verify variable extraction
      expect(outputFiles.some(f => f.includes('variables.adoc'))).toBe(true);
    }, 30000);

    it('should handle Writerside conversion with instance generation', async () => {
      const writersideOutput = join(tmpdir(), `writerside-output-${Date.now()}`);
      await fs.mkdir(writersideOutput, { recursive: true });

      const options = {
        format: 'writerside-markdown' as const,
        preserveStructure: true,
        writersideOptions: {
          generateInstance: true,
          instanceName: 'user-docs'
        }
      };

      const result = await batchService.convertFolder(testProjectDir, writersideOutput, options);

      expect(result.convertedFiles).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      // Verify Markdown files were created
      const outputFiles = await getAllFiles(writersideOutput);
      expect(outputFiles).toContain('Content/overview.md');
      expect(outputFiles).toContain('Content/Guides/getting-started.md');

      // Verify Markdown content quality
      const overviewContent = await fs.readFile(join(writersideOutput, 'Content/overview.md'), 'utf-8');
      expect(overviewContent).toContain('# Project Overview');
      expect(overviewContent).toContain('> Important information');

      // Cleanup
      await fs.rmdir(writersideOutput, { recursive: true });
    }, 30000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle mixed valid and invalid files gracefully', async () => {
      const mixedProjectDir = join(tmpdir(), `mixed-test-${Date.now()}`);
      await fs.mkdir(mixedProjectDir, { recursive: true });

      // Create mix of valid and problematic files
      await fs.writeFile(join(mixedProjectDir, 'valid.htm'), '<h1>Valid File</h1><p>Good content</p>');
      await fs.writeFile(join(mixedProjectDir, 'empty.htm'), '');
      await fs.writeFile(join(mixedProjectDir, 'malformed.htm'), '<h1>Broken HTML <p>No closing tags');
      await fs.writeFile(join(mixedProjectDir, 'unsupported.xyz'), 'Unsupported file type');

      const mixedOutput = join(tmpdir(), `mixed-output-${Date.now()}`);
      await fs.mkdir(mixedOutput, { recursive: true });

      const result = await batchService.convertFolder(mixedProjectDir, mixedOutput, {
        format: 'asciidoc'
      });

      // Should have processed valid files and handled errors gracefully
      expect(result.totalFiles).toBe(3); // Unsupported file should be filtered out
      expect(result.convertedFiles).toBeGreaterThan(0);
      expect(result.skippedFiles).toBeGreaterThan(0);

      // Valid file should be converted
      const outputFiles = await getAllFiles(mixedOutput);
      expect(outputFiles).toContain('valid.adoc');

      // Cleanup
      await fs.rmdir(mixedProjectDir, { recursive: true });
      await fs.rmdir(mixedOutput, { recursive: true });
    });

    it('should recover from individual file conversion failures', async () => {
      const errorProjectDir = join(tmpdir(), `error-test-${Date.now()}`);
      await fs.mkdir(errorProjectDir, { recursive: true });

      // Create files with various potential issues
      await fs.writeFile(join(errorProjectDir, 'good1.htm'), '<h1>Good File 1</h1><p>Content</p>');
      await fs.writeFile(join(errorProjectDir, 'problematic.htm'), '<html><body><div data-mc-conditions="invalid-condition"><h1>Complex MadCap</h1></div></body></html>');
      await fs.writeFile(join(errorProjectDir, 'good2.htm'), '<h1>Good File 2</h1><p>More content</p>');

      const errorOutput = join(tmpdir(), `error-output-${Date.now()}`);
      await fs.mkdir(errorOutput, { recursive: true });

      const result = await batchService.convertFolder(errorProjectDir, errorOutput, {
        format: 'asciidoc'
      });

      // Should continue processing even if some files fail
      expect(result.totalFiles).toBe(3);
      expect(result.convertedFiles).toBeGreaterThanOrEqual(2); // At least the good files
      
      // Good files should be converted successfully
      const outputFiles = await getAllFiles(errorOutput);
      expect(outputFiles).toContain('good1.adoc');
      expect(outputFiles).toContain('good2.adoc');

      // Cleanup
      await fs.rmdir(errorProjectDir, { recursive: true });
      await fs.rmdir(errorOutput, { recursive: true });
    });
  });

  describe('Performance and Scale Testing', () => {
    it('should handle large batch processing efficiently', async () => {
      const largeBatchDir = join(tmpdir(), `large-batch-${Date.now()}`);
      await fs.mkdir(largeBatchDir, { recursive: true });

      // Create 25 files of varying sizes
      const filePromises = Array.from({ length: 25 }, async (_, i) => {
        const content = generateLargeHTMLContent(i);
        await fs.writeFile(join(largeBatchDir, `document-${i + 1}.htm`), content);
      });
      await Promise.all(filePromises);

      const largeBatchOutput = join(tmpdir(), `large-batch-output-${Date.now()}`);
      await fs.mkdir(largeBatchOutput, { recursive: true });

      const startTime = Date.now();

      const result = await batchService.convertFolder(largeBatchDir, largeBatchOutput, {
        format: 'asciidoc',
        preserveStructure: false // Flatten for simpler testing
      });

      const duration = Date.now() - startTime;

      // Performance expectations
      expect(result.convertedFiles).toBe(25);
      expect(result.errors).toHaveLength(0);
      expect(duration).toBeLessThan(60000); // Should complete within 60 seconds

      // Verify all files were converted
      const outputFiles = await getAllFiles(largeBatchOutput);
      expect(outputFiles.filter(f => f.endsWith('.adoc'))).toHaveLength(25);

      // Sample content verification
      const sampleContent = await fs.readFile(join(largeBatchOutput, 'document-1.adoc'), 'utf-8');
      expect(sampleContent).toContain('= Document 1 Title');
      expect(sampleContent).toContain('|==='); // Tables should be converted

      // Cleanup
      await fs.rmdir(largeBatchDir, { recursive: true });
      await fs.rmdir(largeBatchOutput, { recursive: true });
    }, 90000);

    it('should manage memory efficiently during large conversions', async () => {
      const memoryTestDir = join(tmpdir(), `memory-test-${Date.now()}`);
      await fs.mkdir(memoryTestDir, { recursive: true });

      // Create files with substantial content
      const largeFilePromises = Array.from({ length: 10 }, async (_, i) => {
        const content = generateVeryLargeHTMLContent(i);
        await fs.writeFile(join(memoryTestDir, `large-doc-${i + 1}.htm`), content);
      });
      await Promise.all(largeFilePromises);

      const memoryTestOutput = join(tmpdir(), `memory-test-output-${Date.now()}`);
      await fs.mkdir(memoryTestOutput, { recursive: true });

      const initialMemory = process.memoryUsage();

      const result = await batchService.convertFolder(memoryTestDir, memoryTestOutput, {
        format: 'asciidoc'
      });

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory should not increase dramatically (less than 500MB for this test)
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024);
      expect(result.convertedFiles).toBe(10);
      expect(result.errors).toHaveLength(0);

      // Cleanup
      await fs.rmdir(memoryTestDir, { recursive: true });
      await fs.rmdir(memoryTestOutput, { recursive: true });
    }, 120000);
  });

  describe('Cross-Reference and Link Resolution', () => {
    it('should resolve cross-references between converted files', async () => {
      const linkTestDir = join(tmpdir(), `link-test-${Date.now()}`);
      await fs.mkdir(linkTestDir, { recursive: true });

      // Create files with cross-references
      await fs.writeFile(join(linkTestDir, 'main.htm'), `
        <h1>Main Document</h1>
        <p>See <a href="guide.htm">the guide</a> for more information.</p>
        <p>Also check <a href="reference.htm#section1">section 1</a> in the reference.</p>
      `);

      await fs.writeFile(join(linkTestDir, 'guide.htm'), `
        <h1>User Guide</h1>
        <p>This guide explains how to use the system.</p>
        <p>Return to <a href="main.htm">main document</a>.</p>
      `);

      await fs.writeFile(join(linkTestDir, 'reference.htm'), `
        <h1>Reference</h1>
        <h2 id="section1">Section 1</h2>
        <p>Reference content here.</p>
      `);

      const linkTestOutput = join(tmpdir(), `link-test-output-${Date.now()}`);
      await fs.mkdir(linkTestOutput, { recursive: true });

      const result = await batchService.convertFolder(linkTestDir, linkTestOutput, {
        format: 'asciidoc',
        renameFiles: false // Keep original names for link testing
      });

      expect(result.convertedFiles).toBe(3);
      expect(result.errors).toHaveLength(0);

      // Verify cross-references were updated
      const mainContent = await fs.readFile(join(linkTestOutput, 'main.adoc'), 'utf-8');
      expect(mainContent).toContain('xref:guide.adoc[the guide]');
      expect(mainContent).toContain('xref:reference.adoc#section1[section 1]');

      const guideContent = await fs.readFile(join(linkTestOutput, 'guide.adoc'), 'utf-8');
      expect(guideContent).toContain('xref:main.adoc[main document]');

      // Cleanup
      await fs.rmdir(linkTestDir, { recursive: true });
      await fs.rmdir(linkTestOutput, { recursive: true });
    });

    it('should handle link resolution with file renaming', async () => {
      const renameTestDir = join(tmpdir(), `rename-test-${Date.now()}`);
      await fs.mkdir(renameTestDir, { recursive: true });

      await fs.writeFile(join(renameTestDir, 'doc1.htm'), `
        <h1>First Document</h1>
        <p>Link to <a href="doc2.htm">second document</a>.</p>
      `);

      await fs.writeFile(join(renameTestDir, 'doc2.htm'), `
        <h1>Second Document</h1>
        <p>Link back to <a href="doc1.htm">first document</a>.</p>
      `);

      const renameTestOutput = join(tmpdir(), `rename-test-output-${Date.now()}`);
      await fs.mkdir(renameTestOutput, { recursive: true });

      const result = await batchService.convertFolder(renameTestDir, renameTestOutput, {
        format: 'asciidoc',
        renameFiles: true // Enable file renaming based on H1
      });

      expect(result.convertedFiles).toBe(2);
      expect(result.filenameMapping?.size).toBe(2);

      // Files should be renamed and cross-references updated
      const outputFiles = await getAllFiles(renameTestOutput);
      expect(outputFiles).toContain('first-document.adoc');
      expect(outputFiles).toContain('second-document.adoc');

      // Verify cross-references were updated to use new names
      const firstDocContent = await fs.readFile(join(renameTestOutput, 'first-document.adoc'), 'utf-8');
      expect(firstDocContent).toContain('xref:second-document.adoc[second document]');

      const secondDocContent = await fs.readFile(join(renameTestOutput, 'second-document.adoc'), 'utf-8');
      expect(secondDocContent).toContain('xref:first-document.adoc[first document]');

      // Cleanup
      await fs.rmdir(renameTestDir, { recursive: true });
      await fs.rmdir(renameTestOutput, { recursive: true });
    });
  });

  describe('Advanced MadCap Features Integration', () => {
    it('should handle complex MadCap elements in batch conversion', async () => {
      const complexMadCapDir = join(tmpdir(), `complex-madcap-${Date.now()}`);
      await fs.mkdir(complexMadCapDir, { recursive: true });

      await fs.writeFile(join(complexMadCapDir, 'complex.htm'), `
        <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
          <head><title>Complex MadCap Features</title></head>
          <body>
            <h1>Complex MadCap Document</h1>
            
            <MadCap:dropDown>
              <MadCap:dropDownHead>
                <MadCap:dropDownHotspot>Expandable Section</MadCap:dropDownHotspot>
              </MadCap:dropDownHead>
              <MadCap:dropDownBody>
                <p>This content is in a dropdown.</p>
                <ol style="list-style-type: lower-alpha;">
                  <li>First alphabetic item</li>
                  <li>Second alphabetic item</li>
                </ol>
              </MadCap:dropDownBody>
            </MadCap:dropDown>
            
            <p>Variable example: <span data-mc-variable="General.ProductName">Product Name</span></p>
            
            <div class="mc-warning">
              <p>This is a warning admonition.</p>
            </div>
            
            <table>
              <thead>
                <tr><th>Column 1</th><th>Column 2</th></tr>
              </thead>
              <tbody>
                <tr><td>Data 1</td><td>Data 2</td></tr>
              </tbody>
            </table>
          </body>
        </html>
      `);

      const complexOutput = join(tmpdir(), `complex-output-${Date.now()}`);
      await fs.mkdir(complexOutput, { recursive: true });

      const result = await batchService.convertFolder(complexMadCapDir, complexOutput, {
        format: 'asciidoc',
        inputType: 'madcap',
        variableOptions: {
          extractVariables: true,
          variableMode: 'include'
        }
      });

      expect(result.convertedFiles).toBe(1);
      expect(result.errors).toHaveLength(0);

      const content = await fs.readFile(join(complexOutput, 'complex.adoc'), 'utf-8');
      
      // Verify dropdown conversion
      expect(content).toContain('=== Expandable Section');
      
      // Verify alphabetic list conversion
      expect(content).toContain('[loweralpha]');
      expect(content).toContain('. First alphabetic item');
      
      // Verify admonition conversion
      expect(content).toContain('[WARNING]');
      
      // Verify table conversion
      expect(content).toContain('|===');
      expect(content).toContain('| Column 1 | Column 2');
      
      // Verify variable handling
      expect(content).toMatch(/\{[^}]+\}|include::/); // Should have variable reference or include

      // Cleanup
      await fs.rmdir(complexMadCapDir, { recursive: true });
      await fs.rmdir(complexOutput, { recursive: true });
    });
  });
});

// Helper functions

async function createRealisticTestProject(baseDir: string): Promise<void> {
  const contentDir = join(baseDir, 'Content');
  const adminDir = join(contentDir, 'Admin');
  const guidesDir = join(contentDir, 'Guides');
  const imagesDir = join(baseDir, 'Images');

  await fs.mkdir(adminDir, { recursive: true });
  await fs.mkdir(guidesDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });

  // Main overview file
  await fs.writeFile(join(contentDir, 'overview.htm'), `
    <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
      <head><title>Project Overview</title></head>
      <body>
        <h1>Project Overview</h1>
        <p>Welcome to our comprehensive documentation project.</p>
        <div class="mc-note">
          <p>Important information about this project.</p>
        </div>
        <p>See the <a href="Guides/getting-started.htm">getting started guide</a> for more details.</p>
      </body>
    </html>
  `);

  // Admin section with tables
  await fs.writeFile(join(adminDir, 'user-management.htm'), `
    <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
      <head><title>User Management</title></head>
      <body>
        <h1>User Management</h1>
        <p>Manage system users and their permissions.</p>
        <table>
          <thead>
            <tr><th>Name</th><th>Role</th><th>Permissions</th></tr>
          </thead>
          <tbody>
            <tr><td>Admin</td><td>Administrator</td><td>Full Access</td></tr>
            <tr><td>User</td><td>Standard User</td><td>Limited Access</td></tr>
          </tbody>
        </table>
        <div class="mc-tip">
          <p>Always assign appropriate permissions to users.</p>
        </div>
      </body>
    </html>
  `);

  // Guides with complex lists
  await fs.writeFile(join(guidesDir, 'getting-started.htm'), `
    <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
      <head><title>Getting Started Guide</title></head>
      <body>
        <h1>Getting Started Guide</h1>
        <p>Follow these steps to get started:</p>
        <ol>
          <li>First step: Set up your environment
            <ol style="list-style-type: lower-alpha;">
              <li>Sub-step a: Install software</li>
              <li>Sub-step b: Configure settings</li>
            </ol>
          </li>
          <li>Second step: Create your project</li>
          <li>Third step: Test your setup</li>
        </ol>
        <p>Product reference: <span data-mc-variable="General.ProductName">Our Product</span></p>
        <img src="../Images/screenshot.png" alt="Screenshot example" />
      </body>
    </html>
  `);

  // Create dummy image files
  await fs.writeFile(join(imagesDir, 'screenshot.png'), 'fake-png-data');
  await fs.writeFile(join(imagesDir, 'icon.svg'), '<svg>fake-svg-data</svg>');
}

async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function scan(currentDir: string, basePath: string = ''): Promise<void> {
    const entries = await fs.readdir(currentDir);
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const relativePath = basePath ? join(basePath, entry) : entry;
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        await scan(fullPath, relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }
  
  await scan(dir);
  return files;
}

function generateLargeHTMLContent(index: number): string {
  const sections = Array.from({ length: 10 }, (_, i) => `
    <h2>Section ${i + 1}</h2>
    <p>This is section ${i + 1} of document ${index + 1}. It contains substantial content to test performance.</p>
    <ul>
      <li>List item 1 in section ${i + 1}</li>
      <li>List item 2 in section ${i + 1}</li>
      <li>List item 3 in section ${i + 1}</li>
    </ul>
    <table>
      <tr><th>Header 1</th><th>Header 2</th></tr>
      <tr><td>Data ${i + 1}-1</td><td>Data ${i + 1}-2</td></tr>
    </table>
  `).join('\n');

  return `
    <html>
      <head><title>Document ${index + 1} Title</title></head>
      <body>
        <h1>Document ${index + 1} Title</h1>
        <p>This is a large document generated for performance testing.</p>
        ${sections}
      </body>
    </html>
  `;
}

function generateVeryLargeHTMLContent(index: number): string {
  const content = generateLargeHTMLContent(index);
  // Repeat the content multiple times to create very large files
  return Array.from({ length: 5 }, () => content).join('\n');
}
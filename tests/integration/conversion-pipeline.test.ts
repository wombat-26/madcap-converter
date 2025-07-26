/**
 * @jest-environment node
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, mkdir, readFile, rmdir } from 'fs/promises';

// Mock the problematic dependencies
jest.mock('../../src/core/services/madcap-htm-validator', () => ({
  MadCapHTMValidator: jest.fn().mockImplementation(() => ({
    validate: jest.fn().mockResolvedValue({ isValid: true, errors: [] })
  }))
}));

jest.mock('w3c-html-validator', () => ({
  w3cHtmlValidator: jest.fn().mockResolvedValue({ isValid: true, errors: [] })
}));

jest.mock('html-validate', () => ({
  HtmlValidate: jest.fn().mockImplementation(() => ({
    validateString: jest.fn().mockReturnValue({ valid: true, results: [] })
  }))
}));

describe('Conversion Pipeline Integration Tests', () => {
  let testDir: string;
  let SimpleDocumentService: any;
  let SimpleBatchService: any;

  beforeAll(async () => {
    testDir = join(tmpdir(), `integration-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await rmdir(testDir, { recursive: true });
    } catch (error) {
      // Directory might already be removed
    }
  });

  beforeEach(async () => {
    // Import services after mocking
    const documentServiceModule = await import('../../src/core/simple-document-service');
    const batchServiceModule = await import('../../src/core/simple-batch-service');
    
    SimpleDocumentService = documentServiceModule.SimpleDocumentService;
    SimpleBatchService = batchServiceModule.SimpleBatchService;
  });

  describe('Document Service Integration', () => {
    it('should convert HTML string to AsciiDoc', async () => {
      const documentService = new SimpleDocumentService();
      const htmlContent = '<h1>Integration Test</h1><p>This is a test paragraph with <strong>bold text</strong>.</p>';
      
      const result = await documentService.convertString(htmlContent, {
        format: 'asciidoc',
        inputType: 'html',
        preserveFormatting: true
      });
      
      expect(result.content).toContain('= Integration Test');
      expect(result.content).toContain('This is a test paragraph');
      expect(result.content).toContain('*bold text*');
      expect(result.metadata.format).toBe('asciidoc');
    });

    it('should convert HTML string to Writerside Markdown', async () => {
      const documentService = new SimpleDocumentService();
      const htmlContent = '<h1>Markdown Test</h1><p>This is a paragraph with <em>italic text</em>.</p>';
      
      const result = await documentService.convertString(htmlContent, {
        format: 'writerside-markdown',
        inputType: 'html',
        preserveFormatting: true
      });
      
      expect(result.content).toContain('# Markdown Test');
      expect(result.content).toContain('This is a paragraph');
      expect(result.content).toContain('*italic text*');
      expect(result.metadata.format).toBe('writerside-markdown');
    });

    it('should convert MadCap content with variables', async () => {
      const documentService = new SimpleDocumentService();
      const madcapContent = `
        <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
          <head><title>Variable Test</title></head>
          <body>
            <h1>Product Guide</h1>
            <p>Welcome to <span data-mc-variable="General.ProductName">MyProduct</span>!</p>
            <p class="mc-note">This is an important note.</p>
          </body>
        </html>
      `;
      
      const result = await documentService.convertString(madcapContent, {
        format: 'asciidoc',
        inputType: 'madcap',
        variableOptions: {
          extractVariables: true,
          variableMode: 'flatten'
        }
      });
      
      expect(result.content).toContain('= Product Guide');
      expect(result.content).toContain('Welcome to MyProduct');
      expect(result.content).toContain('NOTE:');
      expect(result.metadata.format).toBe('asciidoc');
    });

    it('should handle file conversion', async () => {
      const documentService = new SimpleDocumentService();
      const testFile = join(testDir, 'test-file.htm');
      const htmlContent = '<h1>File Test</h1><p>Content from file.</p>';
      
      await writeFile(testFile, htmlContent);
      
      const result = await documentService.convertFile(testFile, {
        format: 'asciidoc',
        inputType: 'html',
        outputPath: join(testDir, 'output.adoc')
      });
      
      expect(result.content).toContain('= File Test');
      expect(result.content).toContain('Content from file.');
      
      // Check that output file was created
      const outputExists = await readFile(join(testDir, 'output.adoc'), 'utf-8');
      expect(outputExists).toContain('= File Test');
    });

    it('should handle conversion errors gracefully', async () => {
      const documentService = new SimpleDocumentService();
      
      await expect(documentService.convertString('', {
        format: 'invalid-format' as any,
        inputType: 'html'
      })).rejects.toThrow();
    });
  });

  describe('Batch Service Integration', () => {
    it('should convert multiple files', async () => {
      const batchService = new SimpleBatchService();
      const inputDir = join(testDir, 'batch-input');
      const outputDir = join(testDir, 'batch-output');
      
      await mkdir(inputDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });
      
      // Create test files
      await writeFile(join(inputDir, 'file1.htm'), '<h1>File 1</h1><p>Content 1</p>');
      await writeFile(join(inputDir, 'file2.htm'), '<h1>File 2</h1><p>Content 2</p>');
      
      const result = await batchService.convertFolder(inputDir, outputDir, {
        format: 'asciidoc',
        inputType: 'html',
        preserveStructure: true,
        renameFiles: false
      });
      
      expect(result.processedFiles).toBe(2);
      expect(result.errors).toHaveLength(0);
      
      // Check output files
      const output1 = await readFile(join(outputDir, 'file1.adoc'), 'utf-8');
      const output2 = await readFile(join(outputDir, 'file2.adoc'), 'utf-8');
      
      expect(output1).toContain('= File 1');
      expect(output2).toContain('= File 2');
    });

    it('should preserve folder structure when requested', async () => {
      const batchService = new SimpleBatchService();
      const inputDir = join(testDir, 'structured-input');
      const outputDir = join(testDir, 'structured-output');
      
      await mkdir(join(inputDir, 'subfolder'), { recursive: true });
      await mkdir(outputDir, { recursive: true });
      
      // Create files in structure
      await writeFile(join(inputDir, 'root.htm'), '<h1>Root File</h1>');
      await writeFile(join(inputDir, 'subfolder', 'sub.htm'), '<h1>Sub File</h1>');
      
      const result = await batchService.convertFolder(inputDir, outputDir, {
        format: 'asciidoc',
        inputType: 'html',
        preserveStructure: true,
        renameFiles: false
      });
      
      expect(result.processedFiles).toBe(2);
      
      // Check that structure is preserved
      const rootOutput = await readFile(join(outputDir, 'root.adoc'), 'utf-8');
      const subOutput = await readFile(join(outputDir, 'subfolder', 'sub.adoc'), 'utf-8');
      
      expect(rootOutput).toContain('= Root File');
      expect(subOutput).toContain('= Sub File');
    });

    it('should handle file renaming', async () => {
      const batchService = new SimpleBatchService();
      const inputDir = join(testDir, 'rename-input');
      const outputDir = join(testDir, 'rename-output');
      
      await mkdir(inputDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });
      
      await writeFile(join(inputDir, 'original.htm'), '<h1>Original</h1>');
      
      const result = await batchService.convertFolder(inputDir, outputDir, {
        format: 'asciidoc',
        inputType: 'html',
        preserveStructure: false,
        renameFiles: true
      });
      
      expect(result.processedFiles).toBe(1);
      
      // File should be renamed with the format extension
      const output = await readFile(join(outputDir, 'original.adoc'), 'utf-8');
      expect(output).toContain('= Original');
    });
  });

  describe('End-to-End Conversion Workflows', () => {
    it('should handle complete MadCap to AsciiDoc workflow', async () => {
      const documentService = new SimpleDocumentService();
      const madcapProject = `
        <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
          <head>
            <title>Complete Workflow Test</title>
          </head>
          <body>
            <h1>User Guide</h1>
            <h2>Getting Started</h2>
            <p>Welcome to <span data-mc-variable="General.ProductName">MyApp</span>.</p>
            
            <h3>Prerequisites</h3>
            <ol>
              <li>System requirements</li>
              <li>Installation steps</li>
              <li>Configuration</li>
            </ol>
            
            <div class="mc-note">
              <p>Make sure to backup your data before proceeding.</p>
            </div>
            
            <h2>Advanced Features</h2>
            <p>This section covers advanced topics:</p>
            <ul>
              <li>Custom configurations</li>
              <li>API integration</li>
              <li>Troubleshooting</li>
            </ul>
            
            <div class="mc-warning">
              <p>These features require administrative privileges.</p>
            </div>
          </body>
        </html>
      `;
      
      const result = await documentService.convertString(madcapProject, {
        format: 'asciidoc',
        inputType: 'madcap',
        preserveFormatting: true,
        variableOptions: {
          extractVariables: true,
          variableMode: 'flatten'
        },
        asciidocOptions: {
          enableValidation: true,
          validationStrictness: 'normal'
        }
      });
      
      // Verify complete AsciiDoc structure
      expect(result.content).toContain('= User Guide');
      expect(result.content).toContain('== Getting Started');
      expect(result.content).toContain('=== Prerequisites');
      expect(result.content).toContain('Welcome to MyApp');
      expect(result.content).toContain('. System requirements');
      expect(result.content).toContain('* Custom configurations');
      expect(result.content).toContain('NOTE:');
      expect(result.content).toContain('WARNING:');
      
      // Check metadata
      expect(result.metadata.format).toBe('asciidoc');
      expect(result.metadata.originalFormat).toBe('madcap');
    });

    it('should handle Writerside Markdown workflow with semantic elements', async () => {
      const documentService = new SimpleDocumentService();
      const htmlContent = `
        <html>
          <head><title>Markdown Workflow</title></head>
          <body>
            <h1>API Documentation</h1>
            <h2>Authentication</h2>
            <p>This API uses token-based authentication.</p>
            
            <div class="procedure">
              <h3>Setup Steps</h3>
              <ol>
                <li>Generate API token</li>
                <li>Configure headers</li>
                <li>Test connection</li>
              </ol>
            </div>
            
            <div class="note">
              <p>Keep your tokens secure and rotate them regularly.</p>
            </div>
            
            <h2>Endpoints</h2>
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Endpoint</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>GET</td>
                  <td>/api/users</td>
                  <td>List users</td>
                </tr>
                <tr>
                  <td>POST</td>
                  <td>/api/users</td>
                  <td>Create user</td>
                </tr>
              </tbody>
            </table>
          </body>
        </html>
      `;
      
      const result = await documentService.convertString(htmlContent, {
        format: 'writerside-markdown',
        inputType: 'html',
        preserveFormatting: true
      });
      
      // Verify Markdown structure
      expect(result.content).toContain('# API Documentation');
      expect(result.content).toContain('## Authentication');
      expect(result.content).toContain('### Setup Steps');
      expect(result.content).toContain('1. Generate API token');
      expect(result.content).toContain('| Method | Endpoint | Description |');
      expect(result.content).toContain('| GET | /api/users | List users |');
      
      // Check for Writerside-specific elements
      expect(result.content).toMatch(/>\s*Keep your tokens secure/); // Blockquote format
      
      expect(result.metadata.format).toBe('writerside-markdown');
    });
  });
});
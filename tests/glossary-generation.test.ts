import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { DocumentService } from '../src/document-service.js';
import { BatchService } from '../src/batch-service.js';

describe('Glossary Generation Tests', () => {
  const testDir = join(__dirname, 'temp-glossary-test');
  const inputDir = join(testDir, 'input');
  const outputDir = join(testDir, 'output');
  let documentService: DocumentService;
  let batchService: BatchService;

  beforeEach(async () => {
    // Clean up and create test directories
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist
    }
    
    await mkdir(testDir, { recursive: true });
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    
    documentService = new DocumentService();
    batchService = new BatchService();
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should generate glossary file with sample glossary data', async () => {
    // Create a sample MadCap project structure
    const projectDir = join(inputDir, 'Project');
    const contentDir = join(projectDir, 'Content');
    const glossaryDir = join(projectDir, 'Project', 'Glossaries');
    
    await mkdir(contentDir, { recursive: true });
    await mkdir(glossaryDir, { recursive: true });

    // Create a sample FLGLO glossary file
    const glossaryContent = `<?xml version="1.0" encoding="utf-8"?>
<CatapultGlossary
  conditions=""
  xml:lang="en-us">
  <GlossaryEntry
    glossTerm="API">
    <Terms>
      <Term>API</Term>
    </Terms>
    <Definition
      link="">Application Programming Interface</Definition>
  </GlossaryEntry>
  <GlossaryEntry
    glossTerm="JSON">
    <Terms>
      <Term>JSON</Term>
    </Terms>
    <Definition
      link="">JavaScript Object Notation</Definition>
  </GlossaryEntry>
</CatapultGlossary>`;

    const glossaryFile = join(glossaryDir, 'TestGlossary.flglo');
    await writeFile(glossaryFile, glossaryContent, 'utf8');

    // Create a sample HTML file
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Test Document</title>
</head>
<body>
    <h1>API Documentation</h1>
    <p>This document explains how to use the API and JSON formats.</p>
</body>
</html>`;

    const inputFile = join(contentDir, 'test-doc.htm');
    await writeFile(inputFile, htmlContent, 'utf8');

    // Convert with glossary enabled
    const options = {
      format: 'asciidoc' as const,
      inputType: 'madcap' as const,
      outputDir: outputDir,
      asciidocOptions: {
        glossaryOptions: {
          includeGlossary: true,
          glossaryFormat: 'separate' as const,
          generateAnchors: true,
          includeIndex: true,
          glossaryTitle: 'Test Glossary'
        }
      }
    };

    const outputFile = join(outputDir, 'test-doc.adoc');
    
    // Test single file conversion
    await documentService.convertFile(inputFile, outputFile, options);

    // Check if glossary file was created
    const glossaryOutputFile = join(outputDir, 'glossary.adoc');
    
    let glossaryExists = false;
    let glossaryContent_result = '';
    
    try {
      glossaryContent_result = await readFile(glossaryOutputFile, 'utf8');
      glossaryExists = true;
    } catch (error) {
      // File doesn't exist
    }

    expect(glossaryExists).toBe(true);
    expect(glossaryContent_result).toContain('Test Glossary');
    expect(glossaryContent_result).toContain('API');
    expect(glossaryContent_result).toContain('Application Programming Interface');
    expect(glossaryContent_result).toContain('JSON');
    expect(glossaryContent_result).toContain('JavaScript Object Notation');
  });

  test('should generate glossary in batch conversion', async () => {
    // Create a sample MadCap project structure
    const projectDir = join(inputDir, 'BatchProject');
    const contentDir = join(projectDir, 'Content');
    const glossaryDir = join(projectDir, 'Project', 'Glossaries');
    
    await mkdir(contentDir, { recursive: true });
    await mkdir(glossaryDir, { recursive: true });

    // Create a sample FLGLO glossary file
    const glossaryContent = `<?xml version="1.0" encoding="utf-8"?>
<CatapultGlossary>
  <GlossaryEntry glossTerm="REST">
    <Terms><Term>REST</Term></Terms>
    <Definition>Representational State Transfer</Definition>
  </GlossaryEntry>
</CatapultGlossary>`;

    const glossaryFile = join(glossaryDir, 'BatchGlossary.flglo');
    await writeFile(glossaryFile, glossaryContent, 'utf8');

    // Create sample HTML files
    const file1Content = `<html><body><h1>File 1</h1><p>REST API documentation.</p></body></html>`;
    const file2Content = `<html><body><h1>File 2</h1><p>More REST examples.</p></body></html>`;

    await writeFile(join(contentDir, 'file1.htm'), file1Content, 'utf8');
    await writeFile(join(contentDir, 'file2.htm'), file2Content, 'utf8');

    // Convert batch with glossary enabled
    const options = {
      format: 'asciidoc' as const,
      preserveFormatting: true,
      extractImages: true,
      recursive: true,
      preserveStructure: true,
      copyImages: true,
      renameFiles: false,
      useTOCStructure: false,
      generateMasterDoc: false,
      asciidocOptions: {
        glossaryOptions: {
          includeGlossary: true,
          glossaryFormat: 'separate' as const,
          generateAnchors: true,
          includeIndex: false,
          glossaryTitle: 'Batch Glossary'
        }
      }
    };

    const result = await batchService.convertFolder(contentDir, outputDir, options);

    // Check if glossary file was created
    const glossaryOutputFile = join(outputDir, 'glossary.adoc');
    
    let glossaryExists = false;
    let glossaryContent_result = '';
    
    try {
      glossaryContent_result = await readFile(glossaryOutputFile, 'utf8');
      glossaryExists = true;
    } catch (error) {
      console.error('Glossary file error:', error);
    }

    expect(glossaryExists).toBe(true);
    expect(glossaryContent_result).toContain('Batch Glossary');
    expect(glossaryContent_result).toContain('REST');
    expect(glossaryContent_result).toContain('Representational State Transfer');
    expect(result.convertedFiles).toBeGreaterThan(0);
  });

  test('should handle glossary book-appendix format', async () => {
    // Create minimal test setup
    const projectDir = join(inputDir, 'BookProject');
    const contentDir = join(projectDir, 'Content');
    const glossaryDir = join(projectDir, 'Project', 'Glossaries');
    
    await mkdir(contentDir, { recursive: true });
    await mkdir(glossaryDir, { recursive: true });

    // Create a simple glossary
    const glossaryContent = `<?xml version="1.0" encoding="utf-8"?>
<CatapultGlossary>
  <GlossaryEntry glossTerm="Book">
    <Terms><Term>Book</Term></Terms>
    <Definition>A collection of written pages</Definition>
  </GlossaryEntry>
</CatapultGlossary>`;

    await writeFile(join(glossaryDir, 'BookGlossary.flglo'), glossaryContent, 'utf8');

    const htmlContent = `<html><body><h1>Chapter 1</h1><p>Book content here.</p></body></html>`;
    const inputFile = join(contentDir, 'chapter1.htm');
    await writeFile(inputFile, htmlContent, 'utf8');

    const options = {
      format: 'asciidoc' as const,
      inputType: 'madcap' as const,
      outputDir: outputDir,
      asciidocOptions: {
        glossaryOptions: {
          includeGlossary: true,
          glossaryFormat: 'book-appendix' as const,
          glossaryTitle: 'Book Glossary'
        }
      }
    };

    const outputFile = join(outputDir, 'chapter1.adoc');
    await documentService.convertFile(inputFile, outputFile, options);

    // Check if glossary file was created in appendices directory
    const glossaryOutputFile = join(outputDir, 'appendices', 'glossary.adoc');
    
    let glossaryExists = false;
    try {
      const glossaryContent_result = await readFile(glossaryOutputFile, 'utf8');
      glossaryExists = true;
      expect(glossaryContent_result).toContain('Book Glossary');
      expect(glossaryContent_result).toContain('Book');
    } catch (error) {
      // File doesn't exist
    }

    expect(glossaryExists).toBe(true);
  });

  test('should handle missing glossary gracefully', async () => {
    // Create minimal project without glossary
    const contentDir = join(inputDir, 'NoGlossary');
    await mkdir(contentDir, { recursive: true });

    const htmlContent = `<html><body><h1>Test</h1><p>No glossary here.</p></body></html>`;
    const inputFile = join(contentDir, 'test.htm');
    await writeFile(inputFile, htmlContent, 'utf8');

    const options = {
      format: 'asciidoc' as const,
      inputType: 'madcap' as const,
      outputDir: outputDir,
      asciidocOptions: {
        glossaryOptions: {
          includeGlossary: true,
          glossaryFormat: 'separate' as const
        }
      }
    };

    const outputFile = join(outputDir, 'test.adoc');
    
    // Should not throw error when no glossary is found
    await expect(documentService.convertFile(inputFile, outputFile, options)).resolves.toBeDefined();

    // Main document should still be created
    const mainContent = await readFile(outputFile, 'utf8');
    expect(mainContent).toContain('Test');
  });
});
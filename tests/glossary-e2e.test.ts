import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, mkdir, rm, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { MCPServer } from '../src/index.js';

describe('Glossary End-to-End Tests', () => {
  const testDir = join(__dirname, 'temp-e2e-glossary');
  const inputDir = join(testDir, 'input');
  const outputDir = join(testDir, 'output');
  let mcpServer: MCPServer;

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
    
    // Initialize MCP server
    mcpServer = new MCPServer();
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should write glossary.adoc file in single file conversion', async () => {
    // Create a realistic MadCap project structure
    const projectDir = join(inputDir, 'MadCapProject');
    const contentDir = join(projectDir, 'Content');
    const glossaryDir = join(projectDir, 'Project', 'Glossaries');
    
    await mkdir(contentDir, { recursive: true });
    await mkdir(glossaryDir, { recursive: true });

    // Create a comprehensive FLGLO glossary file with MadCap conditions
    const glossaryContent = `<?xml version="1.0" encoding="utf-8"?>
<CatapultGlossary
  conditions=""
  xml:lang="en-us">
  <GlossaryEntry
    glossTerm="API"
    conditions="Default.ScreenOnly">
    <Terms>
      <Term>API</Term>
      <Term>Application Programming Interface</Term>
    </Terms>
    <Definition
      link="">A set of protocols, routines, and tools for building software applications.</Definition>
  </GlossaryEntry>
  <GlossaryEntry
    glossTerm="REST"
    conditions="">
    <Terms>
      <Term>REST</Term>
      <Term>RESTful API</Term>
    </Terms>
    <Definition
      link="">Representational State Transfer - an architectural style for designing networked applications.</Definition>
  </GlossaryEntry>
  <GlossaryEntry
    glossTerm="JSON"
    conditions="Default.ScreenOnly">
    <Terms>
      <Term>JSON</Term>
    </Terms>
    <Definition
      link="">JavaScript Object Notation - a lightweight data-interchange format.</Definition>
  </GlossaryEntry>
</CatapultGlossary>`;

    const glossaryFile = join(glossaryDir, 'TechnicalGlossary.flglo');
    await writeFile(glossaryFile, glossaryContent, 'utf8');

    // Create a realistic HTML content file that would reference glossary terms
    const htmlContent = `<!DOCTYPE html>
<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd" 
      data-mc-conditions="Default.ScreenOnly">
<head>
    <title>API Development Guide</title>
    <meta name="description" content="Guide for API development using REST and JSON" />
</head>
<body>
    <h1>API Development Guide</h1>
    
    <p>This guide covers the basics of API development, focusing on REST architecture and JSON data format.</p>
    
    <h2>Introduction to APIs</h2>
    <p>An API provides a standardized way for applications to communicate. When building REST APIs, 
       you'll typically work with JSON data format for requests and responses.</p>
    
    <h2>Best Practices</h2>
    <ul>
        <li>Design your API following REST principles</li>
        <li>Use JSON for data serialization</li>
        <li>Implement proper API authentication</li>
    </ul>
    
    <p>For more information, see the glossary for definitions of API, REST, and JSON terms.</p>
</body>
</html>`;

    const inputFile = join(contentDir, 'api-guide.htm');
    await writeFile(inputFile, htmlContent, 'utf8');

    // Test the actual MCP server convert_file tool
    const result = await mcpServer.handleToolCall({
      name: 'convert_file',
      arguments: {
        inputPath: inputFile,
        outputPath: join(outputDir, 'api-guide.adoc'),
        format: 'asciidoc',
        inputType: 'madcap',
        asciidocOptions: {
          glossaryOptions: {
            includeGlossary: true,
            glossaryFormat: 'separate',
            generateAnchors: true,
            includeIndex: true,
            glossaryTitle: 'Technical Glossary'
          }
        }
      }
    });

    // Verify the conversion was successful
    expect(result.isError).toBe(false);
    expect(result.content).toBeDefined();

    // Check that the main document was created
    const mainDocExists = await fileExists(join(outputDir, 'api-guide.adoc'));
    expect(mainDocExists).toBe(true);

    // Check that the glossary file was created
    const glossaryPath = join(outputDir, 'glossary.adoc');
    const glossaryExists = await fileExists(glossaryPath);
    expect(glossaryExists).toBe(true);

    if (glossaryExists) {
      // Read and verify glossary content
      const glossaryContent_result = await readFile(glossaryPath, 'utf8');
      
      // Check for glossary structure
      expect(glossaryContent_result).toContain('= Technical Glossary');
      expect(glossaryContent_result).toContain('API');
      expect(glossaryContent_result).toContain('Application Programming Interface');
      expect(glossaryContent_result).toContain('REST');
      expect(glossaryContent_result).toContain('Representational State Transfer');
      expect(glossaryContent_result).toContain('JSON');
      expect(glossaryContent_result).toContain('JavaScript Object Notation');
      
      // Check that definitions are included
      expect(glossaryContent_result).toContain('set of protocols, routines, and tools');
      expect(glossaryContent_result).toContain('architectural style for designing networked applications');
      expect(glossaryContent_result).toContain('lightweight data-interchange format');

      console.log('✅ Glossary file created successfully with content:', glossaryContent_result.substring(0, 200) + '...');
    }

    // Read the main document to check for any glossary references
    const mainContent = await readFile(join(outputDir, 'api-guide.adoc'), 'utf8');
    expect(mainContent).toContain('API Development Guide');
    expect(mainContent).toContain('Introduction to APIs');
  });

  test('should write glossary.adoc file in batch conversion', async () => {
    // Create batch conversion test structure
    const projectDir = join(inputDir, 'BatchProject');
    const contentDir = join(projectDir, 'Content');
    const glossaryDir = join(projectDir, 'Project', 'Glossaries');
    
    await mkdir(contentDir, { recursive: true });
    await mkdir(glossaryDir, { recursive: true });

    // Create glossary file
    const glossaryContent = `<?xml version="1.0" encoding="utf-8"?>
<CatapultGlossary>
  <GlossaryEntry glossTerm="Batch">
    <Terms><Term>Batch Processing</Term></Terms>
    <Definition>Processing multiple items together in a single operation.</Definition>
  </GlossaryEntry>
  <GlossaryEntry glossTerm="Conversion">
    <Terms><Term>Format Conversion</Term></Terms>
    <Definition>Transforming content from one format to another.</Definition>
  </GlossaryEntry>
</CatapultGlossary>`;

    await writeFile(join(glossaryDir, 'BatchGlossary.flglo'), glossaryContent, 'utf8');

    // Create multiple HTML files
    const file1Content = `<html><head><title>Batch Overview</title></head><body><h1>Batch Processing Overview</h1><p>This explains batch processing concepts.</p></body></html>`;
    const file2Content = `<html><head><title>Conversion Guide</title></head><body><h1>Format Conversion Guide</h1><p>Learn about format conversion techniques.</p></body></html>`;

    await writeFile(join(contentDir, 'batch-overview.htm'), file1Content, 'utf8');
    await writeFile(join(contentDir, 'conversion-guide.htm'), file2Content, 'utf8');

    // Test batch conversion with glossary
    const result = await mcpServer.handleToolCall({
      name: 'convert_folder',
      arguments: {
        inputDir: contentDir,
        outputDir: outputDir,
        format: 'asciidoc',
        preserveFormatting: true,
        extractImages: false,
        recursive: true,
        preserveStructure: true,
        copyImages: false,
        renameFiles: false,
        asciidocOptions: {
          glossaryOptions: {
            includeGlossary: true,
            glossaryFormat: 'separate',
            glossaryTitle: 'Batch Processing Glossary'
          }
        }
      }
    });

    // Verify batch conversion was successful
    expect(result.isError).toBe(false);
    expect(result.content).toBeDefined();

    // Check that converted files exist
    expect(await fileExists(join(outputDir, 'batch-overview.adoc'))).toBe(true);
    expect(await fileExists(join(outputDir, 'conversion-guide.adoc'))).toBe(true);

    // Check that glossary file was created
    const glossaryPath = join(outputDir, 'glossary.adoc');
    const glossaryExists = await fileExists(glossaryPath);
    expect(glossaryExists).toBe(true);

    if (glossaryExists) {
      const glossaryContent_result = await readFile(glossaryPath, 'utf8');
      expect(glossaryContent_result).toContain('Batch Processing Glossary');
      expect(glossaryContent_result).toContain('Batch Processing');
      expect(glossaryContent_result).toContain('Format Conversion');
      expect(glossaryContent_result).toContain('Processing multiple items together');
      expect(glossaryContent_result).toContain('Transforming content from one format');

      console.log('✅ Batch glossary file created successfully');
    }
  });

  test('should handle book-appendix glossary format', async () => {
    // Create test structure for book format
    const projectDir = join(inputDir, 'BookProject');
    const contentDir = join(projectDir, 'Content');
    const glossaryDir = join(projectDir, 'Project', 'Glossaries');
    
    await mkdir(contentDir, { recursive: true });
    await mkdir(glossaryDir, { recursive: true });

    // Create simple glossary
    const glossaryContent = `<?xml version="1.0" encoding="utf-8"?>
<CatapultGlossary>
  <GlossaryEntry glossTerm="Chapter">
    <Terms><Term>Chapter</Term></Terms>
    <Definition>A main division of a book or document.</Definition>
  </GlossaryEntry>
</CatapultGlossary>`;

    await writeFile(join(glossaryDir, 'BookGlossary.flglo'), glossaryContent, 'utf8');

    const htmlContent = `<html><body><h1>Chapter 1</h1><p>First chapter content.</p></body></html>`;
    const inputFile = join(contentDir, 'chapter1.htm');
    await writeFile(inputFile, htmlContent, 'utf8');

    // Test book-appendix format
    const result = await mcpServer.handleToolCall({
      name: 'convert_file',
      arguments: {
        inputPath: inputFile,
        outputPath: join(outputDir, 'chapter1.adoc'),
        format: 'asciidoc',
        inputType: 'madcap',
        asciidocOptions: {
          glossaryOptions: {
            includeGlossary: true,
            glossaryFormat: 'book-appendix',
            glossaryTitle: 'Book Glossary'
          }
        }
      }
    });

    expect(result.isError).toBe(false);
    
    // Check that glossary was created in appendices directory
    const glossaryPath = join(outputDir, 'appendices', 'glossary.adoc');
    const glossaryExists = await fileExists(glossaryPath);
    expect(glossaryExists).toBe(true);

    if (glossaryExists) {
      const glossaryContent_result = await readFile(glossaryPath, 'utf8');
      expect(glossaryContent_result).toContain('Book Glossary');
      expect(glossaryContent_result).toContain('Chapter');
      expect(glossaryContent_result).toContain('main division of a book');

      console.log('✅ Book appendix glossary created successfully');
    }
  });
});

// Helper function to check if file exists
async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
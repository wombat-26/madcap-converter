import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { FLVARParser, VariableSet } from '../src/services/flvar-parser.js';
import { WritersideVariableConverter } from '../src/services/writerside-variable-converter.js';
import WritersideMarkdownConverter from '../src/converters/writerside-markdown-converter.js';
import { BatchService } from '../src/batch-service.js';

/**
 * Comprehensive tests for variable processing and FLVAR handling
 * Tests parsing, conversion, and integration with the conversion pipeline
 */

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const TEST_OUTPUT_PATH = '/tmp/variable-processing-tests';

describe('Variable Processing Tests', () => {
  let flvarParser: FLVARParser;
  let variableConverter: WritersideVariableConverter;
  let converter: WritersideMarkdownConverter;
  let batchService: BatchService;

  beforeAll(async () => {
    flvarParser = new FLVARParser();
    variableConverter = new WritersideVariableConverter();
    converter = new WritersideMarkdownConverter();
    batchService = new BatchService();
    
    await fs.mkdir(TEST_OUTPUT_PATH, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(TEST_OUTPUT_PATH, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('FLVAR File Parsing', () => {
    
    it('should parse General.flvar correctly', async () => {
      const flvarPath = path.join(FLARE_SOURCE_PATH, 'Project/VariableSets/General.flvar');
      
      const variables = await flvarParser.parseFile(flvarPath);
      
      expect(variables.length).toBeGreaterThan(15);
      
      // Test specific known variables
      const companyNameVar = variables.find(v => v.name === 'CompanyName');
      expect(companyNameVar).toEqual({
        name: 'CompanyName',
        value: 'Uptempo GmbH',
        comment: '',
        type: 'Text'
      });

      const productNameVar = variables.find(v => v.name === 'ProductName');
      expect(productNameVar).toEqual({
        name: 'ProductName',
        value: 'Plan',
        comment: '',
        type: 'Text'
      });

      const versionVar = variables.find(v => v.name === 'VersionNumber');
      expect(versionVar).toEqual({
        name: 'VersionNumber',
        value: 'November 2024',
        comment: '',
        type: 'Text'
      });
    });

    it('should handle DateTime variables correctly', async () => {
      const flvarPath = path.join(FLARE_SOURCE_PATH, 'Project/VariableSets/General.flvar');
      
      const variables = await flvarParser.parseFile(flvarPath);
      
      const yearVar = variables.find(v => v.name === 'Year');
      expect(yearVar).toEqual({
        name: 'Year',
        value: 'yyyy',
        comment: '',
        type: 'DateTime'
      });

      const lastUpdatedVar = variables.find(v => v.name === 'LastUpdated');
      expect(lastUpdatedVar).toEqual({
        name: 'LastUpdated',
        value: 'MMMM dd, yyyy',
        comment: '',
        type: 'DateTimeFileSaved'
      });
    });

    it('should auto-discover FLVAR files in project', async () => {
      const projectPath = FLARE_SOURCE_PATH;
      
      const flvarFiles = await flvarParser.findFLVARFiles(projectPath);
      
      expect(flvarFiles.length).toBeGreaterThan(0);
      expect(flvarFiles).toContain(path.join(projectPath, 'Project/VariableSets/General.flvar'));
    });

    it('should parse multiple FLVAR files and merge them', async () => {
      const projectPath = FLARE_SOURCE_PATH;
      const flvarFiles = await flvarParser.findFLVARFiles(projectPath);
      
      const variableSets = await flvarParser.parseMultipleFiles(flvarFiles);
      const mergedVariables = flvarParser.mergeVariableSets(variableSets);
      
      expect(mergedVariables.length).toBeGreaterThan(0);
      expect(mergedVariables.some(v => v.name === 'CompanyName')).toBe(true);
    });

    it('should handle malformed FLVAR files gracefully', async () => {
      const malformedContent = `
        <?xml version="1.0" encoding="utf-8"?>
        <CatapultVariableSet>
          <Variable Name="Test" EvaluatedDefinition="Value">Unclosed
          <Variable Name="Valid" EvaluatedDefinition="ValidValue">ValidValue</Variable>
        </CatapultVariableSet>
      `;
      
      const tempFile = path.join(TEST_OUTPUT_PATH, 'malformed.flvar');
      await fs.writeFile(tempFile, malformedContent);
      
      try {
        const variables = await flvarParser.parseFile(tempFile);
        // Should parse valid variables and skip malformed ones
        expect(variables.some(v => v.name === 'Valid')).toBe(true);
      } catch (error) {
        // Or throw appropriate error
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Variable Conversion', () => {
    
    it('should convert to Writerside format in reference mode', async () => {
      const variables = [
        { name: 'CompanyName', value: 'Uptempo GmbH', comment: '', type: 'Text' },
        { name: 'ProductName', value: 'Plan', comment: '', type: 'Text' },
        { name: 'VersionNumber', value: 'November 2024', comment: '', type: 'Text' }
      ];

      const conversionOptions = {
        mode: 'reference' as const,
        format: 'writerside' as const,
        variableFileName: 'v.list',
        nameConvention: 'original' as const
      };

      const writersideVariables = variableConverter.convertVariables(variables, conversionOptions);
      
      expect(writersideVariables).toEqual([
        { name: 'CompanyName', value: 'Uptempo GmbH', description: '' },
        { name: 'ProductName', value: 'Plan', description: '' },
        { name: 'VersionNumber', value: 'November 2024', description: '' }
      ]);
    });

    it('should apply name conventions correctly', async () => {
      const variables = [
        { name: 'CompanyName', value: 'Test', comment: '', type: 'Text' },
        { name: 'Product_Name', value: 'Test', comment: '', type: 'Text' },
        { name: 'version-number', value: 'Test', comment: '', type: 'Text' }
      ];

      const camelCaseOptions = {
        mode: 'reference' as const,
        format: 'writerside' as const,
        variableFileName: 'v.list',
        nameConvention: 'camelCase' as const
      };

      const camelCaseResult = variableConverter.convertVariables(variables, camelCaseOptions);
      expect(camelCaseResult[0].name).toBe('companyName');
      expect(camelCaseResult[1].name).toBe('productName');
      expect(camelCaseResult[2].name).toBe('versionNumber');

      const kebabCaseOptions = {
        ...camelCaseOptions,
        nameConvention: 'kebab-case' as const
      };

      const kebabCaseResult = variableConverter.convertVariables(variables, kebabCaseOptions);
      expect(kebabCaseResult[0].name).toBe('company-name');
      expect(kebabCaseResult[1].name).toBe('product-name');
      expect(kebabCaseResult[2].name).toBe('version-number');
    });

    it('should filter variables by include/exclude patterns', async () => {
      const variables = [
        { name: 'CompanyName', value: 'Test', comment: '', type: 'Text' },
        { name: 'CompanyShort', value: 'Test', comment: '', type: 'Text' },
        { name: 'ProductName', value: 'Test', comment: '', type: 'Text' },
        { name: 'PhoneNumber', value: 'Test', comment: '', type: 'Text' },
        { name: 'InternalCode', value: 'Test', comment: '', type: 'Text' }
      ];

      const conversionOptions = {
        mode: 'reference' as const,
        format: 'writerside' as const,
        variableFileName: 'v.list',
        nameConvention: 'original' as const,
        includePatterns: ['Company*', 'Product*'],
        excludePatterns: ['*Internal*']
      };

      const result = variableConverter.convertVariables(variables, conversionOptions);
      
      expect(result.length).toBe(3);
      expect(result.some(v => v.name === 'CompanyName')).toBe(true);
      expect(result.some(v => v.name === 'CompanyShort')).toBe(true);
      expect(result.some(v => v.name === 'ProductName')).toBe(true);
      expect(result.some(v => v.name === 'PhoneNumber')).toBe(false);
      expect(result.some(v => v.name === 'InternalCode')).toBe(false);
    });

    it('should generate Writerside variables file correctly', async () => {
      const variables = [
        { name: 'company', value: 'Uptempo GmbH', description: 'Company name' },
        { name: 'product', value: 'Plan', description: 'Product name' }
      ];

      const conversionOptions = {
        mode: 'reference' as const,
        format: 'writerside' as const,
        variableFileName: 'v.list',
        nameConvention: 'original' as const
      };

      const result = variableConverter.generateWritersideFile(variables, conversionOptions);
      
      expect(result.content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result.content).toContain('<vars>');
      expect(result.content).toContain('<var name="company" value="Uptempo GmbH"/>');
      expect(result.content).toContain('<var name="product" value="Plan"/>');
      expect(result.content).toContain('</vars>');
      expect(result.fileName).toBe('v.list');
    });

    it('should process variable references in content', async () => {
      const content = 'Welcome to <var name="product"/>! By <var name="company"/>.';
      const variables = [
        { name: 'company', value: 'Uptempo GmbH', description: '' },
        { name: 'product', value: 'Plan', description: '' }
      ];

      const conversionOptions = {
        mode: 'reference' as const,
        format: 'writerside' as const,
        variableFileName: 'v.list',
        nameConvention: 'original' as const
      };

      const result = variableConverter.processVariableReferences(content, variables, conversionOptions);
      
      expect(result).toBe('Welcome to <var name="product"/>! By <var name="company"/>.');
    });
  });

  describe('End-to-End Variable Processing', () => {
    
    it('should process variables in single file conversion', async () => {
      const htmlContent = `
        <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
          <body>
            <h1>Welcome to <MadCap:variable name="General.ProductName" /></h1>
            <p>Developed by <MadCap:variable name="General.CompanyName" />.</p>
            <p>Version: <MadCap:variable name="General.VersionNumber" /></p>
          </body>
        </html>
      `;

      const result = await converter.convert(htmlContent, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/test.htm'),
        variableOptions: {
          autoDiscoverFLVAR: true,
          variableMode: 'reference',
          nameConvention: 'camelCase'
        }
      });

      expect(result.content).toContain('# Welcome to <var name="productName"/>');
      expect(result.content).toContain('Developed by <var name="companyName"/>.');
      expect(result.content).toContain('Version: <var name="versionNumber"/>');
      expect(result.variablesFile).toBeDefined();
      
      if (result.variablesFile) {
        expect(result.variablesFile).toContain('productName');
        expect(result.variablesFile).toContain('Plan');
        expect(result.variablesFile).toContain('companyName');
        expect(result.variablesFile).toContain('Uptempo GmbH');
      }
    });

    it('should process variables in replacement mode', async () => {
      const htmlContent = `
        <p>Product: <MadCap:variable name="General.ProductName" /></p>
        <p>Company: <MadCap:variable name="General.CompanyName" /></p>
      `;

      const result = await converter.convert(htmlContent, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/test.htm'),
        variableOptions: {
          autoDiscoverFLVAR: true,
          variableMode: 'replace'
        }
      });

      expect(result.content).toContain('Product: Plan');
      expect(result.content).toContain('Company: Uptempo GmbH');
      expect(result.content).not.toContain('<var name=');
      expect(result.variablesFile).toBeUndefined();
    });

    it('should handle batch processing with variables', async () => {
      const sourceDir = path.join(FLARE_SOURCE_PATH, 'Content/02 Planung');
      const outputDir = path.join(TEST_OUTPUT_PATH, 'batch-variables');
      
      const result = await batchService.convertFolder(sourceDir, outputDir, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        preserveStructure: true,
        includePatterns: ['01-01 CreatActivity.htm'],
        variableOptions: {
          autoDiscoverFLVAR: true,
          variableMode: 'reference',
          variablesOutputPath: path.join(outputDir, 'variables.list'),
          nameConvention: 'camelCase'
        }
      }, FLARE_SOURCE_PATH);

      expect(result.success).toBe(true);
      expect(result.processedFiles).toBeGreaterThan(0);
      
      // Check if variables file was created
      const variablesFile = path.join(outputDir, 'variables.list');
      const variablesExist = await fs.access(variablesFile).then(() => true).catch(() => false);
      expect(variablesExist).toBe(true);
      
      if (variablesExist) {
        const variablesContent = await fs.readFile(variablesFile, 'utf8');
        expect(variablesContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(variablesContent).toContain('<vars>');
      }
    });

    it('should handle missing FLVAR files gracefully', async () => {
      const htmlContent = `
        <p>Product: <MadCap:variable name="NonExistent.ProductName" /></p>
      `;

      const result = await converter.convert(htmlContent, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: '/tmp/test.htm',
        variableOptions: {
          autoDiscoverFLVAR: true,
          variableMode: 'reference'
        }
      });

      expect(result.content).toContain('ProductName');
      expect(result.metadata.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('No FLVAR files found')
        ])
      );
    });

    it('should handle variables with instance names', async () => {
      const variables = [
        { name: 'CompanyName', value: 'Uptempo GmbH', comment: '', type: 'Text' }
      ];

      const conversionOptions = {
        mode: 'reference' as const,
        format: 'writerside' as const,
        variableFileName: 'v.list',
        nameConvention: 'original' as const,
        instanceName: 'company'
      };

      const writersideVariables = variableConverter.convertVariables(variables, conversionOptions);
      const file = variableConverter.generateWritersideFile(writersideVariables, conversionOptions);
      
      expect(file.content).toContain('<vars instance="company">');
    });

    it('should handle variable prefixes correctly', async () => {
      const variables = [
        { name: 'CompanyName', value: 'Uptempo GmbH', comment: '', type: 'Text' },
        { name: 'ProductName', value: 'Plan', comment: '', type: 'Text' }
      ];

      const conversionOptions = {
        mode: 'reference' as const,
        format: 'writerside' as const,
        variableFileName: 'v.list',
        nameConvention: 'original' as const,
        prefix: 'app'
      };

      const writersideVariables = variableConverter.convertVariables(variables, conversionOptions);
      
      expect(writersideVariables[0].name).toBe('appCompanyName');
      expect(writersideVariables[1].name).toBe('appProductName');
    });
  });

  describe('Performance and Edge Cases', () => {
    
    it('should handle large variable sets efficiently', async () => {
      const largeVariableSet = Array.from({ length: 1000 }, (_, i) => ({
        name: `Variable${i}`,
        value: `Value ${i}`,
        comment: `Comment ${i}`,
        type: 'Text'
      }));

      const conversionOptions = {
        mode: 'reference' as const,
        format: 'writerside' as const,
        variableFileName: 'v.list',
        nameConvention: 'original' as const
      };

      const startTime = Date.now();
      const result = variableConverter.convertVariables(largeVariableSet, conversionOptions);
      const duration = Date.now() - startTime;

      expect(result.length).toBe(1000);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle variables with special characters', async () => {
      const variables = [
        { name: 'Special&Name', value: 'Value with <special> characters & more', comment: '', type: 'Text' },
        { name: 'Unicode_Naïve', value: 'Café & résumé', comment: '', type: 'Text' }
      ];

      const conversionOptions = {
        mode: 'reference' as const,
        format: 'writerside' as const,
        variableFileName: 'v.list',
        nameConvention: 'original' as const
      };

      const writersideVariables = variableConverter.convertVariables(variables, conversionOptions);
      const file = variableConverter.generateWritersideFile(writersideVariables, conversionOptions);

      expect(file.content).toContain('Special&amp;Name');
      expect(file.content).toContain('Value with &lt;special&gt; characters &amp; more');
      expect(file.content).toContain('Café &amp; résumé');
    });

    it('should handle circular variable references', async () => {
      const htmlContent = `
        <p>Test: <MadCap:variable name="General.CompanyName" /></p>
        <p>Nested: <MadCap:variable name="General.CompanyName" /> again</p>
      `;

      const result = await converter.convert(htmlContent, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/test.htm'),
        variableOptions: {
          autoDiscoverFLVAR: true,
          variableMode: 'reference'
        }
      });

      expect(result.content).toContain('<var name="CompanyName"/>');
      expect(result.content).toContain('<var name="CompanyName"/> again');
    });

    it('should validate variable names for Writerside compatibility', async () => {
      const variables = [
        { name: 'Valid_Name', value: 'Valid', comment: '', type: 'Text' },
        { name: '123InvalidStart', value: 'Invalid', comment: '', type: 'Text' },
        { name: 'Invalid-Char!', value: 'Invalid', comment: '', type: 'Text' },
        { name: 'valid_camelCase', value: 'Valid', comment: '', type: 'Text' }
      ];

      const conversionOptions = {
        mode: 'reference' as const,
        format: 'writerside' as const,
        variableFileName: 'v.list',
        nameConvention: 'original' as const
      };

      const writersideVariables = variableConverter.convertVariables(variables, conversionOptions);
      
      // Should filter out or transform invalid variable names
      expect(writersideVariables.some(v => v.name === 'Valid_Name')).toBe(true);
      expect(writersideVariables.some(v => v.name === 'valid_camelCase')).toBe(true);
      // Invalid names should be transformed or excluded
      expect(writersideVariables.every(v => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(v.name))).toBe(true);
    });
  });
});
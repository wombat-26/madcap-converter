import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import WritersideMarkdownConverter from '../src/core/converters/writerside-markdown-converter.js';
import { FLVARParser } from '../src/core/services/flvar-parser.js';
import { MadCapPreprocessor } from '../src/core/services/madcap-preprocessor.js';

/**
 * Specialized tests for MadCap Flare-specific features
 * Focus on variables, conditions, snippets, and MadCap-specific elements
 */

const FLARE_SOURCE_PATH = './tests/fixtures/sample-flare-project';

describe('MadCap-Specific Features Tests', () => {
  let converter: WritersideMarkdownConverter;
  let flvarParser: FLVARParser;
  let madcapPreprocessor: MadCapPreprocessor;

  beforeAll(() => {
    converter = new WritersideMarkdownConverter();
    flvarParser = new FLVARParser();
    madcapPreprocessor = new MadCapPreprocessor();
  });

  describe('Variable Processing (FLVAR)', () => {
    
    it('should parse FLVAR file correctly', async () => {
      const flvarPath = path.join(FLARE_SOURCE_PATH, 'Project/VariableSets/General.flvar');
      
      const variableSet = await flvarParser.parseFile(flvarPath);
      
      expect(variableSet.variables.length).toBeGreaterThan(0);
      expect(variableSet.name).toBe('General');
      expect(variableSet.variables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'CompanyName',
            value: 'Uptempo GmbH'
          }),
          expect.objectContaining({
            name: 'ProductName',
            value: 'Plan'
          }),
          expect.objectContaining({
            name: 'Version',
            value: '2.0'
          })
        ])
      );
    });

    it('should handle DateTime variables correctly', async () => {
      const flvarPath = path.join(FLARE_SOURCE_PATH, 'Project/VariableSets/General.flvar');
      
      const variableSet = await flvarParser.parseFile(flvarPath);
      const yearVariable = variableSet.variables.find(v => v.name === 'Year');
      
      expect(yearVariable).toBeDefined();
      expect(yearVariable?.type).toBe('DateTime');
      expect(yearVariable?.value).toBe('2025');
    });

    it('should convert MadCap variables to Writerside format', async () => {
      const input = `
        <p>Welcome to <MadCap:variable name="General.ProductName" />!</p>
        <p>Version: <MadCap:variable name="General.VersionNumber" /></p>
        <p>Company: <MadCap:variable name="General.CompanyName" /></p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/test.htm'),
        variableOptions: {
          autoDiscoverFLVAR: true,
          variableMode: 'reference',
          nameConvention: 'camelCase'
        }
      });
      
      expect(result.content).toContain('<var name="productName"/>');
      expect(result.content).toContain('<var name="versionNumber"/>');
      expect(result.content).toContain('<var name="companyName"/>');
      expect(result.variablesFile).toBeDefined();
      
      // Check that variables file contains the definitions
      if (result.variablesFile) {
        expect(result.variablesFile).toContain('productName');
        expect(result.variablesFile).toContain('Plan');
        expect(result.variablesFile).toContain('Uptempo GmbH');
      }
    });

    it('should handle variable replacement mode', async () => {
      const input = `
        <p>Welcome to <MadCap:variable name="General.ProductName" />!</p>
        <p>Company: <MadCap:variable name="General.CompanyName" /></p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/test.htm'),
        variableOptions: {
          autoDiscoverFLVAR: true,
          variableMode: 'replace'
        }
      });
      
      expect(result.content).toContain('Welcome to Plan!');
      expect(result.content).toContain('Company: Uptempo GmbH');
      expect(result.content).not.toContain('<var name=');
    });

    it('should filter variables by include/exclude patterns', async () => {
      const input = `
        <p>Product: <MadCap:variable name="General.ProductName" /></p>
        <p>Company: <MadCap:variable name="General.CompanyName" /></p>
        <p>Phone: <MadCap:variable name="General.PhoneNumber" /></p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/test.htm'),
        variableOptions: {
          autoDiscoverFLVAR: true,
          variableMode: 'reference',
          includePatterns: ['Product*', 'Company*'],
          excludePatterns: ['Phone*']
        }
      });
      
      expect(result.content).toContain('<var name="ProductName"/>');
      expect(result.content).toContain('<var name="CompanyName"/>');
      expect(result.content).toContain('PhoneNumber'); // Should be literal text, not variable
    });

    it('should handle missing variables gracefully', async () => {
      const input = '<p>Unknown: <MadCap:variable name="General.NonExistent" /></p>';
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/test.htm'),
        variableOptions: {
          autoDiscoverFLVAR: true,
          variableMode: 'reference'
        }
      });
      
      // Should preserve as literal text or comment
      expect(result.content).toContain('NonExistent');
    });
  });

  describe('Conditional Content Processing', () => {
    
    it('should exclude blacklisted conditions', async () => {
      const input = `
        <p>Regular content</p>
        <p MadCap:conditions="Status.deprecated">Deprecated content</p>
        <p MadCap:conditions="Target.internal">Internal content</p>
        <p MadCap:conditions="Status.print-only">Print only content</p>
        <p MadCap:conditions="Status.hidden">Hidden content</p>
        <p MadCap:conditions="Status.active">Active content</p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('Regular content');
      expect(result.content).toContain('Active content');
      expect(result.content).not.toContain('Deprecated content');
      expect(result.content).not.toContain('Internal content');
      expect(result.content).not.toContain('Print only content');
      expect(result.content).not.toContain('Hidden content');
    });

    it('should handle multiple conditions on same element', async () => {
      const input = `
        <div MadCap:conditions="Status.active Target.online">Online active content</div>
        <div MadCap:conditions="Status.deprecated Target.online">Online deprecated content</div>
        <div MadCap:conditions="Status.active Target.print">Print active content</div>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('Online active content');
      expect(result.content).toContain('Print active content');
      expect(result.content).not.toContain('Online deprecated content');
    });

    it('should handle nested conditional content', async () => {
      const input = `
        <div MadCap:conditions="Status.active">
          <p>Outer active content</p>
          <p MadCap:conditions="Status.deprecated">Inner deprecated content</p>
          <p>More outer content</p>
        </div>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('Outer active content');
      expect(result.content).toContain('More outer content');
      expect(result.content).not.toContain('Inner deprecated content');
    });

    it('should handle condition exclusion in batch processing', async () => {
      const input = `
        <h1>Test Document</h1>
        <p>Regular content</p>
        <div MadCap:conditions="Status.deprecated">
          <h2>Deprecated Section</h2>
          <p>This entire section should be excluded</p>
        </div>
        <p>Final content</p>
      `;
      
      try {
        const result = await converter.convert(input, {
          format: 'writerside-markdown',
          inputType: 'madcap'
        });
        
        expect(result.content).toContain('# Test Document');
        expect(result.content).toContain('Regular content');
        expect(result.content).toContain('Final content');
        expect(result.content).not.toContain('Deprecated Section');
        expect(result.content).not.toContain('This entire section should be excluded');
      } catch (error) {
        // In batch mode, files with blacklisted conditions should be skipped entirely
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('blacklisted conditions');
      }
    });
  });

  describe('Snippet Processing', () => {
    
    it('should merge snippet content by default', async () => {
      const input = `
        <p>Activity definition: <MadCap:snippetText src="../Resources/Snippets/Activities.flsnp" /></p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/02 Planung/test.htm')
      });
      
      expect(result.content).toContain('Activity definition: An activity is any targeted action');
    });

    it('should convert snippets to include references when enabled', async () => {
      const input = `
        <p>See definition: <MadCap:snippetText src="../Resources/Snippets/Activities.flsnp" /></p>
        <MadCap:snippetBlock src="../Resources/Snippets/Dependencies.flsnp" />
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/02 Planung/test.htm'),
        writersideOptions: {
          mergeSnippets: true // Enable include references
        }
      });
      
      expect(result.content).toContain('<include from="Activities.md"/>');
      expect(result.content).toContain('<include from="Dependencies.md"/>');
    });

    it('should handle snippet conditions correctly', async () => {
      const input = `
        <MadCap:snippetBlock src="../Resources/Snippets/Activities.flsnp" MadCap:conditions="Status.active" />
        <MadCap:snippetText src="../Resources/Snippets/Dependencies.flsnp" MadCap:conditions="Status.deprecated" />
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/02 Planung/test.htm'),
        writersideOptions: {
          mergeSnippets: true
        }
      });
      
      expect(result.content).toContain('<include from="Activities.md"/>');
      expect(result.content).not.toContain('Dependencies');
    });

    it('should handle missing snippet files gracefully', async () => {
      const input = `
        <p>Missing: <MadCap:snippetText src="../Resources/Snippets/NonExistent.flsnp" /></p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        inputPath: path.join(FLARE_SOURCE_PATH, 'Content/02 Planung/test.htm')
      });
      
      // Should handle gracefully, either with placeholder or error comment
      expect(result.content).toContain('Missing:');
      expect(result.metadata.warnings).toBeDefined();
    });
  });

  describe('Cross-References and Links', () => {
    
    it('should convert MadCap cross-references to markdown links', async () => {
      const input = `
        <p>See <MadCap:xref href="01-01 CreatActivity.htm">Creating Activities</MadCap:xref> for details.</p>
        <p>Also check <MadCap:xref href="01-02 EditActivity.htm#anchor">Editing Activities</MadCap:xref>.</p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('[Creating Activities](01-01 CreatActivity.md)');
      expect(result.content).toContain('[Editing Activities](01-02 EditActivity.md#anchor)');
    });

    it('should handle self-closing xref elements', async () => {
      const input = `
        <p>Reference: <MadCap:xref href="Structure.htm" />.</p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('[](Structure.md)');
    });

    it('should preserve external links correctly', async () => {
      const input = `
        <p>Visit <a href="https://example.com">our website</a> for more information.</p>
        <p>Email us at <a href="mailto:info@example.com">info@example.com</a>.</p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toContain('[our website](https://example.com)');
      expect(result.content).toContain('[info@example.com](mailto:info@example.com)');
    });
  });

  describe('MadCap-Specific Elements', () => {
    
    it('should handle MadCap concept links', async () => {
      const input = `
        <p>Learn about <MadCap:concept term="Activities" />activities</MadCap:concept>.</p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('activities');
      // Concept links should be preserved as text or converted appropriately
    });

    it('should handle MadCap dropDown elements', async () => {
      const input = `
        <MadCap:dropDown>
          <MadCap:dropDownHead>
            <MadCap:dropDownHotspot>Click to expand</MadCap:dropDownHotspot>
          </MadCap:dropDownHead>
          <MadCap:dropDownBody>
            <p>Hidden content here.</p>
          </MadCap:dropDownBody>
        </MadCap:dropDown>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      // Should convert to appropriate Writerside format (collapsible section or regular content)
      expect(result.content).toContain('Click to expand');
      expect(result.content).toContain('Hidden content here.');
    });

    it('should handle MadCap keyword elements', async () => {
      const input = `
        <p>Important <MadCap:keyword term="keyword1;keyword2">term</MadCap:keyword> in text.</p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('Important term in text.');
    });

    it('should handle MadCap conditionalText elements', async () => {
      const input = `
        <p>This is <MadCap:conditionalText MadCap:conditions="Status.active">active</MadCap:conditionalText><MadCap:conditionalText MadCap:conditions="Status.deprecated">deprecated</MadCap:conditionalText> content.</p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('This is active content.');
      expect(result.content).not.toContain('deprecated');
    });
  });

  describe('Image Maps and Interactive Elements', () => {
    
    it('should handle image maps correctly', async () => {
      const input = `
        <map id="map1">
          <area shape="rectangle" coords="185,38,219,66" href="FilterGroup.htm" />
          <area shape="rectangle" coords="227,162,261,194" href="ActiHierarch.htm" />
        </map>
        <p><img src="structure.png" usemap="#map1" /></p>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toContain('![](structure.png)');
      // Image maps should be preserved or converted to appropriate format
    });

    it('should handle multimedia elements', async () => {
      const input = `
        <object MadCap:HTML5Video="true" src="demo.mp4" MadCap:Param_controls="true">
        </object>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      // Should convert to appropriate video embed or link
      expect(result.content).toContain('demo.mp4');
    });
  });

  describe('Style Class Mappings', () => {
    
    it('should map MadCap style classes correctly', async () => {
      const input = `
        <p class="mc-heading-1">Heading Text</p>
        <p class="mc-note">Note content</p>
        <p class="mc-warning">Warning content</p>
        <span class="mc-keyboard">Ctrl+S</span>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toContain('# Heading Text');
      expect(result.content).toContain('> Note content');
      expect(result.content).toContain('{style="note"}');
      expect(result.content).toContain('> Warning content');
      expect(result.content).toContain('{style="warning"}');
      expect(result.content).toContain('`Ctrl+S`');
    });

    it('should handle custom style classes appropriately', async () => {
      const input = `
        <p class="custom-style">Custom styled content</p>
        <span class="highlight">Highlighted text</span>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'html'
      });
      
      expect(result.content).toContain('Custom styled content');
      expect(result.content).toContain('Highlighted text');
    });
  });

  describe('Advanced MadCap Features', () => {
    
    it('should handle topic redirects', async () => {
      const input = `
        <html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd" MadCap:redirectLocation="new-location.htm">
          <head><title>Redirected Topic</title></head>
          <body>
            <p>This topic has moved.</p>
          </body>
        </html>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      // Should handle redirect appropriately
      expect(result.content).toContain('This topic has moved.');
      expect(result.metadata.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('redirect')
        ])
      );
    });

    it('should handle master page references', async () => {
      const input = `
        <html style="mc-template-page: url('MasterPages/Other-Topics.flmsp');">
          <body>
            <h1>Content with Master Page</h1>
            <p>Regular content.</p>
          </body>
        </html>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      expect(result.content).toContain('# Content with Master Page');
      expect(result.content).toContain('Regular content.');
    });

    it('should handle micro content correctly', async () => {
      const input = `
        <MadCap:microContent id="micro1">
          <MadCap:microContentHead>Quick Info</MadCap:microContentHead>
          <MadCap:microContentBody>
            <p>Brief explanation of the topic.</p>
          </MadCap:microContentBody>
        </MadCap:microContent>
      `;
      
      const result = await converter.convert(input, {
        format: 'writerside-markdown',
        inputType: 'madcap'
      });
      
      // Should convert to appropriate format (possibly admonition or section)
      expect(result.content).toContain('Quick Info');
      expect(result.content).toContain('Brief explanation of the topic.');
    });
  });
});
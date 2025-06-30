import { describe, it, expect, beforeEach } from '@jest/globals';
import WritersideMarkdownConverter from '../src/converters/writerside-markdown-converter.js';

describe('WritersideMarkdownConverter - End-to-End Tests', () => {
  let converter: WritersideMarkdownConverter;

  beforeEach(() => {
    converter = new WritersideMarkdownConverter();
  });

  describe('Real MadCap content conversion', () => {
    it('should convert a complete MadCap help topic with all features', async () => {
      const realMadCapContent = `
        <html>
          <head>
            <title>User Management Guide</title>
          </head>
          <body>
            <h1>User Management Guide</h1>
            
            <div class="mc-note">
              <p><strong>Note:</strong> This feature requires administrator privileges.</p>
            </div>
            
            <p>This guide explains how to manage users in the system.</p>
            
            <div class="mc-procedure">
              <h3>Adding a New User</h3>
              <ol>
                <li>Navigate to the Users section</li>
                <li>Click the <strong>Add User</strong> button</li>
                <li>Fill in the user details</li>
                <li>Assign appropriate roles</li>
                <li>Save the configuration</li>
              </ol>
            </div>
            
            <div class="mc-tabs">
              <div class="mc-tab-head">
                <button class="mc-tab">Web Interface</button>
                <button class="mc-tab">API</button>
              </div>
              <div class="mc-tab-body">
                <div class="mc-tab-content">
                  <p>Use the web interface for interactive user management.</p>
                  <img src="../Images/GUI-Elemente/AddUser.png" alt="Add User Button" class="IconInline" width="24">
                </div>
                <div class="mc-tab-content">
                  <p>Use the REST API for programmatic user management.</p>
                  <pre><code>POST /api/users
{
  "username": "newuser",
  "email": "user@example.com"
}</code></pre>
                </div>
              </div>
            </div>
            
            <div class="mc-dropdown">
              <button class="mc-dropdown-head">Advanced User Settings</button>
              <div class="mc-dropdown-body">
                <p>Advanced settings include custom permissions and group assignments.</p>
                <div class="mc-warning">
                  <p><strong>Warning:</strong> Modifying these settings may affect system security.</p>
                </div>
              </div>
            </div>
            
            <div data-mc-snippet="common-footer.flsnp">
              <p>For more information, contact support.</p>
            </div>
          </body>
        </html>
      `;

      const result = await converter.convert(realMadCapContent, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        writersideOptions: {
          enableSemanticMarkup: true,
          enableProcedureBlocks: true,
          enableCollapsibleBlocks: true,
          enableTabs: true,
          mergeSnippets: false
        }
      });

      // Verify document structure
      expect(result.content).toContain('# User Management Guide');
      
      // Verify semantic admonitions
      expect(result.content).toContain('<note>');
      expect(result.content).toContain('**Note:** This feature requires administrator privileges.');
      expect(result.content).toContain('</note>');
      
      // Verify procedure blocks
      expect(result.content).toContain('<procedure title="Adding a New User"');
      expect(result.content).toContain('<step>Navigate to the Users section</step>');
      expect(result.content).toContain('<step>Click the **Add User** button</step>');
      expect(result.content).toContain('</procedure>');
      
      // Verify tab groups
      expect(result.content).toContain('<tabs>');
      expect(result.content).toContain('<tab title="Web Interface">');
      expect(result.content).toContain('<tab title="API">');
      expect(result.content).toContain('</tabs>');
      
      // Verify collapsible blocks
      expect(result.content).toContain('<collapsible title="Advanced User Settings">');
      expect(result.content).toContain('</collapsible>');
      
      // Verify nested warning in collapsible
      expect(result.content).toContain('<warning>');
      expect(result.content).toContain('**Warning:** Modifying these settings');
      
      // Verify image path conversion
      expect(result.content).toContain('![Add User Button](../images/Images/GUI-Elemente/AddUser.png)');
      
      // Verify code blocks are preserved
      expect(result.content).toContain('POST /api/users');
      
      // Verify snippet include directive
      expect(result.content).toContain('<include from="common-footer.md"');
    });

    it('should convert with fallback options when features are disabled', async () => {
      const realMadCapContent = `
        <div class="mc-note">
          <p><strong>Note:</strong> Important information</p>
        </div>
        <div class="mc-procedure">
          <h3>Installation Steps</h3>
          <ol>
            <li>Download the software</li>
            <li>Run the installer</li>
          </ol>
        </div>
      `;

      const result = await converter.convert(realMadCapContent, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        writersideOptions: {
          enableSemanticMarkup: false,
          enableProcedureBlocks: false,
          enableCollapsibleBlocks: false,
          enableTabs: false,
          mergeSnippets: true
        }
      });

      // Should use regular markdown syntax  
      expect(result.content).toContain('> **Note:**');
      expect(result.content).toContain('{style="note"}');
      expect(result.content).toContain('### Installation Steps');
      expect(result.content).toContain('1. Download the software');
      expect(result.content).toContain('2. Run the installer');
      
      // Should not contain XML-like syntax
      expect(result.content).not.toContain('<note>');
      expect(result.content).not.toContain('<procedure');
    });
  });

  describe('MadCap variable integration with Writerside features', () => {
    it('should preserve variables in Writerside XML elements', async () => {
      const variableContent = `
        <div class="mc-procedure">
          <h3>Installing <MadCap:variable name="General.ProductName" /></h3>
          <ol>
            <li>Download <MadCap:variable name="General.ProductName" /> from the website</li>
            <li>Run the <MadCap:variable name="General.ProductName" /> installer</li>
          </ol>
        </div>
      `;

      const result = await converter.convert(variableContent, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        writersideOptions: {
          enableProcedureBlocks: true
        },
        variableOptions: {
          extractVariables: false // Keep variables as references
        }
      });

      expect(result.content).toContain('<procedure title="Installing <var name="ProductName"/>"');
      expect(result.content).toContain('<step>Download <var name="ProductName"/> from the website</step>');
      expect(result.content).toContain('<step>Run the <var name="ProductName"/> installer</step>');
    });
  });

  describe('Complex nested structures', () => {
    it('should handle deeply nested MadCap structures', async () => {
      const nestedContent = `
        <div class="mc-tabs">
          <div class="mc-tab-head">
            <button class="mc-tab">Configuration</button>
            <button class="mc-tab">Troubleshooting</button>
          </div>
          <div class="mc-tab-body">
            <div class="mc-tab-content">
              <div class="mc-procedure">
                <h4>Basic Configuration</h4>
                <ol>
                  <li>
                    Open settings
                    <div class="mc-note">
                      <p><strong>Note:</strong> Settings require admin access</p>
                    </div>
                  </li>
                  <li>Configure options</li>
                </ol>
              </div>
            </div>
            <div class="mc-tab-content">
              <div class="mc-dropdown">
                <button class="mc-dropdown-head">Common Issues</button>
                <div class="mc-dropdown-body">
                  <div class="mc-warning">
                    <p><strong>Warning:</strong> Check logs before proceeding</p>
                  </div>
                  <p>Most issues are configuration-related.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      const result = await converter.convert(nestedContent, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        writersideOptions: {
          enableSemanticMarkup: true,
          enableProcedureBlocks: true,
          enableCollapsibleBlocks: true,
          enableTabs: true
        }
      });

      // Verify outer tabs structure
      expect(result.content).toContain('<tabs>');
      expect(result.content).toContain('<tab title="Configuration">');
      expect(result.content).toContain('<tab title="Troubleshooting">');
      
      // Verify nested procedure in first tab
      expect(result.content).toContain('<procedure title="Basic Configuration"');
      expect(result.content).toContain('<step>Open settings');
      
      // Verify nested note in procedure step
      expect(result.content).toContain('<note>');
      expect(result.content).toContain('Settings require admin access');
      
      // Verify nested collapsible in second tab
      expect(result.content).toContain('<collapsible title="Common Issues">');
      
      // Verify nested warning in collapsible
      expect(result.content).toContain('<warning>');
      expect(result.content).toContain('Check logs before proceeding');
      
      expect(result.content).toContain('</tabs>');
    });
  });

  describe('Performance and memory usage', () => {
    it('should handle large documents efficiently', async () => {
      // Generate a large document with many features
      const sections = [];
      for (let i = 1; i <= 50; i++) {
        sections.push(`
          <div class="mc-procedure">
            <h3>Procedure ${i}</h3>
            <ol>
              <li>Step 1 for procedure ${i}</li>
              <li>Step 2 for procedure ${i}</li>
              <li>Step 3 for procedure ${i}</li>
            </ol>
          </div>
          <div class="mc-note">
            <p><strong>Note:</strong> Information for section ${i}</p>
          </div>
        `);
      }
      
      const largeContent = `
        <html>
          <body>
            <h1>Large Document</h1>
            ${sections.join('\n')}
          </body>
        </html>
      `;

      const startTime = Date.now();
      
      const result = await converter.convert(largeContent, {
        format: 'writerside-markdown',
        inputType: 'madcap',
        writersideOptions: {
          enableSemanticMarkup: true,
          enableProcedureBlocks: true
        }
      });
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Verify conversion completed
      expect(result.content).toContain('# Large Document');
      expect(result.content).toContain('<procedure title="Procedure 1"');
      expect(result.content).toContain('<procedure title="Procedure 50"');
      
      // Verify reasonable performance (should process in under 5 seconds)
      expect(processingTime).toBeLessThan(5000);
      
      // Verify memory usage is reasonable
      expect(result.content.length).toBeGreaterThan(10000);
      expect(result.metadata?.wordCount).toBeGreaterThan(100);
    });
  });

  describe('Integration with existing MCP tools', () => {
    it('should work with convert_document MCP tool interface', async () => {
      const testContent = `
        <div class="mc-procedure">
          <h3>MCP Integration Test</h3>
          <ol>
            <li>Test step 1</li>
            <li>Test step 2</li>
          </ol>
        </div>
      `;

      // Simulate the MCP tool interface
      const mcpOptions = {
        input: testContent,
        inputType: 'madcap',
        format: 'writerside-markdown',
        writersideOptions: {
          enableProcedureBlocks: true
        }
      };

      const result = await converter.convert(mcpOptions.input, {
        format: mcpOptions.format,
        inputType: mcpOptions.inputType,
        writersideOptions: mcpOptions.writersideOptions
      });

      expect(result.content).toContain('<procedure title="MCP Integration Test"');
      expect(result.content).toContain('<step>Test step 1</step>');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.wordCount).toBeGreaterThan(0);
    });
  });
});
#!/usr/bin/env node

import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { writeFileSync } from 'fs';

// Test HTML with MadCap variables
const testHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Variable Reference Test</title>
</head>
<body>
    <h1>Testing Variable References</h1>
    
    <p>Welcome to <MadCap:variable name="General.CompanyName" />! Our product <MadCap:variable name="Product.Name" /> is the best solution.</p>
    
    <p>Contact us at <MadCap:variable name="Contact.Email" /> or visit our website at <MadCap:variable name="Company.Website" />.</p>
    
    <p>The latest version is <MadCap:variable name="Product.Version" /> released on <MadCap:variable name="Product.ReleaseDate" />.</p>
    
    <div class="note">
        <p><span class="noteInDiv">Note:</span> <MadCap:variable name="Support.ContactInfo" /> for technical support.</p>
    </div>
</body>
</html>`;

// Mock FLVAR content to simulate variable extraction
const mockFLVARContent = `<?xml version="1.0" encoding="utf-8"?>
<CatapultVariableSet>
    <Variable Name="CompanyName">Acme Corporation</Variable>
    <Variable Name="Email">support@acme.com</Variable>
    <Variable Name="Website">https://www.acme.com</Variable>
    <Variable Name="ContactInfo">Call 1-800-ACME or email support@acme.com</Variable>
</CatapultVariableSet>`;

const mockProductFLVAR = `<?xml version="1.0" encoding="utf-8"?>
<CatapultVariableSet>
    <Variable Name="Name">AcmeWidget Pro</Variable>
    <Variable Name="Version">2.1.4</Variable>
    <Variable Name="ReleaseDate">December 2024</Variable>
</CatapultVariableSet>`;

async function testVariableReferences() {
    console.log('Testing Variable Reference Preservation in AsciiDoc...\n');
    
    const converter = new AsciiDocConverter();
    
    try {
        // Test with variable extraction and reference mode
        const result = await converter.convert(testHtml, {
            format: 'asciidoc',
            inputType: 'html',
            variableOptions: {
                extractVariables: true,
                variableFormat: 'adoc',
                variableMode: 'reference',  // KEY: Use reference mode, not flatten
                nameConvention: 'original',
                autoDiscoverFLVAR: false,
                flvarFiles: [] // Simulating no FLVAR files found
            }
        });
        
        console.log('=== CONVERSION RESULT (Reference Mode) ===\n');
        console.log(result.content);
        
        if (result.variablesFile) {
            console.log('\n=== VARIABLES FILE ===\n');
            console.log(result.variablesFile);
        }
        
        // Save to file for inspection
        writeFileSync('test-variable-references-output.adoc', result.content);
        if (result.variablesFile) {
            writeFileSync('test-variables.adoc', result.variablesFile);
        }
        
        console.log('\n=== QUALITY CHECKS ===');
        
        // Check if variables are preserved as references, not flattened
        const hasVariableReferences = /{[^}]+}/.test(result.content);
        console.log(`✓ Has variable references (e.g., {company-name}): ${hasVariableReferences}`);
        
        // Check that variables are NOT flattened (no hardcoded values)
        const hasFlattened = result.content.includes('Acme Corporation') || 
                           result.content.includes('support@acme.com') ||
                           result.content.includes('AcmeWidget Pro');
        console.log(`✓ Variables NOT flattened (no hardcoded values): ${!hasFlattened}`);
        
        // Check for MadCap variable tags (should be converted)
        const hasMadCapTags = /<MadCap:variable/.test(result.content);
        console.log(`✓ MadCap variable tags converted: ${!hasMadCapTags}`);
        
        // Check if variables file was generated
        const hasVariablesFile = !!result.variablesFile;
        console.log(`✓ Variables file generated: ${hasVariablesFile}`);
        
        if (result.variablesFile) {
            // Check variables file format
            const hasAsciiDocAttributes = result.variablesFile.includes(':company-name:') ||
                                        result.variablesFile.includes(':product-name:');
            console.log(`✓ Variables file has AsciiDoc attributes: ${hasAsciiDocAttributes}`);
        }
        
        // Test flatten mode for comparison
        console.log('\n=== TESTING FLATTEN MODE FOR COMPARISON ===\n');
        
        const flattenResult = await converter.convert(testHtml, {
            format: 'asciidoc',
            inputType: 'html',
            variableOptions: {
                extractVariables: true,
                variableFormat: 'adoc',
                variableMode: 'flatten',  // Flatten mode for comparison
                nameConvention: 'original',
                autoDiscoverFLVAR: false,
                flvarFiles: []
            }
        });
        
        console.log('Flatten mode output (first 200 chars):');
        console.log(flattenResult.content.substring(0, 200) + '...');
        
        const flattenHasReferences = /{[^}]+}/.test(flattenResult.content);
        console.log(`✓ Flatten mode has NO variable references: ${!flattenHasReferences}`);
        
    } catch (error) {
        console.error('Conversion failed:', error);
    }
}

testVariableReferences();
#!/usr/bin/env node

import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

async function testAsciiDocVariableNaming() {
    console.log('Testing AsciiDoc Variable Naming...\n');
    
    const converter = new AsciiDocConverter();
    
    // Test HTML with MadCap variables
    const testHtml = `<!DOCTYPE html>
<html>
<body>
    <h1>Test Document</h1>
    <p>Company: <MadCap:variable name="General.CompanyName" /></p>
    <p>Phone: <MadCap:variable name="Contact.PhoneNumber" /></p>
    <p>Address: <MadCap:variable name="Contact.StreetAddress" /></p>
</body>
</html>`;
    
    try {
        const result = await converter.convert(testHtml, {
            format: 'asciidoc',
            inputType: 'html',
            variableOptions: {
                extractVariables: true,
                variableFormat: 'adoc',
                variableMode: 'reference',
                nameConvention: 'original',
                autoDiscoverFLVAR: false
            }
        });
        
        console.log('=== CONTENT OUTPUT ===');
        console.log(result.content);
        
        if (result.variablesFile) {
            console.log('\n=== VARIABLES FILE OUTPUT ===');
            console.log(result.variablesFile);
        }
        
        // Extract variable references from content
        const variableRefs = result.content.match(/{[^}]+}/g) || [];
        console.log('\n=== VARIABLE REFERENCES FOUND ===');
        variableRefs.forEach(ref => console.log(ref));
        
        // Check if they match the kebab-case format I set up in strongdoc
        const expectedKebabCase = ['{company-name}', '{phone-number}', '{street-address}'];
        const hasKebabCase = variableRefs.some(ref => expectedKebabCase.includes(ref));
        
        console.log(`\n✓ Uses kebab-case format: ${hasKebabCase}`);
        console.log(`✓ Variable file generated: ${!!result.variablesFile}`);
        
    } catch (error) {
        console.error('Conversion failed:', error);
    }
}

testAsciiDocVariableNaming();
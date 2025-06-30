#!/usr/bin/env node

import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { readFileSync, writeFileSync } from 'fs';

// Test HTML with complex lists and potential HTML artifacts
const testHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Test Document</title>
</head>
<body>
    <h1>Complex List and HTML Artifact Test</h1>
    
    <p>This document tests &lt;ultra-clean&gt; AsciiDoc conversion with &amp;special&amp; HTML entities.</p>
    
    <p>Here's a complex nested list structure:</p>
    
    <ol>
        <li>First level item with &quot;quoted text&quot;
            <p>Additional paragraph in first item</p>
            <ol style="list-style-type: lower-alpha;">
                <li>Nested alpha item a</li>
                <li>Nested alpha item b
                    <p>With a paragraph</p>
                    <div class="note">
                        <p><span class="noteInDiv">Note:</span> This is a note inside a list</p>
                    </div>
                </li>
                <li>Nested alpha item c
                    <ol>
                        <li>Third level numeric</li>
                        <li>Another third level</li>
                    </ol>
                </li>
            </ol>
        </li>
        <li>Second first-level item
            <p>With multiple paragraphs</p>
            <p>This is the second paragraph</p>
            <ul>
                <li>Bullet point one</li>
                <li>Bullet point two
                    <ul>
                        <li>Nested bullet</li>
                        <li>Another nested bullet</li>
                    </ul>
                </li>
            </ul>
        </li>
        <li>Third item with <strong>bold</strong> and <em>italic</em> text</li>
    </ol>
    
    <p>Text after the list with MadCap:variable and other artifacts.</p>
    
    <div class="warning">
        <p><span class="warningInDiv">Warning:</span> Check for HTML entities: &nbsp;&copy;&reg;</p>
    </div>
</body>
</html>`;

async function testConversion() {
    console.log('Testing Ultra-Clean AsciiDoc Conversion...\n');
    
    const converter = new AsciiDocConverter();
    
    try {
        const result = await converter.convert(testHtml, {
            format: 'asciidoc',
            inputType: 'html'
        });
        
        console.log('=== CONVERSION RESULT ===\n');
        console.log(result.content);
        
        // Save to file for inspection
        writeFileSync('test-ultra-clean-output.adoc', result.content);
        console.log('\n=== Output saved to test-ultra-clean-output.adoc ===');
        
        // Check for HTML artifacts
        console.log('\n=== QUALITY CHECKS ===');
        
        const htmlTagCheck = /<[^>]+>/.test(result.content);
        console.log(`✓ No HTML tags remaining: ${!htmlTagCheck}`);
        
        const htmlEntityCheck = /&[a-z]+;/.test(result.content);
        console.log(`✓ No HTML entities remaining: ${!htmlEntityCheck}`);
        
        const listAttributeCheck = /\[loweralpha\]/.test(result.content);
        console.log(`✓ List attributes present: ${listAttributeCheck}`);
        
        const continuationCheck = /\+\n/.test(result.content);
        console.log(`✓ Continuation markers present: ${continuationCheck}`);
        
        const madcapCheck = /MadCap:|mc-/.test(result.content);
        console.log(`✓ No MadCap artifacts: ${!madcapCheck}`);
        
    } catch (error) {
        console.error('Conversion failed:', error);
    }
}

testConversion();
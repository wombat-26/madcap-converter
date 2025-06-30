#!/usr/bin/env node

import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

const testHtml = `<!DOCTYPE html>
<html>
<body>
    <h1>List Nesting Test</h1>
    
    <ol>
        <li>First item
            <p>With a paragraph</p>
        </li>
        <li>Second item
            <p>First paragraph</p>
            <p>Second paragraph</p>
            <ul>
                <li>Bullet one</li>
                <li>Bullet two
                    <ul>
                        <li>Nested bullet</li>
                    </ul>
                </li>
            </ul>
        </li>
        <li>Third item</li>
    </ol>
</body>
</html>`;

async function test() {
    const converter = new AsciiDocConverter();
    const result = await converter.convert(testHtml, {
        format: 'asciidoc',
        inputType: 'html'
    });
    
    console.log('=== LIST NESTING OUTPUT ===\n');
    console.log(result.content);
}

test();
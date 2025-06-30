import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';

const inputPath = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';

// Read the AsciiDocConverter implementation to understand it better
console.log('=== ANALYZING ASCIIDOC CONVERTER IMPLEMENTATION ===\n');

// Let's trace through the actual conversion process
async function traceConversion() {
    try {
        // Read and preprocess the HTML
        const html = fs.readFileSync(inputPath, 'utf-8');
        const preprocessor = new MadCapPreprocessor();
        const preprocessedHtml = await preprocessor.preprocessMadCapContent(html, inputPath);
        
        // Parse the HTML
        const dom = new JSDOM(preprocessedHtml);
        const document = dom.window.document;
        
        // Find all ordered lists
        const orderedLists = document.querySelectorAll('ol');
        console.log(`Found ${orderedLists.length} ordered lists\n`);
        
        // Analyze each list structure
        orderedLists.forEach((ol, index) => {
            console.log(`=== LIST ${index + 1} ===`);
            console.log('Type:', ol.getAttribute('type') || 'default');
            console.log('Style:', ol.getAttribute('style') || 'none');
            console.log('Start:', ol.getAttribute('start') || '1');
            console.log('Class:', ol.getAttribute('class') || 'none');
            
            // Check for lower-alpha style
            const style = ol.getAttribute('style');
            if (style && style.includes('lower-alpha')) {
                console.log('>>> This is a LOWER-ALPHA list!');
            }
            
            // Count direct child LI elements
            const directLis = Array.from(ol.children).filter(child => child.tagName === 'LI');
            console.log(`Direct LI children: ${directLis.length}`);
            
            // Check first LI content
            if (directLis.length > 0) {
                const firstLi = directLis[0];
                console.log('\nFirst LI structure:');
                console.log('- Text content:', firstLi.textContent.trim().substring(0, 100) + '...');
                
                // Check for nested lists
                const nestedOl = firstLi.querySelector('ol');
                const nestedUl = firstLi.querySelector('ul');
                if (nestedOl) {
                    console.log('- Contains nested OL');
                }
                if (nestedUl) {
                    console.log('- Contains nested UL');
                }
                
                // Check for notes
                const notes = firstLi.querySelectorAll('.mc-note, .noteInDiv');
                if (notes.length > 0) {
                    console.log(`- Contains ${notes.length} note(s)`);
                }
            }
            
            console.log('\n');
        });
        
        // Now test the converter
        console.log('=== TESTING CONVERTER ===\n');
        const converter = new AsciiDocConverter();
        const result = await converter.convert(preprocessedHtml, {
            inputPath,
            preserveAttributes: true,
            includeHeader: true
        });
        
        // Analyze the output for problematic patterns
        console.log('=== ANALYZING OUTPUT ===\n');
        const lines = result.content.split('\n');
        
        // Find double + signs
        const doublePlus = [];
        for (let i = 0; i < lines.length - 1; i++) {
            if (lines[i].trim() === '+' && lines[i + 1].trim() === '+') {
                doublePlus.push(i + 1);
            }
        }
        if (doublePlus.length > 0) {
            console.log(`Found double + signs at lines: ${doublePlus.join(', ')}`);
        }
        
        // Find [loweralpha] on its own line
        const loweralphaLines = lines.map((line, i) => 
            line.trim() === '[loweralpha]' ? i + 1 : null
        ).filter(Boolean);
        if (loweralphaLines.length > 0) {
            console.log(`Found [loweralpha] on its own at lines: ${loweralphaLines.join(', ')}`);
        }
        
        // Find orphaned letters
        const orphanedLetters = lines.map((line, i) => 
            line.trim().match(/^[a-z]\.$/) ? i + 1 : null
        ).filter(Boolean);
        if (orphanedLetters.length > 0) {
            console.log(`Found orphaned letters at lines: ${orphanedLetters.join(', ')}`);
        }
        
        // Save detailed output
        fs.writeFileSync('./debug-list-hierarchy-detailed.adoc', result.content);
        console.log('\nOutput saved to debug-list-hierarchy-detailed.adoc');
        
    } catch (error) {
        console.error('Error:', error);
        console.error(error.stack);
    }
}

// Run the trace
traceConversion();
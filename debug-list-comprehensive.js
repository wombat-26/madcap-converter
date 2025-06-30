import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

const inputPath = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';

async function comprehensiveDebug() {
    try {
        // Read and preprocess
        const html = fs.readFileSync(inputPath, 'utf-8');
        const preprocessor = new MadCapPreprocessor();
        const preprocessedHtml = await preprocessor.preprocessMadCapContent(html, inputPath);
        
        // Parse with JSDOM
        const dom = new JSDOM(preprocessedHtml);
        const document = dom.window.document;
        
        // Find a specific problematic section
        console.log('=== FINDING PROBLEMATIC NESTED LISTS ===\n');
        
        // Look for the "On the Type page:" list item
        const allLis = document.querySelectorAll('li');
        let problematicLi = null;
        
        for (const li of allLis) {
            if (li.textContent.includes('On the') && li.textContent.includes('page:')) {
                problematicLi = li;
                console.log('Found problematic list item:', li.textContent.substring(0, 50) + '...');
                break;
            }
        }
        
        if (problematicLi) {
            console.log('\n=== STRUCTURE ANALYSIS ===');
            
            // Check parent
            const parent = problematicLi.parentElement;
            console.log('Parent element:', parent.tagName);
            console.log('Parent style:', parent.getAttribute('style') || 'none');
            
            // Check children
            console.log('\nDirect children of this LI:');
            Array.from(problematicLi.children).forEach((child, index) => {
                console.log(`${index}: ${child.tagName} - ${child.textContent.substring(0, 50)}...`);
                if (child.tagName === 'OL') {
                    console.log('   Style:', child.getAttribute('style'));
                    console.log('   Type:', child.getAttribute('type'));
                }
            });
            
            // Extract the HTML of this specific section
            console.log('\n=== RAW HTML OF PROBLEMATIC SECTION ===');
            console.log(problematicLi.innerHTML.substring(0, 500) + '...');
        }
        
        // Now let's see what the converter produces
        console.log('\n=== CONVERTING WITH ASCIIDOC CONVERTER ===');
        const converter = new AsciiDocConverter();
        const result = await converter.convert(preprocessedHtml, {
            inputPath,
            preserveAttributes: true,
            includeHeader: true
        });
        
        // Find the problematic section in the output
        const outputLines = result.content.split('\n');
        const typePageIndex = outputLines.findIndex(line => line.includes('On the') && line.includes('page:'));
        
        if (typePageIndex !== -1) {
            console.log('\n=== OUTPUT AROUND PROBLEMATIC SECTION ===');
            const start = Math.max(0, typePageIndex - 5);
            const end = Math.min(outputLines.length, typePageIndex + 15);
            
            for (let i = start; i < end; i++) {
                const prefix = i === typePageIndex ? '>>> ' : '    ';
                console.log(`${prefix}${i}: ${outputLines[i]}`);
            }
        }
        
        // Analyze the specific issues
        console.log('\n=== ISSUE ANALYSIS ===');
        console.log('1. Double + signs appear before [loweralpha]');
        console.log('2. [loweralpha] is on its own line');
        console.log('3. The nested list items use single . instead of ..');
        
        console.log('\n=== PROPOSED FIX ===');
        console.log('The improved-list-processor.ts needs these changes:');
        console.log('');
        console.log('1. In convertOrderedList method:');
        console.log('   - Remove lines 57-61 that add [loweralpha] on its own line');
        console.log('');
        console.log('2. In getOrderedMarker method:');
        console.log('   - For nested alphabetical lists, return ".." (double dot)');
        console.log('   - The current logic returns "." which is incorrect for nested lists');
        console.log('');
        console.log('3. Alternative approach:');
        console.log('   - Keep [loweralpha] but ensure proper formatting');
        console.log('   - Place it on the same line as the first list item');
        console.log('   - Or use explicit alphabetical markers (a., b., c.)');
        
        // Show the correct output
        console.log('\n=== CORRECT OUTPUT SHOULD BE ===');
        console.log('. On the *Type* page:');
        console.log('+');
        console.log('.. Use the _Activity type_ list to select...');
        console.log('.. Use the _Parent_ list to select...');
        console.log('+');
        console.log('Depending on the rules...');
        console.log('.. Click _Next_.');
        
    } catch (error) {
        console.error('Error:', error);
        console.error(error.stack);
    }
}

comprehensiveDebug();
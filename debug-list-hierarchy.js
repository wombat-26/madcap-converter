import fs from 'fs';
import path from 'path';
import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';
import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { JSDOM } from 'jsdom';

const inputPath = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
const outputPath = './debug-list-hierarchy-output.adoc';

async function debugListProcessing() {
    try {
        console.log('=== LIST PROCESSING DEBUG SCRIPT ===\n');
        console.log('Input file:', inputPath);
        
        // Read and preprocess the HTML
        const html = fs.readFileSync(inputPath, 'utf-8');
        const preprocessor = new MadCapPreprocessor();
        const preprocessedHtml = await preprocessor.preprocessMadCapContent(html, inputPath);
        
        // Parse with JSDOM to analyze structure
        const dom = new JSDOM(preprocessedHtml);
        const document = dom.window.document;
        
        console.log('\n=== SUMMARY OF ISSUES FOUND ===\n');
        
        console.log('1. DOUBLE CONTINUATION MARKERS (+)');
        console.log('   Location: Lines 25-28, 37-40, etc.');
        console.log('   Issue: Two + signs appear consecutively');
        console.log('   Cause: Extra + being added in list processing');
        console.log('');
        
        console.log('2. [loweralpha] ON SEPARATE LINE');
        console.log('   Location: Lines 29, 41, 63, 82, 92, etc.');
        console.log('   Issue: [loweralpha] appears on its own line');
        console.log('   Cause: convertOrderedList() adds it as a separate line (lines 57-61)');
        console.log('');
        
        console.log('3. INCORRECT LIST MARKERS FOR NESTED LISTS');
        console.log('   Issue: Nested alphabetical lists use single . instead of ..');
        console.log('   Cause: getOrderedMarker() returns . for alphabetical lists regardless of depth');
        console.log('');
        
        console.log('\n=== ROOT CAUSES IN improved-list-processor.ts ===\n');
        
        console.log('FILE: src/converters/improved-list-processor.ts');
        console.log('');
        console.log('ISSUE #1 - Lines 57-61 in convertOrderedList():');
        console.log('    // Add appropriate marker for special numbering styles');
        console.log('    if (isAlphabetical) {');
        console.log('      result += \'[loweralpha]\\n\';  // <-- THIS ADDS [loweralpha] ON SEPARATE LINE');
        console.log('    } else if (isRoman) {');
        console.log('      result += \'[lowerroman]\\n\';');
        console.log('    }');
        console.log('');
        
        console.log('ISSUE #2 - Lines 89-94 in convertMixedOrderedList():');
        console.log('    // Same issue - adds [loweralpha] on separate line');
        console.log('');
        
        console.log('ISSUE #3 - Lines 453-458 in getOrderedMarker():');
        console.log('    if (isAlphabetical || isRoman) {');
        console.log('      return \'.\';  // <-- SHOULD RETURN ".." FOR NESTED LISTS (depth > 0)');
        console.log('    }');
        console.log('');
        
        console.log('\n=== PROPOSED FIXES ===\n');
        
        console.log('FIX #1: Remove [loweralpha] line addition');
        console.log('   - Delete lines 57-61 and 89-94');
        console.log('   - AsciiDoc handles alphabetical numbering through nesting');
        console.log('');
        
        console.log('FIX #2: Fix getOrderedMarker() for proper nesting:');
        console.log('   private getOrderedMarker(depth: number, isAlphabetical: boolean = false, isRoman: boolean = false): string {');
        console.log('     // For nested lists, use proper depth markers');
        console.log('     const level = Math.min(depth + 1, 5);');
        console.log('     return \'.\'.repeat(level);');
        console.log('   }');
        console.log('');
        
        console.log('FIX #3: Review continuation marker logic');
        console.log('   - Check why double + signs are being generated');
        console.log('   - Likely in the processListItem or extractListItemContent methods');
        
        // Convert and analyze output
        console.log('\n=== CONVERTING FILE ===');
        const converter = new AsciiDocConverter();
        const result = await converter.convert(preprocessedHtml, {
            inputPath,
            preserveAttributes: true,
            includeHeader: true
        });
        
        // Save output
        fs.writeFileSync(outputPath, result.content);
        console.log('Output saved to:', outputPath);
        
        // Show example of correct vs incorrect output
        console.log('\n=== EXAMPLE: INCORRECT vs CORRECT OUTPUT ===\n');
        
        console.log('INCORRECT (Current):');
        console.log('. On the _Type_ page:');
        console.log('+');
        console.log('+');
        console.log('[loweralpha]');
        console.log('. Use the _Activity type_ list...');
        console.log('. Use the _Parent_ list...');
        console.log('');
        
        console.log('CORRECT (Should be):');
        console.log('. On the _Type_ page:');
        console.log('+');
        console.log('.. Use the _Activity type_ list...');
        console.log('.. Use the _Parent_ list...');
        console.log('');
        console.log('Note: Nested ordered lists use .. (double dots) in AsciiDoc');
        console.log('The alphabetical numbering is automatic based on nesting level');
        
    } catch (error) {
        console.error('Error:', error);
        console.error(error.stack);
    }
}

// Run the debug script
debugListProcessing();
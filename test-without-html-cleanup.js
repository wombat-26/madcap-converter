import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

const testHtml = `
<!DOCTYPE html>
<html>
<body>
<p>For instructions, see <a href="#Configur">Configuring Planned Impact</a>.</p>
<p>Another test with <strong>bold</strong> text.</p>
</body>
</html>`;

async function testWithoutCleanup() {
  console.log('=== Test HTML ===');
  console.log(testHtml);
  
  const converter = new AsciiDocConverter();
  
  // Temporarily disable the HTML tag removal
  const originalRemoveHTML = converter['removeAllHTMLArtifacts'].bind(converter);
  converter['removeAllHTMLArtifacts'] = function(content) {
    console.log('\n=== Before removeAllHTMLArtifacts ===');
    console.log(content);
    
    // Call original but skip the HTML tag removal line
    let result = content;
    
    // Skip this line: result = result.replace(/<[^>]+>/g, '');
    console.log('\n=== Skipping HTML tag removal ===');
    
    // Decode any remaining HTML entities
    result = result.replace(/&lt;/g, '<');
    result = result.replace(/&gt;/g, '>');
    result = result.replace(/&amp;/g, '&');
    result = result.replace(/&quot;/g, '"');
    result = result.replace(/&apos;/g, "'");
    result = result.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec)));
    result = result.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
    
    // Remove any MadCap artifacts
    result = result.replace(/MadCap:[^\s]+/g, '');
    result = result.replace(/mc-[^:]+:[^;]+;/g, '');
    
    console.log('\n=== After cleanup (without HTML removal) ===');
    console.log(result);
    
    return result;
  };
  
  const result = await converter.convert(testHtml, {
    inputType: 'html'
  });
  
  console.log('\n=== Final Result ===');
  console.log(result.content);
}

testWithoutCleanup();
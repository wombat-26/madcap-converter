import { AsciiDocConverter } from './build/converters/asciidoc-converter.js';

// Create a simple test case that mimics what happens after MadCap preprocessing
const testHtml = `
<!DOCTYPE html>
<html>
<body>
<p>For instructions, see <a href="#Configur">Configuring Planned Impact</a>.</p>
</body>
</html>`;

async function debugAnchorLink() {
  console.log('=== Test HTML ===');
  console.log(testHtml);
  
  const converter = new AsciiDocConverter();
  
  // Add some temporary logging to understand what's happening
  const originalConvert = converter.convert.bind(converter);
  converter.convert = async function(content, options) {
    console.log('\n=== Inside convert method ===');
    console.log('Input content type:', typeof content);
    console.log('Options:', options);
    
    const result = await originalConvert(content, options);
    
    console.log('\n=== Convert result ===');
    console.log(result.content);
    
    return result;
  };
  
  const result = await converter.convert(testHtml, {
    inputType: 'html'
  });
  
  // Check specific parts of the output
  console.log('\n=== Analysis ===');
  const lines = result.content.split('\n');
  const problemLine = lines.find(line => line.includes('see >'));
  if (problemLine) {
    console.log('Problem line found:', problemLine);
  }
  
  // Let's also test the anchor syntax directly
  const anchorTest = `<<Configur,Configuring Planned Impact>>`;
  console.log('\n=== Expected anchor syntax ===');
  console.log(anchorTest);
}

debugAnchorLink();
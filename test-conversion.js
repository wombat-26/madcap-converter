import { promises as fs } from 'fs';
import { MadCapConverter } from './src/core/converters/madcap-converter.js';

async function testConversion() {
  try {
    // Read the sample HTM file
    const inputPath = '/Volumes/Envoy Pro/Flare/Media Pool_7.5_EN/Content/Administration/01 Objekt-Tasks/01 Assets/Assettyp bearbeiten Admin.htm';
    const content = await fs.readFile(inputPath, 'utf-8');
    
    // Create converter
    const converter = new MadCapConverter();
    
    // Convert to AsciiDoc
    const result = await converter.convert(content, {
      format: 'asciidoc',
      inputPath: inputPath,
      inputType: 'html'
    });
    
    // Write output
    const outputPath = './test-output.adoc';
    await fs.writeFile(outputPath, result.content);
    
    console.log('Conversion successful!');
    console.log(`Output written to: ${outputPath}`);
    console.log(`Word count: ${result.metadata?.wordCount}`);
    if (result.metadata?.warnings?.length) {
      console.log('Warnings:', result.metadata.warnings);
    }
    
    // Show a preview of the output
    console.log('\n--- Preview of output ---');
    console.log(result.content.substring(0, 1000));
    
  } catch (error) {
    console.error('Conversion failed:', error);
  }
}

testConversion();
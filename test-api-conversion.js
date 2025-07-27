import { promises as fs } from 'fs';

async function testConversion() {
  try {
    // Read the sample HTM file
    const inputPath = '/Volumes/Envoy Pro/Flare/Media Pool_7.5_EN/Content/Administration/01 Objekt-Tasks/01 Assets/Assettyp bearbeiten Admin.htm';
    const content = await fs.readFile(inputPath, 'utf-8');
    
    // First start the dev server
    console.log('Starting dev server...');
    console.log('Please run "npm run dev" in another terminal, then press Enter to continue...');
    
    // Wait for user to start server
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
    
    // Call the API endpoint
    const response = await fetch('http://localhost:3000/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: content,
        format: 'asciidoc',
        inputType: 'html'
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
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
  
  process.exit(0);
}

testConversion();
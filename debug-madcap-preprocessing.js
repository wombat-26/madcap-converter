import { MadCapPreprocessor } from './build/services/madcap-preprocessor.js';
import { readFile } from 'fs/promises';

async function debugPreprocessing() {
  const processor = new MadCapPreprocessor();
  
  // Read the problematic file
  const html = await readFile('/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm', 'utf8');
  
  console.log('=== ORIGINAL HTML (first 200 lines) ===');
  console.log(html.split('\n').slice(0, 200).join('\n'));
  
  // Process the HTML
  const processedHtml = await processor.preprocessMadCapContent(html, '', 'asciidoc');
  
  console.log('\n\n=== PROCESSED HTML (first 200 lines) ===');
  console.log(processedHtml.split('\n').slice(0, 200).join('\n'));
  
  // Look specifically for the problematic list structure
  console.log('\n\n=== LOOKING FOR LIST PATTERNS ===');
  const lines = processedHtml.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('lower-alpha') || line.includes('On the') || line.includes('<ol') || line.includes('<li')) {
      console.log(`${i + 1}: ${line.trim()}`);
    }
  }
}

debugPreprocessing().catch(console.error);
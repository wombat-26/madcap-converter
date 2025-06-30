import { DocumentService } from './build/document-service.js';

async function checkFinalOutput() {
  const service = new DocumentService();
  const htmlFile = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  
  const result = await service.convertFile(htmlFile, {
    format: 'asciidoc',
    preserveFormatting: false,
    extractVariables: true
  });
  
  // Show lines 35-50 which should contain the complete snippet content
  const lines = result.content.split('\n');
  console.log('Lines 35-50 of converted content:');
  for (let i = 34; i < Math.min(50, lines.length); i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}

checkFinalOutput();
import { BatchService } from './build/batch-service.js';
import { DocumentService } from './build/document-service.js';

async function debugBatchDirect() {
  try {
    console.log('=== Testing BatchService.convertFolder directly ===');
    
    const documentService = new DocumentService();
    const batchService = new BatchService(documentService);
    
    const options = {
      format: 'writerside-markdown',
      inputType: 'madcap',
      recursive: false,
      preserveStructure: true,
      copyImages: true,
      renameFiles: false,
      variableOptions: {
        variableMode: 'reference',
        variableFormat: 'writerside',
        extractVariables: true,
        autoDiscoverFLVAR: true
      }
    };
    
    console.log('Calling BatchService.convertFolder...');
    const result = await batchService.convertFolder(
      '/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell',
      '/tmp/test-batch-direct',
      options
    );
    
    console.log('Conversion result:', result);
    
    // Check for v.list file
    const { readdir } = await import('fs/promises');
    try {
      const files = await readdir('/tmp/test-batch-direct');
      console.log('Output files:', files);
      
      const hasVList = files.includes('v.list');
      console.log(`v.list file present: ${hasVList}`);
      
      if (hasVList) {
        const { readFile } = await import('fs/promises');
        const vListContent = await readFile('/tmp/test-batch-direct/v.list', 'utf8');
        console.log('v.list content length:', vListContent.length);
        console.log('First 200 chars:', vListContent.substring(0, 200));
      }
    } catch (error) {
      console.error('Error reading output directory:', error);
    }
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugBatchDirect();
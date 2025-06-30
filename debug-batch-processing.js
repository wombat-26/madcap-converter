const { BatchService } = await import('./build/batch-service.js');
const path = await import('path');

const batchService = new BatchService();

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const TEST_OUTPUT_PATH = '/tmp/writerside-conversion-tests';

console.log('=== Testing Batch Processing ===');

const sourceDir = path.join(FLARE_SOURCE_PATH, 'Content/02 Planung');
const outputDir = path.join(TEST_OUTPUT_PATH, 'batch-planning');

console.log('Source directory:', sourceDir);
console.log('Output directory:', outputDir);

try {
  const result = await batchService.convertFolder(sourceDir, outputDir, {
    format: 'writerside-markdown',
    inputType: 'html',
    preserveStructure: true,
    copyImages: true,
    includePatterns: ['*.htm'],
    variableOptions: {
      autoDiscoverFLVAR: true,
      variableMode: 'reference'
    }
  });

  console.log('\n=== Batch Result ===');
  console.log('Total files:', result.totalFiles);
  console.log('Converted files:', result.convertedFiles);
  console.log('Skipped files:', result.skippedFiles);
  console.log('Errors:', result.errors.length);
  
  if (result.errors.length > 0) {
    console.log('\n=== Errors ===');
    result.errors.forEach((error, i) => {
      console.log(`${i + 1}. ${error.file}: ${error.error}`);
    });
  }
} catch (error) {
  console.error('Batch processing failed:', error.message);
  console.error('Stack:', error.stack);
}
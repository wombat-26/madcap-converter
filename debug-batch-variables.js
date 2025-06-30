import { VariableExtractor } from './build/services/variable-extractor.js';

async function debugBatchVariables() {
  try {
    console.log('=== Testing VariableExtractor ===');
    
    const extractor = new VariableExtractor();
    console.log('VariableExtractor created');
    
    // Test extraction from project
    const inputDir = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell';
    console.log(`Extracting variables from: ${inputDir}`);
    
    await extractor.extractAllVariablesFromProject(inputDir);
    console.log('Variables extracted from project');
    
    // Test generating variables file
    const options = {
      variableMode: 'reference',
      variableFormat: 'writerside',
      extractVariables: true,
      autoDiscoverFLVAR: true
    };
    
    console.log('Generating variables file with options:', options);
    const variablesFile = extractor.generateVariablesFile(options);
    
    if (variablesFile) {
      console.log('✅ Variables file generated:');
      console.log(variablesFile);
    } else {
      console.log('❌ No variables file generated');
    }
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugBatchVariables();
import { VariableExtractor } from './build/services/variable-extractor.js';

async function debugBatchVariables() {
  try {
    console.log('=== Testing VariableExtractor with correct project root ===');
    
    const extractor = new VariableExtractor();
    console.log('VariableExtractor created');
    
    // Use the actual project root instead of the Content subdirectory
    const projectRoot = '/Volumes/Envoy Pro/Flare/Plan_EN';
    console.log(`Extracting variables from project root: ${projectRoot}`);
    
    await extractor.extractAllVariablesFromProject(projectRoot);
    console.log('Variables extracted from project');
    
    // Check how many variables were extracted
    const variables = extractor.getVariables();
    console.log(`Found ${variables.length} variables:`);
    variables.forEach(v => {
      console.log(`  - ${v.name}: "${v.value}"`);
    });
    
    // Test generating variables file
    const options = {
      variableMode: 'reference',
      variableFormat: 'writerside',
      extractVariables: true,
      autoDiscoverFLVAR: true
    };
    
    console.log('\nGenerating variables file with options:', options);
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
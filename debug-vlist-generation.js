import { JSDOM } from 'jsdom';
import { readFile } from 'fs/promises';

// Simulate the batch service logic step by step
async function debugVListGeneration() {
  try {
    console.log('=== Simulating batch service v.list generation ===');
    
    // Step 1: Create variable extractor
    const { VariableExtractor } = await import('./build/services/variable-extractor.js');
    const batchVariableExtractor = new VariableExtractor();
    console.log('✅ VariableExtractor created');
    
    // Step 2: Extract variables from project
    const inputDir = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell';
    
    // Simulate findProjectRoot logic
    const pathParts = inputDir.split('/');
    const contentIndex = pathParts.findIndex(part => part === 'Content');
    const projectRoot = contentIndex > 0 ? pathParts.slice(0, contentIndex).join('/') : inputDir;
    
    console.log(`Input dir: ${inputDir}`);
    console.log(`Project root: ${projectRoot}`);
    
    await batchVariableExtractor.extractAllVariablesFromProject(projectRoot);
    const extractedVariables = batchVariableExtractor.getVariables();
    console.log(`✅ Extracted ${extractedVariables.length} variables`);
    
    // Step 3: Check conditions for v.list generation
    const options = {
      format: 'writerside-markdown',
      variableOptions: {
        variableMode: 'reference',
        variableFormat: 'writerside',
        extractVariables: true,
        autoDiscoverFLVAR: true
      }
    };
    
    const variablesFileWritten = false;
    
    console.log('\\n=== Checking v.list generation conditions ===');
    console.log(`batchVariableExtractor exists: ${!!batchVariableExtractor}`);
    console.log(`extractVariables: ${options.variableOptions?.extractVariables}`);
    console.log(`variablesFileWritten: ${variablesFileWritten}`);
    console.log(`!variablesFileWritten: ${!variablesFileWritten}`);
    
    if (batchVariableExtractor && options.variableOptions?.extractVariables && !variablesFileWritten) {
      console.log('✅ All conditions met, generating variables file...');
      
      const variablesFile = batchVariableExtractor.generateVariablesFile(options.variableOptions);
      console.log(`variablesFile generated: ${!!variablesFile}`);
      
      if (variablesFile) {
        console.log(`variablesFile length: ${variablesFile.length} characters`);
        
        // Check path logic
        if (options.format === 'writerside-markdown' && options.variableOptions.variableFormat === 'writerside') {
          console.log('✅ Writerside format detected, would save to v.list');
          console.log('First 200 chars of variables file:');
          console.log(variablesFile.substring(0, 200));
        } else {
          console.log('❌ Format conditions not met');
          console.log(`format: ${options.format}`);
          console.log(`variableFormat: ${options.variableOptions.variableFormat}`);
        }
      } else {
        console.log('❌ variablesFile is empty/null');
      }
    } else {
      console.log('❌ Conditions not met for v.list generation');
    }
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugVListGeneration();
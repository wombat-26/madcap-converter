import { VariableExtractor } from './build/services/variable-extractor.js';

async function debugExactBatchSteps() {
  try {
    console.log('=== Replicating EXACT BatchService variable extraction ===');
    
    // Step 1: Replicate findProjectRoot logic exactly
    const inputDir = '/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell';
    const pathParts = inputDir.split('/');
    const contentIndex = pathParts.findIndex(part => part === 'Content');
    const projectRoot = contentIndex > 0 ? pathParts.slice(0, contentIndex).join('/') : inputDir;
    
    console.log('inputDir:', inputDir);
    console.log('pathParts:', pathParts);
    console.log('contentIndex:', contentIndex);
    console.log('projectRoot:', projectRoot);
    
    // Step 2: Create VariableExtractor exactly like BatchService
    const extractVariables = true;
    const batchVariableExtractor = extractVariables ? new VariableExtractor() : null;
    console.log('batchVariableExtractor created:', !!batchVariableExtractor);
    
    if (batchVariableExtractor) {
      // Step 3: Extract variables exactly like BatchService
      console.log('Calling extractAllVariablesFromProject with:', projectRoot);
      await batchVariableExtractor.extractAllVariablesFromProject(projectRoot);
      
      const extractedVariables = batchVariableExtractor.getVariables();
      console.log('Extracted variables count:', extractedVariables.length);
      
      if (extractedVariables.length > 0) {
        console.log('Sample variables:');
        extractedVariables.slice(0, 3).forEach(v => {
          console.log(`  - ${v.name}: "${v.value}"`);
        });
      } else {
        console.log('❌ NO VARIABLES EXTRACTED - investigating...');
        
        // Debug the VariableExtractor's findFlvarFiles method
        console.log('\\n=== Debugging FLVAR file discovery ===');
        
        const searchDirectories = [
          projectRoot + '/Project/VariableSets',
          projectRoot + '/Content/Resources/Variables',
          projectRoot + '/Content/Variables',
          projectRoot + '/Variables',
          projectRoot + '/VariableSets',
          projectRoot // Also search the root directory
        ];
        
        console.log('Search directories:');
        searchDirectories.forEach(dir => console.log(`  - ${dir}`));
        
        for (const searchDir of searchDirectories) {
          try {
            const { readdir } = await import('fs/promises');
            const files = await readdir(searchDir);
            const flvarFiles = files.filter(file => file.endsWith('.flvar') && !file.startsWith('._'));
            console.log(`${searchDir}: ${flvarFiles.length} FLVAR files found:`, flvarFiles);
            
            if (flvarFiles.length > 0) {
              console.log('✅ FOUND FLVAR FILES - testing parsing...');
              
              for (const flvarFile of flvarFiles.slice(0, 1)) { // Test first file
                const flvarPath = searchDir + '/' + flvarFile;
                console.log(`Testing FLVAR file: ${flvarPath}`);
                
                try {
                  const { readFile } = await import('fs/promises');
                  const content = await readFile(flvarPath, 'utf8');
                  console.log(`FLVAR content length: ${content.length}`);
                  console.log(`First 200 chars: ${content.substring(0, 200)}`);
                  
                  // Test manual parsing
                  const { JSDOM } = await import('jsdom');
                  const dom = new JSDOM(content, { contentType: 'text/xml' });
                  const document = dom.window.document;
                  
                  const variableElements = document.querySelectorAll('Variable');
                  console.log(`Variables found in ${flvarFile}: ${variableElements.length}`);
                  
                  if (variableElements.length > 0) {
                    console.log('Sample variable element:', variableElements[0].outerHTML);
                  }
                  
                } catch (parseError) {
                  console.error(`Error parsing ${flvarFile}:`, parseError.message);
                }
              }
            }
            
          } catch (error) {
            console.log(`${searchDir}: Directory not accessible`);
          }
        }
      }
      
      // Step 4: Test generateVariablesFile exactly like BatchService
      const options = {
        variableMode: 'reference',
        variableFormat: 'writerside',
        extractVariables: true,
        autoDiscoverFLVAR: true
      };
      
      console.log('\\n=== Testing generateVariablesFile ===');
      const variablesFile = batchVariableExtractor.generateVariablesFile(options);
      console.log('generateVariablesFile result:', !!variablesFile, 'length:', variablesFile?.length || 0);
      
      if (variablesFile) {
        console.log('First 200 chars:', variablesFile.substring(0, 200));
      }
    }
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugExactBatchSteps();
import { FLVARParser } from './src/core/services/flvar-parser.js';
import { readFileSync } from 'fs';

async function testFlvarParsing() {
  console.log('🔍 Testing FLVAR parsing...');
  
  try {
    const parser = new FLVARParser();
    
    // Test parsing the FLVAR file directly
    const flvarPath = './test-batch/MyVariables.flvar';
    console.log('📄 Reading FLVAR file:', flvarPath);
    
    const content = readFileSync(flvarPath, 'utf8');
    console.log('📄 FLVAR content:');
    console.log(content);
    console.log('📄 End FLVAR content\n');
    
    // Parse the file
    console.log('🔧 Parsing FLVAR file...');
    const variableSet = await parser.parseFile(flvarPath);
    
    console.log('✅ Parsing result:');
    console.log('  - Name:', variableSet.name);
    console.log('  - Variables count:', variableSet.variables.length);
    console.log('  - File path:', variableSet.filePath);
    
    if (variableSet.variables.length > 0) {
      console.log('📝 Variables found:');
      variableSet.variables.forEach((variable, index) => {
        console.log(`  ${index + 1}. ${variable.name} = "${variable.value}"`);
      });
    } else {
      console.log('❌ No variables found!');
    }
    
    // Test the merge functionality
    const merged = parser.mergeVariableSets([variableSet]);
    console.log('🔄 Merged variables count:', merged.length);
    
  } catch (error) {
    console.error('❌ Error during parsing:', error);
  }
}

testFlvarParsing();
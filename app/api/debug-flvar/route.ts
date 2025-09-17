import { NextResponse } from 'next/server';
import { FLVARParser } from '../../../src/core/services/flvar-parser';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    console.log('🔍 Testing FLVAR parsing...');
    
    const parser = new FLVARParser();
    
    // Test parsing the FLVAR file directly
    const flvarPath = join(process.cwd(), 'test-batch/MyVariables.flvar');
    console.log('📄 Reading FLVAR file:', flvarPath);
    
    const content = await readFile(flvarPath, 'utf8');
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
    
    const result: {
      success: boolean;
      flvarPath: string;
      content: string;
      variableSetName: string;
      variablesCount: number;
      variables: { name: string; value: string; definition: string | undefined; }[];
      mergedCount?: number;
    } = {
      success: true,
      flvarPath,
      content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
      variableSetName: variableSet.name,
      variablesCount: variableSet.variables.length,
      variables: variableSet.variables.map(v => ({
        name: v.name,
        value: v.value,
        definition: v.definition
      }))
    };
    
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
    result.mergedCount = merged.length;
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ Error during parsing:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}
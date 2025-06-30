import { spawn } from 'child_process';

function testVariableNamingFix() {
  console.log('Testing variable naming fix...\n');
  
  const testCase = { convention: 'camelCase', expected: 'companyName' };
  
  console.log(`Testing ${testCase.convention} convention...`);
  
  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "convert_folder",
      arguments: {
        inputDir: "/Volumes/Envoy Pro/Flare/Plan_EN/Content",
        outputDir: `/tmp/test-variables-fix-${testCase.convention}`,
        format: "writerside-markdown",
        recursive: false,
        preserveStructure: true,
        copyImages: false,
        useTOCStructure: false,
        variableOptions: {
          extractVariables: true,
          variableFormat: "writerside",
          nameConvention: testCase.convention,
          variableMode: "reference",
          autoDiscoverFLVAR: true,
          skipFileGeneration: false
        }
      }
    }
  };
  
  const mcpProcess = spawn('node', ['build/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  mcpProcess.stdin.write(JSON.stringify(request) + '\n');
  mcpProcess.stdin.end();
  
  let output = '';
  mcpProcess.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  mcpProcess.stderr.on('data', (data) => {
    console.error(`stderr:`, data.toString());
  });
  
  mcpProcess.on('close', (code) => {
    console.log(`\nMCP Process Result:`);
    console.log('='.repeat(50));
    console.log(output);
    console.log('='.repeat(50));
    
    // Now check the generated v.list file
    import('fs').then(fs => {
      const vlistPath = `/tmp/test-variables-fix-${testCase.convention}/v.list`;
      fs.readFile(vlistPath, 'utf8', (err, data) => {
        if (err) {
          console.log(`❌ Could not read v.list: ${err.message}`);
        } else {
          console.log(`\nVariables file content (${testCase.convention}):`);
          console.log('v.list content:');
          console.log(data);
          
          // Check if expected variable name is present
          if (data.includes(testCase.expected)) {
            console.log(`✅ Found expected variable name: ${testCase.expected}`);
            console.log('🎉 FIX SUCCESSFUL! Variable naming convention is now working!');
          } else {
            console.log(`❌ Expected variable name "${testCase.expected}" not found`);
            console.log('Available variable names:');
            const matches = data.match(/name="([^"]+)"/g);
            if (matches) {
              matches.forEach(match => console.log(`  - ${match}`));
            }
          }
        }
      });
    });
  });
}

testVariableNamingFix();
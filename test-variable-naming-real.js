import { spawn } from 'child_process';

function testVariableNaming() {
  console.log('Testing variable naming conventions with real MadCap project...\n');
  
  const testCases = [
    { convention: 'original', expected: 'CompanyName' },
    { convention: 'camelCase', expected: 'companyName' },
    { convention: 'snake_case', expected: 'company_name' },
    { convention: 'kebab-case', expected: 'company-name' }
  ];
  
  testCases.forEach(async (testCase, index) => {
    setTimeout(async () => {
      console.log(`Testing ${testCase.convention} convention...`);
      
      const request = {
        jsonrpc: "2.0",
        id: index + 1,
        method: "tools/call",
        params: {
          name: "convert_folder",
          arguments: {
            inputDir: "/Volumes/Envoy Pro/Flare/Plan_EN/Content",
            outputDir: `/tmp/test-variables-${testCase.convention}`,
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
      
      console.log(`Request for ${testCase.convention}:`, JSON.stringify(request, null, 2));
      
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
        console.error(`stderr for ${testCase.convention}:`, data.toString());
      });
      
      mcpProcess.on('close', (code) => {
        console.log(`\nResult for ${testCase.convention}:`);
        console.log('='.repeat(50));
        console.log(output);
        console.log('='.repeat(50));
        console.log('');
        
        // Now check the generated v.list file
        import('fs').then(fs => {
          const vlistPath = `/tmp/test-variables-${testCase.convention}/v.list`;
          fs.readFile(vlistPath, 'utf8', (err, data) => {
            if (err) {
              console.log(`❌ Could not read v.list for ${testCase.convention}: ${err.message}`);
            } else {
              console.log(`Variables file content for ${testCase.convention}:`);
              console.log('v.list content:');
              console.log(data);
              
              // Check if expected variable name is present
              if (data.includes(testCase.expected)) {
                console.log(`✅ Found expected variable name: ${testCase.expected}`);
              } else {
                console.log(`❌ Expected variable name "${testCase.expected}" not found`);
                console.log('Available variable names:');
                const matches = data.match(/name="([^"]+)"/g);
                if (matches) {
                  matches.forEach(match => console.log(`  - ${match}`));
                }
              }
              console.log('');
            }
          });
        });
      });
      
    }, index * 5000); // Stagger requests by 5 seconds
  });
}

testVariableNaming();
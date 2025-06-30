import { DocumentService } from './build/document-service.js';

const service = new DocumentService();

// Test HTML content with MadCap variables
const testHtml = `
<html>
<head><title>Test Variables</title></head>
<body>
<h1>Company Information</h1>
<p>Welcome to <var data-mc-variable="General.Company Name" class="mc-variable mc-variable__General.Company-Name">Uptempo GmbH</var></p>
<p>Our phone number is <var data-mc-variable="General.Phone Number" class="mc-variable mc-variable__General.Phone-Number">+49 721 97791-000</var></p>
<p>Our email is <var data-mc-variable="General.Contact Email" class="mc-variable mc-variable__General.Contact-Email">info@uptempo.io</var></p>
</body>
</html>
`;

async function testVariableNaming() {
  console.log('Testing variable naming conventions...\n');
  
  const testCases = [
    { convention: 'original', expected: 'Company Name' },
    { convention: 'camelCase', expected: 'companyName' },
    { convention: 'snake_case', expected: 'company_name' },
    { convention: 'kebab-case', expected: 'company-name' }
  ];
  
  for (const testCase of testCases) {
    try {
      console.log(`Testing ${testCase.convention} convention...`);
      
      const options = {
        inputType: 'html',
        format: 'writerside-markdown',
        preserveFormatting: true,
        variableOptions: {
          extractVariables: true,
          variableFormat: 'writerside',
          nameConvention: testCase.convention,
          variableMode: 'reference',
          autoDiscoverFLVAR: false,
          skipFileGeneration: false
        }
      };
      
      const result = await service.convertString(testHtml, options);
      
      console.log(`Variables file content for ${testCase.convention}:`);
      console.log('='.repeat(50));
      if (result.variablesFile) {
        console.log(result.variablesFile);
        
        // Check if expected variable name is present
        if (result.variablesFile.includes(testCase.expected)) {
          console.log(`✅ Found expected variable name: ${testCase.expected}`);
        } else {
          console.log(`❌ Expected variable name "${testCase.expected}" not found`);
        }
      } else {
        console.log('❌ No variables file generated');
      }
      console.log('='.repeat(50));
      console.log('');
      
    } catch (error) {
      console.error(`❌ Error testing ${testCase.convention}:`, error.message);
    }
  }
}

testVariableNaming();
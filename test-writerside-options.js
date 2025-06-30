const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

const converter = new WritersideMarkdownConverter();

console.log('=== WRITERSIDE PROJECT OPTIONS TEST PLAN ===\n');

// Test cases for each option
const testCases = {
  semanticMarkup: {
    name: 'Enable Semantic Markup',
    description: 'Use Writerside semantic elements for enhanced content',
    testHtml: `
      <div class="mc-note">
        <p><strong>Note:</strong> This is important information.</p>
      </div>
      <div class="mc-procedure">
        <ol>
          <li>First step</li>
          <li>Second step</li>
        </ol>
      </div>
    `,
    expectedWithOption: 'Should use Writerside semantic elements',
    expectedWithoutOption: 'Should use basic markdown'
  },

  procedureBlocks: {
    name: 'Enable Procedure Blocks', 
    description: 'Convert step-by-step content to procedure blocks',
    testHtml: `
      <div class="mc-procedure">
        <h3>Installation Steps</h3>
        <ol>
          <li>Download the installer</li>
          <li>Run the setup wizard</li>
          <li>Complete the configuration</li>
        </ol>
      </div>
    `,
    expectedWithOption: 'Should use Writerside procedure syntax',
    expectedWithoutOption: 'Should use regular ordered list'
  },

  collapsibleBlocks: {
    name: 'Enable Collapsible Blocks',
    description: 'Convert expandable content to collapsible blocks', 
    testHtml: `
      <div class="mc-dropdown">
        <button class="mc-dropdown-head">Click to expand</button>
        <div class="mc-dropdown-body">
          <p>Hidden content that can be expanded</p>
        </div>
      </div>
    `,
    expectedWithOption: 'Should use Writerside collapsible syntax',
    expectedWithoutOption: 'Should use regular content'
  },

  tabGroups: {
    name: 'Enable Tab Groups',
    description: 'Convert tabbed content to Writerside tab groups',
    testHtml: `
      <div class="mc-tabs">
        <div class="mc-tab-head">
          <button class="mc-tab">Windows</button>
          <button class="mc-tab">macOS</button>
        </div>
        <div class="mc-tab-body">
          <div class="mc-tab-content">Windows instructions</div>
          <div class="mc-tab-content">macOS instructions</div>
        </div>
      </div>
    `,
    expectedWithOption: 'Should use Writerside tab syntax',
    expectedWithoutOption: 'Should use regular content'
  },

  mergeSnippets: {
    name: 'Merge Snippets',
    description: 'Convert MadCap snippets to Writerside includes',
    testHtml: `
      <div data-mc-snippet="common-warning.flsnp">
        <p>This content comes from a snippet file</p>
      </div>
    `,
    expectedWithOption: 'Should convert to include directive',
    expectedWithoutOption: 'Should merge content inline'
  }
};

// Function to test an option
async function testOption(optionName, testCase, enabled) {
  console.log(`\n--- Testing: ${testCase.name} (${enabled ? 'ENABLED' : 'DISABLED'}) ---`);
  console.log(`Description: ${testCase.description}`);
  console.log(`Expected: ${enabled ? testCase.expectedWithOption : testCase.expectedWithoutOption}`);
  
  const options = {
    format: 'writerside-markdown',
    inputType: 'html',
    writersideOptions: {
      enableSemanticMarkup: optionName === 'semanticMarkup' ? enabled : false,
      enableProcedureBlocks: optionName === 'procedureBlocks' ? enabled : false,
      enableCollapsibleBlocks: optionName === 'collapsibleBlocks' ? enabled : false,
      enableTabs: optionName === 'tabGroups' ? enabled : false,
      mergeSnippets: optionName === 'mergeSnippets' ? enabled : true // Note: this is inverted logic
    }
  };

  try {
    const result = await converter.convert(testCase.testHtml, options);
    console.log(`Input HTML:`, testCase.testHtml.trim());
    console.log(`Output:`, result.content.trim());
    
    // Check if output changes based on option
    return result.content.trim();
  } catch (error) {
    console.log(`ERROR: ${error.message}`);
    return null;
  }
}

// Run all tests
async function runAllTests() {
  const results = {};
  
  for (const [optionName, testCase] of Object.entries(testCases)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TESTING OPTION: ${testCase.name.toUpperCase()}`);
    console.log(`${'='.repeat(60)}`);
    
    // Test with option enabled
    const enabledResult = await testOption(optionName, testCase, true);
    
    // Test with option disabled  
    const disabledResult = await testOption(optionName, testCase, false);
    
    // Compare results
    const hasEffect = enabledResult !== disabledResult;
    console.log(`\n--- RESULT COMPARISON ---`);
    console.log(`Option has effect: ${hasEffect ? '✅ YES' : '❌ NO'}`);
    
    if (!hasEffect && enabledResult) {
      console.log(`⚠️  Both enabled/disabled produce same output:`);
      console.log(`   ${enabledResult}`);
    }
    
    results[optionName] = {
      name: testCase.name,
      hasEffect,
      enabledResult,
      disabledResult
    };
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY OF WRITERSIDE OPTIONS EFFECTIVENESS');
  console.log(`${'='.repeat(60)}`);
  
  const workingOptions = [];
  const brokenOptions = [];
  
  for (const [optionName, result] of Object.entries(results)) {
    const status = result.hasEffect ? '✅ WORKING' : '❌ NO EFFECT';
    console.log(`${result.name.padEnd(30)} ${status}`);
    
    if (result.hasEffect) {
      workingOptions.push(result.name);
    } else {
      brokenOptions.push(result.name);
    }
  }
  
  console.log(`\nWorking options (${workingOptions.length}): ${workingOptions.join(', ') || 'None'}`);
  console.log(`Broken options (${brokenOptions.length}): ${brokenOptions.join(', ') || 'None'}`);
  
  if (brokenOptions.length > 0) {
    console.log(`\n⚠️  ISSUES FOUND: ${brokenOptions.length} options have no effect`);
    console.log(`These options need to be implemented or fixed in the converter.`);
  } else {
    console.log(`\n✅ All Writerside options are working correctly!`);
  }
}

// Run the test plan
runAllTests().catch(console.error);
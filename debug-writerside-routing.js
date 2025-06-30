#!/usr/bin/env node

// Debug script to test the routing logic for WritersideBatchService

const testOptions = {
  format: 'writerside-markdown',
  writersideOptions: {
    createProject: true,
    projectName: 'Test Project',
    generateInstances: true,
    instanceMapping: {},
    enableProcedureBlocks: true,
    enableCollapsibleBlocks: true,
    enableTabs: true,
    enableSummaryCards: true,
    enableSemanticMarkup: true,
    generateTOC: true,
    organizeByTOC: true,
    preserveTopicHierarchy: true,
    convertVariables: true,
    convertConditions: true,
    mergeSnippets: true,
    buildConfig: {
      primaryColor: 'blue',
      headerLogo: '',
      favicon: '',
      webRoot: '',
      enableSearch: true,
      enableSitemap: true,
      enableAnalytics: false
    },
    generateStarterContent: true,
    optimizeForMobile: true,
    includeMetadata: true
  }
};

console.log('=== DEBUGGING WRITERSIDE ROUTING ===');
console.log('');

// Test the condition from batch-service.ts
const shouldUseWritersideService = testOptions.format === 'writerside-markdown' && testOptions.writersideOptions?.createProject;

console.log('Test conditions:');
console.log(`options.format: "${testOptions.format}"`);
console.log(`format === 'writerside-markdown': ${testOptions.format === 'writerside-markdown'}`);
console.log(`writersideOptions exists: ${!!testOptions.writersideOptions}`);
console.log(`writersideOptions.createProject: ${testOptions.writersideOptions?.createProject}`);
console.log('');

console.log(`Final condition result: ${shouldUseWritersideService}`);
console.log('');

if (shouldUseWritersideService) {
  console.log('✅ Should use WritersideBatchService');
  console.log('This would call WritersideBatchService.convertToWritersideProject()');
} else {
  console.log('❌ Will use regular BatchService');
  console.log('This explains why only v.list is created (regular batch conversion with variables)');
}

console.log('');
console.log('=== CHECKING ACTUAL UI REQUEST ===');

// This is the actual request from the UI log
const actualUIRequest = {
  "inputDir": "/Volumes/Envoy Pro/Flare/Plan_EN/Content",
  "outputDir": "/Volumes/Envoy Pro/target",
  "format": "writerside-markdown",
  "preserveFormatting": true,
  "extractImages": true,
  "recursive": true,
  "preserveStructure": false,
  "copyImages": true,
  "renameFiles": true,
  "useTOCStructure": true,
  "generateMasterDoc": true,
  "writersideOptions": {
    "createProject": true,
    "projectName": "",
    "generateInstances": true,
    "instanceMapping": {},
    "enableProcedureBlocks": true,
    "enableCollapsibleBlocks": true,
    "enableTabs": true,
    "enableSummaryCards": true,
    "enableSemanticMarkup": true,
    "generateTOC": true,
    "organizeByTOC": true,
    "preserveTopicHierarchy": true,
    "convertVariables": true,
    "convertConditions": true,
    "mergeSnippets": true,
    "buildConfig": {
      "primaryColor": "blue",
      "headerLogo": "",
      "favicon": "",
      "webRoot": "",
      "enableSearch": true,
      "enableSitemap": true,
      "enableAnalytics": false
    },
    "generateStarterContent": true,
    "optimizeForMobile": true,
    "includeMetadata": true
  }
};

const actualConditionResult = actualUIRequest.format === 'writerside-markdown' && actualUIRequest.writersideOptions?.createProject;

console.log('Actual UI request conditions:');
console.log(`format: "${actualUIRequest.format}"`);
console.log(`createProject: ${actualUIRequest.writersideOptions?.createProject}`);
console.log(`Final result: ${actualConditionResult}`);

if (actualConditionResult) {
  console.log('✅ UI request SHOULD trigger WritersideBatchService');
} else {
  console.log('❌ UI request will NOT trigger WritersideBatchService');
}
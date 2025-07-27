# Test Fixtures and Sample Data

This directory contains comprehensive test fixtures and sample data for testing the MadCap Converter's batch conversion functionality and individual conversion scenarios.

## Overview

The test fixtures are organized into several categories:

- **Project Structures**: Complete MadCap project structures for batch testing
- **Conversion Test Cases**: Individual test cases for specific conversion scenarios
- **Test Helpers**: Utility classes and functions for test automation
- **Mock Data Generators**: Tools for creating dynamic test data

## Files

### Core Fixture Files

- `madcap-project-structures.ts` - Complete test projects with realistic MadCap structures
- `conversion-test-cases.ts` - Individual test cases for specific conversion scenarios
- `test-helpers.ts` - Utility classes for test automation and validation
- `index.ts` - Main entry point with convenience functions and exports

### Existing Fixtures

- `html-list-structures.ts` - Existing HTML list test structures (preserved for compatibility)

## Usage Examples

### Basic Usage

```typescript
import {
  createTestEnvironment,
  setupTestProject,
  setupConversionTests,
  getTestDataSet
} from './fixtures/index.js';

// Create a test environment
const { fileSystem, batchRunner, cleanup } = createTestEnvironment();

try {
  // Setup a test project
  const { projectDir, project } = await setupTestProject('complex', fileSystem);
  
  // Run batch conversion tests
  const result = await batchRunner.testBatchProcessing(
    project,
    batchService,
    { format: 'asciidoc', preserveStructure: true }
  );
  
  console.log(`Converted ${result.result.convertedFiles} files`);
} finally {
  await cleanup();
}
```

### Using Individual Test Cases

```typescript
import { getTestCases, BatchTestRunner } from './fixtures/index.js';

const runner = new BatchTestRunner();
const tableTests = getTestCases('tables');

const results = await runner.runConversionTests(
  tableTests,
  converter,
  { parallel: true, timeout: 5000 }
);

// Analyze results
results.forEach(({ testCase, result, error, duration }) => {
  if (error) {
    console.error(`Test "${testCase.name}" failed:`, error);
  } else {
    console.log(`Test "${testCase.name}" passed in ${duration}ms`);
  }
});
```

### Performance Testing

```typescript
import { PerformanceTestRunner, getTestProject } from './fixtures/index.js';

const perfRunner = new PerformanceTestRunner();
const project = getTestProject('performance');

const perfResults = await perfRunner.measureBatchPerformance(
  project,
  batchService,
  { format: 'asciidoc' }
);

console.log(`Processed ${perfResults.filesPerSecond.toFixed(2)} files/second`);
console.log(`Peak memory usage: ${(perfResults.memoryPeak / 1024 / 1024).toFixed(2)} MB`);
```

### Using Pre-configured Test Data Sets

```typescript
import { getTestDataSet } from './fixtures/index.js';

// Get comprehensive test set
const comprehensiveSet = getTestDataSet('comprehensive');

console.log(`Testing ${comprehensiveSet.projects.length} projects`);
console.log(`Running ${comprehensiveSet.testCases.length} test cases`);

// Get format-specific test set
const asciidocSet = getTestDataSet('asciidoc');
// Only includes AsciiDoc-compatible test cases and projects
```

## Available Test Projects

### Simple Project
- **Files**: 2 basic HTML files with overview and getting started content
- **Features**: Basic MadCap elements, notes, tips
- **Use Case**: Quick validation and basic functionality testing

### Complex Project
- **Files**: 5+ files with nested structure, variables, images
- **Features**: Tables, dropdowns, complex lists, admonitions, variables, keyboard elements
- **Use Case**: Comprehensive feature testing and realistic scenarios

### Problematic Project
- **Files**: Mix of valid and problematic files
- **Features**: Empty files, malformed HTML, deprecated content, large files
- **Use Case**: Error handling and resilience testing

### Performance Project
- **Files**: 25 generated files with substantial content
- **Features**: Large documents, tables, lists, admonitions
- **Use Case**: Performance and scalability testing

### Cross-Reference Project
- **Files**: 5 interconnected files with internal links
- **Features**: Cross-references, anchor links, nested folder structure
- **Use Case**: Link resolution and cross-reference testing

## Available Test Case Categories

### Tables
- Simple tables with headers and data
- Complex tables with colspan, rowspan, and formatting
- MadCap-styled tables with CSS classes

### Lists
- Nested ordered lists with alphabetic sub-items
- Mixed list types (ordered/unordered combinations)
- Lists with continuation content and paragraphs

### MadCap Elements
- MadCap dropdowns and expanding sections
- Variable references and substitution
- Conditional content with data-mc-conditions
- Keyboard element formatting

### Admonitions
- Note, warning, tip, and caution admonitions
- Multi-paragraph admonitions
- Nested content within admonitions

### Images
- Block images (standalone paragraphs)
- Inline images (within text)
- Images with size attributes
- UI icons and small images

### Error Handling
- Empty or whitespace-only content
- Malformed HTML structures
- Missing required elements
- Circular references

### Performance
- Large documents with substantial content
- Deeply nested HTML structures
- High-volume conversion scenarios

## Test Data Sets

Pre-configured combinations of projects and test cases for specific scenarios:

- **minimal**: Quick validation with basic features
- **comprehensive**: Full feature coverage testing
- **errorHandling**: Error resilience and edge case testing
- **performance**: Scalability and performance testing
- **asciidoc**: AsciiDoc-specific features and formatting
- **writerside**: Writerside Markdown-specific features
- **zendesk**: Zendesk HTML-specific features

## Utilities and Helpers

### TestFileSystem
- Create temporary directories and files
- Copy and compare directory structures
- Automatic cleanup of test resources

### BatchTestRunner
- Run conversion tests in parallel or sequentially
- Validate batch conversion results
- Test complete batch processing workflows

### PerformanceTestRunner
- Measure conversion performance and memory usage
- Benchmark batch processing speed
- Monitor resource consumption during tests

### MockDataGenerator
- Generate dynamic test projects with specified characteristics
- Create test content with configurable complexity
- Generate realistic MadCap project structures

## Integration with Existing Tests

These fixtures are designed to work with:

- Jest unit tests (`tests/unit/`)
- Playwright E2E tests (`tests/e2e/`)
- Integration tests (`tests/integration/`)

### Example Jest Test

```typescript
import { setupTestProject } from '../fixtures/index.js';

describe('Batch Conversion Integration', () => {
  it('should convert complex project successfully', async () => {
    const { projectDir, project, cleanup } = await setupTestProject('complex');
    
    try {
      const result = await batchService.convertFolder(
        projectDir,
        outputDir,
        { format: 'asciidoc' }
      );
      
      expect(result.convertedFiles).toBe(project.expectedOutputFiles?.length || 0);
      expect(result.errors).toHaveLength(0);
    } finally {
      await cleanup?.();
    }
  });
});
```

### Example Playwright Test

```typescript
import { createTestFiles } from '../fixtures/index.js';

test('should handle file upload', async ({ page }) => {
  const testFiles = [
    { path: 'test.htm', content: '<h1>Test</h1>' }
  ];
  
  const fileList = await createTestFileList(testFiles);
  await uploadFiles(page, fileList);
  
  // Continue with UI testing...
});
```

## Statistics

Current fixture statistics:
- **Projects**: 5 complete test projects
- **Test Cases**: 50+ individual conversion test cases
- **Categories**: 7 test case categories
- **Formats**: Support for AsciiDoc, Writerside Markdown, and Zendesk HTML

## Contributing

When adding new test fixtures:

1. Add new projects to `madcap-project-structures.ts`
2. Add new test cases to `conversion-test-cases.ts`
3. Update the index file exports
4. Add examples to this README
5. Ensure cleanup functions are properly implemented

## Best Practices

1. **Always use cleanup functions** to prevent test pollution
2. **Use realistic content** that matches actual MadCap projects
3. **Include edge cases** and error conditions
4. **Document expected behavior** in test descriptions
5. **Use appropriate file sizes** for performance testing
6. **Validate results thoroughly** using the provided validators
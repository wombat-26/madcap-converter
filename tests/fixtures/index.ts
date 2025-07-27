/**
 * Comprehensive test fixtures and test data for MadCap Converter
 * 
 * This module provides all the test fixtures, sample projects, test cases,
 * and helper utilities needed for comprehensive testing of the batch conversion
 * functionality and individual conversion scenarios.
 */

// Project structures and sample data
export {
  type TestProject,
  type ProjectFile,
  simpleProject,
  complexProject,
  problematicProject,
  performanceProject,
  crossRefProject,
  testProjects,
  getTestProject,
  createProjectFiles
} from './madcap-project-structures.js';

// Conversion test cases
export {
  type ConversionTestCase,
  tableTestCases,
  listTestCases,
  madcapTestCases,
  admonitionTestCases,
  imageTestCases,
  errorTestCases,
  performanceTestCases,
  formatTestCases,
  testCases,
  getTestCases,
  runTestCase
} from './conversion-test-cases.js';

// Test utilities and helpers
export {
  TestFileSystem,
  BatchTestRunner,
  PerformanceTestRunner,
  MockDataGenerator
} from './test-helpers.js';

// Re-export existing HTML list structures for compatibility
export * from './html-list-structures.js';

/**
 * Quick setup functions for common testing scenarios
 */

import { TestFileSystem, BatchTestRunner } from './test-helpers.js';
import { getTestProject } from './madcap-project-structures.js';
import { getTestCases } from './conversion-test-cases.js';

/**
 * Create a test environment with file system and batch runner
 */
export function createTestEnvironment(): {
  fileSystem: TestFileSystem;
  batchRunner: BatchTestRunner;
  cleanup: () => Promise<void>;
} {
  const fileSystem = new TestFileSystem();
  const batchRunner = new BatchTestRunner();
  
  return {
    fileSystem,
    batchRunner,
    cleanup: async () => {
      await fileSystem.cleanup();
      await batchRunner.cleanup();
    }
  };
}

/**
 * Setup a complete test project for batch conversion testing
 */
export async function setupTestProject(
  projectName: 'simple' | 'complex' | 'problematic' | 'performance' | 'crossRef',
  fileSystem?: TestFileSystem
): Promise<{ projectDir: string; project: any; cleanup?: () => Promise<void> }> {
  const fs = fileSystem || new TestFileSystem();
  const project = getTestProject(projectName);
  const projectDir = await fs.createTestProject(project);
  
  return {
    projectDir,
    project,
    cleanup: fileSystem ? undefined : () => fs.cleanup()
  };
}

/**
 * Setup conversion test cases for specific categories
 */
export function setupConversionTests(
  categories: Array<'tables' | 'lists' | 'madcap' | 'admonitions' | 'images' | 'errors' | 'performance' | 'math' | 'citations' | 'performanceOptimization'>,
  format?: 'asciidoc' | 'writerside-markdown' | 'zendesk'
) {
  const allTestCases = categories.flatMap(category => {
    const cases = getTestCases(category);
    return format ? cases.filter(c => !c.format || c.format === format) : cases;
  });
  
  return allTestCases;
}

/**
 * Common test data sets for different scenarios
 */
export const testDataSets = {
  /**
   * Minimal test set for quick validation
   */
  minimal: {
    projects: ['simple'],
    testCases: ['tables', 'lists'],
    description: 'Minimal test set for quick validation'
  },
  
  /**
   * Comprehensive test set for full validation
   */
  comprehensive: {
    projects: ['simple', 'complex', 'crossRef'],
    testCases: ['tables', 'lists', 'madcap', 'admonitions', 'images', 'math', 'citations'],
    description: 'Comprehensive test set covering all major features including specialized handlers'
  },
  
  /**
   * Error handling test set
   */
  errorHandling: {
    projects: ['problematic'],
    testCases: ['errors'],
    description: 'Test set focused on error handling and edge cases'
  },
  
  /**
   * Performance test set
   */
  performance: {
    projects: ['performance'],
    testCases: ['performance', 'performanceOptimization'],
    description: 'Test set for performance and scalability testing'
  },
  
  /**
   * Format-specific test sets
   */
  asciidoc: {
    projects: ['simple', 'complex'],
    testCases: ['tables', 'lists', 'madcap', 'admonitions', 'images', 'math', 'citations'],
    format: 'asciidoc' as const,
    description: 'AsciiDoc-specific test set with specialized handlers'
  },
  
  writerside: {
    projects: ['simple', 'complex'],
    testCases: ['tables', 'lists'],
    format: 'writerside-markdown' as const,
    description: 'Writerside Markdown-specific test set'
  },
  
  zendesk: {
    projects: ['simple'],
    testCases: ['tables', 'madcap'],
    format: 'zendesk' as const,
    description: 'Zendesk HTML-specific test set'
  },
  
  /**
   * Specialized handlers test set
   */
  specializedHandlers: {
    projects: ['complex'],
    testCases: ['math', 'citations', 'performanceOptimization'],
    format: 'asciidoc' as const,
    description: 'Test set for specialized content handlers (math, citations, performance)'
  }
};

/**
 * Helper function to get a complete test data set
 */
export function getTestDataSet(setName: keyof typeof testDataSets) {
  const set = testDataSets[setName];
  
  return {
    ...set,
    projects: set.projects.map(name => getTestProject(name as any)),
    testCases: setupConversionTests(set.testCases as any, set.format)
  };
}

/**
 * Statistics about available test fixtures
 */
export const fixtureStats = {
  projects: {
    total: Object.keys(testProjects).length,
    withImages: Object.values(testProjects).filter(p => p.hasImages).length,
    withVariables: Object.values(testProjects).filter(p => p.hasVariables).length,
    withTOC: Object.values(testProjects).filter(p => p.hasTOC).length
  },
  testCases: {
    total: Object.values(testCases).reduce((sum, cases) => sum + cases.length, 0),
    byCategory: Object.fromEntries(
      Object.entries(testCases).map(([category, cases]) => [category, cases.length])
    ),
    byFormat: {
      asciidoc: Object.values(testCases).flat().filter(c => !c.format || c.format === 'asciidoc').length,
      writerside: Object.values(testCases).flat().filter(c => c.format === 'writerside-markdown').length,
      zendesk: Object.values(testCases).flat().filter(c => c.format === 'zendesk').length
    }
  }
};

/**
 * Validation helpers for test results
 */
export const validators = {
  /**
   * Validate AsciiDoc output structure
   */
  validateAsciiDoc: (content: string): { valid: boolean; issues: string[] } => {
    const issues: string[] = [];
    
    // Check for basic AsciiDoc structure
    if (!content.includes('=')) {
      issues.push('Missing AsciiDoc headers');
    }
    
    // Check for proper admonition syntax
    const admonitionPattern = /\\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\\]/;
    const admonitionBlocks = content.match(/\\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\\][\\s\\S]*?====/g);
    if (content.includes('[NOTE]') && !admonitionPattern.test(content)) {
      issues.push('Malformed admonition syntax');
    }
    
    // Check for proper table syntax
    if (content.includes('|===') && !content.match(/\\|===[\\s\\S]*?\\|===/)) {
      issues.push('Incomplete table syntax');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  },
  
  /**
   * Validate Markdown output structure
   */
  validateMarkdown: (content: string): { valid: boolean; issues: string[] } => {
    const issues: string[] = [];
    
    // Check for proper Markdown headers
    if (!content.match(/^#{1,6}\\s/m)) {
      issues.push('Missing Markdown headers');
    }
    
    // Check for proper table syntax
    if (content.includes('|') && !content.match(/\\|[^\\n]*\\|[\\s\\S]*?\\|[-\\s|]*\\|/)) {
      issues.push('Malformed table syntax');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
};

/**
 * Export everything for easy access
 */
export default {
  projects: testProjects,
  testCases,
  testDataSets,
  fixtureStats,
  validators,
  createTestEnvironment,
  setupTestProject,
  setupConversionTests,
  getTestDataSet
};
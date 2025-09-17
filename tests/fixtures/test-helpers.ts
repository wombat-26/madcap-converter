/**
 * Test helper utilities for working with fixtures and test data
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { TestProject, createProjectFiles } from './madcap-project-structures.js';
import { ConversionTestCase } from './conversion-test-cases.js';

/**
 * File system operations for testing
 */
export class TestFileSystem {
  private baseTempDir: string;
  private createdDirs: string[] = [];

  constructor() {
    this.baseTempDir = join(tmpdir(), `madcap-test-${Date.now()}`);
  }

  /**
   * Create a temporary directory for testing
   */
  async createTempDir(prefix: string = 'test'): Promise<string> {
    const dir = join(this.baseTempDir, `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(dir, { recursive: true });
    this.createdDirs.push(dir);
    return dir;
  }

  /**
   * Create a test project in the filesystem
   */
  async createTestProject(project: TestProject, baseDir?: string): Promise<string> {
    const projectDir = baseDir || await this.createTempDir(project.name.toLowerCase().replace(/\\s+/g, '-'));
    await createProjectFiles(project, projectDir, fs);
    return projectDir;
  }

  /**
   * Create multiple test files
   */
  async createTestFiles(files: Array<{ path: string; content: string; binary?: boolean }>, baseDir?: string): Promise<string> {
    const testDir = baseDir || await this.createTempDir('files');
    
    for (const file of files) {
      const fullPath = join(testDir, file.path);
      const dir = dirname(fullPath);
      
      await fs.mkdir(dir, { recursive: true });
      
      if (file.binary) {
        await fs.writeFile(fullPath, Buffer.from(file.content, 'base64'));
      } else {
        await fs.writeFile(fullPath, file.content, 'utf-8');
      }
    }
    
    return testDir;
  }

  /**
   * Read all files in a directory recursively
   */
  async getAllFiles(dir: string, basePath: string = ''): Promise<string[]> {
    const files: string[] = [];
    
    async function scan(currentDir: string, currentBasePath: string): Promise<void> {
      const entries = await fs.readdir(currentDir);
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        const relativePath = currentBasePath ? join(currentBasePath, entry) : entry;
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          await scan(fullPath, relativePath);
        } else {
          files.push(relativePath);
        }
      }
    }
    
    await scan(dir, basePath);
    return files;
  }

  /**
   * Copy files from source to destination
   */
  async copyFiles(sourceDir: string, destDir: string): Promise<void> {
    const files = await this.getAllFiles(sourceDir);
    
    for (const file of files) {
      const sourcePath = join(sourceDir, file);
      const destPath = join(destDir, file);
      const destDirPath = dirname(destPath);
      
      await fs.mkdir(destDirPath, { recursive: true });
      await fs.copyFile(sourcePath, destPath);
    }
  }

  /**
   * Compare two directory structures
   */
  async compareDirectories(dir1: string, dir2: string): Promise<{ same: boolean; differences: string[] }> {
    const files1 = await this.getAllFiles(dir1);
    const files2 = await this.getAllFiles(dir2);
    
    const differences: string[] = [];
    
    // Check for files in dir1 but not dir2
    for (const file of files1) {
      if (!files2.includes(file)) {
        differences.push(`File missing in second directory: ${file}`);
      }
    }
    
    // Check for files in dir2 but not dir1
    for (const file of files2) {
      if (!files1.includes(file)) {
        differences.push(`Extra file in second directory: ${file}`);
      }
    }
    
    // Check content differences for common files
    const commonFiles = files1.filter(f => files2.includes(f));
    for (const file of commonFiles) {
      const content1 = await fs.readFile(join(dir1, file), 'utf-8');
      const content2 = await fs.readFile(join(dir2, file), 'utf-8');
      
      if (content1 !== content2) {
        differences.push(`Content differs in file: ${file}`);
      }
    }
    
    return {
      same: differences.length === 0,
      differences
    };
  }

  /**
   * Clean up all created temporary directories
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = this.createdDirs.map(async (dir) => {
      try {
        await fs.rm(dir, { recursive: true });
      } catch (error) {
        // Directory might already be removed or not exist
        console.warn(`Failed to cleanup directory ${dir}:`, error);
      }
    });
    
    await Promise.all(cleanupPromises);
    this.createdDirs = [];
  }
}

/**
 * Batch test runner for conversion scenarios
 */
export class BatchTestRunner {
  private fileSystem: TestFileSystem;
  
  constructor() {
    this.fileSystem = new TestFileSystem();
  }

  /**
   * Run a batch of conversion test cases
   */
  async runConversionTests(
    testCases: ConversionTestCase[],
    converter: any,
    options: { timeout?: number; parallel?: boolean } = {}
  ): Promise<Array<{ testCase: ConversionTestCase; result?: any; error?: any; duration: number }>> {
    const results: Array<{ testCase: ConversionTestCase; result?: any; error?: any; duration: number }> = [];
    
    if (options.parallel) {
      const promises = testCases.map(async (testCase) => {
        const startTime = Date.now();
        try {
          const result = await this.runSingleTest(testCase, converter, options.timeout);
          return { testCase, result, duration: Date.now() - startTime };
        } catch (error) {
          return { testCase, error, duration: Date.now() - startTime };
        }
      });
      
      const parallelResults = await Promise.all(promises);
      results.push(...parallelResults);
    } else {
      for (const testCase of testCases) {
        const startTime = Date.now();
        try {
          const result = await this.runSingleTest(testCase, converter, options.timeout);
          results.push({ testCase, result, duration: Date.now() - startTime });
        } catch (error) {
          results.push({ testCase, error, duration: Date.now() - startTime });
        }
      }
    }
    
    return results;
  }

  /**
   * Run a single conversion test
   */
  private async runSingleTest(testCase: ConversionTestCase, converter: any, timeout?: number): Promise<any> {
    const conversionOptions = {
      format: testCase.format || 'asciidoc',
      ...testCase.options
    };
    
    let timeoutId: NodeJS.Timeout | undefined;
    
    const conversionPromise = converter.convertDocument(testCase.input, conversionOptions);
    
    if (timeout) {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Test "${testCase.name}" timed out after ${timeout}ms`));
        }, timeout);
      });
      
      try {
        const result = await Promise.race([conversionPromise, timeoutPromise]);
        if (timeoutId) clearTimeout(timeoutId);
        return result;
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        throw error;
      }
    }
    
    return conversionPromise;
  }

  /**
   * Test batch processing with a project
   */
  async testBatchProcessing(
    project: TestProject,
    batchService: any,
    options: any = {}
  ): Promise<{ inputDir: string; outputDir: string; result: any }> {
    const inputDir = await this.fileSystem.createTestProject(project);
    const outputDir = await this.fileSystem.createTempDir('output');
    
    const result = await batchService.convertFolder(inputDir, outputDir, options);
    
    return { inputDir, outputDir, result };
  }

  /**
   * Validate batch conversion results
   */
  async validateBatchResults(
    project: TestProject,
    outputDir: string,
    expectedFormat: string
  ): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    const outputFiles = await this.fileSystem.getAllFiles(outputDir);
    
    // Check if expected files were created
    if (project.expectedOutputFiles) {
      for (const expectedFile of project.expectedOutputFiles) {
        const expectedOutput = expectedFile.replace(/\\.htm?$/, `.${expectedFormat === 'asciidoc' ? 'adoc' : 'md'}`);
        if (!outputFiles.includes(expectedOutput)) {
          issues.push(`Expected output file missing: ${expectedOutput}`);
        }
      }
    }
    
    // Check for unexpected files
    const validExtensions = expectedFormat === 'asciidoc' ? ['.adoc'] : ['.md'];
    const invalidFiles = outputFiles.filter(file => {
      const hasValidExtension = validExtensions.some(ext => file.endsWith(ext));
      const isExpectedNonContent = file.includes('variables') || file.includes('images/');
      return !hasValidExtension && !isExpectedNonContent;
    });
    
    if (invalidFiles.length > 0) {
      issues.push(`Unexpected files found: ${invalidFiles.join(', ')}`);
    }
    
    // Validate content of converted files
    for (const file of outputFiles) {
      if (validExtensions.some(ext => file.endsWith(ext))) {
        try {
          const content = await fs.readFile(join(outputDir, file), 'utf-8');
          
          if (content.trim().length === 0) {
            issues.push(`Empty converted file: ${file}`);
          }
          
          // Basic format validation
          if (expectedFormat === 'asciidoc') {
            if (!content.startsWith('=') && !content.includes('=')) {
              issues.push(`AsciiDoc file missing proper header: ${file}`);
            }
          } else if (expectedFormat === 'writerside-markdown') {
            if (!content.startsWith('#') && !content.includes('#')) {
              issues.push(`Markdown file missing proper header: ${file}`);
            }
          }
        } catch (error) {
          issues.push(`Failed to read converted file ${file}: ${error}`);
        }
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Clean up test resources
   */
  async cleanup(): Promise<void> {
    await this.fileSystem.cleanup();
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestRunner {
  /**
   * Measure conversion performance
   */
  async measureConversionPerformance(
    testCase: ConversionTestCase,
    converter: any,
    iterations: number = 10
  ): Promise<{
    averageTime: number;
    minTime: number;
    maxTime: number;
    totalTime: number;
    memoryUsage: { initial: NodeJS.MemoryUsage; final: NodeJS.MemoryUsage };
  }> {
    const times: number[] = [];
    const initialMemory = process.memoryUsage();
    
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      await converter.convertDocument(testCase.input, {
        format: testCase.format || 'asciidoc',
        ...testCase.options
      });
      
      const endTime = performance.now();
      times.push(endTime - startTime);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
    
    const finalMemory = process.memoryUsage();
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    
    return {
      averageTime: totalTime / iterations,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      totalTime,
      memoryUsage: { initial: initialMemory, final: finalMemory }
    };
  }

  /**
   * Measure batch processing performance
   */
  async measureBatchPerformance(
    project: TestProject,
    batchService: any,
    options: any = {}
  ): Promise<{
    totalTime: number;
    filesPerSecond: number;
    memoryPeak: number;
    result: any;
  }> {
    const fileSystem = new TestFileSystem();
    
    try {
      const inputDir = await fileSystem.createTestProject(project);
      const outputDir = await fileSystem.createTempDir('perf-output');
      
      const initialMemory = process.memoryUsage();
      let peakMemory = initialMemory.heapUsed;
      
      // Monitor memory usage during conversion
      const memoryMonitor = setInterval(() => {
        const currentMemory = process.memoryUsage().heapUsed;
        peakMemory = Math.max(peakMemory, currentMemory);
      }, 100);
      
      const startTime = performance.now();
      const result = await batchService.convertFolder(inputDir, outputDir, options);
      const endTime = performance.now();
      
      clearInterval(memoryMonitor);
      
      const totalTime = endTime - startTime;
      const filesPerSecond = (result.convertedFiles || 0) / (totalTime / 1000);
      
      return {
        totalTime,
        filesPerSecond,
        memoryPeak: peakMemory - initialMemory.heapUsed,
        result
      };
    } finally {
      await fileSystem.cleanup();
    }
  }
}

/**
 * Mock data generators for testing
 */
export class MockDataGenerator {
  /**
   * Generate mock MadCap project with specified characteristics
   */
  generateMockProject(config: {
    fileCount: number;
    maxDepth: number;
    hasVariables?: boolean;
    hasImages?: boolean;
    hasComplexTables?: boolean;
    hasLargeLists?: boolean;
  }): TestProject {
    const files: Array<{ path: string; content: string; binary?: boolean }> = [];
    
    // Generate content files
    for (let i = 0; i < config.fileCount; i++) {
      const depth = Math.floor(Math.random() * config.maxDepth) + 1;
      const pathSegments = Array.from({ length: depth }, (_, j) => `level${j + 1}`);
      pathSegments.push(`document-${i + 1}.htm`);
      
      const content = this.generateMockHTMLContent({
        title: `Document ${i + 1}`,
        hasTable: config.hasComplexTables && Math.random() > 0.5,
        hasLargeList: config.hasLargeLists && Math.random() > 0.5,
        hasVariable: config.hasVariables && Math.random() > 0.7,
        hasImage: config.hasImages && Math.random() > 0.6
      });
      
      files.push({
        path: `Content/${pathSegments.join('/')}`,
        content
      });
    }
    
    // Add variable file if requested
    if (config.hasVariables) {
      files.push({
        path: 'Project/VariableSets/General.flvar',
        content: this.generateMockVariableFile()
      });
    }
    
    // Add image files if requested
    if (config.hasImages) {
      files.push({
        path: 'Content/Images/sample.png',
        content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        binary: true
      });
    }
    
    return {
      name: 'Generated Mock Project',
      description: `Generated project with ${config.fileCount} files`,
      files,
      hasImages: config.hasImages,
      hasVariables: config.hasVariables
    };
  }

  private generateMockHTMLContent(config: {
    title: string;
    hasTable?: boolean;
    hasLargeList?: boolean;
    hasVariable?: boolean;
    hasImage?: boolean;
  }): string {
    let content = `<html xmlns:MadCap="http://www.madcapsoftware.com/Schemas/MadCap.xsd">
  <head><title>${config.title}</title></head>
  <body>
    <h1>${config.title}</h1>
    <p>This is a generated document for testing purposes.</p>`;

    if (config.hasVariable) {
      content += `\n    <p>Product: <span data-mc-variable="General.ProductName">Test Product</span></p>`;
    }

    if (config.hasImage) {
      content += `\n    <p><img src="../Images/sample.png" alt="Sample Image" /></p>`;
    }

    if (config.hasTable) {
      content += `\n    <table>
      <thead>
        <tr><th>Column 1</th><th>Column 2</th></tr>
      </thead>
      <tbody>
        <tr><td>Data 1</td><td>Data 2</td></tr>
        <tr><td>Data 3</td><td>Data 4</td></tr>
      </tbody>
    </table>`;
    }

    if (config.hasLargeList) {
      content += `\n    <ol>`;
      for (let i = 0; i < 20; i++) {
        content += `\n      <li>List item ${i + 1}</li>`;
      }
      content += `\n    </ol>`;
    }

    content += `\n  </body>
</html>`;

    return content;
  }

  private generateMockVariableFile(): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<CatapultVariableSet Version="1">
  <Variable Name="ProductName">Test Product</Variable>
  <Variable Name="Version">1.0.0</Variable>
  <Variable Name="CompanyName">Test Company</Variable>
</CatapultVariableSet>`;
  }
}

// Export all helper classes and utilities
export {
  TestFileSystem,
  BatchTestRunner,
  PerformanceTestRunner,
  MockDataGenerator
};
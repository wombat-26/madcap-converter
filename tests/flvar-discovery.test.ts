import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { WritersideBatchService } from '../src/core/services/writerside-batch-service.js';

describe('FLVAR File Discovery Fix', () => {
  let tempDir: string;
  let batchService: WritersideBatchService;

  beforeEach(async () => {
    // Create temporary test directory structure
    tempDir = join(process.cwd(), 'temp-test-' + Date.now());
    batchService = new WritersideBatchService();
    
    // Create MadCap project structure
    await mkdir(join(tempDir, 'Content'), { recursive: true });
    await mkdir(join(tempDir, 'Project', 'VariableSets'), { recursive: true });
    
    // Create test FLVAR file
    const testFlvarContent = `<?xml version="1.0" encoding="utf-8"?>
<CatapultVariableSet>
  <Variable Name="CompanyName" EvaluatedDefinition="Test Company">Test Company</Variable>
  <Variable Name="ProductName" EvaluatedDefinition="Test Product">Test Product</Variable>
</CatapultVariableSet>`;
    
    await writeFile(join(tempDir, 'Project', 'VariableSets', 'General.flvar'), testFlvarContent);
    
    // Create test HTML content file
    const testHtmlContent = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <h1>Test Document</h1>
  <p>Welcome to <MadCap:variable name="General.CompanyName" />!</p>
  <p>This is <MadCap:variable name="General.ProductName" />.</p>
</body>
</html>`;
    
    await writeFile(join(tempDir, 'Content', 'test-page.htm'), testHtmlContent);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await rm(tempDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  test('should find FLVAR files when input is Content directory', async () => {
    const contentDir = join(tempDir, 'Content');
    
    // Use the private method through reflection to test FLVAR discovery
    const analyzeMadCapProject = (batchService as any).analyzeMadCapProject.bind(batchService);
    const analysis = await analyzeMadCapProject(contentDir);
    
    expect(analysis.flvarFiles).toHaveLength(1);
    expect(analysis.flvarFiles[0]).toContain('General.flvar');
    expect(analysis.flvarFiles[0]).toContain('Project/VariableSets');
  });

  test('should find FLVAR files when input is project root', async () => {
    // Use the private method through reflection to test FLVAR discovery
    const analyzeMadCapProject = (batchService as any).analyzeMadCapProject.bind(batchService);
    const analysis = await analyzeMadCapProject(tempDir);
    
    expect(analysis.flvarFiles).toHaveLength(1);
    expect(analysis.flvarFiles[0]).toContain('General.flvar');
  });

  test('should find content files in Content directory', async () => {
    const contentDir = join(tempDir, 'Content');
    
    // Use the private method through reflection to test content discovery
    const analyzeMadCapProject = (batchService as any).analyzeMadCapProject.bind(batchService);
    const analysis = await analyzeMadCapProject(contentDir);
    
    expect(analysis.contentFiles).toHaveLength(1);
    expect(analysis.contentFiles[0]).toContain('test-page.htm');
  });

  test('should handle invalid directory gracefully', async () => {
    const invalidDir = join(tempDir, 'nonexistent');
    
    // Use the private method through reflection to test error handling
    const analyzeMadCapProject = (batchService as any).analyzeMadCapProject.bind(batchService);
    const analysis = await analyzeMadCapProject(invalidDir);
    
    expect(analysis.flvarFiles).toHaveLength(0);
    expect(analysis.contentFiles).toHaveLength(0);
    // Error handling is graceful - it continues processing other parts
  });

  test('should handle different path formats', async () => {
    // Test with Content subdirectory path
    const contentSubDir = join(tempDir, 'Content', 'subfolder');
    await mkdir(contentSubDir, { recursive: true });
    
    // Use the private method through reflection to test FLVAR discovery
    const analyzeMadCapProject = (batchService as any).analyzeMadCapProject.bind(batchService);
    const analysis = await analyzeMadCapProject(contentSubDir);
    
    // Should still find FLVAR files from project root when input is anywhere under Content
    expect(analysis.flvarFiles).toHaveLength(1);
    expect(analysis.flvarFiles[0]).toContain('General.flvar');
  });
});
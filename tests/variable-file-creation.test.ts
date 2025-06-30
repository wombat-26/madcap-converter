import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WritersideProjectGenerator } from '../src/services/writerside-project-generator.js';

describe('Variable File Creation Tests', () => {
  let tempDir: string;
  let generator: WritersideProjectGenerator;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(join(tmpdir(), 'writerside-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should create v.list file even when no variables are provided', async () => {
    const config = {
      projectName: 'Test Project',
      projectPath: tempDir,
      globalVariables: [], // Empty variables array
      instances: [{
        id: 'test',
        name: 'Test Instance',
        treeFile: 'test.tree',
        startPage: 'overview.topic',
        variables: []
      }]
    };

    generator = new WritersideProjectGenerator(config);
    
    // Generate the project files
    await generator.generateProject();

    // Check that v.list file was created
    const vListPath = join(tempDir, 'v.list');
    const fileExists = await fs.access(vListPath).then(() => true).catch(() => false);
    
    expect(fileExists).toBe(true);
    
    // Check that the file has the correct empty structure
    const content = await fs.readFile(vListPath, 'utf8');
    expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(content).toContain('<!DOCTYPE vars SYSTEM');
    expect(content).toContain('<vars>');
    expect(content).toContain('<!-- No variables found during conversion -->');
    expect(content).toContain('</vars>');
  });

  it('should create v.list file with variables when variables are provided', async () => {
    const config = {
      projectName: 'Test Project',
      projectPath: tempDir,
      globalVariables: [
        {
          name: 'ProductName',
          value: 'My Product',
          type: 'string'
        },
        {
          name: 'Version',
          value: '1.0.0',
          type: 'string'
        }
      ],
      instances: [{
        id: 'test',
        name: 'Test Instance',
        treeFile: 'test.tree',
        startPage: 'overview.topic',
        variables: []
      }]
    };

    generator = new WritersideProjectGenerator(config);
    
    // Generate the project files
    await generator.generateProject();

    // Check that v.list file was created
    const vListPath = join(tempDir, 'v.list');
    const fileExists = await fs.access(vListPath).then(() => true).catch(() => false);
    
    expect(fileExists).toBe(true);
    
    // Check that the file contains the variables
    const content = await fs.readFile(vListPath, 'utf8');
    expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(content).toContain('<vars>');
    expect(content).toContain('name="ProductName"');
    expect(content).toContain('value="My Product"');
    expect(content).toContain('name="Version"');
    expect(content).toContain('value="1.0.0"');
    expect(content).toContain('</vars>');
  });

  it('should handle null or undefined globalVariables gracefully', async () => {
    const config = {
      projectName: 'Test Project',
      projectPath: tempDir,
      globalVariables: undefined, // Undefined variables
      instances: [{
        id: 'test',
        name: 'Test Instance',
        treeFile: 'test.tree',
        startPage: 'overview.topic',
        variables: []
      }]
    };

    generator = new WritersideProjectGenerator(config);
    
    // Generate the project files
    await generator.generateProject();

    // Check that v.list file was created even with undefined variables
    const vListPath = join(tempDir, 'v.list');
    const fileExists = await fs.access(vListPath).then(() => true).catch(() => false);
    
    expect(fileExists).toBe(true);
    
    // Check that the file has the correct empty structure
    const content = await fs.readFile(vListPath, 'utf8');
    expect(content).toContain('<!-- No variables found during conversion -->');
  });
});
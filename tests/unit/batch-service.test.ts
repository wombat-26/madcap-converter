/**
 * @jest-environment node
 */

import { BatchService, BatchConversionOptions, BatchConversionResult } from '../../src/core/services/batch-service.js';
import { DocumentService } from '../../src/core/services/document-service.js';
import { ConversionResult } from '../../src/core/types/index.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

// Mock dependencies
jest.mock('../../src/core/services/document-service.js');
jest.mock('../../src/core/services/toc-discovery.js');
jest.mock('../../src/core/toc-service.js');
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;
const MockDocumentService = DocumentService as jest.MockedClass<typeof DocumentService>;

describe('BatchService', () => {
  let batchService: BatchService;
  let mockDocumentService: jest.Mocked<DocumentService>;
  let testDir: string;
  let outputDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create fresh instance
    batchService = new BatchService();
    mockDocumentService = new MockDocumentService() as jest.Mocked<DocumentService>;
    
    // Replace the private documentService with our mock
    (batchService as any).documentService = mockDocumentService;
    
    // Setup test directories
    testDir = join(tmpdir(), `batch-test-${Date.now()}`);
    outputDir = join(tmpdir(), `batch-output-${Date.now()}`);
    
    // Setup default mocks
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
      size: 1024
    } as any);
  });

  describe('File Discovery and Filtering', () => {
    it('should discover files recursively', async () => {
      // Mock file structure
      mockFs.readdir
        .mockResolvedValueOnce(['file1.htm', 'subfolder'] as any)
        .mockResolvedValueOnce(['file2.htm'] as any);
      
      mockFs.stat
        .mockImplementation((path: any) => {
          if (path.includes('subfolder')) {
            return Promise.resolve({ isDirectory: () => true, isFile: () => false } as any);
          }
          return Promise.resolve({ isDirectory: () => false, isFile: () => true, size: 1024 } as any);
        });

      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test',
        metadata: { wordCount: 1 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        recursive: true,
        format: 'asciidoc'
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.totalFiles).toBe(2);
      expect(mockFs.readdir).toHaveBeenCalledTimes(2);
    });

    it('should filter files by include patterns', async () => {
      mockFs.readdir.mockResolvedValue(['test.htm', 'guide.htm', 'ignore.txt'] as any);
      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test',
        metadata: { wordCount: 1 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        includePatterns: ['test', 'guide'],
        format: 'asciidoc'
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.convertedFiles).toBe(2);
      expect(result.skippedFiles).toBe(1);
      expect(result.skippedFilesList).toContainEqual({
        file: 'ignore.txt',
        reason: 'Does not match include patterns'
      });
    });

    it('should filter files by exclude patterns', async () => {
      mockFs.readdir.mockResolvedValue(['test.htm', 'deprecated.htm', 'current.htm'] as any);
      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test',
        metadata: { wordCount: 1 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        excludePatterns: ['deprecated'],
        format: 'asciidoc'
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.convertedFiles).toBe(2);
      expect(result.skippedFiles).toBe(1);
      expect(result.skippedFilesList).toContainEqual({
        file: 'deprecated.htm',
        reason: 'Matches exclude pattern: deprecated'
      });
    });

    it('should skip files with excluded MadCap conditions', async () => {
      mockFs.readdir.mockResolvedValue(['valid.htm', 'deprecated.htm'] as any);
      
      mockFs.readFile
        .mockImplementation((path: any) => {
          if (path.includes('deprecated.htm')) {
            return Promise.resolve('<html data-mc-conditions="deprecated"><h1>Old Content</h1></html>');
          }
          return Promise.resolve('<h1>Valid Content</h1>');
        });
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test',
        metadata: { wordCount: 1 }
      } as ConversionResult);

      const result = await batchService.convertFolder(testDir, outputDir, { format: 'asciidoc' });

      expect(result.convertedFiles).toBe(1);
      expect(result.skippedFiles).toBe(1);
      expect(result.skippedFilesList).toContainEqual({
        file: 'deprecated.htm',
        reason: 'Contains excluded MadCap condition: deprecated'
      });
    });

    it('should validate file types and sizes', async () => {
      mockFs.readdir.mockResolvedValue(['valid.htm', 'toolarge.htm', 'invalid.xyz'] as any);
      
      mockFs.stat.mockImplementation((path: any) => {
        if (path.includes('toolarge.htm')) {
          return Promise.resolve({ 
            isDirectory: () => false, 
            isFile: () => true, 
            size: 200 * 1024 * 1024 // 200MB - exceeds limit
          } as any);
        }
        return Promise.resolve({ 
          isDirectory: () => false, 
          isFile: () => true, 
          size: 1024 
        } as any);
      });

      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test',
        metadata: { wordCount: 1 }
      } as ConversionResult);

      const result = await batchService.convertFolder(testDir, outputDir, { format: 'asciidoc' });

      expect(result.convertedFiles).toBe(1);
      expect(result.skippedFiles).toBe(2);
      expect(result.skippedFilesList).toHaveLength(2);
    });
  });

  describe('Structure Preservation and File Naming', () => {
    it('should preserve folder structure when enabled', async () => {
      mockFs.readdir
        .mockResolvedValueOnce(['subfolder'] as any)
        .mockResolvedValueOnce(['file.htm'] as any);
      
      mockFs.stat
        .mockImplementation((path: any) => {
          if (path.includes('subfolder') && !path.includes('file.htm')) {
            return Promise.resolve({ isDirectory: () => true, isFile: () => false } as any);
          }
          return Promise.resolve({ isDirectory: () => false, isFile: () => true, size: 1024 } as any);
        });

      mockFs.readFile.mockResolvedValue('<h1>Test File</h1>');
      mockFs.writeFile.mockResolvedValue(undefined);
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test File',
        metadata: { wordCount: 2 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        preserveStructure: true,
        format: 'asciidoc'
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.convertedFiles).toBe(1);
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('subfolder'),
        { recursive: true }
      );
    });

    it('should flatten structure when disabled', async () => {
      mockFs.readdir
        .mockResolvedValueOnce(['deep', 'file1.htm'] as any)
        .mockResolvedValueOnce(['nested'] as any)
        .mockResolvedValueOnce(['file2.htm'] as any);
      
      mockFs.stat
        .mockImplementation((path: any) => {
          if (path.includes('.htm')) {
            return Promise.resolve({ isDirectory: () => false, isFile: () => true, size: 1024 } as any);
          }
          return Promise.resolve({ isDirectory: () => true, isFile: () => false } as any);
        });

      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      mockFs.writeFile.mockResolvedValue(undefined);
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test',
        metadata: { wordCount: 1 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        preserveStructure: false,
        format: 'asciidoc'
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.convertedFiles).toBe(2);
      // Files should be written to output root, not nested folders
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`${outputDir}/[^/]+\\.adoc$`)),
        expect.any(String),
        'utf-8'
      );
    });

    it('should rename files based on H1 content when enabled', async () => {
      mockFs.readdir.mockResolvedValue(['generic-name.htm'] as any);
      mockFs.readFile.mockResolvedValue('<h1>Specific Document Title</h1><p>Content</p>');
      mockFs.writeFile.mockResolvedValue(undefined);
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Specific Document Title\n\nContent',
        metadata: { wordCount: 3 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        renameFiles: true,
        format: 'asciidoc'
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.convertedFiles).toBe(1);
      expect(result.filenameMapping?.size).toBe(1);
      
      // Should rename to sanitized version of H1 content
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('specific-document-title.adoc'),
        expect.any(String),
        'utf-8'
      );
    });

    it('should update cross-references when files are renamed', async () => {
      mockFs.readdir.mockResolvedValue(['doc1.htm', 'doc2.htm'] as any);
      
      mockFs.readFile
        .mockImplementation((path: any) => {
          if (path.includes('doc1.htm')) {
            return Promise.resolve('<h1>Document One</h1><p>See <a href="doc2.htm">Document Two</a></p>');
          }
          return Promise.resolve('<h1>Document Two</h1><p>Referenced document</p>');
        });

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockImplementation((path: any) => {
        if (path.includes('.adoc')) {
          return Promise.resolve('= Document One\n\nSee xref:doc2.adoc[Document Two]');
        }
        return Promise.resolve('<h1>Test</h1>');
      });
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Document One\n\nSee xref:doc2.adoc[Document Two]',
        metadata: { wordCount: 5 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        renameFiles: true,
        format: 'asciidoc'
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.convertedFiles).toBe(2);
      expect(result.filenameMapping?.size).toBe(2);
    });
  });

  describe('Image and Asset Handling', () => {
    it('should copy images when enabled', async () => {
      mockFs.readdir
        .mockResolvedValueOnce(['document.htm', 'images'] as any)
        .mockResolvedValueOnce(['screenshot.png', 'icon.svg'] as any);
      
      mockFs.stat
        .mockImplementation((path: any) => {
          if (path.includes('images') && !path.includes('.png') && !path.includes('.svg')) {
            return Promise.resolve({ isDirectory: () => true, isFile: () => false } as any);
          }
          return Promise.resolve({ isDirectory: () => false, isFile: () => true, size: 1024 } as any);
        });

      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.copyFile.mockResolvedValue(undefined);
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test',
        metadata: { wordCount: 1 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        copyImages: true,
        preserveStructure: true,
        format: 'asciidoc'
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.convertedFiles).toBe(1);
      expect(mockFs.copyFile).toHaveBeenCalledTimes(2);
      expect(mockFs.copyFile).toHaveBeenCalledWith(
        expect.stringContaining('screenshot.png'),
        expect.stringContaining('screenshot.png')
      );
    });

    it('should handle image copying errors gracefully', async () => {
      mockFs.readdir
        .mockResolvedValueOnce(['document.htm', 'images'] as any)
        .mockResolvedValueOnce(['broken.png'] as any);
      
      mockFs.stat
        .mockImplementation((path: any) => {
          if (path.includes('images') && !path.includes('.png')) {
            return Promise.resolve({ isDirectory: () => true, isFile: () => false } as any);
          }
          return Promise.resolve({ isDirectory: () => false, isFile: () => true, size: 1024 } as any);
        });

      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.copyFile.mockRejectedValue(new Error('Permission denied'));
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test',
        metadata: { wordCount: 1 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        copyImages: true,
        format: 'asciidoc'
      };

      // Should not throw, but handle gracefully
      const result = await batchService.convertFolder(testDir, outputDir, options);
      expect(result.convertedFiles).toBe(1);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle conversion errors for individual files', async () => {
      mockFs.readdir.mockResolvedValue(['good.htm', 'bad.htm'] as any);
      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      
      mockDocumentService.convertDocument
        .mockResolvedValueOnce({
          content: '= Good File',
          metadata: { wordCount: 2 }
        } as ConversionResult)
        .mockRejectedValueOnce(new Error('Conversion failed'));

      const result = await batchService.convertFolder(testDir, outputDir, { format: 'asciidoc' });

      expect(result.totalFiles).toBe(2);
      expect(result.convertedFiles).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        file: 'bad.htm',
        error: 'Conversion failed'
      });
    });

    it('should handle file system errors', async () => {
      mockFs.readdir.mockResolvedValue(['test.htm'] as any);
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      
      const result = await batchService.convertFolder(testDir, outputDir, { format: 'asciidoc' });

      expect(result.totalFiles).toBe(1);
      expect(result.convertedFiles).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('File not found');
    });

    it('should handle output directory creation errors', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(
        batchService.convertFolder(testDir, '/invalid/output/dir', { format: 'asciidoc' })
      ).rejects.toThrow('Batch conversion failed');
    });
  });

  describe('Performance and Concurrency', () => {
    it('should process files with limited concurrency', async () => {
      // Create array of 10 files
      const files = Array.from({ length: 10 }, (_, i) => `file${i}.htm`);
      mockFs.readdir.mockResolvedValue(files as any);
      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      mockFs.writeFile.mockResolvedValue(undefined);
      
      let concurrentCalls = 0;
      let maxConcurrent = 0;
      
      mockDocumentService.convertDocument.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));
        
        concurrentCalls--;
        return {
          content: '= Test',
          metadata: { wordCount: 1 }
        } as ConversionResult;
      });

      const result = await batchService.convertFolder(testDir, outputDir, { format: 'asciidoc' });

      expect(result.convertedFiles).toBe(10);
      expect(maxConcurrent).toBeLessThanOrEqual(5); // Should limit concurrency
    });

    it('should handle large batch processing', async () => {
      // Test with 50 files
      const files = Array.from({ length: 50 }, (_, i) => `doc${i}.htm`);
      mockFs.readdir.mockResolvedValue(files as any);
      mockFs.readFile.mockResolvedValue('<h1>Test Document</h1>');
      mockFs.writeFile.mockResolvedValue(undefined);
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test Document',
        metadata: { wordCount: 2 }
      } as ConversionResult);

      const startTime = Date.now();
      const result = await batchService.convertFolder(testDir, outputDir, { format: 'asciidoc' });
      const duration = Date.now() - startTime;

      expect(result.convertedFiles).toBe(50);
      expect(result.errors).toHaveLength(0);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    }, 35000);
  });

  describe('Format-Specific Options', () => {
    it('should handle AsciiDoc-specific options', async () => {
      mockFs.readdir.mockResolvedValue(['test.htm'] as any);
      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      mockFs.writeFile.mockResolvedValue(undefined);
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test',
        metadata: { wordCount: 1 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        format: 'asciidoc',
        asciidocOptions: {
          enableValidation: true,
          validationStrictness: 'strict'
        }
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.convertedFiles).toBe(1);
      expect(mockDocumentService.convertDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          format: 'asciidoc',
          asciidocOptions: expect.objectContaining({
            enableValidation: true,
            validationStrictness: 'strict'
          })
        })
      );
    });

    it('should handle Writerside-specific options', async () => {
      mockFs.readdir.mockResolvedValue(['guide.htm'] as any);
      mockFs.readFile.mockResolvedValue('<h1>User Guide</h1>');
      mockFs.writeFile.mockResolvedValue(undefined);
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '# User Guide',
        metadata: { wordCount: 2 }
      } as ConversionResult);

      const options: BatchConversionOptions = {
        format: 'writerside-markdown',
        writersideOptions: {
          generateInstance: true,
          instanceName: 'user-docs'
        }
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.convertedFiles).toBe(1);
      expect(mockDocumentService.convertDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          format: 'writerside-markdown',
          writersideOptions: expect.objectContaining({
            generateInstance: true,
            instanceName: 'user-docs'
          })
        })
      );
    });

    it('should handle variable extraction options', async () => {
      mockFs.readdir.mockResolvedValue(['test.htm'] as any);
      mockFs.readFile.mockResolvedValue('<span data-mc-variable="General.ProductName">Product</span>');
      mockFs.writeFile.mockResolvedValue(undefined);
      
      mockDocumentService.convertDocument.mockResolvedValue({
        content: '= Test\n\n{product-name}',
        metadata: { wordCount: 2 },
        variablesFile: ':product-name: Product'
      } as ConversionResult);

      const options: BatchConversionOptions = {
        format: 'asciidoc',
        variableOptions: {
          extractVariables: true,
          variableMode: 'include',
          variableFormat: 'adoc'
        }
      };

      const result = await batchService.convertFolder(testDir, outputDir, options);

      expect(result.convertedFiles).toBe(1);
      expect(mockDocumentService.convertDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          variableOptions: expect.objectContaining({
            extractVariables: true,
            variableMode: 'include',
            variableFormat: 'adoc'
          })
        })
      );
    });
  });

  describe('Analysis and Reporting', () => {
    it('should analyze folder structure before conversion', async () => {
      mockFs.readdir.mockResolvedValue(['valid.htm', 'invalid.xyz', 'large.htm'] as any);
      
      mockFs.stat.mockImplementation((path: any) => {
        if (path.includes('large.htm')) {
          return Promise.resolve({ 
            isDirectory: () => false, 
            isFile: () => true, 
            size: 200 * 1024 * 1024 // 200MB
          } as any);
        }
        return Promise.resolve({ 
          isDirectory: () => false, 
          isFile: () => true, 
          size: 1024 
        } as any);
      });

      const analysis = await batchService.analyzeFolder(testDir, { format: 'asciidoc' });

      expect(analysis.totalFiles).toBe(3);
      expect(analysis.supportedFiles).toBe(1); // Only valid.htm
      expect(analysis.unsupportedFiles).toBe(2);
      expect(analysis.fileTypes.get('htm')).toBe(2);
      expect(analysis.fileTypes.get('xyz')).toBe(1);
      expect(analysis.issues).toHaveLength(2); // large file + unsupported type
    });

    it('should provide detailed conversion results', async () => {
      mockFs.readdir.mockResolvedValue(['doc1.htm', 'doc2.htm'] as any);
      mockFs.readFile.mockResolvedValue('<h1>Test</h1>');
      mockFs.writeFile.mockResolvedValue(undefined);
      
      mockDocumentService.convertDocument
        .mockResolvedValueOnce({
          content: '= Document 1',
          metadata: { wordCount: 2, processingTime: 100 }
        } as ConversionResult)
        .mockResolvedValueOnce({
          content: '= Document 2',
          metadata: { wordCount: 2, processingTime: 150 }
        } as ConversionResult);

      const result = await batchService.convertFolder(testDir, outputDir, { format: 'asciidoc' });

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({
        inputPath: expect.stringContaining('doc1.htm'),
        outputPath: expect.stringContaining('doc1.adoc'),
        result: expect.objectContaining({
          content: '= Document 1',
          metadata: expect.objectContaining({ wordCount: 2 })
        })
      });
    });
  });
});
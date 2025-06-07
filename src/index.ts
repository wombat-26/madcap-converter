#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DocumentService } from './document-service.js';
import { BatchService } from './batch-service.js';
import { ConversionOptions } from './types/index.js';

const ConvertDocumentSchema = {
  input: z.string().describe('Input content (HTML, file path, or base64 encoded content)'),
  inputType: z.enum(['html', 'word', 'madcap']).describe('Type of input document'),
  format: z.enum(['markdown', 'asciidoc']).describe('Output format'),
  preserveFormatting: z.boolean().optional().describe('Whether to preserve formatting'),
  extractImages: z.boolean().optional().describe('Whether to extract and reference images'),
  outputPath: z.string().optional().describe('Output file path (if not provided, returns content only)')
};

const ConvertFileSchema = {
  inputPath: z.string().describe('Path to the input file'),
  outputPath: z.string().describe('Path for the output file'),
  format: z.enum(['markdown', 'asciidoc']).describe('Output format'),
  preserveFormatting: z.boolean().optional().describe('Whether to preserve formatting'),
  extractImages: z.boolean().optional().describe('Whether to extract and reference images')
};

const GetSupportedFormatsSchema = {};

const ConvertFolderSchema = {
  inputDir: z.string().describe('Path to input directory containing documents'),
  outputDir: z.string().describe('Path to output directory for converted documents'),
  format: z.enum(['markdown', 'asciidoc']).describe('Output format'),
  recursive: z.boolean().optional().describe('Process subdirectories recursively (default: true)'),
  preserveStructure: z.boolean().optional().describe('Preserve directory structure (default: true)'),
  copyImages: z.boolean().optional().describe('Copy referenced images (default: true)'),
  preserveFormatting: z.boolean().optional().describe('Preserve formatting (default: true)'),
  extractImages: z.boolean().optional().describe('Extract images from documents (default: true)'),
  includePatterns: z.array(z.string()).optional().describe('File patterns to include'),
  excludePatterns: z.array(z.string()).optional().describe('File patterns to exclude')
};

const AnalyzeFolderSchema = {
  inputDir: z.string().describe('Path to directory to analyze')
};

class DocumentConverterServer {
  private server: McpServer;
  private documentService: DocumentService;
  private batchService: BatchService;

  constructor() {
    this.documentService = new DocumentService();
    this.batchService = new BatchService();
    
    this.server = new McpServer({
      name: 'document-converter',
      version: '1.0.0',
    });

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.tool('convert_document', ConvertDocumentSchema, async (args) => {
      const options: ConversionOptions = {
        inputType: args.inputType,
        format: args.format,
        preserveFormatting: args.preserveFormatting ?? true,
        extractImages: args.extractImages ?? false
      };

      let result;
      
      if (args.inputType === 'word') {
        const buffer = Buffer.from(args.input, 'base64');
        result = await this.documentService.convertBuffer(buffer, options);
      } else {
        result = await this.documentService.convertString(args.input, options);
      }

      if (args.outputPath) {
        const fs = await import('fs/promises');
        await fs.writeFile(args.outputPath, result.content, 'utf8');
        
        return {
          content: [
            {
              type: 'text',
              text: `Document successfully converted and saved to: ${args.outputPath}\n\nMetadata:\n${JSON.stringify(result.metadata, null, 2)}`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Converted Content:\n\n${result.content}\n\nMetadata:\n${JSON.stringify(result.metadata, null, 2)}`
          }
        ]
      };
    });

    this.server.tool('convert_file', ConvertFileSchema, async (args) => {
      const result = await this.documentService.convertFile(
        args.inputPath,
        args.outputPath,
        {
          format: args.format,
          preserveFormatting: args.preserveFormatting,
          extractImages: args.extractImages
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: `File successfully converted from ${args.inputPath} to ${args.outputPath}\n\nMetadata:\n${JSON.stringify(result.metadata, null, 2)}`
          }
        ]
      };
    });

    this.server.tool('get_supported_formats', GetSupportedFormatsSchema, async () => {
      const formats = this.documentService.getSupportedFormats();
      
      return {
        content: [
          {
            type: 'text',
            text: `Supported input formats: ${formats.join(', ')}\n\nSupported output formats: markdown, asciidoc`
          }
        ]
      };
    });

    this.server.tool('convert_folder', ConvertFolderSchema, async (args) => {
      const options = {
        format: args.format,
        recursive: args.recursive ?? true,
        preserveStructure: args.preserveStructure ?? true,
        copyImages: args.copyImages ?? true,
        preserveFormatting: args.preserveFormatting ?? true,
        extractImages: args.extractImages ?? true,
        includePatterns: args.includePatterns,
        excludePatterns: args.excludePatterns
      };

      const result = await this.batchService.convertFolder(
        args.inputDir,
        args.outputDir,
        options
      );

      const summary = `Batch conversion completed!

📊 Results Summary:
- Total files found: ${result.totalFiles}
- Successfully converted: ${result.convertedFiles}
- Skipped files: ${result.skippedFiles}
- Errors: ${result.errors.length}

📁 Output directory: ${args.outputDir}
📝 Format: ${args.format}
${options.preserveStructure ? '📂 Directory structure preserved' : '📄 Flat structure'}
${options.copyImages ? '🖼️ Images copied' : ''}

${result.errors.length > 0 ? `\n❌ Errors:\n${result.errors.map(e => `  - ${e.file}: ${e.error}`).join('\n')}` : ''}

✅ Converted files:
${result.results.slice(0, 10).map(r => `  - ${r.inputPath} → ${r.outputPath}`).join('\n')}${result.results.length > 10 ? `\n  ... and ${result.results.length - 10} more files` : ''}`;

      return {
        content: [
          {
            type: 'text',
            text: summary
          }
        ]
      };
    });

    this.server.tool('analyze_folder', AnalyzeFolderSchema, async (args) => {
      const stats = await this.batchService.getDirectoryStats(args.inputDir);

      const analysis = `📊 Directory Analysis: ${args.inputDir}

📁 File Statistics:
- Total files: ${stats.totalFiles}
- Supported document files: ${stats.supportedFiles}

📄 File Types:
${Object.entries(stats.fileTypes)
  .sort(([,a], [,b]) => b - a)
  .map(([ext, count]) => `  - ${ext || 'no extension'}: ${count} files`)
  .join('\n')}

${stats.supportedFiles > 0 ? `\n✅ Ready for conversion: ${stats.supportedFiles} documents found` : '\n⚠️  No supported documents found for conversion'}

📂 Directory Structure (first 20 files):
${stats.structure.slice(0, 20).map(f => `  - ${f}`).join('\n')}${stats.structure.length > 20 ? `\n  ... and ${stats.structure.length - 20} more files` : ''}`;

      return {
        content: [
          {
            type: 'text',
            text: analysis
          }
        ]
      };
    });
  }


  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new DocumentConverterServer();
  server.run().catch(console.error);
}
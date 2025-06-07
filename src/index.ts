#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DocumentService } from './document-service.js';
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

class DocumentConverterServer {
  private server: McpServer;
  private documentService: DocumentService;

  constructor() {
    this.documentService = new DocumentService();
    
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
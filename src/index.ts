import { dirname } from 'path';
import { DocumentService } from './document-service.js';
import { BatchService } from './batch-service.js';

type ToolCall = {
  name: string;
  arguments: any;
};

type ToolResult = {
  isError: boolean;
  error?: string;
  content?: any;
  metadata?: any;
  result?: any;
};

export class MCPServer {
  private documentService: DocumentService;
  private batchService: BatchService;

  constructor() {
    this.documentService = new DocumentService();
    this.batchService = new BatchService();
  }

  async handleToolCall(call: ToolCall): Promise<ToolResult> {
    const { name, arguments: args } = call;

    try {
      if (name === 'convert_file') {
        const res = await this.documentService.convertFile(
          args.inputPath,
          args.outputPath,
          {
            format: args.format,
            inputType: args.inputType || 'html',
            preserveFormatting: args.preserveFormatting,
            extractImages: args.extractImages,
            outputDir: args.outputDir || (args.outputPath ? dirname(args.outputPath) : undefined),
            rewriteLinks: args.rewriteLinks,
            variableOptions: args.variableOptions,
            asciidocOptions: args.asciidocOptions,
            zendeskOptions: args.zendeskOptions,
            validateLinks: args.validateLinks,
          }
        );
        return { isError: false, content: res.content, metadata: res.metadata };
      }

      if (name === 'convert_folder') {
        const res = await this.batchService.convertFolder(
          args.inputDir,
          args.outputDir,
          {
            format: args.format,
            preserveFormatting: args.preserveFormatting,
            extractImages: args.extractImages,
            recursive: args.recursive,
            preserveStructure: args.preserveStructure,
            copyImages: args.copyImages,
            renameFiles: args.renameFiles,
            useTOCStructure: args.useTOCStructure,
            generateMasterDoc: args.generateMasterDoc,
            variableOptions: args.variableOptions,
            asciidocOptions: args.asciidocOptions,
            zendeskOptions: args.zendeskOptions,
          } as any
        );
        return { isError: false, content: `Converted ${res.convertedFiles} files`, result: res };
      }

      return { isError: true, error: `Unknown tool: ${name}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, error: message };
    }
  }
}


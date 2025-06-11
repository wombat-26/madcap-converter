// MCP Client for communicating with the MadCap Converter server via API
export interface MCPRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ConversionOptions {
  format: 'markdown' | 'asciidoc' | 'zendesk';
  inputType?: 'html' | 'word' | 'madcap';
  preserveFormatting?: boolean;
  extractImages?: boolean;
  zendeskOptions?: ZendeskOptions;
}

export interface ZendeskOptions {
  sectionId?: string;
  locale?: string;
  userSegmentId?: string;
  permissionGroupId?: string;
  generateTags?: boolean;
  maxTags?: number;
  sanitizeHtml?: boolean;
  ignoreVideos?: boolean;
  inlineStyles?: boolean;
  generateStylesheet?: boolean;
  cssOutputPath?: string;
}

export interface BatchConversionOptions extends ConversionOptions {
  recursive?: boolean;
  preserveStructure?: boolean;
  copyImages?: boolean;
  renameFiles?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export class MCPClient {
  private apiEndpoint: string;

  constructor(apiEndpoint: string = '/api/mcp') {
    this.apiEndpoint = apiEndpoint;
  }

  private async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`MCP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listTools() {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    };

    return this.sendRequest(request);
  }

  async convertDocument(input: string, options: ConversionOptions) {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "convert_document",
        arguments: {
          input,
          ...options
        }
      }
    };

    return this.sendRequest(request);
  }

  async convertFile(inputPath: string, outputPath: string, options: ConversionOptions) {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "convert_file",
        arguments: {
          inputPath,
          outputPath,
          ...options
        }
      }
    };

    return this.sendRequest(request);
  }

  async convertFolder(inputDir: string, outputDir: string, options: BatchConversionOptions) {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "convert_folder",
        arguments: {
          inputDir,
          outputDir,
          ...options
        }
      }
    };

    return this.sendRequest(request);
  }

  async analyzeFolder(inputDir: string) {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "analyze_folder",
        arguments: {
          inputDir
        }
      }
    };

    return this.sendRequest(request);
  }

  async getSupportedFormats() {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "get_supported_formats",
        arguments: {}
      }
    };

    return this.sendRequest(request);
  }
}
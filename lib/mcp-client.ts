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

export interface VariableExtractionOptions {
  extractVariables?: boolean;
  variableFormat?: 'adoc' | 'writerside';
  variablesOutputPath?: string;
  preserveVariableStructure?: boolean;
  skipFileGeneration?: boolean;
  
  // Enhanced variable handling options
  variableMode?: 'flatten' | 'include' | 'reference';
  nameConvention?: 'camelCase' | 'snake_case' | 'kebab-case' | 'original';
  instanceName?: string;
  variablePrefix?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  flvarFiles?: string[];
  autoDiscoverFLVAR?: boolean;
}

export interface AsciidocOptions {
  useCollapsibleBlocks?: boolean;
  tilesAsTable?: boolean;
  generateAsBook?: boolean;
  bookTitle?: string;
  bookAuthor?: string;
  useLinkedTitleFromTOC?: boolean;
  includeChapterBreaks?: boolean;
  includeTOCLevels?: number;
  useBookDoctype?: boolean;
  
  // Enhanced validation options
  enableValidation?: boolean;
  validationStrictness?: 'strict' | 'normal' | 'lenient';
  
  // Enhanced table options
  autoColumnWidths?: boolean;
  preserveTableFormatting?: boolean;
  tableFrame?: 'all' | 'topbot' | 'sides' | 'none';
  tableGrid?: 'all' | 'rows' | 'cols' | 'none';
  
  // Enhanced path resolution options
  enableSmartPathResolution?: boolean;
  validateImagePaths?: boolean;
  customImagePaths?: string[];
  
  // Glossary options
  glossaryOptions?: {
    includeGlossary?: boolean;
    glossaryPath?: string;
    glossaryFormat?: 'inline' | 'separate' | 'book-appendix';
    filterConditions?: boolean;
    generateAnchors?: boolean;
    includeIndex?: boolean;
    glossaryTitle?: string;
    sortAlphabetically?: boolean;
    includeDefinitionList?: boolean;
    enableCrossReferences?: boolean;
  };
}

export interface WritersideOptions {
  createProject?: boolean;
  projectName?: string;
  generateInstances?: boolean;
  instanceMapping?: { [condition: string]: string };
  enableProcedureBlocks?: boolean;
  enableCollapsibleBlocks?: boolean;
  enableTabs?: boolean;
  enableSummaryCards?: boolean;
  enableSemanticMarkup?: boolean;
  generateTOC?: boolean;
  organizeByTOC?: boolean;
  preserveTopicHierarchy?: boolean;
  convertVariables?: boolean;
  convertConditions?: boolean;
  mergeSnippets?: boolean;
  buildConfig?: {
    primaryColor?: string;
    headerLogo?: string;
    favicon?: string;
    webRoot?: string;
    enableSearch?: boolean;
    enableSitemap?: boolean;
    enableAnalytics?: boolean;
  };
  generateStarterContent?: boolean;
  optimizeForMobile?: boolean;
  includeMetadata?: boolean;
}

export interface WritersideProjectOptions {
  projectName?: string;
  createProject?: boolean;
  generateInstances?: boolean;
  copyImages?: boolean;
  generateTOC?: boolean;
  generateStarterContent?: boolean;
  writersideOptions?: WritersideOptions;
  variableOptions?: VariableExtractionOptions;
}

export interface ConversionOptions {
  format: 'markdown' | 'asciidoc' | 'zendesk' | 'pandoc-asciidoc' | 'pandoc-markdown' | 'enhanced-markdown' | 'madcap-markdown' | 'writerside-markdown';
  inputType?: 'html' | 'word' | 'madcap';
  preserveFormatting?: boolean;
  extractImages?: boolean;
  variableOptions?: VariableExtractionOptions;
  zendeskOptions?: ZendeskOptions;
  asciidocOptions?: AsciidocOptions;
  writersideOptions?: WritersideOptions;
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
  useTOCStructure?: boolean;
  generateMasterDoc?: boolean;
}

export class MCPClient {
  private apiEndpoint: string;
  private isHealthy: boolean = false;

  constructor(apiEndpoint: string = '/api/mcp') {
    this.apiEndpoint = apiEndpoint;
    this.checkHealth();
  }
  
  private async checkHealth(): Promise<boolean> {
    try {
      const healthEndpoint = this.apiEndpoint.replace('/mcp', '/health');
      const response = await fetch(healthEndpoint);
      this.isHealthy = response.ok;
      return this.isHealthy;
    } catch {
      this.isHealthy = false;
      return false;
    }
  }
  
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.listTools();
      return !!(result.result && result.result.tools);
    } catch {
      return false;
    }
  }

  private async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    const maxRetries = 3;
    const retryDelay = 1000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
        
        const response = await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Don't retry on abort errors (timeout)
        if (errorMessage.includes('abort')) {
          throw new Error(`MCP request timed out after 5 minutes`);
        }
        
        if (isLastAttempt) {
          throw new Error(`MCP request failed after ${maxRetries} attempts: ${errorMessage}`);
        }
        
        console.warn(`MCP request attempt ${attempt} failed: ${errorMessage}. Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    throw new Error('Unexpected error in sendRequest');
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

  async discoverTOCs(projectPath: string) {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "discover_tocs",
        arguments: {
          projectPath
        }
      }
    };

    return this.sendRequest(request);
  }

  async convertWithTOCStructure(projectPath: string, outputDir: string, options: BatchConversionOptions) {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "convert_with_toc_structure",
        arguments: {
          projectPath,
          outputDir,
          ...options
        }
      }
    };

    return this.sendRequest(request);
  }

  async convertToWritersideProject(inputDir: string, outputDir: string, options: WritersideProjectOptions) {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "convert_to_writerside_project",
        arguments: {
          inputDir,
          outputDir,
          ...options
        }
      }
    };

    return this.sendRequest(request);
  }
}
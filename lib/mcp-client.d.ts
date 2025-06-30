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
}
export interface WritersideOptions {
    createProject?: boolean;
    projectName?: string;
    generateInstances?: boolean;
    instanceMapping?: {
        [condition: string]: string;
    };
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
export declare class MCPClient {
    private apiEndpoint;
    private isHealthy;
    constructor(apiEndpoint?: string);
    private checkHealth;
    testConnection(): Promise<boolean>;
    private sendRequest;
    listTools(): Promise<MCPResponse>;
    convertDocument(input: string, options: ConversionOptions): Promise<MCPResponse>;
    convertFile(inputPath: string, outputPath: string, options: ConversionOptions): Promise<MCPResponse>;
    convertFolder(inputDir: string, outputDir: string, options: BatchConversionOptions): Promise<MCPResponse>;
    analyzeFolder(inputDir: string): Promise<MCPResponse>;
    getSupportedFormats(): Promise<MCPResponse>;
    discoverTOCs(projectPath: string): Promise<MCPResponse>;
    convertWithTOCStructure(projectPath: string, outputDir: string, options: BatchConversionOptions): Promise<MCPResponse>;
    convertToWritersideProject(inputDir: string, outputDir: string, options: WritersideProjectOptions): Promise<MCPResponse>;
}

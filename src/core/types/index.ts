export interface ConversionOptions {
  format: 'asciidoc' | 'writerside-markdown' | 'zendesk';
  inputType: 'html' | 'word' | 'madcap';
  preserveFormatting?: boolean; // Always defaults to true - formatting is always preserved
  extractImages?: boolean;
  outputDir?: string;
  outputPath?: string;
  rewriteLinks?: boolean;
  inputPath?: string; // Source file path for snippet resolution
  projectRootPath?: string; // Project root directory for batch processing snippet resolution
  zendeskOptions?: ZendeskConversionOptions;
  variableOptions?: VariableExtractionOptions;
  asciidocOptions?: AsciiDocConversionOptions;
  writersideOptions?: WritersideConversionOptions;
  validateLinks?: boolean;
  pathDepth?: number; // For batch processing - track directory depth
  excludeConditions?: string[]; // MadCap conditions to exclude from conversion
  includeConditions?: string[]; // MadCap conditions to include (if specified, only these are included)
}

export interface AsciiDocConversionOptions {
  useCollapsibleBlocks?: boolean; // Convert MadCap dropdowns to AsciiDoc collapsible blocks (default: false)
  tilesAsTable?: boolean; // Convert tile/card grids to AsciiDoc tables (default: false)
  generateAsBook?: boolean; // Generate complete AsciiDoc book structure with master document
  bookTitle?: string; // Custom book title (auto-detected from TOC if empty)
  bookAuthor?: string; // Book author name (optional)
  useLinkedTitleFromTOC?: boolean; // Extract chapter titles from H1 headings when TOC uses LinkedTitle
  includeChapterBreaks?: boolean; // Add chapter breaks between major sections
  includeTOCLevels?: number; // Number of heading levels to include in TOC (1-6, default: 3)
  useBookDoctype?: boolean; // Set doctype to 'book' for multi-chapter documents
  
  // Enhanced validation options
  enableValidation?: boolean; // Enable AsciiDoc syntax validation (default: true)
  validationStrictness?: 'strict' | 'normal' | 'lenient'; // Validation strictness level (default: 'normal')
  
  // Enhanced table options
  autoColumnWidths?: boolean; // Enable automatic column width calculation (default: true)
  preserveTableFormatting?: boolean; // Preserve cell formatting in tables (default: true)
  tableFrame?: 'all' | 'topbot' | 'sides' | 'none'; // Table frame style (default: 'all')
  tableGrid?: 'all' | 'rows' | 'cols' | 'none'; // Table grid style (default: 'all')
  
  // Enhanced path resolution options
  enableSmartPathResolution?: boolean; // Enable intelligent path resolution (default: true)
  validateImagePaths?: boolean; // Validate image file existence (default: false)
  customImagePaths?: string[]; // Additional search paths for images
  
  // Glossary options
  glossaryOptions?: {
    generateGlossary?: boolean; // Generate AsciiDoc glossary (default: false)
    glossaryTitle?: string; // Title for glossary section (default: 'Glossary')
    glossaryFile?: string; // Separate glossary file name
    extractToSeparateFile?: boolean; // Extract glossary to separate file
    includeGlossary?: boolean; // Include glossary in conversion
    glossaryPath?: string; // Path to glossary file
    filterConditions?: string[] | boolean; // Conditions to filter glossary terms or false to disable filtering
    glossaryFormat?: 'inline' | 'separate' | 'book-appendix'; // Format for glossary output
    generateAnchors?: boolean; // Generate anchors for glossary terms
    includeIndex?: boolean; // Include alphabetical index
  };
  
  // Math processing options
  mathOptions?: {
    enableMathProcessing?: boolean; // Enable math notation processing (default: true)
    mathFormat?: 'latexmath' | 'asciimath' | 'text'; // Math output format (default: 'latexmath')
    preserveMathSymbols?: boolean; // Keep Unicode math symbols (default: true)
    convertSubscripts?: boolean; // Convert HTML sub/sup tags (default: true)
    processInlineExpressions?: boolean; // Process math in inline content (default: true)
  };
  
  // Citation processing options
  citationOptions?: {
    enableCitationProcessing?: boolean; // Enable citation processing (default: true)
    citationStyle?: 'footnote' | 'endnote' | 'bibliography'; // Citation format preference
    generateCitationsSection?: boolean; // Add citations section (default: true)
    preserveFootnotes?: boolean; // Keep HTML footnotes as AsciiDoc footnotes (default: true)
    processBibliography?: boolean; // Process bibliography entries (default: true)
  };
  
  // Performance optimization options
  performanceOptions?: {
    enableOptimization?: boolean; // Enable performance optimization for large documents
    chunkSize?: number; // Chunk size for large documents (default: 10000 characters)
    memoryThreshold?: number; // Memory warning threshold in MB (default: 100)
    batchProcessing?: boolean; // Use batch element processing (default: true)
  };
}

export interface WritersideConversionOptions {
  // Project structure options
  createProject?: boolean; // Generate complete Writerside project structure
  projectName?: string; // Name for the Writerside project
  
  // Instance configuration
  generateInstances?: boolean; // Auto-generate instances based on conditions
  instanceMapping?: { [condition: string]: string }; // Map MadCap conditions to instances
  
  // Content enhancement options
  enableProcedureBlocks?: boolean; // Convert step-by-step content to procedure blocks
  enableCollapsibleBlocks?: boolean; // Convert expandable content to collapsible blocks
  enableTabs?: boolean; // Convert tabbed content to tab groups
  enableSummaryCards?: boolean; // Convert summary content to card layouts
  enableSemanticMarkup?: boolean; // Use Writerside semantic elements
  
  // TOC and navigation
  generateTOC?: boolean; // Generate tree files from MadCap TOCs
  organizeByTOC?: boolean; // Use TOC structure for content organization
  preserveTopicHierarchy?: boolean; // Maintain hierarchical topic structure
  
  // Variable and conditional content
  convertVariables?: boolean; // Convert MadCap variables to Writerside format
  convertConditions?: boolean; // Convert MadCap conditions to Writerside filters
  mergeSnippets?: boolean; // Convert MadCap snippets to includes
  
  // Build configuration
  buildConfig?: {
    primaryColor?: string; // Theme primary color
    headerLogo?: string; // Header logo path
    favicon?: string; // Favicon path
    webRoot?: string; // Web root URL
    enableSearch?: boolean; // Enable search functionality
    enableSitemap?: boolean; // Generate sitemap
    enableAnalytics?: boolean; // Enable analytics
  };
  
  // Advanced options
  generateStarterContent?: boolean; // Create overview and getting started topics
  optimizeForMobile?: boolean; // Optimize content for mobile viewing
  includeMetadata?: boolean; // Include topic metadata and labels
}

export interface VariableExtractionOptions {
  extractVariables?: boolean; // Extract variables to separate file instead of flattening
  variablesOutputPath?: string; // Custom path for variables file
  variableFormat?: 'adoc' | 'writerside'; // Format for variables file
  preserveVariableStructure?: boolean; // Keep namespace/grouping structure
  skipFileGeneration?: boolean; // Skip generating variables file (for batch processing)
  
  // New variable handling options
  variableMode?: 'flatten' | 'include' | 'reference'; // How to handle variables in content
  nameConvention?: 'camelCase' | 'snake_case' | 'kebab-case' | 'original'; // Variable naming convention
  instanceName?: string; // Instance name for Writerside conditional variables
  variablePrefix?: string; // Prefix for variable names to avoid conflicts
  includePatterns?: string[]; // Filter variables by name patterns (regex)
  excludePatterns?: string[]; // Exclude variables by name patterns (regex)
  flvarFiles?: string[]; // Explicit list of FLVAR files to process
  autoDiscoverFLVAR?: boolean; // Automatically find FLVAR files in project (default: true)
}

export interface ZendeskConversionOptions {
  sectionId?: string;
  locale?: string;
  userSegmentId?: string;
  permissionGroupId?: string;
  generateTags?: boolean; // AI-based content tagging
  maxTags?: number; // Default 10 (Zendesk limit)
  sanitizeHtml?: boolean; // Remove unsafe HTML tags
  ignoreVideos?: boolean; // Skip video processing
  inlineStyles?: boolean; // Apply inline CSS styles (default: true)
  generateStylesheet?: boolean; // Generate separate CSS file (default: false)
  cssOutputPath?: string; // Path for CSS file when generateStylesheet is true
}

export interface ConversionResult {
  content: string;
  stylesheet?: string; // Generated CSS content when generateStylesheet is true
  variablesFile?: string; // Generated variables file content when extractVariables is true
  glossaryContent?: string; // Generated glossary content when glossary generation is enabled
  metadata?: {
    title?: string;
    wordCount: number;
    images?: string[];
    warnings?: string[];
    variables?: ExtractedVariable[]; // Variables found during conversion
    zendeskMetadata?: ZendeskArticleMetadata;
    brokenLinks?: any[]; // Link validation results if validation was performed
    format?: string;
    processingTime?: number; // Processing time in milliseconds (from PerformanceOptimizer)
    memoryUsage?: number; // Memory usage in MB (from PerformanceOptimizer)
  };
}

export interface ExtractedVariable {
  name: string; // Full variable name (e.g., "General.ProductName")
  value: string; // Resolved or fallback value
  namespace?: string; // Variable set namespace (e.g., "General")
  key: string; // Variable key (e.g., "ProductName")
  source: 'madcap' | 'fallback'; // Whether value came from MadCap or fallback
}

export interface ZendeskArticleMetadata {
  title: string;
  body: string;
  locale: string;
  sectionId?: string;
  userSegmentId?: string;
  permissionGroupId?: string;
  contentTagIds?: string[];
  suggestedTags?: string[];
  draft: boolean;
}

export interface DocumentConverter {
  convert(input: string | Buffer, options: ConversionOptions): Promise<ConversionResult>;
  supportedInputTypes: string[];
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
  
  // Writerside-specific batch options
  writersideOptions?: WritersideConversionOptions;
}

// New types for condition analysis and selection
export interface ConditionAnalysisResult {
  conditions: string[];
  fileCount: number;
  conditionUsage: Record<string, number>; // condition -> count of files using it
  filesByCondition: Record<string, string[]>; // condition -> array of file paths
}

export interface ConditionInfo {
  condition: string;
  usage: number;
  category: 'status' | 'color' | 'print' | 'development' | 'visibility' | 'custom';
  isDeprecated?: boolean;
  description?: string;
}

// Re-export new types with correct names for backward compatibility
export type AsciidocOptions = AsciiDocConversionOptions;
export type VariableOptions = VariableExtractionOptions;
export type ZendeskOptions = ZendeskConversionOptions;
export type WritersideOptions = WritersideConversionOptions;
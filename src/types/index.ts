export interface ConversionOptions {
  format: 'markdown' | 'asciidoc' | 'zendesk';
  inputType: 'html' | 'word' | 'madcap';
  preserveFormatting?: boolean; // Always defaults to true - formatting is always preserved
  extractImages?: boolean;
  outputDir?: string;
  outputPath?: string;
  rewriteLinks?: boolean;
  inputPath?: string; // Source file path for snippet resolution
  zendeskOptions?: ZendeskConversionOptions;
  variableOptions?: VariableExtractionOptions;
  asciidocOptions?: AsciiDocConversionOptions;
  validateLinks?: boolean;
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
}

export interface VariableExtractionOptions {
  extractVariables?: boolean; // Extract variables to separate file instead of flattening
  variablesOutputPath?: string; // Custom path for variables file
  variableFormat?: 'adoc' | 'writerside'; // Format for variables file
  preserveVariableStructure?: boolean; // Keep namespace/grouping structure
  skipFileGeneration?: boolean; // Skip generating variables file (for batch processing)
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
  metadata?: {
    title?: string;
    wordCount: number;
    images?: string[];
    warnings?: string[];
    variables?: ExtractedVariable[]; // Variables found during conversion
    zendeskMetadata?: ZendeskArticleMetadata;
    brokenLinks?: any[]; // Link validation results if validation was performed
    format?: string;
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
}

// Re-export new types with correct names for backward compatibility
export type AsciidocOptions = AsciiDocConversionOptions;
export type VariableOptions = VariableExtractionOptions;
export type ZendeskOptions = ZendeskConversionOptions;
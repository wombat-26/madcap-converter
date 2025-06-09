export interface ConversionOptions {
  format: 'markdown' | 'asciidoc' | 'zendesk';
  inputType: 'html' | 'word' | 'madcap';
  preserveFormatting?: boolean;
  extractImages?: boolean;
  outputDir?: string;
  rewriteLinks?: boolean;
  inputPath?: string; // Source file path for snippet resolution
  zendeskOptions?: ZendeskConversionOptions;
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
  metadata?: {
    title?: string;
    wordCount: number;
    images?: string[];
    warnings?: string[];
    zendeskMetadata?: ZendeskArticleMetadata;
  };
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
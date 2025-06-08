export interface ConversionOptions {
  format: 'markdown' | 'asciidoc';
  inputType: 'html' | 'word' | 'madcap';
  preserveFormatting?: boolean;
  extractImages?: boolean;
  outputDir?: string;
  rewriteLinks?: boolean;
  inputPath?: string; // Source file path for snippet resolution
}

export interface ConversionResult {
  content: string;
  metadata?: {
    title?: string;
    wordCount: number;
    images?: string[];
    warnings?: string[];
  };
}

export interface DocumentConverter {
  convert(input: string | Buffer, options: ConversionOptions): Promise<ConversionResult>;
  supportedInputTypes: string[];
}
import { readFile, writeFile, mkdir } from 'fs/promises';
import { extname, dirname, basename, join } from 'path';
import { HTMLConverter, WordConverter, MadCapConverter, ZendeskConverter, AsciiDocConverter } from './converters/index.js';
import { ConversionOptions, ConversionResult, DocumentConverter } from './types/index.js';
import { errorHandler } from './services/error-handler.js';
import { InputValidator } from './services/input-validator.js';
import { LinkValidator } from './services/link-validator.js';

export class DocumentService {
  private converters: Map<string, DocumentConverter>;

  constructor() {
    this.converters = new Map<string, DocumentConverter>([
      ['html', new HTMLConverter()],
      ['htm', new HTMLConverter()],
      ['docx', new WordConverter()],
      ['doc', new WordConverter()],
      ['madcap', new MadCapConverter()],
      ['xml', new MadCapConverter()],
      ['zendesk', new ZendeskConverter()]
    ]);
  }

  async convertFile(inputPath: string, options: Partial<ConversionOptions>): Promise<ConversionResult>;
  async convertFile(inputPath: string, outputPath: string, options?: Partial<ConversionOptions>): Promise<ConversionResult>;
  async convertFile(inputPath: string, outputPathOrOptions: string | Partial<ConversionOptions>, options?: Partial<ConversionOptions>): Promise<ConversionResult> {
    let outputPath: string | undefined;
    let actualOptions: Partial<ConversionOptions>;

    if (typeof outputPathOrOptions === 'string') {
      outputPath = outputPathOrOptions;
      actualOptions = options || {};
    } else {
      actualOptions = outputPathOrOptions;
      outputPath = actualOptions.outputPath;
    }

    // Validate inputs
    const inputValidation = await InputValidator.validateFilePath(inputPath, 'read', 'input');
    if (!inputValidation.isValid) {
      throw new Error(`Invalid input file: ${inputValidation.errors.join('; ')}`);
    }

    if (outputPath) {
      const outputValidation = await InputValidator.validateFilePath(outputPath, 'write');
      if (!outputValidation.isValid) {
        throw new Error(`Invalid output path: ${outputValidation.errors.join('; ')}`);
      }
    }

    const optionsValidation = await InputValidator.validateConversionOptions({
      format: actualOptions.format || 'markdown',
      ...actualOptions
    } as ConversionOptions);
    
    if (!optionsValidation.isValid) {
      throw new Error(`Invalid conversion options: ${optionsValidation.errors.join('; ')}`);
    }

    // Use sanitized options if available
    if (optionsValidation.sanitizedOptions) {
      actualOptions = { ...actualOptions, ...optionsValidation.sanitizedOptions };
    }

    const extension = extname(inputPath).toLowerCase().slice(1);
    
    // Determine input type first to handle special cases like .flsnp
    let inputType = this.determineInputType(extension);
    
    // Map extension to appropriate converter
    let converterKey = extension;
    if (extension === 'flsnp') {
      converterKey = 'xml'; // Use XML/MadCap converter for snippet files
    }
    
    let converter = this.converters.get(converterKey);

    if (!converter) {
      const supportedTypes = Array.from(this.converters.keys());
      supportedTypes.push('flsnp'); // Add flsnp to supported types list
      throw new Error(`Unsupported file type: ${extension}. Supported types: ${supportedTypes.join(', ')}`);
    }
    const format = actualOptions.format || 'markdown';

    let input: string | Buffer;
    
    if (extension === 'docx' || extension === 'doc') {
      input = await errorHandler.safeReadFile(inputPath, 'binary') as any;
    } else {
      input = await errorHandler.safeReadFile(inputPath, 'utf8');
      
      // Check if HTML/HTM files contain MadCap content or if target is Zendesk
      if ((extension === 'html' || extension === 'htm') && typeof input === 'string') {
        if (format === 'zendesk') {
          // Use Zendesk converter for Zendesk format
          converter = this.converters.get('zendesk')!;
          if (this.containsMadCapContent(input)) {
            inputType = 'madcap';
          }
        } else if (this.containsMadCapContent(input)) {
          inputType = 'madcap';
          converter = this.converters.get('xml')!; // Use MadCap converter
          // MadCap content detected, routing to MadCapConverter
        }
      }
    }

    const conversionOptions: ConversionOptions = {
      format,
      inputType,
      preserveFormatting: actualOptions.preserveFormatting ?? true,
      extractImages: actualOptions.extractImages ?? false,
      outputDir: actualOptions.outputDir || (outputPath ? dirname(outputPath) : undefined),
      outputPath,
      rewriteLinks: actualOptions.rewriteLinks,
      inputPath: inputPath,
      variableOptions: actualOptions.variableOptions,
      zendeskOptions: actualOptions.zendeskOptions,
      asciidocOptions: actualOptions.asciidocOptions
    };

    // Override converter based on output format  
    if (format === 'asciidoc' && inputType === 'html') {
      // Only use AsciiDocConverter directly for pure HTML content
      // MadCap content should go through MadCapConverter for proper preprocessing
      converter = new AsciiDocConverter();
    }
    
    const result = await converter.convert(input, conversionOptions);

    if (outputPath) {
      await errorHandler.safeCreateDirectory(dirname(outputPath));
      await errorHandler.safeWriteFile(outputPath, result.content, 'utf8');
      
      // Write variables file if it was generated (skip if batch processing)
      if (result.variablesFile && actualOptions.variableOptions?.extractVariables && 
          !actualOptions.variableOptions?.skipFileGeneration) {
        const variablesPath = actualOptions.variableOptions.variablesOutputPath || 
                             this.getDefaultVariablesPath(outputPath, actualOptions.variableOptions.variableFormat);
        await errorHandler.safeWriteFile(variablesPath, result.variablesFile, 'utf8');
      }

      // Validate links in converted content if requested
      if (actualOptions.validateLinks !== false) {
        try {
          const linkValidator = new LinkValidator(dirname(outputPath), actualOptions.format || 'markdown');
          const validation = await linkValidator.validateFile(outputPath);
          
          // Add link validation results to metadata
          const brokenLinks = validation.filter(v => !v.isValid);
          if (brokenLinks.length > 0) {
            if (!result.metadata) {
              result.metadata = { wordCount: 0 };
            }
            result.metadata.warnings = result.metadata.warnings || [];
            result.metadata.warnings.push(`Found ${brokenLinks.length} broken links`);
            result.metadata.brokenLinks = brokenLinks;
          }
        } catch (linkError) {
          console.warn('Link validation failed:', linkError);
        }
      }
    }

    return result;
  }

  async convertString(content: string, options: ConversionOptions): Promise<ConversionResult> {
    // Validate input content
    const contentValidation = InputValidator.validateInputContent(content, options.inputType);
    if (!contentValidation.isValid) {
      throw new Error(`Invalid input content: ${contentValidation.errors.join('; ')}`);
    }

    // Validate options
    const optionsValidation = await InputValidator.validateConversionOptions(options);
    if (!optionsValidation.isValid) {
      throw new Error(`Invalid conversion options: ${optionsValidation.errors.join('; ')}`);
    }

    let converter = this.getConverterForInputType(options.inputType);
    
    // Override converter selection for specific formats
    if (options.format === 'zendesk') {
      converter = this.converters.get('zendesk')!;
    } else if (options.format === 'asciidoc' && options.inputType === 'html') {
      // Only use AsciiDocConverter directly for pure HTML content
      // MadCap content should go through MadCapConverter for proper preprocessing
      converter = new AsciiDocConverter();
    }
    
    return await converter.convert(content, options);
  }

  async convertBuffer(buffer: Buffer, options: ConversionOptions): Promise<ConversionResult> {
    let converter = this.getConverterForInputType(options.inputType);
    
    // Override converter selection for specific formats
    if (options.format === 'zendesk') {
      converter = this.converters.get('zendesk')!;
    } else if (options.format === 'asciidoc' && options.inputType === 'html') {
      // Only use AsciiDocConverter directly for pure HTML content
      // MadCap content should go through MadCapConverter for proper preprocessing
      converter = new AsciiDocConverter();
    }
    
    return await converter.convert(buffer, options);
  }

  getSupportedFormats(): string[] {
    return Array.from(this.converters.keys());
  }

  private determineInputType(extension: string): 'html' | 'word' | 'madcap' {
    switch (extension) {
      case 'html':
      case 'htm':
        return 'html';
      case 'docx':
      case 'doc':
        return 'word';
      case 'xml':
      case 'flsnp': // MadCap snippet files
        return 'madcap';
      default:
        return 'html';
    }
  }

  private getConverterForInputType(inputType: string): DocumentConverter {
    switch (inputType) {
      case 'html':
        return this.converters.get('html')!;
      case 'word':
        return this.converters.get('docx')!;
      case 'madcap':
        return this.converters.get('xml')!;
      default:
        throw new Error(`Unsupported input type: ${inputType}`);
    }
  }

  private containsMadCapContent(html: string): boolean {
    return html.includes('MadCap:') || 
           html.includes('madcap:') || 
           html.includes('xmlns:MadCap') ||
           html.includes('data-mc-') ||
           html.includes('mc-variable') ||
           html.includes('mc-');
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private getDefaultVariablesPath(outputPath: string, format?: 'adoc' | 'writerside'): string {
    const dir = dirname(outputPath);
    
    switch (format) {
      case 'adoc':
        // Use includes directory for AsciiDoc variables following best practices
        return join(dir, 'includes', 'variables.adoc');
      case 'writerside':
        return join(dir, 'variables.xml');
      default:
        return join(dir, 'variables.txt');
    }
  }
}
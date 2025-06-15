import { readFile, writeFile, mkdir } from 'fs/promises';
import { extname, dirname, basename, join } from 'path';
import { HTMLConverter, WordConverter, MadCapConverter, ZendeskConverter } from './converters/index.js';
import { ConversionOptions, ConversionResult, DocumentConverter } from './types/index.js';

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
      input = await readFile(inputPath);
    } else {
      input = await readFile(inputPath, 'utf8');
      
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

    const result = await converter.convert(input, conversionOptions);

    if (outputPath) {
      await this.ensureDirectoryExists(dirname(outputPath));
      await writeFile(outputPath, result.content, 'utf8');
      
      // Write variables file if it was generated
      if (result.variablesFile && actualOptions.variableOptions?.extractVariables) {
        const variablesPath = actualOptions.variableOptions.variablesOutputPath || 
                             this.getDefaultVariablesPath(outputPath, actualOptions.variableOptions.variableFormat);
        await writeFile(variablesPath, result.variablesFile, 'utf8');
      }
    }

    return result;
  }

  async convertString(content: string, options: ConversionOptions): Promise<ConversionResult> {
    let converter = this.getConverterForInputType(options.inputType);
    
    // Override converter selection for Zendesk format
    if (options.format === 'zendesk') {
      converter = this.converters.get('zendesk')!;
    }
    
    return await converter.convert(content, options);
  }

  async convertBuffer(buffer: Buffer, options: ConversionOptions): Promise<ConversionResult> {
    let converter = this.getConverterForInputType(options.inputType);
    
    // Override converter selection for Zendesk format
    if (options.format === 'zendesk') {
      converter = this.converters.get('zendesk')!;
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
        return join(dir, 'variables.adoc');
      case 'writerside':
        return join(dir, 'variables.xml');
      default:
        return join(dir, 'variables.txt');
    }
  }
}
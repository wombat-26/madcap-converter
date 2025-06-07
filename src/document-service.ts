import { readFile, writeFile, mkdir } from 'fs/promises';
import { extname, dirname, basename } from 'path';
import { HTMLConverter, WordConverter, MadCapConverter } from './converters/index.js';
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
      ['xml', new MadCapConverter()]
    ]);
  }

  async convertFile(inputPath: string, outputPath: string, options: Partial<ConversionOptions> = {}): Promise<ConversionResult> {
    const extension = extname(inputPath).toLowerCase().slice(1);
    const converter = this.converters.get(extension);

    if (!converter) {
      throw new Error(`Unsupported file type: ${extension}. Supported types: ${Array.from(this.converters.keys()).join(', ')}`);
    }

    const inputType = this.determineInputType(extension);
    const format = options.format || 'markdown';

    const conversionOptions: ConversionOptions = {
      format,
      inputType,
      preserveFormatting: options.preserveFormatting ?? true,
      extractImages: options.extractImages ?? false,
      outputDir: options.outputDir || dirname(outputPath),
      rewriteLinks: options.rewriteLinks
    };

    let input: string | Buffer;
    
    if (extension === 'docx' || extension === 'doc') {
      input = await readFile(inputPath);
    } else {
      input = await readFile(inputPath, 'utf8');
    }

    const result = await converter.convert(input, conversionOptions);

    await this.ensureDirectoryExists(dirname(outputPath));
    await writeFile(outputPath, result.content, 'utf8');

    return result;
  }

  async convertString(content: string, options: ConversionOptions): Promise<ConversionResult> {
    const converter = this.getConverterForInputType(options.inputType);
    return await converter.convert(content, options);
  }

  async convertBuffer(buffer: Buffer, options: ConversionOptions): Promise<ConversionResult> {
    const converter = this.getConverterForInputType(options.inputType);
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

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }
}
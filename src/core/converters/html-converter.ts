import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index';

export class HTMLConverter implements DocumentConverter {
  supportedInputTypes = ['html'];

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    // Basic HTML converter - just returns the input as-is
    return {
      content: input,
      metadata: {
        wordCount: input.split(/\s+/).length,
        format: 'html'
      }
    };
  }
}
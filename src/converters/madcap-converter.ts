import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index.js';
import { HTMLConverter } from './html-converter.js';
import { MadCapPreprocessor } from '../services/madcap-preprocessor.js';

export class MadCapConverter implements DocumentConverter {
  supportedInputTypes = ['html', 'htm', 'xml'];
  private htmlConverter: HTMLConverter;
  private madcapPreprocessor: MadCapPreprocessor;

  constructor() {
    this.htmlConverter = new HTMLConverter();
    this.madcapPreprocessor = new MadCapPreprocessor();
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    // Check if content should be skipped due to MadCap conditions
    if (this.madcapPreprocessor.shouldSkipContent(input)) {
      throw new Error('Content contains MadCap conditions that should not be converted (Black, Red, Gray, deprecated, paused, halted, discontinued, print-only, etc.)');
    }
    
    // Use shared MadCap preprocessing
    const processedHtml = await this.madcapPreprocessor.preprocessMadCapContent(input, options.inputPath);
    
    // Additional processing for standard HTML conversion
    const dom = new JSDOM(processedHtml, { contentType: 'text/html' });
    const document = dom.window.document;
    
    // Apply MadCap element conversion for HTML output
    this.madcapPreprocessor.processMadCapElementsForHTML(document);
    
    const finalHtml = document.documentElement.outerHTML;
    
    // Pass through all options including rewriteLinks
    const result = await this.htmlConverter.convert(finalHtml, options);
    
    return {
      content: result.content,
      metadata: {
        title: result.metadata?.title,
        wordCount: result.metadata?.wordCount || 0,
        images: result.metadata?.images,
        warnings: this.getMadCapWarnings(input)
      }
    };
  }

  private getMadCapWarnings(input: string): string[] {
    const warnings: string[] = [];
    
    if (input.includes('data-mc-conditions')) {
      warnings.push('Original content contains conditional text that may need manual review');
    }
    
    if (input.includes('data-mc-snippet') || input.includes('MadCap:snippetBlock')) {
      warnings.push('Original content contains snippets - verify all content was included');
    }
    
    if (input.includes('mc-variable') || input.includes('MadCap:variable')) {
      warnings.push('Original content contains variables - verify proper substitution');
    }
    
    if (input.includes('MadCap:dropDown')) {
      warnings.push('MadCap dropdowns converted to sections - verify structure is acceptable');
    }
    
    return warnings;
  }

  // Public method for batch service to check if file should be skipped
  public static shouldSkipFile(content: string): boolean {
    return MadCapPreprocessor.shouldSkipFile(content);
  }
}
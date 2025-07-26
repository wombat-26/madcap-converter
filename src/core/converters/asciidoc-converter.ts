import { JSDOM } from 'jsdom';
import { dirname, basename, relative } from 'path';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index';
import { MadCapPreprocessor } from '../services/madcap-preprocessor';
import { HTMLPreprocessor } from '../services/html-preprocessor';
import { TextProcessor } from './text-processor';
import { ImprovedListProcessor } from './improved-list-processor';

export class AsciiDocConverter implements DocumentConverter {
  supportedInputTypes = ['html'];
  private madCapPreprocessor: MadCapPreprocessor;
  private htmlPreprocessor: HTMLPreprocessor;
  private textProcessor: TextProcessor;
  private listProcessor: ImprovedListProcessor;

  constructor() {
    this.madCapPreprocessor = new MadCapPreprocessor();
    this.htmlPreprocessor = new HTMLPreprocessor();
    this.textProcessor = new TextProcessor();
    this.listProcessor = new ImprovedListProcessor();
  }

  // Method needed by MadCapConverter for compatibility
  getVariableExtractor(): any {
    return null; // Simplified version doesn't have variable extraction
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    try {
      // Basic preprocessing
      let processedInput = await this.madCapPreprocessor.preprocessMadCapContent(input, options.inputPath);
      processedInput = await this.htmlPreprocessor.preprocess(processedInput);

      // Convert to AsciiDoc
      const content = this.convertToAsciiDoc(processedInput, options);

      return {
        content,
        metadata: {
          wordCount: content.split(/\s+/).length,
          format: 'asciidoc'
        }
      };
    } catch (error) {
      throw new Error(`AsciiDoc conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private convertToAsciiDoc(html: string, options: ConversionOptions): string {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Basic conversion logic
    let result = '';
    
    // Add document header
    result += '= Document Title\n';
    result += ':toc:\n';
    result += ':icons: font\n';
    result += ':experimental:\n';
    result += ':source-highlighter: highlight.js\n\n';

    // Process body content
    const body = document.querySelector('body');
    if (body) {
      result += this.processElement(body, options);
    }

    return result;
  }

  private processElement(element: Element, options: ConversionOptions): string {
    let result = '';
    
    for (const child of Array.from(element.children)) {
      const tagName = child.tagName?.toLowerCase();
      
      switch (tagName) {
        case 'h1':
          result += `= ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'h2':
          result += `== ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'h3':
          result += `=== ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'h4':
          result += `==== ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'h5':
          result += `===== ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'h6':
          result += `====== ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'p':
          const text = child.textContent?.trim();
          if (text) {
            result += `${text}\n\n`;
          }
          break;
        case 'ul':
        case 'ol':
          result += this.listProcessor.convertList(child, 0, undefined, undefined, 'asciidoc');
          result += '\n';
          break;
        case 'code':
          result += `\`${child.textContent?.trim() || ''}\``;
          break;
        case 'pre':
          result += `\n----\n${child.textContent?.trim() || ''}\n----\n\n`;
          break;
        case 'strong':
        case 'b':
          result += `*${child.textContent?.trim() || ''}*`;
          break;
        case 'em':
        case 'i':
          result += `_${child.textContent?.trim() || ''}_`;
          break;
        case 'img':
          const src = child.getAttribute('src');
          const alt = child.getAttribute('alt') || '';
          if (src) {
            result += `image::${src}[${alt}]\n\n`;
          }
          break;
        case 'a':
          const href = child.getAttribute('href');
          const linkText = child.textContent?.trim() || href || '';
          if (href) {
            result += `${href}[${linkText}]`;
          } else {
            result += linkText;
          }
          break;
        case 'div':
        case 'section':
          result += this.processElement(child, options);
          break;
        default:
          // For other elements, process their children
          result += this.processElement(child, options);
          break;
      }
    }
    
    return result;
  }
}
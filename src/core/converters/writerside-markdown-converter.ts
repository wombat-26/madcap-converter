import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index';
import { MadCapPreprocessor } from '../services/madcap-preprocessor';
import { HTMLPreprocessor } from '../services/html-preprocessor';

export default class WritersideMarkdownConverter implements DocumentConverter {
  supportedInputTypes = ['html'];
  private madCapPreprocessor: MadCapPreprocessor;
  private htmlPreprocessor: HTMLPreprocessor;

  constructor() {
    this.madCapPreprocessor = new MadCapPreprocessor();
    this.htmlPreprocessor = new HTMLPreprocessor();
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    try {
      // Basic preprocessing
      let processedInput = await this.madCapPreprocessor.preprocessMadCapContent(input, options.inputPath);
      processedInput = await this.htmlPreprocessor.preprocess(processedInput);

      // Convert to Markdown
      const content = this.convertToMarkdown(processedInput, options);

      return {
        content,
        metadata: {
          wordCount: content.split(/\s+/).length,
          format: 'markdown'
        }
      };
    } catch (error) {
      throw new Error(`Writerside Markdown conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private convertToMarkdown(html: string, options: ConversionOptions): string {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Basic conversion logic
    let result = '';

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
          result += `# ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'h2':
          result += `## ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'h3':
          result += `### ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'h4':
          result += `#### ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'h5':
          result += `##### ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'h6':
          result += `###### ${child.textContent?.trim() || ''}\n\n`;
          break;
        case 'p':
          const text = child.textContent?.trim();
          if (text) {
            result += `${text}\n\n`;
          }
          break;
        case 'ul':
          result += this.processListElement(child, '- ');
          result += '\n';
          break;
        case 'ol':
          result += this.processListElement(child, '1. ');
          result += '\n';
          break;
        case 'code':
          result += `\`${child.textContent?.trim() || ''}\``;
          break;
        case 'pre':
          result += `\n\`\`\`\n${child.textContent?.trim() || ''}\n\`\`\`\n\n`;
          break;
        case 'strong':
        case 'b':
          result += `**${child.textContent?.trim() || ''}**`;
          break;
        case 'em':
        case 'i':
          result += `*${child.textContent?.trim() || ''}*`;
          break;
        case 'img':
          const src = child.getAttribute('src');
          const alt = child.getAttribute('alt') || '';
          if (src) {
            result += `![${alt}](${src})\n\n`;
          }
          break;
        case 'a':
          const href = child.getAttribute('href');
          const linkText = child.textContent?.trim() || href || '';
          if (href) {
            result += `[${linkText}](${href})`;
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

  private processListElement(listElement: Element, prefix: string): string {
    let result = '';
    const items = Array.from(listElement.querySelectorAll(':scope > li'));
    
    items.forEach((item, index) => {
      const text = item.textContent?.trim() || '';
      if (prefix.includes('1.')) {
        result += `${index + 1}. ${text}\n`;
      } else {
        result += `${prefix}${text}\n`;
      }
    });
    
    return result;
  }
}
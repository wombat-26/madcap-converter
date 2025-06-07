import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index.js';

export class HTMLConverter implements DocumentConverter {
  supportedInputTypes = ['html'];
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full'
    });

    this.turndownService.addRule('removeComments', {
      filter: (node: any) => node.nodeType === 8,
      replacement: () => ''
    });
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    const dom = new JSDOM(input);
    const document = dom.window.document;
    
    const title = document.querySelector('title')?.textContent || 
                  document.querySelector('h1')?.textContent || 
                  'Untitled Document';

    const images: string[] = [];
    if (options.extractImages) {
      const imgElements = document.querySelectorAll('img');
      imgElements.forEach(img => {
        const src = img.getAttribute('src');
        if (src) images.push(src);
      });
    }

    let content: string;
    
    if (options.format === 'markdown') {
      content = this.turndownService.turndown(input);
    } else {
      content = this.convertToAsciiDoc(document);
    }

    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

    return {
      content,
      metadata: {
        title,
        wordCount,
        images: images.length > 0 ? images : undefined
      }
    };
  }

  private convertToAsciiDoc(document: Document): string {
    const body = document.body || document.documentElement;
    return this.nodeToAsciiDoc(body);
  }

  private nodeToAsciiDoc(node: Node): string {
    if (node.nodeType === 3) {
      return node.textContent || '';
    }

    if (node.nodeType !== 1) return '';

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    const children = Array.from(element.childNodes)
      .map(child => this.nodeToAsciiDoc(child))
      .join('');

    switch (tagName) {
      case 'h1': return `= ${children}\n\n`;
      case 'h2': return `== ${children}\n\n`;
      case 'h3': return `=== ${children}\n\n`;
      case 'h4': return `==== ${children}\n\n`;
      case 'h5': return `===== ${children}\n\n`;
      case 'h6': return `====== ${children}\n\n`;
      case 'p': return `${children}\n\n`;
      case 'strong': 
      case 'b': return `*${children}*`;
      case 'em': 
      case 'i': return `_${children}_`;
      case 'code': return `\`${children}\``;
      case 'pre': return `[source]\n----\n${children}\n----\n\n`;
      case 'a': {
        const href = element.getAttribute('href');
        return href ? `link:${href}[${children}]` : children;
      }
      case 'img': {
        const src = element.getAttribute('src');
        const alt = element.getAttribute('alt') || '';
        return src ? `image::${src}[${alt}]\n\n` : '';
      }
      case 'ul': return `${children}\n`;
      case 'ol': return `${children}\n`;
      case 'li': return `. ${children}\n`;
      case 'blockquote': return `____\n${children}\n____\n\n`;
      case 'hr': return `'''\n\n`;
      case 'br': return ' +\n';
      case 'div':
      case 'span':
      case 'body':
      case 'html': return children;
      default: return children;
    }
  }
}
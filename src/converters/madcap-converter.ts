import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index.js';
import { HTMLConverter } from './html-converter.js';

export class MadCapConverter implements DocumentConverter {
  supportedInputTypes = ['html', 'htm', 'xml'];
  private htmlConverter: HTMLConverter;

  constructor() {
    this.htmlConverter = new HTMLConverter();
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    const processedHtml = this.preprocessMadCapContent(input);
    
    const result = await this.htmlConverter.convert(processedHtml, options);
    
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

  private preprocessMadCapContent(html: string): string {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    this.convertMadCapElements(document);
    this.processConditionalText(document);
    this.convertCrossReferences(document);
    this.convertSnippets(document);
    this.convertVariables(document);

    return document.documentElement.outerHTML;
  }

  private convertMadCapElements(document: Document): void {
    const madcapElements = document.querySelectorAll('[class*="mc-"], [class*="MC"]');
    
    madcapElements.forEach(element => {
      const className = element.className;
      
      if (className.includes('mc-heading') || className.includes('MC-heading')) {
        const level = this.extractHeadingLevel(className) || 1;
        const newElement = document.createElement(`h${level}`);
        newElement.innerHTML = element.innerHTML;
        element.parentNode?.replaceChild(newElement, element);
      }
      
      else if (className.includes('mc-procedure') || className.includes('MC-procedure')) {
        const div = document.createElement('div');
        div.setAttribute('data-type', 'procedure');
        div.innerHTML = element.innerHTML;
        element.parentNode?.replaceChild(div, element);
      }
      
      else if (className.includes('mc-note') || className.includes('MC-note')) {
        const blockquote = document.createElement('blockquote');
        blockquote.innerHTML = `<strong>Note:</strong> ${element.innerHTML}`;
        element.parentNode?.replaceChild(blockquote, element);
      }
      
      else if (className.includes('mc-warning') || className.includes('MC-warning')) {
        const blockquote = document.createElement('blockquote');
        blockquote.innerHTML = `<strong>Warning:</strong> ${element.innerHTML}`;
        element.parentNode?.replaceChild(blockquote, element);
      }
    });
  }

  private processConditionalText(document: Document): void {
    const conditionalElements = document.querySelectorAll('[data-mc-conditions]');
    
    conditionalElements.forEach(element => {
      const conditions = element.getAttribute('data-mc-conditions');
      if (conditions) {
        const comment = document.createComment(`Conditional: ${conditions}`);
        element.parentNode?.insertBefore(comment, element);
      }
    });
  }

  private convertCrossReferences(document: Document): void {
    const xrefElements = document.querySelectorAll('a[href^="#"], a[data-mc-xref]');
    
    xrefElements.forEach(element => {
      const href = element.getAttribute('href') || element.getAttribute('data-mc-xref');
      if (href) {
        element.setAttribute('href', href);
        if (!element.textContent?.trim()) {
          element.textContent = `See ${href}`;
        }
      }
    });
  }

  private convertSnippets(document: Document): void {
    const snippetElements = document.querySelectorAll('[data-mc-snippet]');
    
    snippetElements.forEach(element => {
      const snippetPath = element.getAttribute('data-mc-snippet');
      const div = document.createElement('div');
      div.innerHTML = `<!-- Snippet: ${snippetPath} -->\n${element.innerHTML}`;
      element.parentNode?.replaceChild(div, element);
    });
  }

  private convertVariables(document: Document): void {
    const variableElements = document.querySelectorAll('span[data-mc-variable], [class*="mc-variable"]');
    
    variableElements.forEach(element => {
      const variableName = element.getAttribute('data-mc-variable') || 
                          element.className.match(/mc-variable\.(\w+)/)?.[1];
      
      if (variableName) {
        const span = document.createElement('span');
        span.textContent = element.textContent || `{${variableName}}`;
        span.setAttribute('data-variable', variableName);
        element.parentNode?.replaceChild(span, element);
      }
    });
  }

  private extractHeadingLevel(className: string): number | null {
    const match = className.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  private getMadCapWarnings(html: string): string[] | undefined {
    const warnings: string[] = [];
    
    if (html.includes('data-mc-conditions')) {
      warnings.push('Document contains conditional text that may need manual review');
    }
    
    if (html.includes('data-mc-snippet')) {
      warnings.push('Document contains snippets that may need to be manually included');
    }
    
    if (html.includes('data-mc-variable') || html.includes('mc-variable')) {
      warnings.push('Document contains variables that may need manual substitution');
    }
    
    if (html.includes('mc-expanding-head') || html.includes('MC-expanding-head')) {
      warnings.push('Document contains expanding sections that have been converted to static content');
    }
    
    return warnings.length > 0 ? warnings : undefined;
  }
}
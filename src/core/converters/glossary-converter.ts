import * as cheerio from 'cheerio';
import { GlossaryEntry } from '../services/flglo-parser';

type CheerioElement = any;

export type GlossaryFormat = 'separate' | 'book-appendix' | 'inline';

export interface GlossaryConversionOptions {
  format: GlossaryFormat;
  generateAnchors?: boolean;
  includeIndex?: boolean;
  title?: string;
  levelOffset?: number; // For adjusting heading levels in book mode
}

export class GlossaryConverter {
  private htmlToAsciiDoc(html: string): string {
    const $ = cheerio.load(html);
    let result = '';

    // Convert paragraphs
    $('p').each((_, elem) => {
      const $elem = $(elem);
      const text = this.processInlineElements($elem);
      $elem.replaceWith(text + '\n\n');
    });

    // Convert lists
    $('ul').each((_, elem) => {
      const $elem = $(elem);
      let listContent = '\n';
      $elem.find('> li').each((_, li) => {
        const $li = $(li);
        const text = this.processInlineElements($li);
        listContent += `* ${text}\n`;
      });
      $elem.replaceWith(listContent + '\n');
    });

    $('ol').each((_, elem) => {
      const $elem = $(elem);
      let listContent = '\n';
      $elem.find('> li').each((index, li) => {
        const $li = $(li);
        const text = this.processInlineElements($li);
        listContent += `. ${text}\n`;
      });
      $elem.replaceWith(listContent + '\n');
    });

    result = $.text().trim();
    
    // Clean up excessive newlines
    result = result.replace(/\n{3,}/g, '\n\n');
    
    return result;
  }

  private processInlineElements($elem: cheerio.Cheerio<CheerioElement>): string {
    // Use proper DOM processing instead of regex for better spacing control
    const tempDiv = cheerio.load('<div></div>')('div');
    tempDiv.html($elem.html() || '');
    
    return this.processInlineContent(tempDiv[0]);
  }
  
  /**
   * Process inline content with proper spacing (similar to main AsciiDoc converter)
   */
  private processInlineContent(element: any): string {
    let result = '';
    const childNodes = Array.from(element.childNodes || []) as any[];
    
    for (let i = 0; i < childNodes.length; i++) {
      const child = childNodes[i];
      
      if (child.nodeType === 3) { // Text node
        const text = child.textContent || '';
        result += text;
      } else if (child.nodeType === 1) { // Element node
        const elementResult = this.convertInlineElement(child);
        
        if (elementResult) {
          // Add space before if needed
          if (this.shouldAddSpaceBefore(result, elementResult)) {
            result += ' ';
          }
          
          result += elementResult;
          
          // Add space after if needed
          const nextSibling = childNodes[i + 1];
          if (nextSibling && this.shouldAddSpaceAfter(elementResult, nextSibling)) {
            result += ' ';
          }
        }
      }
    }
    
    // Clean up excessive whitespace while preserving necessary spacing
    return result.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }
  
  private convertInlineElement(element: any): string {
    const tagName = element.tagName?.toLowerCase();
    const textContent = this.getTextContent(element);
    
    switch (tagName) {
      case 'strong':
      case 'b':
        return `*${textContent}*`;
      case 'em':
      case 'i':
        return `_${textContent}_`;
      case 'code':
        return `\`${textContent}\``;
      default:
        return textContent;
    }
  }
  
  private getTextContent(element: any): string {
    if (element.childNodes && element.childNodes.length > 0) {
      return this.processInlineContent(element);
    }
    return element.textContent || '';
  }
  
  private shouldAddSpaceBefore(currentResult: string, elementResult: string): boolean {
    if (!currentResult || /\s$/.test(currentResult)) {
      return false;
    }
    
    if (/^\s/.test(elementResult)) {
      return false;
    }
    
    const lastChar = currentResult.slice(-1);
    const firstChar = elementResult.charAt(0);
    
    // Add space before bold/italic formatting when preceded by word characters
    if (elementResult.match(/^[\*_`]/) && lastChar.match(/\w/)) {
      return true;
    }
    
    // Add space between word characters
    if (lastChar.match(/\w/) && firstChar.match(/\w/)) {
      return true;
    }
    
    return false;
  }
  
  private shouldAddSpaceAfter(elementResult: string, nextSibling: any): boolean {
    if (nextSibling.nodeType === 3) { // Text node
      const nextText = nextSibling.textContent || '';
      if (/^\s/.test(nextText)) {
        return false;
      }
      
      const lastChar = elementResult.slice(-1);
      const firstChar = nextText.charAt(0);
      
      // Add space after bold/italic formatting when followed by word characters
      if (elementResult.match(/[\*_`]$/) && firstChar.match(/\w/)) {
        return true;
      }
      
      // Add space between word characters
      if (lastChar.match(/\w/) && firstChar.match(/\w/)) {
        return true;
      }
    }
    
    return false;
  }

  convertToAsciiDoc(entries: GlossaryEntry[], options: GlossaryConversionOptions): string {
    const sortedEntries = this.sortEntriesAlphabetically(entries);
    
    switch (options.format) {
      case 'separate':
        return this.convertToSeparateFormat(sortedEntries, options);
      case 'book-appendix':
        return this.convertToBookAppendixFormat(sortedEntries, options);
      default:
        return this.convertToSeparateFormat(sortedEntries, options);
    }
  }


  private convertToSeparateFormat(entries: GlossaryEntry[], options: GlossaryConversionOptions): string {
    let content = '';
    
    // Add document header
    content += `= ${options.title || 'Glossary'}\n`;
    content += ':toc:\n';
    content += ':icons: font\n\n';
    
    // Generate alphabetical sections
    const groupedEntries = this.groupEntriesByLetter(entries);
    const sortedLetters = Array.from(groupedEntries.keys()).sort();
    
    for (const letter of sortedLetters) {
      const letterEntries = groupedEntries.get(letter)!;
      
      // Section heading
      content += `== ${letter}\n\n`;
      
      // Entries for this letter
      for (const entry of letterEntries) {
        if (options.generateAnchors) {
          const anchorId = this.generateAnchorId(entry.terms[0]);
          content += `[[${anchorId}]]\n`;
        }
        
        content += `${entry.terms[0]}::\n`;
        
        if (entry.terms.length > 1) {
          const synonyms = entry.terms.slice(1).join(', ');
          content += `_Also: ${synonyms}_\n+\n`;
        }
        
        const definition = this.convertDefinition(entry.definition);
        const definitionLines = definition.split('\n');
        definitionLines.forEach((line, index) => {
          if (index === 0) {
            content += `  ${line}\n`;
          } else {
            content += `  +\n  ${line}\n`;
          }
        });
        
        content += '\n';
      }
    }
    
    return content.trim();
  }

  private convertToBookAppendixFormat(entries: GlossaryEntry[], options: GlossaryConversionOptions): string {
    let content = '';
    
    // Book appendix format with proper structure
    const level = '='.repeat((options.levelOffset || 0) + 1);
    content += `[appendix]\n`;
    content += `${level} ${options.title || 'Glossary'}\n\n`;
    
    // Optional introduction
    content += `This glossary provides definitions for key terms used throughout this documentation.\n\n`;
    
    // Generate alphabetical sections
    const groupedEntries = this.groupEntriesByLetter(entries);
    const sortedLetters = Array.from(groupedEntries.keys()).sort();
    
    for (const letter of sortedLetters) {
      const letterEntries = groupedEntries.get(letter)!;
      const sectionLevel = '='.repeat((options.levelOffset || 0) + 2);
      
      content += `${sectionLevel} ${letter}\n\n`;
      
      // Use glossary list format for book appendix
      content += '[glossary]\n';
      
      for (const entry of letterEntries) {
        if (options.generateAnchors) {
          const anchorId = this.generateAnchorId(entry.terms[0]);
          content += `[[${anchorId}]]\n`;
        }
        
        // Primary term with all synonyms
        const allTerms = entry.terms.join(', ');
        content += `${allTerms}::\n`;
        
        const definition = this.convertDefinition(entry.definition);
        const definitionLines = definition.split('\n');
        definitionLines.forEach((line, index) => {
          content += `  ${line}\n`;
          if (index < definitionLines.length - 1) {
            content += `  +\n`;
          }
        });
        
        content += '\n';
      }
    }
    
    return content.trim();
  }

  private convertDefinition(definition: string): string {
    // Check if definition contains HTML
    if (definition.includes('<') && definition.includes('>')) {
      return this.htmlToAsciiDoc(definition);
    }
    return definition.trim();
  }

  private generateIndex(entries: GlossaryEntry[]): string {
    const groupedEntries = this.groupEntriesByLetter(entries);
    const sortedLetters = Array.from(groupedEntries.keys()).sort();
    
    let index = '.Glossary Index\n****\n';
    
    for (const letter of sortedLetters) {
      const letterEntries = groupedEntries.get(letter)!;
      index += `*${letter}:* `;
      
      const termLinks = letterEntries.map(entry => {
        const term = entry.terms[0];
        if (entry.terms.length > 1) {
          return `<<${this.generateAnchorId(term)},${term}>>`;
        }
        return `<<${this.generateAnchorId(term)},${term}>>`;
      });
      
      index += termLinks.join(' | ');
      index += '\n\n';
    }
    
    index += '****';
    return index;
  }

  private generateAnchorId(term: string): string {
    // Generate a valid AsciiDoc anchor ID from a term
    return `glossary-${term.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}`;
  }

  private sortEntriesAlphabetically(entries: GlossaryEntry[]): GlossaryEntry[] {
    return [...entries].sort((a, b) => {
      const termA = a.terms[0]?.toLowerCase() || '';
      const termB = b.terms[0]?.toLowerCase() || '';
      return termA.localeCompare(termB);
    });
  }

  private groupEntriesByLetter(entries: GlossaryEntry[]): Map<string, GlossaryEntry[]> {
    const grouped = new Map<string, GlossaryEntry[]>();
    
    for (const entry of entries) {
      const firstTerm = entry.terms[0];
      if (!firstTerm) continue;
      
      const firstChar = firstTerm[0].toUpperCase();
      const letterGroup = /[A-Z]/.test(firstChar) ? firstChar : '#';
      
      if (!grouped.has(letterGroup)) {
        grouped.set(letterGroup, []);
      }
      grouped.get(letterGroup)!.push(entry);
    }
    
    // Sort entries within each group
    for (const [letter, groupEntries] of grouped) {
      grouped.set(letter, this.sortEntriesAlphabetically(groupEntries));
    }
    
    return grouped;
  }

  // Generate include directive for separate glossary file
  generateIncludeDirective(glossaryPath: string): string {
    return `\n\n// Include glossary\ninclude::${glossaryPath}[]\n`;
  }
}
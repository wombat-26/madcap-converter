import { JSDOM } from 'jsdom';
import { DocumentConverter, ConversionOptions, ConversionResult } from '../types/index.js';
import { HTMLConverter } from './html-converter.js';
import { AsciiDocConverter } from './asciidoc-converter.js';
import { MadCapPreprocessor } from '../services/madcap-preprocessor.js';

export class MadCapConverter implements DocumentConverter {
  supportedInputTypes = ['html', 'htm', 'xml'];
  private htmlConverter: HTMLConverter;
  private asciidocConverter: AsciiDocConverter;
  private madcapPreprocessor: MadCapPreprocessor;

  constructor() {
    this.htmlConverter = new HTMLConverter();
    this.asciidocConverter = new AsciiDocConverter();
    this.madcapPreprocessor = new MadCapPreprocessor();
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    // Check if content should be skipped due to MadCap conditions
    if (this.madcapPreprocessor.shouldSkipContent(input)) {
      throw new Error('Content contains MadCap conditions that should not be converted (Black, Red, Gray, deprecated, paused, halted, discontinued, print-only, etc.)');
    }
    
    // Set variable extraction mode if enabled
    if (options.variableOptions?.extractVariables) {
      this.madcapPreprocessor.setExtractVariables(true);
    }
    
    // Use shared MadCap preprocessing
    const processedHtml = await this.madcapPreprocessor.preprocessMadCapContent(input, options.inputPath);
    
    // Get extracted variables from preprocessor
    const extractedVars = this.madcapPreprocessor.getExtractedVariables();
    
    // Additional processing for standard HTML conversion
    let finalHtml: string;
    
    if (options.format === 'asciidoc') {
      // For AsciiDoc, skip the HTML preprocessing that causes double formatting
      // The AsciiDocConverter can handle the preprocessed MadCap content directly
      finalHtml = processedHtml;
      
      // Debug logging disabled to prevent MCP protocol issues
    } else {
      // For other formats (markdown, zendesk), apply standard HTML processing
      const dom = new JSDOM(processedHtml, { contentType: 'text/html' });
      const document = dom.window.document;
      
      // Apply MadCap element conversion for HTML output
      this.madcapPreprocessor.processMadCapElementsForHTML(document);
      
      finalHtml = document.documentElement.outerHTML;
    }
    
    // Store variables from AsciiDoc converter if used
    let converterVariableExtractor: any = null;
    
    // Route to appropriate converter based on output format
    // The finalHtml has already been preprocessed, so the converter won't reprocess MadCap content
    let result: ConversionResult;
    if (options.format === 'asciidoc') {
      result = await this.asciidocConverter.convert(finalHtml, options);
      converterVariableExtractor = this.asciidocConverter.getVariableExtractor();
    } else {
      // For markdown, zendesk, and other formats, use HTMLConverter
      result = await this.htmlConverter.convert(finalHtml, options);
      // HTMLConverter also has variable extraction capabilities
      if (typeof (this.htmlConverter as any).getVariableExtractor === 'function') {
        converterVariableExtractor = (this.htmlConverter as any).getVariableExtractor();
      }
    }
    
    // Use the variables file from the converter if it was generated
    let finalVariablesFile = result.variablesFile;
    
    // If no variables file was generated but extraction was requested, try to generate one
    if (!finalVariablesFile && options.variableOptions?.extractVariables && 
        options.variableOptions.variableFormat && converterVariableExtractor) {
      try {
        const variables = converterVariableExtractor.getVariables();
        if (variables.length > 0) {
          finalVariablesFile = converterVariableExtractor.generateVariablesFile(options.variableOptions);
        }
      } catch (error) {
        console.warn('Failed to generate variables file in MadCapConverter:', error);
      }
    }
    
    // Reset variable extraction flag for next conversion
    this.madcapPreprocessor.setExtractVariables(false);
    
    return {
      content: result.content,
      variablesFile: finalVariablesFile,
      metadata: {
        title: result.metadata?.title,
        wordCount: result.metadata?.wordCount || 0,
        images: result.metadata?.images,
        warnings: this.getMadCapWarnings(input),
        variables: extractedVars.length > 0 ? extractedVars.map(v => ({
          name: v.name,
          value: v.value,
          namespace: v.name.includes('.') ? v.name.split('.')[0] : undefined,
          key: v.name.includes('.') ? v.name.split('.').slice(1).join('.') : v.name,
          source: 'madcap' as const
        })) : undefined
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
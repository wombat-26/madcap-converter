import { readFile, writeFile, mkdir } from 'fs/promises';
import { extname, dirname, basename, join } from 'path';
import { HTMLConverter, WordConverter, MadCapConverter, ZendeskConverter, AsciiDocConverter, EnhancedAsciiDocConverter } from '../converters/index';
import WritersideMarkdownConverter from '../converters/writerside-markdown-converter';
import { ConversionOptions, ConversionResult, DocumentConverter } from '../types/index';
import { errorHandler } from './error-handler';
import { InputValidator } from './input-validator';
import { LinkValidator } from './link-validator';
import { QualityValidator } from './quality-validator';

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
      ['zendesk', new ZendeskConverter()],
      ['asciidoc', new EnhancedAsciiDocConverter()],
      ['writerside-markdown', new WritersideMarkdownConverter()]
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

    // Validate inputs
    const inputValidation = await InputValidator.validateFilePath(inputPath, 'read', 'input');
    if (!inputValidation.isValid) {
      throw new Error(`Invalid input file: ${inputValidation.errors.join('; ')}`);
    }

    if (outputPath) {
      const outputValidation = await InputValidator.validateFilePath(outputPath, 'write');
      if (!outputValidation.isValid) {
        throw new Error(`Invalid output path: ${outputValidation.errors.join('; ')}`);
      }
    }

    const optionsValidation = await InputValidator.validateConversionOptions({
      format: actualOptions.format || 'markdown',
      ...actualOptions
    } as ConversionOptions);
    
    if (!optionsValidation.isValid) {
      throw new Error(`Invalid conversion options: ${optionsValidation.errors.join('; ')}`);
    }

    // Use sanitized options if available
    if (optionsValidation.sanitizedOptions) {
      actualOptions = { ...actualOptions, ...optionsValidation.sanitizedOptions };
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
    const format = actualOptions.format || 'asciidoc';

    let input: string | Buffer;
    
    if (extension === 'docx' || extension === 'doc') {
      // Read as Buffer for Word documents (required by mammoth)
      input = await readFile(inputPath);
    } else {
      input = await errorHandler.safeReadFile(inputPath, 'utf8');
      
      // Check if HTML/HTM files contain MadCap content or if target is Zendesk
      if ((extension === 'html' || extension === 'htm') && typeof input === 'string') {
        if (format === 'zendesk') {
          // Use Zendesk converter for Zendesk format
          converter = this.converters.get('zendesk')!;
          if (this.containsMadCapContent(input)) {
            inputType = 'madcap';
          }
        } else if (format === 'asciidoc') {
          // Always use EnhancedAsciiDocConverter for asciidoc format
          // It has MadCap preprocessing built in
          converter = this.converters.get('asciidoc')!;
          if (this.containsMadCapContent(input)) {
            inputType = 'madcap';
          }
        } else if (format === 'writerside-markdown') {
          // Use WritersideMarkdownConverter directly for Writerside format
          converter = this.converters.get('writerside-markdown')!;
          // Don't change inputType - let it handle HTML directly
        } else if (this.containsMadCapContent(input)) {
          inputType = 'madcap';
          converter = this.converters.get('xml')!; // Use MadCap converter
          // MadCap content detected, routing to MadCapConverter
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
      inputPath: inputPath, // Always use the actual file path for proper snippet resolution
      extractedVariables: (actualOptions as any).extractedVariables, // Pre-extracted variables from batch processing
      variableOptions: actualOptions.variableOptions,
      zendeskOptions: actualOptions.zendeskOptions,
      asciidocOptions: actualOptions.asciidocOptions
    };

    // Note: Converter selection is already done above based on format and content type
    // No need for additional overrides here
    
    console.log(`🔍 [DocumentService] Converting file: ${inputPath} -> ${outputPath}`);
    console.log(`🔍 [DocumentService] File extension: ${extension}, Converter: ${converterKey}, Input type: ${inputType}`);
    console.log(`🔍 [DocumentService] Options received:`, {
      format,
      extractVariables: actualOptions.variableOptions?.extractVariables,
      variableOptions: actualOptions.variableOptions,
      outputDir: actualOptions.outputDir,
      extractedVariablesCount: (actualOptions as any).extractedVariables?.length || 0
    });
    
    if ((actualOptions as any).extractedVariables) {
      console.log(`📝 [DocumentService] Pre-extracted variables being passed to converter: ${(actualOptions as any).extractedVariables.length}`);
      (actualOptions as any).extractedVariables.forEach((variable: any) => {
        console.log(`    • ${variable.name} = "${variable.value}"`);
      });
    } else {
      console.log(`⚠️ [DocumentService] No pre-extracted variables received`);
    }
    
    const result = await converter.convert(input, conversionOptions);
    
    console.log(`🔍 [DocumentService] Conversion result:`, {
      hasContent: !!result.content,
      contentLength: result.content?.length || 0,
      hasVariablesFile: !!result.variablesFile,
      variablesFileLength: result.variablesFile?.length || 0,
      hasMetadata: !!result.metadata
    });

    if (outputPath) {
      console.log(`📁 [DocumentService] Creating directory: ${dirname(outputPath)}`);
      await errorHandler.safeCreateDirectory(dirname(outputPath));
      
      console.log(`📄 [DocumentService] Writing main file: ${outputPath} (${result.content.length} chars)`);
      await errorHandler.safeWriteFile(outputPath, result.content, 'utf8');
      
      // Debug variables file generation
      console.log(`🔍 [DocumentService] Variables file check:`, {
        hasVariablesFile: !!result.variablesFile,
        extractVariables: !!actualOptions.variableOptions?.extractVariables,
        skipFileGeneration: !!actualOptions.variableOptions?.skipFileGeneration,
        shouldWriteVariables: !!(result.variablesFile && actualOptions.variableOptions?.extractVariables && 
                                !actualOptions.variableOptions?.skipFileGeneration)
      });
      
      // Write variables file if it was generated (skip if batch processing)
      if (result.variablesFile && actualOptions.variableOptions?.extractVariables && 
          !actualOptions.variableOptions?.skipFileGeneration) {
        const variablesPath = actualOptions.variableOptions.variablesOutputPath || 
                             this.getDefaultVariablesPath(outputPath, actualOptions.variableOptions.variableFormat);
        console.log(`📄 [DocumentService] Writing variables file: ${variablesPath} (${result.variablesFile.length} chars)`);
        await errorHandler.safeWriteFile(variablesPath, result.variablesFile, 'utf8');
        console.log(`✅ [DocumentService] Variables file written successfully: ${variablesPath}`);
      } else {
        console.log(`⏭️ [DocumentService] Skipping variables file - conditions not met`);
      }

      // Generate glossary for single-file conversions (AsciiDoc only)
      try {
        const includeGlossary = !!(
          actualOptions.asciidocOptions?.glossaryOptions?.includeGlossary ||
          (actualOptions as any).glossaryOptions?.includeGlossary
        );
        if ((actualOptions.format === 'asciidoc') && includeGlossary) {
          const projectRoot = this.findProjectRootFromInputPath(inputPath);
          await this.generateGlossaryForSingle(
            projectRoot,
            dirname(outputPath),
            actualOptions
          );
        }
      } catch (glossaryError) {
        console.warn('Glossary generation skipped/failed:', glossaryError);
      }

      // Validate conversion quality
      try {
        const qualityValidator = new QualityValidator();
        const qualityReport = qualityValidator.validateContent(
          result.content, 
          actualOptions.format || 'markdown',
          inputPath
        );
        
        // Add quality report to metadata
        if (!result.metadata) {
          result.metadata = { wordCount: 0 };
        }
        result.metadata.qualityReport = qualityReport;
        
        // Add quality warnings to main warnings array
        if (qualityReport.issues.length > 0) {
          result.metadata.warnings = result.metadata.warnings || [];
          const severityOrder = { error: 0, warning: 1, info: 2 };
          const sortedIssues = qualityReport.issues.sort((a, b) => 
            severityOrder[a.type] - severityOrder[b.type]
          );
          
          // Add top 3 most severe issues to warnings
          sortedIssues.slice(0, 3).forEach(issue => {
            result.metadata!.warnings!.push(`${issue.type.toUpperCase()}: ${issue.message}`);
          });
        }
        
        console.log(`📊 [DocumentService] Quality score: ${qualityReport.score}/100 - ${qualityReport.summary}`);
      } catch (qualityError) {
        console.warn('Quality validation failed:', qualityError);
      }

      // Validate links in converted content if requested
      if (actualOptions.validateLinks !== false) {
        try {
          const linkValidator = new LinkValidator(dirname(outputPath), actualOptions.format || 'markdown');
          const validation = await linkValidator.validateFile(outputPath);
          
          // Add link validation results to metadata
          const brokenLinks = validation.filter(v => !v.isValid);
          if (brokenLinks.length > 0) {
            if (!result.metadata) {
              result.metadata = { wordCount: 0 };
            }
            result.metadata.warnings = result.metadata.warnings || [];
            result.metadata.warnings.push(`Found ${brokenLinks.length} broken links`);
            result.metadata.brokenLinks = brokenLinks;
          }
        } catch (linkError) {
          console.warn('Link validation failed:', linkError);
        }
      }
    }

    return result;
  }

  async convertString(content: string, options: ConversionOptions): Promise<ConversionResult> {
    // Validate input content
    const contentValidation = InputValidator.validateInputContent(content, options.inputType);
    if (!contentValidation.isValid) {
      throw new Error(`Invalid input content: ${contentValidation.errors.join('; ')}`);
    }

    // Validate options
    const optionsValidation = await InputValidator.validateConversionOptions(options);
    if (!optionsValidation.isValid) {
      throw new Error(`Invalid conversion options: ${optionsValidation.errors.join('; ')}`);
    }

    let converter = this.getConverterForInputType(options.inputType);
    
    // Override converter selection for specific formats
    if (options.format === 'zendesk') {
      converter = this.converters.get('zendesk')!;
    } else if (options.format === 'writerside-markdown') {
      // Use WritersideMarkdownConverter for Writerside format
      converter = this.converters.get('writerside-markdown')!;
    } else if (options.format === 'asciidoc' && options.inputType === 'html') {
      // Use the standardized EnhancedAsciiDocConverter for AsciiDoc output
      converter = this.converters.get('asciidoc')!;
    }
    
    return await converter.convert(content, options);
  }

  async convertBuffer(buffer: Buffer, options: ConversionOptions): Promise<ConversionResult> {
    let converter = this.getConverterForInputType(options.inputType);
    
    // Override converter selection for specific formats
    if (options.format === 'zendesk') {
      converter = this.converters.get('zendesk')!;
    } else if (options.format === 'writerside-markdown') {
      // Use WritersideMarkdownConverter for Writerside format
      converter = this.converters.get('writerside-markdown')!;
    } else if (options.format === 'asciidoc' && options.inputType === 'html') {
      // Use the standardized EnhancedAsciiDocConverter for AsciiDoc output
      converter = this.converters.get('asciidoc')!;
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
        // Use includes directory for AsciiDoc variables following best practices
        return join(dir, 'includes', 'variables.adoc');
      case 'writerside':
        return join(dir, 'v.list');
      default:
        return join(dir, 'variables.txt');
    }
  }

  // Find MadCap project root from an input file path
  private findProjectRootFromInputPath(inputPath: string): string {
    const normalized = inputPath.replace(/\\/g, '/');
    const contentIndex = normalized.lastIndexOf('/Content/');
    if (contentIndex > 0) {
      return normalized.slice(0, contentIndex);
    }
    // If not inside Content, try locating '/Project/' parent as a fallback
    const projectIndex = normalized.lastIndexOf('/Project/');
    if (projectIndex > 0) {
      return normalized.slice(0, projectIndex);
    }
    // Fallback to parent directory of the file
    return dirname(inputPath);
  }

  // Generate glossary for single-file conversion when requested
  private async generateGlossaryForSingle(
    projectRoot: string,
    outputDir: string,
    options: Partial<ConversionOptions>
  ): Promise<void> {
    try {
      const { FlgloParser } = await import('./flglo-parser');
      const { GlossaryConverter } = await import('../converters/glossary-converter');

      // Get condition filters from options  
      const conditionFilters = options.asciidocOptions?.glossaryOptions?.filterConditions || 
                              (options as any).glossaryOptions?.filterConditions ||
                              options.excludeConditions || 
                              [];
      
      const glossaryParser = new FlgloParser(conditionFilters);
      const glossaryConverter = new GlossaryConverter();

      // Resolve explicit glossary path if provided
      const nested = options.asciidocOptions?.glossaryOptions;
      const topLevel = (options as any).glossaryOptions;
      const glossaryOpts = nested || topLevel || {};

      let glossaryFiles: string[] = [];
      if (glossaryOpts.glossaryPath) {
        const { join } = await import('path');
        const specified = join(projectRoot, glossaryOpts.glossaryPath);
        try {
          const { stat } = await import('fs/promises');
          await stat(specified);
          glossaryFiles = [specified];
        } catch {
          // ignore if specified file not found; will try auto-discovery
        }
      }

      if (glossaryFiles.length === 0) {
        glossaryFiles = await glossaryParser.findGlossaryFiles(projectRoot);
      }

      if (glossaryFiles.length === 0) {
        // No glossary available; do nothing
        return;
      }

      // Parse and collect glossary entries
      const allEntries: import('./flglo-parser').GlossaryEntry[] = [];
      for (const file of glossaryFiles) {
        try {
          const parsed = await glossaryParser.parseGlossaryFile(file);
          allEntries.push(...parsed.entries);
        } catch (e) {
          // Skip problematic files rather than failing conversion
          console.warn(`Failed to parse glossary file ${file}:`, e);
        }
      }

      if (allEntries.length === 0) return;

      // Build conversion options
      const convOptions: import('../converters/glossary-converter').GlossaryConversionOptions = {
        format: glossaryOpts.glossaryFormat || 'separate',
        generateAnchors: glossaryOpts.generateAnchors ?? true,
        includeIndex: glossaryOpts.includeIndex ?? true,
        title: glossaryOpts.glossaryTitle || 'Glossary',
        levelOffset: 0
      };

      const content = glossaryConverter.convertToAsciiDoc(allEntries, convOptions);

      // Decide output path
      const { join } = await import('path');
      let glossaryOutputPath: string;
      if (convOptions.format === 'separate') {
        glossaryOutputPath = join(outputDir, 'glossary.adoc');
      } else if (convOptions.format === 'book-appendix') {
        const appendicesDir = join(outputDir, 'appendices');
        await errorHandler.safeCreateDirectory(appendicesDir);
        glossaryOutputPath = join(appendicesDir, 'glossary.adoc');
      } else {
        const includesDir = join(outputDir, 'includes');
        await errorHandler.safeCreateDirectory(includesDir);
        glossaryOutputPath = join(includesDir, 'glossary.adoc');
      }

      await errorHandler.safeWriteFile(glossaryOutputPath, content, 'utf8');
    } catch (err) {
      console.warn('Single-file glossary generation failed:', err);
    }
  }
}

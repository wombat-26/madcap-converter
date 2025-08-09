import { promises as fs } from 'fs';
import { resolve, isAbsolute, extname, basename } from 'path';
import { ConversionOptions, BatchConversionOptions, VariableExtractionOptions, AsciidocOptions, ZendeskOptions } from '../types/index';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedOptions?: any;
}

export class InputValidator {
  private static readonly MAX_PATH_LENGTH = 4096;
  private static readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  private static readonly SUPPORTED_INPUT_FORMATS = ['.htm', '.html', '.docx', '.doc', '.flsnp', '.flpgl', '.fltoc', '.xml'];
  private static readonly OUTPUT_FORMATS = ['markdown', 'asciidoc', 'enhanced-asciidoc', 'optimized-asciidoc', 'zendesk', 'pandoc-asciidoc', 'pandoc-markdown', 'enhanced-markdown', 'madcap-markdown', 'writerside-markdown'];
  private static readonly VARIABLE_FORMATS = ['adoc', 'writerside'];
  
  /**
   * Validate conversion options for single file/document conversion
   */
  static async validateConversionOptions(options: ConversionOptions): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitizedOptions = { ...options };

    // Validate format
    if (!options.format || !this.OUTPUT_FORMATS.includes(options.format)) {
      errors.push(`Invalid output format. Must be one of: ${this.OUTPUT_FORMATS.join(', ')}`);
    }

    // Validate input type
    if (options.inputType && !['html', 'word', 'madcap'].includes(options.inputType)) {
      errors.push('Invalid input type. Must be one of: html, word, madcap');
    }

    // Validate variable options
    if (options.variableOptions) {
      const varValidation = await this.validateVariableOptions(options.variableOptions);
      errors.push(...varValidation.errors);
      warnings.push(...varValidation.warnings);
      if (varValidation.sanitizedOptions) {
        sanitizedOptions.variableOptions = varValidation.sanitizedOptions;
      }
    }

    // Validate AsciiDoc options
    if (options.asciidocOptions) {
      const adocValidation = this.validateAsciidocOptions(options.asciidocOptions);
      errors.push(...adocValidation.errors);
      warnings.push(...adocValidation.warnings);
      if (adocValidation.sanitizedOptions) {
        sanitizedOptions.asciidocOptions = adocValidation.sanitizedOptions;
      }
    }

    // Validate Zendesk options
    if (options.zendeskOptions) {
      const zendeskValidation = await this.validateZendeskOptions(options.zendeskOptions);
      errors.push(...zendeskValidation.errors);
      warnings.push(...zendeskValidation.warnings);
      if (zendeskValidation.sanitizedOptions) {
        sanitizedOptions.zendeskOptions = zendeskValidation.sanitizedOptions;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedOptions: errors.length === 0 ? sanitizedOptions : undefined
    };
  }

  /**
   * Validate batch conversion options
   */
  static async validateBatchOptions(options: BatchConversionOptions): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitizedOptions = { ...options };

    // First validate base conversion options
    const baseValidation = await this.validateConversionOptions(options);
    errors.push(...baseValidation.errors);
    warnings.push(...baseValidation.warnings);

    // Validate batch-specific options
    if (options.includePatterns) {
      const patternValidation = this.validateFilePatterns(options.includePatterns, 'include');
      errors.push(...patternValidation.errors);
      warnings.push(...patternValidation.warnings);
    }

    if (options.excludePatterns) {
      const patternValidation = this.validateFilePatterns(options.excludePatterns, 'exclude');
      errors.push(...patternValidation.errors);
      warnings.push(...patternValidation.warnings);
    }

    // Validate boolean options with defaults
    if (typeof options.recursive !== 'undefined' && typeof options.recursive !== 'boolean') {
      warnings.push('recursive option should be boolean, defaulting to true');
      sanitizedOptions.recursive = true;
    }

    if (typeof options.preserveStructure !== 'undefined' && typeof options.preserveStructure !== 'boolean') {
      warnings.push('preserveStructure option should be boolean, defaulting to true');
      sanitizedOptions.preserveStructure = true;
    }

    if (typeof options.copyImages !== 'undefined' && typeof options.copyImages !== 'boolean') {
      warnings.push('copyImages option should be boolean, defaulting to true');
      sanitizedOptions.copyImages = true;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedOptions: errors.length === 0 ? sanitizedOptions : undefined
    };
  }

  /**
   * Validate file path
   */
  static async validateFilePath(path: string, operation: 'read' | 'write', fileType?: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic path validation
    if (!path || typeof path !== 'string' || path.trim() === '') {
      errors.push('File path cannot be empty');
      return { isValid: false, errors, warnings };
    }

    const trimmedPath = path.trim();

    // Path length validation
    if (trimmedPath.length > this.MAX_PATH_LENGTH) {
      errors.push(`Path too long (${trimmedPath.length} chars). Maximum allowed: ${this.MAX_PATH_LENGTH}`);
    }

    // Security: Check for path traversal
    if (trimmedPath.includes('..')) {
      errors.push('Path traversal not allowed (contains "..")');
    }

    // Security: Check for null bytes
    if (trimmedPath.includes('\0')) {
      errors.push('Path contains null bytes');
    }

    // Make path absolute if it's not
    let absolutePath: string;
    try {
      absolutePath = isAbsolute(trimmedPath) ? trimmedPath : resolve(process.cwd(), trimmedPath);
    } catch (error) {
      errors.push(`Invalid path format: ${(error as Error).message}`);
      return { isValid: false, errors, warnings };
    }

    // For read operations, check if file exists and is accessible
    if (operation === 'read') {
      try {
        const stats = await fs.stat(absolutePath);
        
        if (!stats.isFile()) {
          errors.push('Path does not point to a file');
        } else {
          // Check file size
          if (stats.size > this.MAX_FILE_SIZE) {
            errors.push(`File too large (${this.formatBytes(stats.size)}). Maximum allowed: ${this.formatBytes(this.MAX_FILE_SIZE)}`);
          }

          // Check file extension for input files
          if (fileType === 'input') {
            const ext = extname(absolutePath).toLowerCase();
            if (ext && !this.SUPPORTED_INPUT_FORMATS.includes(ext)) {
              warnings.push(`Unsupported file extension '${ext}'. Supported: ${this.SUPPORTED_INPUT_FORMATS.join(', ')}`);
            }
          }
        }
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') {
          errors.push('File does not exist');
        } else if (nodeError.code === 'EACCES') {
          errors.push('Permission denied accessing file');
        } else {
          errors.push(`Cannot access file: ${nodeError.message}`);
        }
      }
    }

    // For write operations, check if directory exists or can be created
    if (operation === 'write') {
      const directory = absolutePath.substring(0, absolutePath.lastIndexOf('/'));
      try {
        await fs.access(directory);
      } catch (error) {
        // Directory doesn't exist - this is handled by ensureDirectoryExists in error-handler
        warnings.push(`Output directory will be created: ${directory}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate directory path
   */
  static async validateDirectoryPath(path: string, operation: 'read' | 'write'): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!path || typeof path !== 'string' || path.trim() === '') {
      errors.push('Directory path cannot be empty');
      return { isValid: false, errors, warnings };
    }

    const trimmedPath = path.trim();

    // Path length validation
    if (trimmedPath.length > this.MAX_PATH_LENGTH) {
      errors.push(`Path too long (${trimmedPath.length} chars). Maximum allowed: ${this.MAX_PATH_LENGTH}`);
    }

    // Security checks
    if (trimmedPath.includes('..')) {
      errors.push('Path traversal not allowed (contains "..")');
    }

    if (trimmedPath.includes('\0')) {
      errors.push('Path contains null bytes');
    }

    // Make path absolute
    let absolutePath: string;
    try {
      absolutePath = isAbsolute(trimmedPath) ? trimmedPath : resolve(process.cwd(), trimmedPath);
    } catch (error) {
      errors.push(`Invalid path format: ${(error as Error).message}`);
      return { isValid: false, errors, warnings };
    }

    // For read operations, check if directory exists and is accessible
    if (operation === 'read') {
      try {
        const stats = await fs.stat(absolutePath);
        if (!stats.isDirectory()) {
          errors.push('Path does not point to a directory');
        }
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') {
          errors.push('Directory does not exist');
        } else if (nodeError.code === 'EACCES') {
          errors.push('Permission denied accessing directory');
        } else {
          errors.push(`Cannot access directory: ${nodeError.message}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate variable extraction options
   */
  private static async validateVariableOptions(options: VariableExtractionOptions): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitizedOptions = { ...options };

    // Validate variableFormat
    if (options.variableFormat && !this.VARIABLE_FORMATS.includes(options.variableFormat)) {
      errors.push(`Invalid variable format. Must be one of: ${this.VARIABLE_FORMATS.join(', ')}`);
    }

    // Validate variablesOutputPath if provided
    if (options.variablesOutputPath) {
      const pathValidation = await this.validateFilePath(options.variablesOutputPath, 'write');
      if (!pathValidation.isValid) {
        errors.push(`Invalid variables output path: ${pathValidation.errors.join(', ')}`);
      }
      warnings.push(...pathValidation.warnings);
    }

    // Validate boolean options
    if (typeof options.extractVariables !== 'undefined' && typeof options.extractVariables !== 'boolean') {
      warnings.push('extractVariables should be boolean, defaulting to true');
      sanitizedOptions.extractVariables = true;
    }

    if (typeof options.preserveVariableStructure !== 'undefined' && typeof options.preserveVariableStructure !== 'boolean') {
      warnings.push('preserveVariableStructure should be boolean, defaulting to false');
      sanitizedOptions.preserveVariableStructure = false;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedOptions: errors.length === 0 ? sanitizedOptions : undefined
    };
  }

  /**
   * Validate AsciiDoc options
   */
  private static validateAsciidocOptions(options: AsciidocOptions): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitizedOptions = { ...options };

    // Validate includeTOCLevels
    if (options.includeTOCLevels !== undefined) {
      if (typeof options.includeTOCLevels !== 'number' || options.includeTOCLevels < 1 || options.includeTOCLevels > 6) {
        warnings.push('includeTOCLevels should be a number between 1 and 6, defaulting to 3');
        sanitizedOptions.includeTOCLevels = 3;
      }
    }

    // Validate string options
    if (options.bookTitle !== undefined && typeof options.bookTitle !== 'string') {
      warnings.push('bookTitle should be a string');
      sanitizedOptions.bookTitle = '';
    }

    if (options.bookAuthor !== undefined && typeof options.bookAuthor !== 'string') {
      warnings.push('bookAuthor should be a string');
      sanitizedOptions.bookAuthor = '';
    }

    // Validate boolean options
    const booleanOptions = [
      'useCollapsibleBlocks', 'tilesAsTable', 'generateAsBook',
      'useLinkedTitleFromTOC', 'includeChapterBreaks', 'useBookDoctype'
    ];

    booleanOptions.forEach(option => {
      if (options[option as keyof AsciidocOptions] !== undefined && 
          typeof options[option as keyof AsciidocOptions] !== 'boolean') {
        warnings.push(`${option} should be boolean`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedOptions: errors.length === 0 ? sanitizedOptions : undefined
    };
  }

  /**
   * Validate Zendesk options
   */
  private static async validateZendeskOptions(options: ZendeskOptions): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitizedOptions = { ...options };

    // Validate maxTags
    if (options.maxTags !== undefined) {
      if (typeof options.maxTags !== 'number' || options.maxTags < 1 || options.maxTags > 50) {
        warnings.push('maxTags should be a number between 1 and 50, defaulting to 10');
        sanitizedOptions.maxTags = 10;
      }
    }

    // Validate CSS output path if provided
    if (options.cssOutputPath) {
      const pathValidation = await this.validateFilePath(options.cssOutputPath, 'write');
      if (!pathValidation.isValid) {
        errors.push(`Invalid CSS output path: ${pathValidation.errors.join(', ')}`);
      }
      warnings.push(...pathValidation.warnings);
    }

    // Validate locale format
    if (options.locale && !/^[a-z]{2}-[a-z]{2}$/.test(options.locale)) {
      warnings.push('locale should be in format "en-us", defaulting to "en-us"');
      sanitizedOptions.locale = 'en-us';
    }

    // Validate boolean options
    const booleanOptions = [
      'generateTags', 'sanitizeHtml', 'ignoreVideos', 
      'inlineStyles', 'generateStylesheet'
    ];

    booleanOptions.forEach(option => {
      if (options[option as keyof ZendeskOptions] !== undefined && 
          typeof options[option as keyof ZendeskOptions] !== 'boolean') {
        warnings.push(`${option} should be boolean`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedOptions: errors.length === 0 ? sanitizedOptions : undefined
    };
  }

  /**
   * Validate file patterns
   */
  private static validateFilePatterns(patterns: string[], type: 'include' | 'exclude'): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(patterns)) {
      errors.push(`${type} patterns must be an array`);
      return { isValid: false, errors, warnings };
    }

    patterns.forEach((pattern, index) => {
      if (typeof pattern !== 'string') {
        errors.push(`${type} pattern at index ${index} must be a string`);
      } else if (pattern.trim() === '') {
        warnings.push(`Empty ${type} pattern at index ${index} will be ignored`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Format bytes for human-readable display
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Sanitize user input string
   */
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }
    
    return input
      .trim()
      .replace(/[\0\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/\.\./g, '.') // Remove path traversal attempts
      .substring(0, 1000); // Limit length
  }

  /**
   * Validate and sanitize input content for conversion
   */
  static validateInputContent(content: string, inputType: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!content || typeof content !== 'string') {
      errors.push('Input content cannot be empty');
      return { isValid: false, errors, warnings };
    }

    // Check content length
    if (content.length > 50 * 1024 * 1024) { // 50MB limit for content strings
      errors.push('Input content too large (>50MB)');
    }

    // Basic format validation
    if (inputType === 'html') {
      if (!content.includes('<') && !content.includes('>')) {
        warnings.push('Input does not appear to contain HTML tags');
      }
    } else if (inputType === 'word') {
      // For base64 content, check if it's valid base64
      try {
        Buffer.from(content, 'base64');
      } catch {
        errors.push('Invalid base64 content for Word document');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
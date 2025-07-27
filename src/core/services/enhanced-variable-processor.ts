/**
 * Enhanced Variable Processor - Advanced variable processing with improved path resolution
 * 
 * Provides sophisticated variable processing capabilities with better path resolution,
 * multi-project support, and enhanced error handling.
 */

import { ImprovedPathResolver, PathResolutionOptions, ProjectStructure } from '../converters/improved-path-resolver.js';
import { FLVARParser, VariableSet } from './flvar-parser.js';
import { WritersideVariableConverter, VariableConversionOptions } from './writerside-variable-converter.js';
import { join, dirname, resolve } from 'path';

export interface EnhancedVariableOptions {
  /** Base directory for variable resolution */
  baseDir?: string;
  /** Enable automatic FLVAR file discovery */
  autoDiscoverFLVAR: boolean;
  /** Specific FLVAR files to process */
  flvarFiles?: string[];
  /** Variable output format */
  variableFormat: 'adoc' | 'legacy';
  /** Variable processing mode */
  variableMode: 'include' | 'reference' | 'inline';
  /** Variable file output path */
  variablesOutputPath?: string;
  /** Variable naming convention */
  nameConvention: 'original' | 'kebab-case' | 'snake_case' | 'camelCase';
  /** Enable multi-project support */
  multiProjectSupport: boolean;
  /** Custom search paths for variables */
  searchPaths: string[];
  /** Enable intelligent project detection */
  smartProjectDetection: boolean;
  /** Fallback strategies when variables are missing */
  fallbackStrategy: 'error' | 'warning' | 'ignore' | 'placeholder';
}

export interface VariableProcessingResult {
  /** Processed content with variable references updated */
  content: string;
  /** Generated variables file content */
  variablesFile?: string;
  /** Variables that were found and processed */
  processedVariables: ProcessedVariable[];
  /** Missing variables that couldn't be resolved */
  missingVariables: MissingVariable[];
  /** Warnings encountered during processing */
  warnings: string[];
  /** Project structure information */
  projectStructure?: ProjectStructure;
}

export interface ProcessedVariable {
  /** Variable name */
  name: string;
  /** Variable value */
  value: string;
  /** Source file where variable was defined */
  sourceFile: string;
  /** Whether the variable was transformed */
  transformed: boolean;
  /** Original name if transformed */
  originalName?: string;
}

export interface MissingVariable {
  /** Variable name that was missing */
  name: string;
  /** Context where it was referenced */
  context: string;
  /** Line number if available */
  line?: number;
  /** Suggested alternatives */
  suggestions: string[];
}

export class EnhancedVariableProcessor {
  private pathResolver: ImprovedPathResolver;
  private flvarParser: FLVARParser;
  private variableConverter: WritersideVariableConverter;
  private options: EnhancedVariableOptions;

  constructor(options: Partial<EnhancedVariableOptions> = {}) {
    this.options = {
      autoDiscoverFLVAR: true,
      variableFormat: 'adoc',
      variableMode: 'include',
      nameConvention: 'original',
      multiProjectSupport: true,
      searchPaths: [],
      smartProjectDetection: true,
      fallbackStrategy: 'warning',
      ...options
    };

    // Initialize path resolver with enhanced options
    const pathOptions: Partial<PathResolutionOptions> = {
      baseDir: this.options.baseDir,
      crossPlatform: true,
      validateExists: true,
      smartProjectDetection: this.options.smartProjectDetection,
      assetPaths: this.options.searchPaths
    };

    this.pathResolver = new ImprovedPathResolver(pathOptions);
    this.flvarParser = new FLVARParser();
    this.variableConverter = new WritersideVariableConverter();
  }

  /**
   * Process variables with enhanced path resolution and multi-project support
   */
  async processVariables(input: string, inputPath?: string): Promise<VariableProcessingResult> {
    const result: VariableProcessingResult = {
      content: input,
      processedVariables: [],
      missingVariables: [],
      warnings: []
    };

    try {
      // Detect project structure if input path is provided
      if (inputPath && this.options.smartProjectDetection) {
        result.projectStructure = this.pathResolver.detectProjectStructure(dirname(inputPath));
        this.updatePathResolverWithProjectStructure(result.projectStructure);
      }

      // Find FLVAR files with enhanced discovery
      const flvarFiles = await this.discoverFLVARFiles(inputPath, result);

      if (flvarFiles.length === 0) {
        result.warnings.push('No FLVAR files found for variable processing');
        return this.handleNoVariables(input, result);
      }

      // Parse FLVAR files with path resolution
      const variableSets = await this.parseVariableFiles(flvarFiles, result);
      const variables = this.flvarParser.mergeVariableSets(variableSets);

      if (variables.length === 0) {
        result.warnings.push('No variables found in FLVAR files');
        return this.handleNoVariables(input, result);
      }

      // Process variables with enhanced conversion
      result.processedVariables = variables.map(variable => ({
        name: variable.name,
        value: variable.value,
        sourceFile: 'unknown', // MadCapVariable doesn't have sourceFile property
        transformed: false
      }));

      // Convert to target format
      const conversionOptions = this.buildConversionOptions();
      const convertedVariables = this.variableConverter.convertVariables(variables, conversionOptions);

      // Generate variables file if needed
      if (this.options.variableMode === 'include' && !this.shouldSkipFileGeneration()) {
        const variableFileResult = this.variableConverter.generateAsciiDocFile(convertedVariables, conversionOptions);
        result.variablesFile = variableFileResult.content;
      }

      // Process variable references in content
      result.content = this.processVariableReferences(input, convertedVariables, conversionOptions, result);

      result.warnings.push(`Processed ${variables.length} variables from ${flvarFiles.length} FLVAR files`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.warnings.push(`Variable processing failed: ${errorMessage}`);
      
      if (this.options.fallbackStrategy === 'error') {
        throw error;
      }
    }

    return result;
  }

  /**
   * Enhanced FLVAR file discovery with multi-project support
   */
  private async discoverFLVARFiles(inputPath?: string, result?: VariableProcessingResult): Promise<string[]> {
    // Use explicitly provided files first
    if (this.options.flvarFiles && this.options.flvarFiles.length > 0) {
      return this.resolveFLVARFilePaths(this.options.flvarFiles);
    }

    if (!this.options.autoDiscoverFLVAR || !inputPath) {
      return [];
    }

    const discoveredFiles: string[] = [];

    try {
      // Primary discovery: find project root and search from there
      const projectPath = this.findProjectPath(inputPath);
      if (projectPath) {
        const primaryFiles = await this.flvarParser.findFLVARFiles(projectPath);
        discoveredFiles.push(...primaryFiles);
      }

      // Enhanced discovery: search in custom paths
      for (const searchPath of this.options.searchPaths) {
        try {
          const searchFiles = await this.flvarParser.findFLVARFiles(searchPath);
          discoveredFiles.push(...searchFiles);
        } catch (error) {
          result?.warnings.push(`Failed to search in custom path ${searchPath}: ${error}`);
        }
      }

      // Multi-project discovery: look for nested projects
      if (this.options.multiProjectSupport && projectPath) {
        const nestedProjects = await this.findNestedProjects(projectPath);
        for (const nestedProject of nestedProjects) {
          try {
            const nestedFiles = await this.flvarParser.findFLVARFiles(nestedProject);
            discoveredFiles.push(...nestedFiles);
          } catch (error) {
            result?.warnings.push(`Failed to process nested project ${nestedProject}: ${error}`);
          }
        }
      }

    } catch (error) {
      result?.warnings.push(`FLVAR discovery failed: ${error}`);
    }

    // Remove duplicates and return resolved paths
    const uniqueFiles = [...new Set(discoveredFiles)];
    return this.resolveFLVARFilePaths(uniqueFiles);
  }

  /**
   * Resolve FLVAR file paths using enhanced path resolver
   */
  private resolveFLVARFilePaths(flvarFiles: string[]): string[] {
    return flvarFiles.map(filePath => {
      const resolution = this.pathResolver.resolveVariablePath(filePath);
      
      if (!resolution.exists && this.options.fallbackStrategy === 'error') {
        throw new Error(`FLVAR file not found: ${filePath}`);
      }
      
      return resolution.resolvedPath;
    }).filter(path => {
      // Filter out non-existent files unless we're in error mode
      const resolution = this.pathResolver.resolveVariablePath(path);
      return resolution.exists || this.options.fallbackStrategy !== 'ignore';
    });
  }

  /**
   * Parse variable files with enhanced error handling
   */
  private async parseVariableFiles(flvarFiles: string[], result: VariableProcessingResult): Promise<VariableSet[]> {
    const variableSets: VariableSet[] = [];

    for (const filePath of flvarFiles) {
      try {
        const variableSet = await this.flvarParser.parseFile(filePath);
        variableSets.push(variableSet);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.warnings.push(`Failed to parse FLVAR file ${filePath}: ${errorMessage}`);
        
        if (this.options.fallbackStrategy === 'error') {
          throw error;
        }
      }
    }

    return variableSets;
  }

  /**
   * Process variable references with enhanced missing variable handling
   */
  private processVariableReferences(
    content: string, 
    variables: any[], 
    conversionOptions: VariableConversionOptions, 
    result: VariableProcessingResult
  ): string {
    let processedContent = content;

    try {
      // Use the standard variable converter
      processedContent = this.variableConverter.processVariableReferences(content, variables, conversionOptions);

      // Detect missing variable references
      this.detectMissingVariables(processedContent, variables, result);

    } catch (error) {
      result.warnings.push(`Variable reference processing failed: ${error}`);
      
      if (this.options.fallbackStrategy === 'error') {
        throw error;
      }
    }

    return processedContent;
  }

  /**
   * Detect missing variable references and suggest alternatives
   */
  private detectMissingVariables(
    content: string, 
    availableVariables: any[], 
    result: VariableProcessingResult
  ): void {
    const variableNames = new Set(availableVariables.map(v => v.name));
    const lines = content.split('\n');

    // Look for unresolved variable patterns
    const variablePatterns = [
      /\{([^}]+)\}/g,  // {VariableName}
      /\[%=([^%]+)%\]/g,  // [%=VariableName%]
      /%([^%]+)%/g  // %VariableName%
    ];

    lines.forEach((line, index) => {
      variablePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const varName = match[1].trim();
          
          if (!variableNames.has(varName)) {
            const suggestions = this.findSimilarVariables(varName, Array.from(variableNames));
            
            result.missingVariables.push({
              name: varName,
              context: line.trim(),
              line: index + 1,
              suggestions
            });
          }
        }
      });
    });
  }

  /**
   * Find similar variable names for suggestions
   */
  private findSimilarVariables(target: string, available: string[]): string[] {
    const suggestions: string[] = [];
    const targetLower = target.toLowerCase();

    // Find exact partial matches
    available.forEach(name => {
      const nameLower = name.toLowerCase();
      if (nameLower.includes(targetLower) || targetLower.includes(nameLower)) {
        suggestions.push(name);
      }
    });

    // If no partial matches, find by edit distance (simple implementation)
    if (suggestions.length === 0) {
      available.forEach(name => {
        if (this.calculateEditDistance(targetLower, name.toLowerCase()) <= 2) {
          suggestions.push(name);
        }
      });
    }

    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  /**
   * Calculate simple edit distance between two strings
   */
  private calculateEditDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) {
      matrix[i][0] = i;
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * Handle case when no variables are found
   */
  private handleNoVariables(input: string, result: VariableProcessingResult): VariableProcessingResult {
    if (this.options.variableMode === 'reference' || this.options.variableMode === 'include') {
      // Even without FLVAR files, we can process variable references
      const conversionOptions = this.buildConversionOptions();
      result.content = this.variableConverter.processVariableReferences(input, [], conversionOptions);
    }
    
    return result;
  }

  /**
   * Build conversion options for the variable converter
   */
  private buildConversionOptions(): VariableConversionOptions {
    // Map our mode to the expected type
    const mode: 'include' | 'reference' | 'flatten' = 
      this.options.variableMode === 'inline' ? 'flatten' : 
      this.options.variableMode === 'reference' ? 'reference' : 'include';
    
    return {
      mode,
      format: 'asciidoc',
      variableFileName: this.options.variablesOutputPath ? 
        this.options.variablesOutputPath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'variables' : 
        'variables',
      nameConvention: this.options.nameConvention
    };
  }

  /**
   * Check if file generation should be skipped
   */
  private shouldSkipFileGeneration(): boolean {
    return this.options.variableMode === 'inline' || 
           this.options.variableMode === 'reference';
  }

  /**
   * Update path resolver with project structure information
   */
  private updatePathResolverWithProjectStructure(structure: ProjectStructure): void {
    const newOptions: Partial<PathResolutionOptions> = {
      baseDir: structure.projectRoot
    };

    if (structure.variablesDir) {
      newOptions.assetPaths = [...this.options.searchPaths, structure.variablesDir];
    }

    this.pathResolver.updateOptions(newOptions);
  }

  /**
   * Find project path using enhanced detection
   */
  private findProjectPath(inputPath: string): string | null {
    const structure = this.pathResolver.detectProjectStructure(inputPath);
    return structure.projectRoot;
  }

  /**
   * Find nested projects for multi-project support
   */
  private async findNestedProjects(projectPath: string): Promise<string[]> {
    // Implementation would search for nested MadCap projects
    // This is a simplified version - could be expanded based on needs
    return [];
  }

  /**
   * Update processing options
   */
  updateOptions(newOptions: Partial<EnhancedVariableOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    // Update path resolver if relevant options changed
    const pathOptions: Partial<PathResolutionOptions> = {};
    if (newOptions.baseDir) pathOptions.baseDir = newOptions.baseDir;
    if (newOptions.searchPaths) pathOptions.assetPaths = newOptions.searchPaths;
    
    this.pathResolver.updateOptions(pathOptions);
  }

  /**
   * Get current processing options
   */
  getOptions(): EnhancedVariableOptions {
    return { ...this.options };
  }
}

/**
 * Convenience function for processing variables with enhanced features
 */
export async function processVariablesEnhanced(
  input: string,
  inputPath?: string,
  options?: Partial<EnhancedVariableOptions>
): Promise<VariableProcessingResult> {
  const processor = new EnhancedVariableProcessor(options);
  return processor.processVariables(input, inputPath);
}
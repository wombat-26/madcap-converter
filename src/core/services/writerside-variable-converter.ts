import { MadCapVariable, VariableSet } from './flvar-parser.js';

export interface WritersideVariable {
  name: string;
  value: string;
  instance?: string;
  comment?: string;
}

export interface WritersideVariableFile {
  variables: WritersideVariable[];
  content: string;
  fileName: string;
}

export interface VariableConversionOptions {
  /** How to handle variables in output */
  mode: 'flatten' | 'include' | 'reference';
  
  /** Output format for variables file */
  format: 'writerside' | 'asciidoc';
  
  /** Variable file name (without extension) */
  variableFileName?: string;
  
  /** Convert variable names to different naming convention */
  nameConvention?: 'camelCase' | 'snake_case' | 'kebab-case' | 'original';
  
  /** Instance name for Writerside conditional variables */
  instanceName?: string;
  
  /** Prefix for variable names to avoid conflicts */
  prefix?: string;
  
  /** Filter variables by name patterns (regex) */
  includePatterns?: string[];
  excludePatterns?: string[];
}

/**
 * Converter for MadCap variables to Writerside format
 * Handles conversion from FLVAR format to Writerside v.list format
 */
export class WritersideVariableConverter {

  /**
   * Convert MadCap variables to Writerside format
   */
  convertVariables(variables: MadCapVariable[], options: VariableConversionOptions): WritersideVariable[] {
    return variables
      .filter(variable => this.shouldIncludeVariable(variable, options))
      .map(variable => this.convertVariable(variable, options));
  }

  /**
   * Convert a single MadCap variable to Writerside format
   */
  private convertVariable(madcapVar: MadCapVariable, options: VariableConversionOptions): WritersideVariable {
    let name = madcapVar.name;
    
    // Apply naming convention
    switch (options.nameConvention) {
      case 'camelCase':
        name = this.toCamelCase(name);
        break;
      case 'snake_case':
        name = this.toSnakeCase(name);
        break;
      case 'kebab-case':
        name = this.toKebabCase(name);
        break;
      case 'original':
      default:
        // Keep original name
        break;
    }
    
    // Apply prefix if specified
    if (options.prefix) {
      name = `${options.prefix}${name}`;
    }
    
    const writersideVar: WritersideVariable = {
      name,
      value: madcapVar.value,
      comment: madcapVar.comment,
      instance: options.instanceName
    };
    
    return writersideVar;
  }

  /**
   * Generate Writerside variable file content
   */
  generateWritersideFile(variables: WritersideVariable[], options: VariableConversionOptions): WritersideVariableFile {
    const fileName = options.variableFileName || 'v.list';
    
    let content = '';
    
    // Add header comment
    content += '<?xml version="1.0" encoding="UTF-8"?>\n';
    content += '<!DOCTYPE variables SYSTEM "https://resources.jetbrains.com/writerside/1.0/xhtml-entities.dtd">\n\n';
    content += '<!-- Generated from MadCap FLVAR files -->\n';
    content += '<vars>\n';
    
    // Add variables
    for (const variable of variables) {
      if (variable.comment) {
        content += `    <!-- ${variable.comment} -->\n`;
      }
      
      content += '    <var';
      content += ` name="${this.escapeXml(variable.name)}"`;
      content += ` value="${this.escapeXml(variable.value)}"`;
      
      if (variable.instance) {
        content += ` instance="${this.escapeXml(variable.instance)}"`;
      }
      
      content += '/>\n';
    }
    
    content += '</vars>\n';
    
    return {
      variables,
      content,
      fileName
    };
  }

  /**
   * Generate AsciiDoc attributes file content
   */
  generateAsciiDocFile(variables: WritersideVariable[], options: VariableConversionOptions): WritersideVariableFile {
    const fileName = options.variableFileName || 'variables.adoc';
    
    let content = '';
    
    // Add header comment
    content += '// Generated from MadCap FLVAR files\n';
    content += '// AsciiDoc attributes file\n\n';
    
    // Add variables as AsciiDoc attributes
    for (const variable of variables) {
      if (variable.comment) {
        content += `// ${variable.comment}\n`;
      }
      
      const attrName = this.toAsciiDocAttributeName(variable.name);
      content += `:${attrName}: ${variable.value}\n`;
    }
    
    return {
      variables,
      content,
      fileName
    };
  }

  /**
   * Process variable references in content
   */
  processVariableReferences(content: string, variables: WritersideVariable[], options: VariableConversionOptions): string {
    // Add null/undefined safety check
    if (!content || typeof content !== 'string') {
      return content || '';
    }
    
    let processedContent = content;
    
    if (options.mode === 'flatten') {
      // Replace variable references with actual values
      for (const variable of variables) {
        // Add safety checks for variable properties
        if (!variable || !variable.name || variable.value === undefined) {
          continue;
        }
        
        // Handle MadCap HTML variable format: <MadCap:variable name="VariableSet.VariableName" />
        const madcapHtmlPattern = new RegExp(`<MadCap:variable\\s+name="[^.]*\\.${this.escapeRegex(variable.name)}"\\s*/>`, 'gi');
        const madcapHtmlPatternNoNamespace = new RegExp(`<MadCap:variable\\s+name="${this.escapeRegex(variable.name)}"\\s*/>`, 'gi');
        
        processedContent = processedContent.replace(madcapHtmlPattern, variable.value || '');
        processedContent = processedContent.replace(madcapHtmlPatternNoNamespace, variable.value || '');
      }
    } else if (options.mode === 'reference') {
      // Convert MadCap variable references to target format
      if (options.format === 'asciidoc') {
        // Convert to AsciiDoc attribute references
        processedContent = processedContent.replace(
          /<MadCap:variable\s+name="([^"]+)"\s*\/>/gi,
          (match, varName) => {
            // For AsciiDoc, preserve the original variable name structure but clean it
            // If no variables data available, keep namespace for clarity
            let finalVarName = varName;
            
            // If we have variable data, try to find a matching variable and use its cleaned name
            if (variables && variables.length > 0) {
              const matchingVar = variables.find(v => 
                v.name === varName || 
                varName.endsWith('.' + v.name) ||
                varName.split('.').pop() === v.name
              );
              if (matchingVar) {
                finalVarName = matchingVar.name;
              } else {
                // Strip namespace from variable name for AsciiDoc
                finalVarName = varName.includes('.') ? varName.split('.').pop() || varName : varName;
              }
            } else {
              // No variable data - just clean the name but keep readable format
              finalVarName = varName.includes('.') ? varName.split('.').pop() || varName : varName;
            }
            
            const attrName = this.toAsciiDocAttributeName(finalVarName);
            return `{${attrName}}`;
          }
        );
      } else {
        // Convert to Writerside format
        processedContent = processedContent.replace(
          /<MadCap:variable\s+name="([^"]+)"\s*\/>/gi,
          (match, varName) => {
            // For Writerside, use <var name="varName"/> format
            return `<var name="${varName}"/>`;
          }
        );
      }
    } else if (options.mode === 'include') {
      // For include mode, convert to target format references
      if (options.format === 'asciidoc') {
        // Convert to AsciiDoc attribute references (same as reference mode for AsciiDoc)
        processedContent = processedContent.replace(
          /<MadCap:variable\s+name="([^"]+)"\s*\/>/gi,
          (match, varName) => {
            // For AsciiDoc, preserve the original variable name structure but clean it
            // If no variables data available, keep namespace for clarity
            let finalVarName = varName;
            
            // If we have variable data, try to find a matching variable and use its cleaned name
            if (variables && variables.length > 0) {
              const matchingVar = variables.find(v => 
                v.name === varName || 
                varName.endsWith('.' + v.name) ||
                varName.split('.').pop() === v.name
              );
              if (matchingVar) {
                finalVarName = matchingVar.name;
              } else {
                // Strip namespace from variable name for AsciiDoc
                finalVarName = varName.includes('.') ? varName.split('.').pop() || varName : varName;
              }
            } else {
              // No variable data - just clean the name but keep readable format
              finalVarName = varName.includes('.') ? varName.split('.').pop() || varName : varName;
            }
            
            const attrName = this.toAsciiDocAttributeName(finalVarName);
            return `{${attrName}}`;
          }
        );
      } else {
        // For Writerside include mode, use <var name="varName"/>
        // The include directive will be in the file header
        processedContent = processedContent.replace(
          /<MadCap:variable\s+name="([^"]+)"\s*\/>/gi,
          (match, varName) => {
            return `<var name="${varName}"/>`;
          }
        );
      }
    }
    
    return processedContent;
  }

  /**
   * Check if variable should be included based on filters
   */
  private shouldIncludeVariable(variable: MadCapVariable, options: VariableConversionOptions): boolean {
    // Check exclude patterns first
    if (options.excludePatterns) {
      for (const pattern of options.excludePatterns) {
        if (new RegExp(pattern).test(variable.name)) {
          return false;
        }
      }
    }
    
    // Check include patterns
    if (options.includePatterns && options.includePatterns.length > 0) {
      for (const pattern of options.includePatterns) {
        if (new RegExp(pattern).test(variable.name)) {
          return true;
        }
      }
      return false; // No include patterns matched
    }
    
    return true; // No filters or passed all filters
  }

  /**
   * Convert to camelCase
   */
  private toCamelCase(str: string): string {
    // Add safety check for str parameter
    if (!str || typeof str !== 'string') {
      return str || '';
    }
    
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  /**
   * Convert to snake_case
   */
  private toSnakeCase(str: string): string {
    // Add safety check for str parameter
    if (!str || typeof str !== 'string') {
      return str || '';
    }
    
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/^_/, '');
  }

  /**
   * Convert to kebab-case
   */
  private toKebabCase(str: string): string {
    // Add safety check for str parameter
    if (!str || typeof str !== 'string') {
      return str || '';
    }
    
    return str
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/^-/, '');
  }

  /**
   * Convert to AsciiDoc attribute name (kebab-case, no special chars)
   */
  private toAsciiDocAttributeName(str: string): string {
    // Add safety check for str parameter
    if (!str || typeof str !== 'string') {
      return str || '';
    }
    
    return str
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-/, '')
      .replace(/-$/, '');
  }

  /**
   * Escape XML attribute values
   */
  private escapeXml(str: string): string {
    // Add safety check for str parameter
    if (!str || typeof str !== 'string') {
      return str || '';
    }
    
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Escape string for use in regex
   */
  private escapeRegex(str: string): string {
    // Add safety check for str parameter
    if (!str || typeof str !== 'string') {
      return str || '';
    }
    
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
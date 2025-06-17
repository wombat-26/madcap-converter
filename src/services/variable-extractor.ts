import { ExtractedVariable, VariableExtractionOptions } from '../types/index.js';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { JSDOM } from 'jsdom';

/**
 * Service for extracting MadCap variables and generating format-specific variable files
 */
export class VariableExtractor {
  private extractedVariables: Map<string, ExtractedVariable> = new Map();

  /**
   * Add a variable to the extraction collection
   */
  addVariable(variable: ExtractedVariable): void {
    this.extractedVariables.set(variable.name, variable);
  }

  /**
   * Get all extracted variables
   */
  getVariables(): ExtractedVariable[] {
    return Array.from(this.extractedVariables.values());
  }

  /**
   * Clear all extracted variables
   */
  clear(): void {
    this.extractedVariables.clear();
  }

  /**
   * Generate variables file content based on format
   */
  generateVariablesFile(options: VariableExtractionOptions): string {
    const variables = this.getVariables();
    
    if (variables.length === 0) {
      return '';
    }

    if (!options.variableFormat) {
      throw new Error('Variable format is required');
    }

    switch (options.variableFormat) {
      case 'adoc':
        return this.generateAsciiDocVariables(variables, options);
      case 'writerside':
        return this.generateWritersideVariables(variables, options);
      default:
        throw new Error(`Unsupported variable format: ${options.variableFormat}`);
    }
  }

  /**
   * Generate AsciiDoc attributes file
   */
  private generateAsciiDocVariables(variables: ExtractedVariable[], options: VariableExtractionOptions): string {
    const lines: string[] = [
      '// Generated AsciiDoc variables from MadCap conversion',
      '// This file contains document attributes for variable substitution',
      ''
    ];

    if (options.preserveVariableStructure) {
      // Group by namespace
      const namespaces = this.groupByNamespace(variables);
      
      for (const [namespace, vars] of namespaces) {
        if (namespace) {
          lines.push(`// ${namespace} Variables`);
        }
        
        for (const variable of vars) {
          const attrName = this.sanitizeAsciiDocAttributeName(variable.name);
          const attrValue = this.escapeAsciiDocAttributeValue(variable.value);
          lines.push(`:${attrName}: ${attrValue}`);
        }
        
        lines.push('');
      }
    } else {
      // Flat structure
      for (const variable of variables) {
        const attrName = this.sanitizeAsciiDocAttributeName(variable.name);
        const attrValue = this.escapeAsciiDocAttributeValue(variable.value);
        lines.push(`:${attrName}: ${attrValue}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate Writerside variables file (XML format)
   */
  private generateWritersideVariables(variables: ExtractedVariable[], options: VariableExtractionOptions): string {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE vars SYSTEM "https://resources.jetbrains.com/writerside/1.0/vars.dtd">',
      '',
      '<!-- Generated Writerside variables from MadCap conversion -->',
      '<vars>'
    ];

    if (options.preserveVariableStructure) {
      // Group by namespace
      const namespaces = this.groupByNamespace(variables);
      
      for (const [namespace, vars] of namespaces) {
        if (namespace) {
          lines.push(`    <!-- ${namespace} Variables -->`);
        }
        
        for (const variable of vars) {
          const varName = this.sanitizeWritersideVariableName(variable.name);
          const varValue = this.escapeXmlAttributeValue(variable.value);
          lines.push(`    <var name="${varName}" value="${varValue}"/>`);
        }
        
        if (namespace) {
          lines.push('');
        }
      }
    } else {
      // Flat structure
      for (const variable of variables) {
        const varName = this.sanitizeWritersideVariableName(variable.name);
        const varValue = this.escapeXmlAttributeValue(variable.value);
        lines.push(`    <var name="${varName}" value="${varValue}"/>`);
      }
    }

    lines.push('</vars>');
    return lines.join('\n');
  }

  /**
   * Group variables by namespace
   */
  private groupByNamespace(variables: ExtractedVariable[]): Map<string | undefined, ExtractedVariable[]> {
    const groups = new Map<string | undefined, ExtractedVariable[]>();
    
    for (const variable of variables) {
      const namespace = variable.namespace;
      if (!groups.has(namespace)) {
        groups.set(namespace, []);
      }
      groups.get(namespace)!.push(variable);
    }
    
    // Sort groups: undefined namespace first, then alphabetically
    const sortedGroups = new Map<string | undefined, ExtractedVariable[]>();
    
    // Add undefined namespace first if it exists
    if (groups.has(undefined)) {
      sortedGroups.set(undefined, groups.get(undefined)!);
    }
    
    // Add other namespaces alphabetically
    const sortedNamespaces = Array.from(groups.keys())
      .filter(ns => ns !== undefined)
      .sort();
      
    for (const namespace of sortedNamespaces) {
      sortedGroups.set(namespace, groups.get(namespace)!);
    }
    
    return sortedGroups;
  }

  /**
   * Sanitize variable name for AsciiDoc attributes
   */
  private sanitizeAsciiDocAttributeName(name: string): string {
    // AsciiDoc attribute names must start with letter/underscore and contain only alphanumeric, hyphen, underscore
    return name
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/^[^a-zA-Z_]/, '_')
      .toLowerCase();
  }

  /**
   * Escape AsciiDoc attribute value
   */
  private escapeAsciiDocAttributeValue(value: string): string {
    // Don't quote values - AsciiDoc handles values without quotes properly
    // Just escape any problematic characters if needed
    return value.replace(/\\/g, '\\\\'); // Escape backslashes
  }

  /**
   * Sanitize variable name for Writerside
   */
  private sanitizeWritersideVariableName(name: string): string {
    // Writerside variable names should be valid XML names
    return name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^[^a-zA-Z_]/, '_');
  }

  /**
   * Escape XML attribute value
   */
  private escapeXmlAttributeValue(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get variable reference for use in content
   */
  getVariableReference(variableName: string, format: 'adoc' | 'writerside'): string {
    switch (format) {
      case 'adoc':
        const attrName = this.sanitizeAsciiDocAttributeName(variableName);
        return `{${attrName}}`;
      case 'writerside':
        const varName = this.sanitizeWritersideVariableName(variableName);
        return `%${varName}%`;
      default:
        throw new Error(`Unsupported format for variable reference: ${format}`);
    }
  }

  /**
   * Parse MadCap variable name into namespace and key
   */
  static parseVariableName(name: string): { namespace?: string; key: string } {
    const parts = name.split('.');
    if (parts.length >= 2) {
      return {
        namespace: parts[0],
        key: parts.slice(1).join('.')
      };
    }
    return {
      key: name
    };
  }

  /**
   * Create ExtractedVariable from MadCap variable
   */
  static createExtractedVariable(
    name: string, 
    value: string, 
    source: 'madcap' | 'fallback' = 'madcap'
  ): ExtractedVariable {
    const parsed = this.parseVariableName(name);
    return {
      name,
      value,
      namespace: parsed.namespace,
      key: parsed.key,
      source
    };
  }

  /**
   * Extract all variables from .flvar files in the Flare project directory
   */
  async extractAllVariablesFromProject(projectDir: string): Promise<void> {
    const flvarFiles = await this.findFlvarFiles(projectDir);
    
    for (const flvarFile of flvarFiles) {
      try {
        await this.extractVariablesFromFlvarFile(flvarFile);
      } catch (error) {
        // Only warn about non ._ files
        const filename = flvarFile.split('/').pop() || '';
        if (!filename.startsWith('._')) {
          console.warn(`Failed to extract variables from ${flvarFile}:`, error);
        }
      }
    }
  }

  /**
   * Find all .flvar files in the project directory
   */
  private async findFlvarFiles(projectDir: string): Promise<string[]> {
    const flvarFiles: string[] = [];
    
    const searchDirectories = [
      join(projectDir, 'Project', 'VariableSets'),
      join(projectDir, 'Content', 'Resources', 'Variables'),
      join(projectDir, 'Content', 'Variables'),
      join(projectDir, 'Variables'),
      join(projectDir, 'VariableSets'),
      projectDir // Also search the root directory
    ];

    for (const searchDir of searchDirectories) {
      try {
        const files = await this.findFlvarFilesRecursive(searchDir);
        flvarFiles.push(...files);
      } catch (error) {
        // Directory might not exist, continue with next search location
        continue;
      }
    }

    // Remove duplicates
    return Array.from(new Set(flvarFiles));
  }

  /**
   * Recursively find .flvar files in a directory
   */
  private async findFlvarFilesRecursive(directory: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await readdir(directory);
      
      for (const entry of entries) {
        const fullPath = join(directory, entry);
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          // Recursively search subdirectories
          const subFiles = await this.findFlvarFilesRecursive(fullPath);
          files.push(...subFiles);
        } else if (stats.isFile() && extname(entry).toLowerCase() === '.flvar' && !entry.startsWith('._')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
    
    return files;
  }

  /**
   * Extract variables from a single .flvar file
   */
  private async extractVariablesFromFlvarFile(flvarPath: string): Promise<void> {
    // Skip files starting with ._
    const filename = flvarPath.split('/').pop() || '';
    if (filename.startsWith('._')) {
      return;
    }
    
    try {
      const content = await readFile(flvarPath, 'utf8');
      const dom = new JSDOM(content, { contentType: 'text/xml' });
      const document = dom.window.document;
      
      // Find all variable elements in the .flvar file
      const variables = document.querySelectorAll('Variable');
      
      for (const variableElement of variables) {
        const name = variableElement.getAttribute('Name');
        if (!name) continue;
        
        // Get the variable value - could be text content or in a definition element
        let value = '';
        
        // Try to get value from Definition element
        const definitionElement = variableElement.querySelector('Definition');
        if (definitionElement) {
          value = definitionElement.textContent?.trim() || '';
        } else {
          // Fallback to direct text content
          value = variableElement.textContent?.trim() || '';
        }
        
        // Clean up any XML artifacts from the value
        value = this.cleanVariableValue(value);
        
        if (value) {
          const extractedVariable = VariableExtractor.createExtractedVariable(name, value, 'madcap');
          this.addVariable(extractedVariable);
        }
      }
    } catch (error) {
      throw new Error(`Failed to parse .flvar file ${flvarPath}: ${error}`);
    }
  }

  /**
   * Clean variable value from XML artifacts
   */
  private cleanVariableValue(value: string): string {
    return value
      .replace(/^\s*<!\[CDATA\[/, '') // Remove CDATA start
      .replace(/\]\]>\s*$/, '') // Remove CDATA end
      .replace(/&lt;/g, '<') // Decode HTML entities
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
  }
}
import { ExtractedVariable, VariableExtractionOptions } from '../types/index.js';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { JSDOM } from 'jsdom';
import { FLVARParser } from './flvar-parser';

/**
 * Service for extracting MadCap variables and generating format-specific variable files
 */
export class VariableExtractor {
  private extractedVariables: Map<string, ExtractedVariable> = new Map();
  private flvarParser: FLVARParser;

  constructor() {
    this.flvarParser = new FLVARParser();
  }

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
    
    if (!options.variableFormat) {
      throw new Error('Variable format is required');
    }

    // Generate empty file with proper headers even when no variables exist
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
    // AsciiDoc attribute names - use kebab-case for consistency with writerside-variable-converter
    return name
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-/, '')
      .replace(/-$/, '');
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
    console.log(`🔍 [BREADCRUMB] extractAllVariablesFromProject() ENTRY POINT`);
    console.log(`🔍 [BREADCRUMB] About to call this.findFlvarFiles()`);
    const flvarFiles = await this.findFlvarFiles(projectDir);
    console.log(`🔍 [BREADCRUMB] findFlvarFiles() returned ${flvarFiles.length} files`);
    
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
    console.log(`🔍 [VariableExtractor] Searching for .flvar files in project directory: ${projectDir}`);
    const flvarFiles: string[] = [];
    
    const searchDirectories = [
      join(projectDir, 'Project', 'VariableSets'),
      join(projectDir, 'Content', 'Resources', 'Variables'),
      join(projectDir, 'Content', 'Variables'),
      join(projectDir, 'Variables'),
      join(projectDir, 'VariableSets'),
      projectDir // Also search the root directory
    ];

    console.log(`🔍 [VariableExtractor] Will search in directories:`, searchDirectories);

    for (const searchDir of searchDirectories) {
      try {
        console.log(`🔍 [VariableExtractor] Searching directory: ${searchDir}`);
        const files = await this.findFlvarFilesRecursive(searchDir);
        console.log(`📁 [VariableExtractor] Found ${files.length} .flvar files in ${searchDir}:`, files);
        flvarFiles.push(...files);
      } catch (error) {
        console.log(`⚠️ [VariableExtractor] Could not search directory ${searchDir}: ${error}`);
        // Directory might not exist, continue with next search location
        continue;
      }
    }

    console.log(`📚 [VariableExtractor] Total .flvar files found before deduplication: ${flvarFiles.length}`);
    
    // Remove duplicates
    const uniqueFiles = Array.from(new Set(flvarFiles));
    console.log(`📚 [VariableExtractor] Unique .flvar files after deduplication: ${uniqueFiles.length}`, uniqueFiles);
    
    // FALLBACK: If no .flvar files found in expected locations, search all uploaded files
    if (uniqueFiles.length === 0) {
      console.log(`🔍 [VariableExtractor FALLBACK] No .flvar files found in expected directories, searching all uploaded files...`);
      try {
        const fallbackFiles = await this.findFlvarFilesRecursive(projectDir);
        console.log(`📚 [VariableExtractor FALLBACK] Found ${fallbackFiles.length} .flvar files in fallback search:`, fallbackFiles);
        return fallbackFiles;
      } catch (error) {
        console.error(`❌ [VariableExtractor FALLBACK] Fallback search failed:`, error);
      }
    }
    
    return uniqueFiles;
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
      console.log(`🔧 [VariableExtractor] Parsing FLVAR file with FLVARParser: ${flvarPath}`);
      
      // Use the FLVARParser that we know works
      const variableSet = await this.flvarParser.parseFile(flvarPath);
      
      console.log(`🔧 [VariableExtractor] FLVARParser found ${variableSet.variables.length} variables in ${variableSet.name}`);
      
      // Convert MadCapVariable objects to ExtractedVariable objects
      for (const madcapVariable of variableSet.variables) {
        if (madcapVariable.name && madcapVariable.value) {
          const extractedVariable = VariableExtractor.createExtractedVariable(
            madcapVariable.name, 
            madcapVariable.value, 
            'madcap'
          );
          this.addVariable(extractedVariable);
          
          console.log(`✅ [VariableExtractor] Added variable: ${madcapVariable.name} = "${madcapVariable.value}"`);
        }
      }
      
      console.log(`🔧 [VariableExtractor] Total variables now stored: ${this.getVariables().length}`);
      
    } catch (error) {
      console.error(`❌ [VariableExtractor] Failed to parse FLVAR file ${flvarPath}:`, error);
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
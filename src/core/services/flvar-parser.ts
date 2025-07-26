import { JSDOM } from 'jsdom';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';

export interface MadCapVariable {
  name: string;
  value: string;
  comment?: string;
  type?: string;
  definition?: string;
  originalName?: string;
  lastUpdated?: string;
}

export interface VariableSet {
  name: string;
  variables: MadCapVariable[];
  filePath: string;
}

/**
 * Parser for MadCap FLVAR (Variable Set) files
 * Extracts variable definitions from CatapultVariableSet XML format
 */
export class FLVARParser {
  
  /**
   * Parse a single FLVAR file
   */
  async parseFile(filePath: string): Promise<VariableSet> {
    try {
      const content = await readFile(filePath, 'utf8');
      return this.parseContent(content, filePath);
    } catch (error) {
      throw new Error(`Failed to parse FLVAR file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse FLVAR content from string
   */
  parseContent(content: string, filePath: string): VariableSet {
    // Parse XML using JSDOM
    const dom = new JSDOM(content, { contentType: 'text/xml' });
    const document = dom.window.document;

    // Check for parse errors
    const parseError = document.querySelector('parsererror');
    if (parseError) {
      throw new Error(`XML parsing error in ${filePath}: ${parseError.textContent}`);
    }

    // Find the CatapultVariableSet root element
    const variableSet = document.querySelector('CatapultVariableSet');
    if (!variableSet) {
      throw new Error(`Invalid FLVAR file: Missing CatapultVariableSet root element in ${filePath}`);
    }

    // Extract all Variable elements
    const variableElements = variableSet.querySelectorAll('Variable');
    const variables: MadCapVariable[] = [];

    variableElements.forEach(element => {
      const variable = this.parseVariableElement(element);
      if (variable) {
        variables.push(variable);
      }
    });

    // Extract file name for variable set name
    const fileName = filePath.split('/').pop()?.replace('.flvar', '') || 'Unknown';

    return {
      name: fileName,
      variables,
      filePath
    };
  }

  /**
   * Parse a single Variable element
   */
  private parseVariableElement(element: Element): MadCapVariable | null {
    const name = element.getAttribute('Name');
    if (!name) {
      console.warn('Variable element missing Name attribute, skipping');
      return null;
    }

    // MadCap stores the actual value in EvaluatedDefinition attribute
    // or falls back to the text content
    const evaluatedDefinition = element.getAttribute('EvaluatedDefinition');
    const textContent = element.textContent?.trim();
    const definition = element.getAttribute('Definition');
    
    // Priority: EvaluatedDefinition > textContent > Definition
    const value = evaluatedDefinition || textContent || definition || '';

    const variable: MadCapVariable = {
      name,
      value,
      comment: element.getAttribute('Comment') || undefined,
      type: element.getAttribute('Type') || undefined,
      definition: definition || undefined,
      originalName: element.getAttribute('OriginalName') || undefined,
      lastUpdated: element.getAttribute('LastUpdated') || undefined
    };

    return variable;
  }

  /**
   * Parse multiple FLVAR files from a directory or list
   */
  async parseMultipleFiles(filePaths: string[]): Promise<VariableSet[]> {
    const variableSets: VariableSet[] = [];
    
    for (const filePath of filePaths) {
      try {
        const variableSet = await this.parseFile(filePath);
        variableSets.push(variableSet);
      } catch (error) {
        console.warn(`Failed to parse ${filePath}:`, error instanceof Error ? error.message : String(error));
        // Continue with other files
      }
    }
    
    return variableSets;
  }

  /**
   * Find all FLVAR files in a MadCap project
   */
  async findFLVARFiles(projectPath: string): Promise<string[]> {
    // Try to find the VariableSets directory
    const variableSetsPath = resolve(projectPath, 'Project', 'VariableSets');
    
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(variableSetsPath);
      
      return files
        .filter(file => file.endsWith('.flvar') && !file.startsWith('._'))
        .map(file => resolve(variableSetsPath, file));
    } catch (error) {
      // If VariableSets directory doesn't exist, return empty array
      console.warn(`Could not find VariableSets directory at ${variableSetsPath}`);
      return [];
    }
  }

  /**
   * Get all unique variables from multiple variable sets
   * Later variable sets override earlier ones with the same name
   */
  mergeVariableSets(variableSets: VariableSet[]): MadCapVariable[] {
    const mergedVariables = new Map<string, MadCapVariable>();
    
    // Process in order, later ones override earlier ones
    for (const variableSet of variableSets) {
      for (const variable of variableSet.variables) {
        mergedVariables.set(variable.name, variable);
      }
    }
    
    return Array.from(mergedVariables.values());
  }
}
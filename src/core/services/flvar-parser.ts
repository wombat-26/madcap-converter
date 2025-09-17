import { JSDOM } from 'jsdom';
import { readFile } from 'fs/promises';
import { resolve, dirname, basename } from 'path';

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
    const { readdir } = await import('fs/promises');
    
    // Check if this looks like a temp upload directory
    const isTempUpload = projectPath.includes('batch-convert') || projectPath.includes('/tmp/') || basename(projectPath) === 'input';
    
    if (isTempUpload) {
      // For temp uploads: search recursively for .flvar files anywhere
      console.log(`🔍 [FlvarParser] Detected temp upload, searching recursively for .flvar files in: ${projectPath}`);
      try {
        const files = await this.findFilesRecursively(projectPath, '.flvar');
        console.log(`🔍 [FlvarParser] Found ${files.length} .flvar files in temp upload`);
        return files;
      } catch (error) {
        console.warn(`Could not search temp upload directory for .flvar files: ${error}`);
        return [];
      }
    } else {
      // Standard MadCap project: try the VariableSets directory first
      const variableSetsPath = resolve(projectPath, 'Project', 'VariableSets');
      
      try {
        const files = await readdir(variableSetsPath);
        return files
          .filter(file => file.endsWith('.flvar') && !file.startsWith('._'))
          .map(file => resolve(variableSetsPath, file));
      } catch (error) {
        console.warn(`Could not find VariableSets directory at ${variableSetsPath}, trying recursive search`);
        // Fallback: search recursively
        try {
          return await this.findFilesRecursively(projectPath, '.flvar');
        } catch (fallbackError) {
          console.warn(`Recursive .flvar search also failed: ${fallbackError}`);
          return [];
        }
      }
    }
  }

  private async findFilesRecursively(dir: string, extension: string): Promise<string[]> {
    const { readdir } = await import('fs/promises');
    const result: string[] = [];
    
    async function search(currentDir: string): Promise<void> {
      try {
        const entries = await readdir(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name.startsWith('._')) {
            continue; // Skip hidden files
          }
          
          const fullPath = resolve(currentDir, entry.name);
          
          if (entry.isDirectory()) {
            await search(fullPath);
          } else if (entry.isFile() && entry.name.endsWith(extension)) {
            result.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
        console.warn(`Could not read directory ${currentDir}: ${error}`);
      }
    }
    
    await search(dir);
    return result;
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
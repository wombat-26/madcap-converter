import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface GlossaryEntry {
  id: string;
  terms: string[];
  definition: string;
  conditions?: string;
  termClass?: string;
  ignoreCase?: boolean;
  link?: string;
}

export interface ParsedGlossary {
  entries: GlossaryEntry[];
  metadata: {
    totalEntries: number;
    hasConditions: boolean;
    sourceFile: string;
  };
}

export class FlgloParser {
  private readonly conditionFilters: string[];

  constructor(conditionFilters: string[] = []) {
    // Default condition filters for excluded content
    this.conditionFilters = conditionFilters.length > 0 ? conditionFilters : [
      'deprecated', 'deprecation', 'obsolete', 'legacy', 'old',
      'print only', 'print-only', 'printonly',
      'cancelled', 'canceled', 'abandoned', 'shelved',
      'hidden', 'internal', 'private', 'draft',
      'paused', 'halted', 'stopped', 'discontinued', 'retired',
      'Black', 'Red', 'Gray', 'Grey'
    ];
  }

  async parseGlossaryFile(filePath: string): Promise<ParsedGlossary> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseGlossaryContent(content, filePath);
    } catch (error) {
      throw new Error(`Failed to parse glossary file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  parseGlossaryContent(xmlContent: string, sourceFile: string = 'inline'): ParsedGlossary {
    const $ = cheerio.load(xmlContent, { xml: true });
    const entries: GlossaryEntry[] = [];
    let hasConditions = false;

    $('GlossaryEntry').each((_, element) => {
      const $entry = $(element);
      const conditions = $entry.attr('conditions') || '';
      
      // Check if entry should be filtered based on conditions
      if (this.shouldFilterEntry(conditions)) {
        return; // Skip this entry
      }

      if (conditions) {
        hasConditions = true;
      }

      // Extract terms (can be multiple)
      const terms: string[] = [];
      $entry.find('Term').each((_, termEl) => {
        const term = $(termEl).text().trim();
        if (term) {
          terms.push(term);
        }
      });

      // Extract definition
      const $definition = $entry.find('Definition');
      let definition = '';
      
      // Check if definition contains HTML elements
      if ($definition.find('p, ul, ol, li').length > 0) {
        // Get HTML content for later conversion
        definition = $definition.html() || '';
      } else {
        // Plain text definition
        definition = $definition.text().trim();
      }

      if (terms.length > 0 && definition) {
        entries.push({
          id: $entry.attr('glossTerm') || `glossary-${entries.length}`,
          terms,
          definition,
          conditions: conditions || undefined,
          termClass: $entry.attr('TermClass') || undefined,
          ignoreCase: $entry.attr('IgnoreCase') === 'true',
          link: $definition.attr('Link') || undefined
        });
      }
    });

    return {
      entries,
      metadata: {
        totalEntries: entries.length,
        hasConditions,
        sourceFile: path.basename(sourceFile)
      }
    };
  }

  private shouldFilterEntry(conditions: string): boolean {
    if (!conditions) return false;

    const conditionLower = conditions.toLowerCase();
    return this.conditionFilters.some(filter => 
      conditionLower.includes(filter.toLowerCase())
    );
  }

  async findGlossaryFiles(projectPath: string): Promise<string[]> {
    const glossaryFiles: string[] = [];
    
    async function searchDirectory(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          // Skip macOS metadata files
          if (entry.name.startsWith('._') || entry.name === '.DS_Store') {
            continue;
          }
          
          if (entry.isDirectory()) {
            // Common glossary directories in MadCap projects
            if (['Glossaries', 'Project', 'Content'].includes(entry.name)) {
              await searchDirectory(fullPath);
            }
          } else if (entry.isFile() && entry.name.endsWith('.flglo')) {
            glossaryFiles.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(`Error searching directory ${dir}:`, error);
      }
    }
    
    await searchDirectory(projectPath);
    return glossaryFiles;
  }

  // Sort entries alphabetically by first term
  sortEntriesAlphabetically(entries: GlossaryEntry[]): GlossaryEntry[] {
    return [...entries].sort((a, b) => {
      const termA = a.terms[0]?.toLowerCase() || '';
      const termB = b.terms[0]?.toLowerCase() || '';
      return termA.localeCompare(termB);
    });
  }

  // Group entries by first letter for index generation
  groupEntriesByLetter(entries: GlossaryEntry[]): Map<string, GlossaryEntry[]> {
    const grouped = new Map<string, GlossaryEntry[]>();
    
    for (const entry of entries) {
      const firstTerm = entry.terms[0];
      if (!firstTerm) continue;
      
      const firstLetter = firstTerm[0].toUpperCase();
      const letterGroup = /[A-Z]/.test(firstLetter) ? firstLetter : '#'; // Use # for non-letter starts
      
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
}
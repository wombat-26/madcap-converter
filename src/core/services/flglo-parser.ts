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
    // Use the exact condition filters provided by user - no hardcoded defaults
    // If user wants to filter "deprecated" content, they can explicitly provide it
    this.conditionFilters = conditionFilters;
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
    console.log(`📚 [FlgloParser] Parsing glossary content from: ${sourceFile} (${xmlContent.length} chars)`);
    const $ = cheerio.load(xmlContent, { xml: true });
    const entries: GlossaryEntry[] = [];
    let hasConditions = false;
    let totalEntriesFound = 0;
    let filteredEntries = 0;

    $('GlossaryEntry').each((_, element) => {
      totalEntriesFound++;
      const $entry = $(element);
      const conditions = $entry.attr('conditions') || '';
      
      // Check if entry should be filtered based on conditions
      if (this.shouldFilterEntry(conditions)) {
        filteredEntries++;
        console.log(`⚠️ [FlgloParser] Filtered entry with conditions: "${conditions}"`);
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

    console.log(`📚 [FlgloParser] Parsing results for ${sourceFile}:`);
    console.log(`  - Total entries found: ${totalEntriesFound}`);
    console.log(`  - Entries filtered out: ${filteredEntries}`);
    console.log(`  - Final entries included: ${entries.length}`);
    console.log(`  - Has conditions: ${hasConditions}`);

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
    console.log(`🔍 [FlgloParser] Searching for .flglo files in: ${projectPath}`);
    const glossaryFiles: string[] = [];
    
    // Enhanced temp upload detection
    const isTempUpload = projectPath.includes('batch-convert') || 
                        projectPath.includes('/tmp/') || 
                        path.basename(projectPath) === 'input' ||
                        path.dirname(projectPath).includes('batch-convert');
    
    console.log(`🔍 [FlgloParser] Detected ${isTempUpload ? 'temp upload' : 'standard project'} structure`);
    
    // Track search depth for temp uploads to prevent infinite recursion
    let maxDepth = isTempUpload ? 10 : 5;
    
    async function searchDirectory(dir: string, depth: number = 0): Promise<void> {
      // Prevent excessive recursion
      if (depth > maxDepth) {
        console.log(`🔍 [FlgloParser] Max depth reached (${maxDepth}) for: ${dir}`);
        return;
      }
      
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        console.log(`🔍 [FlgloParser] Checking directory: ${dir} (${entries.length} entries, depth: ${depth})`);
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          // Skip macOS metadata files and node_modules
          if (entry.name.startsWith('._') || 
              entry.name === '.DS_Store' || 
              entry.name === 'node_modules' ||
              entry.name.startsWith('.git')) {
            continue;
          }
          
          if (entry.isDirectory()) {
            // For temp uploads: search ALL directories recursively (with depth limit)
            // For standard projects: only search known MadCap directories
            const shouldRecurse = isTempUpload || 
              ['Glossaries', 'Project', 'Content', 'input', 'Resources'].includes(entry.name) || 
              dir === projectPath;
            
            if (shouldRecurse) {
              console.log(`🔍 [FlgloParser] Recursing into directory: ${entry.name} (depth ${depth + 1})`);
              await searchDirectory(fullPath, depth + 1);
            } else {
              console.log(`🔍 [FlgloParser] Skipping directory: ${entry.name} (not in standard MadCap structure)`);
            }
          } else if (entry.isFile() && entry.name.endsWith('.flglo')) {
            console.log(`📚 [FlgloParser] Found .flglo file: ${fullPath}`);
            glossaryFiles.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(`❌ [FlgloParser] Error searching directory ${dir}:`, error);
      }
    }
    
    await searchDirectory(projectPath, 0);
    console.log(`🔍 [FlgloParser] Search complete. Found ${glossaryFiles.length} .flglo files: ${glossaryFiles.join(', ')}`);
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
import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { TocService, TocStructure } from '../toc-service';

export interface TOCDiscoveryResult {
  tocFiles: string[];
  tocStructures: Array<{
    path: string;
    structure: TocStructure;
  }>;
  totalEntries: number;
}

export class TOCDiscoveryService {
  private tocService: TocService;

  constructor() {
    this.tocService = new TocService();
  }

  /**
   * Discovers all .fltoc files in a MadCap Flare project
   */
  async discoverAllTOCs(projectPath: string): Promise<TOCDiscoveryResult> {
    const tocFiles = await this.findTOCFiles(projectPath);
    const tocStructures: Array<{ path: string; structure: TocStructure }> = [];
    let totalEntries = 0;

    // Find the Content directory - it might be at project root or under Project/
    const contentPath = await this.findContentDirectory(projectPath);
    
    // Found ${tocFiles.length} TOC files in project
    
    for (const tocFile of tocFiles) {
      try {
        // Parsing TOC: ${relative(projectPath, tocFile)}
        const structure = await this.tocService.parseFlareToc(tocFile, contentPath);
        tocStructures.push({
          path: tocFile,
          structure
        });
        totalEntries += this.countEntriesInStructure(structure);
        // ${structure.title}: ${this.countEntriesInStructure(structure)} entries
      } catch (error) {
        // Failed to parse TOC ${tocFile}: ${error}
      }
    }

    // Total discovered entries across all TOCs: ${totalEntries}

    return {
      tocFiles,
      tocStructures,
      totalEntries
    };
  }

  /**
   * Finds all .fltoc files in the project
   */
  private async findTOCFiles(projectPath: string): Promise<string[]> {
    const tocFiles: string[] = [];
    
    // Standard MadCap Flare project structure locations for TOC files
    const tocDirectories = [
      'Project/TOCs',      // Standard Flare project structure
      'TOCs',             // Direct TOCs subfolder in project root
      'Project/AdvancedTOCs', 
      'AdvancedTOCs'
    ];

    for (const tocDir of tocDirectories) {
      const fullTocPath = join(projectPath, tocDir);
      try {
        const files = await this.findTOCFilesInDirectory(fullTocPath);
        tocFiles.push(...files);
      } catch (error) {
        // Directory doesn't exist, continue
        continue;
      }
    }

    // If no TOCs found in standard locations, search the entire project
    if (tocFiles.length === 0) {
      // No TOCs found in standard locations, searching entire project...
      const allTocFiles = await this.searchProjectForTOCs(projectPath);
      tocFiles.push(...allTocFiles);
    }

    return [...new Set(tocFiles)]; // Remove duplicates
  }

  /**
   * Finds all .fltoc files in a specific directory
   */
  private async findTOCFilesInDirectory(dirPath: string): Promise<string[]> {
    const tocFiles: string[] = [];
    const entries = await readdir(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stats = await stat(fullPath);

      if (stats.isFile() && entry.toLowerCase().endsWith('.fltoc')) {
        // Filter: Only include Online TOCs for User and Admin sections
        if (this.shouldIncludeTOC(entry)) {
          tocFiles.push(fullPath);
        }
      } else if (stats.isDirectory()) {
        // Recursively search subdirectories
        try {
          const subTocFiles = await this.findTOCFilesInDirectory(fullPath);
          tocFiles.push(...subTocFiles);
        } catch (error) {
          // Skip directories we can't read
          continue;
        }
      }
    }

    return tocFiles;
  }

  /**
   * Searches the entire project for .fltoc files
   */
  private async searchProjectForTOCs(projectPath: string): Promise<string[]> {
    const tocFiles: string[] = [];

    const searchDirectory = async (dirPath: string): Promise<void> => {
      try {
        const entries = await readdir(dirPath);

        for (const entry of entries) {
          // Skip common non-project directories
          if (entry.startsWith('.') || entry === 'node_modules' || entry === 'Temporary') {
            continue;
          }

          const fullPath = join(dirPath, entry);
          const stats = await stat(fullPath);

          if (stats.isFile() && entry.toLowerCase().endsWith('.fltoc')) {
            // Filter: Only include Online TOCs for User and Admin sections
            if (this.shouldIncludeTOC(entry)) {
              tocFiles.push(fullPath);
            }
          } else if (stats.isDirectory()) {
            await searchDirectory(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
        return;
      }
    };

    await searchDirectory(projectPath);
    return tocFiles;
  }

  /**
   * Determines if a TOC file should be included based on filtering rules
   * Only includes Online, User, and Admin TOCs - excludes Print, Review, API, Developer, etc.
   */
  private shouldIncludeTOC(filename: string): boolean {
    const lowerFilename = filename.toLowerCase();
    
    // EXCLUDE: Print, Review, and development-focused TOCs
    const shouldExclude = lowerFilename.includes('pdf') || 
                         lowerFilename.includes('print') ||
                         lowerFilename.includes('printable') ||
                         lowerFilename.includes('review') ||
                         lowerFilename.includes('draft') ||
                         lowerFilename.includes('api') ||
                         lowerFilename.includes('developer') ||
                         lowerFilename.includes('technical') ||
                         lowerFilename.includes('sdk') ||
                         lowerFilename.includes('reference') ||
                         lowerFilename.includes('internal');
    
    if (shouldExclude) {
      return false;
    }
    
    // INCLUDE: Only Online, User, and Admin TOCs and their synonyms
    const isTargetTOC = lowerFilename.includes('online') || 
                       lowerFilename.includes('user') || 
                       lowerFilename.includes('admin') ||
                       lowerFilename.includes('administration') ||
                       lowerFilename.includes('administrator') ||
                       lowerFilename.includes('manual') ||
                       lowerFilename.includes('guide') ||
                       lowerFilename.includes('help') ||
                       lowerFilename.includes('documentation') ||
                       // Include generic TOC names that might be main user docs
                       lowerFilename === 'toc.fltoc' ||
                       lowerFilename === 'main.fltoc' ||
                       lowerFilename === 'master.fltoc';
    
    return isTargetTOC;
  }

  /**
   * Finds the Content directory in a MadCap project
   */
  private async findContentDirectory(projectPath: string): Promise<string> {
    // Common locations for Content directory
    const contentCandidates = [
      join(projectPath, 'Content'),
      join(projectPath, 'Project', 'Content'),
      join(projectPath, 'Source', 'Content'),
      projectPath // Fallback to project root
    ];

    for (const candidate of contentCandidates) {
      try {
        const stats = await stat(candidate);
        if (stats.isDirectory()) {
          return candidate;
        }
      } catch (error) {
        continue;
      }
    }

    // If no Content directory found, return project path as fallback
    // No Content directory found in project ${projectPath}, using project root
    return projectPath;
  }

  /**
   * Counts the total number of entries in a TOC structure
   */
  private countEntriesInStructure(structure: TocStructure): number {
    let count = 0;
    
    const countEntries = (entries: any[]): number => {
      let entryCount = 0;
      for (const entry of entries) {
        entryCount++; // Count this entry
        if (entry.children && entry.children.length > 0) {
          entryCount += countEntries(entry.children); // Count children recursively
        }
      }
      return entryCount;
    };

    return countEntries(structure.entries);
  }

  /**
   * Gets a detailed report of all discovered TOCs
   */
  async getTOCReport(projectPath: string): Promise<string> {
    const discovery = await this.discoverAllTOCs(projectPath);
    
    let report = `# MadCap Flare TOC Discovery Report\n\n`;
    report += `**Project Path:** ${projectPath}\n`;
    report += `**TOC Files Found:** ${discovery.tocFiles.length}\n`;
    report += `**Total Entries Across All TOCs:** ${discovery.totalEntries}\n\n`;

    if (discovery.tocStructures.length === 0) {
      report += `⚠️ **No valid TOC files found or parsed successfully.**\n\n`;
      return report;
    }

    report += `## Discovered TOC Files\n\n`;
    
    for (const { path, structure } of discovery.tocStructures) {
      const relativePath = relative(projectPath, path);
      const entryCount = this.countEntriesInStructure(structure);
      
      report += `### ${structure.title}\n`;
      report += `- **File:** ${relativePath}\n`;
      report += `- **Entries:** ${entryCount}\n`;
      
      if (structure.entries.length > 0) {
        report += `- **Top-level sections:**\n`;
        for (const entry of structure.entries.slice(0, 5)) { // Show first 5 entries
          const childCount = entry.children ? entry.children.length : 0;
          const hasLink = entry.href ? '📄' : '📁';
          report += `  - ${hasLink} ${entry.title}${childCount > 0 ? ` (${childCount} children)` : ''}\n`;
        }
        
        if (structure.entries.length > 5) {
          report += `  - ... and ${structure.entries.length - 5} more entries\n`;
        }
      }
      
      report += `\n`;
    }

    return report;
  }
}
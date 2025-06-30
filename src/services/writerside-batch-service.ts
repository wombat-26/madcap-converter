import { readdir, stat, copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { join, relative, extname, dirname, basename, resolve } from 'path';
import { DocumentService } from '../document-service.js';
import { ConversionOptions, ConversionResult, BatchConversionOptions } from '../types/index.js';
import { errorHandler } from './error-handler.js';
import { TOCDiscoveryService } from './toc-discovery.js';
import { TocService } from '../toc-service.js';
import { 
  WritersideProjectGenerator, 
  WritersideProjectConfig, 
  WritersideInstanceConfig,
  WritersideTocElement 
} from './writerside-project-generator.js';
import { MadCapToWritersideConverter } from './madcap-to-writerside-converter.js';
import { FLVARParser } from './flvar-parser.js';
import { WritersideVariableConverter, VariableConversionOptions } from './writerside-variable-converter.js';

export interface WritersideBatchOptions extends BatchConversionOptions {
  // Writerside-specific options
  createProject?: boolean;
  projectName?: string;
  instances?: WritersideInstanceConfig[];
  generateTOC?: boolean;
  enableCollapsibleBlocks?: boolean;
  enableProcedureBlocks?: boolean;
  enableTabs?: boolean;
  enableSummaryCards?: boolean;
  
  // Advanced Writerside features
  buildConfig?: {
    primaryColor?: string;
    headerLogo?: string;
    enableSearch?: boolean;
    webRoot?: string;
  };
  
  // Content organization
  organizeByTOC?: boolean;
  mergeSnippets?: boolean;
  generateStarterContent?: boolean;
}

export interface WritersideBatchResult {
  totalFiles: number;
  convertedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; error: string }>;
  results: Array<{ inputPath: string; outputPath: string; result: ConversionResult }>;
  
  // Writerside-specific results
  projectPath?: string;
  configFiles: string[];
  treeFiles: string[];
  variableFiles: string[];
  instances: WritersideInstanceConfig[];
  tocStructure?: WritersideTocElement[];
  warnings: string[];
}

/**
 * Enhanced batch conversion service for creating complete Writerside projects
 */
export class WritersideBatchService {
  private documentService: DocumentService;
  private tocDiscoveryService: TOCDiscoveryService;
  private tocService: TocService;
  private madcapConverter: MadCapToWritersideConverter;
  private flvarParser: FLVARParser;
  private variableConverter: WritersideVariableConverter;
  private supportedExtensions = new Set(['html', 'htm', 'docx', 'doc', 'xml', 'flsnp']);

  constructor() {
    this.documentService = new DocumentService();
    this.tocDiscoveryService = new TOCDiscoveryService();
    this.tocService = new TocService();
    this.madcapConverter = new MadCapToWritersideConverter();
    this.flvarParser = new FLVARParser();
    this.variableConverter = new WritersideVariableConverter();
  }

  /**
   * Converts a MadCap Flare project to a complete Writerside project
   */
  async convertToWritersideProject(
    inputDir: string,
    outputDir: string,
    options: WritersideBatchOptions
  ): Promise<WritersideBatchResult> {
    
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: Array<{ file: string; error: string }> = [];
    const results: Array<{ inputPath: string; outputPath: string; result: ConversionResult }> = [];
    
    try {
      // Step 1: Analyze MadCap project structure
      const projectAnalysis = await this.analyzeMadCapProject(inputDir);
      warnings.push(...projectAnalysis.warnings);

      // Step 2: Generate Writerside project configuration
      const projectConfig = await this.generateProjectConfig(
        inputDir,
        outputDir,
        options,
        projectAnalysis
      );

      // Step 3: Create Writerside project structure
      const projectGenerator = new WritersideProjectGenerator(projectConfig);
      await projectGenerator.generateProject();
      
      // Step 4: Convert content files
      const conversionResults = await this.convertContentFiles(
        inputDir,
        outputDir,
        options,
        projectAnalysis,
        projectGenerator
      );
      
      results.push(...conversionResults.results);
      errors.push(...conversionResults.errors);
      warnings.push(...conversionResults.warnings);

      // Step 5: Regenerate v.list file with proper naming convention 
      if (projectAnalysis.flvarFiles.length > 0 && options.variableOptions?.nameConvention && options.variableOptions.nameConvention !== 'original') {
        try {
          console.log(`Regenerating v.list file with ${options.variableOptions.nameConvention} naming convention...`);
          
          // Parse FLVAR files again and convert with proper naming convention
          const variableSets = await this.flvarParser.parseMultipleFiles(projectAnalysis.flvarFiles);
          const variables = this.flvarParser.mergeVariableSets(variableSets);
          
          const conversionOptions: VariableConversionOptions = {
            mode: options.variableOptions?.variableMode || 'reference',
            format: 'writerside',
            variableFileName: 'v.list',
            nameConvention: options.variableOptions.nameConvention,
            instanceName: options.variableOptions?.instanceName,
            prefix: options.variableOptions?.variablePrefix,
            includePatterns: options.variableOptions?.includePatterns,
            excludePatterns: options.variableOptions?.excludePatterns
          };
          
          const properlyNamedVariables = this.variableConverter.convertVariables(variables, conversionOptions);
          await projectGenerator.updateVariables(properlyNamedVariables);
          
          console.log(`✅ Updated v.list file with ${properlyNamedVariables.length} variables using ${options.variableOptions.nameConvention} naming`);
        } catch (error) {
          console.warn('Failed to regenerate v.list with proper naming:', error);
        }
      }

      // Step 6: Generate TOC structure if requested
      let tocStructure: WritersideTocElement[] | undefined;
      if (options.generateTOC || options.organizeByTOC) {
        tocStructure = await this.generateTOCStructure(
          projectAnalysis,
          conversionResults.fileMapping,
          options
        );
        
        // Update tree files with generated TOC
        for (const instance of projectConfig.instances) {
          await projectGenerator.updateTreeFile(instance, tocStructure);
        }
      }

      // Step 7: Copy images and resources
      if (options.copyImages !== false) {
        await this.copyImages(inputDir, projectGenerator.getProjectStructure().imagesDir);
      }

      // Step 8: Generate starter content if requested
      if (options.generateStarterContent) {
        await this.generateStarterContent(projectGenerator, options);
      }

      const processingTime = Date.now() - startTime;
      console.log(`Writerside project conversion completed in ${processingTime}ms`);

      return {
        totalFiles: conversionResults.totalFiles,
        convertedFiles: conversionResults.convertedFiles,
        skippedFiles: conversionResults.skippedFiles,
        errors,
        results,
        projectPath: outputDir,
        configFiles: [
          join(outputDir, 'writerside.cfg'),
          join(outputDir, 'cfg', 'buildprofiles.xml')
        ],
        treeFiles: projectConfig.instances.map(i => join(outputDir, i.treeFile)),
        variableFiles: [join(outputDir, 'v.list')],
        instances: projectConfig.instances,
        tocStructure,
        warnings
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({ file: inputDir, error: `Project conversion failed: ${errorMessage}` });
      
      return {
        totalFiles: 0,
        convertedFiles: 0,
        skippedFiles: 0,
        errors,
        results: [],
        configFiles: [],
        treeFiles: [],
        variableFiles: [],
        instances: [],
        warnings
      };
    }
  }

  private async analyzeMadCapProject(inputDir: string): Promise<{
    tocFiles: string[];
    flvarFiles: string[];
    contentFiles: string[];
    snippetFiles: string[];
    conditions: string[];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const tocFiles: string[] = [];
    const flvarFiles: string[] = [];
    const contentFiles: string[] = [];
    const snippetFiles: string[] = [];
    const conditions = new Set<string>();

    try {
      // Discover TOC files
      const discoveredTOCs = await this.tocDiscoveryService.discoverAllTOCs(inputDir);
      tocFiles.push(...discoveredTOCs.tocFiles);

      // Find FLVAR files - look in project root, not just input directory
      let flvarFiles_discovered: string[] = [];
      if (inputDir.includes('/Content') || inputDir.includes('\\Content')) {
        // If input is Content folder, look in sibling Project folder
        const projectRoot = inputDir.replace(/[/\\]Content.*$/, '');
        const projectVariableSetsDir = join(projectRoot, 'Project', 'VariableSets');
        try {
          console.log(`Looking for FLVAR files in: ${projectVariableSetsDir}`);
          flvarFiles_discovered = await this.findFiles(projectVariableSetsDir, ['.flvar'], true);
          console.log(`Found ${flvarFiles_discovered.length} FLVAR files in Project/VariableSets`);
        } catch (error) {
          console.warn(`Failed to search Project/VariableSets directory: ${error}`);
          // Fallback to searching in input directory
          console.log(`Fallback: searching for FLVAR files in input directory: ${inputDir}`);
          flvarFiles_discovered = await this.findFiles(inputDir, ['.flvar'], true);
        }
      } else {
        // Search entire input directory (project root or other structure)
        console.log(`Searching for FLVAR files in input directory: ${inputDir}`);
        flvarFiles_discovered = await this.findFiles(inputDir, ['.flvar'], true);
      }
      flvarFiles.push(...flvarFiles_discovered);
      console.log(`Total FLVAR files discovered: ${flvarFiles.length}`);

      // Find content files
      const htmlFiles = await this.findFiles(inputDir, ['.html', '.htm'], true);
      contentFiles.push(...htmlFiles.filter(f => !f.includes('/_')));

      // Find snippet files
      const snippetFiles_discovered = await this.findFiles(inputDir, ['.flsnp'], true);
      snippetFiles.push(...snippetFiles_discovered);

      // Extract conditions from content files (sample analysis)
      for (const file of contentFiles.slice(0, 50)) { // Sample first 50 files
        try {
          const content = await readFile(file, 'utf8');
          const conditionMatches = content.match(/data-mc-conditions="([^"]+)"/g);
          if (conditionMatches) {
            conditionMatches.forEach(match => {
              const condition = match.match(/data-mc-conditions="([^"]+)"/)?.[1];
              if (condition) {
                condition.split(',').forEach(c => conditions.add(c.trim()));
              }
            });
          }
        } catch (error) {
          warnings.push(`Failed to analyze conditions in ${file}: ${error}`);
        }
      }

      return {
        tocFiles,
        flvarFiles,
        contentFiles,
        snippetFiles,
        conditions: Array.from(conditions),
        warnings
      };

    } catch (error) {
      warnings.push(`Project analysis failed: ${error}`);
      return {
        tocFiles: [],
        flvarFiles: [],
        contentFiles: [],
        snippetFiles: [],
        conditions: [],
        warnings
      };
    }
  }

  private async generateProjectConfig(
    inputDir: string,
    outputDir: string,
    options: WritersideBatchOptions,
    analysis: any
  ): Promise<WritersideProjectConfig> {
    
    const projectName = options.projectName || basename(inputDir);
    
    // Generate instances based on conditions or use provided instances
    let instances: WritersideInstanceConfig[];
    if (options.instances && options.instances.length > 0) {
      instances = options.instances;
    } else {
      instances = this.madcapConverter.generateInstanceConfigurations(
        analysis.conditions,
        projectName
      );
    }

    // Convert FLVAR files to Writerside variables using proper variable converter
    let globalVariables: any[] = [];
    if (analysis.flvarFiles.length > 0) {
      try {
        console.log(`Converting ${analysis.flvarFiles.length} FLVAR files to Writerside variables...`);
        
        // Parse FLVAR files
        const variableSets = await this.flvarParser.parseMultipleFiles(analysis.flvarFiles);
        const variables = this.flvarParser.mergeVariableSets(variableSets);
        
        // Create variable conversion options from batch options
        const conversionOptions: VariableConversionOptions = {
          mode: options.variableOptions?.variableMode || 'reference',
          format: 'writerside',
          variableFileName: 'v.list',
          nameConvention: options.variableOptions?.nameConvention || 'original',
          instanceName: options.variableOptions?.instanceName,
          prefix: options.variableOptions?.variablePrefix,
          includePatterns: options.variableOptions?.includePatterns,
          excludePatterns: options.variableOptions?.excludePatterns
        };
        
        // Convert variables using WritersideVariableConverter (respects nameConvention)
        globalVariables = this.variableConverter.convertVariables(variables, conversionOptions);
        
        console.log(`Successfully converted ${globalVariables.length} variables from FLVAR files`);
        console.log(`Using naming convention: ${conversionOptions.nameConvention}`);
      } catch (error) {
        console.warn('Failed to convert FLVAR files:', error);
        console.log('Creating empty v.list file - variables can be added manually later');
      }
    } else {
      console.log('No FLVAR files found - creating empty v.list file');
    }

    return {
      projectName,
      projectPath: outputDir,
      instances,
      globalVariables,
      buildConfig: options.buildConfig
    };
  }

  private async convertContentFiles(
    inputDir: string,
    outputDir: string,
    options: WritersideBatchOptions,
    analysis: any,
    projectGenerator: WritersideProjectGenerator
  ): Promise<{
    results: Array<{ inputPath: string; outputPath: string; result: ConversionResult }>;
    errors: Array<{ file: string; error: string }>;
    warnings: string[];
    fileMapping: Map<string, string>;
    totalFiles: number;
    convertedFiles: number;
    skippedFiles: number;
  }> {
    
    const results: Array<{ inputPath: string; outputPath: string; result: ConversionResult }> = [];
    const errors: Array<{ file: string; error: string }> = [];
    const warnings: string[] = [];
    const fileMapping = new Map<string, string>();
    
    const topicsDir = projectGenerator.getProjectStructure().topicsDir;
    const snippetsDir = projectGenerator.getProjectStructure().snippetsDir!;
    
    let totalFiles = 0;
    let convertedFiles = 0;
    let skippedFiles = 0;

    // Convert content files
    for (const inputFile of analysis.contentFiles) {
      totalFiles++;
      
      try {
        const relativePath = relative(inputDir, inputFile);
        const outputFileName = this.generateOutputFileName(relativePath, options);
        const outputPath = join(topicsDir, outputFileName);
        
        // Convert file
        const result = await this.documentService.convertFile(inputFile, outputPath, {
          ...options,
          format: 'writerside-markdown'
        });
        
        results.push({ inputPath: inputFile, outputPath, result });
        fileMapping.set(relativePath, relative(outputDir, outputPath));
        convertedFiles++;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ file: inputFile, error: errorMessage });
        skippedFiles++;
      }
    }

    // Convert snippet files
    for (const snippetFile of analysis.snippetFiles) {
      totalFiles++;
      
      try {
        const relativePath = relative(inputDir, snippetFile);
        const outputFileName = relativePath.replace(/\.flsnp$/i, '.md');
        const outputPath = join(snippetsDir, outputFileName);
        
        const result = await this.documentService.convertFile(snippetFile, outputPath, {
          ...options,
          format: 'writerside-markdown'
        });
        
        results.push({ inputPath: snippetFile, outputPath, result });
        fileMapping.set(relativePath, relative(outputDir, outputPath));
        convertedFiles++;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ file: snippetFile, error: errorMessage });
        skippedFiles++;
      }
    }

    return {
      results,
      errors,
      warnings,
      fileMapping,
      totalFiles,
      convertedFiles,
      skippedFiles
    };
  }

  private generateOutputFileName(relativePath: string, options: WritersideBatchOptions): string {
    let fileName = relativePath.replace(/\.htm?$/i, '.md');
    
    if (options.renameFiles) {
      // Convert file names to more readable format
      fileName = fileName
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .replace(/\s+/g, '-')
        .toLowerCase();
    }
    
    return fileName;
  }

  private async generateTOCStructure(
    analysis: any,
    fileMapping: Map<string, string>,
    options: WritersideBatchOptions
  ): Promise<WritersideTocElement[]> {
    
    const tocElements: WritersideTocElement[] = [];
    
    if (analysis.tocFiles.length > 0) {
      // Use existing TOC structure
      for (const tocFile of analysis.tocFiles) {
        try {
          const contentBasePath = dirname(tocFile);
          const tocStructure = await this.tocService.parseFlareToc(tocFile, contentBasePath);
          const convertedToc = this.madcapConverter.convertTocStructure(tocStructure.entries);
          
          // Update file references to point to converted files
          this.updateTocFileReferences(convertedToc, fileMapping);
          tocElements.push(...convertedToc);
          
        } catch (error) {
          console.warn(`Failed to process TOC file ${tocFile}:`, error);
        }
      }
    } else {
      // Generate TOC from file structure
      tocElements.push(...this.generateTocFromFileStructure(fileMapping));
    }
    
    return tocElements;
  }

  private updateTocFileReferences(
    tocElements: WritersideTocElement[],
    fileMapping: Map<string, string>
  ): void {
    for (const element of tocElements) {
      if (element.topicFile) {
        const mappedFile = fileMapping.get(element.topicFile);
        if (mappedFile) {
          element.topicFile = mappedFile;
        }
      }
      
      if (element.children) {
        this.updateTocFileReferences(element.children, fileMapping);
      }
    }
  }

  private generateTocFromFileStructure(fileMapping: Map<string, string>): WritersideTocElement[] {
    const tocElements: WritersideTocElement[] = [];
    const sortedFiles = Array.from(fileMapping.entries()).sort();
    
    for (const [originalPath, convertedPath] of sortedFiles) {
      if (convertedPath.endsWith('.md')) {
        const fileName = basename(convertedPath, '.md');
        const title = fileName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        tocElements.push({
          title,
          topicFile: convertedPath,
          id: fileName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        });
      }
    }
    
    return tocElements;
  }

  private async copyImages(sourceDir: string, targetImagesDir: string): Promise<void> {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const imageFiles = await this.findFiles(sourceDir, imageExtensions, true);
    
    for (const imageFile of imageFiles) {
      try {
        const relativePath = relative(sourceDir, imageFile);
        const targetPath = join(targetImagesDir, relativePath);
        
        await errorHandler.safeCreateDirectory(dirname(targetPath));
        await copyFile(imageFile, targetPath);
        
      } catch (error) {
        console.warn(`Failed to copy image ${imageFile}:`, error);
      }
    }
  }

  private async generateStarterContent(
    projectGenerator: WritersideProjectGenerator,
    options: WritersideBatchOptions
  ): Promise<void> {
    
    // Create overview topic
    await projectGenerator.createStarterTopic(
      'overview.md',
      'Overview',
      `Welcome to the ${options.projectName || 'Documentation'} project.

This documentation was converted from MadCap Flare to Writerside format.

## Getting Started

Browse the topics in the navigation panel to explore the documentation.

## Features

This Writerside project includes:
- Converted content from MadCap Flare
- Preserved variable definitions
- Converted conditional content
- Organized topic structure`
    );

    // Create getting started topic
    await projectGenerator.createStarterTopic(
      'getting-started.md',
      'Getting Started',
      `# Getting Started

This section provides the essential information you need to begin.

## Prerequisites

Before you start, ensure you have:
- Access to the system
- Required permissions
- Basic understanding of the concepts

## Next Steps

Continue with the specific topics in this documentation.`
    );
  }

  private async findFiles(
    dir: string,
    extensions: string[],
    recursive: boolean = true
  ): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await readdir(dir);
      
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stats = await stat(fullPath);
        
        if (stats.isDirectory() && recursive && !entry.startsWith('.')) {
          const subFiles = await this.findFiles(fullPath, extensions, recursive);
          files.push(...subFiles);
        } else if (stats.isFile()) {
          const ext = extname(entry).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
      
    } catch (error) {
      console.warn(`Error reading directory ${dir}:`, error);
    }
    
    return files;
  }
}
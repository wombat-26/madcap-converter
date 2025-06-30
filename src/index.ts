#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DocumentService } from './document-service.js';
import { BatchService } from './batch-service.js';
import { WritersideBatchService } from './services/writerside-batch-service.js';
import { TocService } from './toc-service.js';
import { TOCDiscoveryService } from './services/toc-discovery.js';
import { LinkValidator } from './services/link-validator.js';
import { InputValidator } from './services/input-validator.js';
import { ConversionOptions } from './types/index.js';

const ZendeskOptionsSchema = z.object({
  sectionId: z.string().optional().describe('Zendesk section ID'),
  locale: z.string().optional().describe('Zendesk locale (default: en-us)'),
  userSegmentId: z.string().optional().describe('Zendesk user segment ID'),
  permissionGroupId: z.string().optional().describe('Zendesk permission group ID'),
  generateTags: z.boolean().optional().describe('Generate AI-based content tags'),
  maxTags: z.number().optional().describe('Maximum number of tags (default: 10)'),
  sanitizeHtml: z.boolean().optional().describe('Remove unsafe HTML tags (default: true)'),
  ignoreVideos: z.boolean().optional().describe('Skip video processing (default: false)'),
  inlineStyles: z.boolean().optional().describe('Apply inline CSS styles (default: true)'),
  generateStylesheet: z.boolean().optional().describe('Generate separate CSS file (default: false)'),
  cssOutputPath: z.string().optional().describe('Path for CSS file when generateStylesheet is true')
}).optional();

const VariableOptionsSchema = z.object({
  extractVariables: z.boolean().optional().describe('Extract MadCap variables to separate file instead of flattening to text (default: false)'),
  variableFormat: z.enum(['adoc', 'writerside']).optional().describe('Format for variables file (adoc = AsciiDoc attributes, writerside = XML)'),
  variablesOutputPath: z.string().optional().describe('Custom path for variables file (default: auto-generated)'),
  preserveVariableStructure: z.boolean().optional().describe('Preserve namespace grouping in variables file (default: false)'),
  skipFileGeneration: z.boolean().optional().describe('Skip generating variables file (for batch processing, default: false)'),
  
  // Enhanced variable handling options
  variableMode: z.enum(['flatten', 'include', 'reference']).optional().describe('How to handle variables in content: flatten = replace with values, include = generate includes, reference = convert to target format references (default: reference)'),
  nameConvention: z.enum(['camelCase', 'snake_case', 'kebab-case', 'original']).optional().describe('Variable naming convention (default: original)'),
  instanceName: z.string().optional().describe('Instance name for Writerside conditional variables'),
  variablePrefix: z.string().optional().describe('Prefix for variable names to avoid conflicts'),
  includePatterns: z.array(z.string()).optional().describe('Filter variables by name patterns (regex)'),
  excludePatterns: z.array(z.string()).optional().describe('Exclude variables by name patterns (regex)'),
  flvarFiles: z.array(z.string()).optional().describe('Explicit list of FLVAR files to process'),
  autoDiscoverFLVAR: z.boolean().optional().describe('Automatically find FLVAR files in project (default: true)')
}).optional();

const AsciiDocOptionsSchema = z.object({
  useCollapsibleBlocks: z.boolean().optional().describe('Convert MadCap dropdowns to AsciiDoc collapsible blocks instead of regular sections (default: false)'),
  tilesAsTable: z.boolean().optional().describe('Convert tile/card grids to AsciiDoc tables instead of sequential blocks (default: false)'),
  generateAsBook: z.boolean().optional().describe('Generate complete AsciiDoc book structure with master document (default: false)'),
  bookTitle: z.string().optional().describe('Custom book title (auto-detected from TOC if empty)'),
  bookAuthor: z.string().optional().describe('Book author name (optional)'),
  useLinkedTitleFromTOC: z.boolean().optional().describe('Extract chapter titles from H1 headings when TOC uses LinkedTitle (default: false)'),
  includeChapterBreaks: z.boolean().optional().describe('Add chapter breaks between major sections (default: false)'),
  includeTOCLevels: z.number().optional().describe('Number of heading levels to include in TOC (1-6, default: 3)'),
  useBookDoctype: z.boolean().optional().describe('Set doctype to "book" for multi-chapter documents (default: true)')
}).optional();

const WritersideOptionsSchema = z.object({
  // Project structure options
  createProject: z.boolean().optional().describe('Generate complete Writerside project structure (default: false)'),
  projectName: z.string().optional().describe('Name for the Writerside project (auto-detected if not provided)'),
  
  // Instance configuration
  generateInstances: z.boolean().optional().describe('Auto-generate instances based on MadCap conditions (default: true)'),
  instanceMapping: z.record(z.string()).optional().describe('Map MadCap conditions to specific instance names'),
  
  // Content enhancement options
  enableProcedureBlocks: z.boolean().optional().describe('Convert step-by-step content to Writerside procedure blocks (default: true)'),
  enableCollapsibleBlocks: z.boolean().optional().describe('Convert expandable content to collapsible blocks (default: true)'),
  enableTabs: z.boolean().optional().describe('Convert tabbed content to tab groups (default: true)'),
  enableSummaryCards: z.boolean().optional().describe('Convert summary content to card layouts (default: true)'),
  enableSemanticMarkup: z.boolean().optional().describe('Use Writerside semantic elements for enhanced content (default: true)'),
  
  // TOC and navigation
  generateTOC: z.boolean().optional().describe('Generate tree files from MadCap TOC files (default: true)'),
  organizeByTOC: z.boolean().optional().describe('Use TOC structure for content organization (default: true)'),
  preserveTopicHierarchy: z.boolean().optional().describe('Maintain hierarchical topic structure (default: true)'),
  
  // Variable and conditional content
  convertVariables: z.boolean().optional().describe('Convert MadCap variables to Writerside format (default: true)'),
  convertConditions: z.boolean().optional().describe('Convert MadCap conditions to Writerside filters (default: true)'),
  mergeSnippets: z.boolean().optional().describe('Convert MadCap snippets to Writerside includes (default: true)'),
  
  // Build configuration
  buildConfig: z.object({
    primaryColor: z.string().optional().describe('Theme primary color (e.g., "blue", "red", "green")'),
    headerLogo: z.string().optional().describe('Header logo file path'),
    favicon: z.string().optional().describe('Favicon file path'),
    webRoot: z.string().optional().describe('Web root URL for published documentation'),
    enableSearch: z.boolean().optional().describe('Enable search functionality (default: true)'),
    enableSitemap: z.boolean().optional().describe('Generate sitemap for SEO (default: true)'),
    enableAnalytics: z.boolean().optional().describe('Enable analytics integration (default: false)')
  }).optional().describe('Build configuration options for Writerside'),
  
  // Advanced options
  generateStarterContent: z.boolean().optional().describe('Create overview and getting started topics (default: true)'),
  optimizeForMobile: z.boolean().optional().describe('Optimize content for mobile viewing (default: true)'),
  includeMetadata: z.boolean().optional().describe('Include topic metadata and labels (default: true)')
}).optional();

const ConvertDocumentSchema = {
  input: z.string().describe('Input content (HTML, file path, or base64 encoded content)'),
  inputType: z.enum(['html', 'word', 'madcap']).describe('Type of input document: html (standard HTML), word (Microsoft Word document), madcap (MadCap Flare unpublished source)'),
  format: z.enum(['asciidoc', 'writerside-markdown', 'zendesk']).describe('Output format'),
  preserveFormatting: z.boolean().optional().describe('Whether to preserve formatting'),
  extractImages: z.boolean().optional().describe('Whether to extract and reference images'),
  outputPath: z.string().optional().describe('Output file path (if not provided, returns content only)'),
  variableOptions: VariableOptionsSchema.describe('Variable extraction options for MadCap variables'),
  zendeskOptions: ZendeskOptionsSchema.describe('Zendesk-specific conversion options'),
  asciidocOptions: AsciiDocOptionsSchema.describe('AsciiDoc-specific conversion options'),
  writersideOptions: WritersideOptionsSchema.describe('Writerside-specific conversion options'),
  // Legacy individual parameters for backward compatibility
  sectionId: z.string().optional().describe('Zendesk section ID (legacy - use zendeskOptions)'),
  locale: z.string().optional().describe('Zendesk locale (legacy - use zendeskOptions)'),
  userSegmentId: z.string().optional().describe('Zendesk user segment ID (legacy - use zendeskOptions)'),
  permissionGroupId: z.string().optional().describe('Zendesk permission group ID (legacy - use zendeskOptions)'),
  generateTags: z.boolean().optional().describe('Generate AI-based content tags (legacy - use zendeskOptions)')
};

const ConvertFileSchema = {
  inputPath: z.string().describe('Path to the input file'),
  outputPath: z.string().describe('Path for the output file'),
  format: z.enum(['asciidoc', 'writerside-markdown', 'zendesk']).describe('Output format'),
  preserveFormatting: z.boolean().optional().describe('Whether to preserve formatting'),
  extractImages: z.boolean().optional().describe('Whether to extract and reference images'),
  variableOptions: VariableOptionsSchema.describe('Variable extraction options for MadCap variables'),
  zendeskOptions: ZendeskOptionsSchema.describe('Zendesk-specific conversion options'),
  asciidocOptions: AsciiDocOptionsSchema.describe('AsciiDoc-specific conversion options'),
  writersideOptions: WritersideOptionsSchema.describe('Writerside-specific conversion options'),
  // Legacy individual parameters for backward compatibility
  sectionId: z.string().optional().describe('Zendesk section ID (legacy - use zendeskOptions)'),
  locale: z.string().optional().describe('Zendesk locale (legacy - use zendeskOptions)'),
  userSegmentId: z.string().optional().describe('Zendesk user segment ID (legacy - use zendeskOptions)'),
  permissionGroupId: z.string().optional().describe('Zendesk permission group ID (legacy - use zendeskOptions)'),
  generateTags: z.boolean().optional().describe('Generate AI-based content tags (legacy - use zendeskOptions)')
};

const GetSupportedFormatsSchema = {};

const ConvertFolderSchema = {
  inputDir: z.string().describe('Path to input directory containing documents'),
  outputDir: z.string().describe('Path to output directory for converted documents'),
  format: z.enum(['asciidoc', 'writerside-markdown', 'zendesk']).describe('Output format'),
  recursive: z.boolean().optional().describe('Process subdirectories recursively (default: true)'),
  preserveStructure: z.boolean().optional().describe('Preserve directory structure (default: true)'),
  copyImages: z.boolean().optional().describe('Copy referenced images (default: true)'),
  renameFiles: z.boolean().optional().describe('Rename files based on H1 heading (default: false)'),
  preserveFormatting: z.boolean().optional().describe('Preserve formatting (default: true)'),
  extractImages: z.boolean().optional().describe('Extract images from documents (default: true)'),
  includePatterns: z.array(z.string()).optional().describe('File patterns to include'),
  excludePatterns: z.array(z.string()).optional().describe('File patterns to exclude'),
  useTOCStructure: z.boolean().optional().describe('Use TOC hierarchy instead of file structure (default: false)'),
  generateMasterDoc: z.boolean().optional().describe('Generate master document from TOCs (default: false)'),
  variableOptions: VariableOptionsSchema.describe('Variable extraction options for MadCap variables'),
  zendeskOptions: ZendeskOptionsSchema.describe('Zendesk-specific conversion options'),
  asciidocOptions: AsciiDocOptionsSchema.describe('AsciiDoc-specific conversion options'),
  writersideOptions: WritersideOptionsSchema.describe('Writerside-specific conversion options'),
  // Legacy individual parameters for backward compatibility
  sectionId: z.string().optional().describe('Zendesk section ID (legacy - use zendeskOptions)'),
  locale: z.string().optional().describe('Zendesk locale (legacy - use zendeskOptions)'),
  userSegmentId: z.string().optional().describe('Zendesk user segment ID (legacy - use zendeskOptions)'),
  permissionGroupId: z.string().optional().describe('Zendesk permission group ID (legacy - use zendeskOptions)'),
  generateTags: z.boolean().optional().describe('Generate AI-based content tags (legacy - use zendeskOptions)')
};

const DiscoverTOCsSchema = {
  projectPath: z.string().describe('Path to MadCap Flare project directory')
};

const ConvertWithTOCStructureSchema = {
  projectPath: z.string().describe('Path to MadCap Flare project directory'),
  outputDir: z.string().describe('Path to output directory for converted documents'),
  format: z.enum(['asciidoc', 'writerside-markdown', 'zendesk']).describe('Output format'),
  generateMasterDoc: z.boolean().optional().describe('Generate master document from TOCs (default: true)'),
  copyImages: z.boolean().optional().describe('Copy referenced images (default: true)'),
  preserveFormatting: z.boolean().optional().describe('Preserve formatting (default: true)'),
  extractImages: z.boolean().optional().describe('Extract images from documents (default: true)'),
  variableOptions: VariableOptionsSchema.describe('Variable extraction options for MadCap variables'),
  zendeskOptions: ZendeskOptionsSchema.describe('Zendesk-specific conversion options'),
  asciidocOptions: AsciiDocOptionsSchema.describe('AsciiDoc-specific conversion options'),
  writersideOptions: WritersideOptionsSchema.describe('Writerside-specific conversion options')
};

const ValidateLinksSchema = {
  outputDir: z.string().describe('Path to converted documents directory'),
  format: z.enum(['asciidoc', 'writerside-markdown', 'zendesk']).describe('Document format to validate')
};

const ValidateInputSchema = {
  inputPath: z.string().optional().describe('File path to validate'),
  inputDir: z.string().optional().describe('Directory path to validate'),
  options: z.any().optional().describe('Conversion options to validate')
};

const AnalyzeFolderSchema = {
  inputDir: z.string().describe('Path to directory to analyze')
};

const ParseTocSchema = {
  fltocPath: z.string().describe('Path to MadCap .fltoc file'),
  contentBasePath: z.string().describe('Base path to Content folder'),
  outputPath: z.string().optional().describe('Output path for master.adoc file')
};

const GenerateMasterDocSchema = {
  fltocPath: z.string().describe('Path to MadCap .fltoc file'),
  contentBasePath: z.string().describe('Base path to Content folder'),
  outputPath: z.string().describe('Output path for master document'),
  format: z.enum(['asciidoc', 'writerside-markdown']).optional().describe('Output format (default: asciidoc)')
};

const ConvertToWritersideProjectSchema = {
  inputDir: z.string().describe('Path to MadCap Flare project directory'),
  outputDir: z.string().describe('Path to output directory for Writerside project'),
  projectName: z.string().optional().describe('Name for the Writerside project (auto-detected from directory if not provided)'),
  createProject: z.boolean().optional().describe('Generate complete Writerside project structure (default: true)'),
  generateInstances: z.boolean().optional().describe('Auto-generate instances based on MadCap conditions (default: true)'),
  copyImages: z.boolean().optional().describe('Copy referenced images (default: true)'),
  generateTOC: z.boolean().optional().describe('Generate tree files from MadCap TOC files (default: true)'),
  generateStarterContent: z.boolean().optional().describe('Create overview and getting started topics (default: true)'),
  writersideOptions: WritersideOptionsSchema.describe('Writerside-specific conversion options'),
  variableOptions: VariableOptionsSchema.describe('Variable extraction options for MadCap variables')
};

class MadCapConverterServer {
  private server: McpServer;
  private documentService: DocumentService;
  private batchService: BatchService;
  private writersideBatchService: WritersideBatchService;
  private tocService: TocService;
  private tocDiscoveryService: TOCDiscoveryService;

  constructor() {
    this.documentService = new DocumentService();
    this.batchService = new BatchService();
    this.writersideBatchService = new WritersideBatchService();
    this.tocService = new TocService();
    this.tocDiscoveryService = new TOCDiscoveryService();
    
    this.server = new McpServer({
      name: 'madcap-converter',
      version: '1.0.0',
    });

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.tool('convert_document', ConvertDocumentSchema, async (args) => {
      const zendeskOptions = args.format === 'zendesk' ? {
        sectionId: args.zendeskOptions?.sectionId ?? args.sectionId,
        locale: args.zendeskOptions?.locale ?? args.locale ?? 'en-us',
        userSegmentId: args.zendeskOptions?.userSegmentId ?? args.userSegmentId,
        permissionGroupId: args.zendeskOptions?.permissionGroupId ?? args.permissionGroupId,
        generateTags: args.zendeskOptions?.generateTags ?? args.generateTags ?? true,
        maxTags: args.zendeskOptions?.maxTags ?? 10,
        sanitizeHtml: args.zendeskOptions?.sanitizeHtml ?? true,
        ignoreVideos: args.zendeskOptions?.ignoreVideos ?? false,
        inlineStyles: args.zendeskOptions?.inlineStyles ?? true,
        generateStylesheet: args.zendeskOptions?.generateStylesheet ?? false,
        cssOutputPath: args.zendeskOptions?.cssOutputPath
      } : undefined;

      const options: ConversionOptions = {
        inputType: args.inputType,
        format: args.format,
        preserveFormatting: args.preserveFormatting ?? true,
        extractImages: args.extractImages ?? false,
        variableOptions: args.variableOptions,
        zendeskOptions
      };

      let result;
      
      if (args.inputType === 'word') {
        const buffer = Buffer.from(args.input, 'base64');
        result = await this.documentService.convertBuffer(buffer, options);
      } else {
        result = await this.documentService.convertString(args.input, options);
      }

      if (args.outputPath) {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        await fs.writeFile(args.outputPath, result.content, 'utf8');
        
        // Write variables file if generated
        let variablesMessage = '';
        if (result.variablesFile && args.variableOptions?.extractVariables) {
          const variablesPath = args.variableOptions.variablesOutputPath || 
                               await this.getDefaultVariablesPath(args.outputPath, args.variableOptions.variableFormat);
          await fs.writeFile(variablesPath, result.variablesFile, 'utf8');
          variablesMessage = `\nVariables file saved to: ${variablesPath}`;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Document successfully converted and saved to: ${args.outputPath}${variablesMessage}\n\nMetadata:\n${JSON.stringify(result.metadata, null, 2)}`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Converted Content:\n\n${result.content}\n\nMetadata:\n${JSON.stringify(result.metadata, null, 2)}`
          }
        ]
      };
    });

    this.server.tool('convert_file', ConvertFileSchema, async (args) => {
      const zendeskOptions = args.format === 'zendesk' ? {
        sectionId: args.zendeskOptions?.sectionId ?? args.sectionId,
        locale: args.zendeskOptions?.locale ?? args.locale ?? 'en-us',
        userSegmentId: args.zendeskOptions?.userSegmentId ?? args.userSegmentId,
        permissionGroupId: args.zendeskOptions?.permissionGroupId ?? args.permissionGroupId,
        generateTags: args.zendeskOptions?.generateTags ?? args.generateTags ?? true,
        maxTags: args.zendeskOptions?.maxTags ?? 10,
        sanitizeHtml: args.zendeskOptions?.sanitizeHtml ?? true,
        ignoreVideos: args.zendeskOptions?.ignoreVideos ?? false,
        inlineStyles: args.zendeskOptions?.inlineStyles ?? true,
        generateStylesheet: args.zendeskOptions?.generateStylesheet ?? false,
        cssOutputPath: args.zendeskOptions?.cssOutputPath
      } : undefined;

      const result = await this.documentService.convertFile(
        args.inputPath,
        args.outputPath,
        {
          format: args.format,
          preserveFormatting: args.preserveFormatting,
          extractImages: args.extractImages,
          variableOptions: args.variableOptions,
          zendeskOptions,
          asciidocOptions: args.asciidocOptions
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: `File successfully converted from ${args.inputPath} to ${args.outputPath}\n\nMetadata:\n${JSON.stringify(result.metadata, null, 2)}`
          }
        ]
      };
    });

    this.server.tool('get_supported_formats', GetSupportedFormatsSchema, async () => {
      const formats = this.documentService.getSupportedFormats();
      
      return {
        content: [
          {
            type: 'text',
            text: `Supported input formats: ${formats.join(', ')}\n\nSupported output formats: markdown, asciidoc, enhanced-asciidoc, optimized-asciidoc, zendesk, pandoc-asciidoc, pandoc-markdown, enhanced-markdown, madcap-markdown, writerside-markdown`
          }
        ]
      };
    });

    this.server.tool('convert_folder', ConvertFolderSchema, async (args) => {
      // Handle both new zendeskOptions and legacy individual parameters
      const zendeskOptions = args.format === 'zendesk' ? {
        // Use zendeskOptions if provided, otherwise fall back to individual parameters
        sectionId: args.zendeskOptions?.sectionId ?? args.sectionId,
        locale: args.zendeskOptions?.locale ?? args.locale ?? 'en-us',
        userSegmentId: args.zendeskOptions?.userSegmentId ?? args.userSegmentId,
        permissionGroupId: args.zendeskOptions?.permissionGroupId ?? args.permissionGroupId,
        generateTags: args.zendeskOptions?.generateTags ?? args.generateTags ?? true,
        maxTags: args.zendeskOptions?.maxTags ?? 10,
        sanitizeHtml: args.zendeskOptions?.sanitizeHtml ?? true,
        ignoreVideos: args.zendeskOptions?.ignoreVideos ?? false,
        inlineStyles: args.zendeskOptions?.inlineStyles ?? true,
        generateStylesheet: args.zendeskOptions?.generateStylesheet ?? false,
        cssOutputPath: args.zendeskOptions?.cssOutputPath
      } : undefined;

      const options = {
        format: args.format,
        recursive: args.recursive ?? true,
        preserveStructure: args.preserveStructure ?? true,
        copyImages: args.copyImages ?? true,
        renameFiles: args.renameFiles ?? false,
        preserveFormatting: args.preserveFormatting ?? true,
        extractImages: args.extractImages ?? true,
        includePatterns: args.includePatterns,
        excludePatterns: args.excludePatterns,
        useTOCStructure: args.useTOCStructure ?? false,
        generateMasterDoc: args.generateMasterDoc ?? false,
        variableOptions: args.variableOptions,
        zendeskOptions,
        asciidocOptions: args.asciidocOptions,
        writersideOptions: args.writersideOptions
      };

      const result = await this.batchService.convertFolder(
        args.inputDir,
        args.outputDir,
        options
      );

      const tocInfo = result.tocStructure 
        ? `\n🗂️ TOC-Based Conversion:
- TOCs discovered: ${result.tocStructure.totalTOCs}
- Total entries: ${result.tocStructure.discoveredFiles}
${result.tocStructure.masterDocumentPath ? `- Master document: ${result.tocStructure.masterDocumentPath}` : ''}`
        : '';

      const summary = `Batch conversion completed!

📊 Results Summary:
- Total files found: ${result.totalFiles}
- Successfully converted: ${result.convertedFiles}
- Skipped files: ${result.skippedFiles}
- Errors: ${result.errors.length}

📁 Output directory: ${args.outputDir}
📝 Format: ${args.format}
${options.useTOCStructure ? '🗂️ TOC hierarchy structure used' : options.preserveStructure ? '📂 Directory structure preserved' : '📄 Flat structure'}
${options.copyImages ? '🖼️ Images copied' : ''}${tocInfo}

${result.errors.length > 0 ? `\n❌ Errors:\n${result.errors.map(e => `  - ${e.file}: ${e.error}`).join('\n')}` : ''}

${result.skippedFilesList && result.skippedFilesList.length > 0 ? `\n⏭️ Skipped files:\n${result.skippedFilesList.map(s => `  - ${s.file} (${s.reason})`).join('\n')}` : ''}

✅ Converted files:
${result.results.slice(0, 10).map(r => `  - ${r.inputPath} → ${r.outputPath}`).join('\n')}${result.results.length > 10 ? `\n  ... and ${result.results.length - 10} more files` : ''}`;

      return {
        content: [
          {
            type: 'text',
            text: summary
          }
        ]
      };
    });

    this.server.tool('analyze_folder', AnalyzeFolderSchema, async (args) => {
      const stats = await this.batchService.getDirectoryStats(args.inputDir);

      const analysis = `📊 Directory Analysis: ${args.inputDir}

📁 File Statistics:
- Total files: ${stats.totalFiles}
- Supported document files: ${stats.supportedFiles}

📄 File Types:
${Object.entries(stats.fileTypes)
  .sort(([,a], [,b]) => b - a)
  .map(([ext, count]) => `  - ${ext || 'no extension'}: ${count} files`)
  .join('\n')}

${stats.supportedFiles > 0 ? `\n✅ Ready for conversion: ${stats.supportedFiles} documents found` : '\n⚠️  No supported documents found for conversion'}

📂 Directory Structure (first 20 files):
${stats.structure.slice(0, 20).map(f => `  - ${f}`).join('\n')}${stats.structure.length > 20 ? `\n  ... and ${stats.structure.length - 20} more files` : ''}`;

      return {
        content: [
          {
            type: 'text',
            text: analysis
          }
        ]
      };
    });

    this.server.tool('parse_toc', ParseTocSchema, async (args) => {
      const report = await this.tocService.generateTocReport(args.fltocPath, args.contentBasePath);
      
      return {
        content: [
          {
            type: 'text',
            text: report
          }
        ]
      };
    });

    this.server.tool('generate_master_doc', GenerateMasterDocSchema, async (args) => {
      const tocStructure = await this.tocService.parseFlareToc(args.fltocPath, args.contentBasePath);
      const format = args.format || 'asciidoc';
      const outputFormat = format === 'asciidoc' ? 'adoc' : 'md';
      const masterContent = this.tocService.generateMasterAdoc(tocStructure, outputFormat);
      
      // Write to file
      const fs = await import('fs/promises');
      await fs.writeFile(args.outputPath, masterContent, 'utf8');
      
      const extension = format === 'asciidoc' ? 'adoc' : 'md';
      const summary = `📚 Master Document Generated!

📄 **File:** ${args.outputPath}
📝 **Format:** ${format}
🔗 **TOC Source:** ${args.fltocPath}
📁 **Content Base:** ${args.contentBasePath}

📊 **Structure:**
- Total entries: ${this.countTocEntries(tocStructure.entries)}
- Format: ${extension}
- Document type: book

✅ **Ready to use:** Include this master file in your documentation build process.

💡 **Next steps:**
1. Ensure all referenced files have been converted to ${extension}
2. Adjust include paths if needed
3. Build with AsciiDoctor (for .adoc) or your Markdown processor`;

      return {
        content: [
          {
            type: 'text',
            text: summary
          }
        ]
      };
    });

    this.server.tool('discover_tocs', DiscoverTOCsSchema, async (args) => {
      const discovery = await this.tocDiscoveryService.discoverAllTOCs(args.projectPath);
      const report = await this.tocDiscoveryService.getTOCReport(args.projectPath);
      
      return {
        content: [
          {
            type: 'text',
            text: report
          }
        ]
      };
    });

    this.server.tool('convert_with_toc_structure', ConvertWithTOCStructureSchema, async (args) => {
      // Handle Zendesk options
      const zendeskOptions = args.format === 'zendesk' ? {
        sectionId: args.zendeskOptions?.sectionId,
        locale: args.zendeskOptions?.locale ?? 'en-us',
        userSegmentId: args.zendeskOptions?.userSegmentId,
        permissionGroupId: args.zendeskOptions?.permissionGroupId,
        generateTags: args.zendeskOptions?.generateTags ?? true,
        maxTags: args.zendeskOptions?.maxTags ?? 10,
        sanitizeHtml: args.zendeskOptions?.sanitizeHtml ?? true,
        ignoreVideos: args.zendeskOptions?.ignoreVideos ?? false,
        inlineStyles: args.zendeskOptions?.inlineStyles ?? true,
        generateStylesheet: args.zendeskOptions?.generateStylesheet ?? false,
        cssOutputPath: args.zendeskOptions?.cssOutputPath
      } : undefined;

      const options = {
        format: args.format,
        useTOCStructure: true, // Always use TOC structure for this tool
        generateMasterDoc: args.generateMasterDoc ?? true,
        copyImages: args.copyImages ?? true,
        preserveFormatting: args.preserveFormatting ?? true,
        extractImages: args.extractImages ?? true,
        variableOptions: args.variableOptions,
        zendeskOptions
      };

      const result = await this.batchService.convertFolder(
        args.projectPath,
        args.outputDir,
        options
      );

      const tocInfo = result.tocStructure 
        ? `🗂️ TOC-Based Conversion Results:
- TOCs discovered: ${result.tocStructure.totalTOCs}
- Total entries: ${result.tocStructure.discoveredFiles}
${result.tocStructure.masterDocumentPath ? `- Master document: ${result.tocStructure.masterDocumentPath}` : ''}

🏗️ Structure Creation:
- Hierarchical folders created based on TOC organization
- Files placed according to TOC hierarchy instead of original structure
- ${args.generateMasterDoc !== false ? 'Master document generated for unified access' : 'No master document generated'}`
        : '';

      const summary = `🗂️ TOC-Based Conversion Completed!

📊 Conversion Summary:
- Total files converted: ${result.convertedFiles}
- Files skipped: ${result.skippedFiles}
- Conversion errors: ${result.errors.length}

📁 Project: ${args.projectPath}
📁 Output: ${args.outputDir}
📝 Format: ${args.format}

${tocInfo}

${result.errors.length > 0 ? `\n❌ Errors:\n${result.errors.map(e => `  - ${e.file}: ${e.error}`).join('\n')}` : ''}

✅ Successfully converted files organized by TOC hierarchy:
${result.results.slice(0, 10).map(r => `  - ${r.outputPath}`).join('\n')}${result.results.length > 10 ? `\n  ... and ${result.results.length - 10} more files` : ''}

🎯 **Key Benefits:**
- Content organized by logical structure (User Manual, Administration, etc.)
- Hierarchical folders match documentation flow
- Cross-references maintain proper relationships
- Master document provides unified entry point`;

      return {
        content: [
          {
            type: 'text',
            text: summary
          }
        ]
      };
    });

    this.server.tool('validate_links', ValidateLinksSchema, async (args) => {
      const linkValidator = new LinkValidator(args.outputDir, args.format);
      const report = await linkValidator.validateDirectory(args.outputDir);
      const formattedReport = LinkValidator.formatReport(report);

      return {
        content: [
          {
            type: 'text',
            text: formattedReport
          }
        ]
      };
    });

    this.server.tool('validate_input', ValidateInputSchema, async (args) => {
      const results: string[] = [];

      // Validate file path if provided
      if (args.inputPath) {
        const fileValidation = await InputValidator.validateFilePath(args.inputPath, 'read', 'input');
        if (fileValidation.isValid) {
          results.push(`✅ File path valid: ${args.inputPath}`);
        } else {
          results.push(`❌ File path invalid: ${fileValidation.errors.join('; ')}`);
        }
        
        if (fileValidation.warnings.length > 0) {
          results.push(`⚠️ Warnings: ${fileValidation.warnings.join('; ')}`);
        }
      }

      // Validate directory path if provided
      if (args.inputDir) {
        const dirValidation = await InputValidator.validateDirectoryPath(args.inputDir, 'read');
        if (dirValidation.isValid) {
          results.push(`✅ Directory path valid: ${args.inputDir}`);
        } else {
          results.push(`❌ Directory path invalid: ${dirValidation.errors.join('; ')}`);
        }
        
        if (dirValidation.warnings.length > 0) {
          results.push(`⚠️ Warnings: ${dirValidation.warnings.join('; ')}`);
        }
      }

      // Validate conversion options if provided
      if (args.options) {
        const optionsValidation = await InputValidator.validateConversionOptions(args.options);
        if (optionsValidation.isValid) {
          results.push(`✅ Conversion options valid`);
        } else {
          results.push(`❌ Conversion options invalid: ${optionsValidation.errors.join('; ')}`);
        }
        
        if (optionsValidation.warnings.length > 0) {
          results.push(`⚠️ Options warnings: ${optionsValidation.warnings.join('; ')}`);
        }
      }

      if (results.length === 0) {
        results.push('❓ No validation parameters provided. Specify inputPath, inputDir, or options to validate.');
      }

      return {
        content: [
          {
            type: 'text',
            text: `🔍 Input Validation Results:\n\n${results.join('\n')}`
          }
        ]
      };
    });

    this.server.tool('convert_to_writerside_project', ConvertToWritersideProjectSchema, async (args) => {
      try {
        const options = {
          createProject: args.createProject ?? true,
          projectName: args.projectName,
          generateInstances: args.generateInstances ?? true,
          copyImages: args.copyImages ?? true,
          generateTOC: args.generateTOC ?? true,
          generateStarterContent: args.generateStarterContent ?? true,
          format: 'writerside-markdown' as const,
          inputType: 'madcap' as const,
          recursive: true,
          preserveStructure: true,
          variableOptions: args.variableOptions,
          writersideOptions: args.writersideOptions
        };

        const result = await this.writersideBatchService.convertToWritersideProject(
          args.inputDir,
          args.outputDir,
          options
        );

        const summary = [
          `📁 **Writerside Project Created Successfully**`,
          ``,
          `**Project Details:**`,
          `- Source: ${args.inputDir}`,
          `- Output: ${args.outputDir}`,
          `- Project name: ${options.projectName || 'Auto-detected'}`,
          ``,
          `**Conversion Results:**`,
          `- Total files processed: ${result.totalFiles}`,
          `- Successfully converted: ${result.convertedFiles}`,
          `- Skipped files: ${result.skippedFiles}`,
          `- Errors: ${result.errors.length}`,
          ``,
          `**Generated Files:**`,
          `- Configuration files: ${result.configFiles.length}`,
          `- Tree files: ${result.treeFiles.length}`,
          `- Variable files: ${result.variableFiles.length}`,
          `- Instances: ${result.instances.length}`,
          ``
        ];

        if (result.instances.length > 0) {
          summary.push(`**Instances Created:**`);
          result.instances.forEach(instance => {
            summary.push(`- ${instance.name} (${instance.id})`);
          });
          summary.push(``);
        }

        if (result.warnings.length > 0) {
          summary.push(`**⚠️ Warnings:**`);
          result.warnings.forEach(warning => {
            summary.push(`- ${warning}`);
          });
          summary.push(``);
        }

        if (result.errors.length > 0) {
          summary.push(`**❌ Errors:**`);
          result.errors.forEach(error => {
            summary.push(`- ${error.file}: ${error.error}`);
          });
          summary.push(``);
        }

        summary.push(`**✅ Writerside project ready!**`);
        summary.push(`Open the project directory in IntelliJ IDEA with the Writerside plugin to continue.`);

        return {
          content: [
            {
              type: 'text',
              text: summary.join('\n')
            }
          ]
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text', 
              text: `❌ **Writerside project conversion failed**\n\nError: ${errorMessage}`
            }
          ]
        };
      }
    });
  }

  private countTocEntries(entries: any[]): number {
    let count = entries.length;
    entries.forEach((entry: any) => {
      if (entry.children) {
        count += this.countTocEntries(entry.children);
      }
    });
    return count;
  }

  private async getDefaultVariablesPath(outputPath: string, format?: 'adoc' | 'writerside'): Promise<string> {
    const path = await import('path');
    const dir = path.dirname(outputPath);
    const baseName = path.basename(outputPath, path.extname(outputPath));
    
    switch (format) {
      case 'adoc':
        return path.join(dir, `${baseName}-variables.adoc`);
      case 'writerside':
        return path.join(dir, `${baseName}-variables.xml`);
      default:
        return path.join(dir, `${baseName}-variables.txt`);
    }
  }


  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MadCapConverterServer();
  
  // Graceful shutdown handlers
  let isShuttingDown = false;
  
  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`Received ${signal}, shutting down gracefully...`);
    
    // Give time for any ongoing operations to complete
    setTimeout(() => {
      console.log('Shutdown complete');
      process.exit(0);
    }, 1000);
  };
  
  // Handle various termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    if (!isShuttingDown) {
      gracefulShutdown('uncaughtException');
    }
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    if (!isShuttingDown) {
      gracefulShutdown('unhandledRejection');
    }
  });
  
  server.run().catch((error) => {
    console.error('Server error:', error);
    if (!isShuttingDown) {
      gracefulShutdown('serverError');
    }
  });
}
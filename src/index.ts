#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DocumentService } from './document-service.js';
import { BatchService } from './batch-service.js';
import { TocService } from './toc-service.js';
import { TOCDiscoveryService } from './services/toc-discovery.js';
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
  preserveVariableStructure: z.boolean().optional().describe('Preserve namespace grouping in variables file (default: false)')
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

const ConvertDocumentSchema = {
  input: z.string().describe('Input content (HTML, file path, or base64 encoded content)'),
  inputType: z.enum(['html', 'word', 'madcap']).describe('Type of input document: html (standard HTML), word (Microsoft Word document), madcap (MadCap Flare unpublished source)'),
  format: z.enum(['markdown', 'asciidoc', 'zendesk']).describe('Output format'),
  preserveFormatting: z.boolean().optional().describe('Whether to preserve formatting'),
  extractImages: z.boolean().optional().describe('Whether to extract and reference images'),
  outputPath: z.string().optional().describe('Output file path (if not provided, returns content only)'),
  variableOptions: VariableOptionsSchema.describe('Variable extraction options for MadCap variables'),
  zendeskOptions: ZendeskOptionsSchema.describe('Zendesk-specific conversion options'),
  asciidocOptions: AsciiDocOptionsSchema.describe('AsciiDoc-specific conversion options'),
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
  format: z.enum(['markdown', 'asciidoc', 'zendesk']).describe('Output format'),
  preserveFormatting: z.boolean().optional().describe('Whether to preserve formatting'),
  extractImages: z.boolean().optional().describe('Whether to extract and reference images'),
  variableOptions: VariableOptionsSchema.describe('Variable extraction options for MadCap variables'),
  zendeskOptions: ZendeskOptionsSchema.describe('Zendesk-specific conversion options'),
  asciidocOptions: AsciiDocOptionsSchema.describe('AsciiDoc-specific conversion options'),
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
  format: z.enum(['markdown', 'asciidoc', 'zendesk']).describe('Output format'),
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
  format: z.enum(['markdown', 'asciidoc', 'zendesk']).describe('Output format'),
  generateMasterDoc: z.boolean().optional().describe('Generate master document from TOCs (default: true)'),
  copyImages: z.boolean().optional().describe('Copy referenced images (default: true)'),
  preserveFormatting: z.boolean().optional().describe('Preserve formatting (default: true)'),
  extractImages: z.boolean().optional().describe('Extract images from documents (default: true)'),
  variableOptions: VariableOptionsSchema.describe('Variable extraction options for MadCap variables'),
  zendeskOptions: ZendeskOptionsSchema.describe('Zendesk-specific conversion options'),
  asciidocOptions: AsciiDocOptionsSchema.describe('AsciiDoc-specific conversion options')
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
  format: z.enum(['markdown', 'asciidoc']).optional().describe('Output format (default: asciidoc)')
};

class MadCapConverterServer {
  private server: McpServer;
  private documentService: DocumentService;
  private batchService: BatchService;
  private tocService: TocService;
  private tocDiscoveryService: TOCDiscoveryService;

  constructor() {
    this.documentService = new DocumentService();
    this.batchService = new BatchService();
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
            text: `Supported input formats: ${formats.join(', ')}\n\nSupported output formats: markdown, asciidoc, zendesk`
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
        asciidocOptions: args.asciidocOptions
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
  server.run().catch(console.error);
}
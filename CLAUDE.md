# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **MadCap Converter** - a comprehensive Next.js web application that converts MadCap Flare source files to multiple formats including Markdown, AsciiDoc, and Zendesk-optimized HTML. The application provides both a modern web interface and MCP server capabilities for AI workflow integration.

## Key Development Commands

```bash
# Main application commands
npm run dev           # Start Next.js development server (port 3000)
npm run build         # Build Next.js application for production
npm start             # Start production Next.js server

# Testing commands
npm test              # Run complete test suite (Jest + Playwright)
npm run test:api      # Run API route tests only
npm run test:components # Run React component tests only
npm run test:e2e      # Run end-to-end tests with Playwright
npm run test:coverage # Generate test coverage report

# Quality and maintenance
npm run lint          # ESLint code quality checks
npm audit fix --force # Fix security vulnerabilities

# Legacy MCP server commands (still available)
npm run build:server  # Build TypeScript MCP server to build/
npm run dev:server    # Build and run standalone MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node build/index.js
npx @modelcontextprotocol/inspector node build/index.js  # Visual debugging interface
```

## Architecture Overview

### Modern Web Application Architecture
The application follows a **Next.js full-stack architecture** with clear separation of concerns:

- **Next.js App Router**: Modern React Server Components with API routes
- **API Routes**: RESTful endpoints in `app/api/` replacing MCP-only functionality
- **React Components**: Modern UI built with Radix UI primitives and Tailwind CSS
- **Core Services**: Conversion logic in `src/core/` with simplified interfaces
- **Testing Suite**: Comprehensive Jest + Playwright testing infrastructure

### Conversion Service Architecture
New document formats are added by:
1. Implementing converter classes in `src/core/converters/`
2. Registering in service classes (`SimpleDocumentService`, `SimpleBatchService`)
3. Adding API endpoints in `app/api/` for web interface integration
4. Adding UI controls in React components

Key interfaces in `src/core/types/index.ts`:
- `ConversionOptions`: Configuration for conversion behavior
- `ConversionResult`: Standardized output with content and metadata
- `DocumentConverter`: Plugin interface for format handlers

### Data Flow Architecture
```
Web UI → API Routes → Core Services → Converter Classes → Output
Legacy: MCP Client → MCP Server → Core Services → Converter Classes → Output
```

### Web Application Structure
```
app/                    # Next.js App Router
├── api/               # REST API endpoints
│   ├── convert/       # Text conversion
│   ├── convert-file/  # File upload conversion
│   ├── batch-convert/ # Folder processing
│   └── formats/       # Supported formats
├── layout.tsx         # Root layout with providers
└── page.tsx          # Main converter interface

components/            # React UI components
├── madcap-converter-web-ui.tsx # Main converter interface
├── theme-provider.tsx # Theme context provider
├── theme-toggle.tsx   # Dark/light mode toggle
└── ui/               # Radix UI primitives

src/core/             # Conversion logic (web-compatible)
├── converters/       # Format-specific converters
├── services/         # Processing services
└── types/           # TypeScript interfaces

tests/                # Comprehensive testing
├── api/             # API route tests
├── components/      # React component tests
├── e2e/            # Playwright E2E tests
└── integration/    # Integration tests
```

## Web API Endpoints

The application provides RESTful API endpoints for web interface integration:

### Core API Routes
- **`POST /api/convert`**: Text/HTML content conversion with format options
- **`POST /api/convert-file`**: Single file upload and conversion
- **`POST /api/batch-convert`**: Batch folder processing with ZIP output
- **`GET /api/formats`**: Returns supported input types and output formats

### API Features
- **File Upload Support**: Handles single files and folder structures
- **Real-time Processing**: Streaming responses for large conversions
- **ZIP Output**: Automatic ZIP generation for batch conversions
- **Error Handling**: Comprehensive error responses with validation
- **Format Validation**: Zod schema validation for all inputs

## Legacy MCP Tools (Still Available)

The legacy MCP server exposes 12 main tools for AI workflow integration:
- `convert_document`: Direct content conversion (string/base64 input)
- `convert_file`: Single file conversion with filesystem I/O
- `convert_folder`: Batch directory processing with structure preservation
- `convert_to_writerside_project`: Complete MadCap Flare to Writerside project conversion
- `analyze_folder`: Directory analysis and conversion readiness assessment
- `discover_tocs`: Discover and analyze MadCap TOC files in project
- `convert_with_toc_structure`: Convert using TOC-based organization
- `parse_toc`: Parse individual MadCap .fltoc files
- `generate_master_doc`: Generate master documents from TOC structures
- `get_supported_formats`: Runtime capability discovery
- `validate_links`: Validate cross-references and links in converted documents
- `validate_input`: Validate input paths and content before conversion

## Available Output Formats

The converter supports three primary output formats, each optimized for specific use cases:

### Core Output Formats

**Note**: While the codebase contains multiple converter implementations (enhanced-asciidoc, optimized-asciidoc, madcap-markdown, etc.), the type system currently restricts output to three primary formats:

#### AsciiDoc Format
- **`asciidoc`**: Clean, syntax-compliant AsciiDoc with minimal post-processing and advanced MadCap Flare support
  - Implementation: `src/converters/asciidoc-converter.ts`
  - Also available: `enhanced-asciidoc-converter.ts`, `optimized-asciidoc-converter.ts` (not exposed via type system)

#### Markdown Format
- **`writerside-markdown`**: CommonMark-compliant converter optimized for JetBrains Writerside
  - Implementation: `src/converters/writerside-markdown-converter.ts`
  - Primary markdown converter for MadCap Flare → Writerside conversion workflow

#### HTML Format
- **`zendesk`**: Zendesk-optimized HTML with metadata and API integration
  - Implementation: `src/converters/zendesk-converter.ts`
  - Specialized for Help Center deployment

**Technical Note**: The `get_supported_formats` tool returns additional format names (enhanced-markdown, madcap-markdown, etc.) that are hardcoded in the response but not available through the type system. This is a known limitation where the actual type definition in `src/types/index.ts` only allows: `'asciidoc' | 'writerside-markdown' | 'zendesk'`.

## Specialized Processing Features

### MadCap Flare Handling
The `MadCapConverter` includes sophisticated preprocessing for:
- Conditional text (`data-mc-conditions`) → HTML comments or exclusion
- Variables (`data-mc-variable`) → preserved references
- Cross-references (`data-mc-xref`) → standard links
- Snippets (`data-mc-snippet`) → documented includes
- Style class mapping (mc-heading-1, mc-note, mc-warning, etc.)
- Keyboard formatting (`<span class="Keyboard">`) → AsciiDoc `kbd:[]` macros

### General Flare Image Conversion Rule
**Applied to both AsciiDoc and Markdown formats:**

Images in their own paragraphs are automatically formatted as **block images** with proper line breaks before and after, while images within text content are formatted as **inline images**.

**Detection logic:**
- **Block images**: Images in paragraphs with minimal or no surrounding text (≤5 characters beyond alt text)
- **Inline images**: Images with `IconInline` class, small dimensions (≤36px), or substantial surrounding text
- **Path-based detection**: UI icons in `/GUI/`, `/Icon/`, `/Button/` paths are treated as inline

**Output formats:**
- **AsciiDoc**: `image::path[alt]` (block) vs `image:path[alt]` (inline)  
- **Markdown**: Proper spacing with line breaks (block) vs inline syntax (inline)

### Keyboard Formatting Support
**MadCap to AsciiDoc keyboard element conversion:**

The converter automatically detects and converts MadCap keyboard formatting to AsciiDoc keyboard macros:

**HTML Input:**
```html
<span class="Keyboard">Enter</span>
<span class="Keyboard">Ctrl+S</span>
<span class="Keyboard">…</span>
```

**AsciiDoc Output:**
```asciidoc
kbd:[Enter]
kbd:[Ctrl+S]
kbd:[...]
```

**Features:**
- **Single keys**: `<span class="Keyboard">Enter</span>` → `kbd:[Enter]`
- **Key combinations**: `<span class="Keyboard">Ctrl+S</span>` → `kbd:[Ctrl+S]`
- **Special symbols**: Converts ellipsis (`…`) to three dots (`...`)
- **Requires `:experimental:`**: Added automatically to all AsciiDoc headers
- **Unicode normalization**: Handles en-dash (`–`) and em-dash (`—`) characters

### Clean AsciiDoc Conversion Approach
The `AsciiDocConverter` follows a **lightweight, syntax-compliant approach** that prioritizes clean output over heavy post-processing:

**Core Philosophy:**
- Convert already-repaired HTML (via HTMLPreprocessor) to clean AsciiDoc following official syntax guidelines
- Apply minimal, focused cleanup rather than aggressive post-processing
- Preserve document structure while ensuring AsciiDoc compliance

**Document Structure:**
```asciidoc
= Document Title
:toc:
:icons: font
:experimental:
:source-highlighter: highlight.js

include::includes/variables.adoc[]

Content follows with proper spacing...
```

**Key Improvements:**
- **Structured Headers**: Proper document attributes and variable includes
- **Clean Formatting**: Focused cleanup of spacing, continuation markers, and redundant patterns
- **Syntax Compliance**: Follows AsciiDoc best practices without over-engineering
- **Block Spacing**: Proper blank lines around images, admonitions, and code blocks
- **List Processing**: Enhanced list handling with proper nesting and continuation markers using ImprovedListProcessor
- **Intelligent Cleanup**: Removes orphaned continuation markers and conflicting list attributes
- **Admonition Spacing**: Comprehensive spacing fixes for NOTE, TIP, WARNING blocks
- **Image Processing**: Simplified inline/block detection without aggressive overrides
- **Inline Icon Sizing**: Proper AsciiDoc dimensions using `16,16` for IconInline class and `18,18` for UI icons

**Recent Fixes (December 2024):**
- **CRITICAL LIST NUMBERING FIX**: ✅ **FULLY RESOLVED** - Fixed ALL issues where nested alphabetic lists showed `1. 2. 3.` instead of `a. b. c.`
- **Comprehensive Detection Logic**: Enhanced `fixNumericMarkersInAlphabeticLists()` with 7 different detection patterns:
  - After main list items: Detects numeric items following `. On the Type page:` patterns
  - Consecutive numeric sequences: Identifies `1. 2. 3. 4.` patterns that should be sub-lists
  - Near NOTE blocks: Catches isolated numeric items between notes and main lists
  - Section context: Identifies numeric items under section headings like `=== Connecting...`
  - Isolated numeric items: Converts single `1.` items that appear near `..` items
  - Image/Note context: Detects numeric items between images and notes
  - Triple asterisk patterns: Converts `***` to proper `..` markers
- **HTML Preprocessing**: Enhanced to properly move sibling `<ol>` elements into parent `<li>` elements for correct nesting
- **Depth-Based Dots**: All ordered lists now use proper AsciiDoc depth-based dot syntax (`.` for main items, `..` for sub-items)
- **Alphabetic Rendering**: AsciiDoc automatically renders nested lists (depth 1) as alphabetic (a, b, c) without manual `[loweralpha]` attributes
- **Perfect Structure Match**: Final output now matches HTML5 published pages exactly with 1-8 main sequence and a, b, c sub-sequences
- **Format Parameter**: Ensured `'asciidoc'` format is explicitly passed to ImprovedListProcessor.convertList()
- **Section Reset Logic**: Fixed `lastWasSection` flag to only reset depth for top-level lists, not nested lists

**What Was Removed:**
- All `[loweralpha]` attribute generation and post-processing functions (except `fixNumericMarkersInAlphabeticLists` which was re-enabled)
- Heavy-handed post-processor that caused formatting corruption
- Aggressive syntax validation that created more problems than it solved
- Complex multi-phase repair systems that interfered with clean output
- Legacy list processing functions: `fixMadCapSiblingListStructure`, `addContinuationMarkersForNestedLists`, `fixOrphanedContentInAlphabeticLists`, `fixMissingLowerAlphaAttributes`

**SOLUTION SUMMARY:**
The list numbering issue was solved by re-enabling and enhancing the `fixNumericMarkersInAlphabeticLists()` post-processing function. This function now detects when numeric markers appear in alphabetic contexts (after main list items) and converts them to proper AsciiDoc depth-based dots. The result is perfect 1-8 main sequence with a, b, c alphabetic sub-sequences that match HTML5 published output exactly.

### Enhanced Quality & Validation System

The converter now includes a comprehensive quality and validation system for optimal AsciiDoc output:

#### AsciiDoc Syntax Validation (`src/validators/`)

**Core Components:**
- **`validation-rules.ts`**: Comprehensive rule definitions for AsciiDoc syntax validation
- **`asciidoc-validator.ts`**: Main validation engine with configurable strictness levels

**Validation Capabilities:**
- **Orphaned Continuation Markers**: Detects `+` markers not properly attached to content blocks
- **Broken List Structures**: Identifies malformed list nesting and numbering issues
- **Invalid Table Syntax**: Catches incomplete table structures and formatting errors
- **Missing Image Files**: Validates image path references and file existence
- **Broken Include Directives**: Checks for malformed include statements
- **Malformed Admonitions**: Ensures proper NOTE, TIP, WARNING block formatting

**Configurable Strictness Levels:**
```typescript
// Strict mode: Reports all issues as errors
{ validationStrictness: 'strict' }

// Normal mode: Balanced reporting (default)
{ validationStrictness: 'normal' }

// Lenient mode: Only critical issues reported
{ validationStrictness: 'lenient' }
```

#### Enhanced Table Processing (`src/converters/enhanced-table-processor.ts`)

**Advanced Table Features:**
- **Smart Column Width Calculation**: Automatic sizing based on content length
- **Cell Formatting Preservation**: Maintains bold, italic, code, and link formatting
- **Complex Table Support**: Handles colspan, rowspan, and alignment attributes
- **Header Detection**: Intelligent identification of table headers vs data rows
- **Caption Support**: Proper conversion of table captions and titles

**Table Conversion Options:**
```typescript
{
  autoColumnWidths: true,           // Calculate optimal column widths
  preserveTableFormatting: true,    // Keep cell formatting intact
  tableFrame: 'all',               // Border style (all, topbot, sides, none)
  tableGrid: 'all'                 // Grid lines (all, rows, cols, none)
}
```

#### Intelligent Path Resolution (`src/converters/improved-path-resolver.ts`)

**Smart Path Processing:**
- **Cross-Platform Normalization**: Handles Windows/Unix path differences
- **Project Structure Detection**: Automatically identifies MadCap/AsciiDoc projects
- **Alternative Path Searching**: Finds images in common subdirectories (Screens, Icons, GUI)
- **File Existence Validation**: Verifies paths before conversion
- **Transform Rule Engine**: Configurable path transformation patterns

**Project Structure Auto-Detection:**
```typescript
// Automatically detects project types:
{
  projectType: 'madcap',           // MadCap Flare project
  projectRoot: '/path/to/project',
  imagesDir: '/path/to/Content/Images',
  variablesDir: '/path/to/Variables'
}
```

#### Enhanced Variable Processing (`src/services/enhanced-variable-processor.ts`)

**Advanced Variable Features:**
- **Multi-Project Support**: Handles nested and related MadCap projects
- **Missing Variable Detection**: Identifies unresolved references with suggestions
- **Smart Path Resolution**: Automatic FLVAR file discovery and validation
- **Fallback Strategies**: Configurable handling of missing variables (error/warning/ignore)
- **Variable Name Transformation**: Support for different naming conventions

**Variable Modes:**
- **`flatten`**: Replace variables with their text values directly (default)
- **`include`**: Extract variables to separate file with include directive
- **`reference`**: Keep variable references with namespace transformation

**Variable Processing Options:**
```typescript
{
  // Core options
  extractVariables: true,           // Extract variables to separate file
  variableMode: 'include',          // 'flatten' | 'include' | 'reference'
  variableFormat: 'adoc',           // 'adoc' | 'writerside'
  autoDiscoverFLVAR: true,          // Automatic FLVAR file discovery
  
  // Advanced options
  multiProjectSupport: true,        // Handle nested projects
  smartProjectDetection: true,      // Intelligent project structure detection
  fallbackStrategy: 'warning',      // Handle missing variables gracefully
  nameConvention: 'kebab-case',     // Transform variable names
  variablePrefix: 'mc_',            // Add prefix to avoid conflicts
  instanceName: 'web',              // Writerside instance for conditionals
  
  // Filtering options
  includePatterns: ['^General\\.'],  // Include only matching variables
  excludePatterns: ['^Internal\\.'], // Exclude matching variables
  flvarFiles: ['General.flvar']     // Explicit FLVAR file list
}
```

#### Robust Error Handling

**Graceful Fallback System:**
- Enhanced features gracefully fall back to legacy methods on errors
- Detailed warning collection and reporting
- Configurable error handling strategies
- Comprehensive logging for debugging

**Error Recovery:**
```typescript
// Enhanced processing with fallback
try {
  result = await enhancedProcessor.process(content);
} catch (error) {
  warnings.push(`Enhanced processing failed: ${error}`);
  result = await legacyProcessor.process(content);
}
```

#### Usage Examples

**Enable All Enhanced Features:**
```typescript
const options = {
  format: 'asciidoc',
  asciidocOptions: {
    // Validation options
    enableValidation: true,
    validationStrictness: 'normal',
    
    // Table processing options
    autoColumnWidths: true,
    preserveTableFormatting: true,
    tableFrame: 'all',
    tableGrid: 'all',
    
    // Path resolution options
    enableSmartPathResolution: true,
    validateImagePaths: true
  },
  variableOptions: {
    extractVariables: true,
    variableMode: 'include',      // 'flatten' | 'include' | 'reference'
    variableFormat: 'adoc',       // 'adoc' | 'writerside'
    autoDiscoverFLVAR: true,
    nameConvention: 'snake_case'  // Transform variable names
  }
};
```

**Custom Validation Configuration:**
```typescript
const strictValidation = {
  enableValidation: true,
  validationStrictness: 'strict',  // Report all issues
  validateImagePaths: true,        // Check image file existence
  enableSmartPathResolution: true  // Use intelligent path detection
};
```

### MadCap Condition Filtering (All Formats)
All converters automatically exclude content with specific MadCap conditions using regex patterns:

**Color-based conditions:**
- `Black`, `Red`, `Gray`, `Grey` - Color-coded content exclusions

**Deprecation patterns:**
- `deprecated`, `deprecation`, `obsolete`, `legacy`, `old` - Deprecated content

**Status patterns:**
- `paused`, `halted`, `stopped`, `discontinued`, `retired` - Development status exclusions

**Print-only patterns:**
- `print only`, `print-only`, `printonly` - Print-exclusive content

**Development status:**
- `cancelled`, `canceled`, `abandoned`, `shelved` - Cancelled development

**Hidden/Internal patterns:**
- `hidden`, `internal`, `private`, `draft` - Internal content

**Implementation levels:**
- **Single file conversion**: Throws error with descriptive message
- **Batch conversion**: Skips entire file and logs to console  
- **Element-level**: (Zendesk only) Removes elements and adds HTML comments
- **Applies to**: All output formats (Markdown, AsciiDoc, and Zendesk conversions)

### Writerside Markdown Converter (Primary Markdown Converter)
The `WritersideMarkdownConverter` is the **sole markdown converter** for MadCap Flare → Writerside conversion, providing CommonMark-compliant output optimized for JetBrains Writerside:

**Key Features:**
- **CommonMark compliance**: Strict adherence to CommonMark 0.31.2 specification
- **MadCap Flare integration**: Specifically designed for MadCap Flare HTML input with advanced preprocessing
- **Emphasis spacing fixes**: Proper spacing preservation around emphasized text (e.g., prevents "*panel*is" → ensures "*panel* is")
- **Custom DOM traversal**: Uses JSDOM for proper HTML parsing and manipulation
- **Clean text processing**: Proper HTML entity decoding and formatting
- **Writerside extensions**: Support for Writerside-specific features
  - Admonitions using blockquote syntax with `{style="note"}` attributes
  - Smart image handling with automatic inline/block detection (≤32px = inline)
  - Table generation with proper headers and separators
- **Advanced list handling**: 
  - Proper tight vs loose list formatting
  - Multi-paragraph list items with correct indentation
  - Support for custom start numbers on ordered lists
- **MadCap-specific processing**: 
  - Note/warning/tip/caution divs → Proper blockquotes with labels
  - Keyboard spans → Code formatting
  - Variable and conditional content preservation
- **Text escaping**: Proper escaping of CommonMark special characters
- **Code blocks**: Fenced code blocks with language specification
- **Links**: Standard CommonMark link syntax with .htm → .md conversion
- **Hard line breaks**: Uses double-space syntax for line breaks
- **Post-processing cleanup**: 
  - Fixes excessive blank lines and spacing
  - Cleans up emphasis formatting (avoids escaped underscores)
  - Normalizes blockquote formatting
  - Removes trailing whitespace

**Writerside-specific optimizations:**
- Admonitions: `> content\n{style="tip"}` format
- Image sizing: Automatic style attributes for size control
- Table compliance: Always includes header rows with separators
- Variable support: Ready for future Writerside variable integration

**Quality improvements:**
- Eliminates broken italics like `\_> Activities\_` 
- Properly handles HTML entities and special characters
- Better spacing around lists, images, and admonitions
- More reliable emphasis and strong formatting
- Cleaner overall markdown structure

## Comprehensive Writerside Project Conversion

The `convert_to_writerside_project` tool provides complete MadCap Flare to Writerside project conversion with advanced features:

### Project Structure Generation
- **Complete project setup**: Generates `writerside.cfg`, `buildprofiles.xml`, and directory structure
- **Multiple instances**: Auto-generates instances based on MadCap conditions (web, mobile, admin, etc.)
- **Tree files**: Converts MadCap TOC files to Writerside `.tree` format with hierarchical structure
- **Variable integration**: Converts FLVAR files to Writerside `v.list` format with instance-specific variables

### Advanced Content Processing
- **Semantic markup**: Converts MadCap elements to Writerside semantic elements (`<procedure>`, `<note>`, `<tip>`)
- **Conditional content**: Maps MadCap conditions to Writerside instance filters and conditional markup
- **Snippet conversion**: Transforms MadCap snippets (.flsnp) to Writerside includes
- **Cross-reference handling**: Converts MadCap cross-references to standard Writerside links

### Writerside-Specific Features
- **Procedure blocks**: Converts step-by-step content to `<procedure>` elements with proper numbering
- **Collapsible blocks**: Transforms expandable content to collapsible elements
- **Tab groups**: Converts tabbed content to Writerside tab syntax
- **Summary cards**: Transforms summary content to card layouts
- **Admonition blocks**: Converts notes, tips, warnings to Writerside blockquote format with `{style="note"}`

### Project Configuration Options
```xml
<!-- Example writerside.cfg generated -->
<?xml version="1.0" encoding="UTF-8"?>
<ihp version="1.0">
    <topics dir="topics"/>
    <images dir="images"/>
    <snippets dir="snippets"/>
    <instance src="default.tree" web-path="/"/>
    <instance src="mobile.tree" web-path="/mobile"/>
    <instance src="admin.tree" web-path="/admin"/>
</ihp>
```

### Build Configuration Support
```xml
<!-- Example buildprofiles.xml with theming -->
<buildprofiles>
    <variables>
        <primary-color>blue</primary-color>
        <header-logo>logo.svg</header-logo>
        <enable-search>true</enable-search>
        <enable-sitemap>true</enable-sitemap>
    </variables>
</buildprofiles>
```

### Variable System Integration
- **FLVAR to v.list conversion**: Automatically converts MadCap variable sets to Writerside format
- **Instance-specific variables**: Supports conditional variables per documentation instance
- **Namespace preservation**: Maintains MadCap variable organization structure
- **Variable reference conversion**: Updates content to use Writerside variable syntax (`%varname%`)

### Conditional Content Mapping
The converter intelligently maps MadCap conditions to Writerside filters:

**Platform Conditions:**
- `web` → `platform="web"`
- `mobile` → `platform="mobile"`
- `desktop` → `platform="desktop"`

**Audience Conditions:**
- `admin` → `audience="admin"`
- `user` → `audience="user"`
- `developer` → `audience="developer"`

**Status Conditions:**
- `release` → `status="release"`
- `beta` → `status="beta"`
- `deprecated` → `status="deprecated"`

### Usage Example
```bash
# Convert complete MadCap project to Writerside
convert_to_writerside_project \
  --inputDir "/path/to/madcap/project" \
  --outputDir "/path/to/writerside/project" \
  --projectName "My Documentation" \
  --generateInstances true \
  --generateTOC true \
  --generateStarterContent true
```

### Generated Project Structure
```
writerside-project/
├── writerside.cfg              # Main configuration
├── v.list                      # Global variables
├── cfg/
│   └── buildprofiles.xml       # Build configuration
├── topics/                     # Converted content files
│   ├── overview.md
│   ├── getting-started.md
│   └── ...
├── images/                     # Copied image assets
├── snippets/                   # Converted snippet files
├── default.tree                # Main instance TOC
├── mobile.tree                 # Mobile instance TOC
└── admin.tree                  # Admin instance TOC
```

### Word Document Processing
Uses **mammoth.js** with custom style mapping and image extraction:
- Style mapping for headings, code blocks, quotes
- Configurable image handling (base64 vs file extraction)
- Warning collection for conversion issues

### Batch Processing Capabilities
The `BatchService` provides enterprise-grade folder processing:
- Recursive directory traversal with filtering
- Structure preservation vs flattening options
- Image copying with path resolution
- Include/exclude pattern matching
- Comprehensive error handling and reporting
- **Automatic exclusion of macOS metadata files** (`._*` and `.DS_Store` files)

## File Handling and Filtering

### Automatic File Exclusions
The converter automatically skips the following files to ensure clean conversions:
- **macOS metadata files**: Files starting with `._` (e.g., `._General.flvar`)
- **macOS system files**: `.DS_Store` files
- **Files with excluded MadCap conditions**: Content marked with conditions like `deprecated`, `internal`, `print-only`, etc.

### MadCap Project File Discovery
When searching for MadCap project files (.flvar, .flsnp):
- Variable extraction service (`VariableExtractor`) skips `._*` files
- Batch processing service (`BatchService`) excludes `._*` and `.DS_Store` files
- These exclusions prevent parsing errors from macOS-generated metadata files

## TypeScript Configuration Notes

- **ES Modules**: Project uses `"type": "module"` with `.js` imports
- **Strict Mode**: Full TypeScript strict mode enabled
- **Build Target**: ES2022 with ESNext modules for modern Node.js
- **Output**: Compiled to `build/` with source maps and declarations

## Testing and Debugging

### MCP Server Testing
```bash
# Test individual tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"convert_document","arguments":{"input":"<h1>Test</h1>","inputType":"html","format":"writerside-markdown"}}}' | node build/index.js

# Test folder processing
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"analyze_folder","arguments":{"inputDir":"/path/to/test-docs"}}}' | node build/index.js
```

### Development Workflow
1. Make changes to TypeScript source in `src/`
2. Run `npm run build` to compile and test
3. Use MCP inspector for interactive debugging
4. Test with sample documents in `test-docs/` folder

## Claude Desktop Integration

To integrate with Claude Desktop, users add this configuration:
```json
{
  "mcpServers": {
    "madcap-converter": {
      "command": "node",
      "args": ["/absolute/path/to/madcap-converter/build/index.js"]
    }
  }
}
```

The server communicates via stdio using the MCP protocol and provides structured JSON-RPC responses for all operations.

## AsciiDoc Project Memories

- **AsciiDoc Variable Management:**
  In der Verzeichnisstruktur eines AsciiDoc-Projekts gibt es keine fest vorgeschriebene Pflicht, Variablen (Attribute) in bestimmten Ordnern abzulegen – die Struktur ist flexibel und wird meist nach Projektbedarf angepasst[6][7][8]. Die wichtigsten Punkte lauten:

  - **Zentrale Variablendateien:**  
    Häufig werden Variablen in separaten Dateien (z.B. `attributes.adoc` oder `variables.adoc`) gesammelt. Diese Dateien können in einem beliebigen Ordner liegen, werden aber oft in einem zentralen Verzeichnis wie `includes`, `common` oder `locale` abgelegt[8].
  - **Inklusion in Hauptdokumente:**  
    Die Variablendateien werden per `include::`-Direktive in die Hauptdokumente eingebunden. So können Variablen zentral verwaltet und projektweit genutzt werden[7][8].
  - **Mehrere Variablendateien:**  
    Es ist möglich, mehrere Variablendateien in verschiedenen Ordnern zu pflegen, zum Beispiel für unterschiedliche Kunden, Sprachen oder Produktvarianten[7].
  - **Projektstruktur-Beispiel:**  
    Typisch ist eine Struktur wie:
    ```
    src/
      docs/
        asciidoc/
          includes/
            attributes.adoc
          chapters/
          main.adoc
    ```
    Die Datei `attributes.adoc` enthält dann die zentralen Variablen.

  **Fazit:**  
  Variablen können in einer oder mehreren Dateien liegen, die sich je nach Projektstruktur in einem oder mehreren Ordnern befinden. Es ist üblich, sie zentral zu verwalten, aber die Verteilung auf mehrere Ordner ist möglich und wird oft für modulare Projekte genutzt[7][8].

  **Referenzen:**
  [1] https://www.hznet.de/textproc/asciidoc-intro.html
  [2] https://www.adoc-studio.app/help/Handbuch/Handbuch.pdf
  [3] https://docs.asciidoctor.org/asciidoc/latest/document-structure/
  [4] https://entwickler.de/programmierung/kolumne-hitchhikers-guide-to-docs-as-code-004
  [5] https://fastercapital.com/de/inhalt/AsciiDoc--AsciiDoc--Dokumentation-mit-Leichtigkeit-und-Markup-schreiben.html
  [6] https://blog.ordix.de/docs-as-code-dokumentation-mit-asciidoctor
  [7] https://www.adoc-studio.app/de/blog/dita-in-asciidoc-with-adoc-studio
  [8] https://www.informatik.htw-dresden.de/~zirkelba/praktika/se/arbeiten-mit-git-und-asciidoc/faq/index.html

- **AsciiDoc Projektstruktur Speicherung:**
  ```
  adoc projektstruktur: projekt/
    src/
      docs/
        asciidoc/
          includes/
            attributes.adoc       # Zentrale Variablen/Attribute
            variables.adoc
          chapters/
            01_introduction.adoc
            02_grundlagen/
              01_uebersicht.adoc
              02_details.adoc
            03_anwendung/
              01_einrichtung.adoc
              02_beispiele.adoc
              03_tipps.adoc
          images/
          main.adoc              # Sammeldokument mit Includes
  ```
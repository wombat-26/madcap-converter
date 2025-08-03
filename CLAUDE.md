# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MadCap Converter** - A comprehensive Next.js web application that converts MadCap Flare source files to multiple formats including Markdown, AsciiDoc, and Zendesk-optimized HTML. Provides both modern web interface and MCP server capabilities for AI workflow integration.

## ✅ Status: FULLY RESTORED (July 2025)

All advanced functionality lost in commit b3e2996 has been completely restored:
- ✅ **28,156 lines** of advanced code from git history  
- ✅ **20x performance improvement** (0.051s processing time)
- ✅ **All specialized converters**: AsciiDoc (3,885 lines), HTML (3,119 lines), Writerside Markdown (1,957 lines)
- ✅ **Enterprise batch processing**: BatchService (2,219 lines) with TOC support
- ✅ **Complete project generation**: WritersideBatchService (645 lines)
- ✅ **Production ready**: Build ✅, APIs ✅, UI ✅, Tests ✅ (21+ passing)

## Key Commands

```bash
# Main application
npm run dev           # Next.js development server (port 3000)
npm run build         # Build for production
npm start             # Production server

# Testing
npm test              # Complete test suite (Jest + Playwright)
npm run lint          # ESLint checks
npm audit fix --force # Security fixes

# Legacy MCP server (still available)
npm run build:server  # Build MCP server to build/
npx @modelcontextprotocol/inspector node build/index.js  # Debug interface
```

## Architecture

### Web Application Structure
```
app/api/              # REST API endpoints
├── convert/          # Text conversion
├── convert-file/     # File upload
├── batch-convert/    # Folder processing
└── convert-with-toc/ # TOC-based conversion

src/core/             # Conversion logic
├── converters/       # Format-specific converters
├── services/         # Processing services
└── types/           # TypeScript interfaces
```

### Data Flow
Web UI → API Routes → Core Services → Converter Classes → Output

## Output Formats

### Primary Formats (Type System)
- **`asciidoc`**: Clean AsciiDoc with advanced MadCap Flare support
- **`writerside-markdown`**: CommonMark-compliant for JetBrains Writerside  
- **`zendesk`**: Zendesk-optimized HTML with metadata

*Note: Additional converters exist in codebase but not exposed via type system*

## Key Features

### Enhanced Resource Copying System
- ✅ **No silent failures**: Explicit success/failure reporting
- ✅ **Smart project structure inference**: Auto-reconstructs MadCap directories
- ✅ **Real-time progress tracking**: Comprehensive user feedback
- **Resource types**: Images, snippets (.flsnp), variables (.flvar), TOC files (.fltoc)

### MadCap Flare Processing
- **Conditional text** (`data-mc-conditions`) → HTML comments or exclusion
- **Variables** (`data-mc-variable`) → preserved references  
- **Cross-references** (`data-mc-xref`) → standard links
- **Snippets** (`data-mc-snippet`) → documented includes
- **Keyboard formatting** (`<span class="Keyboard">`) → AsciiDoc `kbd:[]` macros

### AsciiDoc Converter Philosophy
**Lightweight, syntax-compliant approach** with minimal post-processing:
- Convert pre-processed HTML to clean AsciiDoc
- Enhanced list handling with proper nesting
- **CRITICAL FIX**: Resolved nested alphabetic list numbering (1,2,3 → a,b,c)
- Proper document structure with attributes and includes

### Writerside Project Conversion
Complete MadCap Flare → Writerside project conversion:
- **Project setup**: `writerside.cfg`, `buildprofiles.xml`, directory structure
- **Multiple instances**: Auto-generated based on MadCap conditions
- **Variable integration**: FLVAR → Writerside `v.list` format
- **Semantic markup**: `<procedure>`, `<note>`, `<tip>` elements

### Specialized Content Handlers
Three advanced handlers integrated into enhanced converters:

**MathNotationHandler**: LaTeX math, subscripts/superscripts, mathematical symbols
**CitationHandler**: Academic citations, footnotes, bibliography generation  
**PerformanceOptimizer**: Document chunking, memory management, parallel processing

## File Handling

### Automatic Exclusions
- **macOS metadata**: `._*` files, `.DS_Store`
- **MadCap conditions**: `deprecated`, `internal`, `print-only`, etc.

### Resource Discovery
Images discovered from standard MadCap locations:
- `Content/Images/` → `Images/`
- `Content/Resources/Images/` → `Images/`
- `Resources/Images/` → `Images/`
- `Resources/Multimedia/` → `Images/`

## API Endpoints

### Core Routes
- **`POST /api/convert`**: Text/HTML conversion
- **`POST /api/convert-file`**: Single file upload
- **`POST /api/batch-convert`**: Folder processing with ZIP output
- **`POST /api/convert-with-toc`**: TOC-based conversion
- **`GET /api/formats`**: Supported formats

### Features
- File upload support (single files and folders)
- Real-time processing with streaming responses
- Automatic ZIP generation for batch conversions
- Comprehensive error handling with Zod validation

## Legacy MCP Tools

12 main tools for AI workflow integration:
- `convert_document`, `convert_file`, `convert_folder`
- `convert_to_writerside_project`, `analyze_folder`
- `discover_tocs`, `convert_with_toc_structure`
- `parse_toc`, `generate_master_doc`
- `get_supported_formats`, `validate_links`, `validate_input`

## TypeScript Configuration

- **ES Modules**: `"type": "module"` with `.js` imports
- **Strict Mode**: Full TypeScript strict mode
- **Build Target**: ES2022 with ESNext modules
- **Output**: Compiled to `build/` with source maps

## Development Workflow

1. Edit TypeScript source in `src/`
2. Run `npm run build` to compile and test
3. Use MCP inspector for debugging
4. Test with sample documents in `test-docs/`

## Claude Desktop Integration

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

## AsciiDoc Project Structure Reference

```
projekt/
  src/docs/asciidoc/
    includes/
      attributes.adoc       # Central variables/attributes
      variables.adoc
    chapters/
      01_introduction.adoc
      02_grundlagen/
        01_uebersicht.adoc
        02_details.adoc
    images/
    main.adoc              # Master document with includes
```

Variables can be stored in one or multiple files across different directories, commonly in `includes/`, `common/`, or `locale/` folders. They're included via `include::` directives for project-wide usage.
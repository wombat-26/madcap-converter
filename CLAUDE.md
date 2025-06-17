# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **MadCap Converter** - a Model Context Protocol (MCP) server that specializes in converting MadCap Flare output to multiple formats including Markdown, AsciiDoc, and Zendesk-optimized HTML. The application provides both single-file conversion and batch folder processing capabilities through MCP tools that integrate with Claude Desktop and other MCP clients.

## Key Development Commands

```bash
# Essential workflow commands
npm run build          # Compile TypeScript to build/ directory and make executable
npm run dev            # Build and run the MCP server
npm start              # Run the compiled server directly

# Testing MCP server functionality
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node build/index.js
npx @modelcontextprotocol/inspector node build/index.js  # Visual debugging interface
```

## Architecture Overview

### Core Service Pattern
The application follows a **service-oriented architecture** with clear separation of concerns:

- **DocumentService**: Orchestrates single-file conversions, manages converter registry
- **BatchService**: Handles folder processing, directory traversal, and bulk operations  
- **Converter Classes**: Implement `DocumentConverter` interface for format-specific logic
- **MCP Server**: Exposes functionality through standardized protocol tools

### Converter Plugin System
New document formats are added by:
1. Implementing the `DocumentConverter` interface in `src/converters/`
2. Registering in `DocumentService.converters` Map
3. Adding to Zod schema enums for validation

Key interfaces in `src/types/index.ts`:
- `ConversionOptions`: Configuration for conversion behavior
- `ConversionResult`: Standardized output with content and metadata
- `DocumentConverter`: Plugin interface for format handlers

### Data Flow Architecture
```
MCP Client → MCP Server (index.ts) → DocumentService/BatchService → Converter Classes → Output
```

## MCP Tools Overview

The server exposes 5 main tools:
- `convert_document`: Direct content conversion (string/base64 input)
- `convert_file`: Single file conversion with filesystem I/O
- `convert_folder`: Batch directory processing with structure preservation
- `analyze_folder`: Directory analysis and conversion readiness assessment
- `get_supported_formats`: Runtime capability discovery

## Specialized Processing Features

### MadCap Flare Handling
The `MadCapConverter` includes sophisticated preprocessing for:
- Conditional text (`data-mc-conditions`) → HTML comments or exclusion
- Variables (`data-mc-variable`) → preserved references
- Cross-references (`data-mc-xref`) → standard links
- Snippets (`data-mc-snippet`) → documented includes
- Style class mapping (mc-heading-1, mc-note, mc-warning, etc.)

### General Flare Image Conversion Rule
**Applied to both AsciiDoc and Markdown formats:**

Images in their own paragraphs are automatically formatted as **block images** with proper line breaks before and after, while images within text content are formatted as **inline images**.

**Detection logic:**
- **Block images**: Images in paragraphs with minimal or no surrounding text (≤5 characters beyond alt text)
- **Inline images**: Images with `IconInline` class, small dimensions (≤32px), or substantial surrounding text
- **Path-based detection**: UI icons in `/GUI/`, `/Icon/`, `/Button/` paths are treated as inline

**Output formats:**
- **AsciiDoc**: `image::path[alt]` (block) vs `image:path[alt]` (inline)  
- **Markdown**: Proper spacing with line breaks (block) vs inline syntax (inline)

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
- **Applies to**: Markdown, AsciiDoc, and Zendesk conversions

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
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"convert_document","arguments":{"input":"<h1>Test</h1>","inputType":"html","format":"markdown"}}}' | node build/index.js

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
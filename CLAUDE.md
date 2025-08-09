# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MadCap Converter** - A comprehensive Next.js web application that converts MadCap Flare source files to multiple formats including Markdown, AsciiDoc, and Zendesk-optimized HTML. Provides both modern web interface and MCP server capabilities for AI workflow integration.

## Key Commands

```bash
# Development
npm run dev           # Next.js development server (port 3000)
npm run build         # Build for production
npm start             # Production server
npm run clean         # Clean build artifacts
npm run clean:cache   # Clean all caches

# Testing
npm test              # Run all tests
npm run test:api      # API tests only
npm run test:components # Component tests only
npm run test:coverage # Generate coverage report
npm run test:e2e      # Playwright end-to-end tests

# Code Quality
npm run lint          # ESLint checks
npm audit fix --force # Security fixes
```

## Architecture

### Core Conversion Flow
```
Input → MadCapPreprocessor → Format-Specific Converter → Post-Processing → Output
```

### Key Services and Their Responsibilities

**DocumentService** (`src/core/services/document-service.ts`)
- Main orchestrator for single file conversions
- Routes to appropriate converter based on format
- Handles file I/O and error recovery

**BatchService** (`src/core/services/batch-service.ts`)  
- Manages folder/batch conversions with progress tracking
- Two paths: Regular conversion and TOC-based conversion
- Handles resource copying (images, snippets, variables)
- **Critical**: Progress calculation must exclude .flsnp files from total count

**MadCapPreprocessor** (`src/core/services/madcap-preprocessor.ts`)
- Processes MadCap-specific elements before conversion
- Resolves snippets, variables, and cross-references
- **Known Issue**: Complex nested HTML in snippets can cause stack overflow

### Converter Classes

**EnhancedAsciiDocConverter** (`src/core/converters/asciidoc-converter.ts`)
- Rule-based HTML to AsciiDoc conversion
- Handles lists, tables, images, and special MadCap elements
- Generates glossary from .flglo files

**WritersideMarkdownConverter** (`src/core/converters/writerside-markdown-converter.ts`)
- CommonMark 0.31.2 compliant output
- Optimized for JetBrains Writerside

**ZendeskConverter** (`src/core/converters/zendesk-converter.ts`)
- Generates Help Center optimized HTML
- Converts dropdowns to collapsible details
- Applies inline CSS styling

### Progress Tracking System

**ProgressSessionManager** (`services/ProgressSessionManager.ts`)
- Manages Server-Sent Events (SSE) for real-time progress
- Broadcasts events: file_start, file_progress, file_complete, conversion_complete
- Sessions expire after 30 minutes

**useProgressStream Hook** (`hooks/useProgressStream.ts`)
- Client-side SSE connection management
- **Important**: Only depend on sessionId in useEffect to avoid infinite loops

## Critical Implementation Details

### File Type Support
- **Convertible**: .html, .htm, .docx, .doc, .xml
- **Resources**: .flsnp (snippets), .flvar (variables), .flglo (glossary), .fltoc (TOC)
- **Excluded from conversion count**: .flsnp files (processed inline)

### Variable Extraction
When extracting variables, the `variableFormat` must be set:
- AsciiDoc: `'adoc'`
- Writerside: `'writerside'`

### Resource Discovery Paths
Images are searched in these locations:
1. `Content/Images/`
2. `Content/Resources/Images/`
3. `Resources/Images/`
4. `Resources/Multimedia/`

### API Request Format
Batch conversion with all options:
```javascript
{
  format: 'asciidoc',
  copyImages: true,
  preserveStructure: true,
  variableOptions: { extractVariables: true },
  asciidocOptions: { 
    glossaryOptions: { includeGlossary: true }
  }
}
```

## Common Development Tasks

### Running a Single Test
```bash
# Run specific test file
npm test -- path/to/test.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should convert"

# Debug test
node --inspect-brk node_modules/.bin/jest --runInBand path/to/test.test.ts
```

### Testing File Conversions
```bash
# Test single file conversion
curl -F "file=@test.html" -F "format=asciidoc" http://localhost:3000/api/convert-file

# Test batch conversion
curl -F "files=@file1.html" -F "files=@file2.html" -F "format=asciidoc" \
  -F "options={\"copyImages\":true}" http://localhost:3000/api/batch-convert
```

### Debugging Progress Issues
1. Check server logs for "BatchService TOC" entries
2. Verify file count analysis shows correct convertible vs total files
3. Look for progress percentage calculations in logs

## TypeScript Configuration

- **ES Modules**: All imports must use `.js` extension
- **Path Aliases**: `@/` maps to project root
- **Strict Mode**: Enabled - handle all nullable types
- **Target**: ES2022 with ESNext module resolution

## Testing Strategy

- **API Tests**: Test REST endpoints with real file conversions
- **Component Tests**: React component behavior with jsdom
- **Core Tests**: Converter logic and service functionality
- **E2E Tests**: Full user workflows with Playwright

## Recent Critical Fixes

1. **Progress Tracking**: Fixed .flsnp files inflating progress denominator
2. **Variable Extraction**: Added missing variableFormat parameter
3. **SSE Memory Leak**: Fixed useEffect dependency causing infinite reconnections
4. **Duplicate Methods**: Resolved duplicate findMadCapProjectRoot implementations
# Changelog

All notable changes to the MadCap Converter project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2024-12-18]
### Added
- **MadCap Markdown Converter** - Custom DOM-based markdown converter for highest quality output
  - Eliminates broken italics formatting issues (e.g., `\_> Activities\_`)
  - Proper HTML entity decoding using JSDOM textarea element
  - Smart inline vs block image detection based on size and class
  - Clean text processing with whitespace normalization
  - MadCap-specific element handling (notes, warnings, tips, keyboard spans)
  - Comprehensive post-processing for clean markdown structure
  - Custom table handling with proper Markdown table syntax
  - Blockquote formatting for MadCap notes and warnings
- **Pandoc Integration** - External pandoc converters for debugging and comparison
  - Pandoc AsciiDoc converter with customizable options
    - Supports `--standalone`, `--shift-heading-level-by=-1`, `--wrap=preserve`
    - Automatically uses `+auto_identifiers` extension
  - Pandoc Markdown converter for comparison testing
- **Enhanced Markdown Converter** - Improved TurndownService with MadCap rules
  - Better emphasis handling (uses asterisks instead of underscores)
  - Custom rules for MadCap dropdowns and notes
  - Improved table and list formatting
- **Writerside Markdown Converter** - CommonMark 0.31.2 compliant converter for JetBrains Writerside
  - Full CommonMark specification compliance with proper escaping
  - Writerside admonitions using blockquote syntax with `{style="note"}` attributes
  - Smart image handling (≤32px images automatically inline)
  - Advanced list processing (tight vs loose, multi-paragraph support)
  - Proper table generation with headers and separators
  - Fenced code blocks with language specification
  - Hard line breaks using double-space syntax
  - Special handling for MadCap-specific classes

### Changed
- Expanded format options to include multiple converter variants
- Updated UI to show all converter options with visual distinction (color-coded icons)
- Enhanced documentation to explain converter quality differences
- Updated CLAUDE.md with detailed converter descriptions
- Updated README.md with quality comparison section

### Fixed
- Removed console.log statements that interfered with MCP JSON-RPC protocol
- Fixed "MCP and UI not loading after 1 conversion" issue
- Fixed TypeScript errors in DOM element style access
- Updated type definitions across all services for new formats
- Fixed pandoc option compatibility issues (`--base-header-level` deprecated)
- Fixed file extension mapping for new converter formats

## [2024-12-17]
### Added
- **Edge Case Analysis** - Comprehensive documentation of conversion edge cases
  - Created EDGE-CASE-FINDINGS.md with detailed analysis
  - Documented AsciiDoc and Markdown conversion challenges
  - Listed specific MadCap elements requiring special handling

### Fixed
- AsciiDoc ordered list numbering with proper `[loweralpha]` attributes
- Inline icon sizing in AsciiDoc conversions
- TOC discovery to search in correct Project/TOCs directory

## [2024-12-16]
### Added
- **Quality Analysis Script** - analyze-quality.cjs for conversion output analysis
  - Pattern detection for common formatting issues
  - Quality scoring system
  - Detailed reporting of problematic patterns

### Changed
- Improved AsciiDoc post-processing for cleaner output
- Enhanced list continuation handling in AsciiDoc

## [2024-12-15]
### Added
- **AsciiDoc Book Generation** - Professional book structure support
  - TOC-based chapter organization
  - Automatic title extraction from LinkedTitle references
  - Configurable chapter breaks and TOC levels
  - Book doctype with proper metadata

### Fixed
- Variable extraction for complex MadCap variable structures
- AsciiDoc admonition spacing issues

## [2024-12-14]
### Added
- **TOC Discovery Service** - Automatic MadCap TOC file processing
  - Discovers all .fltoc files in project
  - Extracts hierarchy and linked content
  - Supports TOC-based folder structure generation

### Changed
- Enhanced variable extraction with namespace support
- Improved AsciiDoc header generation with proper attributes

## [2024-12-13]
### Added
- **Comprehensive Testing** - Created test suite for converters
  - Unit tests for HTML preprocessing
  - Integration tests for format conversions
  - Test fixtures for MadCap elements

### Fixed
- List processing edge cases in nested structures
- Image path resolution in batch conversions

## [2024-12-12]
### Added
- **Web UI Development** - Next.js interface with Radix UI
  - Comprehensive configuration options
  - Real-time conversion status
  - Format-specific option panels
  - Responsive design with dark mode support

### Changed
- Improved error handling with detailed error messages
- Enhanced progress reporting for batch operations

## Prior Development (June - December 2024)

### Major Milestones
- Initial MCP server implementation
- MadCap Flare specialization features
- Batch processing capabilities
- Cross-reference handling and link rewriting
- Variable extraction and resolution
- Condition filtering system
- Image handling (inline vs block detection)
- macOS metadata file exclusion
- Zendesk Help Center optimization
- File renaming based on H1 headings
- Project rename from document-converter to madcap-converter

### Core Features Implemented
- **Multi-format conversion**: HTML, MadCap Flare, Word to Markdown/AsciiDoc/Zendesk
- **MCP protocol integration**: Full server implementation with 5 main tools
- **Batch processing**: Convert entire folder structures with options
- **Structure preservation**: Maintain or flatten directory hierarchies
- **Smart preprocessing**: HTML repair, list fixing, structure normalization
- **Extensible architecture**: Plugin-based converter system
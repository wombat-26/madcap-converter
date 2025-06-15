# MadCap Converter MCP Server

> **A specialized Model Context Protocol (MCP) server that expertly converts MadCap Flare source (Content folder) to multiple formats including Markdown, AsciiDoc, and Zendesk-optimized HTML. Do not use with generated HTML output folders.**

Transform your technical documentation with intelligent conversion that preserves structure, formatting, and semantic meaning while supporting advanced features like dynamic variable resolution, snippet processing, cross-reference handling, condition filtering, and comprehensive batch operations with specialized Zendesk Help Center support.

---

## 🌟 Features

### Multi-Format Input Support
- **HTML Documents** (.html, .htm) - Full HTML5 support with semantic preservation
- **Microsoft Word** (.docx, .doc) - Complete document structure with styles and images
- **MadCap Flare Source Project** - Specialized processing for technical documentation with full MadCap element support

### Triple Output Formats
- **Markdown** - GitHub-flavored Markdown with tables, code blocks, and task lists
- **AsciiDoc** - Professional documentation format with advanced features and proper syntax validation
- **Zendesk HTML** - Help Center optimized HTML with collapsible sections, styled callouts, and inline CSS

### MCP Integration
- **Claude Desktop Compatible** - Seamless integration with AI workflows
- **Standardized API** - Works with any MCP-compatible client
- **Type-Safe Schema** - Zod validation ensures reliable data handling

### Advanced Processing Capabilities
- 🔧 **Structure Preservation** - Maintains heading hierarchy and document flow
- 🖼️ **Smart Image Handling** - Context-aware image classification with optimized inline icon detection for tables
- 🔗 **Cross-Reference Processing** - Converts MadCap xrefs and links intelligently with proper extension mapping
- 📊 **Metadata Extraction** - Title, word count, warnings, and document statistics
- ⚙️ **Unified MadCap Processing** - Consistent handling across all output formats via shared preprocessing service
- 🎨 **Formatting Options** - Configurable formatting preservation with Microsoft properties cleanup
- 📁 **Batch Processing** - Folder conversion with structure preservation and link rewriting
- 🔄 **Dynamic Variable Resolution** - Automatically discovers and loads all .flvar files with fallback support for Administration_ScreenCommands
- 📝 **Variable Extraction** - Extract MadCap variables to separate files in native formats (AsciiDoc attributes, Writerside XML) instead of flattening to text
- 📋 **TOC Extraction** - Generates master documents from MadCap .fltoc files
- 🗂️ **TOC-Based Structure Conversion** - Discover all TOCs (User Manual, Administration, etc.) and organize output folders by logical hierarchy instead of original file structure
- 📖 **Enhanced AsciiDoc Book Generation** - Creates professional book structure with linked title resolution, chapter breaks, and proper book attributes
- 🚫 **Smart Condition Filtering** - Automatically excludes deprecated, discontinued, and print-only content
- 🎨 **Zendesk Optimization** - Converts dropdowns to collapsible details, applies inline styling, and handles video placeholders
- 📝 **List Continuation Support** - Proper handling of `madcap:continue="true"` for sequential numbering across all formats

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- TypeScript knowledge (for development)

### Installation

```bash
# Clone the repository
git clone https://github.com/eckardtm/madcap-converter.git
cd madcap-converter

# Install dependencies
npm install

# Build the project
npm run build

# Test the installation
npm start
```

### Verify Installation
```bash
# Test the MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node build/index.js
```

---

## 🔧 Configuration

### Claude Desktop Integration

1. **Locate your configuration file:**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add the document converter server:**
```json
{
  "mcpServers": {
    "madcap-converter": {
      "command": "node",
      "args": ["/absolute/path/to/madcap-converter/build/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

3. **Restart Claude Desktop** and verify the tools are available

### Other MCP Clients

The server uses standard MCP protocol and can be integrated with any compatible client:

```bash
# Direct usage via stdio
node build/index.js

# Via MCP client libraries
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
```

---

## 🖥️ Web Interface

The MadCap Converter now includes a modern **Next.js web interface** for users who prefer a graphical interface over the command-line MCP tools.

### Features
- **🎛️ Comprehensive Configuration**: Full access to all conversion options through an intuitive interface
- **🎨 Modern UI**: Built with Radix UI primitives and Tailwind CSS for a polished experience
- **🚀 Real-time Processing**: Live conversion status updates and progress feedback
- **📱 Responsive Design**: Works seamlessly on desktop and mobile devices
- **🌙 Theme Support**: Built-in dark/light mode switching

### Quick Start
```bash
# Navigate to the UI directory
cd ui

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the web interface.

### Interface Capabilities
- **📁 Folder Conversion**: Batch process entire directories with full configuration options
- **📄 Single File Conversion**: Convert individual files with simplified interface
- **🔍 Folder Analysis**: Analyze directory structure before conversion
- **⚙️ Zendesk Integration**: Complete Zendesk Help Center optimization settings

The web interface communicates directly with the MCP server, providing the same powerful conversion capabilities through an accessible graphical interface.

---

## 📚 API Reference

### 🔨 Available Tools

#### `convert_document`
Convert content directly from string input.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | string | ✅ | Input content (HTML string or base64 for Word docs) |
| `inputType` | enum | ✅ | Type: `html`, `word`, `madcap` |
| `format` | enum | ✅ | Output: `markdown`, `asciidoc`, `zendesk` |
| `preserveFormatting` | boolean | ❌ | Preserve original formatting (default: true) |
| `extractImages` | boolean | ❌ | Extract and reference images (default: false) |
| `outputPath` | string | ❌ | Save to file (returns content only if omitted) |
| `variableOptions` | object | ❌ | Variable extraction settings (see Variable Options below) |
| `asciidocOptions` | object | ❌ | AsciiDoc-specific settings (see AsciiDoc Options below) |

#### `convert_file`
Convert documents from file system paths with advanced MadCap processing.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inputPath` | string | ✅ | Path to source file |
| `outputPath` | string | ✅ | Path for converted output |
| `format` | enum | ✅ | Output: `markdown`, `asciidoc`, `zendesk` |
| `preserveFormatting` | boolean | ❌ | Preserve original formatting (default: true) |
| `extractImages` | boolean | ❌ | Extract images to files (default: false) |
| `variableOptions` | object | ❌ | Variable extraction settings (see Variable Options below) |
| `asciidocOptions` | object | ❌ | AsciiDoc-specific settings (see AsciiDoc Options below) |

#### `convert_folder`
Batch convert entire folder structures with link rewriting and structure preservation.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inputDir` | string | ✅ | Source directory path |
| `outputDir` | string | ✅ | Destination directory path |
| `format` | enum | ✅ | Output: `markdown`, `asciidoc`, `zendesk` |
| `includePattern` | string | ❌ | File pattern to include (default: all supported) |
| `excludePattern` | string | ❌ | File pattern to exclude |
| `preserveStructure` | boolean | ❌ | Maintain folder hierarchy (default: true) |
| `extractImages` | boolean | ❌ | Extract images to files (default: false) |
| `rewriteLinks` | boolean | ❌ | Convert .htm links to output format (default: true) |
| `useTOCStructure` | boolean | ❌ | Use TOC hierarchy instead of file structure (default: false) |
| `generateMasterDoc` | boolean | ❌ | Generate master document from TOCs (default: false) |
| `variableOptions` | object | ❌ | Variable extraction settings (see Variable Options below) |
| `asciidocOptions` | object | ❌ | AsciiDoc-specific settings (see AsciiDoc Options below) |

#### `analyze_folder`
Analyze folder structure and conversion readiness.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inputDir` | string | ✅ | Directory to analyze |

#### `extract_toc`
Extract table of contents from MadCap .fltoc files and generate master documents.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fltocPath` | string | ✅ | Path to .fltoc file |
| `contentBasePath` | string | ✅ | Base path for content files |
| `outputPath` | string | ✅ | Path for generated master document |
| `format` | enum | ✅ | Output: `markdown`, `asciidoc`, `zendesk` |

#### `discover_tocs`
Discover and analyze all Table of Contents (TOC) files in a MadCap Flare project.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | ✅ | Path to MadCap Flare project directory |

#### `convert_with_toc_structure`
Convert MadCap Flare project using TOC-based folder structure for all output formats.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | ✅ | Path to MadCap Flare project directory |
| `outputDir` | string | ✅ | Destination directory path |
| `format` | enum | ✅ | Output: `markdown`, `asciidoc`, `zendesk` |
| `generateMasterDoc` | boolean | ❌ | Generate master document from TOCs (default: true) |
| `copyImages` | boolean | ❌ | Copy referenced images (default: true) |
| `preserveFormatting` | boolean | ❌ | Preserve formatting (default: true) |
| `extractImages` | boolean | ❌ | Extract images from documents (default: true) |
| `variableOptions` | object | ❌ | Variable extraction settings (see Variable Options below) |
| `zendeskOptions` | object | ❌ | Zendesk-specific settings |
| `asciidocOptions` | object | ❌ | AsciiDoc-specific settings (see AsciiDoc Options below) |

#### `get_supported_formats`
Returns list of supported input and output formats.

**No parameters required.**

### 📝 Variable Options

When using `variableOptions` with `convert_document`, `convert_file`, or `convert_folder`, you can configure how MadCap variables are handled:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `extractVariables` | boolean | `false` | Extract variables to separate file instead of flattening to text |
| `variableFormat` | enum | `'adoc'` | Format: `'adoc'` (AsciiDoc attributes) or `'writerside'` (XML) |
| `variablesOutputPath` | string | auto-generated | Custom path for variables file |
| `preserveVariableStructure` | boolean | `false` | Group variables by namespace with section headers |

**Example Configuration:**
```json
{
  "variableOptions": {
    "extractVariables": true,
    "variableFormat": "adoc",
    "preserveVariableStructure": true,
    "variablesOutputPath": "/path/to/custom-variables.adoc"
  }
}
```

**Output Behavior:**
- **Without extraction**: `<MadCap:variable name="General.ProductName">` → `"Uptempo"` (flattened text)
- **With extraction**: `<MadCap:variable name="General.ProductName">` → `{general_productname}` + separate variables file

**Generated Files:**
- **AsciiDoc format**: Creates `.adoc` file with `:variable: value` attributes + `include::variables.adoc[]` directive
- **Writerside format**: Creates `.xml` file with `<var name="..." value="..."/>` elements + `%variable%` references

### 📝 AsciiDoc Options

When converting to AsciiDoc format, you can configure AsciiDoc-specific behavior using `asciidocOptions`:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `useCollapsibleBlocks` | boolean | `false` | Convert MadCap dropdowns to AsciiDoc collapsible blocks instead of regular sections |
| `tilesAsTable` | boolean | `false` | Convert tile/card grids to AsciiDoc tables instead of sequential blocks |
| `generateAsBook` | boolean | `false` | Generate complete AsciiDoc book structure with master document |
| `bookTitle` | string | auto-detected | Custom book title (auto-detected from TOC if empty) |
| `bookAuthor` | string | optional | Book author name |
| `useLinkedTitleFromTOC` | boolean | `false` | Extract chapter titles from H1 headings when TOC uses LinkedTitle |
| `includeChapterBreaks` | boolean | `false` | Add chapter breaks between major sections |
| `includeTOCLevels` | number | `3` | Number of heading levels to include in TOC (1-6) |
| `useBookDoctype` | boolean | `true` | Set doctype to "book" for multi-chapter documents |

**Example Configuration:**
```json
{
  "asciidocOptions": {
    "useCollapsibleBlocks": true,
    "generateAsBook": true,
    "bookTitle": "User Manual",
    "bookAuthor": "Company Name",
    "useLinkedTitleFromTOC": true,
    "includeChapterBreaks": true,
    "includeTOCLevels": 6
  }
}
```

**Output Behavior:**
- **Without collapsible blocks**: `<MadCap:dropDown>` → `=== Section Title` (regular section)
- **With collapsible blocks**: `<MadCap:dropDown>` → `.Section Title\n[%collapsible]\n====\ncontent\n====` (interactive collapsible block)
- **With book generation**: Creates proper AsciiDoc book structure with chapter breaks, author, and TOC levels

**Generated Collapsible Blocks:**
```asciidoc
.Understanding Activity Roll-Up
[%collapsible]
====
Both activities and investments can exist within a multi-level hierarchy...
====

.How To Activate Display
[%collapsible]
=====
To activate the correct display of the spend data...
=====
```

**Key Features:**
- **Interactive Navigation**: Readers can expand/collapse sections for better readability
- **Reduced Document Length**: Long sections are collapsed by default
- **Smart Nesting**: Automatically adjusts delimiter levels (====, =====, ======) based on depth
- **Title Extraction**: Uses dropdown hotspot text as collapsible block title
- **Content Preservation**: All formatting, images, lists, and links maintained within blocks

---

## 💡 Usage Examples

### Basic HTML Conversion

**Claude Desktop:**
```
Please convert this HTML to Markdown:
<h1>Getting Started</h1>
<p>This is a <strong>sample</strong> document with <em>formatting</em>.</p>
<ul>
  <li>Item one</li>
  <li>Item two</li>
</ul>
```

### MadCap Flare to Zendesk Conversion

**Claude Desktop:**
```
Convert MadCap Flare content to Zendesk Help Center format:
Input: /Volumes/Envoy Pro/Flare/Administration EN/Content
Output: /Volumes/Envoy Pro/ZendeskOutput
Format: zendesk

Options:
- Generate external stylesheet: true
- Inline styles: false (for clean HTML + external CSS)
- Generate AI tags: true
- Ignore videos: true
```

**Advanced Configuration Example:**
```json
{
  "name": "convert_folder",
  "arguments": {
    "inputDir": "/Volumes/Envoy Pro/Flare/Administration EN/Content",
    "outputDir": "/Volumes/Envoy Pro/ZendeskOutputAdmin",
    "format": "zendesk",
    "preserveStructure": true,
    "copyImages": true,
    "zendeskOptions": {
      "generateTags": true,
      "generateStylesheet": true,
      "ignoreVideos": true,
      "inlineStyles": false,
      "locale": "en-us",
      "cssOutputPath": "zendesk-styles.css"
    }
  }
}
```

This will:
- Convert all .htm files to complete .html documents with proper DOCTYPE and head sections
- Transform MadCap dropdowns to HTML5 `<details>` elements
- Resolve all MadCap variables to actual text values
- Generate external CSS file for clean HTML separation
- Process snippets and cross-references with unified preprocessing
- Handle list continuation for proper sequential numbering
- Apply context-aware image classification for optimal table display
- Filter out deprecated/discontinued content automatically
- Generate video placeholders for multimedia content

### MadCap Flare Folder Conversion

**Claude Desktop:**
```
Convert the entire MadCap Flare Content folder to AsciiDoc format:
Input: /Volumes/Envoy Pro/Flare/Spend EN/Content
Output: /Volumes/Envoy Pro/target
Format: asciidoc
```

This will:
- Convert all .htm files to .adoc
- Rewrite internal links (.htm → .adoc)
- Process MadCap variables, snippets, and cross-references
- Maintain folder structure
- Extract and copy images

### AsciiDoc Collapsible Blocks Conversion

**Claude Desktop:**
```
Convert MadCap dropdowns to collapsible blocks for better navigation:
Input: /Volumes/Envoy Pro/Flare/Plan_EN/Content/03 Management/02-02 TrackSpend.htm
Output: /tmp/trackspend-collapsible.adoc
Format: asciidoc
AsciiDoc Options: useCollapsibleBlocks = true
```

**Advanced Configuration:**
```json
{
  "name": "convert_file",
  "arguments": {
    "inputPath": "/content/user-guide.htm",
    "outputPath": "/output/user-guide.adoc",
    "format": "asciidoc",
    "asciidocOptions": {
      "useCollapsibleBlocks": true
    },
    "variableOptions": {
      "extractVariables": true,
      "variableFormat": "adoc"
    }
  }
}
```

This creates interactive AsciiDoc with:
- Collapsible sections for MadCap dropdowns
- Extracted variables for dynamic content
- Proper nesting and delimiter levels
- Enhanced readability for long documents

### Word Document Processing

```json
{
  "name": "convert_file",
  "arguments": {
    "inputPath": "/documents/report.docx",
    "outputPath": "/output/report.md",
    "format": "markdown",
    "extractImages": true,
    "preserveFormatting": true
  }
}
```

### Variable Extraction Examples

**AsciiDoc Variable Extraction:**
```json
{
  "name": "convert_file",
  "arguments": {
    "inputPath": "/content/getting-started.htm",
    "outputPath": "/output/getting-started.adoc", 
    "format": "asciidoc",
    "variableOptions": {
      "extractVariables": true,
      "variableFormat": "adoc",
      "preserveVariableStructure": true
    }
  }
}
```

**Generated Output:**
```asciidoc
= Getting Started
:toc:
:icons: font

// Include variables file
include::variables.adoc[]

Welcome to {general_productname} version {version_number}!
```

**Variables File (getting-started-variables.adoc):**
```asciidoc
// Generated AsciiDoc variables from MadCap conversion

// General Variables
:general_productname: Uptempo
:general_companyname: Uptempo GmbH

// Version Variables  
:version_number: 2024.1
```

**Writerside Variable Extraction:**
```json
{
  "name": "convert_document",
  "arguments": {
    "input": "<h1>Product Guide</h1><p>Welcome to <MadCap:variable name=\"General.ProductName\">Uptempo</MadCap:variable>!</p>",
    "inputType": "html",
    "format": "markdown",
    "outputPath": "/output/guide.md",
    "variableOptions": {
      "extractVariables": true,
      "variableFormat": "writerside"
    }
  }
}
```

**Generated Markdown:**
```markdown
# Product Guide

Welcome to %General.ProductName%!
```

**Variables File (guide-variables.xml):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE vars SYSTEM "https://resources.jetbrains.com/writerside/1.0/vars.dtd">

<!-- Generated Writerside variables from MadCap conversion -->
<vars>
    <var name="General.ProductName" value="Uptempo"/>
</vars>
```

### TOC Extraction from MadCap

```json
{
  "name": "extract_toc",
  "arguments": {
    "fltocPath": "/Volumes/Envoy Pro/Flare/Spend EN/Project/TOCs/Main.fltoc",
    "contentBasePath": "/Volumes/Envoy Pro/Flare/Spend EN/Content",
    "outputPath": "/Volumes/Envoy Pro/target/master.adoc",
    "format": "asciidoc"
  }
}
```

### Enhanced AsciiDoc Book Generation

Convert MadCap Flare projects to professional AsciiDoc books with proper structure and linked title resolution:

**Claude Desktop:**
```
Convert my MadCap Flare project to an AsciiDoc book:
Project: /Volumes/Envoy Pro/Flare/Plan_EN
Output: /Volumes/Envoy Pro/book-output
Format: asciidoc

Book Options:
- Title: "Uptempo Plan Manual"
- Author: "Uptempo"  
- Generate as book: true
- Use linked titles from TOC: true
- Include chapter breaks: true
- TOC levels: 6
```

**Advanced Book Configuration:**
```json
{
  "name": "convert_folder",
  "arguments": {
    "inputDir": "/Volumes/Envoy Pro/Flare/Plan_EN/",
    "outputDir": "/Volumes/Envoy Pro/book-output",
    "format": "asciidoc",
    "useTOCStructure": true,
    "generateMasterDoc": true,
    "asciidocOptions": {
      "generateAsBook": true,
      "bookTitle": "Uptempo Plan Manual",
      "bookAuthor": "Uptempo",
      "useLinkedTitleFromTOC": true,
      "includeChapterBreaks": true,
      "includeTOCLevels": 6,
      "useBookDoctype": true
    }
  }
}
```

**Generated Book Structure:**
```asciidoc
= Uptempo Plan Manual
Uptempo
:doctype: book
:toc: left
:toclevels: 6
:sectnums:
:sectlinks:
:icons: font
:experimental:
:partnums:
:chapter-signifier: Chapter
:appendix-caption: Appendix

include::user/knowledge-base-home.adoc[]

[chapter]
== Getting Started

include::user/00-00-structure/index.adoc[]
include::user/00-00-structure/00-01-actihierarch.adoc[]

[chapter]
== Planning Activities

include::user/01-00-activities/index.adoc[]
include::user/01-00-activities/01-01-creatactivity.adoc[]

=== Advanced Features

include::user/01-00-activities/01-04-filtergroup/index.adoc[]
```

**Key Features:**
- **Professional book format** with proper AsciiDoc book doctype
- **Linked title resolution** extracts real H1 headings from MadCap `[%=System.LinkedTitle%]` entries
- **Chapter breaks** for major sections with proper book attributes
- **Hierarchical structure** with proper section nesting (==, ===, ====)
- **Correct file paths** using TOC-based output structure
- **Variables filtering** excludes variables.adoc files from book structure
- **Custom book metadata** with title, author, and table of contents settings

### TOC-Based Structure Conversion

**Claude Desktop:**
```
Convert my MadCap Flare project using TOC structure instead of file structure:
Project: /Volumes/Envoy Pro/Flare/Administration EN
Output: /Volumes/Envoy Pro/ZendeskOutputStructured
Format: zendesk

Use TOC hierarchy to organize folders - I have User Manual and Administration TOCs that should become separate sections.
```

**Advanced TOC-Based Configuration:**
```json
{
  "name": "convert_with_toc_structure", 
  "arguments": {
    "projectPath": "/Volumes/Envoy Pro/Flare/Administration EN",
    "outputDir": "/Volumes/Envoy Pro/ZendeskOutputStructured",
    "format": "asciidoc",
    "generateMasterDoc": true,
    "copyImages": true,
    "variableOptions": {
      "extractVariables": true,
      "variableFormat": "adoc",
      "preserveVariableStructure": true
    }
  }
}
```

**What this does:**
- 🗂️ **Discovers all TOCs**: Finds User Manual, Administration, API Reference, etc.
- 📁 **Creates logical folders**: `/user-manual/`, `/administration/`, `/api-reference/`
- 🏗️ **Hierarchical organization**: Files placed by content hierarchy, not file location
- 📖 **Master document**: Unified entry point including all TOC sections
- 🔗 **Preserved relationships**: Cross-references work across the new structure

**Example Output Structure:**
```
/ZendeskOutputStructured/
├── master.adoc                     # Master document with all TOCs
├── user-manual/
│   ├── getting-started/
│   │   ├── installation.adoc
│   │   └── quick-start.adoc
│   └── advanced-features/
│       └── customization.adoc
├── administration/
│   ├── user-management/
│   │   ├── index.adoc              # Parent topic with children
│   │   ├── creating-users.adoc
│   │   └── permissions.adoc
│   └── system-settings/
│       └── configuration.adoc
└── variables.adoc                  # Extracted variables (if enabled)
```

**First discover TOCs in your project:**
```json
{
  "name": "discover_tocs",
  "arguments": {
    "projectPath": "/Volumes/Envoy Pro/Flare/Administration EN"
  }
}
```

---

## 🎯 Advanced Features

### MadCap Flare Specialization

The converter provides sophisticated handling for MadCap Flare's unique elements with **unified preprocessing** ensuring consistent behavior across all output formats (Zendesk, Markdown, AsciiDoc):

#### Dynamic Variable Resolution
Automatically discovers and loads all `.flvar` files in the project, with intelligent fallback support:
```html
<!-- Input -->
<MadCap:variable name="Administration_ScreenCommands.admin.permission.admin_manage-user.name" />

<!-- Conversion Result -->
Manage Users (resolved from Administration_ScreenCommands.flvar)
```

**Features:**
- Auto-discovery of all `.flvar` files in Project/VariableSets
- Parallel loading for performance
- Fallback variables for common Administration screen commands
- Prefix stripping for Administration_ScreenCommands variables
- Graceful handling of missing variable files

#### Variable Extraction for Modern Documentation Systems
Convert MadCap variables to native documentation platform formats instead of flattening to plain text:

**AsciiDoc Integration:**
```html
<!-- Input -->
<p>Welcome to <MadCap:variable name="General.ProductName">Uptempo</MadCap:variable>!</p>

<!-- Traditional Output (flattened) -->
Welcome to Uptempo!

<!-- Variable Extraction Output -->
Welcome to {general_productname}!

<!-- Generated Variables File (variables.adoc) -->
:general_productname: Uptempo
```

**Writerside Integration:**
```html
<!-- Input -->
<p>Version <MadCap:variable name="Version.Number">2024.1</MadCap:variable></p>

<!-- Variable Extraction Output (Markdown) -->
Version %Version.Number%

<!-- Generated Variables File (variables.xml) -->
<var name="Version.Number" value="2024.1"/>
```

**Key Benefits:**
- **Native Platform Support**: Use AsciiDoc attributes or Writerside variables directly
- **Dynamic Content**: Variables can be updated without regenerating content
- **Modular Documentation**: Separate content from variable definitions
- **Build System Integration**: Variables can be overridden during build process
- **Namespace Preservation**: Optional grouping maintains variable organization

**Supported Formats:**
- **AsciiDoc**: `:variable: value` syntax with automatic `include::variables.adoc[]`
- **Writerside**: `<var name="..." value="..."/>` XML format with `%variable%` references

#### Cross-Reference Processing
Converts MadCap cross-references with proper extension mapping:
```html
<!-- Input -->
<MadCap:xref href="installation.htm">Installing the Software</MadCap:xref>

<!-- Markdown Result -->
[Installing the Software](installation.md)

<!-- AsciiDoc Result -->
link:installation.adoc[Installing the Software]
```

#### Snippet Integration
Loads and processes snippet content:
```html
<!-- Input -->
<MadCap:snippetBlock src="Snippets/CommonWarning.flsnp" />

<!-- Result -->
Content from snippet is loaded and processed inline
```

#### List Continuation Support
Properly handles MadCap's `madcap:continue="true"` attribute for sequential numbering:
```html
<!-- Input -->
<ol>
    <li>First item</li>
</ol>
<p>Some content between lists</p>
<ol madcap:continue="true">
    <li>Second item</li>
</ol>
<ol madcap:continue="true">
    <li>Third item</li>
</ol>

<!-- Result (all formats) -->
1. First item
(content)
2. Second item
3. Third item
```

**Cross-Format Consistency:**
- **Markdown**: Uses proper numbering with continuation
- **AsciiDoc**: Maintains sequential numbering across separated lists
- **Zendesk**: Sets `start` attribute on `<ol>` elements for proper display

#### DropDown Section Conversion
Converts MadCap dropDowns to proper sections with optional collapsible blocks:
```html
<!-- Input -->
<MadCap:dropDown>
    <MadCap:dropDownHead>
        <MadCap:dropDownHotspot>Advanced Settings</MadCap:dropDownHotspot>
    </MadCap:dropDownHead>
    <MadCap:dropDownBody>
        <p>Configuration details...</p>
    </MadCap:dropDownBody>
</MadCap:dropDown>

<!-- AsciiDoc Result (Regular Sections) -->
=== Advanced Settings

Configuration details...

<!-- AsciiDoc Result (Collapsible Blocks - when useCollapsibleBlocks: true) -->
.Advanced Settings
[%collapsible]
====
Configuration details...
====
```

**Collapsible Blocks Feature:**
- **Interactive Content**: Readers can expand/collapse sections as needed
- **Reduced Clutter**: Long documents become more navigable
- **AsciiDoc Native**: Uses standard AsciiDoc collapsible block syntax
- **Optional**: Disabled by default, enable via `asciidocOptions.useCollapsibleBlocks: true`
- **Smart Nesting**: Automatically adjusts delimiter levels (====, =====, etc.) based on depth

#### Microsoft Properties Cleanup
Automatically removes Microsoft Office metadata and contamination:
- Strips `<head>` sections completely
- Removes `<!--[if gte mso 9]><xml>` blocks
- Cleans namespace declarations
- Eliminates custom document properties

#### Smart Condition Filtering
Automatically excludes content based on MadCap conditions:
```html
<!-- Content with these conditions is automatically excluded -->
<p madcap:conditions="Status.Black">This content is excluded</p>
<div data-mc-conditions="deprecated">This content is excluded</div>
```

**Excluded Conditions:**
- **Color-based**: Black, Red, Gray, Grey
- **Status**: deprecated, obsolete, legacy, old, discontinued, retired
- **Development**: paused, halted, stopped, cancelled, abandoned
- **Visibility**: hidden, internal, private, draft
- **Print**: print-only, printonly

#### Style Conversion Mapping
| MadCap Class | Markdown | AsciiDoc | Zendesk |
|--------------|----------|----------|---------|
| `mc-heading-1` | `# Title` | `= Title` | `<h1>Title</h1>` |
| `mc-note` | `> **📝 NOTE:** Content` | `NOTE: Content` | `<blockquote class="zendesk-callout zendesk-note">` |
| `mc-warning` | `> **⚠️ WARNING:** Content` | `WARNING: Content` | `<blockquote class="zendesk-callout zendesk-warning">` |
| `mc-procedure` | Numbered list | Numbered list | `<ol class="zendesk-list">` |

### Zendesk Help Center Optimization

The converter provides specialized optimization for Zendesk Help Center with comprehensive HTML5 support:

#### Collapsible Sections
Converts MadCap dropdowns to native HTML5 details/summary:
```html
<!-- Input -->
<MadCap:dropDown>
    <MadCap:dropDownHead>
        <MadCap:dropDownHotspot>Prerequisites</MadCap:dropDownHotspot>
    </MadCap:dropDownHead>
    <MadCap:dropDownBody>
        <p>Content here...</p>
    </MadCap:dropDownBody>
</MadCap:dropDown>

<!-- Zendesk Result -->
<details class="zendesk-collapsible">
    <summary><strong>Prerequisites</strong></summary>
    <div class="collapsible-content">
        <p>Content here...</p>
    </div>
</details>
```

#### Styled Callouts
Transforms notes and warnings into Zendesk-compatible callouts:
```html
<!-- Input -->
<p class="mc-note">Important information</p>

<!-- Zendesk Result -->
<blockquote class="zendesk-callout zendesk-note" style="padding: 1em; margin: 1em 0; border-left: 4px solid #007acc; border-radius: 4px; background-color: #f8f9fa;">
    <p><strong>📝 Note:</strong> Important information</p>
</blockquote>
```

#### Enhanced Image Processing
Context-aware image classification with intelligent sizing for optimal display:

**Smart Icon Detection:**
- **Filename patterns**: `icon`, `symbol_`, `GUI-Elemente/` prefixes
- **Size-based detection**: Images ≤32px automatically treated as inline icons
- **Context awareness**: Small images in table cells (`<td>`) properly classified
- **Dimension attributes**: Uses `height`/`width` attributes for classification

**Image Type Optimization:**
- **Inline icons**: 1em sizing with 24px max for table compatibility
- **Screenshots**: Responsive with borders and margins for readability
- **Feature images**: Medium-sized (300px) with proper spacing
- **Default images**: Up to 600px width with auto height and margins

**Table Icon Fixes:**
- Small symbols in tables now display correctly as inline elements
- Prevents oversized icons that break table layout
- Maintains visual hierarchy and readability

#### Video Placeholder Generation
Converts video references to Zendesk upload placeholders:
```html
<!-- Input -->
<video src="demo.mp4">Demo video</video>

<!-- Zendesk Result -->
<div class="zendesk-video-embed">
    <p><strong>🎬 Video:</strong> demo.mp4</p>
    <p><em>Upload this video to Zendesk and replace this placeholder with the embedded video.</em></p>
    <p><strong>Video file:</strong> <code>demo.mp4</code></p>
</div>
```

#### Inline CSS Support
Provides configurable styling approach:
- **Inline styles** (default): Embedded CSS for immediate compatibility
- **Class-based**: CSS classes for custom styling integration
- **Generated stylesheet**: Optional external CSS file for theme customization

#### Table Optimization
Ensures Zendesk-compatible table structure:
- Proper thead/tbody hierarchy
- Border styling for readability
- Responsive design considerations
- Header styling differentiation

### Batch Processing Features

#### Link Rewriting
When `rewriteLinks: true`:
- Internal `.htm` links → `.md` or `.adoc`
- External links preserved
- Fragment identifiers maintained
- Relative paths resolved correctly

#### Structure Preservation
- Maintains folder hierarchy
- Copies related assets
- Preserves relative relationships
- Handles nested directories

#### Image Processing
```json
{
  "extractImages": true,
  "outputDir": "/output/images"
}
```

**Results in:**
- Images extracted to dedicated folder
- References updated in converted documents
- Base64 images converted to files
- Metadata includes image inventory

### AsciiDoc Quality Improvements

#### Syntax Validation & Formatting
- **Document Structure**: Ensures single document title with proper heading hierarchy
- **Block Elements**: Correct NOTE/WARNING/TIP syntax with proper spacing and line breaks
- **Table Formatting**: Valid AsciiDoc table syntax with proper column definitions
- **Link/Image Syntax**: Uses `xref:` for internal documents, `link:` for external URLs
- **Image Syntax**: Block images use `image::` (double colon) with proper blank line spacing, inline images use `image:` (single colon)
- **Alt Text Generation**: Automatically generates descriptive alt text from filenames when missing
- **Block Image Spacing**: Ensures proper blank lines before and after block images for AsciiDoc compliance

#### Content Enhancement
- **Smart Emphasis**: Intelligently converts UI elements and technical terms from `_italic_` to `*bold*` for better AsciiDoc formatting
- **Punctuation Cleanup**: Removes extra spaces before commas, periods, and other punctuation marks including apostrophe formatting fixes
- **List Formatting**: Ensures list items stay on single lines with proper spacing before lists and maintains cross-reference formatting
- **Paragraph Separation**: Proper line breaks between paragraphs, images, and block elements with special handling for MadCap dropdown content
- **Heading Levels**: Converts MadCap dropdowns to appropriate heading levels (h3 for subsections instead of h4)

#### MadCap-Specific Formatting
- **Variable References**: Maintains proper spacing around variable references with enhanced punctuation handling
- **Cross-References**: Uses `xref:` syntax for internal document links instead of generic `link:` for better AsciiDoc compliance
- **Dropdown Sections**: Converts MadCap dropdowns to proper AsciiDoc section hierarchy with correct paragraph spacing
- **Technical Terms**: Smart detection of UI elements (Activity Roll-Up, Budget, Settings, etc.) for consistent bold formatting
- **Image Processing**: Intelligent detection of block vs inline images with enhanced alt text generation and proper AsciiDoc spacing
- **Content Structure**: Preserves paragraph boundaries within complex MadCap dropdown structures with proper line break handling
- **Spacing Fixes**: Resolves paragraph trimming issues that removed essential line breaks around block images

## 📋 AsciiDoc Formatting Guide

The MadCap Converter follows strict AsciiDoc formatting standards to ensure high-quality, compliant output. Here's what gets automatically applied:

### Heading Structure
```asciidoc
= Document Title (Level 0)
:toc:
:icons: font
:experimental:

== Main Section (Level 1)
=== Subsection (Level 2)  
==== Sub-subsection (Level 3)
```

**Applied Rules:**
- MadCap dropdowns → Level 2 headings (`===`)
- Proper hierarchy maintained
- Document attributes added automatically

### Image Formatting
```asciidoc
// Block images (standalone)
Previous paragraph content.

image::../Images/screenshot.png[Screenshot Description]

Next paragraph content.

// Inline images (within text)
Click the image:icon.png[Save Icon] button to save.
```

**Applied Rules:**
- **Block images**: `image::` (double colon) with blank lines before/after
- **Inline images**: `image:` (single colon) within text
- **Alt text**: Auto-generated from filenames when missing
- **Spacing**: Proper blank line preservation

### Text Formatting
```asciidoc
// Bold for UI elements and technical terms
Click *Budget* in the navigation menu.
The *Activity Roll-Up* shows spending details.
Configure *Master Settings* for your project.

// Italic for emphasis (limited use)
This is _emphasized text_ for clarity.

// Cross-references
See xref:installation.adoc[Installation Guide] for details.
Visit link:https://example.com[External Website] for more info.
```

**Applied Rules:**
- **Smart emphasis**: UI terms automatically converted to bold
- **Technical terms**: Activity Roll-Up, Budget, Settings, etc. → bold
- **Cross-references**: `xref:` for internal docs, `link:` for external URLs
- **Punctuation**: Automatic cleanup of extra spaces

### List Formatting
```asciidoc
Previous paragraph content.

* First item with proper spacing
* Second item stays on single line
* Third item with xref:guide.adoc[cross-reference]

Next paragraph content.
```

**Applied Rules:**
- **Line breaks**: Blank line before lists
- **Single lines**: List items don't wrap unnecessarily
- **Cross-references**: Maintained within list items

### Admonition Blocks
```asciidoc
NOTE: Important information about the process.

WARNING: This action cannot be undone.

TIP: Use keyboard shortcuts to save time.
```

**Applied Rules:**
- **Standard syntax**: Uses AsciiDoc admonition format
- **Spacing**: Proper line breaks before/after
- **Content**: Clean text without label duplication

### Code and Technical Content
```asciidoc
Use the `configuration` parameter for setup.

[source]
----
code block content here
multiple lines preserved
----
```

**Applied Rules:**
- **Inline code**: Backticks for single terms
- **Code blocks**: Proper AsciiDoc source syntax
- **Preservation**: Original formatting maintained

### Variable References (When Extracted)
```asciidoc
// Include variables file
include::variables.adoc[]

Welcome to {product_name} version {version_number}!
```

**When variable extraction enabled:**
- **Include directive**: Added automatically
- **Variable format**: `{variable_name}` syntax
- **Separate file**: `variables.adoc` with definitions

---

## 🛠️ Development

### Project Architecture

```
madcap-converter/
├── src/
│   ├── types/
│   │   └── index.ts              # TypeScript interfaces
│   ├── converters/
│   │   ├── html-converter.ts     # HTML processing engine
│   │   ├── word-converter.ts     # Word document handling
│   │   ├── madcap-converter.ts   # MadCap to Markdown/AsciiDoc
│   │   ├── zendesk-converter.ts  # MadCap to Zendesk HTML
│   │   └── index.ts             # Converter exports
│   ├── services/
│   │   └── madcap-preprocessor.ts # Shared MadCap processing
│   ├── document-service.ts       # Service coordination layer
│   ├── batch-service.ts          # Folder processing service
│   ├── toc-service.ts           # TOC extraction service
│   └── index.ts                 # MCP server implementation
├── build/                        # Compiled JavaScript
├── CLAUDE.md                     # Claude Code guidance
├── package.json
├── tsconfig.json
└── README.md
```

### Development Scripts

```bash
# Development workflow
npm run dev         # Build and run with auto-restart
npm run build       # Compile TypeScript
npm start          # Run compiled server
npm test           # Run test suite (when available)

# Quality checks
npm run lint       # Code linting
npm run typecheck  # TypeScript validation
```

### Testing the Server

```bash
# Test tools list
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node build/index.js

# Test conversion
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"convert_document","arguments":{"input":"<h1>Test</h1>","inputType":"html","format":"markdown"}}}' | node build/index.js

# Test with MCP inspector
npx @modelcontextprotocol/inspector node build/index.js
```

---

## 🔍 Troubleshooting

### Common Issues

#### Server Won't Start
```bash
# Check Node.js version
node --version  # Should be 18+

# Verify build
npm run build

# Check for missing dependencies
npm install
```

#### Claude Desktop Integration Issues
1. **Verify config path** - Use absolute paths in configuration
2. **Check permissions** - Ensure Claude can execute the script
3. **Restart Claude** - Configuration changes require restart
4. **Check logs** - Look for error messages in Claude's developer console

#### MadCap Conversion Issues
- **Variable resolution fails**: Check Project/VariableSets folder exists
- **Snippets not loading**: Verify snippet paths are relative to source file
- **Cross-references broken**: Ensure target files exist in output
- **Microsoft contamination**: Automatic cleanup should handle this

#### Conversion Errors
- **Word documents**: Ensure file is valid .docx/.doc format
- **Large files**: Consider breaking into smaller chunks
- **Special characters**: Check encoding (UTF-8 recommended)
- **Images**: Verify image paths and permissions for extraction

---

## 📖 Technical Specifications

### Dependencies

#### Core Dependencies
- **@modelcontextprotocol/sdk** (^1.12.1) - MCP protocol implementation
- **turndown** (^7.2.0) - HTML to Markdown conversion engine
- **mammoth** (^1.9.1) - Word document (.docx) processing
- **jsdom** (^26.1.0) - HTML parsing and DOM manipulation
- **zod** (^3.25.56) - Runtime schema validation

#### Development Dependencies
- **typescript** (^5.8.3) - TypeScript compiler
- **@types/node** (^22.15.30) - Node.js type definitions
- **@types/jsdom** (^21.1.7) - JSDOM type definitions
- **@types/turndown** (^5.0.5) - Turndown type definitions

### System Requirements
- **Node.js**: 18.0.0 or higher
- **Memory**: 512MB minimum (2GB+ for large documents)
- **Storage**: 100MB for installation + space for converted files
- **Platform**: Cross-platform (Windows, macOS, Linux)

### Performance Benchmarks
| Document Type | Size | Conversion Time | Memory Usage | Notes |
|---------------|------|-----------------|--------------|-------|
| Simple HTML | 50KB | <100ms | ~30MB | Basic HTML conversion |
| Complex Word Doc | 5MB | ~2s | ~150MB | With image extraction |
| MadCap to Markdown | 20MB | ~8s | ~400MB | Full project processing |
| MadCap to Zendesk | 5MB | ~3s | ~200MB | With variable resolution |
| Zendesk Folder | 100 files | ~45s | ~300MB | Includes condition filtering |

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Quick Contribution Steps
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Commit with conventional commits: `git commit -m "feat: add amazing feature"`
5. Push and create a Pull Request

### Areas for Contribution
- **Additional input formats**: PDF, RTF, EPUB support
- **Enhanced MadCap features**: Advanced condition processing, topic templates
- **Zendesk improvements**: Additional Help Center themes, custom CSS generators
- **Performance optimizations**: Caching strategies, parallel processing
- **Variable resolution**: Support for additional MadCap variable types
- **Test coverage**: Unit tests, integration tests, end-to-end scenarios
- **Documentation**: Usage examples, troubleshooting guides

---

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Model Context Protocol Team** - For the excellent MCP framework
- **Turndown Contributors** - For the robust HTML to Markdown conversion
- **Mammoth.js Team** - For Word document processing capabilities
- **Community Contributors** - For feedback and improvements

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/eckardtm/madcap-converter/issues)
- **Discussions**: [GitHub Discussions](https://github.com/eckardtm/madcap-converter/discussions)
- **Documentation**: [Wiki](https://github.com/eckardtm/madcap-converter/wiki)

---

*Built with ❤️ for the AI and documentation community*

# MadCap Converter MCP Server

> **A specialized Model Context Protocol (MCP) server that expertly converts MadCap Flare source (Content folder) to multiple formats including Markdown, AsciiDoc, and Zendesk-optimized HTML. Do not use with generated HTML output folders.**

Transform your technical documentation with intelligent conversion that preserves structure, formatting, and semantic meaning while supporting advanced features like dynamic variable resolution, snippet processing, cross-reference handling, condition filtering, and comprehensive batch operations with specialized Zendesk Help Center support.

---

## 🌟 Features

### Multi-Format Input Support
- **HTML Documents** (.html, .htm) - Full HTML5 support with semantic preservation
- **Microsoft Word** (.docx, .doc) - Complete document structure with styles and images
- **MadCap Flare Output** - Specialized processing for technical documentation with full MadCap element support

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
- 🖼️ **Image Handling** - Extracts and references images with configurable output
- 🔗 **Cross-Reference Processing** - Converts MadCap xrefs and links intelligently with proper extension mapping
- 📊 **Metadata Extraction** - Title, word count, warnings, and document statistics
- ⚙️ **MadCap Specialization** - Handles conditional text, variables, snippets, dropDowns, and cross-references
- 🎨 **Formatting Options** - Configurable formatting preservation with Microsoft properties cleanup
- 📁 **Batch Processing** - Folder conversion with structure preservation and link rewriting
- 🔄 **Dynamic Variable Resolution** - Automatically discovers and loads all .flvar files with fallback support for Administration_ScreenCommands
- 📋 **TOC Extraction** - Generates master documents from MadCap .fltoc files
- 🚫 **Smart Condition Filtering** - Automatically excludes deprecated, discontinued, and print-only content
- 🎨 **Zendesk Optimization** - Converts dropdowns to collapsible details, applies inline styling, and handles video placeholders

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

#### `get_supported_formats`
Returns list of supported input and output formats.

**No parameters required.**

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
```

This will:
- Convert all .htm files to .html with Zendesk optimization
- Transform MadCap dropdowns to HTML5 `<details>` elements
- Resolve all MadCap variables to actual text values
- Apply inline CSS styling for Help Center compatibility
- Process snippets and cross-references
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

---

## 🎯 Advanced Features

### MadCap Flare Specialization

The converter provides sophisticated handling for MadCap Flare's unique elements:

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

#### DropDown Section Conversion
Converts MadCap dropDowns to proper sections:
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

<!-- AsciiDoc Result -->
== Advanced Settings

Configuration details...
```

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

#### Image Optimization
Applies appropriate sizing and styling for different image types:
- **Icons**: 16-24px inline elements
- **Screenshots**: Responsive with borders and margins
- **Feature images**: Medium-sized with proper spacing
- **Default images**: Up to 600px width with auto height

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

#### Syntax Validation
- Ensures single document title
- Proper heading hierarchy
- Correct NOTE/WARNING syntax
- Valid table formatting
- Proper link/image syntax

#### Formatting Fixes
- Removes leading spaces that break AsciiDoc
- Ensures proper line breaks between sections
- Handles complex nested structures
- Fixes malformed list elements

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
│   │   ├── madcap-converter.ts   # MadCap specialization
│   │   ├── zendesk-converter.ts  # Zendesk specialization
│   │   └── index.ts             # Converter exports
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

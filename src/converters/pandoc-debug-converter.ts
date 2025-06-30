import { ConversionOptions, ConversionResult, DocumentConverter } from '../types/index.js';
import { HTMLPreprocessor } from '../services/html-preprocessor.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

export default class PandocDebugConverter implements DocumentConverter {
  format = 'pandoc-asciidoc' as const;
  supportedInputTypes = ['html', 'madcap'];
  private preprocessor: HTMLPreprocessor;

  constructor() {
    this.preprocessor = new HTMLPreprocessor();
  }

  supportsFormat(format: string): boolean {
    return format === 'pandoc-asciidoc';
  }

  async convert(input: string, options: ConversionOptions): Promise<ConversionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Step 1: Preprocess HTML using our existing preprocessor
      let preprocessedHtml = await this.preprocessor.preprocess(input);
      
      // Step 1.5: Add custom image class markers for pandoc
      preprocessedHtml = this.markImageTypes(preprocessedHtml);
      
      // Step 2: Create temporary files for pandoc conversion
      const tempDir = tmpdir();
      const inputFile = join(tempDir, `pandoc-input-${randomUUID()}.html`);
      const outputFile = join(tempDir, `pandoc-output-${randomUUID()}.adoc`);
      
      // Write preprocessed HTML to temp file
      await writeFile(inputFile, preprocessedHtml, 'utf8');
      
      // Step 3: Run pandoc conversion
      const pandocCommand = `pandoc -f html -t asciidoc+auto_identifiers --standalone --shift-heading-level-by=-1 --wrap=preserve -o "${outputFile}" "${inputFile}"`;
      
      try {
        const { stdout, stderr } = await execAsync(pandocCommand);
        
        if (stderr) {
          warnings.push(`Pandoc warnings: ${stderr}`);
        }
        
        // Read the converted content
        const convertedContent = await readFile(outputFile, 'utf8');
        
        // Step 4: Apply minimal post-processing
        const postProcessedContent = this.postProcess(convertedContent, options, input);
        
        // Clean up temp files
        await Promise.all([
          unlink(inputFile).catch(() => {}),
          unlink(outputFile).catch(() => {})
        ]);
        
        const processingTime = Date.now() - startTime;
        
        const pandocVersion = await this.getPandocVersion();
        if (pandocVersion !== 'unknown') {
          warnings.push(`Converted using pandoc ${pandocVersion}`);
        }
        
        return {
          content: postProcessedContent,
          metadata: {
            wordCount: postProcessedContent.split(/\s+/).length,
            warnings: warnings.length > 0 ? warnings : undefined
          }
        };
        
      } catch (error) {
        // Clean up temp files on error
        await Promise.all([
          unlink(inputFile).catch(() => {}),
          unlink(outputFile).catch(() => {})
        ]);
        throw error;
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Pandoc conversion failed: ${errorMessage}`);
    }
  }

  private markImageTypes(html: string): string {
    // Mark inline images with special data attribute
    html = html.replace(/<img([^>]*class="IconInline"[^>]*)>/g, '<img$1 data-inline="true">');
    
    // Mark block images (Thumbnail class or standalone in paragraphs)
    html = html.replace(/<img([^>]*class="Thumbnail"[^>]*)>/g, '<img$1 data-block="true">');
    
    return html;
  }

  private fixImageSyntax(asciidocContent: string, originalInput: string): string {
    // Extract all image paths that had IconInline class in original HTML
    const inlineImagePaths = new Set<string>();
    const inlineMatches = originalInput.matchAll(/<img[^>]*src="([^"]+)"[^>]*class="IconInline"[^>]*>/g);
    
    for (const match of inlineMatches) {
      inlineImagePaths.add(match[1]);
    }
    
    // Convert those specific images from image:: to image: in AsciiDoc
    let processed = asciidocContent;
    for (const path of inlineImagePaths) {
      // Escape special regex characters in path
      const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Convert image:: to image: for this specific path
      const regex = new RegExp(`image::${escapedPath.replace(/\s/g, '%20')}(\\[[^\\]]*\\])`, 'g');
      processed = processed.replace(regex, `image:${path.replace(/\s/g, '%20')}$1`);
    }
    
    return processed;
  }

  private postProcess(content: string, options: ConversionOptions, originalInput: string): string {
    let processed = content;
    
    // Since we're using --standalone, pandoc already adds document header
    // We just need to clean up any issues
    
    // Fix specific pandoc AsciiDoc issues
    // 1. Fix malformed anchor syntax: [#anchor]## -> [[anchor]]
    processed = processed.replace(/\[\#([^\]]+)\]##/g, '[[$1]]');
    
    // 2. Remove orphaned line continuation markers
    processed = processed.replace(/^\s*\+\s*$/gm, '');
    
    // 3. Fix section spacing - ensure proper breaks between sections
    processed = processed.replace(/(\[\[[^\]]+\]\])\n\n([A-Z][^\n]+)\n\n\s*\+\s*\n\n/g, '$1\n\n== $2\n\n');
    
    // 4. Fix broken nested lists (pandoc creates random ==== blocks)
    // Remove ==== blocks that appear between list items
    processed = processed.replace(/\n====\n\n(\[(?:loweralpha|upperalpha|lowerroman|upperroman|arabic)\])/g, '\n\n$1');
    processed = processed.replace(/\.\s+([^\n]+)\n====\n/g, '. $1\n');
    
    // 5. Fix inline note styling
    processed = processed.replace(/\[\.noteInDiv\]#Note:#\s*/g, '*Note:* ');
    
    // 6. Fix admonition formatting comprehensively
    // 6.1. Ensure proper spacing around block admonitions
    processed = processed.replace(/\n(\[NOTE\]|\[TIP\]|\[WARNING\]|\[IMPORTANT\]|\[CAUTION\])\n====/g, '\n\n$1\n====');
    processed = processed.replace(/====\n(?![\n\[])/g, '====\n\n');
    
    // 6.2. Fix admonitions within lists (list continuation)
    // When admonition appears in a list, it needs a + before it
    processed = processed.replace(/(\n\. [^\n]+)\n\n(\[NOTE\]|\[TIP\]|\[WARNING\]|\[IMPORTANT\]|\[CAUTION\])\n====/g, '$1\n+\n$2\n====');
    processed = processed.replace(/(\n\.. [^\n]+)\n\n(\[NOTE\]|\[TIP\]|\[WARNING\]|\[IMPORTANT\]|\[CAUTION\])\n====/g, '$1\n+\n$2\n====');
    
    // 6.3. Fix orphaned continuation markers
    // Remove standalone + lines that don't belong
    processed = processed.replace(/\n\+\n\n/g, '\n\n');
    processed = processed.replace(/\n\+\n$/gm, '\n');
    
    // 6.4. Fix list formatting issues
    // Ensure proper spacing before list attributes
    processed = processed.replace(/\n(\[loweralpha\]|\[upperalpha\]|\[lowerroman\]|\[upperroman\]|\[arabic\])\n\./g, '\n\n$1\n.');
    // Fix lists that continue after block content
    processed = processed.replace(/====\n\.\s/g, '====\n\n. ');
    
    // 6.5. Clean up admonition blocks that got malformed
    processed = processed.replace(/(\[NOTE\]|\[TIP\]|\[WARNING\]|\[IMPORTANT\]|\[CAUTION\])\n====\n\n/g, '$1\n====\n');
    
    // 7. Fix empty or malformed admonition blocks
    // Remove completely empty admonition blocks
    processed = processed.replace(/\n(\[NOTE\]|\[TIP\]|\[WARNING\]|\[IMPORTANT\]|\[CAUTION\])\n====\n====\n/g, '\n');
    processed = processed.replace(/\n(\[NOTE\]|\[TIP\]|\[WARNING\]|\[IMPORTANT\]|\[CAUTION\])\n====\n\s*\n====\n/g, '\n');
    
    // Fix admonitions that only contain inline note markup
    processed = processed.replace(/\n(\[NOTE\]|\[TIP\]|\[WARNING\]|\[IMPORTANT\]|\[CAUTION\])\n====\n\*Note:\*\s*\n====\n/g, '\n');
    
    // Remove orphaned ==== blocks that don't belong to admonitions
    processed = processed.replace(/\n====\n\n/g, '\n\n');
    processed = processed.replace(/\n====\n$/gm, '\n');
    
    // 8. Fix collapsed/dropdown sections
    // Convert section anchors to proper headings
    processed = processed.replace(/\[\[([^\]]+)\]\]\n\n([^\n]+)(?:\n|$)/g, (match, anchor, title) => {
      // Check if this looks like a section title (not a sentence)
      if (title.length < 100 && !title.endsWith('.')) {
        return `\n[[${anchor}]]\n=== ${title}\n\n`;
      }
      return match;
    });
    
    // 5. Fix image syntax based on original HTML classes
    // The challenge: pandoc converts all images to image:: (block) by default
    // We need to fix inline images to use image: (single colon)
    
    // Strategy: Check the original input for IconInline class and convert those to inline syntax
    // This is a heuristic approach since pandoc doesn't preserve class information
    processed = this.fixImageSyntax(processed, originalInput);
    
    // 6. Fix relative image paths to use outputDir if available
    if (options.outputDir) {
      processed = processed.replace(/image::?([^[\s]+)/g, (match, path) => {
        if (!path.startsWith('http') && !path.startsWith('/')) {
          // Keep relative paths as-is, converter will handle them based on outputDir
          return match;
        }
        return match;
      });
    }
    
    // 7. Clean up excessive blank lines
    processed = processed.replace(/\n{4,}/g, '\n\n\n');
    
    // 8. Strip empty paragraphs manually since pandoc doesn't have this option
    processed = processed.replace(/\n\n\n+/g, '\n\n');
    
    // 9. Remove any unwanted pandoc metadata that might conflict
    // Remove :author: lines if empty
    processed = processed.replace(/^:author:\s*$/m, '');
    
    // 10. Add our preferred metadata if not present
    if (!processed.includes(':toc:')) {
      // Find the end of the header section (after title and any existing metadata)
      const headerEndMatch = processed.match(/^=\s+.+\n(?::[^:]+:.*\n)*/m);
      if (headerEndMatch) {
        const insertPos = headerEndMatch.index! + headerEndMatch[0].length;
        const metadata = [
          ':toc:',
          ':icons: font',
          ':experimental:',
          ':source-highlighter: highlight.js'
        ].join('\n') + '\n';
        processed = processed.slice(0, insertPos) + metadata + '\n' + processed.slice(insertPos);
      }
    }
    
    // 11. Ensure document ends with newline
    if (!processed.endsWith('\n')) {
      processed += '\n';
    }
    
    return processed;
  }

  private async getPandocVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('pandoc --version');
      const versionMatch = stdout.match(/pandoc (\d+\.\d+(\.\d+)?)/);
      return versionMatch ? versionMatch[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
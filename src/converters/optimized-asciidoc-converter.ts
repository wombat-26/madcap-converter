import { AsciiDocConverter } from './asciidoc-converter.js';
import { ConversionOptions, ConversionResult } from '../types/index.js';
import { VariableExtractor } from '../services/variable-extractor.js';

export class OptimizedAsciiDocConverter extends AsciiDocConverter {
  private optimizedVariableExtractor: VariableExtractor = new VariableExtractor();
  
  async convert(input: string | Buffer, options: ConversionOptions): Promise<ConversionResult> {
    // Get the base conversion first
    const baseResult = await super.convert(input, options);
    
    // Extract variables if requested
    if (options.variableOptions?.extractVariables) {
      await this.extractVariablesFromContent(input.toString(), options);
    }
    
    // Apply optimizations to the content
    const optimizedContent = this.applyOptimizations(baseResult.content);
    
    // Add variable include statement if variables were extracted
    const finalContent = this.addVariableIncludes(optimizedContent, options);
    
    const result = {
      ...baseResult,
      content: finalContent
    };
    
    // Add variables to metadata if extracted
    if (options.variableOptions?.extractVariables) {
      result.metadata = {
        wordCount: result.metadata?.wordCount || 0,
        ...result.metadata,
        variables: this.optimizedVariableExtractor.getVariables()
      };
    }
    
    return result;
  }
  
  private applyOptimizations(content: string): string {
    let optimized = content;
    
    // 1. Smart List Continuation - Fix complex nested lists
    optimized = this.fixListContinuation(optimized);
    
    // 2. Cross-Reference Resolution - .htm → .adoc conversion
    optimized = this.enhanceCrossReferences(optimized);
    
    // 3. Image Classification - Better inline/block detection
    optimized = this.improveImageClassification(optimized);
    
    // 4. MadCap Dropdown Conversion - to hierarchical headings
    optimized = this.convertMadCapDropdowns(optimized);
    
    // 5. Advanced Admonition Handling
    optimized = this.enhanceAdmonitions(optimized);
    
    // 6. Clean up formatting issues
    optimized = this.cleanupFormatting(optimized);
    
    return optimized;
  }
  
  private fixListContinuation(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inList = false;
    let lastListIndent = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const prevLine = i > 0 ? lines[i - 1] : '';
      
      // Detect list items (numbered, bulleted, or alpha)
      const listMatch = line.match(/^(\.*|\d+\.|[a-z]\.)\s+(.+)$/);
      const isListItem = listMatch !== null;
      const isListAttr = line.match(/^\[.*\]$/) && nextLine.match(/^(\.*|\d+\.|[a-z]\.)\s+/);
      
      if (isListItem) {
        const indent = line.search(/\S/);
        inList = true;
        lastListIndent = indent;
        result.push(line);
        
        // Only add continuation for actual block content
        if (this.needsContinuation(nextLine, line)) {
          result.push('+');
        }
      } else if (isListAttr) {
        // List attribute line (like [loweralpha])
        result.push(line);
      } else if (inList && this.isListContinuation(line, nextLine, lastListIndent)) {
        // This line continues a list item
        if (line.trim() === '') {
          result.push(line);
        } else {
          // Add continuation marker before block content if previous line wasn't empty or +
          if (prevLine.trim() !== '' && prevLine !== '+' && this.isBlockContent(line)) {
            result.push('+');
          }
          result.push(line);
        }
      } else {
        // Not in list or list ended
        if (line.trim() === '' || line.startsWith('=')) {
          inList = false;
        }
        result.push(line);
      }
    }
    
    // Clean up excessive continuation markers
    return this.cleanContinuationMarkers(result.join('\n'));
  }
  
  private needsContinuation(nextLine: string, currentLine: string): boolean {
    if (!nextLine.trim()) return false;
    
    // Block elements that need continuation
    const blockElements = [
      /^image::/,           // Images
      /^\[\w+\]$/,         // Block attributes
      /^\|/,               // Tables  
      /^----/,             // Code blocks
      /^\.\.\./            // More list items at different level
    ];
    
    return blockElements.some(pattern => pattern.test(nextLine.trim()));
  }
  
  private isListContinuation(line: string, nextLine: string, listIndent: number): boolean {
    if (!line.trim()) return true; // Empty lines continue
    
    // Check if this is still part of list based on indentation
    const lineIndent = line.search(/\S/);
    if (lineIndent < listIndent) return false; // Less indented = end of list
    
    // Don't continue if it's a new list item
    if (line.match(/^(\.*|\d+\.|[a-z]\.)\s+/)) return false;
    
    // Don't continue if it's a heading or major block
    if (line.startsWith('=') || line.match(/^\[\w+\]$/)) return false;
    
    return true;
  }
  
  private isBlockContent(line: string): boolean {
    return line.match(/^(image::|\[\w+\]|\||----|\.\.\.)/) !== null;
  }
  
  private cleanContinuationMarkers(content: string): string {
    return content
      // Remove multiple consecutive + markers
      .replace(/\+\n\+\n/g, '+\n')
      // Remove + markers before empty lines
      .replace(/\+\n\s*\n/g, '\n\n')
      // Remove + at end of sections
      .replace(/\+\n(=+\s)/g, '\n$1');
  }
  
  private enhanceCrossReferences(content: string): string {
    // Comprehensive .htm → .adoc conversion with anchor preservation
    let enhanced = content;
    
    // Convert xref links with .htm extensions
    enhanced = enhanced.replace(/xref:([^\.]+)\.htm(#[^[\]]*)?(\[[^\]]*\])/g, 'xref:$1.adoc$2$3');
    
    // Convert regular links with .htm extensions  
    enhanced = enhanced.replace(/link:([^\.]+)\.htm(#[^[\]]*)?(\[[^\]]*\])/g, 'link:$1.adoc$2$3');
    
    // Convert relative links in text (markdown-style)
    enhanced = enhanced.replace(/\]\(([^)]+)\.htm(#[^)]*)?/g, ']($1.adoc$2');
    
    // Handle bare .htm references in text
    enhanced = enhanced.replace(/([^"\s]+)\.htm(#[^\s\]]*)?(?=[\s\],])/g, '$1.adoc$2');
    
    // Convert file names in xref paths to lowercase and replace spaces with dashes
    enhanced = enhanced.replace(/xref:([^[]+)(\[[^\]]*\])/g, (match, path, label) => {
      const cleanPath = path
        .toLowerCase()
        .replace(/\s+/g, '-')  // Replace spaces with dashes
        .replace(/[^a-z0-9\-\/#\.]/g, ''); // Remove special characters except allowed ones
      return `xref:${cleanPath}${label}`;
    });
    
    // Convert link paths similarly
    enhanced = enhanced.replace(/link:([^[]+)(\[[^\]]*\])/g, (match, path, label) => {
      const cleanPath = path
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-\/#\.]/g, '');
      return `link:${cleanPath}${label}`;
    });
    
    // Fix internal anchor references - ensure they use proper xref syntax
    enhanced = enhanced.replace(/see\s+([A-Za-z][^.]*?)(?=\s*$|\s*[.!?])/gm, (match, text) => {
      // If it looks like a reference to a section title, convert to xref
      if (text.length > 5 && text.length < 50 && /^[A-Z]/.test(text)) {
        const anchorId = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
        return `see xref:${anchorId}[${text}]`;
      }
      return match;
    });
    
    return enhanced;
  }
  
  private improveImageClassification(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : '';
      const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
      
      // Detect image lines
      const imageMatch = line.match(/^(\s*)(image:+)([^[]+)(\[.*\])$/);
      if (imageMatch) {
        const [, indent, prefix, path, attributes] = imageMatch;
        
        // Enhanced classification logic
        const pathAnalysis = this.analyzeImagePath(path);
        const attributeAnalysis = this.analyzeImageAttributes(attributes);
        const contextAnalysis = this.analyzeImageContext(prevLine, nextLine, line);
        
        const shouldBeInline = this.determineImageType(pathAnalysis, attributeAnalysis, contextAnalysis);
        
        if (shouldBeInline && prefix === 'image::') {
          // Convert block to inline
          result.push(`${indent}image:${path}${attributes}`);
        } else if (!shouldBeInline && prefix === 'image:') {
          // Convert inline to block with proper spacing
          if (prevLine.trim() && !prevLine.includes('image::')) {
            result.push('');
          }
          result.push(`${indent}image::${path}${attributes}`);
          if (nextLine.trim() && !nextLine.includes('image::')) {
            result.push('');
          }
        } else {
          // Keep as-is but ensure proper spacing for blocks
          if (prefix === 'image::') {
            if (prevLine.trim() && !prevLine.includes('image::') && !prevLine.endsWith('+')) {
              result.push('');
            }
            result.push(line);
            if (nextLine.trim() && !nextLine.includes('image::') && !nextLine.startsWith('+')) {
              result.push('');
            }
          } else {
            result.push(line);
          }
        }
      } else {
        result.push(line);
      }
    }
    
    return result.join('\n');
  }
  
  private analyzeImagePath(path: string): { isIcon: boolean; isScreenshot: boolean; isSmall: boolean } {
    const lowerPath = path.toLowerCase();
    
    return {
      isIcon: lowerPath.includes('/gui/') || 
              lowerPath.includes('/icon/') || 
              lowerPath.includes('/button/') ||
              lowerPath.includes('icon') ||
              lowerPath.includes('button'),
      isScreenshot: lowerPath.includes('/screens/') || 
                    lowerPath.includes('screenshot') ||
                    lowerPath.includes('screen'),
      isSmall: lowerPath.includes('small') || 
               lowerPath.includes('thumb') ||
               lowerPath.includes('icon')
    };
  }
  
  private analyzeImageAttributes(attributes: string): { 
    width?: number; 
    height?: number; 
    hasRoleIcon: boolean; 
    hasTitle: boolean 
  } {
    const widthMatch = attributes.match(/width=([0-9]+)/);
    const heightMatch = attributes.match(/height=([0-9]+)/);
    
    return {
      width: widthMatch ? parseInt(widthMatch[1]) : undefined,
      height: heightMatch ? parseInt(heightMatch[1]) : undefined,
      hasRoleIcon: attributes.includes('role=icon'),
      hasTitle: attributes.length > 2 && !attributes.match(/^\[\s*\]$/)
    };
  }
  
  private analyzeImageContext(prevLine: string, nextLine: string, currentLine: string): {
    inParagraph: boolean;
    inList: boolean;
    standsAlone: boolean;
    followsText: boolean;
  } {
    const prevTrimmed = prevLine.trim();
    const nextTrimmed = nextLine.trim();
    const isInList = /^\s*[.*]\s+/.test(currentLine) || /^\s*[.*]\s+/.test(prevLine);
    
    return {
      inParagraph: prevTrimmed.length > 0 && !prevTrimmed.startsWith('=') && !prevTrimmed.endsWith('+'),
      inList: isInList,
      standsAlone: !prevTrimmed || prevTrimmed.endsWith('+') || nextTrimmed === '' || nextTrimmed.startsWith('='),
      followsText: prevTrimmed.length > 20 && !prevTrimmed.endsWith('+') && !prevTrimmed.startsWith('.')
    };
  }
  
  private determineImageType(
    path: { isIcon: boolean; isScreenshot: boolean; isSmall: boolean },
    attr: { width?: number; height?: number; hasRoleIcon: boolean; hasTitle: boolean },
    context: { inParagraph: boolean; inList: boolean; standsAlone: boolean; followsText: boolean }
  ): boolean {
    // Definite inline cases
    if (attr.hasRoleIcon) return true;
    if (path.isIcon && !path.isScreenshot) return true;
    if (attr.width && attr.height && attr.width <= 32 && attr.height <= 32) return true;
    if (path.isSmall && (!attr.width || attr.width <= 48)) return true;
    
    // Definite block cases  
    if (path.isScreenshot) return false;
    if (attr.width && attr.width > 100) return false;
    if (context.standsAlone && !context.followsText) return false;
    
    // Context-based decisions
    if (context.inList && !context.standsAlone) return true;
    if (context.followsText && attr.width && attr.width <= 64) return true;
    
    // Default to block for ambiguous cases
    return false;
  }
  
  private convertMadCapDropdowns(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i];
      
      // Look for section headers that might be converted dropdowns
      const headerMatch = line.match(/^(=+)\s+(.+)$/);
      if (headerMatch) {
        const [, equalSigns, title] = headerMatch;
        const level = equalSigns.length;
        
        // Check if this should be converted to hierarchical heading or collapsible
        const conversionType = this.determineDropdownConversion(title, lines, i, level);
        
        if (conversionType === 'hierarchical' && level >= 3) {
          // Convert to proper hierarchical heading (h2, h3, h4, h5)
          const newLevel = Math.min(level - 1, 5); // Promote by one level, max h5
          result.push(`${'='.repeat(newLevel)} ${title}`);
          
          // Process content and adjust sub-headings accordingly
          i++;
          while (i < lines.length) {
            const nextLine = lines[i];
            const nextHeaderMatch = nextLine.match(/^(=+)\s+/);
            
            if (nextHeaderMatch && nextHeaderMatch[1].length <= level) {
              // Found same or higher level header, stop collecting
              break;
            }
            
            // Adjust sub-heading levels
            if (nextHeaderMatch) {
              const subLevel = nextHeaderMatch[1].length;
              const subTitle = nextLine.replace(/^=+\s+/, '');
              const adjustedLevel = Math.min(subLevel - 1, 6); // Promote and cap at h6
              result.push(`${'='.repeat(adjustedLevel)} ${subTitle}`);
            } else {
              result.push(nextLine);
            }
            i++;
          }
          continue; // Don't increment i again
        } else if (conversionType === 'collapsible' && level >= 3) {
          // Convert to collapsible block
          result.push('');
          result.push(`.${title}`);
          result.push('[%collapsible]');
          result.push('====');
          
          // Collect content until next same-level or higher heading
          i++;
          while (i < lines.length) {
            const nextLine = lines[i];
            const nextHeaderMatch = nextLine.match(/^(=+)\s+/);
            
            if (nextHeaderMatch && nextHeaderMatch[1].length <= level) {
              // Found same or higher level header, stop collecting
              break;
            }
            
            // Convert any sub-headings to bold text or smaller headings
            if (nextHeaderMatch) {
              const subLevel = nextHeaderMatch[1].length;
              const subTitle = nextLine.replace(/^=+\s+/, '');
              if (subLevel === level + 1) {
                result.push(`*${subTitle}*`);
              } else {
                result.push(`${'='.repeat(Math.max(2, subLevel - 1))} ${subTitle}`);
              }
            } else {
              result.push(nextLine);
            }
            i++;
          }
          
          result.push('====');
          result.push('');
          continue; // Don't increment i again
        } else {
          // Keep as regular heading
          result.push(line);
        }
      } else {
        result.push(line);
      }
      
      i++;
    }
    
    return result.join('\n')
      // Post-process: Convert remaining dropdown patterns to hierarchical headings
      .replace(/Dropdown:\s*(.+)/g, '== $1')
      // Convert obvious dropdown-like text patterns to headings when appropriate
      .replace(/^(.+):\s*\(click to expand\)$/gm, '=== $1')
      .replace(/^(.+)\s+\[Show\/Hide\]$/gm, '=== $1');
  }
  
  private determineDropdownConversion(title: string, lines: string[], currentIndex: number, level: number): 'hierarchical' | 'collapsible' | 'none' {
    const lowerTitle = title.toLowerCase();
    
    // Primary content sections should become hierarchical headings
    const primaryContentKeywords = [
      'overview', 'introduction', 'getting started', 'setup', 'configuration',
      'installation', 'requirements', 'features', 'usage', 'tutorial',
      'guide', 'workflow', 'process', 'procedure', 'steps'
    ];
    
    if (primaryContentKeywords.some(keyword => lowerTitle.includes(keyword))) {
      return 'hierarchical';
    }
    
    // Supplementary sections should become collapsible blocks
    const supplementaryKeywords = [
      'connecting', 'configuring', 'related tasks', 'additional', 'advanced',
      'optional', 'details', 'more information', 'see also', 'troubleshooting',
      'examples', 'tips', 'notes', 'reference'
    ];
    
    if (supplementaryKeywords.some(keyword => lowerTitle.includes(keyword))) {
      return 'collapsible';
    }
    
    // Analyze content structure to make decision
    let contentLines = 0;
    let hasSubHeadings = false;
    
    for (let i = currentIndex + 1; i < lines.length && i < currentIndex + 20; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^=+/);
      if (line.match(/^=+\s+/) && headerMatch && headerMatch[0].length <= level) {
        break; // Found same or higher level header
      }
      
      if (line.match(/^=+\s+/)) {
        hasSubHeadings = true;
      }
      
      if (line.trim()) {
        contentLines++;
      }
    }
    
    // Long sections with sub-headings should be hierarchical
    if (contentLines > 15 || hasSubHeadings) {
      return 'hierarchical';
    }
    
    // Short supplementary sections should be collapsible
    if (contentLines >= 3 && contentLines <= 15) {
      return 'collapsible';
    }
    
    // Default: don't convert
    return 'none';
  }

  private shouldConvertToCollapsible(title: string, lines: string[], currentIndex: number): boolean {
    // Heuristics to determine if a section should be collapsible
    const lowerTitle = title.toLowerCase();
    
    // Common dropdown indicators
    const dropdownKeywords = [
      'connecting', 'configuring', 'related tasks', 'additional', 'advanced',
      'optional', 'details', 'more information', 'see also', 'troubleshooting',
      'examples', 'tips', 'notes'
    ];
    
    if (dropdownKeywords.some(keyword => lowerTitle.includes(keyword))) {
      return true;
    }
    
    // Check if section is relatively short (likely supplementary content)
    let contentLines = 0;
    for (let i = currentIndex + 1; i < lines.length && i < currentIndex + 20; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^=+/);
      if (line.match(/^=+\s+/) && headerMatch && headerMatch[0].length <= title.length) {
        break; // Found same or higher level header
      }
      if (line.trim()) {
        contentLines++;
      }
    }
    
    // Short sections with specific patterns are good collapsible candidates
    if (contentLines < 10 && contentLines > 2) {
      return true;
    }
    
    // Check for procedural content (less likely to be collapsible)
    const isMainProcedure = lowerTitle.includes('step') || 
                           lowerTitle.includes('how to') ||
                           lowerTitle.includes('create') ||
                           lowerTitle.includes('setup') ||
                           /\d+/.test(lowerTitle);
    
    return !isMainProcedure;
  }
  
  private enhanceAdmonitions(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inAdmonition = false;
    let admonitionType = '';
    let admonitionContent: string[] = [];
    let admonitionIndentLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const prevLine = i > 0 ? lines[i - 1] : '';
      
      // Detect admonition start (including indented ones)
      const admonitionMatch = line.match(/^(\s*)(NOTE|TIP|WARNING|CAUTION|IMPORTANT):\s*(.*)$/);
      
      if (admonitionMatch) {
        // Finish previous admonition if any
        if (inAdmonition) {
          result.push(...this.formatAdvancedAdmonitionBlock(admonitionType, admonitionContent, admonitionIndentLevel));
          admonitionContent = [];
        }
        
        admonitionIndentLevel = admonitionMatch[1].length;
        admonitionType = admonitionMatch[2];
        const initialContent = admonitionMatch[3];
        
        // If the NOTE line contains substantial content (complete sentence), 
        // treat it as a complete single-line admonition and don't look for more content
        if (initialContent.trim() && initialContent.trim().length > 50) {
          // This is likely a complete single-line admonition, keep it as-is
          result.push(line);
          inAdmonition = false;
        } else {
          // This might be the start of a multi-line block admonition
          if (initialContent.trim()) {
            admonitionContent.push(initialContent);
          }
          inAdmonition = true;
        }
      } else if (inAdmonition) {
        // Check if we should continue the admonition
        if (this.shouldContinueAdmonition(line, nextLine, prevLine, admonitionIndentLevel)) {
          // Add line to admonition content (removing base indentation)
          const contentLine = admonitionIndentLevel > 0 ? 
            line.slice(Math.min(admonitionIndentLevel, line.search(/\S/))) : 
            line;
          admonitionContent.push(contentLine);
        } else {
          // End admonition
          result.push(...this.formatAdvancedAdmonitionBlock(admonitionType, admonitionContent, admonitionIndentLevel));
          admonitionContent = [];
          inAdmonition = false;
          result.push(line);
        }
      } else {
        result.push(line);
      }
    }
    
    // Handle final admonition
    if (inAdmonition) {
      result.push(...this.formatAdvancedAdmonitionBlock(admonitionType, admonitionContent, admonitionIndentLevel));
    }
    
    return result.join('\n');
  }
  
  private shouldContinueAdmonition(line: string, nextLine: string, prevLine: string, baseIndent: number): boolean {
    // Empty lines within admonitions
    if (line.trim() === '') {
      // Continue if next line is indented appropriately or is content
      return nextLine.trim() === '' || 
             nextLine.search(/\S/) >= baseIndent ||
             !nextLine.match(/^(NOTE|TIP|WARNING|CAUTION|IMPORTANT):|^[.=]/);
    }
    
    // Lines that definitely end admonitions
    if (line.match(/^(NOTE|TIP|WARNING|CAUTION|IMPORTANT):/)) return false;
    if (line.match(/^\s*[.=]/)) return false; // New blocks or headings (allow for indentation)
    if (line.match(/^\s*\|/)) return false; // Tables
    if (line.match(/^\s*\[/)) return false; // Block attributes
    
    // List items at or below the base indentation level end admonitions
    if (line.match(/^\s*(\d+\.|\.+|\*+|-+)\s+/)) {
      const lineIndent = line.search(/\S/);
      if (lineIndent <= baseIndent) {
        return false; // End admonition for list items at base level or less
      }
    }
    
    // Check indentation - content should be indented at least to the base level
    const lineIndent = line.search(/\S/);
    if (lineIndent >= 0 && lineIndent < baseIndent) {
      // Less indented than admonition - likely end of admonition
      return false;
    }
    
    // Special check for list items that should end the admonition
    // If we have a list item at the same indentation level as the base,
    // it's likely a new list item outside the admonition
    if (line.match(/^\s*(\.*|\d+\.)\s+/) && lineIndent <= baseIndent) {
      return false; // End admonition when we hit a list item at base level
    }
    
    // Lists within admonitions should be more indented than the base
    if (line.match(/^\s*(\.*|\d+\.)\s+/) && lineIndent > baseIndent) {
      return true; // Lists can be part of admonitions if properly indented
    }
    
    // Code blocks and images can be part of admonitions
    if (line.match(/^\s*----/) || line.match(/^\s*image::/)) {
      return true;
    }
    
    // Default: continue if line has content and appropriate indentation
    return line.trim() !== '';
  }
  
  private formatAdvancedAdmonitionBlock(type: string, content: string[], indentLevel: number = 0): string[] {
    if (content.length === 0) {
      return [`${type}:`];
    }
    
    // Clean up content - remove trailing empty lines
    while (content.length > 0 && content[content.length - 1].trim() === '') {
      content.pop();
    }
    
    if (content.length === 0) {
      return [`${type}:`];
    }
    
    // Check if it's a simple single-line admonition
    if (content.length === 1 && !content[0].includes('\n') && content[0].length < 100) {
      return [`${type}: ${content[0]}`];
    }
    
    // Check if content contains complex elements (lists, code blocks, images, multiple paragraphs)
    const hasComplexContent = content.some(line => 
      line.match(/^\s*[.*]\s+/) ||     // Lists
      line.match(/^\s*\d+\.\s+/) ||    // Numbered lists
      line.match(/^\s*----/) ||        // Code blocks
      line.match(/^\s*image::/) ||     // Images
      line.trim() === ''               // Multi-paragraph (empty lines)
    );
    
    if (hasComplexContent) {
      // Use block admonition format for complex content
      const indent = ' '.repeat(indentLevel);
      return [
        `${indent}[${type}]`,
        `${indent}====`,
        ...content.map(line => line.trim() ? `${indent}${line}` : ''),
        `${indent}====`,
        ''
      ];
    } else {
      // Use simple block format for multi-line but simple content
      const combinedContent = content.filter(line => line.trim()).join(' ');
      if (combinedContent.length < 150) {
        // Short enough for single line
        return [`${type}: ${combinedContent}`];
      } else {
        // Use block format
        const indent = ' '.repeat(indentLevel);
        return [
          `${indent}[${type}]`,
          `${indent}====`,
          ...content.map(line => line.trim() ? `${indent}${line}` : ''),
          `${indent}====`,
          ''
        ];
      }
    }
  }
  
  private formatAdmonitionBlock(type: string, content: string[]): string[] {
    // Legacy method - delegate to advanced formatter
    return this.formatAdvancedAdmonitionBlock(type, content, 0);
  }
  
  private async extractVariablesFromContent(content: string, options: ConversionOptions): Promise<void> {
    // Clear previous variables
    this.optimizedVariableExtractor.clear();
    
    // Extract MadCap variables from data-mc-variable attributes
    const variableMatches = content.matchAll(/data-mc-variable="([^"]+)"/g);
    for (const match of variableMatches) {
      const variableName = match[1];
      
      // Try to extract the resolved value from the content
      const variableRegex = new RegExp(`data-mc-variable="${variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]+)<`, 'g');
      const valueMatch = variableRegex.exec(content);
      
      if (valueMatch) {
        const extractedVariable = VariableExtractor.createExtractedVariable(
          variableName, 
          valueMatch[1].trim(), 
          'madcap'
        );
        this.optimizedVariableExtractor.addVariable(extractedVariable);
      }
    }
    
    // Extract from the parent project directory if available
    // Check if we have an input path to derive project directory from
    if (options.inputPath) {
      try {
        // Try to find project directory by looking for parent directories with .flproj files
        const inputDir = options.inputPath.split('/').slice(0, -1).join('/');
        let projectDir = inputDir;
        
        // Look up the directory tree for a MadCap project root
        const pathParts = inputDir.split('/');
        for (let i = pathParts.length; i >= 0; i--) {
          const testDir = pathParts.slice(0, i).join('/');
          if (testDir) {
            try {
              await this.optimizedVariableExtractor.extractAllVariablesFromProject(testDir);
              break; // Found variables, stop searching
            } catch (error) {
              // Continue searching up the directory tree
              continue;
            }
          }
        }
      } catch (error) {
        console.warn('Failed to extract variables from project directory:', error);
      }
    }
  }
  
  private addVariableIncludes(content: string, options: ConversionOptions): string {
    if (!options.variableOptions?.extractVariables || this.optimizedVariableExtractor.getVariables().length === 0) {
      return content;
    }
    
    const lines = content.split('\n');
    const result: string[] = [];
    let headerSectionEnd = 0;
    
    // Find the end of the document header section
    let inHeader = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('= ')) {
        inHeader = true;
      } else if (inHeader && line.trim() === '') {
        // Found end of header attributes
        headerSectionEnd = i;
        break;
      } else if (inHeader && !line.startsWith(':') && line.trim() !== '') {
        // Found first content line
        headerSectionEnd = i;
        break;
      }
    }
    
    // Add lines up to header end
    result.push(...lines.slice(0, headerSectionEnd));
    
    // Add variable include
    const includeFileName = options.variableOptions.variablesOutputPath ? 
      options.variableOptions.variablesOutputPath.replace(/^.*\//, '').replace(/\.adoc$/, '') :
      'variables';
    
    result.push('');
    result.push(`include::includes/${includeFileName}.adoc[]`);
    
    // Add remaining content
    result.push(...lines.slice(headerSectionEnd));
    
    return result.join('\n');
  }
  
  private cleanupFormatting(content: string): string {
    let cleaned = content;
    
    // Fix broken image alt text - remove line breaks inside brackets
    cleaned = cleaned.replace(/\[([^\]]*)\n\n\]/g, '[$1]');
    cleaned = cleaned.replace(/\[([^\]]*)\n\]/g, '[$1]');
    
    // Fix broken admonitions - incomplete blocks that end abruptly
    cleaned = cleaned.replace(/\[NOTE\]\n====\n([^=]*?)\n====\n\nimage:/g, '[NOTE]\n====\n$1\n\nimage:');
    cleaned = cleaned.replace(/====\n\nimage:/g, '\n\nimage:');
    
    // Fix inline image spacing - add space after ]
    cleaned = cleaned.replace(/(\[([^\]]*)\])([a-z])/g, '$1 $3');
    
    // Fix broken admonition content that got split
    cleaned = cleaned.replace(/\[NOTE\]\n====\n([^=]*?)\n====\n\n([^=\n][^\n]*)/g, '[NOTE]\n====\n$1 $2\n====\n');
    
    // Clean up excessive empty lines (more than 2 consecutive)
    cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');
    
    // Remove continuation markers that don't make sense
    cleaned = cleaned.replace(/\+\n\nimage::/g, '\n\nimage::');
    cleaned = cleaned.replace(/\+\n\n\[/g, '\n\n[');
    
    // Fix spacing around images
    cleaned = cleaned.replace(/image::([^\[]+)\[([^\]]*)\n\n\]/g, 'image::$1[$2]');
    
    // Clean up empty continuation markers at document start/end
    cleaned = cleaned.replace(/^\+\n/g, '');
    cleaned = cleaned.replace(/\n\+$/g, '');
    
    // Ensure proper spacing after list items before blocks
    cleaned = cleaned.replace(/(\n\d+\.\s+[^\n]+)\n\+\n\+\n/g, '$1\n+\n');
    cleaned = cleaned.replace(/(\n\.\s+[^\n]+)\n\+\n\+\n/g, '$1\n+\n');
    
    // Fix image continuation markers that create weird formatting
    cleaned = cleaned.replace(/image:([^\[]+)\[([^\]]*)\]\+/g, 'image:$1[$2] ');
    
    return cleaned;
  }
}
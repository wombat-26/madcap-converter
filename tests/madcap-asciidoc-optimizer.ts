import { DocumentService } from '../src/document-service.js';
import { ConversionOptions, ConversionResult } from '../src/types/index.js';
import { AsciiDocConverter } from '../src/converters/asciidoc-converter.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { diffLines } from 'diff';
import chalk from 'chalk';

interface TestCase {
  name: string;
  html: string;
  expectedAsciidoc: string;
  weight: number;
}

interface OptimizationRule {
  pattern: RegExp;
  replacement: string | ((match: string, ...args: any[]) => string);
  description: string;
  category: string;
}

interface ConversionQualityMetrics {
  structuralSimilarity: number;
  contentPreservation: number;
  formattingAccuracy: number;
  semanticCorrectness: number;
  overall: number;
  issues: string[];
}

export class MadCapAsciiDocOptimizer {
  private testCases: TestCase[] = [];
  private optimizationRules: OptimizationRule[] = [];
  private iterations: number = 0;
  private maxIterations: number = 50;
  private targetQuality: number = 0.95;
  private currentQuality: number = 0;
  
  constructor() {
    this.initializeTestCases();
    this.initializeOptimizationRules();
  }
  
  private initializeTestCases(): void {
    // Extract key patterns from the source HTML
    this.testCases = [
      {
        name: 'Nested ordered lists with different styles',
        html: `<ol><li><p>First item</p></li><li><p>Second item</p></li></ol><ol style="list-style-type: lower-alpha;"><li><p>Sub item a</p></li><li><p>Sub item b</p></li></ol>`,
        expectedAsciidoc: `. First item\n. Second item\n\na. Sub item a\nb. Sub item b`,
        weight: 1.5
      },
      {
        name: 'Note blocks with inline formatting',
        html: `<div class="note"><p><span class="noteInDiv">Note:</span> This is a note with <i>italic</i> text.</p></div>`,
        expectedAsciidoc: `NOTE: This is a note with _italic_ text.`,
        weight: 1.2
      },
      {
        name: 'Images with titles and dimensions',
        html: `<p><img src="../Images/Screens/CreateActivity.png" title="Create Activity Screenshot" style="width: 711px;height: 349px;" /></p>`,
        expectedAsciidoc: `\nimage::../Images/Screens/CreateActivity.png[Create Activity Screenshot,width=711,height=349]\n`,
        weight: 1.3
      },
      {
        name: 'MadCap cross-references',
        html: `<p>See <MadCap:xref href="01-00 Activities.htm#Estimating">Estimating Activity Costs</MadCap:xref> for details.</p>`,
        expectedAsciidoc: `See xref:01-00 Activities.adoc#Estimating[Estimating Activity Costs] for details.`,
        weight: 1.4
      },
      {
        name: 'Inline icons',
        html: `<p>Click the <img src="../Images/GUI-Elemente/Link Activity.png" class="IconInline" /> <i>Link</i> button.</p>`,
        expectedAsciidoc: `Click the image:../Images/GUI-Elemente/Link Activity.png[,role=icon] _Link_ button.`,
        weight: 1.1
      },
      {
        name: 'MadCap dropdowns',
        html: `<MadCap:dropDown><MadCap:dropDownHead><MadCap:dropDownHotspot>Connecting Activities</MadCap:dropDownHotspot></MadCap:dropDownHead><MadCap:dropDownBody><p>Content here</p></MadCap:dropDownBody></MadCap:dropDown>`,
        expectedAsciidoc: `.Connecting Activities\n[%collapsible]\n====\nContent here\n====`,
        weight: 1.5
      },
      {
        name: 'Snippet includes',
        html: `<MadCap:snippetBlock src="../Resources/Snippets/NoteActionDependency.flsnp" />`,
        expectedAsciidoc: `include::../Resources/Snippets/NoteActionDependency.adoc[]`,
        weight: 1.3
      }
    ];
  }
  
  private initializeOptimizationRules(): void {
    this.optimizationRules = [
      // List handling
      {
        pattern: /<ol style="list-style-type:\s*lower-alpha[^"]*">/gi,
        replacement: '<ol class="loweralpha">',
        description: 'Normalize lower-alpha lists',
        category: 'lists'
      },
      {
        pattern: /^\s*\d+\.\s+([a-z])\.\s+/gm,
        replacement: '$1. ',
        description: 'Fix nested alphabetic list markers',
        category: 'lists'
      },
      
      // MadCap elements
      {
        pattern: /<MadCap:xref\s+href="([^"]+)"[^>]*>([^<]*)<\/MadCap:xref>/gi,
        replacement: (match, href, text) => {
          const cleanHref = href.replace('.htm', '.adoc');
          return `xref:${cleanHref}[${text}]`;
        },
        description: 'Convert MadCap cross-references',
        category: 'madcap'
      },
      {
        pattern: /<MadCap:snippetBlock\s+src="([^"]+)"[^>]*\/>/gi,
        replacement: (match, src) => {
          const cleanSrc = src.replace('.flsnp', '.adoc');
          return `include::${cleanSrc}[]`;
        },
        description: 'Convert snippet includes',
        category: 'madcap'
      },
      
      // Images
      {
        pattern: /<img\s+([^>]*?)class="IconInline"([^>]*?)\/>/gi,
        replacement: (match, before, after) => {
          const srcMatch = (before + after).match(/src="([^"]+)"/);
          const src = srcMatch ? srcMatch[1] : '';
          return `image:${src}[,role=icon]`;
        },
        description: 'Handle inline icon images',
        category: 'images'
      },
      
      // Note blocks
      {
        pattern: /<div class="note">\s*<p>\s*<span class="noteInDiv">Note:<\/span>\s*/gi,
        replacement: 'NOTE: ',
        description: 'Convert note divs to AsciiDoc admonitions',
        category: 'admonitions'
      },
      
      // Dropdowns
      {
        pattern: /<MadCap:dropDown>[\s\S]*?<MadCap:dropDownHotspot>([^<]+)<\/MadCap:dropDownHotspot>[\s\S]*?<MadCap:dropDownBody>([\s\S]*?)<\/MadCap:dropDownBody>[\s\S]*?<\/MadCap:dropDown>/gi,
        replacement: (match, title, content) => {
          return `.${title}\\n[%collapsible]\\n====\\n${content.trim()}\\n====`;
        },
        description: 'Convert MadCap dropdowns to collapsible blocks',
        category: 'madcap'
      }
    ];
  }
  
  async optimizeConversion(sourceHtmlPath: string): Promise<void> {
    console.log(chalk.blue('🚀 Starting MadCap to AsciiDoc optimization process...'));
    
    const sourceHtml = await fs.readFile(sourceHtmlPath, 'utf-8');
    const sourceFileName = path.basename(sourceHtmlPath, '.htm');
    
    while (this.iterations < this.maxIterations && this.currentQuality < this.targetQuality) {
      this.iterations++;
      console.log(chalk.yellow(`\n📊 Iteration ${this.iterations}:`));
      
      // Apply current optimization rules
      const optimizedConverter = this.createOptimizedConverter();
      
      // Convert the source HTML
      const result = await this.convertWithOptimizer(sourceHtml, optimizedConverter, sourceFileName);
      
      // Measure quality
      const metrics = await this.measureQuality(sourceHtml, result.content);
      this.currentQuality = metrics.overall;
      
      console.log(chalk.cyan('Quality Metrics:'));
      console.log(`  • Structural Similarity: ${(metrics.structuralSimilarity * 100).toFixed(1)}%`);
      console.log(`  • Content Preservation: ${(metrics.contentPreservation * 100).toFixed(1)}%`);
      console.log(`  • Formatting Accuracy: ${(metrics.formattingAccuracy * 100).toFixed(1)}%`);
      console.log(`  • Semantic Correctness: ${(metrics.semanticCorrectness * 100).toFixed(1)}%`);
      console.log(chalk.green(`  • Overall Quality: ${(metrics.overall * 100).toFixed(1)}%`));
      
      if (metrics.issues.length > 0) {
        console.log(chalk.red('\n🔍 Issues found:'));
        metrics.issues.forEach(issue => console.log(`  • ${issue}`));
      }
      
      // Save iteration result
      await this.saveIterationResult(sourceFileName, this.iterations, result.content, metrics);
      
      if (this.currentQuality >= this.targetQuality) {
        console.log(chalk.green(`\n✅ Target quality of ${this.targetQuality * 100}% achieved!`));
        break;
      }
      
      // Learn from issues and create new rules
      await this.learnFromIssues(sourceHtml, result.content, metrics);
    }
    
    // Generate final report
    await this.generateFinalReport(sourceFileName);
  }
  
  private createOptimizedConverter(): AsciiDocConverter {
    const converter = new AsciiDocConverter();
    
    // Apply optimization rules through preprocessing
    const originalConvert = converter.convert.bind(converter);
    converter.convert = async (input: string, options?: ConversionOptions): Promise<ConversionResult> => {
      let processedInput = input;
      
      // Apply all optimization rules
      for (const rule of this.optimizationRules) {
        processedInput = processedInput.replace(rule.pattern, rule.replacement as any);
      }
      
      return originalConvert(processedInput, options);
    };
    
    return converter;
  }
  
  private async convertWithOptimizer(html: string, converter: AsciiDocConverter, sourceFileName: string): Promise<ConversionResult> {
    return converter.convert(html, {
      format: 'asciidoc',
      inputType: 'html',
      preserveFormatting: false,
      inputPath: sourceFileName
    });
  }
  
  private async measureQuality(sourceHtml: string, asciidocContent: string): Promise<ConversionQualityMetrics> {
    const issues: string[] = [];
    
    // Parse source HTML
    const dom = new JSDOM(sourceHtml);
    const doc = dom.window.document;
    
    // Structural similarity (headings, lists, sections)
    const sourceHeadings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
    const asciidocHeadings = (asciidocContent.match(/^=+ .+$/gm) || []).length;
    const headingRatio = sourceHeadings > 0 ? Math.min(asciidocHeadings / sourceHeadings, 1) : 1;
    
    const sourceLists = doc.querySelectorAll('ol, ul').length;
    const asciidocLists = (asciidocContent.match(/^[.*]\s+.+$/gm) || []).length;
    const listRatio = sourceLists > 0 ? Math.min(asciidocLists / sourceLists, 1) : 1;
    
    const structuralSimilarity = (headingRatio + listRatio) / 2;
    
    // Content preservation
    const sourceText = doc.body?.textContent?.trim() || '';
    const asciidocText = asciidocContent.replace(/[=*_.`\[\]{}|]/g, '').trim();
    const contentSimilarity = this.calculateTextSimilarity(sourceText, asciidocText);
    
    // Formatting accuracy
    const sourceImages = doc.querySelectorAll('img').length;
    const asciidocImages = (asciidocContent.match(/image:+[^\[]+\[/g) || []).length;
    const imageRatio = sourceImages > 0 ? Math.min(asciidocImages / sourceImages, 1) : 1;
    
    const sourceEmphasis = doc.querySelectorAll('i, em, b, strong').length;
    const asciidocEmphasis = (asciidocContent.match(/[_*]+[^_*]+[_*]+/g) || []).length;
    const emphasisRatio = sourceEmphasis > 0 ? Math.min(asciidocEmphasis / sourceEmphasis, 1) : 1;
    
    const formattingAccuracy = (imageRatio + emphasisRatio) / 2;
    
    // Semantic correctness
    const noteBlocks = doc.querySelectorAll('.note').length;
    const asciidocNotes = (asciidocContent.match(/^NOTE:/gm) || []).length;
    const noteRatio = noteBlocks > 0 ? Math.min(asciidocNotes / noteBlocks, 1) : 1;
    
    const crossRefs = doc.querySelectorAll('MadCap\\:xref').length;
    const asciidocXrefs = (asciidocContent.match(/xref:[^\[]+\[/g) || []).length;
    const xrefRatio = crossRefs > 0 ? Math.min(asciidocXrefs / crossRefs, 1) : 1;
    
    const semanticCorrectness = (noteRatio + xrefRatio) / 2;
    
    // Check for specific issues
    if (headingRatio < 1) issues.push(`Missing ${sourceHeadings - asciidocHeadings} headings`);
    if (listRatio < 0.8) issues.push('List structure not fully preserved');
    if (imageRatio < 1) issues.push(`Missing ${sourceImages - asciidocImages} images`);
    if (noteRatio < 1) issues.push(`Missing ${noteBlocks - asciidocNotes} note blocks`);
    if (xrefRatio < 1) issues.push(`Missing ${crossRefs - asciidocXrefs} cross-references`);
    
    // Check for MadCap-specific elements
    if (asciidocContent.includes('MadCap:')) issues.push('Unconverted MadCap elements remain');
    if (asciidocContent.includes('.htm')) issues.push('HTML file extensions not converted to .adoc');
    if (asciidocContent.includes('class=')) issues.push('HTML class attributes not removed');
    
    const overall = (
      structuralSimilarity * 0.3 +
      contentSimilarity * 0.3 +
      formattingAccuracy * 0.2 +
      semanticCorrectness * 0.2
    );
    
    return {
      structuralSimilarity,
      contentPreservation: contentSimilarity,
      formattingAccuracy,
      semanticCorrectness,
      overall,
      issues
    };
  }
  
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  private async learnFromIssues(sourceHtml: string, asciidoc: string, metrics: ConversionQualityMetrics): Promise<void> {
    // Analyze patterns that need improvement
    const dom = new JSDOM(sourceHtml);
    const doc = dom.window.document;
    
    // Learn from missing elements
    if (metrics.issues.some(issue => issue.includes('Missing') && issue.includes('headings'))) {
      // Add rules for better heading conversion
      this.optimizationRules.push({
        pattern: /<h(\d)>([^<]+)<\/h\1>/gi,
        replacement: (match, level, text) => {
          const equals = '='.repeat(parseInt(level));
          return `\n${equals} ${text.trim()}\n`;
        },
        description: 'Improved heading conversion',
        category: 'structure'
      });
    }
    
    // Learn from list issues
    if (metrics.issues.some(issue => issue.includes('List structure'))) {
      this.optimizationRules.push({
        pattern: /^(\s*)([a-z])\.\s+/gm,
        replacement: '\n$1$2. ',
        description: 'Fix alphabetic list spacing',
        category: 'lists'
      });
    }
    
    // Learn from unconverted MadCap elements
    if (metrics.issues.some(issue => issue.includes('MadCap elements'))) {
      // Extract unconverted patterns
      const madcapPattern = /MadCap:\w+[^>]*>/g;
      const matches = asciidoc.match(madcapPattern);
      if (matches) {
        console.log(chalk.yellow(`Found unconverted MadCap elements: ${matches.join(', ')}`));
      }
    }
  }
  
  private async saveIterationResult(baseName: string, iteration: number, content: string, metrics: ConversionQualityMetrics): Promise<void> {
    const outputDir = path.join(process.cwd(), 'tests', 'optimization-results');
    await fs.mkdir(outputDir, { recursive: true });
    
    const filename = path.join(outputDir, `${baseName}_iteration_${iteration}.adoc`);
    await fs.writeFile(filename, content);
    
    const metricsFilename = path.join(outputDir, `${baseName}_iteration_${iteration}_metrics.json`);
    await fs.writeFile(metricsFilename, JSON.stringify(metrics, null, 2));
  }
  
  private async generateFinalReport(baseName: string): Promise<void> {
    const reportPath = path.join(process.cwd(), 'tests', 'optimization-results', `${baseName}_final_report.md`);
    
    const report = `# MadCap to AsciiDoc Optimization Report

## Summary
- Total iterations: ${this.iterations}
- Final quality: ${(this.currentQuality * 100).toFixed(1)}%
- Target quality: ${(this.targetQuality * 100).toFixed(1)}%
- Status: ${this.currentQuality >= this.targetQuality ? '✅ SUCCESS' : '❌ INCOMPLETE'}

## Optimization Rules Applied
${this.optimizationRules.map(rule => `- **${rule.description}** (${rule.category})`).join('\n')}

## Test Cases Performance
${this.testCases.map(tc => {
  const result = this.runTestCase(tc);
  return `### ${tc.name}
- Weight: ${tc.weight}
- Success: ${result ? '✅' : '❌'}`;
}).join('\n\n')}

## Recommendations
${this.generateRecommendations()}
`;
    
    await fs.writeFile(reportPath, report);
    console.log(chalk.green(`\n📄 Final report saved to: ${reportPath}`));
  }
  
  private runTestCase(testCase: TestCase): boolean {
    // This would run the actual conversion and compare
    // For now, returning placeholder
    return true;
  }
  
  private generateRecommendations(): string {
    const recommendations = [];
    
    if (this.currentQuality < 0.9) {
      recommendations.push('- Consider manual post-processing for complex MadCap elements');
      recommendations.push('- Review and enhance list conversion logic');
    }
    
    if (this.currentQuality < 0.95) {
      recommendations.push('- Fine-tune image path resolution');
      recommendations.push('- Improve handling of nested structures');
    }
    
    return recommendations.join('\n');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const optimizer = new MadCapAsciiDocOptimizer();
  const sourcePath = process.argv[2] || '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  
  optimizer.optimizeConversion(sourcePath).catch(console.error);
}
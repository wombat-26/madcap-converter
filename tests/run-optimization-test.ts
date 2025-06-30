#!/usr/bin/env node

import { MadCapAsciiDocOptimizer } from './madcap-asciidoc-optimizer.js';
import { EnhancedAsciiDocConverter } from '../src/converters/enhanced-asciidoc-converter.js';
import { AsciiDocConverter } from '../src/converters/asciidoc-converter.js';
import { DocumentService } from '../src/document-service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ConversionOptions } from '../src/types/index.js';

interface ComparisonResult {
  converter: string;
  quality: number;
  content: string;
  issues: string[];
  timeTaken: number;
}

class OptimizationTestRunner {
  private sourcePath: string;
  private outputDir: string;
  
  constructor(sourcePath: string) {
    this.sourcePath = sourcePath;
    this.outputDir = path.join(process.cwd(), 'tests', 'optimization-results', new Date().toISOString().split('T')[0]);
  }
  
  async run(): Promise<void> {
    console.log(chalk.blue('🚀 Starting MadCap to AsciiDoc optimization test...'));
    console.log(chalk.gray(`Source: ${this.sourcePath}`));
    
    // Create output directory
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Read source HTML
    const sourceHtml = await fs.readFile(this.sourcePath, 'utf-8');
    const sourceFileName = path.basename(this.sourcePath, path.extname(this.sourcePath));
    
    // Save source for reference
    await fs.writeFile(path.join(this.outputDir, `${sourceFileName}_source.html`), sourceHtml);
    
    // Test existing converter
    console.log(chalk.yellow('\n📊 Testing existing AsciiDoc converter...'));
    const existingResult = await this.testConverter(sourceHtml, new AsciiDocConverter(), 'existing');
    
    // Test enhanced converter
    console.log(chalk.yellow('\n📊 Testing enhanced AsciiDoc converter...'));
    const enhancedResult = await this.testConverter(sourceHtml, new EnhancedAsciiDocConverter(), 'enhanced');
    
    // Run optimizer
    console.log(chalk.yellow('\n📊 Running iterative optimizer...'));
    const optimizer = new MadCapAsciiDocOptimizer();
    await optimizer.optimizeConversion(this.sourcePath);
    
    // Compare results
    await this.generateComparisonReport([existingResult, enhancedResult], sourceFileName);
    
    console.log(chalk.green('\n✅ Optimization test complete!'));
    console.log(chalk.gray(`Results saved to: ${this.outputDir}`));
  }
  
  private async testConverter(
    sourceHtml: string,
    converter: any,
    name: string
  ): Promise<ComparisonResult> {
    const startTime = Date.now();
    
    try {
      const options: ConversionOptions = {
        format: 'asciidoc',
        preserveFormatting: false,
        inputPath: this.sourcePath
      };
      
      const result = await converter.convert(sourceHtml, options);
      const timeTaken = Date.now() - startTime;
      
      // Measure quality using the optimizer's metrics
      const optimizer = new MadCapAsciiDocOptimizer();
      const metrics = await (optimizer as any).measureQuality(sourceHtml, result.content);
      
      // Save output
      const outputPath = path.join(this.outputDir, `${name}_output.adoc`);
      await fs.writeFile(outputPath, result.content);
      
      console.log(chalk.cyan(`${name} converter results:`));
      console.log(`  • Quality: ${(metrics.overall * 100).toFixed(1)}%`);
      console.log(`  • Time: ${timeTaken}ms`);
      console.log(`  • Issues: ${metrics.issues.length}`);
      
      return {
        converter: name,
        quality: metrics.overall,
        content: result.content,
        issues: metrics.issues,
        timeTaken
      };
    } catch (error) {
      console.error(chalk.red(`Error testing ${name} converter:`, error));
      return {
        converter: name,
        quality: 0,
        content: '',
        issues: [`Conversion failed: ${error}`],
        timeTaken: Date.now() - startTime
      };
    }
  }
  
  private async generateComparisonReport(
    results: ComparisonResult[],
    sourceFileName: string
  ): Promise<void> {
    const reportPath = path.join(this.outputDir, 'comparison_report.md');
    
    const report = `# MadCap to AsciiDoc Converter Comparison Report

## Test Information
- **Source File**: ${sourceFileName}
- **Test Date**: ${new Date().toISOString()}
- **Source Path**: ${this.sourcePath}

## Converter Performance Comparison

| Converter | Quality Score | Time (ms) | Issues |
|-----------|--------------|-----------|---------|
${results.map(r => `| ${r.converter} | ${(r.quality * 100).toFixed(1)}% | ${r.timeTaken} | ${r.issues.length} |`).join('\n')}

## Detailed Issues

${results.map(r => `### ${r.converter} Converter Issues
${r.issues.length === 0 ? '✅ No issues found' : r.issues.map(issue => `- ${issue}`).join('\n')}`).join('\n\n')}

## Key Differences

### Structure Preservation
${this.analyzeStructuralDifferences(results)}

### Content Fidelity
${this.analyzeContentDifferences(results)}

### AsciiDoc Syntax Compliance
${this.analyzeSyntaxCompliance(results)}

## Recommendations

${this.generateRecommendations(results)}

## Sample Output Comparison

### Existing Converter Output (First 50 lines)
\`\`\`asciidoc
${results.find(r => r.converter === 'existing')?.content.split('\n').slice(0, 50).join('\n') || 'N/A'}
\`\`\`

### Enhanced Converter Output (First 50 lines)
\`\`\`asciidoc
${results.find(r => r.converter === 'enhanced')?.content.split('\n').slice(0, 50).join('\n') || 'N/A'}
\`\`\`
`;
    
    await fs.writeFile(reportPath, report);
  }
  
  private analyzeStructuralDifferences(results: ComparisonResult[]): string {
    const analyses = [];
    
    for (const result of results) {
      const headingCount = (result.content.match(/^=+ .+$/gm) || []).length;
      const listCount = (result.content.match(/^[.*]\s+.+$/gm) || []).length;
      const imageCount = (result.content.match(/image:+[^\[]+\[/g) || []).length;
      
      analyses.push(`- **${result.converter}**: ${headingCount} headings, ${listCount} list items, ${imageCount} images`);
    }
    
    return analyses.join('\n');
  }
  
  private analyzeContentDifferences(results: ComparisonResult[]): string {
    const analyses = [];
    
    for (const result of results) {
      const wordCount = result.content.split(/\s+/).filter(w => w.length > 0).length;
      const hasUnconvertedMadCap = result.content.includes('MadCap:');
      const hasHtmlExtensions = result.content.includes('.htm');
      
      analyses.push(`- **${result.converter}**: ${wordCount} words, ` +
        `${hasUnconvertedMadCap ? '❌ Contains MadCap elements' : '✅ No MadCap elements'}, ` +
        `${hasHtmlExtensions ? '❌ Contains .htm extensions' : '✅ No .htm extensions'}`);
    }
    
    return analyses.join('\n');
  }
  
  private analyzeSyntaxCompliance(results: ComparisonResult[]): string {
    const analyses = [];
    
    for (const result of results) {
      const checks = {
        'Proper admonition syntax': /^(NOTE|TIP|WARNING|CAUTION|IMPORTANT):\s+/gm.test(result.content),
        'Clean list markers': /^[.*]+\s+.+$/gm.test(result.content),
        'Correct image syntax': /image::?[^\[]+\[[^\]]*\]/g.test(result.content),
        'Valid cross-references': /xref:[^\[]+\[[^\]]*\]/g.test(result.content),
        'No HTML artifacts': !/<[^>]+>/.test(result.content)
      };
      
      const passed = Object.values(checks).filter(v => v).length;
      analyses.push(`- **${result.converter}**: ${passed}/5 syntax checks passed`);
    }
    
    return analyses.join('\n');
  }
  
  private generateRecommendations(results: ComparisonResult[]): string {
    const recommendations = [];
    
    const bestResult = results.reduce((best, current) => 
      current.quality > best.quality ? current : best
    );
    
    recommendations.push(`1. **Best Performer**: ${bestResult.converter} converter with ${(bestResult.quality * 100).toFixed(1)}% quality score`);
    
    if (bestResult.quality < 0.95) {
      recommendations.push('2. **Quality Improvement Needed**: Consider additional optimization rules for:');
      
      const commonIssues = new Set<string>();
      results.forEach(r => r.issues.forEach(issue => commonIssues.add(issue)));
      
      Array.from(commonIssues).slice(0, 5).forEach(issue => {
        recommendations.push(`   - ${issue}`);
      });
    }
    
    if (results.some(r => r.timeTaken > 1000)) {
      recommendations.push('3. **Performance Optimization**: Some converters are slow, consider caching or parallel processing');
    }
    
    return recommendations.join('\n');
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  const sourcePath = process.argv[2] || '/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm';
  const runner = new OptimizationTestRunner(sourcePath);
  runner.run().catch(console.error);
}
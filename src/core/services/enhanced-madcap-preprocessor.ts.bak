/**
 * Enhanced MadCap Preprocessor with Validation and Fixing
 * 
 * Extends the standard MadCap preprocessor to include HTML validation
 * and automatic fixing of common MadCap HTM issues before conversion.
 */

import { MadCapPreprocessor } from './madcap-preprocessor.js';
import { MadCapHTMValidationService, MadCapValidationResult } from './madcap-htm-validator.js';
import { MadCapHTMFixingService, MadCapFixResult } from './madcap-htm-fixer.js';
import { HTMLStageOptimizer, StageHandoffResult } from './html-stage-optimizer.js';

export interface EnhancedPreprocessOptions {
  extractVariables?: boolean;
  preserveVariables?: boolean;
  variableMode?: 'reference' | 'include';
  validateAndFix?: boolean;
  validationStrictness?: 'strict' | 'normal' | 'lenient';
  fixListNesting?: boolean;
  fixXHTMLCompliance?: boolean;
  fixMadCapElements?: boolean;
  reportValidationIssues?: boolean;
  optimizeStageHandoff?: boolean;
  validateStageTransition?: boolean;
}

export interface EnhancedPreprocessResult {
  processedHTML: string;
  validationResult?: MadCapValidationResult;
  fixResult?: MadCapFixResult;
  stageHandoffResult?: StageHandoffResult;
  wasFixed: boolean;
  validationPassed: boolean;
  wasOptimized: boolean;
  warnings: string[];
  summary: {
    originalErrors: number;
    fixedErrors: number;
    remainingErrors: number;
    processingTime: number;
    optimizationsApplied: number;
    transitionValidated: boolean;
  };
}

export class EnhancedMadCapPreprocessor extends MadCapPreprocessor {
  private validator: MadCapHTMValidationService;
  private fixer: MadCapHTMFixingService;

  constructor() {
    super();
    this.validator = new MadCapHTMValidationService();
    this.fixer = new MadCapHTMFixingService();
  }

  /**
   * Enhanced preprocessing with validation and fixing
   */
  async enhancedPreprocess(
    html: string, 
    inputPath?: string, 
    outputFormat?: string,
    options: EnhancedPreprocessOptions = {}
  ): Promise<EnhancedPreprocessResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    let processedHTML = html;
    let validationResult: MadCapValidationResult | undefined;
    let fixResult: MadCapFixResult | undefined;
    let stageHandoffResult: StageHandoffResult | undefined;
    let wasFixed = false;
    let validationPassed = false;
    let wasOptimized = false;

    const {
      validateAndFix = true,
      validationStrictness = 'normal',
      fixListNesting = true,
      fixXHTMLCompliance = true,
      fixMadCapElements = true,
      reportValidationIssues = true,
      optimizeStageHandoff = true,
      validateStageTransition = true
    } = options;

    try {
      // Step 1: Initial validation (if enabled)
      if (validateAndFix && reportValidationIssues) {
        try {
          validationResult = await this.validator.validateFlareContent(html, inputPath);
          validationPassed = validationResult.isValid;
          
          if (!validationResult.isValid) {
            warnings.push(`Found ${validationResult.summary.totalErrors} validation errors in source HTM`);
            
            if (validationStrictness === 'strict' && validationResult.summary.criticalErrors > 0) {
              warnings.push(`Strict mode: ${validationResult.summary.criticalErrors} critical errors detected`);
            }
          }
        } catch (validationError) {
          warnings.push(`Initial validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
        }
      }

      // Step 2: Apply fixes (if validation found issues)
      if (validateAndFix && validationResult && !validationResult.isValid) {
        try {
          fixResult = await this.fixer.fixMadCapHTM(html, {
            fixListNesting,
            fixXHTMLCompliance,
            fixMadCapElements,
            preserveFormatting: true,
            validateAfterFix: false
          });

          if (fixResult.wasFixed) {
            processedHTML = fixResult.fixedContent;
            wasFixed = true;
            warnings.push(`Applied ${fixResult.appliedFixes.length} automatic fixes`);
            
            // Log specific fixes
            if (fixResult.summary.listNestingFixes > 0) {
              warnings.push(`Fixed ${fixResult.summary.listNestingFixes} list nesting issues`);
            }
            if (fixResult.summary.xhtmlFixes > 0) {
              warnings.push(`Applied ${fixResult.summary.xhtmlFixes} XHTML compliance fixes`);
            }
            if (fixResult.summary.madcapElementFixes > 0) {
              warnings.push(`Fixed ${fixResult.summary.madcapElementFixes} MadCap element issues`);
            }
          }

          if (fixResult.remainingIssues.length > 0) {
            warnings.push(`${fixResult.remainingIssues.length} issues require manual review`);
          }
        } catch (fixError) {
          warnings.push(`Auto-fixing failed: ${fixError instanceof Error ? fixError.message : String(fixError)}`);
        }
      }

      // Step 3: Optimize Cheerio-to-JSDOM stage handoff (if fixes were applied)
      if (optimizeStageHandoff && (wasFixed || validateStageTransition)) {
        try {
          stageHandoffResult = HTMLStageOptimizer.createOptimizedTransition(
            processedHTML,
            'conversion'
          );
          
          processedHTML = stageHandoffResult.optimizedHTML;
          wasOptimized = true;
          
          warnings.push(`Applied ${stageHandoffResult.optimizations.length} stage handoff optimizations`);
          
          if (stageHandoffResult.optimizations.length > 0) {
            warnings.push('Stage transition optimizations: ' + stageHandoffResult.optimizations.slice(0, 2).join(', '));
          }
          
          if (stageHandoffResult.warnings.length > 0) {
            warnings.push('Stage transition warnings: ' + stageHandoffResult.warnings.slice(0, 2).join(', '));
          }
          
          if (!stageHandoffResult.isWellFormed) {
            warnings.push('Warning: HTML may not be well-formed for JSDOM processing');
          }
        } catch (optimizationError) {
          warnings.push(`Stage handoff optimization failed: ${optimizationError instanceof Error ? optimizationError.message : String(optimizationError)}`);
        }
      }

      // Step 4: Standard MadCap preprocessing (JSDOM stage)
      try {
        processedHTML = await this.preprocessMadCapContent(processedHTML, inputPath, outputFormat);
      } catch (preprocessError) {
        throw new Error(`MadCap preprocessing failed: ${preprocessError instanceof Error ? preprocessError.message : String(preprocessError)}`);
      }

      // Step 5: Post-processing validation (if fixes were applied)
      let finalValidationResult: MadCapValidationResult | undefined;
      if (validateAndFix && wasFixed && reportValidationIssues) {
        try {
          finalValidationResult = await this.validator.validateFlareContent(processedHTML, inputPath + ' (processed)');
          validationPassed = finalValidationResult.isValid;
          
          if (finalValidationResult.isValid) {
            warnings.push('Post-processing validation: PASSED');
          } else {
            warnings.push(`Post-processing validation: ${finalValidationResult.summary.totalErrors} errors remain`);
          }
        } catch (postValidationError) {
          warnings.push(`Post-processing validation failed: ${postValidationError instanceof Error ? postValidationError.message : String(postValidationError)}`);
        }
      }

      const processingTime = Date.now() - startTime;

      // Calculate summary
      const originalErrors = validationResult?.summary.totalErrors || 0;
      const fixedErrors = fixResult?.appliedFixes.length || 0;
      const remainingErrors = finalValidationResult?.summary.totalErrors || validationResult?.summary.totalErrors || 0;
      const optimizationsApplied = stageHandoffResult?.optimizations.length || 0;
      const transitionValidated = stageHandoffResult?.isWellFormed || false;

      return {
        processedHTML,
        validationResult: finalValidationResult || validationResult,
        fixResult,
        stageHandoffResult,
        wasFixed,
        validationPassed,
        wasOptimized,
        warnings,
        summary: {
          originalErrors,
          fixedErrors,
          remainingErrors,
          processingTime,
          optimizationsApplied,
          transitionValidated
        }
      };

    } catch (error) {
      // Fallback to standard preprocessing if enhanced features fail
      warnings.push(`Enhanced preprocessing failed, falling back to standard: ${error instanceof Error ? error.message : String(error)}`);
      
      try {
        const fallbackHTML = await this.preprocessMadCapContent(html, inputPath, outputFormat);
        const processingTime = Date.now() - startTime;

        return {
          processedHTML: fallbackHTML,
          wasFixed: false,
          validationPassed: false,
          wasOptimized: false,
          warnings,
          summary: {
            originalErrors: 0,
            fixedErrors: 0,
            remainingErrors: 0,
            processingTime,
            optimizationsApplied: 0,
            transitionValidated: false
          }
        };
      } catch (fallbackError) {
        throw new Error(`Both enhanced and standard preprocessing failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    }
  }

  /**
   * Standard preprocessing (for backward compatibility)
   */
  async preprocessWithValidation(
    html: string, 
    inputPath?: string, 
    outputFormat?: string
  ): Promise<string> {
    const result = await this.enhancedPreprocess(html, inputPath, outputFormat, {
      validateAndFix: true,
      reportValidationIssues: false // Don't slow down with detailed reporting
    });

    return result.processedHTML;
  }

  /**
   * Batch process multiple HTM files with validation and fixing
   */
  async batchProcessWithValidation(
    files: { path: string; content: string }[],
    outputFormat?: string,
    options: EnhancedPreprocessOptions = {}
  ): Promise<Map<string, EnhancedPreprocessResult>> {
    const results = new Map<string, EnhancedPreprocessResult>();
    let processedCount = 0;

    console.log(`🔄 Starting batch processing of ${files.length} files with validation...`);

    for (const file of files) {
      try {
        const result = await this.enhancedPreprocess(file.content, file.path, outputFormat, options);
        results.set(file.path, result);
        processedCount++;

        if (result.wasFixed) {
          console.log(`✅ ${file.path}: Fixed ${result.summary.fixedErrors} errors`);
        } else if (result.validationPassed) {
          console.log(`✅ ${file.path}: Already valid`);
        } else {
          console.log(`⚠️  ${file.path}: ${result.summary.remainingErrors} validation issues`);
        }

        // Rate limiting for W3C validator
        if (options.validateAndFix && options.reportValidationIssues) {
          await new Promise(resolve => setTimeout(resolve, 1100));
        }
      } catch (error) {
        console.error(`❌ ${file.path}: Processing failed - ${error instanceof Error ? error.message : String(error)}`);
        
        // Create error result
        results.set(file.path, {
          processedHTML: file.content,
          wasFixed: false,
          validationPassed: false,
          wasOptimized: false,
          warnings: [`Processing failed: ${error instanceof Error ? error.message : String(error)}`],
          summary: {
            originalErrors: 0,
            fixedErrors: 0,
            remainingErrors: 1,
            processingTime: 0,
            optimizationsApplied: 0,
            transitionValidated: false
          }
        });
      }
    }

    console.log(`🎉 Batch processing completed: ${processedCount}/${files.length} files processed successfully`);
    return results;
  }

  /**
   * Generate a comprehensive report for validation and fixing results
   */
  generateProcessingReport(results: Map<string, EnhancedPreprocessResult>): string {
    const lines: string[] = [];
    lines.push(`Enhanced MadCap Processing Report`);
    lines.push(`${'='.repeat(50)}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    let totalFiles = results.size;
    let validFiles = 0;
    let fixedFiles = 0;
    let optimizedFiles = 0;
    let errorFiles = 0;
    let totalOriginalErrors = 0;
    let totalFixedErrors = 0;
    let totalRemainingErrors = 0;
    let totalOptimizations = 0;
    let totalProcessingTime = 0;
    let transitionValidatedFiles = 0;

    // Calculate statistics
    for (const [path, result] of results) {
      totalOriginalErrors += result.summary.originalErrors;
      totalFixedErrors += result.summary.fixedErrors;
      totalRemainingErrors += result.summary.remainingErrors;
      totalOptimizations += result.summary.optimizationsApplied;
      totalProcessingTime += result.summary.processingTime;

      if (result.validationPassed) {
        validFiles++;
      }
      if (result.wasFixed) {
        fixedFiles++;
      }
      if (result.wasOptimized) {
        optimizedFiles++;
      }
      if (result.summary.transitionValidated) {
        transitionValidatedFiles++;
      }
      if (result.warnings.some(w => w.includes('failed'))) {
        errorFiles++;
      }
    }

    lines.push(`📊 Summary Statistics:`);
    lines.push(`   Total Files Processed: ${totalFiles}`);
    lines.push(`   Originally Valid Files: ${validFiles - fixedFiles}`);
    lines.push(`   Files Fixed: ${fixedFiles}`);
    lines.push(`   Files Optimized: ${optimizedFiles}`);
    lines.push(`   Transition Validated: ${transitionValidatedFiles}`);
    lines.push(`   Files with Errors: ${errorFiles}`);
    lines.push(`   Success Rate: ${Math.round(((validFiles + fixedFiles) / totalFiles) * 100)}%`);
    lines.push('');

    lines.push(`🔧 Error Statistics:`);
    lines.push(`   Original Errors Found: ${totalOriginalErrors}`);
    lines.push(`   Errors Fixed: ${totalFixedErrors}`);
    lines.push(`   Errors Remaining: ${totalRemainingErrors}`);
    lines.push(`   Fix Success Rate: ${totalOriginalErrors > 0 ? Math.round((totalFixedErrors / totalOriginalErrors) * 100) : 100}%`);
    lines.push('');

    lines.push(`⚡ Stage Optimization Statistics:`);
    lines.push(`   Total Optimizations Applied: ${totalOptimizations}`);
    lines.push(`   Files with Stage Optimizations: ${optimizedFiles}`);
    lines.push(`   Stage Transitions Validated: ${transitionValidatedFiles}`);
    lines.push(`   Optimization Rate: ${totalFiles > 0 ? Math.round((optimizedFiles / totalFiles) * 100) : 0}%`);
    lines.push('');

    lines.push(`⏱️  Performance:`);
    lines.push(`   Total Processing Time: ${(totalProcessingTime / 1000).toFixed(1)}s`);
    lines.push(`   Average Time per File: ${(totalProcessingTime / totalFiles / 1000).toFixed(1)}s`);
    lines.push('');

    // Detail section for files with issues
    const filesWithIssues = Array.from(results.entries()).filter(([_, result]) => 
      !result.validationPassed || result.warnings.length > 0
    );

    if (filesWithIssues.length > 0) {
      lines.push(`⚠️  Files Requiring Attention (${filesWithIssues.length}):`);
      filesWithIssues.forEach(([path, result]) => {
        lines.push(`   📄 ${path.split('/').pop()}`);
        lines.push(`      Status: ${result.validationPassed ? '✅ Valid' : '❌ Invalid'}`);
        lines.push(`      Fixed: ${result.wasFixed ? 'Yes' : 'No'}`);
        lines.push(`      Optimized: ${result.wasOptimized ? 'Yes' : 'No'}`);
        lines.push(`      Errors: ${result.summary.originalErrors} → ${result.summary.remainingErrors}`);
        lines.push(`      Stage Optimizations: ${result.summary.optimizationsApplied}`);
        if (result.warnings.length > 0) {
          lines.push(`      Warnings: ${result.warnings.length}`);
          result.warnings.slice(0, 2).forEach(warning => {
            lines.push(`        • ${warning}`);
          });
          if (result.warnings.length > 2) {
            lines.push(`        ... and ${result.warnings.length - 2} more`);
          }
        }
        lines.push('');
      });
    }

    return lines.join('\n');
  }
}
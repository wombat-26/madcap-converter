import { NextRequest, NextResponse } from 'next/server';
import { ConditionAnalyzer } from '../../../src/core/services/condition-analyzer';
import { ConditionAnalysisResult, ConditionInfo } from '../../../src/core/types/index';
import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// Request validation schema
const AnalyzeConditionsRequestSchema = z.object({
  files: z.array(z.object({
    name: z.string(),
    content: z.string().optional(), // Base64 or string content
    isBase64: z.boolean().optional()
  })).min(1, "At least one file is required"),
  sessionId: z.string().optional() // For progress tracking
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = AnalyzeConditionsRequestSchema.parse(body);
    
    // Create temporary directory for file analysis
    const tempDir = join(tmpdir(), `madcap-analysis-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    
    const analyzer = new ConditionAnalyzer();
    const filesToAnalyze: { path: string; content?: string }[] = [];
    
    // Process uploaded files
    for (const file of validatedData.files) {
      try {
        let content = file.content;
        
        // Decode Base64 content if needed
        if (file.isBase64 && content) {
          content = Buffer.from(content, 'base64').toString('utf8');
        }
        
        // For analysis, we can work directly with content without writing to disk
        // unless the file is very large or we need persistent storage
        if (content) {
          filesToAnalyze.push({
            path: file.name,
            content: content
          });
        } else {
          // If no content provided, write a temporary file
          const tempFilePath = join(tempDir, file.name);
          await writeFile(tempFilePath, content || '', 'utf8');
          filesToAnalyze.push({ path: tempFilePath });
        }
        
      } catch (error) {
        console.warn(`Could not process file ${file.name}:`, error);
      }
    }
    
    if (filesToAnalyze.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid HTML files found to analyze'
      }, { status: 400 });
    }
    
    // Analyze conditions
    const analysisResult = await analyzer.analyzeFiles(filesToAnalyze);
    
    // Enhance results with condition categorization
    const conditionsWithInfo: (ConditionInfo & { files: string[] })[] = analysisResult.conditions.map(condition => ({
      ...analyzer.getConditionInfo(condition, analysisResult.conditionUsage[condition]),
      files: analysisResult.filesByCondition[condition] || []
    }));
    
    // Group conditions by category for better UX
    const conditionsByCategory = conditionsWithInfo.reduce((acc, conditionInfo) => {
      const category = conditionInfo.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(conditionInfo);
      return acc;
    }, {} as Record<string, (ConditionInfo & { files: string[] })[]>);
    
    // Sort categories by priority (deprecated/status first, then others)
    const categoryOrder: (keyof typeof conditionsByCategory)[] = [
      'status', 'development', 'visibility', 'color', 'print', 'custom'
    ];
    
    const sortedCategories: Record<string, (ConditionInfo & { files: string[] })[]> = {};
    categoryOrder.forEach(category => {
      if (conditionsByCategory[category]) {
        // Sort conditions within category by usage (most used first)
        sortedCategories[category] = conditionsByCategory[category]
          .sort((a, b) => b.usage - a.usage);
      }
    });
    
    // Generate recommended exclusions (commonly excluded conditions)
    const recommendedExclusions = conditionsWithInfo
      .filter(c => c.isDeprecated || c.category === 'development' && c.condition.toLowerCase().includes('draft'))
      .map(c => c.condition);
    
    return NextResponse.json({
      success: true,
      analysis: {
        ...analysisResult,
        conditionsByCategory: sortedCategories,
        conditionsWithInfo,
        recommendedExclusions,
        totalConditions: analysisResult.conditions.length,
        filesAnalyzed: analysisResult.fileCount
      }
    });
    
  } catch (error) {
    console.error('Condition analysis failed:', error);
    
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      // Check if this is a specific validation error we want to show directly
      if (firstError?.code === 'too_small' && firstError?.path?.includes('files')) {
        return NextResponse.json({
          success: false,
          error: firstError.message,
          details: error.errors
        }, { status: 400 });
      }
      // For other validation errors, show generic message
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Condition analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint for testing/health check
export async function GET() {
  return NextResponse.json({
    service: 'MadCap Condition Analyzer',
    version: '1.0.0',
    status: 'ready'
  });
}
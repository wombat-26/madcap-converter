import { NextRequest, NextResponse } from 'next/server';
import { DocumentService } from '../../../src/core/services/document-service';
import { ConversionOptions } from '../../../src/core/types';
import { z } from 'zod';

// Request validation schema
const ConvertRequestSchema = z.object({
  content: z.string(),
  inputType: z.enum(['html', 'word', 'madcap']),
  format: z.enum(['asciidoc', 'writerside-markdown', 'zendesk']),
  options: z.object({
    preserveFormatting: z.boolean().optional(),
    extractImages: z.boolean().optional(),
    rewriteLinks: z.boolean().optional(),
    variableOptions: z.any().optional(),
    zendeskOptions: z.any().optional(),
    asciidocOptions: z.any().optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = ConvertRequestSchema.parse(body);
    
    const documentService = new DocumentService();
    
    const conversionOptions: ConversionOptions = {
      inputType: validatedData.inputType,
      format: validatedData.format,
      preserveFormatting: validatedData.options?.preserveFormatting ?? true,
      extractImages: validatedData.options?.extractImages ?? false,
      rewriteLinks: validatedData.options?.rewriteLinks,
      variableOptions: validatedData.options?.variableOptions,
      zendeskOptions: validatedData.options?.zendeskOptions,
      asciidocOptions: validatedData.options?.asciidocOptions,
    };
    
    const result = await documentService.convertString(
      validatedData.content,
      conversionOptions
    );
    
    return NextResponse.json({
      success: true,
      content: result.content,
      metadata: result.metadata,
      variablesFile: result.variablesFile,
      glossaryContent: result.glossaryContent,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}
"use client"

import React from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { FileText, Shield, Image, Table, Calculator, Quote } from 'lucide-react'
import { useConversionStore } from '@/stores/useConversionStore'

export function AsciidocOptions() {
  const { options, updateAsciidocOptions } = useConversionStore()
  
  const defaultMathOptions = {
    enableMathProcessing: false,
    preserveLatex: true,
    convertSubscripts: true,
    normalizeSymbols: true,
  }
  
  const defaultCitationOptions = {
    enableCitationProcessing: false,
    citationStyle: 'author-year' as const,
    generateBibliography: true,
    extractDOIs: true,
    footnoteStyle: 'asciidoc' as const,
  }
  
  const defaultPerformanceOptions = {
    enableOptimization: false,
    chunkSize: 10000,
    maxConcurrency: 3,
    memoryThreshold: 100,
    batchProcessing: true,
  }
  
  const asciidocOptions = options.asciidocOptions || {
    includeChapter: true,
    enableValidation: false,
    validationStrictness: 'normal' as const,
    autoColumnWidths: false,
    preserveTableFormatting: false,
    tableFrame: 'all' as const,
    tableGrid: 'all' as const,
    enableSmartPathResolution: false,
    validateImagePaths: false,
    mathOptions: defaultMathOptions,
    citationOptions: defaultCitationOptions,
    performanceOptions: defaultPerformanceOptions,
  }

  return (
    <>
      <AccordionItem value="validation">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Validation Settings
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="enable-validation"
                checked={asciidocOptions.enableValidation || false}
                onCheckedChange={(checked) => updateAsciidocOptions({ enableValidation: checked })}
              />
              <Label htmlFor="enable-validation">Enable syntax validation</Label>
            </div>
            
            {asciidocOptions.enableValidation && (
              <div className="space-y-2 ml-6">
                <Label htmlFor="validation-strictness">Validation strictness</Label>
                <Select
                  value={asciidocOptions.validationStrictness || 'normal'}
                  onValueChange={(value: any) => updateAsciidocOptions({ validationStrictness: value })}
                >
                  <SelectTrigger id="validation-strictness">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strict">Strict - Report all issues</SelectItem>
                    <SelectItem value="normal">Normal - Balanced reporting</SelectItem>
                    <SelectItem value="lenient">Lenient - Only critical issues</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="tables">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Table className="h-4 w-4" />
            Table Processing
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-column-widths"
                checked={asciidocOptions.autoColumnWidths || false}
                onCheckedChange={(checked) => updateAsciidocOptions({ autoColumnWidths: checked })}
              />
              <Label htmlFor="auto-column-widths">Calculate optimal column widths</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="preserve-table-formatting"
                checked={asciidocOptions.preserveTableFormatting || false}
                onCheckedChange={(checked) => updateAsciidocOptions({ preserveTableFormatting: checked })}
              />
              <Label htmlFor="preserve-table-formatting">Preserve cell formatting</Label>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="table-frame">Table frame</Label>
                <Select
                  value={asciidocOptions.tableFrame || 'all'}
                  onValueChange={(value: any) => updateAsciidocOptions({ tableFrame: value })}
                >
                  <SelectTrigger id="table-frame">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All borders</SelectItem>
                    <SelectItem value="topbot">Top and bottom</SelectItem>
                    <SelectItem value="sides">Sides only</SelectItem>
                    <SelectItem value="none">No borders</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="table-grid">Table grid</Label>
                <Select
                  value={asciidocOptions.tableGrid || 'all'}
                  onValueChange={(value: any) => updateAsciidocOptions({ tableGrid: value })}
                >
                  <SelectTrigger id="table-grid">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All grid lines</SelectItem>
                    <SelectItem value="rows">Rows only</SelectItem>
                    <SelectItem value="cols">Columns only</SelectItem>
                    <SelectItem value="none">No grid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="paths">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            Path Resolution
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="smart-path-resolution"
                checked={asciidocOptions.enableSmartPathResolution || false}
                onCheckedChange={(checked) => updateAsciidocOptions({ enableSmartPathResolution: checked })}
              />
              <Label htmlFor="smart-path-resolution">Enable smart path resolution</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="validate-image-paths"
                checked={asciidocOptions.validateImagePaths || false}
                onCheckedChange={(checked) => updateAsciidocOptions({ validateImagePaths: checked })}
              />
              <Label htmlFor="validate-image-paths">Validate image paths</Label>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="math">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Math Processing
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="enable-math-processing"
                checked={asciidocOptions.mathOptions?.enableMathProcessing || false}
                onCheckedChange={(checked) => 
                  updateAsciidocOptions({ 
                    mathOptions: { ...(asciidocOptions.mathOptions || defaultMathOptions), enableMathProcessing: checked }
                  })
                }
              />
              <Label htmlFor="enable-math-processing">Enable math notation conversion</Label>
            </div>
            
            {asciidocOptions.mathOptions?.enableMathProcessing && (
              <div className="ml-6 space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="preserve-latex"
                    checked={asciidocOptions.mathOptions?.preserveLatex || false}
                    onCheckedChange={(checked) => 
                      updateAsciidocOptions({ 
                        mathOptions: { ...(asciidocOptions.mathOptions || defaultMathOptions), preserveLatex: checked }
                      })
                    }
                  />
                  <Label htmlFor="preserve-latex">Preserve LaTeX syntax</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="convert-subscripts"
                    checked={asciidocOptions.mathOptions?.convertSubscripts || false}
                    onCheckedChange={(checked) => 
                      updateAsciidocOptions({ 
                        mathOptions: { ...(asciidocOptions.mathOptions || defaultMathOptions), convertSubscripts: checked }
                      })
                    }
                  />
                  <Label htmlFor="convert-subscripts">Convert HTML sub/sup tags</Label>
                </div>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="citations">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Quote className="h-4 w-4" />
            Citation Processing
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="enable-citation-processing"
                checked={asciidocOptions.citationOptions?.enableCitationProcessing || false}
                onCheckedChange={(checked) => 
                  updateAsciidocOptions({ 
                    citationOptions: { ...(asciidocOptions.citationOptions || defaultCitationOptions), enableCitationProcessing: checked }
                  })
                }
              />
              <Label htmlFor="enable-citation-processing">Enable citation conversion</Label>
            </div>
            
            {asciidocOptions.citationOptions?.enableCitationProcessing && (
              <div className="ml-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="citation-style">Citation style</Label>
                  <Select
                    value={asciidocOptions.citationOptions?.citationStyle || 'author-year'}
                    onValueChange={(value: any) => 
                      updateAsciidocOptions({ 
                        citationOptions: { ...(asciidocOptions.citationOptions || defaultCitationOptions), citationStyle: value }
                      })
                    }
                  >
                    <SelectTrigger id="citation-style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="author-year">Author-Year (Smith, 2023)</SelectItem>
                      <SelectItem value="numeric">Numeric [1]</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="generate-bibliography"
                    checked={asciidocOptions.citationOptions?.generateBibliography || false}
                    onCheckedChange={(checked) => 
                      updateAsciidocOptions({ 
                        citationOptions: { ...(asciidocOptions.citationOptions || defaultCitationOptions), generateBibliography: checked }
                      })
                    }
                  />
                  <Label htmlFor="generate-bibliography">Auto-generate bibliography</Label>
                </div>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  )
}
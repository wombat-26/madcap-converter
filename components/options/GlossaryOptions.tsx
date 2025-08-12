"use client"

import React from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Book, FileText, Filter, Hash, Type, FolderOpen } from 'lucide-react'
import { useConversionStore } from '@/stores/useConversionStore'

export function GlossaryOptions() {
  const { options, updateGlossaryOptions } = useConversionStore()
  
  const glossaryOptions = options.glossaryOptions || {
    generateGlossary: false,
    glossaryTitle: 'Glossary',
    glossaryFile: '',
    extractToSeparateFile: false,
    includeGlossary: true,
    glossaryPath: '',
    filterConditions: false,
    glossaryFormat: 'separate' as const,
    generateAnchors: true,
  }

  return (
    <AccordionItem value="glossary">
      <AccordionTrigger>
        <div className="flex items-center gap-2">
          <Book className="h-4 w-4" />
          Glossary Settings
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4">
          {/* Main glossary toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="generate-glossary"
              checked={glossaryOptions.generateGlossary || false}
              onCheckedChange={(checked) => updateGlossaryOptions({ generateGlossary: checked })}
            />
            <Label htmlFor="generate-glossary">Generate glossary from content</Label>
          </div>
          
          {/* Include glossary toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="include-glossary"
              checked={glossaryOptions.includeGlossary !== false}
              onCheckedChange={(checked) => updateGlossaryOptions({ includeGlossary: checked })}
            />
            <Label htmlFor="include-glossary">Include existing glossary in conversion</Label>
          </div>
          
          {glossaryOptions.generateGlossary && (
            <div className="ml-6 space-y-4">
              {/* Glossary title */}
              <div className="space-y-2">
                <Label htmlFor="glossary-title">
                  <div className="flex items-center gap-2">
                    <Type className="h-3 w-3" />
                    Glossary Title
                  </div>
                </Label>
                <Input
                  id="glossary-title"
                  value={glossaryOptions.glossaryTitle || 'Glossary'}
                  onChange={(e) => updateGlossaryOptions({ glossaryTitle: e.target.value })}
                  placeholder="Enter glossary section title"
                />
              </div>
              
              {/* Output format */}
              <div className="space-y-2">
                <Label htmlFor="glossary-format">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3 w-3" />
                    Output Format
                  </div>
                </Label>
                <Select
                  value={glossaryOptions.glossaryFormat || 'separate'}
                  onValueChange={(value: any) => updateGlossaryOptions({ glossaryFormat: value })}
                >
                  <SelectTrigger id="glossary-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="separate">Separate - Create glossary file</SelectItem>
                    <SelectItem value="book-appendix">Book Appendix - For AsciiDoc books</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Extract to separate file */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="extract-to-separate"
                  checked={glossaryOptions.extractToSeparateFile || false}
                  onCheckedChange={(checked) => updateGlossaryOptions({ extractToSeparateFile: checked })}
                />
                <Label htmlFor="extract-to-separate">Extract glossary to separate file</Label>
              </div>
              
              {glossaryOptions.extractToSeparateFile && (
                <div className="ml-6 space-y-2">
                  <Label htmlFor="glossary-file">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      Glossary File Name
                    </div>
                  </Label>
                  <Input
                    id="glossary-file"
                    value={glossaryOptions.glossaryFile || ''}
                    onChange={(e) => updateGlossaryOptions({ glossaryFile: e.target.value })}
                    placeholder="glossary.adoc"
                  />
                </div>
              )}
              
              {/* Generate anchors */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="generate-anchors"
                  checked={glossaryOptions.generateAnchors !== false}
                  onCheckedChange={(checked) => updateGlossaryOptions({ generateAnchors: checked })}
                />
                <Label htmlFor="generate-anchors">
                  <div className="flex items-center gap-2">
                    <Hash className="h-3 w-3" />
                    Generate anchors for glossary terms
                  </div>
                </Label>
              </div>
              
              {/* Filter conditions */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enable-filter-conditions"
                    checked={glossaryOptions.filterConditions !== false}
                    onCheckedChange={(checked) => updateGlossaryOptions({ 
                      filterConditions: checked ? [] : false 
                    })}
                  />
                  <Label htmlFor="enable-filter-conditions">
                    <div className="flex items-center gap-2">
                      <Filter className="h-3 w-3" />
                      Filter glossary by conditions
                    </div>
                  </Label>
                </div>
                
                {glossaryOptions.filterConditions !== false && (
                  <div className="ml-6">
                    <Input
                      id="filter-conditions"
                      value={Array.isArray(glossaryOptions.filterConditions) ? glossaryOptions.filterConditions.join(', ') : ''}
                      onChange={(e) => updateGlossaryOptions({ 
                        filterConditions: e.target.value ? e.target.value.split(',').map(s => s.trim()) : [] 
                      })}
                      placeholder="condition1, condition2"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Comma-separated list of conditions to include
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {glossaryOptions.includeGlossary && (
            <div className="space-y-2">
              <Label htmlFor="glossary-path">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-3 w-3" />
                  Glossary File Path
                </div>
              </Label>
              <Input
                id="glossary-path"
                value={glossaryOptions.glossaryPath || ''}
                onChange={(e) => updateGlossaryOptions({ glossaryPath: e.target.value })}
                placeholder="Project/Glossaries/glossary.flglo"
              />
              <p className="text-xs text-muted-foreground">
                Path to existing MadCap glossary file (.flglo)
              </p>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
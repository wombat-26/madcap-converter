"use client"

import React from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Tag, Code, Zap } from 'lucide-react'
import { useConversionStore } from '@/stores/useConversionStore'

export function VariableOptions() {
  const { options, updateVariableOptions } = useConversionStore()
  const variableOptions = options.variableOptions || {
    extractVariables: false,
    variableMode: 'flatten' as const,
    variableFormat: 'adoc' as const,
    autoDiscoverFLVAR: true,
    multiProjectSupport: false,
    smartProjectDetection: false,
    fallbackStrategy: 'warning' as const,
    nameConvention: 'kebab-case' as const,
    variablePrefix: '',
    instanceName: 'default',
    includePatterns: [],
    excludePatterns: [],
    flvarFiles: [],
  }

  return (
    <AccordionItem value="variables">
      <AccordionTrigger>
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Variable Processing
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="extract-variables"
              checked={variableOptions.extractVariables !== false}
              onCheckedChange={(checked) => updateVariableOptions({ extractVariables: checked })}
            />
            <Label htmlFor="extract-variables">Extract MadCap variables</Label>
          </div>
          
          {variableOptions.extractVariables !== false && (
            <div className="ml-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="variable-mode">Variable mode</Label>
                  <Select
                    value={variableOptions.variableMode || 'include'}
                    onValueChange={(value: any) => updateVariableOptions({ variableMode: value })}
                  >
                    <SelectTrigger id="variable-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flatten">Flatten - Replace with values</SelectItem>
                      <SelectItem value="include">Include - Extract to file</SelectItem>
                      <SelectItem value="reference">Reference - Keep references</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="variable-format">Variable file format</Label>
                  <Select
                    value={variableOptions.variableFormat || 'adoc'}
                    onValueChange={(value: any) => updateVariableOptions({ variableFormat: value })}
                  >
                    <SelectTrigger id="variable-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adoc">AsciiDoc attributes</SelectItem>
                      <SelectItem value="writerside">Writerside variables</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="auto-discover"
                  checked={variableOptions.autoDiscoverFLVAR !== false}
                  onCheckedChange={(checked) => updateVariableOptions({ autoDiscoverFLVAR: checked })}
                />
                <Label htmlFor="auto-discover">Auto-discover FLVAR files</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="multi-project"
                  checked={variableOptions.multiProjectSupport || false}
                  onCheckedChange={(checked) => updateVariableOptions({ multiProjectSupport: checked })}
                />
                <Label htmlFor="multi-project">Multi-project support</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="smart-detection"
                  checked={variableOptions.smartProjectDetection || false}
                  onCheckedChange={(checked) => updateVariableOptions({ smartProjectDetection: checked })}
                />
                <Label htmlFor="smart-detection">Smart project detection</Label>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="fallback-strategy">Missing variable handling</Label>
                <Select
                  value={variableOptions.fallbackStrategy || 'warning'}
                  onValueChange={(value: any) => updateVariableOptions({ fallbackStrategy: value })}
                >
                  <SelectTrigger id="fallback-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="error">Error - Stop conversion</SelectItem>
                    <SelectItem value="warning">Warning - Continue with placeholder</SelectItem>
                    <SelectItem value="ignore">Ignore - Keep original reference</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name-convention">Variable naming convention</Label>
                <Select
                  value={variableOptions.nameConvention || 'kebab-case'}
                  onValueChange={(value: any) => updateVariableOptions({ nameConvention: value })}
                >
                  <SelectTrigger id="name-convention">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kebab-case">kebab-case</SelectItem>
                    <SelectItem value="snake_case">snake_case</SelectItem>
                    <SelectItem value="camelCase">camelCase</SelectItem>
                    <SelectItem value="PascalCase">PascalCase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="variable-prefix">Variable prefix (optional)</Label>
                <Input
                  id="variable-prefix"
                  value={variableOptions.variablePrefix || ''}
                  onChange={(e) => updateVariableOptions({ variablePrefix: e.target.value })}
                  placeholder="e.g., mc_"
                />
              </div>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
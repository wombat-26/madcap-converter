"use client"

import React from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { FileCode, Link, Image, List } from 'lucide-react'
import { useConversionStore } from '@/stores/useConversionStore'

export function MarkdownOptions() {
  const { options, updateMarkdownOptions } = useConversionStore()
  const markdownOptions = options.markdownOptions || {
    generateTOC: false,
    baseUrl: '',
    imageWidth: 600,
    imageBaseUrl: '',
    removeEmptyTableCells: false,
    instanceName: 'default',
  }

  return (
    <>
      <AccordionItem value="markdown-general">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            General Settings
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="generate-toc"
                checked={markdownOptions.generateTOC || false}
                onCheckedChange={(checked) => updateMarkdownOptions({ generateTOC: checked })}
              />
              <Label htmlFor="generate-toc">Generate table of contents</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="remove-empty-cells"
                checked={markdownOptions.removeEmptyTableCells || false}
                onCheckedChange={(checked) => updateMarkdownOptions({ removeEmptyTableCells: checked })}
              />
              <Label htmlFor="remove-empty-cells">Remove empty table cells</Label>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="instance-name">Instance name (for Writerside)</Label>
              <Input
                id="instance-name"
                value={markdownOptions.instanceName || 'default'}
                onChange={(e) => updateMarkdownOptions({ instanceName: e.target.value })}
                placeholder="default"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="markdown-links">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Link Settings
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="base-url">Base URL for links</Label>
              <Input
                id="base-url"
                value={markdownOptions.baseUrl || ''}
                onChange={(e) => updateMarkdownOptions({ baseUrl: e.target.value })}
                placeholder="https://docs.example.com"
              />
              <p className="text-xs text-muted-foreground">
                Prepended to relative links if specified
              </p>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="markdown-images">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            Image Settings
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="image-width">Default image width (pixels)</Label>
              <Input
                id="image-width"
                type="number"
                value={markdownOptions.imageWidth || 600}
                onChange={(e) => updateMarkdownOptions({ imageWidth: parseInt(e.target.value) || 600 })}
                min="100"
                max="2000"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="image-base-url">Image base URL</Label>
              <Input
                id="image-base-url"
                value={markdownOptions.imageBaseUrl || ''}
                onChange={(e) => updateMarkdownOptions({ imageBaseUrl: e.target.value })}
                placeholder="https://cdn.example.com/images"
              />
              <p className="text-xs text-muted-foreground">
                Prepended to image paths if specified
              </p>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  )
}
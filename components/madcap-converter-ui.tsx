"use client"

import React, { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { 
  FileText, 
  Folder, 
  Settings, 
  Play, 
  Download,
  FileCode,
  Globe,
  Palette,
  Tag,
  Shield,
  Video,
  Image,
  Code,
  RefreshCw
} from 'lucide-react'
import { MCPClient, ConversionOptions, ZendeskOptions, BatchConversionOptions } from '@/lib/mcp-client'

interface ConversionState {
  isConverting: boolean
  progress?: number
  result?: any
  error?: string
}

export function MadCapConverterUI() {
  // Basic Options
  const [format, setFormat] = useState<'markdown' | 'asciidoc' | 'zendesk'>('zendesk')
  const [inputType, setInputType] = useState<'html' | 'word' | 'madcap'>('madcap')
  const [preserveFormatting, setPreserveFormatting] = useState(true)
  const [extractImages, setExtractImages] = useState(true)

  // File/Folder Paths
  const [inputPath, setInputPath] = useState('/Volumes/Envoy Pro/Flare/Administration EN/Content')
  const [outputPath, setOutputPath] = useState('/Volumes/Envoy Pro/ZendeskOutputAdmin')

  // Batch Options
  const [recursive, setRecursive] = useState(true)
  const [preserveStructure, setPreserveStructure] = useState(true)
  const [copyImages, setCopyImages] = useState(true)
  const [renameFiles, setRenameFiles] = useState(false)
  const [includePatterns, setIncludePatterns] = useState<string[]>([])
  const [excludePatterns, setExcludePatterns] = useState<string[]>([])

  // Zendesk Options
  const [zendeskOptions, setZendeskOptions] = useState<ZendeskOptions>({
    sectionId: '',
    locale: 'en-us',
    userSegmentId: '',
    permissionGroupId: '',
    generateTags: true,
    maxTags: 10,
    sanitizeHtml: true,
    ignoreVideos: true,
    inlineStyles: false,
    generateStylesheet: true,
    cssOutputPath: ''
  })

  // UI State
  const [conversionState, setConversionState] = useState<ConversionState>({
    isConverting: false
  })

  const mcpClient = new MCPClient('/api/mcp')

  const handleSingleFileConversion = useCallback(async () => {
    setConversionState({ isConverting: true })
    
    try {
      // Clean up paths - remove any escaped spaces
      const cleanInputPath = inputPath.replace(/\\\s/g, ' ')
      const cleanOutputPath = outputPath.replace(/\\\s/g, ' ')
      
      const options: ConversionOptions = {
        format,
        inputType,
        preserveFormatting,
        extractImages,
        zendeskOptions: format === 'zendesk' ? zendeskOptions : undefined
      }

      console.log('Converting file with cleaned paths:', { 
        original: inputPath, 
        cleaned: cleanInputPath,
        outputOriginal: outputPath,
        outputCleaned: cleanOutputPath 
      })

      const result = await mcpClient.convertFile(cleanInputPath, cleanOutputPath, options)
      setConversionState({ isConverting: false, result })
    } catch (error) {
      setConversionState({ 
        isConverting: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
    }
  }, [format, inputType, preserveFormatting, extractImages, zendeskOptions, inputPath, outputPath, mcpClient])

  const handleFolderConversion = useCallback(async () => {
    setConversionState({ isConverting: true })
    
    try {
      // Clean up paths - remove any escaped spaces
      const cleanInputPath = inputPath.replace(/\\\s/g, ' ')
      const cleanOutputPath = outputPath.replace(/\\\s/g, ' ')
      
      const options: BatchConversionOptions = {
        format,
        // Don't include inputType for folder conversion - let the server auto-detect
        preserveFormatting,
        extractImages,
        recursive,
        preserveStructure,
        copyImages,
        renameFiles,
        includePatterns: includePatterns.length > 0 ? includePatterns : undefined,
        excludePatterns: excludePatterns.length > 0 ? excludePatterns : undefined,
        zendeskOptions: format === 'zendesk' ? zendeskOptions : undefined
      }

      console.log('Converting folder with options:', JSON.stringify(options, null, 2))
      console.log('Input path (original):', inputPath)
      console.log('Input path (cleaned):', cleanInputPath)
      console.log('Output path (original):', outputPath)
      console.log('Output path (cleaned):', cleanOutputPath)
      const result = await mcpClient.convertFolder(cleanInputPath, cleanOutputPath, options)
      setConversionState({ isConverting: false, result })
    } catch (error) {
      setConversionState({ 
        isConverting: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
    }
  }, [
    format, preserveFormatting, extractImages, recursive, 
    preserveStructure, copyImages, renameFiles, includePatterns, excludePatterns, 
    zendeskOptions, inputPath, outputPath, mcpClient
  ])

  const handleAnalyzeFolder = useCallback(async () => {
    setConversionState({ isConverting: true })
    
    try {
      // Clean up paths - remove any escaped spaces
      const cleanInputPath = inputPath.replace(/\\\s/g, ' ')
      
      console.log('Analyzing folder with cleaned path:', { 
        original: inputPath, 
        cleaned: cleanInputPath 
      })
      
      const result = await mcpClient.analyzeFolder(cleanInputPath)
      setConversionState({ isConverting: false, result })
    } catch (error) {
      setConversionState({ 
        isConverting: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
    }
  }, [inputPath, mcpClient])

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">MadCap Converter</h1>
        <p className="text-muted-foreground">
          Convert MadCap Flare documentation to multiple formats with advanced Zendesk integration
        </p>
      </div>

      <Tabs defaultValue="folder" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="folder" className="flex items-center gap-2">
            <Folder className="w-4 h-4" />
            Folder Conversion
          </TabsTrigger>
          <TabsTrigger value="file" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Single File
          </TabsTrigger>
          <TabsTrigger value="analyze" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Analyze
          </TabsTrigger>
        </TabsList>

        {/* Folder Conversion Tab */}
        <TabsContent value="folder" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Basic Settings
                </CardTitle>
                <CardDescription>
                  Configure input/output paths and conversion format
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="input-path">Input Directory</Label>
                  <Input
                    id="input-path"
                    value={inputPath}
                    onChange={(e) => setInputPath(e.target.value)}
                    placeholder="/path/to/madcap/content"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="output-path">Output Directory</Label>
                  <Input
                    id="output-path"
                    value={outputPath}
                    onChange={(e) => setOutputPath(e.target.value)}
                    placeholder="/path/to/output"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="format">Output Format</Label>
                  <Select value={format} onValueChange={(value: any) => setFormat(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zendesk">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4" />
                          Zendesk HTML
                        </div>
                      </SelectItem>
                      <SelectItem value="markdown">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4" />
                          Markdown
                        </div>
                      </SelectItem>
                      <SelectItem value="asciidoc">
                        <div className="flex items-center gap-2">
                          <Code className="w-4 h-4" />
                          AsciiDoc
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="input-type">Input Type</Label>
                  <Select value={inputType} onValueChange={(value: any) => setInputType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="madcap">MadCap Flare</SelectItem>
                      <SelectItem value="html">HTML</SelectItem>
                      <SelectItem value="word">Word Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Batch Options */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Folder className="w-5 h-5" />
                  Batch Options
                </CardTitle>
                <CardDescription>
                  Configure folder processing behavior
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Process Recursively</Label>
                    <div className="text-sm text-muted-foreground">
                      Include subdirectories
                    </div>
                  </div>
                  <Switch
                    checked={recursive}
                    onCheckedChange={setRecursive}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Preserve Structure</Label>
                    <div className="text-sm text-muted-foreground">
                      Keep directory organization
                    </div>
                  </div>
                  <Switch
                    checked={preserveStructure}
                    onCheckedChange={setPreserveStructure}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      Copy Images
                    </Label>
                    <div className="text-sm text-muted-foreground">
                      Transfer image files
                    </div>
                  </div>
                  <Switch
                    checked={copyImages}
                    onCheckedChange={setCopyImages}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Rename Files
                    </Label>
                    <div className="text-sm text-muted-foreground">
                      Use H1 heading as filename (no spaces)
                    </div>
                  </div>
                  <Switch
                    checked={renameFiles}
                    onCheckedChange={setRenameFiles}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Preserve Formatting</Label>
                    <div className="text-sm text-muted-foreground">
                      Maintain original styles
                    </div>
                  </div>
                  <Switch
                    checked={preserveFormatting}
                    onCheckedChange={setPreserveFormatting}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Extract Images</Label>
                    <div className="text-sm text-muted-foreground">
                      Export embedded images
                    </div>
                  </div>
                  <Switch
                    checked={extractImages}
                    onCheckedChange={setExtractImages}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Zendesk Options */}
          {format === 'zendesk' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Zendesk Options
                </CardTitle>
                <CardDescription>
                  Configure Zendesk Help Center specific settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="zendesk-basic">
                    <AccordionTrigger>Basic Zendesk Settings</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="section-id">Section ID</Label>
                          <Input
                            id="section-id"
                            value={zendeskOptions.sectionId || ''}
                            onChange={(e) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              sectionId: e.target.value 
                            }))}
                            placeholder="123456789"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="locale">Locale</Label>
                          <Select 
                            value={zendeskOptions.locale} 
                            onValueChange={(value) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              locale: value 
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="en-us">English (US)</SelectItem>
                              <SelectItem value="en-gb">English (UK)</SelectItem>
                              <SelectItem value="de">German</SelectItem>
                              <SelectItem value="fr">French</SelectItem>
                              <SelectItem value="es">Spanish</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="user-segment">User Segment ID</Label>
                          <Input
                            id="user-segment"
                            value={zendeskOptions.userSegmentId || ''}
                            onChange={(e) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              userSegmentId: e.target.value 
                            }))}
                            placeholder="987654321"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="permission-group">Permission Group ID</Label>
                          <Input
                            id="permission-group"
                            value={zendeskOptions.permissionGroupId || ''}
                            onChange={(e) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              permissionGroupId: e.target.value 
                            }))}
                            placeholder="456789123"
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="zendesk-content">
                    <AccordionTrigger>Content & AI Settings</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Tag className="w-4 h-4" />
                            Generate AI Tags
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Automatically create content tags
                          </div>
                        </div>
                        <Switch
                          checked={zendeskOptions.generateTags}
                          onCheckedChange={(checked) => setZendeskOptions(prev => ({ 
                            ...prev, 
                            generateTags: checked 
                          }))}
                        />
                      </div>

                      {zendeskOptions.generateTags && (
                        <div className="space-y-2">
                          <Label htmlFor="max-tags">Maximum Tags</Label>
                          <Input
                            id="max-tags"
                            type="number"
                            min="1"
                            max="20"
                            value={zendeskOptions.maxTags}
                            onChange={(e) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              maxTags: parseInt(e.target.value) || 10 
                            }))}
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Sanitize HTML
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Remove unsafe HTML elements
                          </div>
                        </div>
                        <Switch
                          checked={zendeskOptions.sanitizeHtml}
                          onCheckedChange={(checked) => setZendeskOptions(prev => ({ 
                            ...prev, 
                            sanitizeHtml: checked 
                          }))}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Video className="w-4 h-4" />
                            Ignore Videos
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Skip video processing
                          </div>
                        </div>
                        <Switch
                          checked={zendeskOptions.ignoreVideos}
                          onCheckedChange={(checked) => setZendeskOptions(prev => ({ 
                            ...prev, 
                            ignoreVideos: checked 
                          }))}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="zendesk-styling">
                    <AccordionTrigger>Styling Options</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Palette className="w-4 h-4" />
                            Inline Styles
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Embed CSS directly in HTML
                          </div>
                        </div>
                        <Switch
                          checked={zendeskOptions.inlineStyles}
                          onCheckedChange={(checked) => setZendeskOptions(prev => ({ 
                            ...prev, 
                            inlineStyles: checked 
                          }))}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            Generate External Stylesheet
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Create separate CSS file
                          </div>
                        </div>
                        <Switch
                          checked={zendeskOptions.generateStylesheet}
                          onCheckedChange={(checked) => setZendeskOptions(prev => ({ 
                            ...prev, 
                            generateStylesheet: checked 
                          }))}
                        />
                      </div>

                      {zendeskOptions.generateStylesheet && (
                        <div className="space-y-2">
                          <Label htmlFor="css-output-path">CSS Output Path</Label>
                          <Input
                            id="css-output-path"
                            value={zendeskOptions.cssOutputPath || ''}
                            onChange={(e) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              cssOutputPath: e.target.value 
                            }))}
                            placeholder="/path/to/styles.css"
                          />
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button 
              onClick={handleFolderConversion}
              disabled={conversionState.isConverting}
              className="flex items-center gap-2"
            >
              {conversionState.isConverting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Convert Folder
            </Button>

            <Button 
              variant="outline"
              onClick={handleAnalyzeFolder}
              disabled={conversionState.isConverting}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Analyze Folder
            </Button>
          </div>
        </TabsContent>

        {/* Single File Tab */}
        <TabsContent value="file" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* File Paths */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  File Paths
                </CardTitle>
                <CardDescription>
                  Specify input and output file locations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="single-input">Input File Path</Label>
                  <Input
                    id="single-input"
                    value={inputPath}
                    onChange={(e) => setInputPath(e.target.value)}
                    placeholder="/path/to/input/file.htm"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="single-output">Output File Path</Label>
                  <Input
                    id="single-output"
                    value={outputPath}
                    onChange={(e) => setOutputPath(e.target.value)}
                    placeholder="/path/to/output/file.html"
                  />
                </div>

                <Button 
                  onClick={handleSingleFileConversion}
                  disabled={conversionState.isConverting}
                  className="flex items-center gap-2 w-full"
                >
                  {conversionState.isConverting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  Convert File
                </Button>
              </CardContent>
            </Card>

            {/* Conversion Options */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Conversion Settings
                </CardTitle>
                <CardDescription>
                  Configure output format and options
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="file-format">Output Format</Label>
                  <Select value={format} onValueChange={(value: any) => setFormat(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zendesk">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4" />
                          Zendesk HTML
                        </div>
                      </SelectItem>
                      <SelectItem value="markdown">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4" />
                          Markdown
                        </div>
                      </SelectItem>
                      <SelectItem value="asciidoc">
                        <div className="flex items-center gap-2">
                          <Code className="w-4 h-4" />
                          AsciiDoc
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file-input-type">Input Type</Label>
                  <Select value={inputType} onValueChange={(value: any) => setInputType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="madcap">MadCap Flare</SelectItem>
                      <SelectItem value="html">HTML</SelectItem>
                      <SelectItem value="word">Word Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Preserve Formatting</Label>
                    <div className="text-sm text-muted-foreground">
                      Maintain original styles
                    </div>
                  </div>
                  <Switch
                    checked={preserveFormatting}
                    onCheckedChange={setPreserveFormatting}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Extract Images</Label>
                    <div className="text-sm text-muted-foreground">
                      Export embedded images
                    </div>
                  </div>
                  <Switch
                    checked={extractImages}
                    onCheckedChange={setExtractImages}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Zendesk Options for Single File */}
          {format === 'zendesk' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Zendesk Options
                </CardTitle>
                <CardDescription>
                  Configure Zendesk Help Center specific settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="zendesk-basic">
                    <AccordionTrigger>Basic Zendesk Settings</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="file-section-id">Section ID</Label>
                          <Input
                            id="file-section-id"
                            value={zendeskOptions.sectionId || ''}
                            onChange={(e) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              sectionId: e.target.value 
                            }))}
                            placeholder="123456789"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="file-locale">Locale</Label>
                          <Select 
                            value={zendeskOptions.locale} 
                            onValueChange={(value) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              locale: value 
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="en-us">English (US)</SelectItem>
                              <SelectItem value="en-gb">English (UK)</SelectItem>
                              <SelectItem value="de">German</SelectItem>
                              <SelectItem value="fr">French</SelectItem>
                              <SelectItem value="es">Spanish</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="file-user-segment">User Segment ID</Label>
                          <Input
                            id="file-user-segment"
                            value={zendeskOptions.userSegmentId || ''}
                            onChange={(e) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              userSegmentId: e.target.value 
                            }))}
                            placeholder="987654321"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="file-permission-group">Permission Group ID</Label>
                          <Input
                            id="file-permission-group"
                            value={zendeskOptions.permissionGroupId || ''}
                            onChange={(e) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              permissionGroupId: e.target.value 
                            }))}
                            placeholder="456789123"
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="zendesk-content">
                    <AccordionTrigger>Content & AI Settings</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Tag className="w-4 h-4" />
                            Generate AI Tags
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Automatically create content tags
                          </div>
                        </div>
                        <Switch
                          checked={zendeskOptions.generateTags}
                          onCheckedChange={(checked) => setZendeskOptions(prev => ({ 
                            ...prev, 
                            generateTags: checked 
                          }))}
                        />
                      </div>

                      {zendeskOptions.generateTags && (
                        <div className="space-y-2">
                          <Label htmlFor="file-max-tags">Maximum Tags</Label>
                          <Input
                            id="file-max-tags"
                            type="number"
                            min="1"
                            max="20"
                            value={zendeskOptions.maxTags}
                            onChange={(e) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              maxTags: parseInt(e.target.value) || 10 
                            }))}
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Sanitize HTML
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Remove unsafe HTML elements
                          </div>
                        </div>
                        <Switch
                          checked={zendeskOptions.sanitizeHtml}
                          onCheckedChange={(checked) => setZendeskOptions(prev => ({ 
                            ...prev, 
                            sanitizeHtml: checked 
                          }))}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Video className="w-4 h-4" />
                            Ignore Videos
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Skip video processing
                          </div>
                        </div>
                        <Switch
                          checked={zendeskOptions.ignoreVideos}
                          onCheckedChange={(checked) => setZendeskOptions(prev => ({ 
                            ...prev, 
                            ignoreVideos: checked 
                          }))}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="zendesk-styling">
                    <AccordionTrigger>Styling Options</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Palette className="w-4 h-4" />
                            Inline Styles
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Embed CSS directly in HTML
                          </div>
                        </div>
                        <Switch
                          checked={zendeskOptions.inlineStyles}
                          onCheckedChange={(checked) => setZendeskOptions(prev => ({ 
                            ...prev, 
                            inlineStyles: checked 
                          }))}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            Generate External Stylesheet
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Create separate CSS file
                          </div>
                        </div>
                        <Switch
                          checked={zendeskOptions.generateStylesheet}
                          onCheckedChange={(checked) => setZendeskOptions(prev => ({ 
                            ...prev, 
                            generateStylesheet: checked 
                          }))}
                        />
                      </div>

                      {zendeskOptions.generateStylesheet && (
                        <div className="space-y-2">
                          <Label htmlFor="file-css-output-path">CSS Output Path</Label>
                          <Input
                            id="file-css-output-path"
                            value={zendeskOptions.cssOutputPath || ''}
                            onChange={(e) => setZendeskOptions(prev => ({ 
                              ...prev, 
                              cssOutputPath: e.target.value 
                            }))}
                            placeholder="/path/to/styles.css"
                          />
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analyze Tab */}
        <TabsContent value="analyze" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Folder Analysis</CardTitle>
              <CardDescription>
                Analyze your MadCap Flare content before conversion
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="analyze-path">Directory to Analyze</Label>
                <Input
                  id="analyze-path"
                  value={inputPath}
                  onChange={(e) => setInputPath(e.target.value)}
                  placeholder="/path/to/madcap/content"
                />
              </div>

              <Button 
                onClick={handleAnalyzeFolder}
                disabled={conversionState.isConverting}
                className="flex items-center gap-2"
              >
                {conversionState.isConverting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Settings className="w-4 h-4" />
                )}
                Analyze Folder
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Results/Error Display */}
      {(conversionState.result || conversionState.error) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>
              {conversionState.error ? 'Error' : 'Conversion Result'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md overflow-auto max-h-96">
              {conversionState.error || JSON.stringify(conversionState.result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
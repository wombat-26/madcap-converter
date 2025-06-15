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
import { MCPClient, ConversionOptions, ZendeskOptions, BatchConversionOptions, VariableExtractionOptions, AsciidocOptions } from '@/lib/mcp-client'

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
  const [inputPath, setInputPath] = useState('/Volumes/Envoy Pro/Flare/Plan_EN/')
  const [outputPath, setOutputPath] = useState('/Volumes/Envoy Pro/target')

  // Batch Options
  const [recursive, setRecursive] = useState(true)
  const [preserveStructure, setPreserveStructure] = useState(true)
  const [copyImages, setCopyImages] = useState(true)
  const [renameFiles, setRenameFiles] = useState(false)
  const [includePatterns, setIncludePatterns] = useState<string[]>([])
  const [excludePatterns, setExcludePatterns] = useState<string[]>([])
  
  // TOC-based Options
  const [useTOCStructure, setUseTOCStructure] = useState(false)
  const [generateMasterDoc, setGenerateMasterDoc] = useState(true)

  // Variable Extraction Options
  const [variableOptions, setVariableOptions] = useState<VariableExtractionOptions>({
    extractVariables: false,
    variableFormat: 'adoc',
    variablesOutputPath: '',
    preserveVariableStructure: false
  })

  // AsciiDoc Options
  const [asciidocOptions, setAsciidocOptions] = useState<AsciidocOptions>({
    useCollapsibleBlocks: false,
    tilesAsTable: false,
    generateAsBook: false,
    bookTitle: '',
    bookAuthor: '',
    useLinkedTitleFromTOC: true,
    includeChapterBreaks: true,
    includeTOCLevels: 3,
    useBookDoctype: true
  })

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
        variableOptions: (format === 'asciidoc' || format === 'markdown') && variableOptions.extractVariables ? variableOptions : undefined,
        zendeskOptions: format === 'zendesk' ? zendeskOptions : undefined,
        asciidocOptions: format === 'asciidoc' ? asciidocOptions : undefined
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
  }, [format, inputType, preserveFormatting, extractImages, variableOptions, zendeskOptions, asciidocOptions, inputPath, outputPath, mcpClient])

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
        useTOCStructure,
        generateMasterDoc,
        variableOptions: (format === 'asciidoc' || format === 'markdown') && variableOptions.extractVariables ? variableOptions : undefined,
        zendeskOptions: format === 'zendesk' ? zendeskOptions : undefined,
        asciidocOptions: format === 'asciidoc' ? asciidocOptions : undefined
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
    useTOCStructure, generateMasterDoc, variableOptions, zendeskOptions, asciidocOptions, inputPath, outputPath, mcpClient
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

  const handleDiscoverTOCs = useCallback(async () => {
    setConversionState({ isConverting: true })
    
    try {
      // Clean up paths - remove any escaped spaces
      const cleanInputPath = inputPath.replace(/\\\s/g, ' ')
      
      console.log('Discovering TOCs with cleaned path:', { 
        original: inputPath, 
        cleaned: cleanInputPath 
      })
      
      const result = await mcpClient.discoverTOCs(cleanInputPath)
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
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2">MadCap Converter</h1>
          <p className="text-muted-foreground">
            Convert MadCap Flare documentation to multiple formats with advanced Zendesk integration
          </p>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> HTML paragraphs placed between list items, instead of inside them, may not be converted with perfect fidelity. While most web browsers are designed to display this structure without any visible errors, it is not technically valid HTML. As a result, the converter may not be able to replicate the original formatting perfectly.
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          <img 
            src="/logo.png" 
            alt="MadCap Converter Logo" 
            width="80" 
            height="80" 
            className="drop-shadow-md rounded-lg"
            onError={(e) => {
              // Fallback to a simple placeholder if image not found
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.setAttribute('style', 'display: block;');
            }}
          />
          <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl" style={{display: 'none'}}>
            MC
          </div>
        </div>
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
                      <SelectItem value="madcap">MadCap Flare Unpublished Source</SelectItem>
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
                      Include all subdirectories and their contents during batch conversion
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
                      Maintain the original folder hierarchy in the output directory (vs. flattening all files to one level)
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
                      Copy referenced image files to the output directory and update paths
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
                      Rename output files based on the first H1 heading found in each document (spaces removed, URL-safe)
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

          {/* TOC-based Conversion Options */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                TOC-based Conversion
              </CardTitle>
              <CardDescription>
                Use MadCap Flare TOC hierarchy instead of file structure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="toc-basic">
                  <AccordionTrigger>TOC Structure Settings</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Use TOC Structure
                        </Label>
                        <div className="text-sm text-muted-foreground">
                          Organize output based on MadCap TOC hierarchy instead of original file structure (User Manual, Administration, etc.)
                        </div>
                      </div>
                      <Switch
                        checked={useTOCStructure}
                        onCheckedChange={setUseTOCStructure}
                      />
                    </div>

                    {useTOCStructure && (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="flex items-center gap-2">
                              <FileCode className="w-4 h-4" />
                              Generate Master Document
                            </Label>
                            <div className="text-sm text-muted-foreground">
                              Generate a master index document that combines all discovered TOC structures
                            </div>
                          </div>
                          <Switch
                            checked={generateMasterDoc}
                            onCheckedChange={setGenerateMasterDoc}
                          />
                        </div>

                        {format === 'asciidoc' && asciidocOptions.generateAsBook && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                              <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                              <div>
                                <h4 className="font-medium text-blue-900">Book Generation Active</h4>
                                <p className="text-sm text-blue-700 mt-1">
                                  When both TOC structure and book generation are enabled, the converter will create a complete AsciiDoc book with proper chapter organization based on your MadCap TOC hierarchy.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="toc-advanced">
                  <AccordionTrigger>Advanced TOC Processing</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="text-sm text-muted-foreground mb-4">
                      Configure how the converter processes MadCap TOC files (.fltoc) and resolves dynamic titles.
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium">TOC Title Resolution</Label>
                        <div className="text-xs text-muted-foreground mt-1">
                          When TOC entries use <code>[%=System.LinkedTitle%]</code>, the converter will extract the actual H1 heading from each source file and use it as the chapter title in the generated book structure.
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Chapter Break Detection</Label>
                        <div className="text-xs text-muted-foreground mt-1">
                          The converter detects chapter breaks from TOC attributes like <code>BreakType="chapter"</code> and <code>PageType="firstright"</code> to create proper AsciiDoc book structure.
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Supported TOC Features</Label>
                        <div className="text-xs text-muted-foreground mt-1">
                          • Nested TOC hierarchies with unlimited depth<br/>
                          • Chapter and section numbering<br/>
                          • Cross-references between sections<br/>
                          • Page layout and formatting attributes
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* Variable Extraction Options */}
          {(format === 'asciidoc' || format === 'markdown') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  Variable Extraction Options
                </CardTitle>
                <CardDescription>
                  Extract MadCap variables to separate files instead of flattening to text
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Extract Variables</Label>
                    <div className="text-sm text-muted-foreground">
                      Extract MadCap variables to a separate file and preserve variable references instead of replacing with text
                    </div>
                  </div>
                  <Switch
                    checked={variableOptions.extractVariables || false}
                    onCheckedChange={(checked) => setVariableOptions(prev => ({ 
                      ...prev, 
                      extractVariables: checked 
                    }))}
                  />
                </div>

                {variableOptions.extractVariables && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="variable-format">Variable Format</Label>
                      <Select 
                        value={variableOptions.variableFormat || 'adoc'} 
                        onValueChange={(value: 'adoc' | 'writerside') => setVariableOptions(prev => ({ 
                          ...prev, 
                          variableFormat: value 
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="adoc">
                            <div className="space-y-1">
                              <div>AsciiDoc Attributes</div>
                              <div className="text-xs text-muted-foreground">:variable: value syntax</div>
                            </div>
                          </SelectItem>
                          <SelectItem value="writerside">
                            <div className="space-y-1">
                              <div>Writerside XML</div>
                              <div className="text-xs text-muted-foreground">&lt;var&gt; elements for JetBrains Writerside</div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="variables-output-path">Variables File Path (Optional)</Label>
                      <Input
                        id="variables-output-path"
                        value={variableOptions.variablesOutputPath || ''}
                        onChange={(e) => setVariableOptions(prev => ({ 
                          ...prev, 
                          variablesOutputPath: e.target.value 
                        }))}
                        placeholder="Leave empty for auto-generated path"
                      />
                      <div className="text-xs text-muted-foreground">
                        If empty, will generate: filename-variables.{variableOptions.variableFormat === 'writerside' ? 'xml' : 'adoc'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Preserve Variable Structure</Label>
                        <div className="text-sm text-muted-foreground">
                          Organize variables by their original namespace/variable set structure in the output file
                        </div>
                      </div>
                      <Switch
                        checked={variableOptions.preserveVariableStructure || false}
                        onCheckedChange={(checked) => setVariableOptions(prev => ({ 
                          ...prev, 
                          preserveVariableStructure: checked 
                        }))}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* AsciiDoc Options */}
          {format === 'asciidoc' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  AsciiDoc Options
                </CardTitle>
                <CardDescription>
                  Configure AsciiDoc-specific conversion settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="asciidoc-basic">
                    <AccordionTrigger>Basic AsciiDoc Settings</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Use Collapsible Blocks</Label>
                          <div className="text-sm text-muted-foreground">
                            Convert MadCap dropdowns to AsciiDoc collapsible blocks instead of regular sections
                          </div>
                        </div>
                        <Switch
                          checked={asciidocOptions.useCollapsibleBlocks}
                          onCheckedChange={(checked) => setAsciidocOptions(prev => ({ 
                            ...prev, 
                            useCollapsibleBlocks: checked 
                          }))}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Convert Tiles to Tables</Label>
                          <div className="text-sm text-muted-foreground">
                            Convert MadCap tile/grid layouts to AsciiDoc tables instead of regular content
                          </div>
                        </div>
                        <Switch
                          checked={asciidocOptions.tilesAsTable}
                          onCheckedChange={(checked) => setAsciidocOptions(prev => ({ 
                            ...prev, 
                            tilesAsTable: checked 
                          }))}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="asciidoc-book">
                    <AccordionTrigger>Book Generation Settings</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Generate as Book
                          </Label>
                          <div className="text-sm text-muted-foreground">
                            Create a complete AsciiDoc book with master document, chapters, and proper book structure
                          </div>
                        </div>
                        <Switch
                          checked={asciidocOptions.generateAsBook}
                          onCheckedChange={(checked) => setAsciidocOptions(prev => ({ 
                            ...prev, 
                            generateAsBook: checked 
                          }))}
                        />
                      </div>

                      {asciidocOptions.generateAsBook && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="book-title">Book Title</Label>
                              <Input
                                id="book-title"
                                value={asciidocOptions.bookTitle || ''}
                                onChange={(e) => setAsciidocOptions(prev => ({ 
                                  ...prev, 
                                  bookTitle: e.target.value 
                                }))}
                                placeholder="Enter book title (auto-detected from TOC if empty)"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="book-author">Book Author</Label>
                              <Input
                                id="book-author"
                                value={asciidocOptions.bookAuthor || ''}
                                onChange={(e) => setAsciidocOptions(prev => ({ 
                                  ...prev, 
                                  bookAuthor: e.target.value 
                                }))}
                                placeholder="Enter author name (optional)"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Use LinkedTitle from TOC</Label>
                              <div className="text-sm text-muted-foreground">
                                Extract chapter titles from H1 headings in source files when TOC uses [%=System.LinkedTitle%]
                              </div>
                            </div>
                            <Switch
                              checked={asciidocOptions.useLinkedTitleFromTOC}
                              onCheckedChange={(checked) => setAsciidocOptions(prev => ({ 
                                ...prev, 
                                useLinkedTitleFromTOC: checked 
                              }))}
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Include Chapter Breaks</Label>
                              <div className="text-sm text-muted-foreground">
                                Add AsciiDoc chapter breaks between major sections for proper book formatting
                              </div>
                            </div>
                            <Switch
                              checked={asciidocOptions.includeChapterBreaks}
                              onCheckedChange={(checked) => setAsciidocOptions(prev => ({ 
                                ...prev, 
                                includeChapterBreaks: checked 
                              }))}
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Use Book Doctype</Label>
                              <div className="text-sm text-muted-foreground">
                                Set doctype to 'book' for multi-chapter documents with parts and chapters
                              </div>
                            </div>
                            <Switch
                              checked={asciidocOptions.useBookDoctype}
                              onCheckedChange={(checked) => setAsciidocOptions(prev => ({ 
                                ...prev, 
                                useBookDoctype: checked 
                              }))}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="toc-levels">TOC Levels to Include</Label>
                            <Input
                              id="toc-levels"
                              type="number"
                              min="1"
                              max="6"
                              value={asciidocOptions.includeTOCLevels || 3}
                              onChange={(e) => setAsciidocOptions(prev => ({ 
                                ...prev, 
                                includeTOCLevels: parseInt(e.target.value) || 3 
                              }))}
                            />
                            <div className="text-xs text-muted-foreground">
                              Number of heading levels to include in the book's table of contents (1-6)
                            </div>
                          </div>
                        </>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          )}

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
                            Auto-generate relevant tags based on document content for better searchability
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
                            Remove potentially harmful HTML elements and attributes for security
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
                            Skip video elements during conversion (useful if videos need manual handling)
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
                            Include CSS styles directly in HTML elements instead of using classes
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
                            Generate a separate CSS file with all styles (for external linking)
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

            <Button 
              variant="outline"
              onClick={handleDiscoverTOCs}
              disabled={conversionState.isConverting}
              className="flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Discover TOCs
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
                      <SelectItem value="madcap">MadCap Flare Unpublished Source</SelectItem>
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

          {/* Variable Extraction Options for Single File */}
          {(format === 'asciidoc' || format === 'markdown') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  Variable Extraction Options
                </CardTitle>
                <CardDescription>
                  Extract MadCap variables to separate files instead of flattening to text
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Extract Variables</Label>
                    <div className="text-sm text-muted-foreground">
                      Save variables to separate file with references in content
                    </div>
                  </div>
                  <Switch
                    checked={variableOptions.extractVariables || false}
                    onCheckedChange={(checked) => setVariableOptions(prev => ({ 
                      ...prev, 
                      extractVariables: checked 
                    }))}
                  />
                </div>

                {variableOptions.extractVariables && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="file-variable-format">Variable Format</Label>
                      <Select 
                        value={variableOptions.variableFormat || 'adoc'} 
                        onValueChange={(value: 'adoc' | 'writerside') => setVariableOptions(prev => ({ 
                          ...prev, 
                          variableFormat: value 
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="adoc">
                            <div className="space-y-1">
                              <div>AsciiDoc Attributes</div>
                              <div className="text-xs text-muted-foreground">:variable: value syntax</div>
                            </div>
                          </SelectItem>
                          <SelectItem value="writerside">
                            <div className="space-y-1">
                              <div>Writerside XML</div>
                              <div className="text-xs text-muted-foreground">&lt;var&gt; elements for JetBrains Writerside</div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="file-variables-output-path">Variables File Path (Optional)</Label>
                      <Input
                        id="file-variables-output-path"
                        value={variableOptions.variablesOutputPath || ''}
                        onChange={(e) => setVariableOptions(prev => ({ 
                          ...prev, 
                          variablesOutputPath: e.target.value 
                        }))}
                        placeholder="Leave empty for auto-generated path"
                      />
                      <div className="text-xs text-muted-foreground">
                        If empty, will generate: filename-variables.{variableOptions.variableFormat === 'writerside' ? 'xml' : 'adoc'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Preserve Variable Structure</Label>
                        <div className="text-sm text-muted-foreground">
                          Organize variables by their original namespace/variable set structure in the output file
                        </div>
                      </div>
                      <Switch
                        checked={variableOptions.preserveVariableStructure || false}
                        onCheckedChange={(checked) => setVariableOptions(prev => ({ 
                          ...prev, 
                          preserveVariableStructure: checked 
                        }))}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* AsciiDoc Options for Single File */}
          {format === 'asciidoc' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  AsciiDoc Options
                </CardTitle>
                <CardDescription>
                  Configure AsciiDoc-specific conversion settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Use Collapsible Blocks</Label>
                    <div className="text-sm text-muted-foreground">
                      Convert MadCap dropdowns to AsciiDoc collapsible blocks instead of regular sections
                    </div>
                  </div>
                  <Switch
                    checked={asciidocOptions.useCollapsibleBlocks}
                    onCheckedChange={(checked) => setAsciidocOptions(prev => ({ 
                      ...prev, 
                      useCollapsibleBlocks: checked 
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Convert Tiles to Tables</Label>
                    <div className="text-sm text-muted-foreground">
                      Convert MadCap tile/grid layouts to AsciiDoc tables instead of regular content
                    </div>
                  </div>
                  <Switch
                    checked={asciidocOptions.tilesAsTable}
                    onCheckedChange={(checked) => setAsciidocOptions(prev => ({ 
                      ...prev, 
                      tilesAsTable: checked 
                    }))}
                  />
                </div>
              </CardContent>
            </Card>
          )}

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
                            Auto-generate relevant tags based on document content for better searchability
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
                            Remove potentially harmful HTML elements and attributes for security
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
                            Skip video elements during conversion (useful if videos need manual handling)
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
                            Include CSS styles directly in HTML elements instead of using classes
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
                            Generate a separate CSS file with all styles (for external linking)
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
              {conversionState.error || 
                (conversionState.result?.content?.[0]?.text || 
                 JSON.stringify(conversionState.result, null, 2))}
            </pre>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
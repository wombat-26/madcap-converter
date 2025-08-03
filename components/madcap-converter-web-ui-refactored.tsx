"use client"

import React, { useState, useCallback, useEffect } from 'react'
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
  Settings, 
  Play, 
  Download,
  FileCode,
  Globe,
  Palette,
  Tag,
  Shield,
  AlertTriangle,
} from 'lucide-react'
import Image from 'next/image'
import { ThemeToggle } from '@/components/theme-toggle'
import { FileUploadZone } from '@/components/FileUploadZone'
import { ProgressTracker } from '@/components/ProgressTracker'
import { AsciidocOptions } from '@/components/options/AsciidocOptions'
import { MarkdownOptions } from '@/components/options/MarkdownOptions'
import { ZendeskOptions } from '@/components/options/ZendeskOptions'
import { VariableOptions } from '@/components/options/VariableOptions'
import { useConversionStore } from '@/stores/useConversionStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useNotificationStore } from '@/stores/useNotificationStore'
import JSZip from 'jszip'

export default function MadCapConverterWebUI() {
  const [activeTab, setActiveTab] = useState('batch')
  const [outputFolderName, setOutputFolderName] = useState('converted-madcap-project')
  const [supportsFileSystemAccess, setSupportsFileSystemAccess] = useState(false)
  const [selectedOutputDir, setSelectedOutputDir] = useState<FileSystemDirectoryHandle | null>(null)
  
  // Zustand stores
  const {
    format,
    setFormat,
    options,
    updateOptions,
    updateAsciidocOptions,
    updateMarkdownOptions,
    updateZendeskOptions,
    updateVariableOptions,
    files,
    setFiles,
    addFiles,
    clearFiles,
    isProcessing,
    sessionId,
    setProcessingState,
  } = useConversionStore()
  
  const { preferences, toggleAdvancedOptions } = useSettingsStore()
  const { success, error: showError, warning, info } = useNotificationStore()
  
  // Single file state (for single file tab)
  const [singleFile, setSingleFile] = useState<File[]>([])
  
  // Text input state (for text tab)
  const [inputText, setInputText] = useState('')
  
  // Batch options
  const [preserveStructure, setPreserveStructure] = useState(true)
  const [renameFiles, setRenameFiles] = useState(true)
  const [copyImages, setCopyImages] = useState(true)
  const [recursive, setRecursive] = useState(true)

  useEffect(() => {
    setSupportsFileSystemAccess('showDirectoryPicker' in window)
  }, [])

  const handleSelectOutputDirectory = async () => {
    if (!supportsFileSystemAccess) {
      return
    }
    
    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      })
      setSelectedOutputDir(dirHandle)
      info('Output directory selected', `Files will be saved to: ${dirHandle.name}`)
    } catch (err) {
      if ((err as any).name !== 'AbortError') {
        showError('Failed to select directory', 'Please try again or download as ZIP instead.')
      }
    }
  }

  const convertSingleFile = async () => {
    if (!singleFile[0]) {
      warning('No file selected', 'Please select a file to convert.')
      return
    }

    const formData = new FormData()
    formData.append('file', singleFile[0])
    formData.append('format', format)
    formData.append('options', JSON.stringify(options))

    try {
      const response = await fetch('/api/convert-file', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Conversion failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${singleFile[0].name.replace(/\.[^/.]+$/, '')}.${getFileExtension(format)}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      success('Conversion successful', `${singleFile[0].name} has been converted successfully.`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      showError('Conversion failed', errorMessage)
    }
  }

  const convertText = async () => {
    if (!inputText.trim()) {
      warning('No text entered', 'Please enter some text to convert.')
      return
    }

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: inputText,
          format,
          options,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Conversion failed')
      }

      const data = await response.json()
      
      // Download converted content
      const blob = new Blob([data.content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `converted.${getFileExtension(format)}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      success('Conversion successful', 'Your text has been converted successfully.')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      showError('Conversion failed', errorMessage)
    }
  }

  const convertBatchFiles = async () => {
    if (files.length === 0) {
      warning('No files selected', 'Please select files to convert.')
      return
    }

    try {
      // Create a progress session with accurate file count
      const sessionResponse = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalFiles: files.length })
      })

      if (!sessionResponse.ok) {
        throw new Error('Failed to create progress session')
      }

      const { sessionId: newSessionId } = await sessionResponse.json()
      
      // Update store with session ID and processing state
      setProcessingState({
        isProcessing: true,
        sessionId: newSessionId,
        currentFile: null,
        uploadProgress: 0
      })
      
      // Small delay to ensure session is ready for SSE connection
      await new Promise(resolve => setTimeout(resolve, 100))

      info('Starting conversion', `Converting ${files.length} files...`)

      const formData = new FormData()
      files.forEach(file => formData.append('files', file))
      formData.append('format', format)
      formData.append('sessionId', newSessionId) // Pass session ID to API
      formData.append('options', JSON.stringify({
        ...options,
        preserveStructure,
        renameFiles,
        copyImages,
        recursive,
      }))

      const response = await fetch('/api/batch-convert', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Batch conversion failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${outputFolderName}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Note: Success will be handled by the progress stream completion event
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      showError('Batch conversion failed', errorMessage)
      
      // Reset processing state on error
      setProcessingState({
        isProcessing: false,
        sessionId: null,
        currentFile: null,
        uploadProgress: 0,
        completedFiles: 0
      })
    }
  }

  const getFileExtension = (format: string): string => {
    switch (format) {
      case 'asciidoc':
        return 'adoc'
      case 'writerside-markdown':
        return 'md'
      case 'zendesk':
        return 'html'
      default:
        return 'txt'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto p-6 max-w-7xl">
        <header className="mb-8 text-center">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Image 
                src="/images/logo.png" 
                alt="MadCap Converter Logo" 
                width={40} 
                height={40}
                className="rounded-lg"
              />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                MadCap Converter
              </h1>
            </div>
            <ThemeToggle />
          </div>
          <p className="text-muted-foreground text-lg">
            Convert MadCap Flare files to multiple formats with advanced processing
          </p>
        </header>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Output Format</CardTitle>
              <CardDescription>Select the target format for conversion</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={format} onValueChange={(value: any) => setFormat(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asciidoc">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>AsciiDoc</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="writerside-markdown">
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4" />
                      <span>Writerside Markdown</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="zendesk">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span>Zendesk HTML</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="single">Single File</TabsTrigger>
              <TabsTrigger value="batch">Batch Conversion</TabsTrigger>
              <TabsTrigger value="text">Text Input</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-4">
              <FileUploadZone
                title="Single File Conversion"
                description="Convert a single HTML, HTM, DOCX, or MadCap file"
                files={singleFile}
                onFilesChange={setSingleFile}
                accept=".html,.htm,.docx,.doc,.flsnp"
                hint="Supported: HTML, HTM, DOCX, DOC, FLSNP"
              />
              
              <div className="flex justify-end">
                <Button 
                  size="lg" 
                  onClick={convertSingleFile}
                  disabled={singleFile.length === 0 || isProcessing}
                  className="min-w-[200px]"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Convert File
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="batch" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Batch Options</CardTitle>
                  <CardDescription>Configure how files are processed</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="preserve-structure"
                        checked={preserveStructure}
                        onCheckedChange={setPreserveStructure}
                      />
                      <Label htmlFor="preserve-structure">Preserve folder structure</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="rename-files"
                        checked={renameFiles}
                        onCheckedChange={setRenameFiles}
                      />
                      <Label htmlFor="rename-files">Rename files (remove spaces)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="copy-images"
                        checked={copyImages}
                        onCheckedChange={setCopyImages}
                      />
                      <Label htmlFor="copy-images">Copy images</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="recursive"
                        checked={recursive}
                        onCheckedChange={setRecursive}
                      />
                      <Label htmlFor="recursive">Include subfolders</Label>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="output-folder">Output folder name</Label>
                    <Input
                      id="output-folder"
                      value={outputFolderName}
                      onChange={(e) => setOutputFolderName(e.target.value)}
                      placeholder="converted-madcap-project"
                    />
                  </div>
                </CardContent>
              </Card>

              <FileUploadZone
                title="Batch File Conversion"
                description="Convert multiple files or entire folders"
                files={files}
                onFilesChange={setFiles}
                multiple
                isFolder
                accept=".html,.htm,.docx,.doc,.flsnp"
                hint="Select entire MadCap project folder or multiple files"
              />
              
              <div className="flex justify-end">
                <Button 
                  size="lg" 
                  onClick={convertBatchFiles}
                  disabled={files.length === 0 || isProcessing}
                  className="min-w-[200px]"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Convert Batch
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="text" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Text Input</CardTitle>
                  <CardDescription>Paste HTML or text content to convert</CardDescription>
                </CardHeader>
                <CardContent>
                  <textarea
                    className="w-full h-64 p-3 border rounded-md bg-background resize-y"
                    placeholder="Paste your HTML or text content here..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                </CardContent>
              </Card>
              
              <div className="flex justify-end">
                <Button 
                  size="lg" 
                  onClick={convertText}
                  disabled={!inputText.trim() || isProcessing}
                  className="min-w-[200px]"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Convert Text
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {preferences.showAdvancedOptions && (
            <Card>
              <CardHeader>
                <CardTitle>Advanced Options</CardTitle>
                <CardDescription>Fine-tune conversion settings</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="general">
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        General Options
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="preserve-formatting"
                            checked={options.preserveFormatting}
                            onCheckedChange={(checked) => updateOptions({ preserveFormatting: checked })}
                          />
                          <Label htmlFor="preserve-formatting">Preserve formatting</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="include-metadata"
                            checked={options.includeMetadata}
                            onCheckedChange={(checked) => updateOptions({ includeMetadata: checked })}
                          />
                          <Label htmlFor="include-metadata">Include metadata</Label>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  
                  <VariableOptions />
                  
                  {format === 'asciidoc' && <AsciidocOptions />}
                  {format === 'writerside-markdown' && <MarkdownOptions />}
                  {format === 'zendesk' && <ZendeskOptions />}
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* Progress Tracker */}
          {sessionId && isProcessing && (
            <ProgressTracker
              sessionId={sessionId}
              mode="detailed"
              showFileList={true}
              showStatistics={true}
              showConnectionStatus={true}
              onComplete={() => {
                success('Conversion completed', 'All files have been processed successfully!')
                setProcessingState({
                  isProcessing: false,
                  sessionId: null,
                  currentFile: null,
                  uploadProgress: 100,
                  completedFiles: files.length
                })
              }}
              onError={(error) => {
                showError('Conversion error', error)
                // Clear session on error to prevent reconnection attempts
                setProcessingState({
                  isProcessing: false,
                  sessionId: null,
                  currentFile: null,
                  uploadProgress: 0,
                  completedFiles: 0
                })
              }}
            />
          )}

          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={toggleAdvancedOptions}
              className="min-w-[200px]"
            >
              {preferences.showAdvancedOptions ? 'Hide' : 'Show'} Advanced Options
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
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
  X,
} from 'lucide-react'
import Image from 'next/image'
import { ThemeToggle } from '@/components/theme-toggle'
import { FileUploadZone } from '@/components/FileUploadZone'
import { ProgressTracker } from '@/components/ProgressTracker'
import { AsciidocOptions } from '@/components/options/AsciidocOptions'
import { MarkdownOptions } from '@/components/options/MarkdownOptions'
import { ZendeskOptions } from '@/components/options/ZendeskOptions'
import { VariableOptions } from '@/components/options/VariableOptions'
import { GlossaryOptions } from '@/components/options/GlossaryOptions'
import { useConversionStore } from '@/stores/useConversionStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useNotificationStore } from '@/stores/useNotificationStore'
import { ConditionSelectionModal } from '@/components/ConditionSelectionModal'
import JSZip from 'jszip'

export default function MadCapConverterWebUI() {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev'
  const [activeTab, setActiveTab] = useState('batch')
  const [outputFolderName, setOutputFolderName] = useState('converted-madcap-project')
  const [supportsFileSystemAccess, setSupportsFileSystemAccess] = useState(false)
  const [selectedOutputDir, setSelectedOutputDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [showPrototypeNotice, setShowPrototypeNotice] = useState(true)
  
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
    updateGlossaryOptions,
    files,
    setFiles,
    addFiles,
    clearFiles,
    isProcessing,
    sessionId,
    setProcessingState,
    // Condition-related state
    conditionAnalysisResult,
    showConditionModal,
    isAnalyzingConditions,
    selectedExcludeConditions,
    selectedIncludeConditions,
    setShowConditionModal,
    setSelectedConditions,
    analyzeConditions,
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
  // Preflight warnings modal state
  const [preflightWarnings, setPreflightWarnings] = useState<string[]>([])
  const [showPreflightModal, setShowPreflightModal] = useState(false)

  useEffect(() => {
    setSupportsFileSystemAccess('showDirectoryPicker' in window)
    try {
      const dismissedVersion = localStorage.getItem('prototypeNoticeDismissedVersion')
      const legacyDismissed = localStorage.getItem('prototypeNoticeDismissed')

      if (dismissedVersion === appVersion) {
        setShowPrototypeNotice(false)
      } else if (!dismissedVersion && legacyDismissed === 'true') {
        // Migrate legacy boolean dismissal to current version
        localStorage.setItem('prototypeNoticeDismissedVersion', appVersion)
        setShowPrototypeNotice(false)
      } else {
        setShowPrototypeNotice(true)
      }
    } catch {}
  }, [appVersion])

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
      // Create a progress session with accurate file count - with enhanced retry logic
      let sessionResponse: Response | undefined;
      let retryCount = 0;
      const maxRetries = 5; // Increased from 3 to 5
      let lastError: Error | null = null;
      let lastStatusCode: number | null = null;
      
      console.log(`🔄 Starting session creation with ${maxRetries} max retries for ${files.length} files`);
      
      while (retryCount < maxRetries) {
        try {
          console.log(`🔄 Session creation attempt ${retryCount + 1}/${maxRetries}`);
          
          sessionResponse = await fetch('/api/progress', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'MadCapConverter/1.1.0'
            },
            body: JSON.stringify({ totalFiles: files.length })
          })
          
          lastStatusCode = sessionResponse.status;
          
          if (sessionResponse.ok) {
            console.log(`✅ Session creation succeeded on attempt ${retryCount + 1}`);
            break;
          }
          
          // Try to get error details from response
          let errorDetails = '';
          try {
            const errorText = await sessionResponse.text();
            errorDetails = errorText || `HTTP ${sessionResponse.status}`;
          } catch (textError) {
            errorDetails = `HTTP ${sessionResponse.status} (could not read error details)`;
          }
          
          console.warn(`⚠️ Session creation failed (attempt ${retryCount + 1}/${maxRetries}):`, {
            status: sessionResponse.status,
            statusText: sessionResponse.statusText,
            errorDetails,
            headers: Object.fromEntries(sessionResponse.headers.entries())
          });
          
          lastError = new Error(`HTTP ${sessionResponse.status}: ${errorDetails}`);
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`❌ Session creation error (attempt ${retryCount + 1}/${maxRetries}):`, {
            error: lastError.message,
            stack: lastError.stack,
            name: lastError.name
          });
        }
        
        retryCount++;
        
        if (retryCount < maxRetries) {
          // Progressive backoff: 1s, 2s, 4s, 8s
          const delayMs = Math.min(1000 * Math.pow(2, retryCount - 1), 8000);
          console.log(`⏳ Waiting ${delayMs}ms before retry ${retryCount + 1}...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      if (!sessionResponse || !sessionResponse.ok) {
        const errorMessage = lastError 
          ? `${lastError.message}` 
          : `HTTP ${lastStatusCode || 'unknown'} after ${maxRetries} attempts`;
          
        console.error('❌ All session creation attempts failed:', {
          attempts: maxRetries,
          lastError: lastError?.message,
          lastStatusCode,
          totalFiles: files.length
        });
        
        throw new Error(`Failed to create progress session: ${errorMessage}`);
      }

      const { sessionId: newSessionId } = await sessionResponse.json()
      console.log(`Progress session created successfully: ${newSessionId}`);
      
      // Update store with session ID and processing state
      setProcessingState({
        isProcessing: true,
        sessionId: newSessionId,
        currentFile: null,
        uploadProgress: 0
      })
      
      // No artificial delay needed - SessionReadyManager handles synchronization

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
        excludeConditions: selectedExcludeConditions,
        includeConditions: selectedIncludeConditions,
      }))

      const response = await fetch('/api/batch-convert', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Batch conversion failed')
      }

      // Check for preflight warnings in headers
      const resourceStatusHeader = response.headers.get('X-Resource-Status')
      if (resourceStatusHeader) {
        try {
          const resourceStatus = JSON.parse(resourceStatusHeader)
          if (resourceStatus.preflightWarnings && resourceStatus.preflightWarnings.length > 0) {
            console.log('⚠️ Preflight warnings detected:', resourceStatus.preflightWarnings)
            
            // Persist warnings and show high-visibility modal
            setPreflightWarnings(resourceStatus.preflightWarnings)
            setShowPreflightModal(true)
            // Also show a compact toast
            info(`Preflight: ${resourceStatus.preflightWarnings.length} notice(s)`, 'Click to view details in the modal.')
            
            // Log individual warnings
            resourceStatus.preflightWarnings.forEach((warning: string, index: number) => {
              console.log(`⚠️ Warning ${index + 1}: ${warning}`)
            })
          }
        } catch (error) {
          console.warn('Failed to parse resource status header:', error)
        }
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

  // Check if files contain MadCap content and trigger condition analysis
  const handleBatchFilesChange = async (newFiles: File[]) => {
    console.log('handleBatchFilesChange called with', newFiles.length, 'files')
    setFiles(newFiles)
    
    if (newFiles.length === 0) {
      return
    }
    
    // Debug: Log file details
    console.log('Files:', newFiles.map(f => ({ name: f.name, type: f.type, size: f.size })))
    
    // Check if any files are MadCap files (HTML/HTM with MadCap content)
    const madCapFiles = newFiles.filter(file => {
      const hasValidExtension = file.name.endsWith('.html') || file.name.endsWith('.htm') || file.name.endsWith('.flsnp')
      const hasValidType = !file.type || file.type === '' || file.type.includes('text/html') || file.type.includes('text/plain')
      console.log(`File ${file.name}: extension=${hasValidExtension}, type="${file.type}", validType=${hasValidType}`)
      return hasValidExtension && hasValidType
    })
    
    console.log('MadCap files found:', madCapFiles.length)
    
    if (madCapFiles.length > 0) {
      info('MadCap files detected', `Analyzing ${madCapFiles.length} files for conditions...`)
      
      // Trigger condition analysis
      try {
        console.log('Calling analyzeConditions...')
        await analyzeConditions()
        console.log('analyzeConditions completed')
      } catch (error) {
        console.error('Failed to analyze conditions:', error)
        showError('Analysis failed', 'Could not analyze MadCap conditions')
      }
    } else {
      console.log('No MadCap files detected in the upload')
    }
  }

  // Handle condition modal confirmation
  const handleConditionSelection = (conditions: { excludeConditions: string[], includeConditions: string[] }) => {
    setSelectedConditions(conditions)
    setShowConditionModal(false)
    
    if (conditions.excludeConditions.length > 0 || conditions.includeConditions.length > 0) {
      success(
        'Conditions selected',
        `Excluding ${conditions.excludeConditions.length} and including ${conditions.includeConditions.length} conditions`
      )
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
          {/* Prototype platform support notice */}
          {showPrototypeNotice && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-yellow-900 shadow-sm"
            >
              <AlertTriangle className="h-5 w-5 mt-0.5 text-yellow-600" aria-hidden="true" />
              <div className="text-sm">
                <strong>Early prototype:</strong> Only working and tested with macOS and Linux file paths. Windows paths are not yet supported/verified.
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-yellow-800 hover:text-yellow-900 hover:bg-yellow-100"
                aria-label="Dismiss notice"
                onClick={() => {
                  setShowPrototypeNotice(false)
                  try {
                    localStorage.setItem('prototypeNoticeDismissedVersion', appVersion)
                    localStorage.removeItem('prototypeNoticeDismissed')
                  } catch {}
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

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
                onFilesChange={handleBatchFilesChange}
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
                  <GlossaryOptions />
                  
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

        {/* MadCap Condition Selection Modal */}
        <ConditionSelectionModal
          isOpen={showConditionModal}
          onClose={() => setShowConditionModal(false)}
          onConfirm={handleConditionSelection}
          analysisResult={conditionAnalysisResult}
          isLoading={isAnalyzingConditions}
        />
      </div>

      {/* Preflight Warnings Modal */}
      <Dialog open={showPreflightModal} onOpenChange={setShowPreflightModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Preflight warnings detected
            </DialogTitle>
            <DialogDescription>
              Some expected MadCap resources were not found in your upload. This can result in empty glossary or variables.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {preflightWarnings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No details available.</p>
            ) : (
              <ul className="list-disc pl-6 space-y-2">
                {preflightWarnings.map((w, i) => (
                  <li key={i} className="text-sm">{w}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 text-sm">
            <p className="font-medium mb-1">How to fix</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Upload your full Flare project, including <code>Project/Glossaries/*.flglo</code> and <code>Project/VariableSets/*.flvar</code>.</li>
              <li>Alternatively set <code>asciidocOptions.glossaryOptions.glossaryPath</code> and <code>variableOptions.flvarFiles</code> explicitly.</li>
            </ul>
            <div className="mt-3 flex gap-3">
              <a
                className="text-blue-600 hover:underline text-sm"
                href="https://github.com/wombat-26/madcap-converter#multiple-output-formats"
                target="_blank" rel="noreferrer"
              >
                Docs: Glossary generation
              </a>
              <a
                className="text-blue-600 hover:underline text-sm"
                href="https://github.com/wombat-26/madcap-converter#advanced-processing-capabilities"
                target="_blank" rel="noreferrer"
              >
                Docs: Variable extraction
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

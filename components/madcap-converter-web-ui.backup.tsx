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
  RefreshCw,
  Upload,
  FolderOpen,
  AlertTriangle,
  X,
  CheckCircle,
  XCircle
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import JSZip from 'jszip'

interface ConversionState {
  isConverting: boolean
  progress?: number
  result?: any
  error?: string
  currentFile?: string
  progressMessage?: string
  conversionSummary?: {
    totalFiles: number
    convertedFiles: number
    skippedFiles: number
    skippedFilesList?: Array<{ file: string; reason: string }>
    errors: number
    errorDetails?: Array<{ file: string; error: string; stack?: string }>
  }
}

interface NotificationState {
  id: string
  type: 'warning' | 'error' | 'info' | 'success'
  title: string
  message: string
  autoHide?: boolean
  duration?: number
}

interface Format {
  name: string
  label: string
  description: string
  extensions: string[]
}

interface ConversionOptions {
  format: 'asciidoc' | 'writerside-markdown' | 'zendesk'
  preserveFormatting?: boolean
  extractImages?: boolean
  rewriteLinks?: boolean
  variableOptions?: {
    extractVariables?: boolean
    variableMode?: 'flatten' | 'include' | 'reference'
    variableFormat?: 'adoc' | 'writerside'
    autoDiscoverFLVAR?: boolean
    multiProjectSupport?: boolean
    smartProjectDetection?: boolean
    fallbackStrategy?: 'error' | 'warning' | 'ignore'
    nameConvention?: 'camelCase' | 'snake_case' | 'kebab-case' | 'PascalCase'
    variablePrefix?: string
    instanceName?: string
    includePatterns?: string[]
    excludePatterns?: string[]
    flvarFiles?: string[]
  }
  zendeskOptions?: {
    sectionId?: string
    locale?: string
    permissionGroupId?: string
    userSegmentId?: string
    visibility?: 'public' | 'internal' | 'staff'
    removeConditions?: boolean
    conditionHandling?: 'exclude' | 'include' | 'convert'
    preserveMadCapFeatures?: boolean
    mappingFile?: string
    apiCredentials?: {
      subdomain?: string
      email?: string
      apiToken?: string
    }
  }
  asciidocOptions?: {
    enableValidation?: boolean
    validationStrictness?: 'strict' | 'normal' | 'lenient'
    autoColumnWidths?: boolean
    preserveTableFormatting?: boolean
    tableFrame?: 'all' | 'topbot' | 'sides' | 'none'
    tableGrid?: 'all' | 'rows' | 'cols' | 'none'
    enableSmartPathResolution?: boolean
    validateImagePaths?: boolean
    glossaryOptions?: {
      includeGlossary?: boolean
      glossaryFormat?: 'separate' | 'book-appendix'
      sortGlossary?: boolean
      generateAnchors?: boolean
      formatDefinitions?: boolean
    }
  }
}

export default function MadCapConverterWebUI() {
  const [activeTab, setActiveTab] = useState('batch')
  const [singleFile, setSingleFile] = useState<File | null>(null)
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [inputText, setInputText] = useState('')
  const [folderUploadMode, setFolderUploadMode] = useState(true)
  const [outputFormat, setOutputFormat] = useState<'asciidoc' | 'writerside-markdown' | 'zendesk'>('asciidoc')
  const [formats, setFormats] = useState<Format[]>([])
  const [conversionState, setConversionState] = useState<ConversionState>({ isConverting: false })
  const [notifications, setNotifications] = useState<NotificationState[]>([])
  
  // Options state
  const [preserveFormatting, setPreserveFormatting] = useState(true)
  const [extractImages, setExtractImages] = useState(true)
  const [rewriteLinks, setRewriteLinks] = useState(false)
  
  // Variable options
  const [extractVariables, setExtractVariables] = useState(true)
  const [variableMode, setVariableMode] = useState<'flatten' | 'include' | 'reference'>('include')
  const [variableFormat, setVariableFormat] = useState<'adoc' | 'writerside'>('adoc')
  const [autoDiscoverFLVAR, setAutoDiscoverFLVAR] = useState(true)
  
  // Zendesk options
  const [zendeskSectionId, setZendeskSectionId] = useState('')
  const [zendeskLocale, setZendeskLocale] = useState('en-us')
  const [removeConditions, setRemoveConditions] = useState(true)
  
  // AsciiDoc options
  const [enableValidation, setEnableValidation] = useState(true)
  const [validationStrictness, setValidationStrictness] = useState<'strict' | 'normal' | 'lenient'>('normal')
  const [includeGlossary, setIncludeGlossary] = useState(true)
  const [glossaryFormat, setGlossaryFormat] = useState<'separate' | 'book-appendix'>('separate')
  
  // Batch conversion options
  const [preserveStructure, setPreserveStructure] = useState(true)
  const [renameFiles, setRenameFiles] = useState(true)
  const [copyImages, setCopyImages] = useState(true)
  const [recursive, setRecursive] = useState(true)
  const [outputFolderName, setOutputFolderName] = useState('converted-madcap-project')
  const [supportsFileSystemAccess, setSupportsFileSystemAccess] = useState(false)
  const [selectedOutputDir, setSelectedOutputDir] = useState<FileSystemDirectoryHandle | null>(null)

  useEffect(() => {
    // Fetch available formats
    fetch('/api/formats')
      .then(res => res.json())
      .then(data => setFormats(data.formats))
      .catch(err => console.error('Failed to fetch formats:', err))
    
    // Check for File System Access API support
    setSupportsFileSystemAccess('showDirectoryPicker' in window)
  }, [])

  const addNotification = useCallback((notification: Omit<NotificationState, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newNotification = { ...notification, id }
    setNotifications(prev => [...prev, newNotification])
    
    if (notification.autoHide !== false) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }, notification.duration || 5000)
    }
  }, [])

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const buildOptions = useCallback((): ConversionOptions & { preserveStructure?: boolean; renameFiles?: boolean; copyImages?: boolean; recursive?: boolean } => {
    const options: ConversionOptions & { preserveStructure?: boolean; renameFiles?: boolean; copyImages?: boolean; recursive?: boolean } = {
      format: outputFormat,
      preserveFormatting,
      extractImages,
      rewriteLinks,
      // Batch conversion options
      preserveStructure,
      renameFiles,
      copyImages,
      recursive,
    }

    if (extractVariables || outputFormat === 'writerside-markdown') {
      options.variableOptions = {
        extractVariables,
        variableMode,
        variableFormat,
        autoDiscoverFLVAR,
        multiProjectSupport: true,
        smartProjectDetection: true,
        fallbackStrategy: 'warning',
        nameConvention: 'snake_case',
      }
    }

    if (outputFormat === 'zendesk') {
      options.zendeskOptions = {
        sectionId: zendeskSectionId || undefined,
        locale: zendeskLocale,
        removeConditions,
        conditionHandling: removeConditions ? 'exclude' : 'convert',
        preserveMadCapFeatures: true,
      }
    }

    if (outputFormat === 'asciidoc') {
      options.asciidocOptions = {
        enableValidation,
        validationStrictness,
        autoColumnWidths: true,
        preserveTableFormatting: true,
        tableFrame: 'all',
        tableGrid: 'all',
        enableSmartPathResolution: true,
        validateImagePaths: true,
        glossaryOptions: includeGlossary ? {
          includeGlossary,
          glossaryFormat,
          sortGlossary: true,
          generateAnchors: true,
          formatDefinitions: true,
        } : undefined,
      }
    }

    return options
  }, [
    outputFormat, preserveFormatting, extractImages, rewriteLinks,
    extractVariables, variableMode, variableFormat, autoDiscoverFLVAR,
    zendeskSectionId, zendeskLocale, removeConditions,
    enableValidation, validationStrictness, includeGlossary, glossaryFormat,
    preserveStructure, renameFiles, copyImages, recursive
  ])

  const handleTextConversion = async () => {
    if (!inputText.trim()) {
      addNotification({
        type: 'error',
        title: 'No input provided',
        message: 'Please enter some text to convert',
      })
      return
    }

    setConversionState({ isConverting: true })

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: inputText,
          inputType: 'html',
          format: outputFormat,
          options: buildOptions(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Conversion failed')
      }

      setConversionState({ 
        isConverting: false, 
        result: data 
      })

      // Download the result
      const blob = new Blob([data.content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `converted.${getExtensionForFormat(outputFormat)}`
      a.click()
      URL.revokeObjectURL(url)

      addNotification({
        type: 'success',
        title: 'Conversion successful',
        message: 'Your file has been downloaded',
      })
    } catch (error) {
      setConversionState({ 
        isConverting: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
      
      addNotification({
        type: 'error',
        title: 'Conversion failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  const handleSingleFileConversion = async () => {
    if (!singleFile) {
      addNotification({
        type: 'error',
        title: 'No file selected',
        message: 'Please select a file to convert',
      })
      return
    }

    setConversionState({ isConverting: true })

    try {
      const formData = new FormData()
      formData.append('file', singleFile)
      formData.append('format', outputFormat)
      formData.append('options', JSON.stringify(buildOptions()))

      const response = await fetch('/api/convert-file', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Conversion failed')
      }

      setConversionState({ 
        isConverting: false, 
        result: data 
      })

      // Download the result
      const blob = new Blob([data.content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.filename || `converted.${getExtensionForFormat(outputFormat)}`
      a.click()
      URL.revokeObjectURL(url)

      // Download variables file if present
      if (data.variablesFile) {
        const varBlob = new Blob([data.variablesFile], { type: 'text/plain' })
        const varUrl = URL.createObjectURL(varBlob)
        const varA = document.createElement('a')
        varA.href = varUrl
        varA.download = `variables.${variableFormat === 'adoc' ? 'adoc' : 'list'}`
        varA.click()
        URL.revokeObjectURL(varUrl)
      }

      // Download glossary file if present
      if (data.glossaryContent) {
        const glossBlob = new Blob([data.glossaryContent], { type: 'text/plain' })
        const glossUrl = URL.createObjectURL(glossBlob)
        const glossA = document.createElement('a')
        glossA.href = glossUrl
        glossA.download = 'glossary.adoc'
        glossA.click()
        URL.revokeObjectURL(glossUrl)
      }

      addNotification({
        type: 'success',
        title: 'Conversion successful',
        message: 'Your file has been downloaded',
      })
    } catch (error) {
      setConversionState({ 
        isConverting: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
      
      addNotification({
        type: 'error',
        title: 'Conversion failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  }

  const writeFilesToDirectory = async (dirHandle: FileSystemDirectoryHandle, files: { path: string; content: string }[]) => {
    const projectDirHandle = await dirHandle.getDirectoryHandle(outputFolderName, { create: true })
    
    for (const file of files) {
      const pathParts = file.path.split('/')
      let currentDir = projectDirHandle
      
      // Create subdirectories
      for (let i = 0; i < pathParts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(pathParts[i], { create: true })
      }
      
      // Write file
      const fileName = pathParts[pathParts.length - 1]
      const fileHandle = await currentDir.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(file.content)
      await writable.close()
    }
  }

  const handleBatchConversion = async () => {
    if (batchFiles.length === 0) {
      addNotification({
        type: 'error',
        title: 'No files selected',
        message: 'Please select files to convert',
      })
      return
    }

    // Final validation before conversion (in case files were added programmatically)
    const validation = validateFiles(batchFiles)
    if (!validation.valid) {
      addNotification({
        type: 'error',
        title: 'Pre-conversion validation failed',
        message: `Files exceed system limits before conversion:\n\n${validation.errors.join('\n\n')}\n\nThe system is designed for large MadCap projects. Please check for corrupted or unusually large files.`,
        duration: 10000,
      })
      return
    }

    setConversionState({ isConverting: true, progress: 0 })

    try {
      const totalSize = batchFiles.reduce((acc, f) => acc + f.size, 0);
      // Use chunked upload for very large projects to optimize network transmission
      let shouldUseChunkedUpload = batchFiles.length > CHUNK_SIZE || totalSize > CHUNK_SIZE_BYTES;
      
      if (shouldUseChunkedUpload) {
        console.log(`📦 Large MadCap project detected (${batchFiles.length} files, ${(totalSize / 1024 / 1024).toFixed(1)}MB). Using optimized chunked transmission.`);
        
        addNotification({
          type: 'info',
          title: 'Processing large MadCap project',
          message: `Your project has ${batchFiles.length} files (${(totalSize / 1024 / 1024).toFixed(1)}MB). Using optimized transmission to ensure all files are processed together with full project context.`,
          duration: 8000,
        });
        
        // TODO: Implement proper chunked transmission that maintains project coherence
        // For now, we'll fall back to regular processing and let the server handle it
        console.log('⚠️ Chunked upload with project coherence not yet implemented. Falling back to standard upload.');
        shouldUseChunkedUpload = false;
      }
      
      // Check if we should use direct folder writing (single upload mode)
      if (supportsFileSystemAccess && selectedOutputDir) {
        // Direct folder writing mode
        const formData = new FormData()
        console.log(`📤 Preparing to upload ${batchFiles.length} files for batch conversion`)
        
        batchFiles.forEach((file, index) => {
          console.log(`📎 Adding file ${index + 1}: ${file.name} (${file.size} bytes, type: ${file.type})`)
          formData.append('files', file)
        })
        formData.append('format', outputFormat)
        formData.append('options', JSON.stringify(buildOptions()))
        
        console.log('🚀 Sending batch conversion request...')

        const response = await fetch('/api/batch-convert', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Batch conversion failed')
        }

        // Get conversion summary from headers
        const summaryHeader = response.headers.get('X-Conversion-Summary');
        let conversionSummary = null;
        if (summaryHeader) {
          try {
            conversionSummary = JSON.parse(summaryHeader);
          } catch (e) {
            console.error('Failed to parse conversion summary:', e);
          }
        }
        
        // Get the zip file content to extract individual files
        const blob = await response.blob()
        const zip = new JSZip()
        const zipContent = await zip.loadAsync(blob)
        
        // Extract files and write to selected directory
        const files: { path: string; content: string }[] = []
        for (const fileName of Object.keys(zipContent.files)) {
          const file = zipContent.files[fileName]
          if (!file.dir) {
            const content = await file.async('text')
            files.push({ path: fileName, content })
          }
        }
        
        await writeFilesToDirectory(selectedOutputDir, files)
        
        setConversionState({ 
          isConverting: false, 
          result: { success: true },
          conversionSummary
        })

        addNotification({
          type: 'success',
          title: 'Conversion successful',
          message: `Files saved to: ${selectedOutputDir.name}/${outputFolderName}`,
          duration: 5000,
        })
      } else {
        // ZIP download mode
        const formData = new FormData()
        console.log(`📤 Preparing to upload ${batchFiles.length} files for batch conversion (ZIP mode)`)
        
        batchFiles.forEach((file, index) => {
          console.log(`📎 Adding file ${index + 1}: ${file.name} (${file.size} bytes, type: ${file.type})`)
          formData.append('files', file)
        })
        formData.append('format', outputFormat)
        formData.append('options', JSON.stringify(buildOptions()))
        
        console.log('🚀 Sending batch conversion request...')

        const response = await fetch('/api/batch-convert', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Batch conversion failed')
        }

        // Get the zip file
        const blob = await response.blob()
        
        // Get conversion summary from headers
        const summaryHeader = response.headers.get('X-Conversion-Summary')
        let conversionSummary = null;
        if (summaryHeader) {
          try {
            conversionSummary = JSON.parse(summaryHeader);
            addNotification({
              type: 'info',
              title: 'Conversion Summary',
              message: `Converted ${conversionSummary.convertedFiles} of ${conversionSummary.totalFiles} files. ${conversionSummary.skippedFiles} skipped, ${conversionSummary.errors} errors.`,
              duration: 10000,
            })
          } catch (e) {
            console.error('Failed to parse conversion summary:', e);
          }
        }

        setConversionState({ 
          isConverting: false, 
          result: { success: true },
          conversionSummary
        })

        // Download the zip file with custom name
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${outputFolderName}.zip`
        a.click()
        URL.revokeObjectURL(url)

        addNotification({
          type: 'success',
          title: 'Batch conversion successful',
          message: `Your files have been downloaded as ${outputFolderName}.zip`,
        })
      }
    } catch (error) {
      console.error('Batch conversion error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
      
      let errorMessage = 'Unknown error occurred';
      let debugInfo = '';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Check for specific error types
        if (error.message.includes('Load failed')) {
          errorMessage = 'Failed to load files for conversion. This is usually caused by:\n\n• Files too large for browser memory\n• Too many files selected at once\n• Browser internal limits reached\n\nTry selecting fewer files or smaller files.';
          debugInfo = `\n\nDebug info:\n- Files: ${batchFiles.length}\n- Total size: ${(batchFiles.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)}MB\n- Format: ${outputFormat}\n- Time: ${new Date().toISOString()}`;
        } else if (error.message.includes('NetworkError') || error.message.includes('network')) {
          errorMessage = 'Network error occurred during upload. Please check your connection and try again.';
        } else if (error.message.includes('QuotaExceededError') || error.message.includes('quota')) {
          errorMessage = 'Browser storage quota exceeded. Try clearing browser cache or selecting fewer files.';
        } else if (error.message.includes('SecurityError') || error.message.includes('security')) {
          errorMessage = 'Security error occurred. This may be due to file access restrictions. Try copying files to a local folder first.';
        } else if (error.message.includes('AbortError') || error.message.includes('abort')) {
          errorMessage = 'Upload was cancelled or timed out. Please try again with fewer files.';
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Add more detailed error information for debugging
      const detailedError = {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        fileCount: batchFiles.length,
        outputFormat,
        timestamp: new Date().toISOString()
      };
      
      setConversionState({ 
        isConverting: false, 
        error: `${errorMessage}\n\nDebug Info:\nFiles: ${batchFiles.length}\nFormat: ${outputFormat}\nTime: ${new Date().toLocaleString()}`
      })
      
      addNotification({
        type: 'error',
        title: 'Batch conversion failed',
        message: errorMessage + debugInfo,
        autoHide: false, // Keep error visible
        duration: 0
      })
      
      console.log('Detailed error info:', detailedError);
    }
  }

  const getExtensionForFormat = (format: string): string => {
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

  // File validation constants - adjusted for real MadCap projects
  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB per file (for large media files)
  const MAX_TOTAL_SIZE = 5 * 1024 * 1024 * 1024; // 5GB total project size
  const MAX_FILE_COUNT = 10000; // Support large MadCap projects (up to 10,000 files)
  
  // Progressive upload constants - chunking for transmission only
  const CHUNK_SIZE = 50; // Files per chunk for network transmission
  const CHUNK_SIZE_BYTES = 200 * 1024 * 1024; // 200MB per chunk transmission

  const validateFiles = (files: File[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Check file count (only for extremely large projects)
    if (files.length > MAX_FILE_COUNT) {
      errors.push(`Extremely large project: ${files.length} files. Current limit is ${MAX_FILE_COUNT} files. Consider processing in smaller sections.`);
    }
    
    // Check individual file sizes and calculate total
    let totalSize = 0;
    const oversizedFiles: string[] = [];
    
    files.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        oversizedFiles.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      }
      totalSize += file.size;
    });
    
    if (oversizedFiles.length > 0) {
      errors.push(`Files too large (max 500MB each): ${oversizedFiles.join(', ')}`);
    }
    
    // Check total size
    if (totalSize > MAX_TOTAL_SIZE) {
      errors.push(`Total project size too large: ${(totalSize / 1024 / 1024 / 1024).toFixed(1)}GB. Maximum allowed is 5GB.`);
    }
    
    // Check for empty files
    const emptyFiles = files.filter(file => file.size === 0).map(file => file.name);
    if (emptyFiles.length > 0) {
      errors.push(`Empty files detected: ${emptyFiles.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  const chunkFiles = (files: File[]): File[][] => {
    const chunks: File[][] = [];
    let currentChunk: File[] = [];
    let currentChunkSize = 0;
    
    for (const file of files) {
      // Start new chunk if current chunk is full by count or size
      if (currentChunk.length >= CHUNK_SIZE || 
          (currentChunkSize + file.size) > CHUNK_SIZE_BYTES) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChunkSize = 0;
        }
      }
      
      currentChunk.push(file);
      currentChunkSize += file.size;
    }
    
    // Add remaining files as final chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  const uploadChunk = async (chunk: File[], chunkIndex: number, totalChunks: number): Promise<Blob> => {
    const formData = new FormData();
    
    chunk.forEach(file => {
      formData.append('files', file);
    });
    formData.append('format', outputFormat);
    formData.append('options', JSON.stringify(buildOptions()));
    
    console.log(`🚀 Uploading chunk ${chunkIndex + 1}/${totalChunks} (${chunk.length} files, ${(chunk.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)}MB)`);
    
    const response = await fetch('/api/batch-convert', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Chunk ${chunkIndex + 1} failed: ${errorData.error || 'Unknown error'}`);
    }
    
    return await response.blob();
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, multiple: boolean = false) => {
    const files = e.target.files
    if (!files) return

    if (multiple) {
      const fileArray = Array.from(files)
      const validation = validateFiles(fileArray)
      
      if (!validation.valid) {
        addNotification({
          type: 'error',
          title: 'File validation failed',
          message: validation.errors.join('\n\n'),
          duration: 10000,
        })
        return
      }
      
      setBatchFiles(fileArray)
      addNotification({
        type: 'success',
        title: 'Files ready for conversion',
        message: `Successfully selected ${fileArray.length} files (${(fileArray.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)}MB total) for batch conversion.`,
        duration: 3000,
      })
    } else {
      const file = files[0]
      if (file.size > MAX_FILE_SIZE) {
        addNotification({
          type: 'error',
          title: 'File too large',
          message: `File "${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum allowed is 500MB.`,
          duration: 5000,
        })
        return
      }
      setSingleFile(file)
    }
  }

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    
    const fileArray = Array.from(files)
    console.log(`📁 Folder selected via file picker: ${fileArray.length} files`)
    
    // Validate files before processing
    const validation = validateFiles(fileArray)
    
    if (!validation.valid) {
      addNotification({
        type: 'error',
        title: 'Folder validation failed',
        message: `Selected folder contains files that exceed system limits:\n\n${validation.errors.join('\n\n')}\n\nThe system is designed to handle large MadCap projects. Please check for corrupted or unusually large files.`,
        duration: 15000,
      })
      return
    }
    
    fileArray.forEach(file => {
      const relativePath = (file as any).webkitRelativePath
      console.log(`📄 File: ${file.name} (webkitRelativePath: ${relativePath})`)
    })
    
    setBatchFiles(fileArray)
    addNotification({
      type: 'success',
      title: 'MadCap project ready',
      message: `Successfully loaded MadCap project with ${fileArray.length} files (${(fileArray.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)}MB total). All files will be processed together with full project context.`,
      duration: 5000,
    })
  }

  const handleDrop = (e: React.DragEvent, multiple: boolean = false) => {
    e.preventDefault()
    
    // Handle both files and folder drops
    const items = Array.from(e.dataTransfer.items)
    const files = Array.from(e.dataTransfer.files)
    
    console.log(`🎯 Drag & drop detected: ${files.length} files, ${items.length} items`)
    
    if (multiple) {
      // Check if folder was dropped (folder shows up as 0 files but has items)
      if (files.length === 0 && items.length > 0) {
        addNotification({
          type: 'warning',
          title: 'Folder drag not supported',
          message: 'Please use the "Browse" button to select a folder instead of dragging it. Drag & drop only works for individual files.',
          duration: 8000,
        })
        return
      }
      
      // Validate dropped files
      const validation = validateFiles(files)
      
      if (!validation.valid) {
        addNotification({
          type: 'error',
          title: 'Dropped files validation failed',
          message: `The dropped files exceed system limits:\n\n${validation.errors.join('\n\n')}\n\nThe system supports large MadCap projects. Please check for corrupted or unusually large files.`,
          duration: 15000,
        })
        return
      }
      
      // Debug what we're getting
      files.forEach(file => {
        const relativePath = (file as any).webkitRelativePath
        console.log(`📄 Dropped file: ${file.name} (webkitRelativePath: ${relativePath || 'not set'})`)
      })
      
      // For batch/folder processing, accept all files
      setBatchFiles(files)
      
      // If folder upload mode and we detect directory structure, show notification
      if (folderUploadMode && files.some(file => file.webkitRelativePath)) {
        addNotification({
          type: 'success',
          title: 'MadCap project structure detected',
          message: `Found ${files.length} files from MadCap project structure (${(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)}MB total). Project structure will be preserved and processed with full context.`,
          duration: 5000,
        })
      } else {
        addNotification({
          type: 'success',
          title: 'Files ready for conversion',
          message: `Successfully dropped ${files.length} files (${(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)}MB total) for batch conversion.`,
          duration: 3000,
        })
      }
    } else {
      setSingleFile(files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleSelectOutputDirectory = async () => {
    if (!supportsFileSystemAccess) return
    
    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      })
      setSelectedOutputDir(dirHandle)
      
      addNotification({
        type: 'success',
        title: 'Output folder selected',
        message: `Files will be saved to: ${dirHandle.name}`,
        duration: 3000,
      })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        addNotification({
          type: 'error',
          title: 'Failed to select folder',
          message: 'Could not access the selected folder',
        })
      }
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">MadCap Converter</h1>
            <p className="text-muted-foreground">Convert MadCap Flare documents to various formats</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-muted-foreground">Ready</span>
            </div>
            <div className="flex items-center gap-3">
              <img 
                src="/images/logo.png" 
                alt="MadCap Converter" 
                className="w-10 h-10"
              />
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`
                flex items-start gap-3 p-4 rounded-lg shadow-lg max-w-sm
                ${notification.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100' : ''}
                ${notification.type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100' : ''}
                ${notification.type === 'info' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100' : ''}
                ${notification.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100' : ''}
              `}
            >
              <div className="flex-1">
                <h4 className="font-semibold">{notification.title}</h4>
                <p className="text-sm mt-1">{notification.message}</p>
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="text-current opacity-50 hover:opacity-100"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full max-w-lg mx-auto">
            <TabsTrigger value="batch" className="flex items-center gap-2">
              <Folder size={16} />
              Project Folder
            </TabsTrigger>
            <TabsTrigger value="single" className="flex items-center gap-2">
              <FileText size={16} />
              Single File
            </TabsTrigger>
            <TabsTrigger value="text" className="flex items-center gap-2">
              <Code size={16} />
              Text
            </TabsTrigger>
          </TabsList>

          {/* Common Options Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings size={20} />
                Conversion Options
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Output Format</Label>
                <Select value={outputFormat} onValueChange={(value: any) => setOutputFormat(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formats.map(format => (
                      <SelectItem key={format.name} value={format.name}>
                        {format.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="general">
                  <AccordionTrigger className="text-sm">General Options</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="preserve-formatting" className="flex items-center gap-2">
                        <Palette size={16} />
                        Preserve Formatting
                      </Label>
                      <Switch
                        id="preserve-formatting"
                        checked={preserveFormatting}
                        onCheckedChange={setPreserveFormatting}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="extract-images" className="flex items-center gap-2">
                        <Image size={16} />
                        Extract Images
                      </Label>
                      <Switch
                        id="extract-images"
                        checked={extractImages}
                        onCheckedChange={setExtractImages}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="rewrite-links" className="flex items-center gap-2">
                        <Globe size={16} />
                        Rewrite Links
                      </Label>
                      <Switch
                        id="rewrite-links"
                        checked={rewriteLinks}
                        onCheckedChange={setRewriteLinks}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="variables">
                  <AccordionTrigger className="text-sm">Variable Options</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="extract-variables" className="flex items-center gap-2">
                        <Tag size={16} />
                        Extract Variables
                      </Label>
                      <Switch
                        id="extract-variables"
                        checked={extractVariables}
                        onCheckedChange={setExtractVariables}
                      />
                    </div>
                    {extractVariables && (
                      <>
                        <div className="space-y-2">
                          <Label>Variable Mode</Label>
                          <Select value={variableMode} onValueChange={(value: any) => setVariableMode(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="flatten">Flatten (Replace with values)</SelectItem>
                              <SelectItem value="include">Include (Separate file)</SelectItem>
                              <SelectItem value="reference">Reference (Keep references)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Variable Format</Label>
                          <Select value={variableFormat} onValueChange={(value: any) => setVariableFormat(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="adoc">AsciiDoc</SelectItem>
                              <SelectItem value="writerside">Writerside</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {outputFormat === 'zendesk' && (
                  <AccordionItem value="zendesk">
                    <AccordionTrigger className="text-sm">Zendesk Options</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="zendesk-section">Section ID</Label>
                        <Input
                          id="zendesk-section"
                          value={zendeskSectionId}
                          onChange={(e) => setZendeskSectionId(e.target.value)}
                          placeholder="Optional section ID"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zendesk-locale">Locale</Label>
                        <Input
                          id="zendesk-locale"
                          value={zendeskLocale}
                          onChange={(e) => setZendeskLocale(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="remove-conditions" className="flex items-center gap-2">
                          <Shield size={16} />
                          Remove Conditional Content
                        </Label>
                        <Switch
                          id="remove-conditions"
                          checked={removeConditions}
                          onCheckedChange={setRemoveConditions}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {outputFormat === 'asciidoc' && (
                  <AccordionItem value="asciidoc">
                    <AccordionTrigger className="text-sm">AsciiDoc Options</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="enable-validation" className="flex items-center gap-2">
                          <Shield size={16} />
                          Enable Validation
                        </Label>
                        <Switch
                          id="enable-validation"
                          checked={enableValidation}
                          onCheckedChange={setEnableValidation}
                        />
                      </div>
                      {enableValidation && (
                        <div className="space-y-2">
                          <Label>Validation Strictness</Label>
                          <Select value={validationStrictness} onValueChange={(value: any) => setValidationStrictness(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="strict">Strict</SelectItem>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="lenient">Lenient</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <Label htmlFor="include-glossary" className="flex items-center gap-2">
                          <FileText size={16} />
                          Include Glossary
                        </Label>
                        <Switch
                          id="include-glossary"
                          checked={includeGlossary}
                          onCheckedChange={setIncludeGlossary}
                        />
                      </div>
                      {includeGlossary && (
                        <div className="space-y-2">
                          <Label>Glossary Format</Label>
                          <Select value={glossaryFormat} onValueChange={(value: any) => setGlossaryFormat(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="separate">Separate File</SelectItem>
                              <SelectItem value="book-appendix">Book Appendix</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )}

                <AccordionItem value="batch">
                  <AccordionTrigger className="text-sm">Batch Conversion Options</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="preserve-structure" className="flex items-center gap-2">
                        <Folder size={16} />
                        Preserve Structure
                      </Label>
                      <Switch
                        id="preserve-structure"
                        checked={preserveStructure}
                        onCheckedChange={setPreserveStructure}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Maintain the original folder hierarchy in the output directory (vs. flattening all files to one level)
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <Label htmlFor="rename-files" className="flex items-center gap-2">
                        <FileText size={16} />
                        Rename Files
                      </Label>
                      <Switch
                        id="rename-files"
                        checked={renameFiles}
                        onCheckedChange={setRenameFiles}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Rename output files based on the first H1 heading found in each document (spaces removed, URL-safe)
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <Label htmlFor="copy-images-batch" className="flex items-center gap-2">
                        <Image size={16} />
                        Copy Images
                      </Label>
                      <Switch
                        id="copy-images-batch"
                        checked={copyImages}
                        onCheckedChange={setCopyImages}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Copy referenced images from the source directory to the output directory
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <Label htmlFor="recursive" className="flex items-center gap-2">
                        <FolderOpen size={16} />
                        Recursive Processing
                      </Label>
                      <Switch
                        id="recursive"
                        checked={recursive}
                        onCheckedChange={setRecursive}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Process files in subdirectories (vs. root directory only)
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* Text Input Tab */}
          <TabsContent value="text" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Text Input</CardTitle>
                <CardDescription>
                  Paste or type HTML content to convert
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="input-text">Input Content</Label>
                  <textarea
                    id="input-text"
                    className="w-full h-64 p-3 border rounded-md font-mono text-sm resize-y"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste your HTML content here..."
                  />
                </div>
                <Button 
                  onClick={handleTextConversion}
                  disabled={conversionState.isConverting || !inputText.trim()}
                  className="w-full"
                >
                  {conversionState.isConverting ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Convert Text
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Single File Tab */}
          <TabsContent value="single" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Single File Conversion</CardTitle>
                <CardDescription>
                  Convert a single HTML, HTM, DOCX, or MadCap file
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors"
                  onDrop={(e) => handleDrop(e, false)}
                  onDragOver={handleDragOver}
                >
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <Label htmlFor="single-file" className="cursor-pointer">
                    <p className="text-sm text-muted-foreground mb-2">
                      Drag and drop a file here, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supported: HTML, HTM, DOCX, DOC, FLSNP
                    </p>
                  </Label>
                  <Input
                    id="single-file"
                    type="file"
                    className="hidden"
                    accept=".html,.htm,.docx,.doc,.flsnp,.xml"
                    onChange={(e) => handleFileSelect(e, false)}
                  />
                </div>
                {singleFile && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                    <span className="text-sm truncate">{singleFile.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSingleFile(null)}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                )}
                <Button 
                  onClick={handleSingleFileConversion}
                  disabled={conversionState.isConverting || !singleFile}
                  className="w-full"
                >
                  {conversionState.isConverting ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Convert File
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Project Folder Tab */}
          <TabsContent value="batch" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Folder Conversion</CardTitle>
                <CardDescription>
                  Convert entire MadCap project folders or multiple files at once
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="folder-mode"
                      name="upload-mode"
                      checked={folderUploadMode}
                      onChange={() => setFolderUploadMode(true)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="folder-mode" className="flex items-center gap-2 cursor-pointer">
                      <Folder size={16} />
                      Folder Upload
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="files-mode"
                      name="upload-mode"
                      checked={!folderUploadMode}
                      onChange={() => setFolderUploadMode(false)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="files-mode" className="flex items-center gap-2 cursor-pointer">
                      <FileText size={16} />
                      Multiple Files
                    </Label>
                  </div>
                </div>
                
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-2">
                    <Label htmlFor="output-folder-name">Output Folder Name</Label>
                    <div className="flex gap-2">
                      <Input
                        id="output-folder-name"
                        value={outputFolderName}
                        onChange={(e) => setOutputFolderName(e.target.value)}
                        placeholder="converted-madcap-project"
                        className="flex-1"
                      />
                      {supportsFileSystemAccess && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleSelectOutputDirectory}
                          className="flex items-center gap-2"
                        >
                          <FolderOpen size={16} />
                          Select Folder
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {supportsFileSystemAccess ? (
                      selectedOutputDir ? (
                        <>
                          <CheckCircle size={16} className="text-green-500" />
                          <span>Files will be saved to: {selectedOutputDir.name}/{outputFolderName}</span>
                        </>
                      ) : (
                        <>
                          <FolderOpen size={16} className="text-orange-500" />
                          <span>Click "Select Folder" to choose output location</span>
                        </>
                      )
                    ) : (
                      <>
                        <Download size={16} className="text-blue-500" />
                        <span>Files will be downloaded as ZIP: {outputFolderName}.zip</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors"
                  onDrop={(e) => handleDrop(e, true)}
                  onDragOver={handleDragOver}
                >
                  <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <Label htmlFor={folderUploadMode ? "folder-input" : "batch-files"} className="cursor-pointer">
                    <p className="text-sm text-muted-foreground mb-2">
                      {folderUploadMode ? "Drag and drop a folder here, or click to browse" : "Drag and drop files here, or click to browse"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {folderUploadMode ? "Select entire MadCap project folder" : "Select multiple files for batch conversion"}
                    </p>
                  </Label>
                  
                  {folderUploadMode ? (
                    <input
                      id="folder-input"
                      type="file"
                      className="hidden"
                      accept=".html,.htm,.docx,.doc,.flsnp,.xml"
                      {...({ webkitdirectory: "", directory: "" } as any)}
                      multiple
                      onChange={handleFolderSelect}
                    />
                  ) : (
                    <Input
                      id="batch-files"
                      type="file"
                      className="hidden"
                      accept=".html,.htm,.docx,.doc,.flsnp,.xml"
                      multiple
                      onChange={(e) => handleFileSelect(e, true)}
                    />
                  )}
                </div>
                {batchFiles.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{batchFiles.length} files selected</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setBatchFiles([])}
                      >
                        Clear all
                      </Button>
                    </div>
                    {batchFiles.map((file, index) => {
                      const displayPath = (file as any).webkitRelativePath || file.name;
                      return (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                          <span className="truncate font-mono text-xs">{displayPath}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBatchFiles(files => files.filter((_, i) => i !== index))}
                          >
                            <X size={14} />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <Button 
                  onClick={handleBatchConversion}
                  disabled={conversionState.isConverting || batchFiles.length === 0}
                  className="w-full"
                >
                  {conversionState.isConverting ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      {conversionState.progressMessage || 
                        (conversionState.currentFile 
                          ? `Converting ${conversionState.currentFile}...` 
                          : `Converting ${conversionState.progress ? `(${conversionState.progress}%)` : '...'}`)}
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      {folderUploadMode ? `Convert Project (${batchFiles.length} files)` : `Convert ${batchFiles.length} Files`}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Results */}
        {conversionState.result && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="text-green-500" size={20} />
                Conversion Complete
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {conversionState.conversionSummary ? (
                  conversionState.conversionSummary.convertedFiles > 0 ? 
                    `Successfully converted ${conversionState.conversionSummary.convertedFiles} of ${conversionState.conversionSummary.totalFiles} files and downloaded.` :
                    conversionState.conversionSummary.totalFiles === 0 ?
                      'No files were found to convert. Please check your folder contains supported file types (.htm, .html, .flsnp, .xml, .docx).' :
                      `No files were converted. ${conversionState.conversionSummary.skippedFiles} files were skipped.`
                ) : (
                  'Your files have been converted successfully and downloaded.'
                )}
              </p>
              {conversionState.result.metadata && (
                <div className="mt-4 space-y-2 text-sm">
                  {conversionState.result.metadata.wordCount && (
                    <div>Word count: {conversionState.result.metadata.wordCount}</div>
                  )}
                  {conversionState.result.metadata.warnings && (
                    <div className="text-yellow-600">
                      Warnings: {conversionState.result.metadata.warnings.length}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {conversionState.error && (
          <Card className="mt-6 border-red-200 dark:border-red-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <XCircle size={20} />
                Conversion Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{conversionState.error}</p>
            </CardContent>
          </Card>
        )}
        
        {/* Detailed Conversion Summary */}
        {conversionState.conversionSummary && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText size={20} />
                Detailed Conversion Report
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold">Total Files:</span> {conversionState.conversionSummary.totalFiles}
                </div>
                <div>
                  <span className="font-semibold text-green-600">Converted:</span> {conversionState.conversionSummary.convertedFiles}
                </div>
                <div>
                  <span className="font-semibold text-yellow-600">Skipped:</span> {conversionState.conversionSummary.skippedFiles}
                </div>
                <div>
                  <span className="font-semibold text-red-600">Errors:</span> {conversionState.conversionSummary.errors}
                </div>
              </div>
              
              {/* Skipped Files */}
              {conversionState.conversionSummary.skippedFilesList && conversionState.conversionSummary.skippedFilesList.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Skipped Files:</h4>
                  <textarea
                    readOnly
                    value={conversionState.conversionSummary.skippedFilesList
                      .map(item => `${item.file}: ${item.reason}`)
                      .join('\n')}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 h-32 resize-none"
                  />
                </div>
              )}
              
              {/* Error Details */}
              {conversionState.conversionSummary.errorDetails && conversionState.conversionSummary.errorDetails.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-red-600">Conversion Errors:</h4>
                  <textarea
                    readOnly
                    value={conversionState.conversionSummary.errorDetails
                      .map(item => `${item.file}:\n${item.error}\n${item.stack ? item.stack + '\n' : ''}`)
                      .join('\n---\n')}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 h-48 resize-none text-red-600"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
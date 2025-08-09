import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export type OutputFormat = 'asciidoc' | 'writerside-markdown' | 'zendesk'

export interface ConversionOptions {
  // Common options
  preserveFormatting: boolean
  includeMetadata: boolean
  
  // AsciiDoc options
  asciidocOptions?: {
    includeChapter?: boolean
    enableValidation?: boolean
    validationStrictness?: 'strict' | 'normal' | 'lenient'
    autoColumnWidths?: boolean
    preserveTableFormatting?: boolean
    tableFrame?: 'all' | 'topbot' | 'sides' | 'none'
    tableGrid?: 'all' | 'rows' | 'cols' | 'none'
    enableSmartPathResolution?: boolean
    validateImagePaths?: boolean
    mathOptions?: {
      enableMathProcessing?: boolean
      preserveLatex?: boolean
      convertSubscripts?: boolean
      normalizeSymbols?: boolean
    }
    citationOptions?: {
      enableCitationProcessing?: boolean
      citationStyle?: 'author-year' | 'numeric'
      generateBibliography?: boolean
      extractDOIs?: boolean
      footnoteStyle?: 'asciidoc'
    }
    performanceOptions?: {
      enableOptimization?: boolean
      chunkSize?: number
      maxConcurrency?: number
      memoryThreshold?: number
      batchProcessing?: boolean
    }
  }
  
  // Markdown options
  markdownOptions?: {
    generateTOC?: boolean
    baseUrl?: string
    imageWidth?: number
    imageBaseUrl?: string
    removeEmptyTableCells?: boolean
    instanceName?: string
  }
  
  // Zendesk options
  zendeskOptions?: {
    sectionId?: string
    locale?: string
    authorEmail?: string
    preserveAnchors?: boolean
    visibility?: string
    permissionGroupId?: string
    userSegmentId?: string
    removeConditions?: boolean
    conditionHandling?: string
    preserveMadCapFeatures?: boolean
  }
  
  // Variable options
  variableOptions?: {
    extractVariables?: boolean
    variableMode?: 'flatten' | 'include' | 'reference'
    variableFormat?: 'adoc' | 'writerside'
    autoDiscoverFLVAR?: boolean
    multiProjectSupport?: boolean
    smartProjectDetection?: boolean
    fallbackStrategy?: 'error' | 'warning' | 'ignore'
    nameConvention?: 'kebab-case' | 'snake_case' | 'camelCase' | 'PascalCase'
    variablePrefix?: string
    instanceName?: string
    includePatterns?: string[]
    excludePatterns?: string[]
    flvarFiles?: string[]
  }
  
  // Glossary options
  glossaryOptions?: {
    generateGlossary?: boolean
    glossaryTitle?: string
    glossaryFile?: string
    extractToSeparateFile?: boolean
    includeGlossary?: boolean
    glossaryPath?: string
    filterConditions?: string[] | boolean
    glossaryFormat?: 'inline' | 'separate' | 'book-appendix'
    generateAnchors?: boolean
  }
}

export interface ConversionResult {
  content: string
  metadata?: {
    title?: string
    description?: string
    tags?: string[]
    warnings?: string[]
    processingTime?: number
  }
  extractedVariables?: Array<{
    namespace: string
    variables: Array<{
      name: string
      value: string
    }>
  }>
}

interface ConversionState {
  // Current conversion settings
  format: OutputFormat
  options: ConversionOptions
  
  // Files to convert
  files: File[]
  uploadProgress: number
  
  // Condition analysis and selection
  conditionAnalysisResult: any | null
  showConditionModal: boolean
  isAnalyzingConditions: boolean
  selectedExcludeConditions: string[]
  selectedIncludeConditions: string[]
  
  // Conversion results
  results: ConversionResult[]
  isProcessing: boolean
  currentFile: string | null
  
  // Progress tracking
  sessionId: string | null
  completedFiles: number
  
  // Error handling
  errors: string[]
  warnings: string[]
}

interface ConversionActions {
  // Settings actions
  setFormat: (format: OutputFormat) => void
  updateOptions: (options: Partial<ConversionOptions>) => void
  updateAsciidocOptions: (options: Partial<ConversionOptions['asciidocOptions']>) => void
  updateMarkdownOptions: (options: Partial<ConversionOptions['markdownOptions']>) => void
  updateZendeskOptions: (options: Partial<ConversionOptions['zendeskOptions']>) => void
  updateVariableOptions: (options: Partial<ConversionOptions['variableOptions']>) => void
  updateGlossaryOptions: (options: Partial<ConversionOptions['glossaryOptions']>) => void
  
  // File actions
  setFiles: (files: File[]) => void
  addFiles: (files: File[]) => void
  removeFile: (fileName: string) => void
  clearFiles: () => void
  setUploadProgress: (progress: number) => void
  
  // Condition actions
  setConditionAnalysisResult: (result: any) => void
  setShowConditionModal: (show: boolean) => void
  setIsAnalyzingConditions: (analyzing: boolean) => void
  setSelectedConditions: (conditions: { excludeConditions: string[], includeConditions: string[] }) => void
  analyzeConditions: () => Promise<void>
  
  // Conversion actions
  startConversion: () => Promise<void>
  cancelConversion: () => void
  setCurrentFile: (fileName: string | null) => void
  
  // Progress tracking actions
  setProcessingState: (state: { 
    isProcessing: boolean
    sessionId: string | null
    currentFile?: string | null
    uploadProgress?: number
    completedFiles?: number
  }) => void
  setCompletedFiles: (count: number) => void
  
  // Results actions
  addResult: (result: ConversionResult) => void
  clearResults: () => void
  
  // Error handling
  addError: (error: string) => void
  addWarning: (warning: string) => void
  clearErrors: () => void
  clearWarnings: () => void
  
  // Reset
  reset: () => void
}

export type ConversionStore = ConversionState & ConversionActions

const initialState: ConversionState = {
  format: 'asciidoc',
  options: {
    preserveFormatting: true,
    includeMetadata: true,
    asciidocOptions: {
      includeChapter: true,
      enableValidation: false,
      validationStrictness: 'normal',
      autoColumnWidths: false,
      preserveTableFormatting: false,
      tableFrame: 'all',
      tableGrid: 'all',
      enableSmartPathResolution: false,
      validateImagePaths: false,
    },
    markdownOptions: {
      generateTOC: false,
      baseUrl: '',
      imageWidth: 600,
      imageBaseUrl: '',
      removeEmptyTableCells: false,
      instanceName: 'default',
    },
    zendeskOptions: {
      sectionId: '',
      locale: 'en-us',
      authorEmail: '',
      preserveAnchors: false,
    },
    variableOptions: {
      extractVariables: true,
      variableMode: 'flatten',
      variableFormat: 'adoc',
      autoDiscoverFLVAR: true,
      multiProjectSupport: false,
      smartProjectDetection: false,
      fallbackStrategy: 'warning',
      nameConvention: 'kebab-case',
      variablePrefix: '',
      instanceName: 'default',
      includePatterns: [],
      excludePatterns: [],
      flvarFiles: [],
    },
    glossaryOptions: {
      generateGlossary: false,
      glossaryTitle: 'Glossary',
      glossaryFile: '',
      extractToSeparateFile: false,
      includeGlossary: true,
      glossaryPath: '',
      filterConditions: false,
      glossaryFormat: 'inline',
      generateAnchors: true,
    },
  },
  files: [],
  uploadProgress: 0,
  
  // Condition analysis initial state
  conditionAnalysisResult: null,
  showConditionModal: false,
  isAnalyzingConditions: false,
  selectedExcludeConditions: [],
  selectedIncludeConditions: [],
  
  results: [],
  isProcessing: false,
  currentFile: null,
  sessionId: null,
  completedFiles: 0,
  errors: [],
  warnings: [],
}

export const useConversionStore = create<ConversionStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        // Settings actions
        setFormat: (format) => set({ format }),
        
        updateOptions: (options) =>
          set((state) => ({ options: { ...state.options, ...options } })),
        
        updateAsciidocOptions: (options) =>
          set((state) => ({
            options: {
              ...state.options,
              asciidocOptions: { ...(state.options.asciidocOptions || {}), ...options },
            },
          })),
        
        updateMarkdownOptions: (options) =>
          set((state) => ({
            options: {
              ...state.options,
              markdownOptions: { ...(state.options.markdownOptions || {}), ...options },
            },
          })),
        
        updateZendeskOptions: (options) =>
          set((state) => ({
            options: {
              ...state.options,
              zendeskOptions: { ...(state.options.zendeskOptions || {}), ...options },
            },
          })),
        
        updateVariableOptions: (options) =>
          set((state) => ({
            options: {
              ...state.options,
              variableOptions: { ...(state.options.variableOptions || {}), ...options },
            },
          })),
        
        updateGlossaryOptions: (options) =>
          set((state) => ({
            options: {
              ...state.options,
              glossaryOptions: { ...(state.options.glossaryOptions || {}), ...options },
            },
          })),
        
        // File actions
        setFiles: (files) => set({ files }),
        
        addFiles: (files) =>
          set((state) => ({ files: [...state.files, ...files] })),
        
        removeFile: (fileName) =>
          set((state) => ({
            files: state.files.filter((f) => f.name !== fileName),
          })),
        
        clearFiles: () => set({ files: [], uploadProgress: 0, completedFiles: 0 }),
        
        setUploadProgress: (progress) => set({ uploadProgress: progress }),
        
        // Condition actions
        setConditionAnalysisResult: (result) => set({ conditionAnalysisResult: result }),
        
        setShowConditionModal: (show) => set({ showConditionModal: show }),
        
        setIsAnalyzingConditions: (analyzing) => set({ isAnalyzingConditions: analyzing }),
        
        setSelectedConditions: ({ excludeConditions, includeConditions }) =>
          set({ 
            selectedExcludeConditions: excludeConditions,
            selectedIncludeConditions: includeConditions 
          }),
        
        analyzeConditions: async () => {
          const { files } = get()
          if (files.length === 0) return
          
          set({ isAnalyzingConditions: true })
          
          try {
            const formData = new FormData()
            files.forEach(file => formData.append('files', file))
            
            // Convert files to the format expected by analyze-conditions API
            const filePromises = files.map(file => {
              return new Promise<{ name: string, content: string, isBase64: boolean }>((resolve) => {
                const reader = new FileReader()
                reader.onload = () => {
                  resolve({
                    name: file.name,
                    content: reader.result as string,
                    isBase64: false
                  })
                }
                reader.readAsText(file)
              })
            })
            
            const fileContents = await Promise.all(filePromises)
            
            const response = await fetch('/api/analyze-conditions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                files: fileContents,
                sessionId: `analysis-${Date.now()}`
              })
            })
            
            if (response.ok) {
              const result = await response.json()
              if (result.success) {
                set({ 
                  conditionAnalysisResult: result.analysis,
                  showConditionModal: true 
                })
              } else {
                get().addError('Failed to analyze conditions: ' + result.error)
              }
            } else {
              get().addError('Failed to analyze conditions')
            }
          } catch (error) {
            get().addError('Error analyzing conditions: ' + (error instanceof Error ? error.message : 'Unknown error'))
          } finally {
            set({ isAnalyzingConditions: false })
          }
        },
        
        // Conversion actions
        startConversion: async () => {
          const { files, format, options } = get()
          if (files.length === 0) return
          
          set({ isProcessing: true, results: [], errors: [], warnings: [], completedFiles: 0 })
          
          try {
            // Conversion logic will be implemented here
            // This is a placeholder for now
            for (const file of files) {
              set({ currentFile: file.name })
              // Simulate conversion
              await new Promise((resolve) => setTimeout(resolve, 1000))
              
              get().addResult({
                content: `Converted ${file.name} to ${format}`,
                metadata: {
                  title: file.name,
                  processingTime: 1000,
                },
              })
            }
          } catch (error) {
            get().addError(error instanceof Error ? error.message : 'Unknown error')
          } finally {
            set({ isProcessing: false, currentFile: null })
          }
        },
        
        cancelConversion: () => set({ isProcessing: false, currentFile: null }),
        
        setCurrentFile: (fileName) => set({ currentFile: fileName }),
        
        // Progress tracking actions
        setProcessingState: (state) => set({
          isProcessing: state.isProcessing,
          sessionId: state.sessionId,
          currentFile: state.currentFile !== undefined ? state.currentFile : get().currentFile,
          uploadProgress: state.uploadProgress !== undefined ? state.uploadProgress : get().uploadProgress,
          completedFiles: state.completedFiles !== undefined ? state.completedFiles : get().completedFiles,
        }),
        
        setCompletedFiles: (count) => set({ completedFiles: count }),
        
        // Results actions
        addResult: (result) =>
          set((state) => ({ results: [...state.results, result] })),
        
        clearResults: () => set({ results: [] }),
        
        // Error handling
        addError: (error) =>
          set((state) => ({ errors: [...state.errors, error] })),
        
        addWarning: (warning) =>
          set((state) => ({ warnings: [...state.warnings, warning] })),
        
        clearErrors: () => set({ errors: [] }),
        
        clearWarnings: () => set({ warnings: [] }),
        
        // Reset
        reset: () => set(initialState),
      }),
      {
        name: 'madcap-converter-storage',
        partialize: (state) => ({
          format: state.format,
          options: state.options,
        }),
      }
    )
  )
)
/**
 * Utility functions for handling folder drag-and-drop operations
 */

export interface ProcessedFile {
  file: File
  path: string
  isValid: boolean
}

export interface FolderProcessingResult {
  files: File[]
  totalCount: number
  validCount: number
  invalidFiles: string[]
  errors: string[]
}

/**
 * Recursively processes a folder entry and returns all files
 */
async function processEntry(entry: FileSystemEntry, acceptedTypes?: string[]): Promise<ProcessedFile[]> {
  const results: ProcessedFile[] = []

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    
    try {
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject)
      })

      const isValid = acceptedTypes ? isFileTypeAccepted(file, acceptedTypes) : true
      
      results.push({
        file,
        path: entry.fullPath,
        isValid
      })
    } catch (error) {
      console.warn(`Failed to process file: ${entry.fullPath}`, error)
    }
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    
    try {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        const reader = dirEntry.createReader()
        const allEntries: FileSystemEntry[] = []
        
        function readEntries() {
          reader.readEntries((entries) => {
            if (entries.length === 0) {
              resolve(allEntries)
            } else {
              allEntries.push(...entries)
              readEntries() // Continue reading if there are more entries
            }
          }, reject)
        }
        
        readEntries()
      })

      // Process all entries recursively
      for (const childEntry of entries) {
        const childResults = await processEntry(childEntry, acceptedTypes)
        results.push(...childResults)
      }
    } catch (error) {
      console.warn(`Failed to read directory: ${entry.fullPath}`, error)
    }
  }

  return results
}

/**
 * Checks if a file type is accepted based on the accept string
 */
function isFileTypeAccepted(file: File, acceptedTypes: string[]): boolean {
  if (!acceptedTypes || acceptedTypes.length === 0) return true

  // Skip files without extensions (likely folders or system files)
  const fileNameParts = file.name.split('.')
  if (fileNameParts.length < 2) {
    return false
  }

  const fileExt = `.${fileNameParts.pop()?.toLowerCase()}`
  
  return acceptedTypes.some(type => {
    const normalizedType = type.trim().toLowerCase()
    if (normalizedType.startsWith('.')) {
      return fileExt === normalizedType
    }
    return file.type.startsWith(normalizedType)
  })
}

/**
 * Processes dropped items and returns all files from folders
 */
export async function processDraggedItems(
  items: DataTransferItemList,
  acceptedTypes?: string
): Promise<FolderProcessingResult> {
  const acceptedTypesArray = acceptedTypes ? acceptedTypes.split(',').map(t => t.trim()) : undefined
  const allProcessedFiles: ProcessedFile[] = []
  const errors: string[] = []

  try {
    // Process all dropped items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry()
        
        if (entry) {
          try {
            const processedFiles = await processEntry(entry, acceptedTypesArray)
            allProcessedFiles.push(...processedFiles)
          } catch (error) {
            errors.push(`Failed to process ${entry.fullPath}: ${error}`)
          }
        }
      }
    }

    // Separate valid and invalid files
    const validFiles = allProcessedFiles.filter(pf => pf.isValid)
    const invalidFiles = allProcessedFiles.filter(pf => !pf.isValid).map(pf => pf.file.name)

    return {
      files: validFiles.map(pf => pf.file),
      totalCount: allProcessedFiles.length,
      validCount: validFiles.length,
      invalidFiles,
      errors
    }
  } catch (error) {
    errors.push(`Folder processing failed: ${error}`)
    
    return {
      files: [],
      totalCount: 0,
      validCount: 0,
      invalidFiles: [],
      errors
    }
  }
}

/**
 * Checks if the browser supports folder drag-and-drop
 */
export function supportsFolderDragAndDrop(): boolean {
  return 'webkitGetAsEntry' in DataTransferItem.prototype
}

/**
 * Estimates folder processing time based on number of items
 */
export function estimateProcessingTime(itemCount: number): number {
  // Rough estimate: 50ms per item for small folders, less for larger ones
  if (itemCount <= 10) return itemCount * 50
  if (itemCount <= 100) return itemCount * 30
  return itemCount * 20
}
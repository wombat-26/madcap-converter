"use client"

import React, { useCallback, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Upload, FolderOpen, FileText, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotificationStore } from '@/stores/useNotificationStore'
import { processDraggedItems, supportsFolderDragAndDrop } from '@/lib/folder-utils'

interface FileUploadZoneProps {
  title: string
  description: string
  multiple?: boolean
  accept?: string
  files: File[]
  onFilesChange: (files: File[]) => void
  isFolder?: boolean
  className?: string
  disabled?: boolean
  hint?: string
}

export function FileUploadZone({
  title,
  description,
  multiple = false,
  accept,
  files,
  onFilesChange,
  isFolder = false,
  className,
  disabled = false,
  hint
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessingFolder, setIsProcessingFolder] = useState(false)
  const { addNotification } = useNotificationStore()

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const items = e.dataTransfer.items
    const droppedFiles = Array.from(e.dataTransfer.files)

    // Check if this is a folder drop and browser supports folder processing
    const hasFolderItems = Array.from(items).some(item => {
      const entry = item.webkitGetAsEntry?.()
      return entry && entry.isDirectory
    })

    if (hasFolderItems && supportsFolderDragAndDrop()) {
      // Process folder drop with proper file counting
      setIsProcessingFolder(true)
      
      try {
        addNotification({
          type: 'info',
          title: 'Processing folder',
          message: 'Analyzing folder contents...',
          duration: 3000,
        })

        const result = await processDraggedItems(items, accept)
        
        if (result.errors.length > 0) {
          console.warn('Folder processing errors:', result.errors)
        }

        if (result.files.length === 0) {
          addNotification({
            type: 'warning',
            title: 'No valid files found',
            message: 'The folder does not contain any supported files.',
          })
          return
        }

        if (result.invalidFiles.length > 0) {
          addNotification({
            type: 'warning',
            title: 'Some files skipped',
            message: `Skipped ${result.invalidFiles.length} unsupported files. Processing ${result.validCount} valid files.`,
          })
        }

        if (multiple) {
          onFilesChange([...files, ...result.files])
          addNotification({
            type: 'success',
            title: 'Folder processed',
            message: `Added ${result.files.length} files from folder.`,
          })
        } else {
          onFilesChange([result.files[0]])
          addNotification({
            type: 'success',
            title: 'File ready',
            message: `${result.files[0].name} is ready for conversion.`,
          })
        }
        
        return
      } catch (error) {
        console.error('Folder processing failed:', error)
        addNotification({
          type: 'error',
          title: 'Folder processing failed',
          message: 'Failed to process the dropped folder. Please try selecting files manually.',
        })
        return
      } finally {
        setIsProcessingFolder(false)
      }
    }

    // Fallback: Handle as regular file drop
    if (isFolder && items.length > 0 && droppedFiles.length === 0) {
      // Folder was dropped but browser doesn't support folder drops
      addNotification({
        type: 'warning',
        title: 'Folder drag not supported',
        message: 'Please use the "Browse" button to select a folder instead of dragging it.',
        duration: 8000,
      })
      return
    }

    if (droppedFiles.length === 0) {
      return
    }

    if (!multiple && droppedFiles.length > 1) {
      addNotification({
        type: 'warning',
        title: 'Multiple files not allowed',
        message: 'Please select only one file.',
      })
      return
    }

    // Validate file types if accept is specified (only for single file mode or non-folder uploads)
    if (accept && !isFolder) {
      const acceptedTypes = accept.split(',').map(t => t.trim())
      const invalidFiles = droppedFiles.filter(file => {
        // Skip files without extensions (likely folders or system files)
        const fileNameParts = file.name.split('.')
        if (fileNameParts.length < 2) {
          return false // Allow files without extensions for folder uploads
        }
        
        const fileExt = `.${fileNameParts.pop()?.toLowerCase()}`
        return !acceptedTypes.some(type => {
          if (type.startsWith('.')) {
            return fileExt === type.toLowerCase()
          }
          return file.type.startsWith(type)
        })
      })

      if (invalidFiles.length > 0) {
        addNotification({
          type: 'warning',
          title: 'Some files skipped',
          message: `Skipped unsupported files: ${invalidFiles.map(f => f.name).join(', ')}. Only supported files will be processed.`,
        })
        
        // Filter out invalid files but continue with valid ones
        const validFiles = droppedFiles.filter(file => !invalidFiles.includes(file))
        if (validFiles.length === 0) {
          addNotification({
            type: 'error',
            title: 'No valid files',
            message: 'No supported files found in the selection.',
          })
          return
        }
        
        // Continue with only valid files
        if (multiple) {
          onFilesChange([...files, ...validFiles])
          addNotification({
            type: 'success',
            title: 'Valid files added',
            message: `Added ${validFiles.length} valid file(s) for conversion.`,
          })
        } else {
          onFilesChange([validFiles[0]])
          addNotification({
            type: 'success',
            title: 'File ready',
            message: `${validFiles[0].name} is ready for conversion.`,
          })
        }
        return
      }
    }

    if (multiple) {
      onFilesChange([...files, ...droppedFiles])
      addNotification({
        type: 'success',
        title: 'Files added',
        message: `Added ${droppedFiles.length} file(s) for conversion.`,
      })
    } else {
      onFilesChange([droppedFiles[0]])
      addNotification({
        type: 'success',
        title: 'File ready',
        message: `${droppedFiles[0].name} is ready for conversion.`,
      })
    }
  }, [isFolder, multiple, accept, files, onFilesChange, addNotification, isProcessingFolder])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (!selectedFiles || selectedFiles.length === 0) {
      return
    }

    const fileArray = Array.from(selectedFiles)
    
    if (multiple) {
      onFilesChange([...files, ...fileArray])
      addNotification({
        type: 'success',
        title: isFolder ? 'Folder loaded' : 'Files added',
        message: isFolder 
          ? `Successfully loaded folder with ${fileArray.length} files.`
          : `Added ${fileArray.length} file(s) for conversion.`,
      })
    } else {
      onFilesChange([fileArray[0]])
      addNotification({
        type: 'success',
        title: 'File ready',
        message: `${fileArray[0].name} is ready for conversion.`,
      })
    }

    // Reset input value to allow selecting the same file again
    e.target.value = ''
  }, [multiple, isFolder, files, onFilesChange, addNotification])

  const removeFile = useCallback((fileName: string) => {
    onFilesChange(files.filter(f => f.name !== fileName))
  }, [files, onFilesChange])

  const clearAll = useCallback(() => {
    onFilesChange([])
  }, [onFilesChange])

  const totalSize = files.reduce((acc, file) => acc + file.size, 0)
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-all",
            isDragging ? "border-primary bg-primary/5" : "hover:border-primary",
            disabled && "opacity-50 cursor-not-allowed",
            isProcessingFolder && "border-amber-400 bg-amber-50 dark:bg-amber-950/20"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
        >
          {isProcessingFolder ? (
            <Loader2 className="mx-auto h-12 w-12 text-amber-600 mb-4 animate-spin" />
          ) : isFolder ? (
            <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          ) : (
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          )}
          
          <Label htmlFor={`file-input-${title.replace(/\s+/g, '-')}`} className="cursor-pointer">
            <p className="text-sm text-muted-foreground mb-2">
              {isProcessingFolder 
                ? "Processing folder contents..."
                : isFolder 
                  ? "Drag and drop a folder here, or click to browse"
                  : multiple
                    ? "Drag and drop files here, or click to browse"
                    : "Drag and drop a file here, or click to browse"
              }
            </p>
            {hint && !isProcessingFolder && (
              <p className="text-xs text-muted-foreground">{hint}</p>
            )}
          </Label>
          
          <Input
            id={`file-input-${title.replace(/\s+/g, '-')}`}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            multiple={multiple}
            accept={accept}
            disabled={disabled}
            {...(isFolder && { webkitdirectory: '', directory: '' } as any)}
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {files.length} file{files.length !== 1 ? 's' : ''} selected ({totalSizeMB} MB)
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-destructive hover:text-destructive"
              >
                Clear all
              </Button>
            </div>
            
            <div className="max-h-48 overflow-y-auto space-y-1">
              {files.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50 group"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeFile(file.name)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
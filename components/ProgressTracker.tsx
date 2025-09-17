"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  FileText, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Minimize2,
  Maximize2,
  Activity,
  Users,
  HardDrive
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProgressStream, ConnectionStatus } from '@/hooks/useProgressStream'
import { useConversionStore } from '@/stores/useConversionStore'

export type ProgressMode = 'compact' | 'detailed' | 'minimal'

interface ProgressTrackerProps {
  sessionId: string | null
  mode?: ProgressMode
  className?: string
  showFileList?: boolean
  showStatistics?: boolean
  showConnectionStatus?: boolean
  autoHide?: boolean
  onComplete?: () => void
  onError?: (error: string) => void
}

export function ProgressTracker({
  sessionId,
  mode = 'detailed',
  className,
  showFileList = true,
  showStatistics = true,
  showConnectionStatus = true,
  autoHide = false,
  onComplete,
  onError
}: ProgressTrackerProps) {
  const [isMinimized, setIsMinimized] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  
  // Store state
  const {
    isProcessing,
    currentFile,
    uploadProgress,
    files,
    results,
    errors,
    warnings,
    completedFiles,
    completedFileNames
  } = useConversionStore()
  
  // Progress stream connection
  const {
    connectionStatus,
    reconnectAttempt,
    maxReconnectAttempts,
    isConnected,
    isConnecting,
    isReconnecting,
    hasError,
    reconnect
  } = useProgressStream(sessionId, {
    onConnect: () => {
      if (!startTime) {
        setStartTime(Date.now())
      }
    },
    onError: (error) => {
      onError?.(error.message)
    }
  })

  // Update elapsed time
  useEffect(() => {
    if (!isProcessing || !startTime) {
      return
    }
    
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime)
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isProcessing, startTime])

  // Calculate statistics first (needed by useEffect dependencies)
  const totalFiles = files.length
  const errorCount = errors.length
  const warningCount = warnings.length
  const remainingFiles = totalFiles - completedFiles - errorCount

  // Reset on new session
  useEffect(() => {
    if (sessionId) {
      setStartTime(null)
      setElapsedTime(0)
    }
  }, [sessionId])

  // Handle completion
  useEffect(() => {
    console.log(`🔍 [ProgressTracker] Completion check:`, {
      isProcessing,
      uploadProgress,
      resultsLength: results.length,
      completedFiles,
      totalFiles,
      sessionId
    });
    
    // Check if conversion completed - either by having results or by reaching 100% with completed files
    const hasCompleted = !isProcessing && uploadProgress === 100 && (results.length > 0 || completedFiles > 0);
    
    if (hasCompleted) {
      console.log(`✅ [ProgressTracker] Calling onComplete() - conversion finished`);
      onComplete?.()
      if (autoHide) {
        setTimeout(() => {
          // Auto-hide logic could be implemented here
        }, 3000)
      }
    }
  }, [isProcessing, uploadProgress, results.length, completedFiles, totalFiles, onComplete, autoHide, sessionId])
  
  const estimatedTimeRemaining = completedFiles > 0 && elapsedTime > 0
    ? ((elapsedTime / completedFiles) * remainingFiles)
    : null

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const getConnectionStatusIcon = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />
      case 'connecting':
      case 'reconnecting':
        return <RefreshCw className="h-4 w-4 animate-spin text-yellow-500" />
      case 'error':
        return <WifiOff className="h-4 w-4 text-red-500" />
      default:
        return <WifiOff className="h-4 w-4 text-gray-400" />
    }
  }

  const getConnectionStatusText = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'reconnecting':
        return `Reconnecting (${reconnectAttempt}/${maxReconnectAttempts})...`
      case 'error':
        return 'Connection failed'
      default:
        return 'Disconnected'
    }
  }

  // Don't render if no session and not processing
  if (!sessionId && !isProcessing) {
    return null
  }

  // Minimal mode
  if (mode === 'minimal') {
    return (
      <div className={cn("flex items-center gap-2 p-2 bg-muted/50 rounded-md", className)}>
        <Activity className="h-4 w-4 animate-pulse text-primary" />
        <div className="flex-1">
          <Progress value={uploadProgress} className="h-2" />
        </div>
        <span className="text-xs text-muted-foreground">
          {Math.round(uploadProgress)}%
        </span>
        {currentFile && (
          <span className="text-xs text-muted-foreground max-w-32 truncate">
            {currentFile}
          </span>
        )}
      </div>
    )
  }

  // Compact mode
  if (mode === 'compact') {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 animate-pulse text-primary" />
                <span className="font-medium">Converting...</span>
                {showConnectionStatus && (
                  <div className="flex items-center gap-1">
                    {getConnectionStatusIcon(connectionStatus)}
                  </div>
                )}
              </div>
              <Badge variant="outline">
                {completedFiles}/{totalFiles} files
              </Badge>
            </div>
            
            <Progress value={uploadProgress} className="h-3" />
            
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{Math.round(uploadProgress)}% complete</span>
              {elapsedTime > 0 && (
                <span>⏱️ {formatTime(elapsedTime)}</span>
              )}
            </div>
            
            {currentFile && (
              <div className="text-sm">
                <span className="text-muted-foreground">Processing: </span>
                <span className="font-medium">{currentFile}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Detailed mode
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 animate-pulse text-primary" />
              Conversion Progress
              {sessionId && (
                <Badge variant="outline" className="text-xs">
                  Session: {sessionId.slice(-8)}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Converting {totalFiles} files to {useConversionStore.getState().format}
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            {showConnectionStatus && (
              <div className="flex items-center gap-1 text-sm">
                {getConnectionStatusIcon(connectionStatus)}
                <span className="text-muted-foreground">
                  {getConnectionStatusText(connectionStatus)}
                </span>
                {hasError && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={reconnect}
                    className="h-6 px-2"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-6 w-6 p-0"
            >
              {isMinimized ? (
                <Maximize2 className="h-3 w-3" />
              ) : (
                <Minimize2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {!isMinimized && (
        <CardContent className="space-y-4">
          {/* Connection Status Banner */}
          {showConnectionStatus && connectionStatus !== 'connected' && (
            <div className={cn(
              "flex items-center gap-2 p-3 rounded-md border",
              connectionStatus === 'error' && "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-800 dark:text-red-300",
              (connectionStatus === 'connecting' || connectionStatus === 'reconnecting') && "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950/20 dark:border-yellow-800 dark:text-yellow-300"
            )}>
              {getConnectionStatusIcon(connectionStatus)}
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {connectionStatus === 'error' ? 'Connection Lost' : 'Connecting...'}
                </div>
                <div className="text-xs opacity-80">
                  {connectionStatus === 'error' 
                    ? 'Neither SSE nor polling can connect. Progress updates may be delayed.' 
                    : 'Establishing connection for real-time updates...'}
                </div>
              </div>
              {connectionStatus === 'error' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={reconnect}
                  className="h-8"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              )}
            </div>
          )}
          
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Overall Progress</span>
              <span className="font-medium">{Math.round(uploadProgress)}%</span>
            </div>
            <Progress value={uploadProgress} className="h-3" />
          </div>

          {/* Current File */}
          {currentFile && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">Currently processing:</span>
              </div>
              <div className="bg-muted/50 p-2 rounded-md">
                <span className="text-sm font-mono">{currentFile}</span>
              </div>
            </div>
          )}

          {/* Statistics */}
          {showStatistics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{completedFiles}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{remainingFiles}</div>
                <div className="text-xs text-muted-foreground">Remaining</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{errorCount}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{warningCount}</div>
                <div className="text-xs text-muted-foreground">Warnings</div>
              </div>
            </div>
          )}

          {/* Timing Information */}
          {(elapsedTime > 0 || estimatedTimeRemaining) && (
            <div className="flex items-center justify-between text-sm">
              {elapsedTime > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>Elapsed: {formatTime(elapsedTime)}</span>
                </div>
              )}
              {estimatedTimeRemaining && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>Est. remaining: {formatTime(estimatedTimeRemaining)}</span>
                </div>
              )}
            </div>
          )}

          {/* File List */}
          {showFileList && (files.length > 0 || results.length > 0 || errors.length > 0) && (
            <div className="space-y-2">
              <Separator />
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                <span className="text-sm font-medium">File Status</span>
              </div>
              
              <ScrollArea className="h-48 border rounded-md p-2">
                <div className="space-y-1">
                  {files.map((file, index) => {
                    const isCompleted = completedFileNames.has(file.name)
                    const hasError = errors.some(e => e.includes(file.name))
                    const isCurrent = currentFile === file.name
                    
                    return (
                      <div 
                        key={file.name}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-sm text-sm",
                          isCurrent && "bg-primary/10 border border-primary/20",
                          isCompleted && "bg-green-50 border border-green-200",
                          hasError && "bg-red-50 border border-red-200"
                        )}
                      >
                        {isCompleted ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : hasError ? (
                          <XCircle className="h-4 w-4 text-red-600" />
                        ) : isCurrent ? (
                          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                        
                        <span className={cn(
                          "flex-1 truncate",
                          isCompleted && "text-green-700",
                          hasError && "text-red-700",
                          isCurrent && "font-medium"
                        )}>
                          {file.name}
                        </span>
                        
                        <span className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Errors and Warnings */}
          {(errors.length > 0 || warnings.length > 0) && (
            <div className="space-y-2">
              <Separator />
              {errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium text-red-700">Errors</span>
                  </div>
                  <ScrollArea className="max-h-24 border border-red-200 rounded-md p-2 bg-red-50">
                    {errors.map((error, index) => (
                      <div key={index} className="text-xs text-red-800 mb-1">
                        {error}
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              )}
              
              {warnings.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-700">Warnings</span>
                  </div>
                  <ScrollArea className="max-h-24 border border-yellow-200 rounded-md p-2 bg-yellow-50">
                    {warnings.map((warning, index) => (
                      <div key={index} className="text-xs text-yellow-800 mb-1">
                        {warning}
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
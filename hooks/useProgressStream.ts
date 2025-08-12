"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { useConversionStore } from '@/stores/useConversionStore'
import { useNotificationStore } from '@/stores/useNotificationStore'
import { ProgressEvent, ProgressEventType } from '@/services/progress-types'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting' | 'fallback'

interface UseProgressStreamOptions {
  autoReconnect?: boolean
  maxReconnectAttempts?: number
  reconnectDelay?: number
  enableFallbackPolling?: boolean
  pollingInterval?: number
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

export function useProgressStream(
  sessionId: string | null,
  options: UseProgressStreamOptions = {}
) {
  const {
    autoReconnect = true,
    maxReconnectAttempts = 5,
    reconnectDelay = 3000,
    enableFallbackPolling = true,
    pollingInterval = 5000, // Poll every 5 seconds
    onConnect,
    onDisconnect,
    onError
  } = options

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [fallbackMode, setFallbackMode] = useState(false)
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  // Store hooks
  const { 
    setCurrentFile, 
    setUploadProgress,
    setCompletedFiles,
    addCompletedFile,
    addResult,
    addError,
    addWarning,
    isProcessing,
    completedFiles,
    setProcessingState
  } = useConversionStore()
  
  const { success, error: showError, warning, info } = useNotificationStore()

  // Update processing state based on progress events
  const initializeProcessingState = useCallback((sessionId: string) => {
    setProcessingState({
      isProcessing: true,
      sessionId,
      currentFile: null,
      uploadProgress: 0,
      completedFiles: 0
    })
  }, [setProcessingState])

  // Handle progress events
  const handleProgressEvent = useCallback((event: ProgressEvent) => {
    const { type, data } = event
    
    switch (type) {
      case 'connection_established':
        setConnectionStatus('connected')
        setReconnectAttempt(0)
        onConnect?.()
        
        if (data.totalFiles && data.completedFiles !== undefined) {
          const progress = data.totalFiles > 0 
            ? (data.completedFiles / data.totalFiles) * 100 
            : 0
          setUploadProgress(progress)
          setCompletedFiles(data.completedFiles)
        }
        break

      case 'conversion_start':
        initializeProcessingState(event.sessionId)
        if (data.message) {
          info('Conversion started', data.message)
        }
        break

      case 'file_start':
        if (data.currentFile) {
          setCurrentFile(data.currentFile)
          info('Processing file', `Starting: ${data.currentFile}`)
        }
        break

      case 'file_progress':
        if (data.overallPercentage !== undefined) {
          setUploadProgress(data.overallPercentage)
        }
        if (data.completedFiles !== undefined) {
          setCompletedFiles(data.completedFiles)
        }
        break

      case 'file_complete':
        if (data.currentFile) {
          addCompletedFile(data.currentFile)
          success('File completed', `Processed: ${data.currentFile}`)
        }
        if (data.overallPercentage !== undefined) {
          setUploadProgress(data.overallPercentage)
        }
        if (data.completedFiles !== undefined) {
          setCompletedFiles(data.completedFiles)
        }
        break

      case 'file_error':
        if (data.error) {
          addError(data.error)
          showError('File processing error', data.error)
        }
        break

      case 'conversion_complete':
        console.log(`🔔 [Progress Stream] Received conversion_complete event:`, data);
        setConnectionStatus('disconnected')
        setCurrentFile(null)
        setUploadProgress(100)
        
        // Update completed files count from the event data
        if (data.completedFiles !== undefined) {
          setCompletedFiles(data.completedFiles)
        }
        
        if (data.results) {
          data.results.forEach(result => addResult(result))
        }
        
        success(
          'Conversion completed', 
          `Successfully converted ${data.totalFiles || 0} files`
        )
        
        console.log(`✅ [Progress Stream] Processing state set to completed with completedFiles: ${data.completedFiles}`);
        
        // Update processing state to completed
        setProcessingState({
          isProcessing: false,
          sessionId: null,
          currentFile: null,
          uploadProgress: 100,
          completedFiles: data.completedFiles
        })
        
        // Don't show connection errors after successful completion
        // Give more time for UI state to update properly
        setTimeout(() => {
          console.log(`🔌 [Progress Stream] Disconnecting after completion`);
          // Use direct cleanup instead of disconnect callback to avoid circular dependency
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          setConnectionStatus('disconnected');
        }, 2000)
        break

      case 'conversion_error':
        setConnectionStatus('error')
        setCurrentFile(null)
        
        if (data.error) {
          addError(data.error)
          showError('Conversion failed', data.error)
        }
        
        // Update processing state to error
        setProcessingState({
          isProcessing: false,
          sessionId: null,
          currentFile: null,
          uploadProgress: 0,
          completedFiles: 0
        })
        break

      case 'session_expired':
        setConnectionStatus('disconnected')
        warning('Session expired', 'The conversion session has expired')
        // Use direct cleanup instead of disconnect callback to avoid circular dependency
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        break

      default:
        console.log('Unknown progress event type:', type)
    }
  }, [
    onConnect, 
    initializeProcessingState, 
    setCurrentFile, 
    setUploadProgress, 
    setCompletedFiles,
    addCompletedFile, 
    addResult, 
    addError, 
    setProcessingState, 
    success, 
    showError, 
    warning, 
    info
  ])

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (!sessionId || !mountedRef.current) return

    // Prevent multiple simultaneous connections
    if (eventSourceRef.current) {
      console.log('⚠️ [SSE] Connection already exists, closing previous connection')
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setConnectionStatus('connecting')
    
    try {
      console.log(`📡 [SSE] Creating new EventSource connection for session ${sessionId}`)
      const eventSource = new EventSource(`/api/progress/${sessionId}`)
      eventSourceRef.current = eventSource
      
      eventSource.onopen = () => {
        if (mountedRef.current) {
          setConnectionStatus('connected')
          setReconnectAttempt(0)
          console.log(`📡 Connected to progress stream for session ${sessionId}`)
        }
      }
      
      eventSource.onmessage = (event) => {
        if (!mountedRef.current) return
        
        try {
          const progressEvent: ProgressEvent = JSON.parse(event.data)
          handleProgressEvent(progressEvent)
        } catch (error) {
          console.error('Failed to parse progress event:', error)
        }
      }
      
      eventSource.onerror = (event) => {
        if (!mountedRef.current) return
        
        console.error('Progress stream error:', event)
        
        // Check if processing is already completed - don't show errors after success
        if (!isProcessing && completedFiles > 0) {
          console.log('Ignoring connection error - conversion already completed successfully')
          // Use direct cleanup to avoid circular dependency
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          setConnectionStatus('disconnected');
          return
        }
        
        setConnectionStatus('error')
        
        const error = new Error('Progress stream connection failed')
        
        // EventSource doesn't provide status codes, so we need to infer the error type
        // If readyState is CLOSED immediately, it's likely a 404 or connection failure
        const isImmediateClosure = eventSource.readyState === EventSource.CLOSED
        
        // For the first few attempts, assume it might be a timing issue
        // After several attempts, consider it a permanent error
        const isLikelyPermanentError = isImmediateClosure && reconnectAttempt > 2
        
        console.error(`Progress stream error - readyState: ${eventSource.readyState}, reconnectAttempt: ${reconnectAttempt}, isLikelyPermanentError: ${isLikelyPermanentError}`);
        
        // Only call onError for likely permanent errors to avoid noise
        if (isLikelyPermanentError) {
          onError?.(error)
        }
        
        // Attempt reconnection if enabled and not a permanent error
        if (autoReconnect && reconnectAttempt < maxReconnectAttempts && !isLikelyPermanentError) {
          setConnectionStatus('reconnecting')
          setReconnectAttempt(prev => prev + 1)
          
          // Use exponential backoff for reconnection attempts
          const backoffDelay = Math.min(reconnectDelay * Math.pow(1.5, reconnectAttempt), 10000)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              console.log(`🔄 Reconnecting to progress stream (attempt ${reconnectAttempt + 1}) after ${backoffDelay}ms`)
              // Clean up current connection before reconnecting
              if (eventSourceRef.current) {
                eventSourceRef.current.close()
                eventSourceRef.current = null
              }
              connect()
            }
          }, backoffDelay)
        } else if (isLikelyPermanentError) {
          // Trigger fallback polling if enabled
          if (enableFallbackPolling && !fallbackMode) {
            console.log(`🔄 SSE failed permanently, switching to fallback polling mode`)
            startFallbackPolling()
          } else {
            console.error(`❌ Session ${sessionId} likely not found after ${reconnectAttempt} attempts - stopping`)
            // Clear the invalid session from the store
            setProcessingState({
              isProcessing: false,
              sessionId: null,
              currentFile: null,
              uploadProgress: 0,
              completedFiles: 0
            })
            // Clean up connection directly
            if (eventSourceRef.current) {
              eventSourceRef.current.close()
              eventSourceRef.current = null
            }
            setConnectionStatus('disconnected')
          }
        } else {
          console.error(`❌ Max reconnection attempts (${maxReconnectAttempts}) reached`)
          
          // Try fallback mode as last resort
          if (enableFallbackPolling && !fallbackMode) {
            console.log(`🔄 Max reconnection attempts reached, trying fallback polling mode`)
            startFallbackPolling()
          } else {
            console.error(`❌ All connection methods failed - stopping`)
            // Clean up connection directly
            if (eventSourceRef.current) {
              eventSourceRef.current.close()
              eventSourceRef.current = null
            }
            setConnectionStatus('disconnected')
          }
        }
      }
      
    } catch (error) {
      console.error('Failed to create EventSource:', error)
      setConnectionStatus('error')
      onError?.(error as Error)
    }
  }, [
    sessionId,
    handleProgressEvent,
    autoReconnect,
    maxReconnectAttempts,
    reconnectAttempt,
    reconnectDelay,
    onError,
    enableFallbackPolling,
    fallbackMode
  ])

  // Fallback polling mechanism when SSE fails
  const startFallbackPolling = useCallback(() => {
    if (!sessionId || !enableFallbackPolling || !mountedRef.current) return

    console.log(`🔄 [Fallback] Starting polling mode for session ${sessionId}`)
    setFallbackMode(true)
    setConnectionStatus('fallback')

    const poll = async () => {
      if (!mountedRef.current || !sessionId) return

      try {
        console.log(`📡 [Fallback] Polling session ${sessionId} status...`)
        const response = await fetch(`/api/progress/status/${sessionId}`)
        
        if (response.ok) {
          const sessionData = await response.json()
          
          // Update progress based on session data
          if (sessionData.session) {
            const session = sessionData.session
            
            // Update conversion store with session data
            setUploadProgress(session.totalFiles > 0 ? (session.completedFiles / session.totalFiles) * 100 : 0)
            setCompletedFiles(session.completedFiles)
            
            if (session.currentFile) {
              setCurrentFile(session.currentFile)
            }
            
            // Handle completion
            if (session.status === 'completed') {
              console.log(`✅ [Fallback] Session ${sessionId} completed`)
              
              setProcessingState({
                isProcessing: false,
                sessionId: null,
                currentFile: null,
                uploadProgress: 100,
                completedFiles: session.completedFiles
              })
              
              stopFallbackPolling()
              return
            }
          }
          
        } else if (response.status === 404) {
          console.log(`🔍 [Fallback] Session ${sessionId} not found, stopping polling`)
          stopFallbackPolling()
          return
        }
        
      } catch (error) {
        console.error(`❌ [Fallback] Polling error:`, error)
      }
      
      // Schedule next poll
      if (mountedRef.current && fallbackMode) {
        pollingTimeoutRef.current = setTimeout(poll, pollingInterval)
      }
    }

    // Start polling immediately
    poll()
  }, [sessionId, enableFallbackPolling, pollingInterval, setUploadProgress, setCompletedFiles, setCurrentFile, setProcessingState])

  const stopFallbackPolling = useCallback(() => {
    console.log(`🛑 [Fallback] Stopping polling mode`)
    setFallbackMode(false)
    
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current)
      pollingTimeoutRef.current = null
    }
  }, [])

  // Disconnect from SSE stream
  const disconnect = useCallback(() => {
    console.log(`📡 [SSE] Disconnect requested - cleaning up resources`)
    
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      console.log(`🔄 [SSE] Clearing pending reconnection timeout`)
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    // Stop fallback polling
    stopFallbackPolling()
    
    // Close EventSource connection
    if (eventSourceRef.current) {
      console.log(`📡 [SSE] Closing EventSource connection (readyState: ${eventSourceRef.current.readyState})`)
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    
    setConnectionStatus('disconnected')
    onDisconnect?.()
    console.log(`✅ [SSE] Successfully disconnected and cleaned up resources`)
  }, [onDisconnect, stopFallbackPolling])

  // Auto-connect when sessionId changes
  useEffect(() => {
    if (sessionId) {
      connect()
    } else {
      disconnect()
    }
    
    return () => {
      disconnect()
    }
  }, [sessionId]) // Only depend on sessionId, not the functions themselves

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    
    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, [disconnect])

  // Manual reconnect function
  const reconnect = useCallback(() => {
    setReconnectAttempt(0)
    disconnect()
    setTimeout(() => {
      if (mountedRef.current) {
        connect()
      }
    }, 100)
  }, [connect, disconnect])

  return {
    connectionStatus,
    reconnectAttempt,
    maxReconnectAttempts,
    isConnected: connectionStatus === 'connected',
    isConnecting: connectionStatus === 'connecting',
    isReconnecting: connectionStatus === 'reconnecting',
    hasError: connectionStatus === 'error',
    connect,
    disconnect,
    reconnect
  }
}
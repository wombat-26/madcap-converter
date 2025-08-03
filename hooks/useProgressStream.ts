"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { useConversionStore } from '@/stores/useConversionStore'
import { useNotificationStore } from '@/stores/useNotificationStore'
import { ProgressEvent, ProgressEventType } from '@/services/progress-types'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting'

interface UseProgressStreamOptions {
  autoReconnect?: boolean
  maxReconnectAttempts?: number
  reconnectDelay?: number
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
    onConnect,
    onDisconnect,
    onError
  } = options

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  // Store hooks
  const { 
    setCurrentFile, 
    setUploadProgress,
    setCompletedFiles,
    addResult,
    addError,
    addWarning,
    isProcessing,
    setProcessingState
  } = useConversionStore()
  
  const { success, error: showError, warning, info } = useNotificationStore()

  // Update processing state based on progress events
  const initializeProcessingState = useCallback((sessionId: string) => {
    const state = useConversionStore.getState()
    state.setProcessingState({
      isProcessing: true,
      sessionId,
      currentFile: null,
      uploadProgress: 0,
      completedFiles: 0
    })
  }, [])

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
        setConnectionStatus('disconnected')
        setCurrentFile(null)
        setUploadProgress(100)
        
        if (data.results) {
          data.results.forEach(result => addResult(result))
        }
        
        success(
          'Conversion completed', 
          `Successfully converted ${data.totalFiles || 0} files`
        )
        
        // Update processing state to completed
        useConversionStore.getState().setProcessingState({
          isProcessing: false,
          sessionId: null,
          currentFile: null,
          uploadProgress: 100
        })
        break

      case 'conversion_error':
        setConnectionStatus('error')
        setCurrentFile(null)
        
        if (data.error) {
          addError(data.error)
          showError('Conversion failed', data.error)
        }
        
        // Update processing state to error
        useConversionStore.getState().setProcessingState({
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
        disconnect()
        break

      default:
        console.log('Unknown progress event type:', type)
    }
  }, [
    setCurrentFile,
    setUploadProgress,
    setCompletedFiles,
    addResult,
    addError,
    addWarning,
    success,
    showError,
    warning,
    info,
    onConnect,
    initializeProcessingState
  ])

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (!sessionId || !mountedRef.current) return

    setConnectionStatus('connecting')
    
    try {
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
        setConnectionStatus('error')
        
        const error = new Error('Progress stream connection failed')
        onError?.(error)
        
        // Check if this looks like a 404 error (EventSource readyState will be CLOSED for 404)
        const isSessionNotFound = eventSource.readyState === EventSource.CLOSED
        
        // Attempt reconnection if enabled and not a permanent error
        if (autoReconnect && reconnectAttempt < maxReconnectAttempts && !isSessionNotFound) {
          setConnectionStatus('reconnecting')
          setReconnectAttempt(prev => prev + 1)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              console.log(`🔄 Reconnecting to progress stream (attempt ${reconnectAttempt + 1})`)
              disconnect()
              connect()
            }
          }, reconnectDelay)
        } else if (isSessionNotFound) {
          console.error(`❌ Session ${sessionId} not found - stopping reconnection attempts`)
          // Clear the invalid session from the store
          useConversionStore.getState().setProcessingState({
            isProcessing: false,
            sessionId: null,
            currentFile: null,
            uploadProgress: 0,
            completedFiles: 0
          })
          disconnect()
        } else {
          console.error(`❌ Max reconnection attempts (${maxReconnectAttempts}) reached - stopping`)
          disconnect()
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
    onError
  ])

  // Disconnect from SSE stream
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    
    setConnectionStatus('disconnected')
    onDisconnect?.()
    console.log(`📡 Disconnected from progress stream`)
  }, [onDisconnect])

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
  }, [sessionId, connect, disconnect])

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
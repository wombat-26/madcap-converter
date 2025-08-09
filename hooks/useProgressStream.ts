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
    
    // Get store functions directly to avoid dependency issues
    const conversionStore = useConversionStore.getState()
    const notificationStore = useNotificationStore.getState()
    
    switch (type) {
      case 'connection_established':
        setConnectionStatus('connected')
        setReconnectAttempt(0)
        onConnect?.()
        
        if (data.totalFiles && data.completedFiles !== undefined) {
          const progress = data.totalFiles > 0 
            ? (data.completedFiles / data.totalFiles) * 100 
            : 0
          conversionStore.setUploadProgress(progress)
          conversionStore.setCompletedFiles(data.completedFiles)
        }
        break

      case 'conversion_start':
        initializeProcessingState(event.sessionId)
        if (data.message) {
          notificationStore.info('Conversion started', data.message)
        }
        break

      case 'file_start':
        if (data.currentFile) {
          conversionStore.setCurrentFile(data.currentFile)
          notificationStore.info('Processing file', `Starting: ${data.currentFile}`)
        }
        break

      case 'file_progress':
        if (data.overallPercentage !== undefined) {
          conversionStore.setUploadProgress(data.overallPercentage)
        }
        if (data.completedFiles !== undefined) {
          conversionStore.setCompletedFiles(data.completedFiles)
        }
        break

      case 'file_complete':
        if (data.currentFile) {
          notificationStore.success('File completed', `Processed: ${data.currentFile}`)
        }
        if (data.overallPercentage !== undefined) {
          conversionStore.setUploadProgress(data.overallPercentage)
        }
        if (data.completedFiles !== undefined) {
          conversionStore.setCompletedFiles(data.completedFiles)
        }
        break

      case 'file_error':
        if (data.error) {
          conversionStore.addError(data.error)
          notificationStore.error('File processing error', data.error)
        }
        break

      case 'conversion_complete':
        console.log(`🔔 [Progress Stream] Received conversion_complete event:`, data);
        setConnectionStatus('disconnected')
        conversionStore.setCurrentFile(null)
        conversionStore.setUploadProgress(100)
        
        // Update completed files count from the event data
        if (data.completedFiles !== undefined) {
          conversionStore.setCompletedFiles(data.completedFiles)
        }
        
        if (data.results) {
          data.results.forEach(result => conversionStore.addResult(result))
        }
        
        notificationStore.success(
          'Conversion completed', 
          `Successfully converted ${data.totalFiles || 0} files`
        )
        
        console.log(`✅ [Progress Stream] Processing state set to completed with completedFiles: ${data.completedFiles}`);
        
        // Update processing state to completed
        conversionStore.setProcessingState({
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
          disconnect()
        }, 2000)
        break

      case 'conversion_error':
        setConnectionStatus('error')
        conversionStore.setCurrentFile(null)
        
        if (data.error) {
          conversionStore.addError(data.error)
          notificationStore.error('Conversion failed', data.error)
        }
        
        // Update processing state to error
        conversionStore.setProcessingState({
          isProcessing: false,
          sessionId: null,
          currentFile: null,
          uploadProgress: 0,
          completedFiles: 0
        })
        break

      case 'session_expired':
        setConnectionStatus('disconnected')
        notificationStore.warning('Session expired', 'The conversion session has expired')
        disconnect()
        break

      default:
        console.log('Unknown progress event type:', type)
    }
  }, [onConnect, initializeProcessingState]) // Minimal dependencies

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
        const currentState = useConversionStore.getState()
        if (!currentState.isProcessing && currentState.completedFiles > 0) {
          console.log('Ignoring connection error - conversion already completed successfully')
          disconnect()
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
              disconnect()
              connect()
            }
          }, backoffDelay)
        } else if (isLikelyPermanentError) {
          console.error(`❌ Session ${sessionId} likely not found after ${reconnectAttempt} attempts - stopping`)
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
    console.log(`📡 [SSE] Disconnect requested - cleaning up resources`)
    
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      console.log(`🔄 [SSE] Clearing pending reconnection timeout`)
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    // Close EventSource connection
    if (eventSourceRef.current) {
      console.log(`📡 [SSE] Closing EventSource connection (readyState: ${eventSourceRef.current.readyState})`)
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    
    setConnectionStatus('disconnected')
    onDisconnect?.()
    console.log(`✅ [SSE] Successfully disconnected and cleaned up resources`)
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
import { v4 as uuidv4 } from 'uuid'

export type ProgressEventType = 
  | 'conversion_start'
  | 'file_start' 
  | 'file_progress'
  | 'file_complete'
  | 'file_error'
  | 'conversion_complete'
  | 'conversion_error'
  | 'connection_established'
  | 'session_expired'

export interface ProgressEventData {
  // Overall progress
  totalFiles?: number
  completedFiles?: number
  currentFileIndex?: number
  overallPercentage?: number
  
  // Current file info
  currentFile?: string
  currentFilePercentage?: number
  
  // Status and messaging
  message?: string
  phase?: string
  
  // Error information
  error?: string
  errorStack?: string
  
  // Timing information
  startTime?: number
  estimatedCompletionTime?: number
  
  // Statistics
  processedSize?: number
  totalSize?: number
  filesPerSecond?: number
  
  // Results
  results?: any[]
  warnings?: string[]
  
  // Resource analysis for folder processing
  resourceAnalysis?: {
    totalFiles: number
    supportedFiles: number
    snippetFiles: number
    imageFiles: number
    usedFallbackStructure: boolean
  }
}

export interface ProgressEvent {
  sessionId: string
  type: ProgressEventType
  timestamp: number
  data: ProgressEventData
}

export interface ConversionSession {
  id: string
  startTime: number
  status: 'active' | 'completed' | 'error' | 'cancelled'
  totalFiles: number
  completedFiles: number
  currentFile?: string
  errors: string[]
  warnings: string[]
  results: any
  lastUpdate: number
  estimatedCompletionTime?: number
  clientCount: number
}

export interface ProgressClient {
  id: string
  sessionId: string
  controller: ReadableStreamDefaultController
  lastPing: number
}

export class ProgressEventFactory {
  static create(
    sessionId: string, 
    type: ProgressEventType, 
    data: ProgressEventData = {}
  ): ProgressEvent {
    return {
      sessionId,
      type,
      timestamp: Date.now(),
      data
    }
  }
  
  static toSSE(event: ProgressEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`
  }
  
  static heartbeat(sessionId: string): string {
    return ProgressEventFactory.toSSE(
      ProgressEventFactory.create(sessionId, 'connection_established')
    )
  }
}
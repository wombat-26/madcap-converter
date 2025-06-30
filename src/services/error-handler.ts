import { promises as fs } from 'fs';
import { dirname } from 'path';

export interface FileOperation {
  operation: string;
  path: string;
  error?: Error;
  timestamp: Date;
}

export interface ValidationError {
  type: 'missing_file' | 'invalid_path' | 'permission_denied' | 'corrupted_file' | 'size_limit' | 'format_invalid';
  path: string;
  message: string;
  details?: any;
}

export class ErrorHandler {
  private static readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  private static readonly SUPPORTED_EXTENSIONS = ['.htm', '.html', '.docx', '.doc', '.md', '.adoc'];
  
  private operationLog: FileOperation[] = [];

  /**
   * Safe file read with comprehensive error handling
   */
  async safeReadFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    try {
      this.logOperation('read', filePath);
      
      // Validate path first
      await this.validateFilePath(filePath, 'read');
      
      const content = await fs.readFile(filePath, encoding);
      return content;
    } catch (error) {
      const enhancedError = this.enhanceError(error as Error, 'read', filePath);
      this.logOperation('read', filePath, enhancedError);
      throw enhancedError;
    }
  }

  /**
   * Safe file write with directory creation and error handling
   */
  async safeWriteFile(filePath: string, content: string, encoding: BufferEncoding = 'utf8'): Promise<void> {
    try {
      this.logOperation('write', filePath);
      
      // Validate path and ensure directory exists
      await this.validateFilePath(filePath, 'write');
      await this.ensureDirectoryExists(dirname(filePath));
      
      await fs.writeFile(filePath, content, encoding);
    } catch (error) {
      const enhancedError = this.enhanceError(error as Error, 'write', filePath);
      this.logOperation('write', filePath, enhancedError);
      throw enhancedError;
    }
  }

  /**
   * Safe file copy with error handling
   */
  async safeCopyFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      this.logOperation('copy', `${sourcePath} -> ${destPath}`);
      
      // Validate both paths
      await this.validateFilePath(sourcePath, 'read');
      await this.validateFilePath(destPath, 'write');
      await this.ensureDirectoryExists(dirname(destPath));
      
      await fs.copyFile(sourcePath, destPath);
    } catch (error) {
      const enhancedError = this.enhanceError(error as Error, 'copy', `${sourcePath} -> ${destPath}`);
      this.logOperation('copy', `${sourcePath} -> ${destPath}`, enhancedError);
      throw enhancedError;
    }
  }

  /**
   * Safe directory creation with error handling
   */
  async safeCreateDirectory(dirPath: string): Promise<void> {
    try {
      this.logOperation('mkdir', dirPath);
      await this.ensureDirectoryExists(dirPath);
    } catch (error) {
      const enhancedError = this.enhanceError(error as Error, 'mkdir', dirPath);
      this.logOperation('mkdir', dirPath, enhancedError);
      throw enhancedError;
    }
  }

  /**
   * Check if file exists safely
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats safely
   */
  async safeGetStats(filePath: string): Promise<import('fs').Stats | null> {
    try {
      return await fs.stat(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Validate file path and permissions
   */
  private async validateFilePath(filePath: string, operation: 'read' | 'write'): Promise<void> {
    const errors: ValidationError[] = [];

    // Basic path validation
    if (!filePath || filePath.trim() === '') {
      errors.push({
        type: 'invalid_path',
        path: filePath,
        message: 'File path cannot be empty'
      });
    }

    // Path traversal protection
    if (filePath.includes('..')) {
      errors.push({
        type: 'invalid_path',
        path: filePath,
        message: 'Path traversal detected - relative paths with ".." are not allowed'
      });
    }

    // For read operations, check if file exists
    if (operation === 'read') {
      const exists = await this.fileExists(filePath);
      if (!exists) {
        errors.push({
          type: 'missing_file',
          path: filePath,
          message: 'File does not exist'
        });
      } else {
        // Check file size
        const stats = await this.safeGetStats(filePath);
        if (stats && stats.size > ErrorHandler.MAX_FILE_SIZE) {
          errors.push({
            type: 'size_limit',
            path: filePath,
            message: `File size (${this.formatBytes(stats.size)}) exceeds maximum allowed size (${this.formatBytes(ErrorHandler.MAX_FILE_SIZE)})`
          });
        }

        // Check file extension for supported formats
        const isSupported = ErrorHandler.SUPPORTED_EXTENSIONS.some(ext => 
          filePath.toLowerCase().endsWith(ext)
        );
        if (!isSupported) {
          errors.push({
            type: 'format_invalid',
            path: filePath,
            message: `Unsupported file format. Supported formats: ${ErrorHandler.SUPPORTED_EXTENSIONS.join(', ')}`
          });
        }
      }
    }

    // For write operations, check if directory is writable
    if (operation === 'write') {
      const dir = dirname(filePath);
      try {
        await fs.access(dir, fs.constants.W_OK);
      } catch {
        // Directory doesn't exist or isn't writable - will be created by ensureDirectoryExists
      }
    }

    if (errors.length > 0) {
      const error = new Error(`File validation failed: ${errors.map(e => e.message).join('; ')}`);
      (error as any).validationErrors = errors;
      throw error;
    }
  }

  /**
   * Ensure directory exists, create if it doesn't
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw new Error(`Failed to create directory ${dirPath}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Enhance error with additional context
   */
  private enhanceError(error: Error, operation: string, path: string): Error {
    const enhancedError = new Error(
      `File operation '${operation}' failed for path '${path}': ${error.message}`
    );
    
    // Preserve original error properties
    (enhancedError as any).originalError = error;
    (enhancedError as any).operation = operation;
    (enhancedError as any).path = path;
    (enhancedError as any).code = (error as any).code;
    (enhancedError as any).errno = (error as any).errno;
    
    // Add user-friendly messages for common errors
    const code = (error as any).code;
    if (code === 'ENOENT') {
      (enhancedError as any).userMessage = `File or directory not found: ${path}`;
    } else if (code === 'EACCES' || code === 'EPERM') {
      (enhancedError as any).userMessage = `Permission denied accessing: ${path}`;
    } else if (code === 'ENOSPC') {
      (enhancedError as any).userMessage = `Insufficient disk space for operation on: ${path}`;
    } else if (code === 'EMFILE' || code === 'ENFILE') {
      (enhancedError as any).userMessage = `Too many open files - system limit reached`;
    } else {
      (enhancedError as any).userMessage = `Unexpected error with file: ${path}`;
    }

    return enhancedError;
  }

  /**
   * Log file operations for debugging
   */
  private logOperation(operation: string, path: string, error?: Error): void {
    const logEntry: FileOperation = {
      operation,
      path,
      error,
      timestamp: new Date()
    };
    
    this.operationLog.push(logEntry);
    
    // Keep only last 1000 operations to prevent memory leaks
    if (this.operationLog.length > 1000) {
      this.operationLog = this.operationLog.slice(-1000);
    }

    // Log to console for debugging
    // Only log errors to stderr, suppress success messages to avoid flooding MCP output
    if (error) {
      console.error(`[ERROR] ${operation} failed for ${path}:`, error.message);
    }
    // Success logging disabled to prevent MCP protocol issues with large batch operations
  }

  /**
   * Get recent operation log for debugging
   */
  getOperationLog(): FileOperation[] {
    return [...this.operationLog];
  }

  /**
   * Get error summary for reporting
   */
  getErrorSummary(): { operation: string; count: number }[] {
    const errorCounts = new Map<string, number>();
    
    this.operationLog
      .filter(op => op.error)
      .forEach(op => {
        const key = op.operation;
        errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
      });

    return Array.from(errorCounts.entries()).map(([operation, count]) => ({
      operation,
      count
    }));
  }

  /**
   * Clear operation log
   */
  clearLog(): void {
    this.operationLog = [];
  }

  /**
   * Format bytes for human-readable display
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Singleton instance for shared use
export const errorHandler = new ErrorHandler();
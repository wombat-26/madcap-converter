export interface ProgressStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  progress?: number; // 0-100
  message?: string;
  details?: any;
}

export interface ProgressReport {
  id: string;
  name: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  currentStep?: ProgressStep;
  steps: ProgressStep[];
  startTime: Date;
  endTime?: Date;
  overallProgress: number; // 0-100
  estimatedTimeRemaining?: number; // milliseconds
}

export type ProgressCallback = (report: ProgressReport) => void;

export class ProgressReporter {
  private reports: Map<string, ProgressReport> = new Map();
  private callbacks: Set<ProgressCallback> = new Set();

  /**
   * Create a new progress report
   */
  createReport(id: string, name: string, stepNames: string[]): ProgressReport {
    const steps: ProgressStep[] = stepNames.map((stepName, index) => ({
      id: `${id}-step-${index}`,
      name: stepName,
      status: 'pending'
    }));

    const report: ProgressReport = {
      id,
      name,
      totalSteps: steps.length,
      completedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      steps,
      startTime: new Date(),
      overallProgress: 0
    };

    this.reports.set(id, report);
    this.notifyCallbacks(report);
    return report;
  }

  /**
   * Start a specific step
   */
  startStep(reportId: string, stepId: string, message?: string): void {
    const report = this.reports.get(reportId);
    if (!report) return;

    const step = report.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'in_progress';
    step.startTime = new Date();
    step.message = message;
    step.progress = 0;

    report.currentStep = step;
    this.updateOverallProgress(report);
    this.notifyCallbacks(report);
  }

  /**
   * Update step progress
   */
  updateStepProgress(reportId: string, stepId: string, progress: number, message?: string): void {
    const report = this.reports.get(reportId);
    if (!report) return;

    const step = report.steps.find(s => s.id === stepId);
    if (!step) return;

    step.progress = Math.max(0, Math.min(100, progress));
    if (message) {
      step.message = message;
    }

    this.updateOverallProgress(report);
    this.notifyCallbacks(report);
  }

  /**
   * Complete a step successfully
   */
  completeStep(reportId: string, stepId: string, message?: string): void {
    const report = this.reports.get(reportId);
    if (!report) return;

    const step = report.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'completed';
    step.endTime = new Date();
    step.progress = 100;
    if (message) {
      step.message = message;
    }

    report.completedSteps++;
    
    // Move to next pending step if available
    const nextStep = report.steps.find(s => s.status === 'pending');
    report.currentStep = nextStep;

    this.updateOverallProgress(report);
    this.checkCompletion(report);
    this.notifyCallbacks(report);
  }

  /**
   * Fail a step
   */
  failStep(reportId: string, stepId: string, error: string | Error): void {
    const report = this.reports.get(reportId);
    if (!report) return;

    const step = report.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'failed';
    step.endTime = new Date();
    step.message = error instanceof Error ? error.message : error;
    step.details = error instanceof Error ? {
      name: error.name,
      stack: error.stack
    } : undefined;

    report.failedSteps++;
    
    // Move to next pending step if available
    const nextStep = report.steps.find(s => s.status === 'pending');
    report.currentStep = nextStep;

    this.updateOverallProgress(report);
    this.checkCompletion(report);
    this.notifyCallbacks(report);
  }

  /**
   * Skip a step
   */
  skipStep(reportId: string, stepId: string, reason?: string): void {
    const report = this.reports.get(reportId);
    if (!report) return;

    const step = report.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'skipped';
    step.endTime = new Date();
    step.message = reason || 'Step skipped';

    report.skippedSteps++;
    
    // Move to next pending step if available
    const nextStep = report.steps.find(s => s.status === 'pending');
    report.currentStep = nextStep;

    this.updateOverallProgress(report);
    this.checkCompletion(report);
    this.notifyCallbacks(report);
  }

  /**
   * Complete the entire report
   */
  completeReport(reportId: string, message?: string): void {
    const report = this.reports.get(reportId);
    if (!report) return;

    report.endTime = new Date();
    report.currentStep = undefined;
    
    // Complete any remaining pending steps
    report.steps.forEach(step => {
      if (step.status === 'pending') {
        step.status = 'skipped';
        step.message = 'Report completed early';
        report.skippedSteps++;
      }
    });

    this.updateOverallProgress(report);
    this.notifyCallbacks(report);
  }

  /**
   * Get a specific report
   */
  getReport(reportId: string): ProgressReport | undefined {
    return this.reports.get(reportId);
  }

  /**
   * Get all reports
   */
  getAllReports(): ProgressReport[] {
    return Array.from(this.reports.values());
  }

  /**
   * Subscribe to progress updates
   */
  onProgress(callback: ProgressCallback): () => void {
    this.callbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Clear old reports to prevent memory leaks
   */
  clearOldReports(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);
    
    for (const [id, report] of this.reports.entries()) {
      if (report.endTime && report.endTime < cutoff) {
        this.reports.delete(id);
      }
    }
  }

  /**
   * Update overall progress calculation
   */
  private updateOverallProgress(report: ProgressReport): void {
    if (report.totalSteps === 0) {
      report.overallProgress = 100;
      return;
    }

    let totalProgress = 0;
    
    report.steps.forEach(step => {
      if (step.status === 'completed') {
        totalProgress += 100;
      } else if (step.status === 'in_progress' && step.progress !== undefined) {
        totalProgress += step.progress;
      } else if (step.status === 'skipped') {
        totalProgress += 100; // Count skipped as completed for progress calculation
      }
      // Failed and pending steps contribute 0
    });

    report.overallProgress = Math.round(totalProgress / report.totalSteps);

    // Calculate estimated time remaining
    if (report.overallProgress > 0 && report.overallProgress < 100) {
      const elapsed = Date.now() - report.startTime.getTime();
      const rate = report.overallProgress / elapsed;
      report.estimatedTimeRemaining = Math.round((100 - report.overallProgress) / rate);
    }
  }

  /**
   * Check if report is complete
   */
  private checkCompletion(report: ProgressReport): void {
    const hasOnlyCompletedSkippedOrFailed = report.steps.every(step => 
      step.status === 'completed' || step.status === 'skipped' || step.status === 'failed'
    );

    if (hasOnlyCompletedSkippedOrFailed && !report.endTime) {
      report.endTime = new Date();
      report.currentStep = undefined;
    }
  }

  /**
   * Notify all callbacks
   */
  private notifyCallbacks(report: ProgressReport): void {
    this.callbacks.forEach(callback => {
      try {
        callback(report);
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    });
  }

  /**
   * Format progress report for console display
   */
  static formatConsoleReport(report: ProgressReport): string {
    const { name, overallProgress, completedSteps, totalSteps, currentStep } = report;
    
    let output = `📊 ${name}: ${overallProgress}% (${completedSteps}/${totalSteps})\n`;
    
    if (currentStep) {
      const stepProgress = currentStep.progress || 0;
      output += `   🔄 ${currentStep.name}: ${stepProgress}%`;
      if (currentStep.message) {
        output += ` - ${currentStep.message}`;
      }
      output += '\n';
    }

    if (report.estimatedTimeRemaining) {
      const timeStr = this.formatDuration(report.estimatedTimeRemaining);
      output += `   ⏱️ Est. time remaining: ${timeStr}\n`;
    }

    const elapsed = Date.now() - report.startTime.getTime();
    output += `   ⏰ Elapsed: ${this.formatDuration(elapsed)}`;

    return output;
  }

  /**
   * Format progress report for detailed display
   */
  static formatDetailedReport(report: ProgressReport): string {
    const { name, steps, overallProgress, startTime, endTime } = report;
    
    let output = `📊 Progress Report: ${name}\n`;
    output += `${'='.repeat(50)}\n\n`;
    output += `Overall Progress: ${overallProgress}%\n`;
    output += `Started: ${startTime.toLocaleString()}\n`;
    if (endTime) {
      output += `Completed: ${endTime.toLocaleString()}\n`;
      output += `Total Duration: ${this.formatDuration(endTime.getTime() - startTime.getTime())}\n`;
    }
    output += '\n';

    output += `Steps:\n`;
    steps.forEach((step, index) => {
      const status = this.getStatusIcon(step.status);
      const duration = step.startTime && step.endTime 
        ? ` (${this.formatDuration(step.endTime.getTime() - step.startTime.getTime())})`
        : '';
      
      output += `${index + 1}. ${status} ${step.name}`;
      if (step.progress !== undefined && step.status === 'in_progress') {
        output += ` - ${step.progress}%`;
      }
      output += duration;
      if (step.message) {
        output += ` - ${step.message}`;
      }
      output += '\n';
    });

    return output;
  }

  /**
   * Get status icon for display
   */
  private static getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '🔄';
      case 'failed': return '❌';
      case 'skipped': return '⏭️';
      case 'pending': return '⏳';
      default: return '❓';
    }
  }

  /**
   * Format duration in human-readable format
   */
  private static formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Global progress reporter instance
export const progressReporter = new ProgressReporter();
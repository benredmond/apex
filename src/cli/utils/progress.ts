/**
 * Progress indicator utilities for better UX
 */

import ora from "ora";
import chalk from "chalk";
import { ApexConfig } from "../../config/apex-config.js";

/**
 * Performance timer for tracking operation times
 */
export class PerformanceTimer {
  private startTime: number;
  private operationName: string;
  private targetTime: number;

  constructor(
    operationName: string,
    targetTime: number = ApexConfig.COMMAND_TIMEOUT,
  ) {
    this.operationName = operationName;
    this.targetTime = targetTime;
    this.startTime = Date.now();
  }

  /**
   * Stop the timer and return elapsed time
   */
  stop(): number {
    const elapsed = Date.now() - this.startTime;

    // Log warning if operation was slow
    if (elapsed > this.targetTime) {
      console.warn(
        chalk.yellow(
          `⚠️  Performance: ${this.operationName} took ${elapsed}ms (target: <${this.targetTime}ms)`,
        ),
      );
    }

    return elapsed;
  }

  /**
   * Get elapsed time without stopping
   */
  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Format elapsed time for display
   */
  formatElapsed(): string {
    const elapsed = this.getElapsed();
    if (elapsed < 1000) {
      return `${elapsed}ms`;
    }
    return `${(elapsed / 1000).toFixed(1)}s`;
  }
}

export class ProgressIndicator {
  private spinner: any;
  private startTime: number;

  /**
   * Start a progress indicator if operation might be slow
   */
  static async withProgress<T>(
    promise: Promise<T>,
    message: string,
    options: { showAfter?: number } = {},
  ): Promise<T> {
    const showAfter = options.showAfter ?? ApexConfig.PROGRESS_THRESHOLD;
    let spinner: any = null;
    let timeoutId: NodeJS.Timeout | null = null;

    // Only show spinner if operation takes longer than threshold
    timeoutId = setTimeout(() => {
      spinner = ora(message).start();
    }, showAfter);

    try {
      const result = await promise;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (spinner) {
        spinner.stop();
      }

      return result;
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (spinner) {
        spinner.fail(chalk.red("Failed"));
      }

      throw error;
    }
  }

  /**
   * Track performance and warn if slow
   */
  static trackPerformance(operationName: string): () => void {
    const startTime = Date.now();

    return () => {
      const elapsed = Date.now() - startTime;

      if (elapsed > ApexConfig.COMMAND_TIMEOUT) {
        console.warn(
          chalk.yellow(
            `⚠️  Slow operation: ${operationName} took ${elapsed}ms (target: <${ApexConfig.COMMAND_TIMEOUT}ms)`,
          ),
        );
      }
    };
  }

  /**
   * Show a temporary success message
   */
  static showSuccess(message: string): void {
    const spinner = ora(message).start();
    spinner.succeed();
  }

  /**
   * Show a temporary warning
   */
  static showWarning(message: string): void {
    const spinner = ora(message).start();
    spinner.warn();
  }

  /**
   * Show a temporary error
   */
  static showError(message: string): void {
    const spinner = ora(message).start();
    spinner.fail();
  }
}

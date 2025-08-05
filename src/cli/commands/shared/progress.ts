// [PAT:BUILD:MODULE:ESM] ★★★☆☆ (3 uses, 100% success) - ES modules with .js extensions

import ora, { Ora } from "ora";
import chalk from "chalk";

/**
 * Progress indicator utilities for long-running operations
 */

export interface ProgressOptions {
  text: string;
  color?: string;
  spinner?: string;
}

/**
 * Create a progress spinner
 */
export function createSpinner(options: ProgressOptions | string): Ora {
  const config = typeof options === "string" ? { text: options } : options;

  return ora({
    text: config.text,
    color: (config.color as any) || "cyan",
    spinner: (config.spinner || "dots") as any,
  });
}

/**
 * Progress tracker for multi-step operations
 */
export class ProgressTracker {
  private spinner: Ora;
  private steps: string[];
  private currentStep: number;
  private startTime: number;

  constructor(steps: string[], initialText?: string) {
    this.steps = steps;
    this.currentStep = 0;
    this.startTime = Date.now();
    this.spinner = ora({
      text: initialText || this.getCurrentText(),
      color: "cyan",
    });
  }

  /**
   * Start the progress tracker
   */
  start(): void {
    this.spinner.start();
  }

  /**
   * Move to next step
   */
  nextStep(): void {
    if (this.currentStep < this.steps.length) {
      this.currentStep++;
      this.spinner.text = this.getCurrentText();
    }
  }

  /**
   * Update current step text
   */
  updateText(text: string): void {
    this.spinner.text = text;
  }

  /**
   * Mark as successful
   */
  succeed(text?: string): void {
    const duration = Date.now() - this.startTime;
    const finalText = text || `Completed in ${this.formatDuration(duration)}`;
    this.spinner.succeed(finalText);
  }

  /**
   * Mark as failed
   */
  fail(text?: string): void {
    this.spinner.fail(text || "Operation failed");
  }

  /**
   * Stop without status
   */
  stop(): void {
    this.spinner.stop();
  }

  /**
   * Get current step text
   */
  private getCurrentText(): string {
    if (this.currentStep >= this.steps.length) {
      return "Completing...";
    }
    const progress = `[${this.currentStep + 1}/${this.steps.length}]`;
    return `${chalk.gray(progress)} ${this.steps[this.currentStep]}`;
  }

  /**
   * Format duration
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}

/**
 * Performance timer for measuring operation duration
 */
export class PerformanceTimer {
  private startTime: bigint;
  private checkpoints: Map<string, bigint>;

  constructor() {
    this.startTime = process.hrtime.bigint();
    this.checkpoints = new Map();
  }

  /**
   * Add a checkpoint
   */
  checkpoint(name: string): void {
    this.checkpoints.set(name, process.hrtime.bigint());
  }

  /**
   * Get elapsed time in milliseconds
   */
  elapsed(): number {
    const end = process.hrtime.bigint();
    return Number(end - this.startTime) / 1e6;
  }

  /**
   * Get elapsed time for a checkpoint
   */
  elapsedSince(checkpoint: string): number | null {
    const checkpointTime = this.checkpoints.get(checkpoint);
    if (!checkpointTime) return null;

    const end = process.hrtime.bigint();
    return Number(end - checkpointTime) / 1e6;
  }

  /**
   * Get all checkpoint timings
   */
  getTimings(): Record<string, number> {
    const timings: Record<string, number> = {};

    for (const [name, time] of this.checkpoints) {
      timings[name] = Number(time - this.startTime) / 1e6;
    }

    timings.total = this.elapsed();
    return timings;
  }

  /**
   * Check if operation meets performance requirement
   */
  meetsRequirement(maxMs: number): boolean {
    return this.elapsed() < maxMs;
  }
}

/**
 * Display progress for async operations with timeout
 */
export async function withProgress<T>(
  promise: Promise<T>,
  text: string,
  timeoutMs?: number,
): Promise<T> {
  const spinner = ora(text).start();

  try {
    if (timeoutMs) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Operation timed out")), timeoutMs);
      });

      const result = await Promise.race([promise, timeoutPromise]);
      spinner.succeed();
      return result;
    } else {
      const result = await promise;
      spinner.succeed();
      return result;
    }
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

/**
 * Display progress for multiple parallel operations
 */
export async function withParallelProgress<T>(
  operations: Array<{ promise: Promise<T>; name: string }>,
  title: string,
): Promise<T[]> {
  const spinner = ora(`${title} (0/${operations.length})`).start();
  let completed = 0;

  const promises = operations.map(async ({ promise, name }) => {
    try {
      const result = await promise;
      completed++;
      spinner.text = `${title} (${completed}/${operations.length}) - Completed: ${name}`;
      return result;
    } catch (error) {
      spinner.text = `${title} (${completed}/${operations.length}) - Failed: ${name}`;
      throw error;
    }
  });

  try {
    const results = await Promise.all(promises);
    spinner.succeed(`${title} - All operations completed`);
    return results;
  } catch (error) {
    spinner.fail(`${title} - Some operations failed`);
    throw error;
  }
}

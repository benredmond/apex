// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import chokidar from "chokidar";
import { EventEmitter } from "events";
import path from "path";
import type { FileChangeEvent } from "./types.js";

export class PatternWatcher extends EventEmitter {
  private watcher?: chokidar.FSWatcher;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number;
  private watchPath: string;

  constructor(watchPath: string = ".apex/patterns", debounceMs: number = 200) {
    super();
    this.watchPath = watchPath;
    this.debounceMs = debounceMs;
  }

  /**
   * Start watching for file changes
   */
  public start(): void {
    if (this.watcher) {
      throw new Error("Watcher already started");
    }

    const patterns = ["**/*.yaml", "**/*.yml", "**/*.json"];
    const fullPatterns = patterns.map((p) => path.join(this.watchPath, p));

    this.watcher = chokidar.watch(fullPatterns, {
      ignoreInitial: false,
      persistent: false, // Don't keep process alive
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100,
      },
    });

    // Set up event handlers
    this.watcher
      .on("add", (filePath) => this.handleChange(filePath, "add"))
      .on("change", (filePath) => this.handleChange(filePath, "change"))
      .on("unlink", (filePath) => this.handleChange(filePath, "unlink"))
      .on("error", (error) => this.emit("error", error))
      .on("ready", () => this.emit("ready"));
  }

  /**
   * Stop watching
   */
  public async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }

    // Clear any pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Handle file change with debouncing
   */
  private handleChange(filePath: string, type: FileChangeEvent["type"]): void {
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);

      const event: FileChangeEvent = {
        path: filePath,
        type,
        timestamp: Date.now(),
      };

      this.emit("change", event);
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Get list of watched paths
   */
  public getWatched(): Record<string, string[]> {
    return this.watcher?.getWatched() || {};
  }

  /**
   * Wait for a specific file to be processed
   * Returns a promise that resolves when the file change event is emitted
   * [FIX:TEST:TIMING] - Event-based synchronization for tests
   */
  public waitForFile(filePath: string, timeout: number = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.removeListener("change", handler);
          reject(new Error(`Timeout waiting for file: ${filePath}`));
        }
      }, timeout);

      const handler = (event: FileChangeEvent) => {
        if (event.path === filePath && !resolved) {
          resolved = true;
          clearTimeout(timer);
          this.removeListener("change", handler);
          resolve();
        }
      };

      this.on("change", handler);
    });
  }
}

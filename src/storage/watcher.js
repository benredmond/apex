// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';
export class PatternWatcher extends EventEmitter {
  watcher;
  debounceTimers = new Map();
  debounceMs;
  watchPath;
  constructor(watchPath = '.apex/patterns', debounceMs = 200) {
    super();
    this.watchPath = watchPath;
    this.debounceMs = debounceMs;
  }
  /**
     * Start watching for file changes
     */
  start() {
    if (this.watcher) {
      throw new Error('Watcher already started');
    }
    const patterns = ['**/*.yaml', '**/*.yml', '**/*.json'];
    const fullPatterns = patterns.map(p => path.join(this.watchPath, p));
    this.watcher = chokidar.watch(fullPatterns, {
      ignoreInitial: false,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100,
      },
    });
    // Set up event handlers
    this.watcher
      .on('add', (filePath) => this.handleChange(filePath, 'add'))
      .on('change', (filePath) => this.handleChange(filePath, 'change'))
      .on('unlink', (filePath) => this.handleChange(filePath, 'unlink'))
      .on('error', (error) => this.emit('error', error))
      .on('ready', () => this.emit('ready'));
  }
  /**
     * Stop watching
     */
  async stop() {
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
  handleChange(filePath, type) {
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    // Set new debounced timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      const event = {
        path: filePath,
        type,
        timestamp: Date.now(),
      };
      this.emit('change', event);
    }, this.debounceMs);
    this.debounceTimers.set(filePath, timer);
  }
  /**
     * Get list of watched paths
     */
  getWatched() {
    return this.watcher?.getWatched() || {};
  }
}

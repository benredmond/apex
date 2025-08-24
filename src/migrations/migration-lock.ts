import fs from "fs-extra";
import path from "path";

/**
 * MigrationLock provides file-based locking to prevent concurrent database migrations.
 * Uses PID and timestamp to detect and recover from stale locks.
 */
export class MigrationLock {
  private lockPath: string;
  private staleLockTimeout: number;

  constructor(dbPath: string, staleLockTimeout = 60000) {
    // Place lock file adjacent to database file for proper cleanup
    this.lockPath = dbPath.replace(".db", ".migration.lock");
    this.staleLockTimeout = staleLockTimeout;
  }

  /**
   * Attempts to acquire the migration lock.
   * Returns true if lock acquired, false if lock is held by another process.
   */
  tryAcquire(): boolean {
    try {
      // Check for existing lock
      if (fs.existsSync(this.lockPath)) {
        const lockData = this.readLockFile();

        // Check if lock is stale
        if (!lockData || this.isLockStale(lockData)) {
          // Remove stale or corrupted lock
          fs.removeSync(this.lockPath);
        } else {
          // Lock is held by another process
          return false;
        }
      }

      // Attempt to create lock file atomically
      const lockData = {
        pid: process.pid,
        timestamp: Date.now(),
        hostname: process.env.HOSTNAME || "unknown",
      };

      // Use 'wx' flag for exclusive creation (fails if file exists)
      fs.writeFileSync(this.lockPath, JSON.stringify(lockData, null, 2), {
        flag: "wx",
      });

      // Register cleanup handlers
      this.registerCleanupHandlers();

      return true;
    } catch (error: any) {
      // EEXIST means another process created the lock between our check and write
      if (error.code === "EEXIST") {
        return false;
      }

      // Other errors (permissions, disk full, etc.) should be thrown
      throw new Error(`Failed to acquire migration lock: ${error.message}`);
    }
  }

  /**
   * Releases the migration lock if owned by this process.
   */
  release(): void {
    try {
      if (!fs.existsSync(this.lockPath)) {
        return;
      }

      const lockData = this.readLockFile();

      // Only remove lock if we own it
      if (lockData && lockData.pid === process.pid) {
        fs.removeSync(this.lockPath);
        this.unregisterCleanupHandlers();
      }
    } catch (error: any) {
      // Log but don't throw - best effort cleanup
      console.error(
        `Warning: Failed to release migration lock: ${error.message}`,
      );
    }
  }

  /**
   * Waits for lock to be released or become stale.
   * Returns true when lock is available, false if timeout exceeded.
   */
  async waitForLock(maxWaitTime = 30000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms

    while (Date.now() - startTime < maxWaitTime) {
      if (!fs.existsSync(this.lockPath)) {
        return true;
      }

      const lockData = this.readLockFile();
      if (lockData && this.isLockStale(lockData)) {
        // Stale lock detected, it will be cleaned up on next acquire attempt
        return true;
      }

      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    return false;
  }

  /**
   * Checks if a lock is currently held (and not stale).
   */
  isLocked(): boolean {
    if (!fs.existsSync(this.lockPath)) {
      return false;
    }

    const lockData = this.readLockFile();
    if (!lockData) {
      return false;
    }

    return !this.isLockStale(lockData);
  }

  /**
   * Gets information about the current lock holder.
   */
  getLockInfo(): {
    pid: number;
    timestamp: number;
    hostname: string;
    age: number;
  } | null {
    if (!fs.existsSync(this.lockPath)) {
      return null;
    }

    const lockData = this.readLockFile();
    if (!lockData) {
      return null;
    }

    return {
      ...lockData,
      age: Date.now() - lockData.timestamp,
    };
  }

  private readLockFile(): {
    pid: number;
    timestamp: number;
    hostname: string;
  } | null {
    try {
      const content = fs.readFileSync(this.lockPath, "utf-8");
      const data = JSON.parse(content);

      // Validate lock file structure
      if (typeof data.pid !== "number" || typeof data.timestamp !== "number") {
        return null;
      }

      return data;
    } catch {
      // Invalid or corrupted lock file
      return null;
    }
  }

  private isLockStale(lockData: { pid: number; timestamp: number }): boolean {
    // Check if lock is older than timeout
    const age = Date.now() - lockData.timestamp;
    if (age > this.staleLockTimeout) {
      return true;
    }

    // Check if process is still running
    if (!this.isProcessRunning(lockData.pid)) {
      return true;
    }

    return false;
  }

  private isProcessRunning(pid: number): boolean {
    // Treat PID 0 as invalid (kernel process, should not hold app locks)
    if (pid === 0) return false;
    
    try {
      // process.kill with signal 0 checks if process exists without killing it
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private cleanupHandler = () => {
    this.release();
  };

  private registerCleanupHandlers(): void {
    // Clean up lock on process exit
    process.on("exit", this.cleanupHandler);
    process.on("SIGINT", this.cleanupHandler);
    process.on("SIGTERM", this.cleanupHandler);
    process.on("uncaughtException", this.cleanupHandler);
    process.on("unhandledRejection", this.cleanupHandler);
  }

  private unregisterCleanupHandlers(): void {
    process.removeListener("exit", this.cleanupHandler);
    process.removeListener("SIGINT", this.cleanupHandler);
    process.removeListener("SIGTERM", this.cleanupHandler);
    process.removeListener("uncaughtException", this.cleanupHandler);
    process.removeListener("unhandledRejection", this.cleanupHandler);
  }
}

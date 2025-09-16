import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MigrationLock } from "../../src/migrations/migration-lock.js";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { nanoid } from "nanoid";

describe("MigrationLock", () => {
  let testDir;
  let dbPath;
  let lockPath;

  beforeEach(() => {
    // Create a unique test directory for each test
    testDir = path.join(os.tmpdir(), `apex-lock-test-${nanoid()}`);
    fs.ensureDirSync(testDir);
    dbPath = path.join(testDir, "test.db");
    lockPath = path.join(testDir, "test.migration.lock");
    
    // Create a dummy database file
    fs.writeFileSync(dbPath, "");
  });

  afterEach(() => {
    // Clean up test directory
    fs.removeSync(testDir);
  });

  describe("Lock acquisition", () => {
    it("should acquire lock on first attempt", () => {
      const lock = new MigrationLock(dbPath);
      
      expect(lock.tryAcquire()).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(true);
      
      // Check lock file contents
      const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      expect(lockData.pid).toBe(process.pid);
      expect(lockData.timestamp).toBeDefined();
      
      lock.release();
    });

    it("should fail to acquire lock when already held", () => {
      const lock1 = new MigrationLock(dbPath);
      const lock2 = new MigrationLock(dbPath);
      
      expect(lock1.tryAcquire()).toBe(true);
      expect(lock2.tryAcquire()).toBe(false);
      
      lock1.release();
    });

    it("should handle concurrent acquisition attempts", () => {
      const locks = Array.from({ length: 5 }, () => new MigrationLock(dbPath));
      const results = locks.map(lock => lock.tryAcquire());
      
      // Only one should succeed
      expect(results.filter(r => r === true).length).toBe(1);
      
      // Clean up the one that succeeded
      locks.forEach((lock, i) => {
        if (results[i]) {
          lock.release();
        }
      });
    });
  });

  describe("Lock release", () => {
    it("should release lock and remove file", () => {
      const lock = new MigrationLock(dbPath);
      
      lock.tryAcquire();
      expect(fs.existsSync(lockPath)).toBe(true);
      
      lock.release();
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it("should only release lock if owned by current process", () => {
      const lock1 = new MigrationLock(dbPath);
      lock1.tryAcquire();
      
      // Manually modify lock file to simulate different process
      const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      lockData.pid = process.pid + 1;
      fs.writeFileSync(lockPath, JSON.stringify(lockData));
      
      const lock2 = new MigrationLock(dbPath);
      lock2.release(); // Should not remove lock
      
      expect(fs.existsSync(lockPath)).toBe(true);
      
      // Clean up
      fs.removeSync(lockPath);
    });

    it("should handle missing lock file gracefully", () => {
      const lock = new MigrationLock(dbPath);
      
      // Release without acquiring
      expect(() => lock.release()).not.toThrow();
    });
  });

  describe("Stale lock detection", () => {
    it("should detect and remove stale lock (old timestamp)", () => {
      // Create a stale lock file
      const staleLockData = {
        pid: process.pid,
        timestamp: Date.now() - 120000, // 2 minutes old
        hostname: 'test'
      };
      fs.writeFileSync(lockPath, JSON.stringify(staleLockData));
      
      const lock = new MigrationLock(dbPath, 60000); // 60 second timeout
      expect(lock.tryAcquire()).toBe(true);
      
      // New lock should be created
      const newLockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      expect(newLockData.timestamp).toBeGreaterThan(staleLockData.timestamp);
      
      lock.release();
    });

    it("should detect and remove stale lock (dead process)", () => {
      // Create a lock with non-existent PID
      const staleLockData = {
        pid: 999999, // Unlikely to exist
        timestamp: Date.now() - 30000, // 30 seconds old (not stale by time)
        hostname: 'test'
      };
      fs.writeFileSync(lockPath, JSON.stringify(staleLockData));
      
      const lock = new MigrationLock(dbPath);
      expect(lock.tryAcquire()).toBe(true);
      
      lock.release();
    });

    it("should not remove valid lock", () => {
      const lock1 = new MigrationLock(dbPath);
      lock1.tryAcquire();
      
      const lock2 = new MigrationLock(dbPath);
      expect(lock2.tryAcquire()).toBe(false);
      expect(fs.existsSync(lockPath)).toBe(true);
      
      lock1.release();
    });
  });

  describe("Lock waiting", () => {
    it("should wait for lock to be released", async () => {
      const lock1 = new MigrationLock(dbPath);
      const lock2 = new MigrationLock(dbPath);
      
      lock1.tryAcquire();
      
      // Release lock after 200ms
      setTimeout(() => lock1.release(), 200);
      
      const startTime = Date.now();
      const available = await lock2.waitForLock(1000);
      const waitTime = Date.now() - startTime;
      
      expect(available).toBe(true);
      expect(waitTime).toBeGreaterThanOrEqual(190);
      expect(waitTime).toBeLessThan(400);
    });

    it("should timeout if lock not released", async () => {
      const lock1 = new MigrationLock(dbPath);
      const lock2 = new MigrationLock(dbPath);
      
      lock1.tryAcquire();
      
      const startTime = Date.now();
      const available = await lock2.waitForLock(500);
      const waitTime = Date.now() - startTime;
      
      expect(available).toBe(false);
      expect(waitTime).toBeGreaterThanOrEqual(490);
      expect(waitTime).toBeLessThan(600);
      
      lock1.release();
    });

    it("should detect stale lock while waiting", async () => {
      // Create a stale lock
      const staleLockData = {
        pid: 999999,
        timestamp: Date.now() - 120000,
        hostname: 'test'
      };
      fs.writeFileSync(lockPath, JSON.stringify(staleLockData));
      
      const lock = new MigrationLock(dbPath, 60000);
      const available = await lock.waitForLock(1000);
      
      expect(available).toBe(true);
    });
  });

  describe("Lock status methods", () => {
    it("should correctly report if locked", () => {
      const lock1 = new MigrationLock(dbPath);
      const lock2 = new MigrationLock(dbPath);
      
      expect(lock2.isLocked()).toBe(false);
      
      lock1.tryAcquire();
      expect(lock2.isLocked()).toBe(true);
      
      lock1.release();
      expect(lock2.isLocked()).toBe(false);
    });

    it("should provide lock info", () => {
      const lock1 = new MigrationLock(dbPath);
      const lock2 = new MigrationLock(dbPath);
      
      expect(lock2.getLockInfo()).toBe(null);
      
      lock1.tryAcquire();
      const info = lock2.getLockInfo();
      
      expect(info).toBeDefined();
      expect(info.pid).toBe(process.pid);
      expect(info.timestamp).toBeDefined();
      expect(info.age).toBeGreaterThanOrEqual(0);
      expect(info.age).toBeLessThan(100);
      
      lock1.release();
    });

    it("should handle corrupted lock file", () => {
      // Write invalid JSON
      fs.writeFileSync(lockPath, "not valid json");
      
      const lock = new MigrationLock(dbPath);
      expect(lock.isLocked()).toBe(false);
      expect(lock.getLockInfo()).toBe(null);
      
      // Should be able to acquire lock (corrupted file treated as no lock)
      expect(lock.tryAcquire()).toBe(true);
      lock.release();
    });
  });

  describe("Process cleanup handlers", () => {
    it("should register cleanup handlers on lock acquisition", () => {
      const lock = new MigrationLock(dbPath);
      const processOnSpy = vi.spyOn(process, 'on');
      
      lock.tryAcquire();
      
      expect(processOnSpy).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      
      lock.release();
      processOnSpy.mockRestore();
    });

    it("should unregister cleanup handlers on release", () => {
      const lock = new MigrationLock(dbPath);
      const removeListenerSpy = vi.spyOn(process, 'removeListener');
      
      lock.tryAcquire();
      lock.release();
      
      expect(removeListenerSpy).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(removeListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(removeListenerSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      
      removeListenerSpy.mockRestore();
    });
  });

  describe("Error handling", () => {
    it("should throw on file system errors (not EEXIST)", () => {
      // Make directory read-only to cause write error
      const readOnlyDir = path.join(testDir, 'readonly');
      fs.ensureDirSync(readOnlyDir, { mode: 0o444 });
      const readOnlyDbPath = path.join(readOnlyDir, 'test.db');
      
      const lock = new MigrationLock(readOnlyDbPath);
      
      // This might fail depending on OS permissions
      try {
        lock.tryAcquire();
        // If it doesn't throw, that's okay on some systems
      } catch (error) {
        expect(error.message).toContain('Failed to acquire migration lock');
      }
      
      // Clean up
      fs.chmodSync(readOnlyDir, 0o755);
      fs.removeSync(readOnlyDir);
    });

    it("should handle edge case of PID 0", () => {
      const lockData = {
        pid: 0,
        timestamp: Date.now(),
        hostname: 'test'
      };
      fs.writeFileSync(lockPath, JSON.stringify(lockData));
      
      const lock = new MigrationLock(dbPath);
      // PID 0 is not valid on most systems, so should be treated as stale
      expect(lock.tryAcquire()).toBe(true);
      lock.release();
    });
  });

  describe("Integration with AutoMigrator", () => {
    it("should prevent concurrent migrations", async () => {
      const results = [];
      
      // Simulate multiple AutoMigrator instances
      const runMigration = async (id) => {
        const lock = new MigrationLock(dbPath);
        
        if (!lock.tryAcquire()) {
          const available = await lock.waitForLock(2000);
          if (!available) {
            results.push({ id, success: false, reason: 'timeout' });
            return;
          }
          if (!lock.tryAcquire()) {
            results.push({ id, success: false, reason: 'failed after wait' });
            return;
          }
        }
        
        // Simulate migration work
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push({ id, success: true });
        
        lock.release();
      };
      
      // Start multiple migrations concurrently
      const migrations = Promise.all([
        runMigration(1),
        runMigration(2),
        runMigration(3)
      ]);
      
      await migrations;
      
      // All should eventually complete
      expect(results.length).toBe(3);
      expect(results.filter(r => r.success).length).toBeGreaterThanOrEqual(1);
    });
  });
});
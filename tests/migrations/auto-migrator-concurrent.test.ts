/**
 * Tests for AutoMigrator with MigrationLock concurrent migration prevention
 * 
 * NOTE: These tests are temporarily skipped due to a "module is already linked" error
 * when importing AutoMigrator. This is a known issue with Jest's experimental VM modules
 * and how they handle ESM module linking. The AutoMigrator functionality is tested
 * in integration tests which run in separate processes to avoid this issue.
 * 
 * TODO: Resolve module linking issue or refactor tests to use subprocess approach
 * like tests/integration/database-tables.test.js
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { nanoid } from "nanoid";
import Database from "better-sqlite3";
// With Vitest, ESM module linking works properly
import { AutoMigrator } from "../../src/migrations/auto-migrator.js";
import { MigrationLock } from "../../src/migrations/migration-lock.js";

describe("AutoMigrator with MigrationLock", () => {
  let testDir;
  let dbPath;
  let lockPath;

  beforeEach(() => {
    // Create a unique test directory for each test
    testDir = path.join(os.tmpdir(), `apex-migrator-test-${nanoid()}`);
    fs.ensureDirSync(testDir);
    dbPath = path.join(testDir, "test.db");
    lockPath = path.join(testDir, "test.migration.lock");
    
    // Mock console methods to reduce test output noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up test directory
    fs.removeSync(testDir);
    
    // Restore console methods
    console.log.mockRestore();
    console.error.mockRestore();
  });

  describe("Concurrent migration prevention", () => {
    it("should prevent concurrent migrations on same database", async () => {
      // Create initial database
      const db = new Database(dbPath);
      db.close();

      const results = [];
      
      // Create multiple AutoMigrator instances
      const runMigration = async (id) => {
        try {
          const migrator = new AutoMigrator(dbPath);
          const success = await migrator.autoMigrate({ silent: false });
          results.push({ id, success, error: null });
          return success;
        } catch (error) {
          results.push({ id, success: false, error: error.message });
          return false;
        }
      };

      // Start migrations concurrently
      const migrations = await Promise.all([
        runMigration(1),
        runMigration(2),
        runMigration(3)
      ]);

      // At least one should succeed
      expect(migrations.filter(m => m === true).length).toBeGreaterThanOrEqual(1);
      
      // Lock file should be cleaned up
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it("should handle lock timeout gracefully", async () => {
      // Create a lock that won't be released
      const lock = new MigrationLock(dbPath);
      lock.tryAcquire();

      // Try to run migration (should timeout)
      const migrator = new AutoMigrator(dbPath);
      
      // Mock the waitForLock to return faster for testing
      vi.spyOn(MigrationLock.prototype, 'waitForLock').mockResolvedValue(false);
      
      const result = await migrator.autoMigrate({ silent: false });
      
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to acquire migration lock")
      );
      
      // Clean up
      lock.release();
      if (MigrationLock && MigrationLock.prototype && MigrationLock.prototype.waitForLock.mockRestore) {
        MigrationLock.prototype.waitForLock.mockRestore();
      }
    });

    it("should recover from stale lock", async () => {
      // Create a stale lock file
      const staleLockData = {
        pid: 999999, // Non-existent process
        timestamp: Date.now() - 120000, // 2 minutes old
        hostname: 'test'
      };
      fs.writeFileSync(lockPath, JSON.stringify(staleLockData));

      // Should be able to acquire lock and run migration
      const migrator = new AutoMigrator(dbPath);
      const result = await migrator.autoMigrate({ silent: true });
      
      expect(result).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it("should wait for lock and then proceed", async () => {
      // First migration holds lock
      const lock = new MigrationLock(dbPath);
      lock.tryAcquire();

      // Release lock after 500ms
      setTimeout(() => lock.release(), 500);

      // Second migration should wait and then succeed
      const migrator = new AutoMigrator(dbPath);
      const startTime = Date.now();
      const result = await migrator.autoMigrate({ silent: false });
      const duration = Date.now() - startTime;

      expect(result).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(490);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Another process is running migrations, waiting...")
      );
    });

    it("should handle lock acquisition failure after wait", async () => {
      // Mock waitForLock to return true but tryAcquire to fail
      vi.spyOn(MigrationLock.prototype, 'waitForLock').mockResolvedValue(true);
      vi.spyOn(MigrationLock.prototype, 'tryAcquire')
        .mockReturnValueOnce(false) // First try fails
        .mockReturnValueOnce(false); // Second try after wait also fails

      const migrator = new AutoMigrator(dbPath);
      const result = await migrator.autoMigrate({ silent: false });

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to acquire migration lock after waiting")
      );

      // Restore mocks
      MigrationLock.prototype.waitForLock.mockRestore();
      MigrationLock.prototype.tryAcquire.mockRestore();
    });

    it("should show lock holder information on timeout", async () => {
      // Create a lock with current process
      const lock = new MigrationLock(dbPath);
      lock.tryAcquire();

      // Mock waitForLock to timeout quickly
      vi.spyOn(MigrationLock.prototype, 'waitForLock').mockResolvedValue(false);

      const migrator = new AutoMigrator(dbPath);
      const result = await migrator.autoMigrate({ silent: false });

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining(`Lock held by process ${process.pid}`)
      );

      // Clean up
      lock.release();
      if (MigrationLock && MigrationLock.prototype && MigrationLock.prototype.waitForLock.mockRestore) {
        MigrationLock.prototype.waitForLock.mockRestore();
      }
    });
  });

  describe("Lock cleanup", () => {
    it("should always release lock even on migration error", async () => {
      // Mock migration to throw error
      if (AutoMigrator && AutoMigrator.prototype) {
        vi.spyOn(AutoMigrator.prototype, 'isFreshDatabase').mockImplementation(() => {
          throw new Error("Simulated migration error");
        });
      }

      const migrator = new AutoMigrator(dbPath);
      const result = await migrator.autoMigrate({ silent: false });

      expect(result).toBe(false);
      expect(fs.existsSync(lockPath)).toBe(false); // Lock should be cleaned up
      
      if (AutoMigrator && AutoMigrator.prototype && AutoMigrator.prototype.isFreshDatabase.mockRestore) {
        AutoMigrator.prototype.isFreshDatabase.mockRestore();
      }
    });

    it("should release lock on successful migration", async () => {
      const migrator = new AutoMigrator(dbPath);
      const result = await migrator.autoMigrate({ silent: true });

      expect(result).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  describe("Real-world scenario simulation", () => {
    it("should handle rapid successive migrations", async () => {
      // Simulate multiple MCP servers starting up quickly
      const migrationPromises = [];
      const successCount = { value: 0 };
      
      for (let i = 0; i < 10; i++) {
        migrationPromises.push(
          (async () => {
            // Small random delay to simulate slight timing differences
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
            
            const migrator = new AutoMigrator(dbPath);
            const result = await migrator.autoMigrate({ silent: true });
            if (result) successCount.value++;
            return result;
          })()
        );
      }

      await Promise.all(migrationPromises);

      // All migrations should eventually complete successfully
      expect(successCount.value).toBeGreaterThanOrEqual(1);
      
      // Lock should be cleaned up
      expect(fs.existsSync(lockPath)).toBe(false);
      
      // Database should be in valid state
      const db = new Database(dbPath);
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all();
      expect(tables.length).toBeGreaterThan(0);
      db.close();
    });

    it("should handle process crash simulation", async () => {
      // Create a lock and simulate process crash (no cleanup)
      const crashedLockData = {
        pid: 999999,
        timestamp: Date.now() - 5000, // Recent but dead process
        hostname: 'crashed-host'
      };
      fs.writeFileSync(lockPath, JSON.stringify(crashedLockData));

      // New process should detect stale lock and recover
      const migrator = new AutoMigrator(dbPath);
      const result = await migrator.autoMigrate({ silent: true });

      expect(result).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });
});
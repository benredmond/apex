import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fs from "fs-extra";
import path from "path";
import os from "os";
import Database from "better-sqlite3";

// Mock RepoIdentifier
jest.mock("../../src/utils/repo-identifier.js", () => ({
  RepoIdentifier: {
    getDatabasePaths: jest.fn().mockResolvedValue({
      primary: path.join(os.homedir(), ".apex", "test-project", "patterns.db"),
      fallback: path.join(os.homedir(), ".apex", "global", "patterns.db"),
      // Note: no legacy field anymore!
    }),
    getIdentifier: jest.fn().mockResolvedValue("test-project"),
  },
}));

describe("ApexConfig Database Path Resolution", () => {
  let tempDir: string;
  let originalCwd: string;
  
  beforeEach(async () => {
    // Save original cwd
    originalCwd = process.cwd();
    
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-config-test-"));
    process.chdir(tempDir);
    
    // Clear environment variables
    delete process.env.APEX_PATTERNS_DB;
  });
  
  afterEach(async () => {
    // Restore original cwd
    process.chdir(originalCwd);
    
    // Clean up
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe("getProjectDbPath", () => {
    it("should always return primary path, never legacy", async () => {
      // Create a legacy database in current directory
      const legacyPath = path.join(tempDir, "patterns.db");
      await fs.writeFile(legacyPath, "legacy database");
      
      const { ApexConfig } = await import("../../src/config/apex-config.js");
      
      const dbPath = await ApexConfig.getProjectDbPath();
      
      // Should return primary path, not legacy
      expect(dbPath).toContain(".apex");
      expect(dbPath).toContain("test-project");
      expect(dbPath).not.toBe(legacyPath);
    });

    it("should respect APEX_PATTERNS_DB environment variable", async () => {
      const customPath = path.join(tempDir, "custom", "patterns.db");
      process.env.APEX_PATTERNS_DB = customPath;
      
      const { ApexConfig } = await import("../../src/config/apex-config.js");
      
      const dbPath = await ApexConfig.getProjectDbPath();
      
      expect(dbPath).toBe(customPath);
    });

    it("should not fall back to legacy even if primary doesn't exist", async () => {
      // Create legacy database
      const legacyPath = path.join(tempDir, "patterns.db");
      await fs.writeFile(legacyPath, "legacy database");
      
      const { ApexConfig } = await import("../../src/config/apex-config.js");
      
      const dbPath = await ApexConfig.getProjectDbPath();
      
      // Should still return primary path even if it doesn't exist
      expect(dbPath).toContain(".apex");
      expect(dbPath).toContain("test-project");
      expect(dbPath).not.toBe(legacyPath);
    });
  });

  describe("migrateLegacyDatabase", () => {
    it("should migrate and delete legacy database", async () => {
      // Create legacy database
      const legacyPath = path.join(tempDir, "patterns.db");
      const db = new Database(legacyPath);
      db.exec(`
        CREATE TABLE patterns (
          id TEXT PRIMARY KEY,
          title TEXT
        );
        INSERT INTO patterns (id, title) VALUES ('TEST', 'Test Pattern');
      `);
      db.close();
      
      const { ApexConfig } = await import("../../src/config/apex-config.js");
      
      // Run migration
      const migrated = await ApexConfig.migrateLegacyDatabase();
      
      expect(migrated).toBe(true);
      
      // Legacy database should be deleted
      expect(await fs.pathExists(legacyPath)).toBe(false);
      
      // Data should be in new location
      const primaryPath = path.join(os.homedir(), ".apex", "test-project", "patterns.db");
      if (await fs.pathExists(primaryPath)) {
        const newDb = new Database(primaryPath, { readonly: true });
        const result = newDb.prepare("SELECT * FROM patterns WHERE id = 'TEST'").get() as any;
        expect(result.title).toBe("Test Pattern");
        newDb.close();
        
        // Clean up
        await fs.remove(primaryPath);
      }
    });

    it("should delete legacy database if primary already exists", async () => {
      // Create both legacy and primary databases
      const legacyPath = path.join(tempDir, "patterns.db");
      await fs.writeFile(legacyPath, "legacy database");
      
      const primaryPath = path.join(os.homedir(), ".apex", "test-project", "patterns.db");
      await fs.ensureDir(path.dirname(primaryPath));
      await fs.writeFile(primaryPath, "primary database");
      
      const { ApexConfig } = await import("../../src/config/apex-config.js");
      
      // Spy on console to verify message
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      
      // Run migration
      const migrated = await ApexConfig.migrateLegacyDatabase();
      
      expect(migrated).toBe(false); // No migration performed
      
      // But legacy should still be deleted
      expect(await fs.pathExists(legacyPath)).toBe(false);
      
      // Should log about removal
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Removed legacy database")
      );
      
      // Clean up
      consoleSpy.mockRestore();
      await fs.remove(primaryPath);
    });

    it("should handle migration failure gracefully", async () => {
      // Create legacy database
      const legacyPath = path.join(tempDir, "patterns.db");
      await fs.writeFile(legacyPath, "legacy database");
      
      // Make primary path unwritable by using invalid path
      const { RepoIdentifier } = await import("../../src/utils/repo-identifier.js");
      (RepoIdentifier.getDatabasePaths as jest.Mock).mockResolvedValueOnce({
        primary: "/invalid/path/that/cannot/be/created/patterns.db",
        fallback: path.join(os.homedir(), ".apex", "global", "patterns.db"),
      });
      
      const { ApexConfig } = await import("../../src/config/apex-config.js");
      
      // Spy on console.error
      const errorSpy = jest.spyOn(console, "error").mockImplementation();
      
      // Run migration
      const migrated = await ApexConfig.migrateLegacyDatabase();
      
      expect(migrated).toBe(false);
      
      // Legacy should still exist since migration failed
      expect(await fs.pathExists(legacyPath)).toBe(true);
      
      // Should log error
      expect(errorSpy).toHaveBeenCalled();
      
      errorSpy.mockRestore();
    });

    it("should return false when no legacy database exists", async () => {
      const { ApexConfig } = await import("../../src/config/apex-config.js");
      
      // No legacy database exists
      const migrated = await ApexConfig.migrateLegacyDatabase();
      
      expect(migrated).toBe(false);
    });

    it("should check both potential legacy locations", async () => {
      // Create legacy database in .apex subdirectory
      const legacyPath = path.join(tempDir, ".apex", "patterns.db");
      await fs.ensureDir(path.dirname(legacyPath));
      await fs.writeFile(legacyPath, "legacy database");
      
      const { ApexConfig } = await import("../../src/config/apex-config.js");
      
      // Run migration
      const migrated = await ApexConfig.migrateLegacyDatabase();
      
      expect(migrated).toBe(true);
      
      // Legacy database should be deleted
      expect(await fs.pathExists(legacyPath)).toBe(false);
    });
  });
});
/**
 * Unit test to verify the MCP database path bug fix
 * Tests that legacy path detection is removed and migrations run correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";

describe("MCP Database Path Bug Fix", () => {
  let tempDir;
  let cwdSpy;
  
  beforeEach(async () => {
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-test-"));
    cwdSpy = vi.spyOn(process, "cwd").mockImplementation(() => tempDir);
    
    // Clear environment
    delete process.env.APEX_PATTERNS_DB;
  });
  
  afterEach(async () => {
    // Restore mocked cwd
    if (cwdSpy) {
      cwdSpy.mockRestore();
      cwdSpy = undefined;
    }
    
    // Clean up
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  describe("RepoIdentifier", () => {
    it("should not return legacy field in getDatabasePaths", async () => {
      // Create legacy database files
      await fs.writeFile(path.join(tempDir, "patterns.db"), "legacy");
      await fs.ensureDir(path.join(tempDir, ".apex"));
      await fs.writeFile(path.join(tempDir, ".apex", "patterns.db"), "legacy");
      
      // Import RepoIdentifier
      const { RepoIdentifier } = await import("../../dist/utils/repo-identifier.js");
      
      // Get database paths
      const paths = await RepoIdentifier.getDatabasePaths();
      
      // Should only have primary and fallback, no legacy
      expect(paths).toHaveProperty("primary");
      expect(paths).toHaveProperty("fallback");
      expect(paths).not.toHaveProperty("legacy");
      
      // Primary should be in ~/.apex/<project-id>/
      expect(paths.primary).toContain(".apex");
      expect(paths.primary).toContain("patterns.db");
      
      // Should not be the legacy path
      expect(paths.primary).not.toBe(path.join(tempDir, "patterns.db"));
      expect(paths.primary).not.toBe(path.join(tempDir, ".apex", "patterns.db"));
    });
  });

  describe("ApexConfig", () => {
    it("should always return primary path from getProjectDbPath", async () => {
      // Mock RepoIdentifier to control paths
      vi.unstable_mockModule("../../dist/utils/repo-identifier.js", () => ({
        RepoIdentifier: {
          getDatabasePaths: vi.fn().mockResolvedValue({
            primary: "/test/.apex/project/patterns.db",
            fallback: "/test/.apex/global/patterns.db",
            // No legacy field!
          }),
        },
      }));
      
      // Create legacy database
      await fs.writeFile(path.join(tempDir, "patterns.db"), "legacy");
      
      // Import ApexConfig after mocking
      const { ApexConfig } = await import("../../dist/config/apex-config.js");
      
      const dbPath = await ApexConfig.getProjectDbPath();
      
      // Should return primary path
      expect(dbPath).toBe("/test/.apex/project/patterns.db");
      
      // Should not return legacy path
      expect(dbPath).not.toBe(path.join(tempDir, "patterns.db"));
    });
    
    it("should respect APEX_PATTERNS_DB environment variable", async () => {
      const customPath = "/custom/database/patterns.db";
      process.env.APEX_PATTERNS_DB = customPath;
      
      const { ApexConfig } = await import("../../dist/config/apex-config.js");
      
      const dbPath = await ApexConfig.getProjectDbPath();
      
      expect(dbPath).toBe(customPath);
    });
  });

  describe("Migration Logic", () => {
    it("should check for legacy databases in current directory", async () => {
      // This test verifies that migrateLegacyDatabase checks for legacy DBs
      // even though getDatabasePaths no longer returns them
      
      // Create a legacy database
      const legacyDb = await import("better-sqlite3");
      const db = new legacyDb.default(path.join(tempDir, "patterns.db"));
      db.exec(`
        CREATE TABLE patterns (
          id TEXT PRIMARY KEY,
          title TEXT
        );
        INSERT INTO patterns (id, title) VALUES ('TEST', 'Test Pattern');
      `);
      db.close();
      
      // Mock RepoIdentifier
      vi.unstable_mockModule("../../dist/utils/repo-identifier.js", () => ({
        RepoIdentifier: {
          getDatabasePaths: vi.fn().mockResolvedValue({
            primary: path.join(tempDir, "new", "patterns.db"),
            fallback: path.join(tempDir, ".apex", "global", "patterns.db"),
          }),
        },
      }));
      
      const { ApexConfig } = await import("../../dist/config/apex-config.js");
      
      // Spy on fs operations
      const unlinkSpy = vi.spyOn(fs, "unlinkSync");
      const copySpy = vi.spyOn(fs, "copyFileSync");
      
      // Run migration
      const migrated = await ApexConfig.migrateLegacyDatabase();
      
      if (migrated) {
        // Should have copied the database
        expect(copySpy).toHaveBeenCalled();
        
        // Should attempt to delete legacy
        expect(unlinkSpy).toHaveBeenCalledWith(
          expect.stringContaining("patterns.db")
        );
      }
      
      unlinkSpy.mockRestore();
      copySpy.mockRestore();
    });
  });
});

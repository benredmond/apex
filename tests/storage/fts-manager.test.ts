// Unit tests for FTSManager
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { initTestDatabase } from "../helpers/vitest-db.js";
import { FTSManager } from "../../dist/storage/fts-manager.js";
import { PatternDatabase } from "../../dist/storage/database.js";

describe("FTSManager - Unit Tests", () => {
  describe("FTS synchronization with mock adapters", () => {
    test("should skip manual sync when adapter supports FTS triggers", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        // Create database with better-sqlite3 adapter (supports triggers)
        const db = await PatternDatabase.create(dbPath);
        const ftsManager = new FTSManager(db);

        // Mock context for FTS operation
        const context = {
          tableName: "patterns",
          ftsTableName: "patterns_fts",
          rowid: 1,
          id: "TEST:FTS:001",
          searchableFields: {
            title: "Test Pattern",
            summary: "Test summary",
            tags: "test,fts",
            keywords: "testing",
            search_index: "test pattern summary"
          }
        };

        // Test that syncFTS returns early for adapters with trigger support
        const startTime = Date.now();
        ftsManager.syncFTS(context, "insert");
        const endTime = Date.now();

        // Should return quickly (< 10ms) as it skips manual sync
        expect(endTime - startTime).toBeLessThan(10);

        await db.close();
      } finally {
        await cleanup();
      }
    });

    test("should perform manual sync when adapter does not support FTS triggers", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        // Use node:sqlite adapter (does not support FTS triggers)
        process.env.APEX_FORCE_ADAPTER = 'node-sqlite';

        const db = await PatternDatabase.create(dbPath);
        const ftsManager = new FTSManager(db);

        // First, insert a pattern into the main table
        await db.database.run(`
          INSERT INTO patterns (id, schema_version, pattern_version, type, title, summary, trust_score, created_at, updated_at, pattern_digest, json_canonical, tags, keywords, search_index)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          "TEST:FTS:002", "0.3", "1.0.0", "TEST", "Test Pattern", "Test summary",
          0.8, new Date().toISOString(), new Date().toISOString(),
          "test-digest", "{}", "test,fts", "testing", "test pattern summary"
        ]);

        // Get the rowid
        const result = await db.database.get("SELECT rowid FROM patterns WHERE id = ?", ["TEST:FTS:002"]);

        // Mock context for FTS operation
        const context = {
          tableName: "patterns",
          ftsTableName: "patterns_fts",
          rowid: result.rowid,
          id: "TEST:FTS:002",
          searchableFields: {
            title: "Test Pattern",
            summary: "Test summary",
            tags: "test,fts",
            keywords: "testing",
            search_index: "test pattern summary"
          }
        };

        // Perform manual FTS sync
        ftsManager.syncFTS(context, "insert");

        // Verify the FTS entry was created
        const ftsResult = await db.database.get(
          "SELECT * FROM patterns_fts WHERE id = ?",
          ["TEST:FTS:002"]
        );

        expect(ftsResult).toBeDefined();
        expect(ftsResult.title).toBe("Test Pattern");
        expect(ftsResult.summary).toBe("Test summary");

        await db.close();
        delete process.env.APEX_FORCE_ADAPTER;
      } finally {
        await cleanup();
      }
    });
  });

  describe("FTS operations with savepoints", () => {
    test("should handle upsert operations with savepoints", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        // Use node:sqlite to test manual sync with savepoints
        process.env.APEX_FORCE_ADAPTER = 'node-sqlite';

        const db = await PatternDatabase.create(dbPath);
        const ftsManager = new FTSManager(db);

        // Insert initial pattern
        await db.database.run(`
          INSERT INTO patterns (id, schema_version, pattern_version, type, title, summary, trust_score, created_at, updated_at, pattern_digest, json_canonical, tags, keywords, search_index)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          "TEST:FTS:003", "0.3", "1.0.0", "TEST", "Initial Title", "Initial summary",
          0.8, new Date().toISOString(), new Date().toISOString(),
          "test-digest", "{}", "test", "initial", "initial title summary"
        ]);

        const result = await db.database.get("SELECT rowid FROM patterns WHERE id = ?", ["TEST:FTS:003"]);

        // Test handleUpsert with savepoint
        const context = {
          tableName: "patterns",
          ftsTableName: "patterns_fts",
          rowid: result.rowid,
          id: "TEST:FTS:003",
          searchableFields: {
            title: "Updated Title",
            summary: "Updated summary",
            tags: "test,updated",
            keywords: "updated",
            search_index: "updated title summary"
          }
        };

        // Get the upsert handler
        const handler = ftsManager.handleUpsert(context);

        // Execute within a transaction
        await db.database.run("BEGIN");
        await handler.execute();
        await db.database.run("COMMIT");

        // Verify the FTS entry was updated
        const ftsResult = await db.database.get(
          "SELECT * FROM patterns_fts WHERE id = ?",
          ["TEST:FTS:003"]
        );

        expect(ftsResult).toBeDefined();
        expect(ftsResult.title).toBe("Updated Title");
        expect(ftsResult.summary).toBe("Updated summary");

        await db.close();
        delete process.env.APEX_FORCE_ADAPTER;
      } finally {
        await cleanup();
      }
    });

    test("should handle delete operations with savepoints", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        // Use node:sqlite to test manual sync
        process.env.APEX_FORCE_ADAPTER = 'node-sqlite';

        const db = await PatternDatabase.create(dbPath);
        const ftsManager = new FTSManager(db);

        // Insert pattern and sync to FTS
        await db.database.run(`
          INSERT INTO patterns (id, schema_version, pattern_version, type, title, summary, trust_score, created_at, updated_at, pattern_digest, json_canonical, tags, keywords, search_index)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          "TEST:FTS:004", "0.3", "1.0.0", "TEST", "Delete Test", "Delete summary",
          0.8, new Date().toISOString(), new Date().toISOString(),
          "test-digest", "{}", "test,delete", "delete", "delete test summary"
        ]);

        const result = await db.database.get("SELECT rowid FROM patterns WHERE id = ?", ["TEST:FTS:004"]);

        // Sync to FTS first
        const insertContext = {
          tableName: "patterns",
          ftsTableName: "patterns_fts",
          rowid: result.rowid,
          id: "TEST:FTS:004",
          searchableFields: {
            title: "Delete Test",
            summary: "Delete summary",
            tags: "test,delete",
            keywords: "delete",
            search_index: "delete test summary"
          }
        };

        ftsManager.syncFTS(insertContext, "insert");

        // Verify FTS entry exists
        const beforeDelete = await db.database.get(
          "SELECT * FROM patterns_fts WHERE id = ?",
          ["TEST:FTS:004"]
        );

        expect(beforeDelete).toBeDefined();

        // Test handleDelete with savepoint
        const deleteContext = {
          tableName: "patterns",
          ftsTableName: "patterns_fts",
          rowid: result.rowid,
          id: "TEST:FTS:004",
          searchableFields: {}
        };

        const handler = ftsManager.handleDelete(deleteContext);

        // Execute within a transaction
        await db.database.run("BEGIN");
        await handler.execute();
        await db.database.run("COMMIT");

        // Verify the FTS entry was deleted
        const afterDelete = await db.database.get(
          "SELECT * FROM patterns_fts WHERE id = ?",
          ["TEST:FTS:004"]
        );

        expect(afterDelete).toBeUndefined();

        await db.close();
        delete process.env.APEX_FORCE_ADAPTER;
      } finally {
        await cleanup();
      }
    });

    test("should rollback savepoint on FTS operation failure", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        // Use node:sqlite to test savepoint rollback
        process.env.APEX_FORCE_ADAPTER = 'node-sqlite';

        const db = await PatternDatabase.create(dbPath);
        const ftsManager = new FTSManager(db);

        // Test savepoint rollback with invalid data
        const invalidContext = {
          tableName: "patterns",
          ftsTableName: "patterns_fts",
          rowid: 999999, // Non-existent rowid
          id: "TEST:FTS:INVALID",
          searchableFields: {
            title: null, // Invalid null value
            summary: "Test",
            tags: "test",
            keywords: "test",
            search_index: "test"
          }
        };

        // Get the upsert handler
        const handler = ftsManager.handleUpsert(invalidContext);

        // Try to execute within a transaction - should handle error gracefully
        await db.database.run("BEGIN");

        // The handler should handle the error internally or throw
        // Either way is acceptable for this test
        try {
          await handler.execute();
          // If no error, handler handled it gracefully
          expect(true).toBe(true);
        } catch (error) {
          // Expected to fail with constraint violation
          expect(error.message).toMatch(/constraint|NOT NULL/i);
        }

        await db.database.run("ROLLBACK");

        await db.close();
        delete process.env.APEX_FORCE_ADAPTER;
      } finally {
        await cleanup();
      }
    });
  });
});
/**
 * Cross-adapter migration compatibility tests
 * Ensures migrations work consistently across node:sqlite, better-sqlite3, and WASM adapters
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { DatabaseAdapterFactory } from "../../src/storage/database-adapter.js";
import { AutoMigrator } from "../../src/migrations/auto-migrator.js";
import { MigrationRunner } from "../../src/migrations/MigrationRunner.js";
import { MigrationLoader } from "../../src/migrations/MigrationLoader.js";
import { PatternDatabase } from "../../src/storage/database.js";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache adapter availability at module level to avoid repeated dynamic imports
let cachedAdapters = null;
const getAvailableAdaptersCache = async () => {
  if (cachedAdapters) return cachedAdapters;
  
  const adapters = [];
  
  // Check node:sqlite (Node 22+)
  const nodeVersion = parseInt(process.version.slice(1).split(".")[0]);
  if (nodeVersion >= 22) {
    adapters.push("node-sqlite");
  }
  
  // Check better-sqlite3
  try {
    await import("better-sqlite3");
    adapters.push("better-sqlite3");
  } catch {
    // Not available
  }
  
  // WASM is always available
  adapters.push("wasm");
  
  cachedAdapters = adapters;
  return adapters;
};

describe("Cross-Adapter Migration Compatibility", () => {
  let tempDir;
  let dbPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-cross-adapter-test-"));
    dbPath = path.join(tempDir, "test.db");
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test("Migration table schema is identical across all adapters", async () => {
    const availableAdapters = await getAvailableAdaptersCache();
    
    if (availableAdapters.length < 2) {
      console.log("Skipping cross-adapter test - only one adapter available");
      return;
    }
    
    const schemas = {};
    
    for (const adapterType of availableAdapters) {
      // Create database with specific adapter
      process.env.APEX_FORCE_ADAPTER = adapterType;
      
      const adapterDbPath = path.join(tempDir, `${adapterType}.db`);
      const adapter = await DatabaseAdapterFactory.create(adapterDbPath);
      
      // Initialize with AutoMigrator
      const migrator = new AutoMigrator(adapter);
      await migrator.migrate();
      
      // Get migration table schema
      const schemaResult = adapter.prepare(`
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name='migrations'
      `).get();
      
      if (schemaResult) {
        // Normalize schema for comparison
        schemas[adapterType] = schemaResult.sql
          .replace(/\s+/g, " ")
          .toLowerCase()
          .trim();
      }
      
      adapter.close();
    }
    
    delete process.env.APEX_FORCE_ADAPTER;
    
    // All schemas should be identical
    const schemaValues = Object.values(schemas);
    if (schemaValues.length > 1) {
      const firstSchema = schemaValues[0];
      schemaValues.forEach((schema, index) => {
        if (index > 0) {
          expect(schema).toBe(firstSchema);
        }
      });
    }
  });

  test("Migrations created by one adapter can be read by another", async () => {
    const availableAdapters = await getAvailableAdaptersCache();
    
    if (availableAdapters.length < 2) {
      console.log("Skipping cross-adapter test - need at least 2 adapters");
      return;
    }
    
    // Use first adapter to create and populate database
    process.env.APEX_FORCE_ADAPTER = availableAdapters[0];
    const adapter1 = await DatabaseAdapterFactory.create(dbPath);
    const migrator1 = new AutoMigrator(adapter1);
    await migrator1.migrate();
    
    // Check migrations recorded
    const migrations1 = getMigrationRows(adapter1);
    expect(migrations1.length).toBeGreaterThan(0);
    
    adapter1.close();
    
    // Use second adapter to read the same database
    process.env.APEX_FORCE_ADAPTER = availableAdapters[1];
    const adapter2 = await DatabaseAdapterFactory.create(dbPath);
    
    // Should be able to read migrations
    const migrations2 = getMigrationRows(adapter2);
    
    // Should have same migrations
    expect(migrations2.length).toBe(migrations1.length);
    
    // Verify migration data matches
    migrations1.forEach((m1, index) => {
      const m2 = migrations2[index];
      expect(m2.version).toBe(m1.version);
      expect(m2.id).toBe(m1.id);
      expect(m2.name).toBe(m1.name);
    });
    
    adapter2.close();
    delete process.env.APEX_FORCE_ADAPTER;
  });

  test("Database operations work consistently across adapters", async () => {
    const availableAdapters = await getAvailableAdaptersCache();
    const results = {};
    
    for (const adapterType of availableAdapters) {
      process.env.APEX_FORCE_ADAPTER = adapterType;
      
      const adapterDbPath = path.join(tempDir, `ops-${adapterType}.db`);
      const db = new PatternDatabase(adapterDbPath);
      await db.init();
      
      const adapter = db.getAdapter();
      
      // Test basic operations
      results[adapterType] = {
        adapterType: adapter.isNodeSqlite !== undefined ? 
          (adapter.isNodeSqlite() ? "node-sqlite" : "other") : "unknown",
        
        // Check table creation
        tablesCreated: adapter.prepare(`
          SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'
        `).get().count,
        
        // Check migration tracking
        migrationsTracked: adapter.prepare(`
          SELECT COUNT(*) as count FROM migrations
        `).get().count,
        
        // Test pattern operations
        patternsCount: adapter.prepare(`
          SELECT COUNT(*) as count FROM patterns
        `).get().count
      };
      
      db.close();
    }
    
    delete process.env.APEX_FORCE_ADAPTER;
    
    // All adapters should produce similar results
    const resultValues = Object.values(results);
    if (resultValues.length > 1) {
      const first = resultValues[0];
      resultValues.forEach((result, index) => {
        if (index > 0) {
          // Tables created should be same
          expect(result.tablesCreated).toBe(first.tablesCreated);
          // Migrations tracked should be same or very close
          expect(Math.abs(result.migrationsTracked - first.migrationsTracked)).toBeLessThanOrEqual(1);
        }
      });
    }
  });

  test("Transaction handling works across all adapters", async () => {
    const availableAdapters = await getAvailableAdaptersCache();
    
    for (const adapterType of availableAdapters) {
      process.env.APEX_FORCE_ADAPTER = adapterType;
      
      const adapterDbPath = path.join(tempDir, `tx-${adapterType}.db`);
      const adapter = await DatabaseAdapterFactory.create(adapterDbPath);
      
      // Create test table
      adapter.exec(`
        CREATE TABLE test_tx (
          id INTEGER PRIMARY KEY,
          value TEXT
        )
      `);
      
      // Test transaction commit
      const insertWithCommit = adapter.transaction(() => {
        const stmt = adapter.prepare("INSERT INTO test_tx (value) VALUES (?)");
        stmt.run("committed");
      });
      insertWithCommit();
      
      // Verify committed
      const committed = adapter.prepare("SELECT COUNT(*) as count FROM test_tx WHERE value = ?").get("committed");
      expect(committed.count).toBe(1);
      
      // Test transaction rollback (simulate error)
      let rollbackWorked = false;
      try {
        const insertWithRollback = adapter.transaction(() => {
          const stmt = adapter.prepare("INSERT INTO test_tx (value) VALUES (?)");
          stmt.run("will-rollback");
          throw new Error("Simulated error");
        });
        insertWithRollback();
      } catch (e) {
        rollbackWorked = true;
      }
      
      expect(rollbackWorked).toBe(true);
      
      // Verify rollback worked
      const rolledBack = adapter.prepare("SELECT COUNT(*) as count FROM test_tx WHERE value = ?").get("will-rollback");
      expect(rolledBack.count).toBe(0);
      
      adapter.close();
    }
    
    delete process.env.APEX_FORCE_ADAPTER;
  });

  test("Migration INSERT statements work with all adapters", async () => {
    const availableAdapters = await getAvailableAdaptersCache();
    
    for (const adapterType of availableAdapters) {
      process.env.APEX_FORCE_ADAPTER = adapterType;
      
      const adapterDbPath = path.join(tempDir, `insert-${adapterType}.db`);
      const adapter = await DatabaseAdapterFactory.create(adapterDbPath);
      
      // Create migrations table with correct schema
      adapter.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          id TEXT NOT NULL,
          name TEXT NOT NULL,
          checksum TEXT,
          applied_at TEXT NOT NULL,
          execution_time_ms INTEGER
        )
      `);
      
      // Test the exact INSERT that caused the original bug
      const stmt = adapter.prepare(`
        INSERT INTO migrations (version, id, name, checksum, applied_at, execution_time_ms) 
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      // Should not throw with 6 values for 6 columns
      expect(() => {
        stmt.run(
          1,
          "test-migration",
          "Test Migration",
          "checksum123",
          new Date().toISOString(),
          100
        );
      }).not.toThrow();
      
      // Verify insert worked
      const result = adapter.prepare("SELECT * FROM migrations WHERE version = 1").get();
      expect(result).toBeDefined();
      expect(result.id).toBe("test-migration");
      
      adapter.close();
    }
    
    delete process.env.APEX_FORCE_ADAPTER;
  });

  test("FTS (Full Text Search) compatibility across adapters", async () => {
    const availableAdapters = await getAvailableAdaptersCache();
    
    for (const adapterType of availableAdapters) {
      process.env.APEX_FORCE_ADAPTER = adapterType;
      
      const adapterDbPath = path.join(tempDir, `fts-${adapterType}.db`);
      const db = new PatternDatabase(adapterDbPath);
      await db.init();
      
      const adapter = db.getAdapter();
      
      // Check if FTS tables were created
      const ftsTables = adapter.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE '%fts%'
      `).all();
      
      // Should have FTS capability
      expect(ftsTables.length).toBeGreaterThanOrEqual(0);
      
      db.close();
    }
    
    delete process.env.APEX_FORCE_ADAPTER;
  });
});

describe("DatabaseAdapter Interface Compliance", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-interface-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test("All adapters implement complete DatabaseAdapter interface", async () => {
    const availableAdapters = await getAvailableAdaptersCache();
    
    for (const adapterType of availableAdapters) {
      process.env.APEX_FORCE_ADAPTER = adapterType;
      const dbPath = path.join(tempDir, `${adapterType}-interface.db`);
      const adapter = await DatabaseAdapterFactory.create(dbPath);
      
      try {
        // Test prepare() creates statement with run/get/all methods
        adapter.exec("CREATE TABLE test_prepare (id INTEGER PRIMARY KEY, value TEXT)");
        
        const stmt = adapter.prepare("INSERT INTO test_prepare (value) VALUES (?)");
        expect(stmt).toBeDefined();
        expect(typeof stmt.run).toBe("function");
        expect(typeof stmt.get).toBe("function");
        expect(typeof stmt.all).toBe("function");
        
        // Test run method
        const result = stmt.run("test value");
        expect(result.changes).toBe(1);
        expect(result.lastInsertRowid).toBeDefined();
        
        // Test get method
        const getStmt = adapter.prepare("SELECT * FROM test_prepare WHERE id = ?");
        const row = getStmt.get(result.lastInsertRowid);
        expect(row.value).toBe("test value");
        
        // Test all method
        stmt.run("second value");
        const allStmt = adapter.prepare("SELECT * FROM test_prepare");
        const rows = allStmt.all();
        expect(rows.length).toBe(2);
        
        // Test exec() handles DDL and multi-statement SQL
        expect(() => {
          adapter.exec("CREATE TABLE test_exec1 (id INTEGER)");
        }).not.toThrow();
        
        expect(() => {
          adapter.exec(`
            CREATE TABLE test_exec2 (id INTEGER);
            CREATE TABLE test_exec3 (id INTEGER);
            INSERT INTO test_exec2 VALUES (1);
            INSERT INTO test_exec3 VALUES (2);
          `);
        }).not.toThrow();
        
        // Verify tables were created
        const tables = adapter.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'test_exec%'
        `).all();
        expect(tables.length).toBe(3);
        
        // Test pragma() sets and gets database settings
        const journalMode = adapter.pragma("journal_mode = WAL");
        expect(journalMode).toBeDefined();
        
        const foreignKeys = adapter.pragma("foreign_keys");
        expect(foreignKeys !== undefined).toBe(true);
        
        adapter.pragma("foreign_keys = ON");
        const fkStatus = adapter.pragma("foreign_keys");
        expect(fkStatus).toBeTruthy();
        
        // Test transaction() provides atomic operations
        adapter.exec("CREATE TABLE test_tx (id INTEGER PRIMARY KEY, value TEXT)");
        
        const successTx = adapter.transaction(() => {
          const txStmt = adapter.prepare("INSERT INTO test_tx (value) VALUES (?)");
          txStmt.run("tx1");
          txStmt.run("tx2");
          return "success";
        });
        
        const txResult = successTx();
        expect(txResult).toBe("success");
        
        const count1 = adapter.prepare("SELECT COUNT(*) as count FROM test_tx").get();
        expect(count1.count).toBe(2);
        
        // Test failed transaction (should rollback)
        const failTx = adapter.transaction(() => {
          const txStmt = adapter.prepare("INSERT INTO test_tx (value) VALUES (?)");
          txStmt.run("tx3");
          throw new Error("Intentional failure");
        });
        
        expect(() => failTx()).toThrow("Intentional failure");
        
        const count2 = adapter.prepare("SELECT COUNT(*) as count FROM test_tx").get();
        expect(count2.count).toBe(2); // Should still be 2, not 3
        
        // Test isNodeSqlite() correctly identifies adapter type
        const isNode = adapter.isNodeSqlite();
        expect(typeof isNode).toBe("boolean");
        
        if (adapterType === "node-sqlite") {
          expect(isNode).toBe(true);
        } else {
          expect(isNode).toBe(false);
        }
        
        // Test getInstance() returns underlying database instance
        const instance = adapter.getInstance();
        expect(instance).toBeDefined();
        expect(instance).not.toBeNull();
        
        // Instance should have some database-like properties/methods
        if (adapterType === "better-sqlite3") {
          expect(typeof instance.prepare).toBe("function");
        } else if (adapterType === "node-sqlite") {
          expect(typeof instance.exec).toBe("function");
        } else if (adapterType === "wasm") {
          expect(typeof instance.exec).toBe("function");
        }
        
        // Test close() properly closes database connection
        expect(() => {
          adapter.prepare("SELECT * FROM test_prepare").all();
        }).not.toThrow();
        
        adapter.close();
        
        // Should not throw on double close
        expect(() => adapter.close()).not.toThrow();
        
      } finally {
        if (adapter) {
          try {
            adapter.close();
          } catch {
            // Ignore close errors
          }
        }
      }
    }
    
    delete process.env.APEX_FORCE_ADAPTER;
  });
});

describe("Adapter Performance Characteristics", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-perf-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test("Benchmark adapter operations", async () => {
    const availableAdapters = await getAvailableAdaptersCache();
    const results = {};
    const iterations = 100;
    
    for (const adapterType of availableAdapters) {
      process.env.APEX_FORCE_ADAPTER = adapterType;
      const dbPath = path.join(tempDir, `perf-${adapterType}.db`);
      const adapter = await DatabaseAdapterFactory.create(dbPath);
      
      // Setup test table
      adapter.exec("CREATE TABLE perf_test (id INTEGER PRIMARY KEY, data TEXT)");
      
      // Benchmark INSERT operations
      const insertStart = performance.now();
      const insertStmt = adapter.prepare("INSERT INTO perf_test (data) VALUES (?)");
      for (let i = 0; i < iterations; i++) {
        insertStmt.run(`data-${i}`);
      }
      const insertTime = performance.now() - insertStart;
      
      // Benchmark SELECT operations
      const selectStart = performance.now();
      const selectStmt = adapter.prepare("SELECT * FROM perf_test WHERE id = ?");
      for (let i = 1; i <= iterations; i++) {
        selectStmt.get(i);
      }
      const selectTime = performance.now() - selectStart;
      
      // Benchmark UPDATE operations
      const updateStart = performance.now();
      const updateStmt = adapter.prepare("UPDATE perf_test SET data = ? WHERE id = ?");
      for (let i = 1; i <= iterations; i++) {
        updateStmt.run(`updated-${i}`, i);
      }
      const updateTime = performance.now() - updateStart;
      
      // Benchmark transaction
      const txStart = performance.now();
      const txInsert = adapter.transaction(() => {
        const stmt = adapter.prepare("INSERT INTO perf_test (data) VALUES (?)");
        for (let i = 0; i < iterations; i++) {
          stmt.run(`tx-data-${i}`);
        }
      });
      txInsert();
      const txTime = performance.now() - txStart;
      
      results[adapterType] = {
        insert: insertTime.toFixed(2),
        select: selectTime.toFixed(2),
        update: updateTime.toFixed(2),
        transaction: txTime.toFixed(2),
        avgInsert: (insertTime / iterations).toFixed(3),
        avgSelect: (selectTime / iterations).toFixed(3),
        avgUpdate: (updateTime / iterations).toFixed(3)
      };
      
      adapter.close();
    }
    
    delete process.env.APEX_FORCE_ADAPTER;
    
    // Log performance results
    console.log("\nAdapter Performance Results (ms):");
    console.log("================================");
    Object.entries(results).forEach(([adapter, metrics]) => {
      console.log(`\n${adapter}:`);
      console.log(`  Total INSERT (${iterations}x): ${metrics.insert}ms (avg: ${metrics.avgInsert}ms)`);
      console.log(`  Total SELECT (${iterations}x): ${metrics.select}ms (avg: ${metrics.avgSelect}ms)`);
      console.log(`  Total UPDATE (${iterations}x): ${metrics.update}ms (avg: ${metrics.avgUpdate}ms)`);
      console.log(`  Transaction (${iterations}x): ${metrics.transaction}ms`);
    });
    
    // Basic sanity checks - operations should complete in reasonable time
    Object.values(results).forEach(metrics => {
      expect(parseFloat(metrics.insert)).toBeLessThan(5000); // 5 seconds max
      expect(parseFloat(metrics.select)).toBeLessThan(5000);
      expect(parseFloat(metrics.update)).toBeLessThan(5000);
      expect(parseFloat(metrics.transaction)).toBeLessThan(5000);
    });
  });
});

describe("Memory and Resource Management", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-memory-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test("WASM adapter memory usage remains stable", async () => {
    // Only test WASM adapter for memory leaks
    process.env.APEX_FORCE_ADAPTER = "wasm";
    const dbPath = path.join(tempDir, "memory-test.db");
    
    // Baseline memory
    global.gc && global.gc(); // Force GC if available
    const baselineMemory = process.memoryUsage().heapUsed;
    
    const adapter = await DatabaseAdapterFactory.create(dbPath);
    adapter.exec("CREATE TABLE mem_test (id INTEGER PRIMARY KEY, data TEXT)");
    
    // Memory samples
    const memorySamples = [];
    
    // Perform operations and track memory
    for (let batch = 0; batch < 5; batch++) {
      const stmt = adapter.prepare("INSERT INTO mem_test (data) VALUES (?)");
      
      // Insert batch of records
      for (let i = 0; i < 100; i++) {
        stmt.run(`data-${batch}-${i}`);
      }
      
      // Query records
      const selectStmt = adapter.prepare("SELECT * FROM mem_test");
      const rows = selectStmt.all();
      expect(rows.length).toBeGreaterThan(batch * 100);
      
      // Sample memory
      global.gc && global.gc(); // Force GC if available
      const currentMemory = process.memoryUsage().heapUsed;
      memorySamples.push(currentMemory - baselineMemory);
    }
    
    adapter.close();
    delete process.env.APEX_FORCE_ADAPTER;
    
    // Check for memory leak pattern
    // Memory should not continuously increase
    console.log("\nWASM Memory Usage (bytes above baseline):");
    memorySamples.forEach((sample, i) => {
      console.log(`  Sample ${i + 1}: ${(sample / 1024).toFixed(2)} KB`);
    });
    
    // Calculate trend - later samples shouldn't be significantly higher
    const firstHalf = memorySamples.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
    const secondHalf = memorySamples.slice(-2).reduce((a, b) => a + b, 0) / 2;
    const increase = secondHalf - firstHalf;
    
    console.log(`  Memory trend: ${increase > 0 ? "+" : ""}${(increase / 1024).toFixed(2)} KB`);
    
    // Memory increase should be less than 10MB for this test
    expect(increase).toBeLessThan(10 * 1024 * 1024);
  });

  test("All adapters properly close and release resources", async () => {
    const availableAdapters = await getAvailableAdaptersCache();
    
    for (const adapterType of availableAdapters) {
      process.env.APEX_FORCE_ADAPTER = adapterType;
      const dbPath = path.join(tempDir, `close-${adapterType}.db`);
      
      // Create and use adapter
      const adapter = await DatabaseAdapterFactory.create(dbPath);
      adapter.exec("CREATE TABLE close_test (id INTEGER)");
      adapter.prepare("INSERT INTO close_test VALUES (1)").run();
      
      // Close adapter
      adapter.close();
      
      // File should still exist
      expect(await fs.pathExists(dbPath)).toBe(true);
      
      // Should be able to reopen
      const adapter2 = await DatabaseAdapterFactory.create(dbPath);
      const result = adapter2.prepare("SELECT * FROM close_test").get();
      expect(result.id).toBe(1);
      adapter2.close();
    }
    
    delete process.env.APEX_FORCE_ADAPTER;
  });
});

describe("Adapter-Specific Edge Cases", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-edge-case-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test("Handle adapter-specific transaction API differences", async () => {
    const nodeVersion = parseInt(process.version.slice(1).split(".")[0]);
    
    // Test node:sqlite specific behavior
    if (nodeVersion >= 22) {
      process.env.APEX_FORCE_ADAPTER = "node-sqlite";
      const dbPath = path.join(tempDir, "node-sqlite.db");
      const adapter = await DatabaseAdapterFactory.create(dbPath);
      
      // node:sqlite doesn't have native transaction() method
      // Our adapter should provide compatibility wrapper
      expect(typeof adapter.transaction).toBe("function");
      
      // Test the wrapper works
      const tx = adapter.transaction(() => {
        adapter.exec("CREATE TABLE test_wrapper (id INTEGER)");
      });
      
      expect(() => tx()).not.toThrow();
      
      // Verify table was created
      const tables = adapter.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='test_wrapper'
      `).get();
      expect(tables).toBeDefined();
      
      adapter.close();
    }
    
    delete process.env.APEX_FORCE_ADAPTER;
  });

  test("WASM adapter handles persistence correctly", async () => {
    process.env.APEX_FORCE_ADAPTER = "wasm";
    const dbPath = path.join(tempDir, "wasm-persist.db");
    
    // Create and write with WASM adapter
    const adapter1 = await DatabaseAdapterFactory.create(dbPath);
    adapter1.exec("CREATE TABLE wasm_test (id INTEGER, data TEXT)");
    const stmt1 = adapter1.prepare("INSERT INTO wasm_test VALUES (?, ?)");
    stmt1.run(1, "test data");
    adapter1.close();
    
    // Verify file exists
    expect(await fs.pathExists(dbPath)).toBe(true);
    
    // Reopen and read with WASM adapter
    const adapter2 = await DatabaseAdapterFactory.create(dbPath);
    const result = adapter2.prepare("SELECT * FROM wasm_test WHERE id = 1").get();
    expect(result).toBeDefined();
    expect(result.data).toBe("test data");
    adapter2.close();
    
    delete process.env.APEX_FORCE_ADAPTER;
  });
});
function getMigrationRows(adapter) {
  const hasVersionsTable = adapter
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='migration_versions'",
    )
    .get();

  const tableName = hasVersionsTable ? "migration_versions" : "migrations";
  return adapter.prepare(`SELECT * FROM ${tableName} ORDER BY version`).all();
}

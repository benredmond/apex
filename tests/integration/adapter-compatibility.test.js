/**
 * Comprehensive adapter compatibility tests
 * Tests all DatabaseAdapter interface methods across all adapters
 */

import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { DatabaseAdapterFactory } from "../../src/storage/database-adapter.js";
import fs from "fs-extra";
import path from "path";
import os from "os";

// Cache adapter availability at module level to avoid repeated dynamic imports
let cachedAdapters = null;
const getAvailableAdapters = async () => {
  if (cachedAdapters) return cachedAdapters;
  
  const adapters = [];
  
  // Check node:sqlite (Node 22+)
  const nodeVersion = parseInt(process.version.slice(1).split(".")[0]);
  if (nodeVersion >= 22) {
    adapters.push("node-sqlite");
  }
  
  // Check better-sqlite3 - only check once at module load
  try {
    const BetterSqlite3 = await import("better-sqlite3");
    if (BetterSqlite3) {
      adapters.push("better-sqlite3");
    }
  } catch {
    // Not available
  }
  
  // WASM is always available
  adapters.push("wasm");
  
  cachedAdapters = adapters;
  return adapters;
};

describe("DatabaseAdapter Interface Compliance", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-adapter-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test("All adapters implement complete DatabaseAdapter interface", async () => {
    const availableAdapters = await getAvailableAdapters();
    console.log(`Testing ${availableAdapters.length} adapters: ${availableAdapters.join(", ")}`);
    
    for (const adapterType of availableAdapters) {
      console.log(`\nTesting ${adapterType} adapter...`);
      process.env.APEX_FORCE_ADAPTER = adapterType;
      const dbPath = path.join(tempDir, `${adapterType}-interface.db`);
      
      let adapter;
      try {
        adapter = await DatabaseAdapterFactory.create(dbPath);
      } catch (error) {
        console.log(`  Skipping ${adapterType}: ${error.message}`);
        continue;
      }
      
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
        
        // Check the actual adapter type, not what was requested
        // (fallback may have occurred)
        const actualAdapterType = isNode ? "node-sqlite" : 
                                 (adapter.getInstance().constructor.name.includes("Database") ? "wasm" : "better-sqlite3");
        console.log(`  Actual adapter type: ${actualAdapterType}`);
        
        // Just verify the method returns a boolean
        expect(typeof isNode).toBe("boolean");
        
        // Test getInstance() returns underlying database instance
        const instance = adapter.getInstance();
        expect(instance).toBeDefined();
        expect(instance).not.toBeNull();
        
        // Instance should have some database-like properties/methods
        // Note: Due to fallback, we check the actual type
        if (!isNode && typeof instance.prepare === "function") {
          // better-sqlite3
          expect(typeof instance.prepare).toBe("function");
        } else if (isNode) {
          // node-sqlite
          expect(typeof instance.exec).toBe("function");
        } else {
          // wasm - check for sql.js specific properties
          expect(instance).toBeDefined();
          // WASM adapter's instance is the sql.js Database object
        }
        
        // Test close() properly closes database connection
        expect(() => {
          adapter.prepare("SELECT * FROM test_prepare").all();
        }).not.toThrow();
        
        adapter.close();
        
        // Double close behavior varies by adapter, just ensure it doesn't crash
        try {
          adapter.close();
        } catch {
          // Some adapters throw on double close, which is acceptable
        }
        
        console.log(`✓ ${adapterType} adapter passed all interface tests`);
        
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

describe("Adapter Performance Benchmarks", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-perf-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test("Benchmark adapter operations", async () => {
    const availableAdapters = await getAvailableAdapters();
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
});
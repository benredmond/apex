// Performance tests for storage operations
import { describe, test, expect } from "vitest";
import { initTestDatabase } from "../helpers/vitest-db.js";
import { PatternRepository } from "../../dist/storage/repository.js";
import { PatternDatabase } from "../../dist/storage/database.js";

describe("Storage Performance Tests", () => {
  test("should handle 1000 bulk inserts efficiently", async () => {
    const { dbPath, cleanup } = await initTestDatabase();

    try {
      const db = await PatternDatabase.create(dbPath);
      const repository = new PatternRepository(db);

      // Generate test patterns
      const patterns = [];
      for (let i = 0; i < 1000; i++) {
        patterns.push({
          id: `PERF:TEST:${i.toString().padStart(4, "0")}`,
          type: "performance",
          title: `Test Pattern ${i}`,
          summary: `Performance test pattern number ${i}`,
          content: {
            description: `This is test pattern ${i} for performance testing`,
            solution: `Solution for pattern ${i}`,
            references: []
          },
          category: "test",
          subcategory: "performance",
          metadata: {
            confidence: 0.8,
            author: "test",
            timestamp: new Date().toISOString()
          }
        });
      }

      // Measure bulk insert time
      const startTime = Date.now();

      for (const pattern of patterns) {
        await repository.save(pattern);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);

      // Verify all patterns were inserted
      const count = await repository.count();
      expect(count).toBeGreaterThanOrEqual(1000);

      await db.close();
    } finally {
      await cleanup();
    }
  });

  test("should search 1000 patterns efficiently", async () => {
    const { dbPath, cleanup } = await initTestDatabase();

    try {
      const db = await PatternDatabase.create(dbPath);
      const repository = new PatternRepository(db);

      // Insert test patterns first
      const patterns = [];
      for (let i = 0; i < 1000; i++) {
        const pattern = {
          id: `SEARCH:TEST:${i.toString().padStart(4, "0")}`,
          type: "search",
          title: `Searchable Pattern ${i}`,
          summary: i % 2 === 0 ? `Contains keyword alpha ${i}` : `Contains keyword beta ${i}`,
          content: {
            description: `Description for pattern ${i}`,
            keywords: i % 2 === 0 ? ["alpha", "test"] : ["beta", "test"]
          },
          category: "search",
          subcategory: "test",
          metadata: {
            confidence: Math.random(),
            timestamp: new Date().toISOString()
          }
        };
        patterns.push(pattern);
        await repository.save(pattern);
      }

      // Measure search performance
      const searchStartTime = Date.now();

      // Search for patterns containing "alpha"
      const results = await repository.search("alpha");

      const searchEndTime = Date.now();
      const searchDuration = searchEndTime - searchStartTime;

      // Should complete within 500ms
      expect(searchDuration).toBeLessThan(500);

      // Should find roughly half the patterns (those with "alpha")
      expect(results.length).toBeGreaterThan(400);
      expect(results.length).toBeLessThan(600);

      await db.close();
    } finally {
      await cleanup();
    }
  });

  test("should handle concurrent operations efficiently", async () => {
    const { dbPath, cleanup } = await initTestDatabase();

    try {
      const db = await PatternDatabase.create(dbPath);
      const repository = new PatternRepository(db);

      // Create test patterns for concurrent operations
      const operations = [];

      // Mix of inserts, updates, and searches
      for (let i = 0; i < 100; i++) {
        if (i % 3 === 0) {
          // Insert operation
          operations.push(repository.save({
            id: `CONCURRENT:INSERT:${i}`,
            type: "concurrent",
            title: `Concurrent Insert ${i}`,
            summary: `Testing concurrent insert ${i}`,
            content: { test: true },
            category: "concurrent",
            subcategory: "insert",
            metadata: { timestamp: new Date().toISOString() }
          }));
        } else if (i % 3 === 1) {
          // Search operation
          operations.push(repository.search(`test`));
        } else {
          // Count operation
          operations.push(repository.count());
        }
      }

      const startTime = Date.now();

      // Execute all operations concurrently
      await Promise.all(operations);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within 2 seconds
      expect(duration).toBeLessThan(2000);

      // Verify inserts succeeded
      const finalCount = await repository.count();
      expect(finalCount).toBeGreaterThanOrEqual(33); // At least 33 inserts

      await db.close();
    } finally {
      await cleanup();
    }
  });
});
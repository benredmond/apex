// Unit tests for PatternRepository
import { describe, test, expect, beforeEach } from "vitest";
import { initTestDatabase } from "../helpers/vitest-db.js";
import { PatternRepository } from "../../dist/storage/repository.js";
import { PatternDatabase } from "../../dist/storage/database.js";

describe("PatternRepository Tests", () => {
  describe("Basic CRUD operations", () => {
    test("should save and retrieve a pattern", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        const db = await PatternDatabase.create(dbPath);
        const repository = new PatternRepository(db);

        const pattern = {
          id: "TEST:CRUD:001",
          type: "test",
          title: "Test Pattern",
          summary: "A test pattern for CRUD operations",
          content: {
            description: "This is a test pattern",
            example: "Example code here",
            references: ["ref1", "ref2"]
          },
          category: "test",
          subcategory: "crud",
          metadata: {
            author: "test-suite",
            confidence: 0.9,
            timestamp: new Date().toISOString()
          }
        };

        // Save the pattern
        await repository.save(pattern);

        // Retrieve the pattern
        const retrieved = await repository.findById("TEST:CRUD:001");

        expect(retrieved).toBeDefined();
        expect(retrieved.id).toBe(pattern.id);
        expect(retrieved.title).toBe(pattern.title);
        expect(retrieved.summary).toBe(pattern.summary);
        expect(retrieved.content).toEqual(pattern.content);

        await db.close();
      } finally {
        await cleanup();
      }
    });

    test("should update an existing pattern", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        const db = await PatternDatabase.create(dbPath);
        const repository = new PatternRepository(db);

        // Create initial pattern
        const pattern = {
          id: "TEST:UPDATE:001",
          type: "test",
          title: "Original Title",
          summary: "Original summary",
          content: { test: true },
          category: "test",
          subcategory: "update",
          metadata: { timestamp: new Date().toISOString() }
        };

        await repository.save(pattern);

        // Update the pattern
        const updated = {
          ...pattern,
          title: "Updated Title",
          summary: "Updated summary",
          content: { test: false, updated: true }
        };

        await repository.save(updated);

        // Verify the update
        const retrieved = await repository.findById("TEST:UPDATE:001");

        expect(retrieved.title).toBe("Updated Title");
        expect(retrieved.summary).toBe("Updated summary");
        expect(retrieved.content).toEqual({ test: false, updated: true });

        await db.close();
      } finally {
        await cleanup();
      }
    });

    test("should delete a pattern", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        const db = await PatternDatabase.create(dbPath);
        const repository = new PatternRepository(db);

        // Create a pattern
        const pattern = {
          id: "TEST:DELETE:001",
          type: "test",
          title: "Pattern to Delete",
          summary: "This pattern will be deleted",
          content: { temporary: true },
          category: "test",
          subcategory: "delete",
          metadata: { timestamp: new Date().toISOString() }
        };

        await repository.save(pattern);

        // Verify it exists
        const exists = await repository.findById("TEST:DELETE:001");
        expect(exists).toBeDefined();

        // Delete the pattern
        await repository.delete("TEST:DELETE:001");

        // Verify it's gone
        const deleted = await repository.findById("TEST:DELETE:001");
        expect(deleted).toBeUndefined();

        await db.close();
      } finally {
        await cleanup();
      }
    });
  });

  describe("Search functionality", () => {
    test("should search patterns by text", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        const db = await PatternDatabase.create(dbPath);
        const repository = new PatternRepository(db);

        // Insert test patterns
        const patterns = [
          {
            id: "TEST:SEARCH:001",
            type: "test",
            title: "Authentication Pattern",
            summary: "Handles user authentication",
            content: { type: "auth" },
            category: "security",
            subcategory: "auth",
            metadata: { timestamp: new Date().toISOString() }
          },
          {
            id: "TEST:SEARCH:002",
            type: "test",
            title: "Database Pattern",
            summary: "Handles database connections",
            content: { type: "db" },
            category: "database",
            subcategory: "connection",
            metadata: { timestamp: new Date().toISOString() }
          },
          {
            id: "TEST:SEARCH:003",
            type: "test",
            title: "Authentication Database",
            summary: "Combines auth and database",
            content: { type: "hybrid" },
            category: "security",
            subcategory: "database",
            metadata: { timestamp: new Date().toISOString() }
          }
        ];

        for (const pattern of patterns) {
          await repository.save(pattern);
        }

        // Search for "authentication"
        const authResults = await repository.search("authentication");
        expect(authResults.length).toBe(2);
        expect(authResults.map(r => r.id)).toContain("TEST:SEARCH:001");
        expect(authResults.map(r => r.id)).toContain("TEST:SEARCH:003");

        // Search for "database"
        const dbResults = await repository.search("database");
        expect(dbResults.length).toBe(2);
        expect(dbResults.map(r => r.id)).toContain("TEST:SEARCH:002");
        expect(dbResults.map(r => r.id)).toContain("TEST:SEARCH:003");

        await db.close();
      } finally {
        await cleanup();
      }
    });

    test("should filter patterns by category", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        const db = await PatternDatabase.create(dbPath);
        const repository = new PatternRepository(db);

        // Insert patterns with different categories
        const patterns = [
          {
            id: "TEST:FILTER:001",
            type: "test",
            title: "Security Pattern 1",
            summary: "First security pattern",
            content: {},
            category: "security",
            subcategory: "auth",
            metadata: { timestamp: new Date().toISOString() }
          },
          {
            id: "TEST:FILTER:002",
            type: "test",
            title: "Security Pattern 2",
            summary: "Second security pattern",
            content: {},
            category: "security",
            subcategory: "encryption",
            metadata: { timestamp: new Date().toISOString() }
          },
          {
            id: "TEST:FILTER:003",
            type: "test",
            title: "Database Pattern",
            summary: "Database pattern",
            content: {},
            category: "database",
            subcategory: "query",
            metadata: { timestamp: new Date().toISOString() }
          }
        ];

        for (const pattern of patterns) {
          await repository.save(pattern);
        }

        // Filter by category
        const securityPatterns = await repository.findByCategory("security");
        expect(securityPatterns.length).toBe(2);
        expect(securityPatterns.map(p => p.id)).toContain("TEST:FILTER:001");
        expect(securityPatterns.map(p => p.id)).toContain("TEST:FILTER:002");

        const databasePatterns = await repository.findByCategory("database");
        expect(databasePatterns.length).toBe(1);
        expect(databasePatterns[0].id).toBe("TEST:FILTER:003");

        await db.close();
      } finally {
        await cleanup();
      }
    });
  });

  describe("Batch operations", () => {
    test("should handle batch inserts", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        const db = await PatternDatabase.create(dbPath);
        const repository = new PatternRepository(db);

        // Create batch of patterns
        const patterns = [];
        for (let i = 0; i < 100; i++) {
          patterns.push({
            id: `TEST:BATCH:${i.toString().padStart(3, "0")}`,
            type: "test",
            title: `Batch Pattern ${i}`,
            summary: `Batch test pattern number ${i}`,
            content: { index: i },
            category: "batch",
            subcategory: "test",
            metadata: { timestamp: new Date().toISOString() }
          });
        }

        // Save all patterns
        for (const pattern of patterns) {
          await repository.save(pattern);
        }

        // Verify count
        const count = await repository.count();
        expect(count).toBeGreaterThanOrEqual(100);

        // Verify specific patterns
        const first = await repository.findById("TEST:BATCH:000");
        expect(first).toBeDefined();
        expect(first.title).toBe("Batch Pattern 0");

        const last = await repository.findById("TEST:BATCH:099");
        expect(last).toBeDefined();
        expect(last.title).toBe("Batch Pattern 99");

        await db.close();
      } finally {
        await cleanup();
      }
    });

    test("should handle batch deletes", async () => {
      const { dbPath, cleanup } = await initTestDatabase();

      try {
        const db = await PatternDatabase.create(dbPath);
        const repository = new PatternRepository(db);

        // Insert patterns
        const ids = [];
        for (let i = 0; i < 10; i++) {
          const id = `TEST:BATCH_DELETE:${i}`;
          ids.push(id);
          await repository.save({
            id,
            type: "test",
            title: `Delete Pattern ${i}`,
            summary: `Pattern to be deleted ${i}`,
            content: {},
            category: "delete",
            subcategory: "batch",
            metadata: { timestamp: new Date().toISOString() }
          });
        }

        // Verify they exist
        const beforeCount = await repository.count();
        expect(beforeCount).toBeGreaterThanOrEqual(10);

        // Delete them all
        for (const id of ids) {
          await repository.delete(id);
        }

        // Verify they're gone
        for (const id of ids) {
          const pattern = await repository.findById(id);
          expect(pattern).toBeUndefined();
        }

        await db.close();
      } finally {
        await cleanup();
      }
    });
  });
});
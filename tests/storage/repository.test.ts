// Unit tests for PatternRepository
import fs from "fs-extra";
import { describe, test, expect } from "vitest";
import { createTestDbPath } from "../helpers/vitest-db.js";
import { PatternRepository } from "../../dist/storage/repository.js";

function buildPattern(
  id: string,
  overrides: Partial<Record<string, any>> = {},
) {
  const timestamp = new Date().toISOString();
  const title = overrides.title ?? `Pattern ${id}`;
  const summary = overrides.summary ?? `Summary for ${id}`;
  const base = {
    id,
    schema_version: "1.0.0",
    pattern_version: "1.0.0",
    type: "TEST",
    category: overrides.category,
    subcategory: overrides.subcategory,
    title,
    summary,
    trust_score: 0.6,
    alpha: 1,
    beta: 1,
    created_at: timestamp,
    updated_at: timestamp,
    pattern_digest: `digest-${id}`,
    json_canonical: JSON.stringify({ id, title, summary }),
    tags: Array.isArray(overrides.tags) ? overrides.tags : [],
    keywords: Array.isArray(overrides.tags)
      ? overrides.tags.join(",")
      : `${title}`,
    search_index: `${title} ${summary}`,
    usage_count: 0,
    success_count: 0,
  };

  return {
    ...base,
    ...overrides,
    tags: Array.isArray(overrides.tags) ? overrides.tags : base.tags,
    created_at: overrides.created_at ?? base.created_at,
    updated_at:
      overrides.updated_at ?? overrides.created_at ?? base.updated_at,
    json_canonical: overrides.json_canonical ?? base.json_canonical,
    keywords: overrides.keywords ?? base.keywords,
    search_index: overrides.search_index ?? base.search_index,
  };
}

async function setupRepository() {
  const { dbPath, tempDir } = await createTestDbPath("pattern-repo");
  const repository = await PatternRepository.create({ dbPath });
  const db: any = (repository as any).db;
  const adapter = db?.database;
  if (adapter?.supportsFTSTriggers?.() === false) {
    (repository as any).ftsManager?.disableTriggers?.("patterns");
  }
  return {
    repository,
    async cleanup() {
      try {
        await repository.shutdown();
      } catch (error: any) {
        if (!error || !/not open/i.test(String(error.message))) {
          throw error;
        }
      }
      await fs.remove(tempDir);
    },
  };
}

describe("PatternRepository Tests", () => {
  describe("Basic CRUD operations", () => {
    test("should create and retrieve a pattern", async () => {
      const { repository, cleanup } = await setupRepository();

      try {
        const pattern = buildPattern("TEST:CRUD:001", {
          tags: ["crud", "repository"],
        });

        await repository.create(pattern);

        const retrieved = await repository.get(pattern.id);

        expect(retrieved).not.toBeNull();
        expect(retrieved?.id).toBe(pattern.id);
        expect(retrieved?.title).toBe(pattern.title);
        expect(retrieved?.tags).toEqual(pattern.tags);
      } finally {
        await cleanup();
      }
    });

    test("should update an existing pattern", async () => {
      const { repository, cleanup } = await setupRepository();

      try {
        const pattern = buildPattern("TEST:UPDATE:001", {
          summary: "Original summary",
        });

        await repository.create(pattern);

        await repository.update(pattern.id, {
          title: "Updated Title",
          summary: "Updated summary",
          search_index: "Updated summary",
        });

        const retrieved = await repository.get(pattern.id);

        expect(retrieved?.title).toBe("Updated Title");
        expect(retrieved?.summary).toBe("Updated summary");
      } finally {
        await cleanup();
      }
    });

    test("should delete a pattern", async () => {
      const { repository, cleanup } = await setupRepository();

      try {
        const pattern = buildPattern("TEST:DELETE:001");

        await repository.create(pattern);

        const exists = await repository.get(pattern.id);
        expect(exists).not.toBeNull();

        await repository.delete(pattern.id);

        const deleted = await repository.get(pattern.id);
        expect(deleted).toBeNull();
      } finally {
        await cleanup();
      }
    });
  });

  describe("Search functionality", () => {
    test("should search patterns by text", async () => {
      const { repository, cleanup } = await setupRepository();

      try {
        const patterns = [
          buildPattern("TEST:SEARCH:001", {
            title: "Authentication Pattern",
            summary: "Handles user authentication",
            tags: ["security", "auth"],
          }),
          buildPattern("TEST:SEARCH:002", {
            title: "Database Pattern",
            summary: "Handles database connections",
            tags: ["database"],
          }),
          buildPattern("TEST:SEARCH:003", {
            title: "Authentication Database",
            summary: "Combines auth and database",
            tags: ["security", "database"],
          }),
        ];

        for (const pattern of patterns) {
          await repository.create(pattern);
        }

        const authResults = await repository.search({ task: "authentication" });
        expect(authResults.patterns.length).toBe(2);
        expect(authResults.patterns.map((p) => p.id)).toContain(
          "TEST:SEARCH:001",
        );
        expect(authResults.patterns.map((p) => p.id)).toContain(
          "TEST:SEARCH:003",
        );

        const dbResults = await repository.search({ task: "database" });
        expect(dbResults.patterns.length).toBe(2);
        expect(dbResults.patterns.map((p) => p.id)).toContain(
          "TEST:SEARCH:002",
        );
        expect(dbResults.patterns.map((p) => p.id)).toContain(
          "TEST:SEARCH:003",
        );
      } finally {
        await cleanup();
      }
    });

    test("should filter patterns by tags", async () => {
      const { repository, cleanup } = await setupRepository();

      try {
        const patterns = [
          buildPattern("TEST:FILTER:001", {
            title: "Security Pattern 1",
            tags: ["security", "auth"],
          }),
          buildPattern("TEST:FILTER:002", {
            title: "Security Pattern 2",
            tags: ["security", "encryption"],
          }),
          buildPattern("TEST:FILTER:003", {
            title: "Database Pattern",
            tags: ["database"],
          }),
        ];

        for (const pattern of patterns) {
          await repository.create(pattern);
        }

        const securityPatterns = await repository.list({
          limit: 10,
          filter: { tags: ["security"] },
        });
        expect(securityPatterns.length).toBe(2);
        expect(securityPatterns.map((p) => p.id)).toContain(
          "TEST:FILTER:001",
        );
        expect(securityPatterns.map((p) => p.id)).toContain(
          "TEST:FILTER:002",
        );

        const databasePatterns = await repository.list({
          limit: 10,
          filter: { tags: ["database"] },
        });
        expect(databasePatterns.length).toBe(1);
        expect(databasePatterns[0].id).toBe("TEST:FILTER:003");
      } finally {
        await cleanup();
      }
    });
  });

  describe("Batch operations", () => {
    test("should handle batch inserts", async () => {
      const { repository, cleanup } = await setupRepository();

      try {
        const patterns = [];
        for (let i = 0; i < 100; i++) {
          patterns.push(
            buildPattern(`TEST:BATCH:${i.toString().padStart(3, "0")}`, {
              title: `Batch Pattern ${i}`,
              summary: `Batch test pattern number ${i}`,
              tags: ["batch", "test"],
            }),
          );
        }

        for (const pattern of patterns) {
          await repository.create(pattern);
        }

        const allPatterns = await repository.list({ limit: 150 });
        expect(allPatterns.length).toBeGreaterThanOrEqual(100);

        const first = await repository.get("TEST:BATCH:000");
        expect(first).not.toBeNull();
        expect(first?.title).toBe("Batch Pattern 0");

        const last = await repository.get("TEST:BATCH:099");
        expect(last).not.toBeNull();
        expect(last?.title).toBe("Batch Pattern 99");
      } finally {
        await cleanup();
      }
    });

    test("should handle batch deletes", async () => {
      const { repository, cleanup } = await setupRepository();

      try {
        const ids: string[] = [];
        for (let i = 0; i < 10; i++) {
          const id = `TEST:BATCH_DELETE:${i}`;
          ids.push(id);
          await repository.create(
            buildPattern(id, {
              title: `Delete Pattern ${i}`,
              tags: ["delete", "batch"],
            }),
          );
        }

        const before = await repository.list({ limit: 50 });
        expect(before.length).toBeGreaterThanOrEqual(10);

        for (const id of ids) {
          await repository.delete(id);
        }

        for (const id of ids) {
          const pattern = await repository.get(id);
          expect(pattern).toBeNull();
        }
      } finally {
        await repository.shutdown();
        await cleanup();
      }
    });
  });
});

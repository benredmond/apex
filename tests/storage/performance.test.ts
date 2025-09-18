// Performance tests for storage operations
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
    type: overrides.type ?? "TEST",
    category: overrides.category,
    subcategory: overrides.subcategory,
    title,
    summary,
    trust_score: overrides.trust_score ?? 0.6,
    alpha: 1,
    beta: 1,
    created_at: timestamp,
    updated_at: timestamp,
    pattern_digest: overrides.pattern_digest ?? `digest-${id}`,
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
  const { dbPath, tempDir } = await createTestDbPath("pattern-perf");
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

describe("Storage Performance Tests", () => {
  test("should handle 1000 bulk inserts efficiently", async () => {
    const { repository, cleanup } = await setupRepository();

    try {
      const patterns = [];
      for (let i = 0; i < 1000; i++) {
        patterns.push(
          buildPattern(`PERF:TEST:${i.toString().padStart(4, "0")}`, {
            title: `Test Pattern ${i}`,
            summary: `Performance test pattern number ${i}`,
            tags: ["performance", "bulk"],
          }),
        );
      }

      const startTime = Date.now();
      for (const pattern of patterns) {
        await repository.create(pattern);
      }
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);

      const inserted = await repository.list({ limit: 1200 });
      expect(inserted.length).toBeGreaterThanOrEqual(1000);
    } finally {
      await cleanup();
    }
  });

  test("should search 1000 patterns efficiently", async () => {
    const { repository, cleanup } = await setupRepository();

    try {
      for (let i = 0; i < 1000; i++) {
        await repository.create(
          buildPattern(`SEARCH:TEST:${i.toString().padStart(4, "0")}`, {
            type: "TEST",
            title: `Searchable Pattern ${i}`,
            summary:
              i % 2 === 0
                ? `Contains keyword alpha ${i}`
                : `Contains keyword beta ${i}`,
            tags: i % 2 === 0 ? ["alpha", "test"] : ["beta", "test"],
          }),
        );
      }

      const searchStartTime = Date.now();
      const alphaResult = await repository.search({ task: "alpha", k: 1000 });
      const searchDuration = Date.now() - searchStartTime;

      expect(searchDuration).toBeLessThan(500);

      expect(alphaResult.patterns.length).toBeGreaterThan(400);
      expect(alphaResult.patterns.length).toBeLessThan(600);
    } finally {
      await cleanup();
    }
  });

  test("should handle concurrent operations efficiently", async () => {
    const { repository, cleanup } = await setupRepository();

    try {
      const operations: Promise<unknown>[] = [];

      for (let i = 0; i < 100; i++) {
        if (i % 3 === 0) {
          operations.push(
            repository.create(
              buildPattern(`CONCURRENT:INSERT:${i}`, {
                type: "TEST",
                title: `Concurrent Insert ${i}`,
                summary: `Testing concurrent insert ${i}`,
                tags: ["concurrency", "insert"],
              }),
            ),
          );
        } else if (i % 3 === 1) {
          operations.push(repository.search({ task: "test", k: 10 }));
        } else {
          operations.push(repository.list({ limit: 10 }));
        }
      }

      const startTime = Date.now();
      await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);

      const finalPatterns = await repository.list({ limit: 200 });
      expect(finalPatterns.length).toBeGreaterThanOrEqual(33);
    } finally {
      await cleanup();
    }
  });
});

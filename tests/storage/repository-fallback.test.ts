import { describe, test, expect } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { PatternRepository } from "../../src/storage/repository.js";
import { DatabaseAdapterFactory } from "../../src/storage/database-adapter.js";

async function setupRepositoryWithFallback() {
  const previousAdapter = process.env.APEX_FORCE_ADAPTER;
  process.env.APEX_FORCE_ADAPTER = "wasm";

  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "apex-repo-fallback-"),
  );
  const primaryPath = path.join(tempDir, "primary.db");
  const fallbackPath = path.join(tempDir, "fallback.db");

  const fallbackDb = await DatabaseAdapterFactory.create(fallbackPath);
  fallbackDb.exec(`
    CREATE TABLE patterns (
      id TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      pattern_version TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      trust_score REAL NOT NULL,
      invalid INTEGER NOT NULL DEFAULT 0,
      tags TEXT
    );
  `);

  const fallbackPatternId = "FALLBACK:TEST:PATTERN";
  fallbackDb
    .prepare(
      `
      INSERT INTO patterns (
        id, schema_version, pattern_version, type, title, summary, trust_score, invalid, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      fallbackPatternId,
      "1.0.0",
      "1.0.0",
      "LANG",
      "Fallback Pattern",
      "From fallback database",
      0.7,
      0,
      "[]",
    );
  fallbackDb.close();

  const repository = await PatternRepository.create({
    dbPath: primaryPath,
    fallbackPath,
  });

  return {
    repository,
    fallbackPatternId,
    async cleanup() {
      try {
        await repository.shutdown();
      } catch (error: any) {
        if (!error || !/not open/i.test(String(error.message))) {
          throw error;
        }
      }
      await fs.remove(tempDir);
      if (previousAdapter === undefined) {
        delete process.env.APEX_FORCE_ADAPTER;
      } else {
        process.env.APEX_FORCE_ADAPTER = previousAdapter;
      }
    },
  };
}

async function setupRepositoryWithFacetFallback() {
  const previousAdapter = process.env.APEX_FORCE_ADAPTER;
  process.env.APEX_FORCE_ADAPTER = "wasm";

  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "apex-repo-fallback-facets-"),
  );
  const primaryPath = path.join(tempDir, "primary.db");
  const fallbackPath = path.join(tempDir, "fallback.db");

  const fallbackDb = await DatabaseAdapterFactory.create(fallbackPath);
  fallbackDb.exec(`
    CREATE TABLE patterns (
      id TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      pattern_version TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      trust_score REAL NOT NULL,
      invalid INTEGER NOT NULL DEFAULT 0,
      tags TEXT
    );
  `);
  fallbackDb.exec(`
    CREATE VIRTUAL TABLE patterns_fts USING fts3(
      id,
      title,
      summary,
      tags,
      keywords,
      search_index,
      tokenize=simple
    );
  `);
  fallbackDb.exec(`
    CREATE TABLE pattern_languages (
      pattern_id TEXT NOT NULL,
      lang TEXT NOT NULL
    );
  `);

  const fallbackPatternId = "FALLBACK:TEST:FACET:PATTERN";
  fallbackDb
    .prepare(
      `
      INSERT INTO patterns (
        rowid, id, schema_version, pattern_version, type, title, summary, trust_score, invalid, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      1,
      fallbackPatternId,
      "1.0.0",
      "1.0.0",
      "LANG",
      "Fallback Pattern With Facets",
      "authentication fallback",
      0.9,
      0,
      "[]",
    );

  fallbackDb
    .prepare(
      `
      INSERT INTO patterns_fts (
        rowid, id, title, summary, tags, keywords, search_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      1,
      fallbackPatternId,
      "Fallback Pattern With Facets",
      "authentication fallback",
      "[]",
      "",
      "",
    );

  fallbackDb
    .prepare(
      `
      INSERT INTO pattern_languages (pattern_id, lang) VALUES (?, ?)
    `,
    )
    .run(fallbackPatternId, "python");

  fallbackDb.close();

  const repository = await PatternRepository.create({
    dbPath: primaryPath,
    fallbackPath,
  });

  return {
    repository,
    fallbackPatternId,
    async cleanup() {
      try {
        await repository.shutdown();
      } catch (error: any) {
        if (!error || !/not open/i.test(String(error.message))) {
          throw error;
        }
      }
      await fs.remove(tempDir);
      if (previousAdapter === undefined) {
        delete process.env.APEX_FORCE_ADAPTER;
      } else {
        process.env.APEX_FORCE_ADAPTER = previousAdapter;
      }
    },
  };
}

describe("PatternRepository fallback behavior", () => {
  test("returns fallback patterns when facet tables are missing", async () => {
    const { repository, cleanup, fallbackPatternId } =
      await setupRepositoryWithFallback();

    try {
      const results = await repository.search({
        task: "authentication",
        languages: ["typescript"],
      });

      const ids = results.patterns.map((pattern) => pattern.id);
      expect(ids).toContain(fallbackPatternId);
    } finally {
      await cleanup();
    }
  });

  test("returns fallback patterns even when facet tables exist but don't match filters", async () => {
    const { repository, cleanup, fallbackPatternId } =
      await setupRepositoryWithFacetFallback();

    try {
      const results = await repository.search({
        task: "authentication",
        languages: ["typescript"],
      });

      const ids = results.patterns.map((pattern) => pattern.id);
      expect(ids).toContain(fallbackPatternId);
    } finally {
      await cleanup();
    }
  });
});

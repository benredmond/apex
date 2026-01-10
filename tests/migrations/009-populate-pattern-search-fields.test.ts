import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import os from "os";
import fs from "fs-extra";
import migration from "../../src/migrations/009-populate-pattern-search-fields.ts";
import { DatabaseAdapterFactory } from "../../src/storage/database-adapter.js";

describe("Migration 009: populate pattern search fields", () => {
  let db: any;
  let tempDir: string;
  let previousAdapter: string | undefined;

  beforeEach(async () => {
    previousAdapter = process.env.APEX_FORCE_ADAPTER;
    process.env.APEX_FORCE_ADAPTER = "wasm";

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-migration-009-"));
    const dbPath = path.join(tempDir, "test.db");
    db = await DatabaseAdapterFactory.create(dbPath);
    db.exec(`
      CREATE TABLE patterns (
        id TEXT PRIMARY KEY,
        title TEXT,
        summary TEXT,
        tags TEXT,
        keywords TEXT,
        search_index TEXT,
        json_canonical TEXT,
        invalid INTEGER DEFAULT 0
      );
    `);
    db.exec(`
      CREATE TABLE patterns_fts (
        patterns_fts TEXT,
        id TEXT,
        title TEXT,
        summary TEXT,
        tags TEXT,
        keywords TEXT,
        search_index TEXT
      );
    `);

    const insert = db.prepare(`
      INSERT INTO patterns (id, title, summary, tags, keywords, search_index, json_canonical, invalid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      "TEST:PATTERN:ARRAY",
      "Array Tags",
      "Uses array tags",
      null,
      null,
      null,
      JSON.stringify({
        id: "TEST:PATTERN:ARRAY",
        title: "Array Tags",
        summary: "Uses array tags",
        tags: ["alpha", "beta"],
      }),
      0,
    );

    insert.run(
      "TEST:PATTERN:CSV",
      "CSV Tags",
      "Uses CSV tags",
      null,
      null,
      null,
      JSON.stringify({
        id: "TEST:PATTERN:CSV",
        title: "CSV Tags",
        summary: "Uses CSV tags",
        tags: "gamma,delta",
      }),
      0,
    );

    insert.run(
      "TEST:PATTERN:EMPTY",
      "Empty Tags",
      "No tags provided",
      null,
      null,
      null,
      JSON.stringify({
        id: "TEST:PATTERN:EMPTY",
        title: "Empty Tags",
        summary: "No tags provided",
      }),
      0,
    );
  });

  afterEach(async () => {
    db.close();
    await fs.remove(tempDir);
    if (previousAdapter === undefined) {
      delete process.env.APEX_FORCE_ADAPTER;
    } else {
      process.env.APEX_FORCE_ADAPTER = previousAdapter;
    }
  });

  it("normalizes tags to JSON arrays", () => {
    migration.up(db);

    const rows = db
      .prepare("SELECT id, tags FROM patterns ORDER BY id")
      .all() as Array<{ id: string; tags: string }>;

    const tagsById = new Map(
      rows.map((row) => [row.id, JSON.parse(row.tags)]),
    );

    expect(tagsById.get("TEST:PATTERN:ARRAY")).toEqual(["alpha", "beta"]);
    expect(tagsById.get("TEST:PATTERN:CSV")).toEqual(["gamma", "delta"]);
    expect(tagsById.get("TEST:PATTERN:EMPTY")).toEqual([]);
  });
});

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { MigrationRunner } from "../../src/migrations/MigrationRunner.js";
import type { Migration } from "../../src/migrations/types.js";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("MigrationRunner", () => {
  let db: Database.Database;
  let runner: MigrationRunner;
  let tempDir: string;

  beforeEach(() => {
    // Create temp database
    tempDir = mkdtempSync(join(tmpdir(), "apex-test-"));
    db = new Database(join(tempDir, "test.db"));
    runner = new MigrationRunner(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("creates migration table on initialization", () => {
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='migration_versions'
    `,
      )
      .all();

    expect(tables).toHaveLength(1);
  });

  test("gets correct status for pending migrations", () => {
    const migrations: Migration[] = [
      {
        id: "001-test",
        version: 1,
        name: "Test migration",
        up: () => {},
        down: () => {},
        checksum: "abc123",
      },
    ];

    const status = runner.getStatus(migrations);
    expect(status.pending).toHaveLength(1);
    expect(status.applied).toHaveLength(0);
    expect(status.total).toBe(1);
  });

  test("runs a simple migration", async () => {
    let tableCreated = false;

    const migration: Migration = {
      id: "001-create-test-table",
      version: 1,
      name: "Create test table",
      up: (db) => {
        db.exec("CREATE TABLE test_table (id TEXT PRIMARY KEY)");
        tableCreated = true;
      },
      down: (db) => {
        db.exec("DROP TABLE test_table");
      },
      checksum: "test123",
    };

    await runner.runMigrations([migration]);

    expect(tableCreated).toBe(true);

    // Verify table exists
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='test_table'
    `,
      )
      .all();
    expect(tables).toHaveLength(1);

    // Verify migration recorded
    const status = runner.getStatus([migration]);
    expect(status.applied).toHaveLength(1);
    expect(status.pending).toHaveLength(0);
  });

  test("uses savepoints for rollback on error", async () => {
    const migration: Migration = {
      id: "001-failing-migration",
      version: 1,
      name: "Failing migration",
      up: (db) => {
        db.exec("CREATE TABLE before_error (id TEXT)");
        throw new Error("Migration failed!");
      },
      down: () => {},
      checksum: "fail123",
    };

    await expect(runner.runMigrations([migration])).rejects.toThrow(
      "Migration failed!",
    );

    // Verify table was rolled back
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='before_error'
    `,
      )
      .all();
    expect(tables).toHaveLength(0);

    // Verify migration not recorded
    const status = runner.getStatus([migration]);
    expect(status.applied).toHaveLength(0);
    expect(status.pending).toHaveLength(1);
  });

  test("rollback reverses migrations", async () => {
    const migration: Migration = {
      id: "001-rollback-test",
      version: 1,
      name: "Rollback test",
      up: (db) => {
        db.exec("CREATE TABLE rollback_test (id TEXT)");
      },
      down: (db) => {
        db.exec("DROP TABLE rollback_test");
      },
      checksum: "rollback123",
    };

    // Run migration
    await runner.runMigrations([migration]);

    // Verify table exists
    let tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='rollback_test'
    `,
      )
      .all();
    expect(tables).toHaveLength(1);

    // Rollback
    await runner.rollbackMigrations([migration], 0);

    // Verify table removed
    tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='rollback_test'
    `,
      )
      .all();
    expect(tables).toHaveLength(0);
  });

  test("validates checksums", async () => {
    const migration1: Migration = {
      id: "001-checksum-test",
      version: 1,
      name: "Checksum test",
      up: () => {},
      down: () => {},
      checksum: "original",
    };

    // Run original migration
    await runner.runMigrations([migration1]);

    // Try to run with different checksum
    const migration2: Migration = {
      ...migration1,
      checksum: "different",
    };

    await expect(runner.runMigrations([migration2])).rejects.toThrow(
      "Checksum mismatch",
    );
  });

  test("dry run does not apply migrations", async () => {
    let executed = false;

    const migration: Migration = {
      id: "001-dry-run-test",
      version: 1,
      name: "Dry run test",
      up: () => {
        executed = true;
      },
      down: () => {},
      checksum: "dry123",
    };

    await runner.runMigrations([migration], { dryRun: true });

    expect(executed).toBe(false);

    const status = runner.getStatus([migration]);
    expect(status.pending).toHaveLength(1);
    expect(status.applied).toHaveLength(0);
  });
});

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { MigrationLoader } from "../../src/migrations/MigrationLoader.js";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("MigrationLoader", () => {
  let tempDir: string;
  let loader: MigrationLoader;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "apex-migrations-"));
    loader = new MigrationLoader(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("loads migrations from directory", async () => {
    // Create test migration files as .mjs for ES module compatibility
    const migration1 = `
export const migration = {
  id: "001-test-one",
  version: 1,
  name: "Test migration one",
  up: (db) => { db.exec("CREATE TABLE test1 (id TEXT)"); },
  down: (db) => { db.exec("DROP TABLE test1"); }
};`;

    const migration2 = `
export const migration = {
  id: "002-test-two", 
  version: 2,
  name: "Test migration two",
  up: (db) => { db.exec("CREATE TABLE test2 (id TEXT)"); },
  down: (db) => { db.exec("DROP TABLE test2"); }
};`;

    writeFileSync(join(tempDir, "001-test-one.mjs"), migration1);
    writeFileSync(join(tempDir, "002-test-two.mjs"), migration2);

    const migrations = await loader.loadMigrations();

    expect(migrations).toHaveLength(2);
    expect(migrations[0].version).toBe(1);
    expect(migrations[1].version).toBe(2);
  });

  test("validates version sequence", async () => {
    // Create non-sequential migration
    const migration = `
export const migration = {
  id: "003-skip-version",
  version: 3,
  name: "Skip version", 
  up: () => {},
  down: () => {}
};`;

    writeFileSync(join(tempDir, "003-skip-version.mjs"), migration);

    await expect(loader.loadMigrations()).rejects.toThrow(
      "Non-sequential migration versions",
    );
  });

  test("validates migration structure", async () => {
    // Create invalid migration (missing up function)
    const migration = `
export const migration = {
  id: "001-invalid",
  version: 1,
  name: "Invalid migration",
  down: () => {}
};`;

    writeFileSync(join(tempDir, "001-invalid.mjs"), migration);

    const migrations = await loader.loadMigrations();
    expect(migrations).toHaveLength(0); // Should skip invalid migration
  });

  test("calculates checksums", async () => {
    const migration = `
export const migration = {
  id: "001-checksum-test",
  version: 1,
  name: "Checksum test",
  up: (db) => { console.log("up"); },
  down: (db) => { console.log("down"); }
};`;

    writeFileSync(join(tempDir, "001-checksum-test.mjs"), migration);

    const migrations = await loader.loadMigrations();
    expect(migrations[0].checksum).toBeDefined();
    expect(migrations[0].checksum).toHaveLength(64); // SHA256 hex length
  });

  test("creates new migration file", async () => {
    const filePath = await loader.createMigration("Test Feature");

    expect(filePath).toMatch(/001-test-feature\.ts$/);

    // The created .ts file should exist but won't be loadable in test environment
    // This test just verifies the file creation logic
    expect(filePath).toBeTruthy();
  });

  test("increments version for new migrations", async () => {
    // Create existing migration
    const existing = `
export const migration = {
  id: "001-existing",
  version: 1,
  name: "Existing",
  up: () => {},
  down: () => {}
};`;
    writeFileSync(join(tempDir, "001-existing.js"), existing);

    // Create new migration
    const filePath = await loader.createMigration("New Feature");

    expect(filePath).toMatch(/002-new-feature\.ts$/);
  });
});

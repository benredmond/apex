// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import { readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createHash } from "crypto";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export class MigrationLoader {
  constructor(migrationsDir) {
    this.migrationCache = new Map();
    this.migrationsDir = migrationsDir || join(__dirname, "../migrations");
  }
  /**
   * Load all migrations from the migrations directory
   */
  async loadMigrations() {
    const files = await readdir(this.migrationsDir);
    const migrationFiles = files
      .filter((f) => f.match(/^\d{3}-.*\.(js|ts|mjs)$/))
      .sort();
    const migrations = [];
    for (const file of migrationFiles) {
      // Skip TypeScript files if corresponding JS exists (compiled output)
      if (file.endsWith(".ts")) {
        const jsFile = file.replace(".ts", ".js");
        if (files.includes(jsFile)) continue;
      }
      // Skip .js files if corresponding .mjs exists (ES module variant)
      if (file.endsWith(".js")) {
        const mjsFile = file.replace(".js", ".mjs");
        if (files.includes(mjsFile)) continue;
      }
      const migration = await this.loadMigration(file);
      if (migration) {
        migrations.push(migration);
      }
    }
    // Sort by version number
    migrations.sort((a, b) => a.version - b.version);
    // Validate sequential versions
    this.validateVersionSequence(migrations);
    return migrations;
  }
  /**
   * Load a single migration file
   */
  async loadMigration(filename) {
    const cached = this.migrationCache.get(filename);
    if (cached) return cached;
    try {
      const filePath = join(this.migrationsDir, filename);
      // [FIX:TEST:ESM] ★★★★☆ (18 uses, 88% success) - Fix ES module imports in Jest tests
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);
      // Support both default export and named export
      const migration = module.default || module.migration;
      if (!migration) {
        throw new Error(
          `Migration file ${filename} does not export a migration`,
        );
      }
      // Validate migration structure
      this.validateMigration(migration, filename);
      // Calculate checksum based on up/down function strings
      migration.checksum = this.calculateChecksum(migration);
      this.migrationCache.set(filename, migration);
      return migration;
    } catch (error) {
      console.error(`Failed to load migration ${filename}:`, error);
      return null;
    }
  }
  /**
   * Validate migration has required fields
   */
  validateMigration(migration, filename) {
    const errors = [];
    if (!migration.id) errors.push("Missing 'id' field");
    if (!migration.version || typeof migration.version !== "number") {
      errors.push("Missing or invalid 'version' field (must be number)");
    }
    if (!migration.name) errors.push("Missing 'name' field");
    if (typeof migration.up !== "function")
      errors.push("Missing or invalid 'up' function");
    if (typeof migration.down !== "function")
      errors.push("Missing or invalid 'down' function");
    // Validate version matches filename
    const versionMatch = filename.match(/^(\d{3})-/);
    if (versionMatch) {
      const fileVersion = parseInt(versionMatch[1], 10);
      if (migration.version !== fileVersion) {
        errors.push(
          `Version mismatch: file has ${fileVersion}, migration has ${migration.version}`,
        );
      }
    }
    if (errors.length > 0) {
      throw new Error(
        `Invalid migration ${filename}:\n  ${errors.join("\n  ")}`,
      );
    }
  }
  /**
   * Validate migrations have sequential version numbers
   */
  validateVersionSequence(migrations) {
    for (let i = 0; i < migrations.length; i++) {
      const expectedVersion = i + 1;
      if (migrations[i].version !== expectedVersion) {
        throw new Error(
          `Non-sequential migration versions: expected ${expectedVersion}, ` +
            `got ${migrations[i].version} for ${migrations[i].id}`,
        );
      }
    }
  }
  /**
   * Calculate checksum for migration based on function content
   */
  calculateChecksum(migration) {
    const content = JSON.stringify({
      id: migration.id,
      version: migration.version,
      up: migration.up.toString(),
      down: migration.down.toString(),
    });
    return createHash("sha256").update(content).digest("hex");
  }
  /**
   * Create a new migration file from template
   */
  async createMigration(name) {
    const files = await readdir(this.migrationsDir);
    const existingVersions = files
      .filter((f) => f.match(/^\d{3}-/))
      .map((f) => parseInt(f.substring(0, 3), 10))
      .filter((v) => !isNaN(v));
    const nextVersion =
      existingVersions.length > 0 ? Math.max(...existingVersions) + 1 : 1;
    const paddedVersion = nextVersion.toString().padStart(3, "0");
    const kebabName = name.toLowerCase().replace(/\s+/g, "-");
    const filename = `${paddedVersion}-${kebabName}.ts`;
    const template = `// [BUILD:MODULE:ESM] ★★★☆☆ - ES module pattern
import type { Migration } from "./types.js";
import type Database from "better-sqlite3";

export const migration: Migration = {
  id: "${paddedVersion}-${kebabName}",
  version: ${nextVersion},
  name: "${name}",
  
  up: (db: Database.Database) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Synchronous transaction
    db.transaction(() => {
      // TODO: Add forward migration logic
      db.exec(\`
        -- Add your SQL here
      \`);
    })();
  },
  
  down: (db: Database.Database) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Synchronous transaction
    db.transaction(() => {
      // TODO: Add rollback logic
      db.exec(\`
        -- Add your rollback SQL here
      \`);
    })();
  }
};
`;
    const { writeFile } = await import("fs/promises");
    const filePath = join(this.migrationsDir, filename);
    await writeFile(filePath, template, "utf8");
    return filePath;
  }
}

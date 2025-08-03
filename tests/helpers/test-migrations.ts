/**
 * Test helper for creating migration files that work with Jest
 * [FIX:TEST:ESM] ★★★★☆ - Workaround for Jest ES module issues
 */

import { writeFileSync } from "fs";
import { join } from "path";
import type { Migration } from "../../src/migrations/types.js";

export function createTestMigration(
  dir: string,
  filename: string,
  migration: Migration
): void {
  // Write as .mjs to ensure ES module treatment
  const mjsFilename = filename.replace(/\.js$/, ".mjs");
  const content = `
export const migration = ${JSON.stringify({
    ...migration,
    up: undefined,
    down: undefined,
  }, null, 2)};

// Add functions separately to preserve them
migration.up = ${migration.up.toString()};
migration.down = ${migration.down.toString()};
`;

  writeFileSync(join(dir, mjsFilename), content);
}

export function createTestMigrationCJS(
  dir: string, 
  filename: string,
  migration: Migration
): void {
  // Write as CommonJS for Jest compatibility
  const content = `
const migration = {
  id: "${migration.id}",
  version: ${migration.version},
  name: "${migration.name}",
  up: ${migration.up.toString()},
  down: ${migration.down.toString()},
  checksum: "${migration.checksum || ""}"
};

module.exports = { migration };
`;

  writeFileSync(join(dir, filename), content);
}
// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import type Database from "better-sqlite3";

export interface Migration {
  id: string; // e.g., "003-add-trust-scores"
  version: number; // e.g., 3
  name: string; // Human-readable name
  up: (db: Database.Database) => void; // Forward migration
  down: (db: Database.Database) => void; // Rollback migration
  checksum?: string; // Auto-calculated SHA256
  validate?: (db: Database.Database) => boolean; // Optional validation check
}

export interface MigrationVersion {
  version: number;
  id: string;
  name: string;
  checksum: string;
  applied_at: string;
  execution_time_ms?: number;
  rolled_back: boolean;
  rolled_back_at?: string;
}

export interface MigrationStatus {
  pending: Migration[];
  applied: MigrationVersion[];
  total: number;
}

export interface MigrationOptions {
  dryRun?: boolean;
  targetVersion?: number;
  force?: boolean; // Force run even if checksums don't match
}

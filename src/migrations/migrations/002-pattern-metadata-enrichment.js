/**
 * Migration to add pattern metadata enrichment tables
 * Adds auxiliary tables for triggers, vocabulary, and general metadata
 *
 * [FIX:SQLITE:SYNC] ★☆☆☆☆ (1 use, 100% success) - Synchronous transactions required
 */
export const migration = {
  id: "002-pattern-metadata-enrichment",
  version: 2,
  name: "Add pattern metadata enrichment tables (triggers, vocab, metadata)",
  up: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Synchronous transaction
    db.transaction(() => {
      console.log("Starting pattern metadata enrichment migration...");
      // 1. Create pattern_metadata table for general key-value storage
      db.exec(`
        CREATE TABLE IF NOT EXISTS pattern_metadata (
          pattern_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value JSON NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (pattern_id, key),
          FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
        );
      `);
      console.log("Created pattern_metadata table");
      // 2. Create pattern_triggers table for error patterns and scenarios
      db.exec(`
        CREATE TABLE IF NOT EXISTS pattern_triggers (
          pattern_id TEXT NOT NULL,
          trigger_type TEXT NOT NULL CHECK (trigger_type IN ('error', 'keyword', 'scenario', 'file_glob')),
          trigger_value TEXT NOT NULL,
          regex INTEGER NOT NULL DEFAULT 0, -- 0=literal, 1=regex (RE2-compatible only)
          priority INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (pattern_id, trigger_type, trigger_value),
          FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
        );
      `);
      console.log("Created pattern_triggers table");
      // 3. Create pattern_vocab table for semantic matching
      db.exec(`
        CREATE TABLE IF NOT EXISTS pattern_vocab (
          pattern_id TEXT NOT NULL,
          term TEXT NOT NULL,
          term_type TEXT NOT NULL CHECK (term_type IN ('verb', 'noun', 'tech', 'concept')),
          weight REAL NOT NULL DEFAULT 1.0,
          PRIMARY KEY (pattern_id, term),
          FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
        );
      `);
      console.log("Created pattern_vocab table");
      // 4. Create indexes for performance
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pattern_triggers_type ON pattern_triggers(trigger_type);
        CREATE INDEX IF NOT EXISTS idx_pattern_triggers_value ON pattern_triggers(trigger_value);
        CREATE INDEX IF NOT EXISTS idx_pattern_vocab_term ON pattern_vocab(term);
        CREATE INDEX IF NOT EXISTS idx_pattern_metadata_key ON pattern_metadata(key);
      `);
      console.log("Created indexes for pattern metadata tables");
      // 5. Migrate existing x_meta data if present (from JSON patterns)
      // Note: Currently x_meta exists in Zod schema but not in database
      // This prepares for future population from pattern JSON data
      console.log(
        "Pattern metadata enrichment migration completed successfully",
      );
    })();
  },
  down: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Synchronous transaction
    db.transaction(() => {
      console.log("Rolling back pattern metadata enrichment migration...");
      // Drop tables in reverse order to avoid foreign key constraints
      db.exec(`
        DROP INDEX IF EXISTS idx_pattern_metadata_key;
        DROP INDEX IF EXISTS idx_pattern_vocab_term;
        DROP INDEX IF EXISTS idx_pattern_triggers_value;
        DROP INDEX IF EXISTS idx_pattern_triggers_type;
        
        DROP TABLE IF EXISTS pattern_vocab;
        DROP TABLE IF EXISTS pattern_triggers;
        DROP TABLE IF EXISTS pattern_metadata;
      `);
      console.log("Rollback completed successfully");
    })();
  },
};

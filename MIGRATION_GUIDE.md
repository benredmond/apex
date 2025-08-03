# APEX Migration Guide

This guide covers both database migrations and API migrations for the APEX pattern management system.

## Repository API Migration (v0.5.0)

### Overview

As of v0.5.0, the PatternRepository API has been standardized to follow common repository patterns:
- `list()` - Simple enumeration with filtering and pagination
- `search()` - Semantic search with facets (replaces `lookup()`)
- `lookup()` - **DEPRECATED** - Will be removed in v2.0

### Quick Migration Reference

| Old Method | New Method | Use Case |
|------------|------------|----------|
| `lookup({ k: 100 })` | `list({ limit: 100 })` | Simple listing |
| `lookup({ type: ['FIX'] })` | `list({ filter: { type: ['FAILURE'] } })` | Filtered listing |
| `lookup({ task: "...", languages: [...] })` | `search({ task: "...", languages: [...] })` | Semantic search |

### Migration Examples

#### Simple Listing
```typescript
// Before
const result = await repository.lookup({ k: 100 });
const patterns = result.patterns;

// After
const patterns = await repository.list({ limit: 100 });
```

#### Filtered Listing
```typescript
// Before
const result = await repository.lookup({ type: ['FIX'], k: 50 });
const fixes = result.patterns;

// After
const fixes = await repository.list({
  filter: { type: ['FAILURE'] }, // Note: 'FIX' maps to 'FAILURE' type
  limit: 50
});
```

#### Semantic Search
```typescript
// Before & After (same interface, different method)
const result = await repository.lookup({ /* -> */ search({
  task: "implement authentication",
  languages: ['typescript'],
  frameworks: ['express'],
  k: 20
});
```

### API Reference

#### list(options?: ListOptions)
Returns a flat array of patterns with simple filtering:
```typescript
interface ListOptions {
  limit?: number;              // Default: 50
  offset?: number;             // Default: 0
  orderBy?: 'trust_score' | 'usage_count' | 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';      // Default: 'desc'
  filter?: {
    type?: Pattern['type'][];  // Filter by pattern types
    minTrust?: number;         // Minimum trust score (0-1)
    tags?: string[];           // Filter by tags
    valid?: boolean;           // Filter valid/invalid patterns
  };
}
```

#### search(query: SearchQuery)
Performs semantic search with facets (same as old `lookup()`):
```typescript
interface SearchQuery {
  task?: string;               // Natural language task description
  signals?: Record<string, any>;
  k?: number;                  // Number of results
  type?: Pattern['type'][];
  languages?: string[];
  frameworks?: string[];
  tags?: string[];
  paths?: string[];
  task_types?: string[];
  envs?: string[];
}
```

### Deprecation Timeline
- **v0.5.0** - New methods added, `lookup()` marked as deprecated
- **v1.0.0** - Deprecation warnings become more prominent  
- **v2.0.0** - `lookup()` method removed entirely

---

# APEX Database Migration Guide

This guide explains how to create and manage database migrations for the APEX pattern management system.

## Overview

APEX uses a file-based migration system with automatic version tracking, rollback support, and validation capabilities. All migrations are written in TypeScript/JavaScript and use synchronous SQLite transactions.

## Creating a Migration

### 1. Generate a New Migration File

```bash
apex migrate create "description of changes"
```

This creates a new migration file in `src/migrations/` with the format:
- `XXX-description-of-changes.ts` where XXX is the version number (e.g., 003, 004)

### 2. Migration File Structure

Each migration must export a `Migration` object:

```typescript
// [BUILD:MODULE:ESM] - ES module pattern
import type { Migration } from "./types.js";
import type Database from "better-sqlite3";

export const migration: Migration = {
  id: "003-add-trust-scores",
  version: 3,
  name: "Add trust score tracking",
  
  up: (db: Database.Database) => {
    // [PAT:dA0w9N1I9-4m] - Synchronous transaction
    db.transaction(() => {
      // Forward migration logic
      db.exec(`
        ALTER TABLE patterns 
        ADD COLUMN alpha REAL DEFAULT 1.0;
        
        ALTER TABLE patterns 
        ADD COLUMN beta REAL DEFAULT 1.0;
      `);
    })();
  },
  
  down: (db: Database.Database) => {
    db.transaction(() => {
      // Rollback logic - must reverse the up() changes
      db.exec(`
        ALTER TABLE patterns DROP COLUMN alpha;
        ALTER TABLE patterns DROP COLUMN beta;
      `);
    })();
  }
};
```

## Important Rules

### 1. **Synchronous Only** (No async/await)
SQLite transactions in better-sqlite3 are synchronous. Never use async/await:

```typescript
// ❌ WRONG - Will fail
up: async (db) => {
  await someAsyncOperation(); // This will break
}

// ✅ CORRECT - Synchronous only
up: (db) => {
  db.transaction(() => {
    // All operations are synchronous
  })();
}
```

### 2. **Use Transactions**
Always wrap multiple operations in a transaction for atomicity:

```typescript
up: (db) => {
  // [PAT:dA0w9N1I9-4m] - Atomic transaction
  db.transaction(() => {
    db.exec(`CREATE TABLE ...`);
    db.exec(`INSERT INTO ...`);
    db.exec(`CREATE INDEX ...`);
  })(); // Execute immediately
}
```

### 3. **Reversible Migrations**
Every `up()` must have a corresponding `down()` that completely reverses the changes:

```typescript
up: (db) => {
  db.transaction(() => {
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)`);
  })();
},

down: (db) => {
  db.transaction(() => {
    db.exec(`DROP TABLE users`);
  })();
}
```

### 4. **Sequential Versioning**
Migration versions must be sequential (1, 2, 3, ...). The system will reject non-sequential versions.

## Migration Commands

### Check Status
```bash
apex migrate status
```
Shows applied and pending migrations.

### Run Migrations
```bash
apex migrate up                  # Run all pending migrations
apex migrate up --target 5       # Migrate up to version 5
apex migrate up --dry-run        # Preview what would run
apex migrate up --force          # Ignore checksum mismatches
```

### Rollback Migrations
```bash
apex migrate down 1              # Rollback 1 migration
apex migrate down 3 --dry-run    # Preview rollback of 3 migrations
```

### Validate Migrations
```bash
apex migrate validate
```
Runs comprehensive validation including:
- Syntax checking
- up/down reversibility testing
- Sequential version validation
- Common issue detection

## Common Patterns

### Adding Columns
```typescript
up: (db) => {
  db.transaction(() => {
    db.exec(`
      ALTER TABLE patterns 
      ADD COLUMN new_field TEXT DEFAULT 'default_value';
    `);
  })();
},
down: (db) => {
  db.transaction(() => {
    db.exec(`ALTER TABLE patterns DROP COLUMN new_field;`);
  })();
}
```

### Creating Tables
```typescript
up: (db) => {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE pattern_metrics (
        pattern_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (pattern_id, metric_name, recorded_at),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id)
      );
      
      CREATE INDEX idx_metrics_pattern ON pattern_metrics(pattern_id);
    `);
  })();
},
down: (db) => {
  db.transaction(() => {
    db.exec(`DROP TABLE pattern_metrics;`);
  })();
}
```

### Data Migrations
```typescript
up: (db) => {
  db.transaction(() => {
    // Add new column
    db.exec(`ALTER TABLE patterns ADD COLUMN trust_category TEXT;`);
    
    // Migrate data
    db.prepare(`
      UPDATE patterns 
      SET trust_category = CASE
        WHEN trust_score >= 0.8 THEN 'high'
        WHEN trust_score >= 0.5 THEN 'medium'
        ELSE 'low'
      END
    `).run();
  })();
}
```

## Best Practices

1. **Test Migrations**: Always run `apex migrate validate` before committing
2. **Small, Focused Changes**: Each migration should do one thing
3. **Document Complex Logic**: Add comments explaining non-obvious changes
4. **Preserve Data**: Be careful with destructive operations in `down()`
5. **Version Control**: Commit migration files immediately after creation

## Troubleshooting

### Checksum Mismatch
If you see "Checksum mismatch" errors, it means a migration file was modified after being applied. Use `--force` to ignore, but investigate why it changed.

### Failed Migration
Migrations use savepoints, so failures automatically rollback. Fix the issue and run again.

### Non-Sequential Versions
Ensure migration files are numbered sequentially. Rename files if needed before running.

## Migration Safety

The migration system includes several safety features:

1. **Savepoints**: Each migration runs in a savepoint for automatic rollback on error
2. **Checksums**: Detects if migrations were modified after application
3. **Validation**: Comprehensive testing before execution
4. **Dry Run**: Preview changes without applying them
5. **Version Tracking**: Prevents running migrations out of order

## Example: Complete Migration

Here's a complete example adding pattern usage tracking:

```typescript
import type { Migration } from "./types.js";
import type Database from "better-sqlite3";

export const migration: Migration = {
  id: "004-add-usage-tracking",
  version: 4,
  name: "Add pattern usage tracking",
  
  up: (db: Database.Database) => {
    db.transaction(() => {
      // Create usage tracking table
      db.exec(`
        CREATE TABLE pattern_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pattern_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          used_at TEXT NOT NULL,
          success INTEGER NOT NULL DEFAULT 1,
          execution_time_ms INTEGER,
          error_message TEXT,
          FOREIGN KEY (pattern_id) REFERENCES patterns(id)
        );
      `);
      
      // Add indices for performance
      db.exec(`
        CREATE INDEX idx_usage_pattern ON pattern_usage(pattern_id);
        CREATE INDEX idx_usage_task ON pattern_usage(task_id);
        CREATE INDEX idx_usage_date ON pattern_usage(used_at);
      `);
      
      // Update patterns table
      db.exec(`
        ALTER TABLE patterns ADD COLUMN usage_count INTEGER DEFAULT 0;
        ALTER TABLE patterns ADD COLUMN success_count INTEGER DEFAULT 0;
      `);
    })();
  },
  
  down: (db: Database.Database) => {
    db.transaction(() => {
      // Remove in reverse order
      db.exec(`ALTER TABLE patterns DROP COLUMN usage_count;`);
      db.exec(`ALTER TABLE patterns DROP COLUMN success_count;`);
      db.exec(`DROP TABLE pattern_usage;`);
    })();
  }
};
```

## Migration Development Workflow

1. Create migration: `apex migrate create "your description"`
2. Edit the generated file in `src/migrations/`
3. Validate: `apex migrate validate`
4. Test with dry run: `apex migrate up --dry-run`
5. Apply: `apex migrate up`
6. Verify: `apex migrate status`
7. Commit the migration file
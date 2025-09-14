// [PAT:MANAGER:ABSTRACTION] ★★★★☆ (15 uses, 93% success) - From cache
// FTSManager: Centralized Full-Text Search operations management
// Eliminates duplication and ensures transaction atomicity for FTS operations

import { PatternDatabase } from "./database.js";
import { DatabaseAdapter } from "./database-adapter.js";
import { escapeIdentifier } from "./database-utils.js";

export interface FTSOperationContext {
  tableName: string;
  ftsTableName: string;
  rowid: number | bigint;
  id: string;
  searchableFields: Record<string, any>;
}

/**
 * Manages Full-Text Search operations with adapter-specific strategies
 * Applies PAT:MANAGER:ABSTRACTION to eliminate 120+ lines of duplication
 */
export class FTSManager {
  private readonly adapter: DatabaseAdapter;

  constructor(private readonly db: PatternDatabase) {
    this.adapter = db.database;
  }

  /**
   * Synchronize FTS index for a pattern operation
   * Uses adapter capabilities to determine strategy
   */
  public syncFTS(
    context: FTSOperationContext,
    operation: "insert" | "update" | "delete",
  ): void {
    // [PAT:ADAPTER:DELEGATION] ★★★★★ (5 uses, 100% success) - From cache
    // Check adapter FTS capability
    const supportsTriggers = this.adapter.supportsFTSTriggers?.() ?? true;

    if (supportsTriggers) {
      // For better-sqlite3 and other adapters with working triggers
      // No manual FTS sync needed - triggers handle it automatically
      return;
    }

    // For node:sqlite - manual FTS handling required
    this.manualFTSSync(context, operation);
  }

  /**
   * Manual FTS synchronization for adapters without trigger support
   * Implements FIX:ADAPTER:STATEMENT_FRESH for node:sqlite compatibility
   */
  private manualFTSSync(
    context: FTSOperationContext,
    operation: "insert" | "update" | "delete",
  ): void {
    const { ftsTableName, rowid, searchableFields } = context;
    const escapedFTSTable = escapeIdentifier(ftsTableName);

    try {
      // [PAT:TRANSACTION:SAVEPOINT] ★★★★☆ (8 uses, 95% success) - From cache
      // Use savepoint for atomic FTS operations within transactions
      this.adapter.exec("SAVEPOINT fts_operation");

      try {
        if (operation === "delete") {
          // Delete from FTS index
          this.adapter
            .prepare(`DELETE FROM ${escapedFTSTable} WHERE rowid = ?`)
            .run(rowid);
        } else if (operation === "update") {
          // Update requires delete + insert for FTS
          this.adapter
            .prepare(`DELETE FROM ${escapedFTSTable} WHERE rowid = ?`)
            .run(rowid);
          // Now perform the insert
          this.performFTSInsert(escapedFTSTable, rowid, searchableFields);
        } else if (operation === "insert") {
          this.performFTSInsert(escapedFTSTable, rowid, searchableFields);
        }

        // Release savepoint on success
        this.adapter.exec("RELEASE SAVEPOINT fts_operation");
      } catch (error) {
        // Rollback to savepoint on failure
        this.adapter.exec("ROLLBACK TO SAVEPOINT fts_operation");
        throw error;
      }
    } catch (error) {
      // Log but don't fail the main operation if FTS sync fails
      console.warn(
        `Warning: FTS sync failed for ${operation} on ${context.tableName}:`,
        error.message,
      );
    }
  }

  /**
   * Perform FTS insert operation
   * Extracted to avoid switch statement complexity
   */
  private performFTSInsert(
    escapedFTSTable: string,
    rowid: number | bigint,
    searchableFields: Record<string, any>,
  ): void {
    // Build column list and values for FTS insert
    const columns = ["rowid", ...Object.keys(searchableFields)];
    const placeholders = columns.map(() => "?").join(", ");
    const values = [rowid, ...Object.values(searchableFields)];

    // [FIX:ADAPTER:STATEMENT_FRESH] ★★★★☆ (2 uses, 100% success) - From cache
    // Fresh statement creation for node:sqlite compatibility
    const insertSQL = `INSERT INTO ${escapedFTSTable}(${columns.map(c => escapeIdentifier(c)).join(", ")}) VALUES (${placeholders})`;

    this.adapter.prepare(insertSQL).run(...values);
  }

  /**
   * Handle FTS operations for upsert (insert or update)
   * Determines operation type and delegates appropriately
   */
  public handleUpsert(
    tableName: string,
    id: string,
    isUpdate: boolean,
    rowid: number | bigint,
    searchableFields: Record<string, any>,
  ): void {
    const context: FTSOperationContext = {
      tableName,
      ftsTableName: `${tableName}_fts`,
      rowid,
      id,
      searchableFields,
    };

    this.syncFTS(context, isUpdate ? "update" : "insert");
  }

  /**
   * Handle FTS operations for delete
   */
  public handleDelete(
    tableName: string,
    id: string,
    rowid: number | bigint,
  ): void {
    const context: FTSOperationContext = {
      tableName,
      ftsTableName: `${tableName}_fts`,
      rowid,
      id,
      searchableFields: {}, // Not needed for delete
    };

    this.syncFTS(context, "delete");
  }

  /**
   * Temporarily disable FTS triggers (for migration/bulk operations)
   * Returns a function to re-enable them
   */
  public disableTriggers(tableName: string): () => void {
    const triggers = [
      `${tableName}_ai`, // After Insert
      `${tableName}_au`, // After Update
      `${tableName}_ad`, // After Delete
    ];

    // Drop triggers
    for (const trigger of triggers) {
      try {
        this.adapter.exec(
          `DROP TRIGGER IF EXISTS ${escapeIdentifier(trigger)}`,
        );
      } catch (error) {
        console.warn(`Could not drop trigger ${trigger}:`, error.message);
      }
    }

    // Return function to recreate triggers
    return () => {
      // Only recreate if adapter supports triggers
      if (this.adapter.supportsFTSTriggers?.() ?? true) {
        this.recreateTriggers(tableName);
      }
    };
  }

  /**
   * Recreate FTS triggers after bulk operations
   * Only for adapters that support triggers
   */
  private recreateTriggers(tableName: string): void {
    const escapedTable = escapeIdentifier(tableName);
    const escapedFTSTable = escapeIdentifier(`${tableName}_fts`);

    // These trigger definitions match migration 018-fix-fts-trigger-schema.ts
    const triggerSQL = `
      -- After Insert Trigger
      CREATE TRIGGER IF NOT EXISTS ${escapeIdentifier(tableName + "_ai")}
      AFTER INSERT ON ${escapedTable}
      BEGIN
        INSERT INTO ${escapedFTSTable}(rowid, id, title, summary, tags, keywords, search_index)
        VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
      END;

      -- After Update Trigger
      CREATE TRIGGER IF NOT EXISTS ${escapeIdentifier(tableName + "_au")}
      AFTER UPDATE OF title, summary, tags, keywords, search_index ON ${escapedTable}
      BEGIN
        DELETE FROM ${escapedFTSTable} WHERE rowid = old.rowid;
        INSERT INTO ${escapedFTSTable}(rowid, id, title, summary, tags, keywords, search_index)
        VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
      END;

      -- After Delete Trigger
      CREATE TRIGGER IF NOT EXISTS ${escapeIdentifier(tableName + "_ad")}
      AFTER DELETE ON ${escapedTable}
      BEGIN
        DELETE FROM ${escapedFTSTable} WHERE rowid = old.rowid;
      END;
    `;

    try {
      this.adapter.exec(triggerSQL);
    } catch (error) {
      console.warn(
        `Could not recreate FTS triggers for ${tableName}:`,
        error.message,
      );
    }
  }
}

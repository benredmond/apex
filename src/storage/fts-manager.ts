// [PAT:MANAGER:ABSTRACTION] ★★★★☆ (15 uses, 93% success) - From cache
// FTSManager: Centralized Full-Text Search operations management
// Eliminates duplication and ensures transaction atomicity for FTS operations

import { PatternDatabase } from "./database.js";
import { DatabaseAdapter } from "./database-adapter.js";
import { escapeIdentifier } from "./database-utils.js";
import { generateCombinedFTSTriggerSQL } from "./schema-constants.js";

export interface FTSOperationContext {
  tableName: string;
  ftsTableName: string;
  rowid: number | bigint;
  id: string;
  searchableFields: Record<string, any>;
}

export interface FTSMetrics {
  totalOperations: number;
  manualSyncCount: number;
  triggerSyncCount: number;
  avgSyncDuration: number;
  maxSyncDuration: number;
  failureCount: number;
  lastReset: Date;
}

export interface FTSOperationMetrics {
  operation: "insert" | "update" | "delete";
  tableName: string;
  duration: number;
  syncType: "trigger" | "manual";
  success: boolean;
  timestamp: Date;
}

/**
 * Manages Full-Text Search operations with adapter-specific strategies
 * Applies PAT:MANAGER:ABSTRACTION to eliminate 120+ lines of duplication
 * Includes operation metrics for performance monitoring
 */
export class FTSManager {
  private readonly adapter: DatabaseAdapter;
  private metrics: FTSMetrics;
  private recentOperations: FTSOperationMetrics[] = [];
  private static readonly MAX_RECENT_OPERATIONS = 100;
  private static readonly SLOW_OPERATION_THRESHOLD_MS = 50;

  constructor(private readonly db: PatternDatabase) {
    this.adapter = db.database;
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): FTSMetrics {
    return {
      totalOperations: 0,
      manualSyncCount: 0,
      triggerSyncCount: 0,
      avgSyncDuration: 0,
      maxSyncDuration: 0,
      failureCount: 0,
      lastReset: new Date(),
    };
  }

  /**
   * Synchronize FTS index for a pattern operation
   * Uses adapter capabilities to determine strategy
   * Tracks metrics for performance monitoring
   */
  public syncFTS(
    context: FTSOperationContext,
    operation: "insert" | "update" | "delete",
  ): void {
    const startTime = Date.now();
    const supportsTriggers = this.adapter.supportsFTSTriggers?.() ?? true;
    let success = true;

    try {
      if (supportsTriggers) {
        // For better-sqlite3 and other adapters with working triggers
        // No manual FTS sync needed - triggers handle it automatically
        this.recordOperation(operation, context.tableName, 0, "trigger", true);
        return;
      }

      // For node:sqlite - manual FTS handling required
      this.manualFTSSync(context, operation);

      const duration = Date.now() - startTime;
      this.recordOperation(
        operation,
        context.tableName,
        duration,
        "manual",
        true,
      );

      // Log slow operations
      if (duration > FTSManager.SLOW_OPERATION_THRESHOLD_MS) {
        if (process.env.APEX_DEBUG) {
          console.log(
            `[FTS] Slow operation detected: ${operation} on ${context.tableName} took ${duration}ms`,
          );
        }
      }
    } catch (error) {
      success = false;
      const duration = Date.now() - startTime;
      this.recordOperation(
        operation,
        context.tableName,
        duration,
        supportsTriggers ? "trigger" : "manual",
        false,
      );
      throw error;
    }
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
    const insertSQL = `INSERT INTO ${escapedFTSTable}(${columns.map((c) => escapeIdentifier(c)).join(", ")}) VALUES (${placeholders})`;

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
    // Use centralized trigger definitions from schema-constants.ts
    const triggerSQL = generateCombinedFTSTriggerSQL(tableName);

    try {
      this.adapter.exec(triggerSQL);
    } catch (error) {
      console.warn(
        `Could not recreate FTS triggers for ${tableName}:`,
        error.message,
      );
    }
  }

  /**
   * Record an operation for metrics tracking
   */
  private recordOperation(
    operation: "insert" | "update" | "delete",
    tableName: string,
    duration: number,
    syncType: "trigger" | "manual",
    success: boolean,
  ): void {
    // Update metrics
    this.metrics.totalOperations++;
    if (syncType === "manual") {
      this.metrics.manualSyncCount++;
    } else {
      this.metrics.triggerSyncCount++;
    }

    if (!success) {
      this.metrics.failureCount++;
    }

    // Update duration metrics
    if (duration > 0) {
      this.metrics.avgSyncDuration =
        (this.metrics.avgSyncDuration * (this.metrics.totalOperations - 1) +
          duration) /
        this.metrics.totalOperations;
      this.metrics.maxSyncDuration = Math.max(
        this.metrics.maxSyncDuration,
        duration,
      );
    }

    // Add to recent operations
    const operationMetrics: FTSOperationMetrics = {
      operation,
      tableName,
      duration,
      syncType,
      success,
      timestamp: new Date(),
    };

    this.recentOperations.push(operationMetrics);

    // Keep only the most recent operations
    if (this.recentOperations.length > FTSManager.MAX_RECENT_OPERATIONS) {
      this.recentOperations.shift();
    }
  }

  /**
   * Get current metrics
   */
  public getMetrics(): FTSMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent operations for debugging
   */
  public getRecentOperations(): FTSOperationMetrics[] {
    return [...this.recentOperations];
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = this.initializeMetrics();
    this.recentOperations = [];
  }

  /**
   * Get metrics summary for logging
   */
  public getMetricsSummary(): string {
    const {
      totalOperations,
      manualSyncCount,
      triggerSyncCount,
      avgSyncDuration,
      maxSyncDuration,
      failureCount,
    } = this.metrics;
    const successRate =
      totalOperations > 0
        ? (((totalOperations - failureCount) / totalOperations) * 100).toFixed(
            2,
          )
        : "N/A";
    const manualPercentage =
      totalOperations > 0
        ? ((manualSyncCount / totalOperations) * 100).toFixed(2)
        : "N/A";

    return (
      `FTS Metrics: Total=${totalOperations}, Manual=${manualSyncCount} (${manualPercentage}%), ` +
      `Trigger=${triggerSyncCount}, Avg=${avgSyncDuration.toFixed(2)}ms, Max=${maxSyncDuration}ms, ` +
      `Success=${successRate}%`
    );
  }
}

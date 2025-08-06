/**
 * Storage operations for reflection system
 * Handles database persistence and queries
 */

import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import {
  ReflectionRecord,
  PatternDraft,
  AuditEvent,
  ReflectRequest,
  NewPattern,
  AntiPattern,
} from "./types.js";

export class ReflectionStorage {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    // [PAT:DI:CONSTRUCTOR] ★★★★★ (156 uses, 98% success) - Database injected via constructor
    // [FIX:DB:SHARED_CONNECTION] ★★★★★ (23 uses, 100% success) - Shared connection prevents locking

    this.initializeTables();
  }

  /**
   * Initialize database tables
   */
  private initializeTables(): void {
    // Reflections table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reflections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        brief_id TEXT,
        outcome TEXT CHECK(outcome IN ('success','partial','failure')) NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(task_id, brief_id)
      );
      CREATE INDEX IF NOT EXISTS idx_reflections_task ON reflections(task_id);
      CREATE INDEX IF NOT EXISTS idx_reflections_created ON reflections(created_at);
    `);

    // Pattern drafts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_drafts (
        draft_id TEXT PRIMARY KEY,
        kind TEXT CHECK(kind IN ('NEW_PATTERN','ANTI_PATTERN')) NOT NULL,
        json TEXT NOT NULL,
        status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','REJECTED')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_drafts_kind ON pattern_drafts(kind);
      CREATE INDEX IF NOT EXISTS idx_drafts_status ON pattern_drafts(status);
    `);

    // Audit events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        pattern_id TEXT,
        evidence_digest TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audit_task ON audit_events(task_id);
      CREATE INDEX IF NOT EXISTS idx_audit_pattern ON audit_events(pattern_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
    `);
  }

  /**
   * Store a reflection record
   */
  storeReflection(request: ReflectRequest): {
    id: number;
    existed: boolean;
  } {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO reflections (task_id, brief_id, outcome, json)
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(
      request.task.id,
      request.brief_id || null,
      request.outcome,
      JSON.stringify(request),
    );

    // Check if insert was ignored (already existed)
    const existed = info.changes === 0;

    if (existed) {
      // Get existing ID
      const existing = this.db
        .prepare(
          "SELECT id FROM reflections WHERE task_id = ? AND brief_id = ?",
        )
        .get(request.task.id, request.brief_id || null) as { id: number };

      return { id: existing.id, existed: true };
    }

    return { id: info.lastInsertRowid as number, existed: false };
  }

  /**
   * Store a pattern draft
   */
  storePatternDraft(
    pattern: NewPattern | AntiPattern,
    kind: "NEW_PATTERN" | "ANTI_PATTERN",
  ): string {
    const draftId = `draft:${kind === "NEW_PATTERN" ? "PAT" : "ANTI"}:${nanoid(12)}`;

    const stmt = this.db.prepare(`
      INSERT INTO pattern_drafts (draft_id, kind, json)
      VALUES (?, ?, ?)
    `);

    stmt.run(draftId, kind, JSON.stringify(pattern));

    return draftId;
  }

  /**
   * Store audit events
   */
  storeAuditEvent(event: Omit<AuditEvent, "id" | "created_at">): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_events (task_id, kind, pattern_id, evidence_digest)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      event.task_id,
      event.kind,
      event.pattern_id || null,
      event.evidence_digest || null,
    );
  }

  /**
   * Get reflection by task ID
   */
  getReflection(taskId: string, briefId?: string): ReflectionRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM reflections 
      WHERE task_id = ? AND brief_id = ?
    `);

    const row = stmt.get(taskId, briefId || null) as
      | ReflectionRecord
      | undefined;
    return row || null;
  }

  /**
   * Get anti-pattern candidates (patterns that appear in multiple failures)
   */
  getAntiPatternCandidates(windowDays: number = 30): Array<{
    title: string;
    count: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);

    const stmt = this.db.prepare(`
      SELECT 
        json_extract(json, '$.title') as title,
        COUNT(*) as count
      FROM pattern_drafts
      WHERE 
        kind = 'ANTI_PATTERN' AND
        created_at >= ? AND
        status = 'DRAFT'
      GROUP BY title
      HAVING count > 1
      ORDER BY count DESC
    `);

    return stmt.all(cutoffDate.toISOString()) as Array<{
      title: string;
      count: number;
    }>;
  }

  /**
   * Update pattern trust scores
   * [FIX:SQLITE:SYNC] - Synchronous pattern trust update for transactions
   */
  updatePatternTrust(
    patternId: string,
    alpha: number,
    beta: number,
    trustScore: number,
  ): void {
    const stmt = this.db.prepare(`
      UPDATE patterns 
      SET alpha = ?, beta = ?, trust_score = ?
      WHERE id = ?
    `);
    stmt.run(alpha, beta, trustScore, patternId);
  }

  /**
   * Update pattern usage statistics (APE-65)
   */
  updatePatternUsageStats(patternId: string, wasSuccessful: boolean): void {
    // Increment usage_count and optionally success_count
    const stmt = this.db.prepare(`
      UPDATE patterns 
      SET 
        usage_count = COALESCE(usage_count, 0) + 1,
        success_count = COALESCE(success_count, 0) + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(wasSuccessful ? 1 : 0, patternId);
  }

  /**
   * Begin a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // Database connection lifecycle managed by parent service
}

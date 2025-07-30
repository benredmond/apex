/**
 * Service to insert patterns directly into the patterns table
 * instead of creating drafts
 */

import crypto from 'crypto';
import { nanoid } from 'nanoid';
import Database from 'better-sqlite3';
import { NewPattern, AntiPattern } from './types.js';
import { Pattern } from '../storage/types.js';

export class PatternInserter {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }
  
  /**
   * Insert a new pattern directly into the patterns table
   * with initial trust score based on Beta(1,1) = 0.5
   */
  insertNewPattern(pattern: NewPattern | AntiPattern, kind: 'NEW_PATTERN' | 'ANTI_PATTERN'): string {
    // Generate pattern ID
    const patternId = ('id' in pattern && pattern.id) || `${kind === 'ANTI_PATTERN' ? 'ANTI' : 'PAT'}:${nanoid(12)}`;
    
    // Determine pattern type
    const type = kind === 'ANTI_PATTERN' ? 'ANTI' : 'CODEBASE';
    
    // Create canonical JSON based on pattern type
    let title: string;
    let summary: string;
    let snippets: any[] = [];
    let evidence: any[] = [];
    
    if ('summary' in pattern) {
      // NewPattern
      title = pattern.title;
      summary = pattern.summary;
      snippets = pattern.snippets || [];
      evidence = pattern.evidence || [];
    } else {
      // AntiPattern - type guard
      const antiPattern = pattern as AntiPattern;
      title = antiPattern.title;
      summary = antiPattern.reason || 'Anti-pattern';
      evidence = antiPattern.evidence || [];
    }
    
    const canonicalData = {
      id: patternId,
      type,
      title,
      summary,
      snippets,
      evidence,
    };
    const jsonCanonical = JSON.stringify(canonicalData, null, 2);
    
    // Create digest
    const digest = crypto
      .createHash('sha256')
      .update(jsonCanonical)
      .digest('hex');
    
    const now = new Date().toISOString();
    
    // Insert into patterns table
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO patterns (
        id, schema_version, pattern_version, type, title, summary,
        trust_score, created_at, updated_at, pattern_digest, json_canonical,
        alpha, beta, invalid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      patternId,
      '1.0.0', // schema version
      '1.0.0', // pattern version
      type,
      title,
      summary,
      0.5, // Initial trust score (Beta(1,1))
      now,
      now,
      digest,
      jsonCanonical,
      1.0, // alpha
      1.0, // beta
      0    // not invalid
    );
    
    // If pattern already existed, return existing ID
    if (info.changes === 0) {
      const existing = this.db.prepare('SELECT id FROM patterns WHERE id = ?').get(patternId) as { id: string };
      return existing.id;
    }
    
    // Insert snippets if provided (only for NewPattern)
    if (snippets.length > 0) {
      const snippetStmt = this.db.prepare(`
        INSERT INTO pattern_snippets (pattern_id, snippet_id, content, language)
        VALUES (?, ?, ?, ?)
      `);
      
      for (const snippet of snippets) {
        snippetStmt.run(
          patternId,
          snippet.snippet_id || nanoid(8),
          snippet.content || '',
          snippet.language || 'unknown'
        );
      }
    }
    
    return patternId as string;
  }
  
  /**
   * Get a pattern by ID
   */
  getPattern(id: string): Pattern | null {
    const row = this.db.prepare(`
      SELECT * FROM patterns WHERE id = ?
    `).get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      schema_version: row.schema_version,
      pattern_version: row.pattern_version,
      type: row.type,
      title: row.title,
      summary: row.summary,
      trust_score: row.trust_score,
      alpha: row.alpha,
      beta: row.beta,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source_repo: row.source_repo,
      tags: row.tags_csv ? row.tags_csv.split(',') : [],
      pattern_digest: row.pattern_digest,
      json_canonical: row.json_canonical,
      invalid: row.invalid === 1,
      invalid_reason: row.invalid_reason,
    };
  }
  
  /**
   * Update pattern trust score
   */
  updateTrustScore(id: string, alpha: number, beta: number, trustScore: number): void {
    const stmt = this.db.prepare(`
      UPDATE patterns 
      SET alpha = ?, beta = ?, trust_score = ?, updated_at = ?
      WHERE id = ?
    `);
    
    stmt.run(alpha, beta, trustScore, new Date().toISOString(), id);
  }
}
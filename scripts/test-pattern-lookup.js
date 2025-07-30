#!/usr/bin/env node

import Database from 'better-sqlite3';
import crypto from 'crypto';

const db = new Database('patterns.db');

// First, check if we have any patterns
const patternCount = db.prepare('SELECT COUNT(*) as count FROM patterns').get();
console.log(`\nTotal patterns in database: ${patternCount.count}`);

// If no patterns, insert some test patterns from the drafts
const drafts = db.prepare("SELECT * FROM pattern_drafts WHERE status = 'DRAFT' LIMIT 5").all();
console.log(`\nFound ${drafts.length} drafts to convert`);

if (drafts.length > 0) {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO patterns (
      id, schema_version, pattern_version, type, title, summary,
      trust_score, created_at, updated_at, pattern_digest, json_canonical,
      alpha, beta, invalid
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const draft of drafts) {
    try {
      const patternData = JSON.parse(draft.json);
      const patternId = draft.draft_id.replace('draft:', '');
      const type = draft.kind === 'ANTI_PATTERN' ? 'ANTI' : 'CODEBASE';
      
      const canonicalData = {
        id: patternId,
        type,
        title: patternData.title,
        summary: patternData.summary,
        snippets: patternData.snippets || [],
        evidence: patternData.evidence || [],
      };
      const jsonCanonical = JSON.stringify(canonicalData, null, 2);
      const digest = crypto.createHash('sha256').update(jsonCanonical).digest('hex');
      const now = new Date().toISOString();
      
      insertStmt.run(
        patternId,
        '1.0.0',
        '1.0.0',
        type,
        patternData.title,
        patternData.summary,
        0.5, // Initial trust score
        now,
        now,
        digest,
        jsonCanonical,
        1.0, // alpha
        1.0, // beta
        0    // not invalid
      );
      
      console.log(`✓ Inserted pattern: ${patternId} - ${patternData.title}`);
    } catch (error) {
      console.error(`✗ Failed to insert draft ${draft.draft_id}:`, error.message);
    }
  }
}

// Now test lookup
console.log('\n--- Testing Pattern Lookup ---');

const patterns = db.prepare(`
  SELECT id, title, trust_score, alpha, beta 
  FROM patterns 
  WHERE invalid = 0 
  ORDER BY trust_score DESC 
  LIMIT 10
`).all();

console.log(`\nTop patterns by trust score:`);
patterns.forEach((p, i) => {
  console.log(`${i + 1}. [${p.id}] ${p.title}`);
  console.log(`   Trust: ${p.trust_score.toFixed(3)} (α=${p.alpha}, β=${p.beta})`);
});

// Test specific pattern lookup
const testQueries = [
  { search: 'sqlite', desc: 'SQLite-related patterns' },
  { search: 'test', desc: 'Testing patterns' },
  { search: 'api', desc: 'API patterns' }
];

for (const { search, desc } of testQueries) {
  console.log(`\n--- Searching for ${desc} ---`);
  
  const results = db.prepare(`
    SELECT id, title, summary 
    FROM patterns 
    WHERE (
      LOWER(id) LIKE ? OR 
      LOWER(title) LIKE ? OR 
      LOWER(summary) LIKE ?
    ) AND invalid = 0
    LIMIT 5
  `).all(`%${search}%`, `%${search}%`, `%${search}%`);
  
  if (results.length === 0) {
    console.log(`No patterns found matching "${search}"`);
  } else {
    results.forEach(r => {
      console.log(`• [${r.id}] ${r.title}`);
      console.log(`  ${r.summary.substring(0, 80)}...`);
    });
  }
}

db.close();
console.log('\n✨ Test complete');
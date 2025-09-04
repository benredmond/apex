#!/usr/bin/env node

// [PAT:ESM:DYNAMIC_IMPORT] ★★★★★ - Dynamic import for optional dependencies
import crypto from 'crypto';

console.log('🔄 Migrating pattern drafts to patterns table...\n');

// [PAT:ADAPTER:DELEGATION] ★★★★☆ - Use DatabaseAdapterFactory for compatibility
let adapter, db;
try {
  const { DatabaseAdapterFactory } = await import('../dist/storage/database-adapter.js');
  adapter = await DatabaseAdapterFactory.create('patterns.db');
  db = adapter.getInstance();
} catch (error) {
  console.error('\n❌ Failed to initialize database adapter:');
  console.error('Make sure to run: npm run build');
  console.error('Error:', error.message);
  process.exit(1);
}
adapter.pragma('journal_mode = WAL');
adapter.pragma('foreign_keys = ON');

try {
  // First, ensure the patterns table has all required columns
  const columns = adapter.pragma('table_info(patterns)').map(col => col.name);
  
  if (!columns.includes('alpha')) {
    console.log('Adding missing columns to patterns table...');
    db.exec('ALTER TABLE patterns ADD COLUMN alpha REAL DEFAULT 1.0');
  }
  if (!columns.includes('beta')) {
    db.exec('ALTER TABLE patterns ADD COLUMN beta REAL DEFAULT 1.0');
  }
  if (!columns.includes('usage_count')) {
    db.exec('ALTER TABLE patterns ADD COLUMN usage_count INTEGER DEFAULT 0');
  }
  if (!columns.includes('success_count')) {
    db.exec('ALTER TABLE patterns ADD COLUMN success_count INTEGER DEFAULT 0');
  }
  if (!columns.includes('status')) {
    db.exec('ALTER TABLE patterns ADD COLUMN status TEXT DEFAULT "active"');
  }

  // Get all drafts that haven't been migrated
  const drafts = db.prepare(`
    SELECT draft_id, kind, json, created_at 
    FROM pattern_drafts 
    WHERE status = 'DRAFT'
    ORDER BY created_at
  `).all();

  console.log(`Found ${drafts.length} pattern drafts to migrate\n`);

  if (drafts.length === 0) {
    console.log('No drafts to migrate. Exiting.');
    adapter.close();
    process.exit(0);
  }

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO patterns (
      id, schema_version, pattern_version, type, title, summary,
      trust_score, created_at, updated_at, pattern_digest, json_canonical,
      alpha, beta, usage_count, success_count, status, invalid
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSnippetStmt = db.prepare(`
    INSERT OR IGNORE INTO pattern_snippets (pattern_id, snippet_id, content, language)
    VALUES (?, ?, ?, ?)
  `);

  const insertLanguageStmt = db.prepare(`
    INSERT OR IGNORE INTO pattern_languages (pattern_id, lang)
    VALUES (?, ?)
  `);

  let successCount = 0;
  let failureCount = 0;

  // Migrate each draft
  const transaction = db.transaction(() => {
    for (const draft of drafts) {
      try {
        const patternData = JSON.parse(draft.json);
        
        // Generate pattern ID
        const patternId = patternData.id || draft.draft_id.replace('draft:', '');
        
        // Determine pattern type
        const type = draft.kind === 'ANTI_PATTERN' ? 'ANTI' : 'CODEBASE';
        
        // Create canonical JSON
        const canonicalData = {
          id: patternId,
          type,
          title: patternData.title,
          summary: patternData.summary,
          snippets: patternData.snippets || [],
          evidence: patternData.evidence || [],
        };
        const jsonCanonical = JSON.stringify(canonicalData, null, 2);
        
        // Create digest
        const digest = crypto
          .createHash('sha256')
          .update(jsonCanonical)
          .digest('hex');
        
        // Initial trust score for new patterns (Beta(1,1) = 0.5)
        const initialTrustScore = 0.5;
        
        // Insert pattern
        const result = insertStmt.run(
          patternId,
          '1.0.0', // schema version
          '1.0.0', // pattern version
          type,
          patternData.title,
          patternData.summary,
          initialTrustScore,
          draft.created_at,
          draft.created_at,
          digest,
          jsonCanonical,
          1.0, // alpha (Beta distribution)
          1.0, // beta (Beta distribution)
          0,   // usage_count
          0,   // success_count
          'active', // status
          0    // not invalid
        );
        
        if (result.changes > 0) {
          console.log(`✅ Migrated: [${patternId}] ${patternData.title}`);
          
          // Insert snippets if available
          if (patternData.snippets && Array.isArray(patternData.snippets)) {
            for (const snippet of patternData.snippets) {
              insertSnippetStmt.run(
                patternId,
                snippet.snippet_id || crypto.randomBytes(4).toString('hex'),
                snippet.content || '',
                snippet.language || 'unknown'
              );
            }
          }
          
          // Extract and insert languages from snippets
          const languages = new Set();
          if (patternData.snippets) {
            patternData.snippets.forEach(s => {
              if (s.language) languages.add(s.language);
            });
          }
          
          for (const lang of languages) {
            insertLanguageStmt.run(patternId, lang);
          }
          
          successCount++;
        } else {
          console.log(`⏭️  Skipped: [${patternId}] ${patternData.title} (already exists)`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to migrate draft ${draft.draft_id}:`, error.message);
        failureCount++;
      }
    }
    
    // Mark all processed drafts as APPROVED
    if (successCount > 0) {
      db.prepare(`
        UPDATE pattern_drafts 
        SET status = 'APPROVED' 
        WHERE status = 'DRAFT'
      `).run();
    }
  });

  // Execute transaction
  transaction();

  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ Successfully migrated: ${successCount} patterns`);
  console.log(`   ❌ Failed: ${failureCount} patterns`);
  
  // Show current pattern stats
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN type = 'CODEBASE' THEN 1 END) as codebase,
      COUNT(CASE WHEN type = 'ANTI' THEN 1 END) as anti,
      AVG(trust_score) as avg_trust
    FROM patterns
    WHERE invalid = 0
  `).get();
  
  console.log('\n📈 Current Pattern Statistics:');
  console.log(`   Total patterns: ${stats.total}`);
  console.log(`   Codebase patterns: ${stats.codebase}`);
  console.log(`   Anti-patterns: ${stats.anti}`);
  console.log(`   Average trust score: ${stats.avg_trust.toFixed(3)}`);
  
  // Show a few examples
  console.log('\n🔍 Sample patterns now available for lookup:');
  const samples = db.prepare(`
    SELECT id, title, trust_score 
    FROM patterns 
    WHERE invalid = 0 
    ORDER BY created_at DESC 
    LIMIT 5
  `).all();
  
  samples.forEach(p => {
    console.log(`   • [${p.id}] ${p.title} (trust: ${p.trust_score.toFixed(3)})`);
  });

} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  adapter.close();
}

console.log('\n✨ Migration complete! Patterns are now available for lookup.');
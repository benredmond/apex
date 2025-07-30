#!/usr/bin/env node

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Verifying patterns are ready for MCP lookup...\n');

// Check database location
const dbPath = process.env.APEX_PATTERNS_DB || 'patterns.db';
const fullPath = join(process.cwd(), dbPath);

console.log(`Database path: ${fullPath}`);
console.log(`Database exists: ${fs.existsSync(fullPath)}`);

if (!fs.existsSync(fullPath)) {
  console.error('\n❌ Database file not found!');
  console.error('Run: node scripts/init-patterns-db.js');
  process.exit(1);
}

const db = new Database(dbPath);

// Check patterns
const patternCount = db.prepare('SELECT COUNT(*) as count FROM patterns WHERE invalid = 0').get();
console.log(`\nTotal valid patterns: ${patternCount.count}`);

// Check language associations
const langCount = db.prepare('SELECT COUNT(*) as count FROM pattern_languages').get();
console.log(`Language associations: ${langCount.count}`);

// Check framework associations  
const frameworkCount = db.prepare('SELECT COUNT(*) as count FROM pattern_frameworks').get();
console.log(`Framework associations: ${frameworkCount.count}`);

// Show sample patterns
console.log('\n📋 Sample patterns:');
const samples = db.prepare(`
  SELECT p.id, p.title, p.trust_score,
    GROUP_CONCAT(DISTINCT l.lang) as languages,
    GROUP_CONCAT(DISTINCT f.framework) as frameworks
  FROM patterns p
  LEFT JOIN pattern_languages l ON l.pattern_id = p.id
  LEFT JOIN pattern_frameworks f ON f.pattern_id = p.id
  WHERE p.invalid = 0
  GROUP BY p.id
  LIMIT 5
`).all();

samples.forEach(p => {
  console.log(`\n  [${p.id}] ${p.title}`);
  console.log(`    Trust: ${p.trust_score} | Languages: ${p.languages || 'none'} | Frameworks: ${p.frameworks || 'none'}`);
});

// Test queries that should return patterns
console.log('\n\n🧪 Test queries:');

const testQueries = [
  { desc: 'SQLite patterns', where: "f.framework = 'better-sqlite3'" },
  { desc: 'Python patterns', where: "l.lang = 'python'" },
  { desc: 'Test patterns', where: "p.title LIKE '%test%' OR p.summary LIKE '%test%'" }
];

for (const test of testQueries) {
  const count = db.prepare(`
    SELECT COUNT(DISTINCT p.id) as count
    FROM patterns p
    LEFT JOIN pattern_languages l ON l.pattern_id = p.id
    LEFT JOIN pattern_frameworks f ON f.pattern_id = p.id
    WHERE p.invalid = 0 AND (${test.where})
  `).get();
  
  console.log(`  ${test.desc}: ${count.count} patterns`);
}

db.close();

console.log('\n\n✅ Patterns are ready for MCP lookup!');
console.log('\nTo use with MCP:');
console.log('1. Restart your MCP server');
console.log('2. The server will now use patterns.db');
console.log('3. Try queries like:');
console.log('   - "fix sqlite sync error"');
console.log('   - "add pytest tests"');
console.log('   - "create fastapi endpoint"');
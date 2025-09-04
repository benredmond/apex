#!/usr/bin/env node

// [PAT:ESM:DYNAMIC_IMPORT] ★★★★★ - Dynamic import for optional dependencies

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

console.log('🔍 Debugging lookup queries...\n');

// Test different query variations
const queries = [
  {
    name: 'All patterns',
    sql: 'SELECT id, title, type FROM patterns WHERE invalid = 0'
  },
  {
    name: 'Patterns with SQLite framework',
    sql: `
      SELECT DISTINCT p.id, p.title, p.type 
      FROM patterns p
      LEFT JOIN pattern_frameworks f ON f.pattern_id = p.id
      WHERE p.invalid = 0 
      AND (f.framework IS NULL OR f.framework = 'better-sqlite3')
    `
  },
  {
    name: 'Patterns with TypeScript language',
    sql: `
      SELECT DISTINCT p.id, p.title, p.type 
      FROM patterns p
      JOIN pattern_languages l ON l.pattern_id = p.id
      WHERE p.invalid = 0 
      AND l.lang = 'typescript'
    `
  },
  {
    name: 'Patterns with multiple facets (TypeScript + better-sqlite3)',
    sql: `
      SELECT DISTINCT p.id, p.title, p.type 
      FROM patterns p
      JOIN pattern_languages l ON l.pattern_id = p.id
      LEFT JOIN pattern_frameworks f ON f.pattern_id = p.id
      WHERE p.invalid = 0 
      AND l.lang IN ('typescript', 'javascript')
      AND (f.framework IS NULL OR f.framework = 'better-sqlite3')
    `
  }
];

for (const query of queries) {
  console.log(`\n📋 ${query.name}:`);
  try {
    const results = db.prepare(query.sql).all();
    console.log(`   Found ${results.length} patterns`);
    results.forEach((r, i) => {
      if (i < 3) { // Show first 3
        console.log(`   - [${r.id}] ${r.title}`);
      }
    });
    if (results.length > 3) {
      console.log(`   ... and ${results.length - 3} more`);
    }
  } catch (error) {
    console.error(`   Error: ${error.message}`);
  }
}

// Test the exact query structure from repository
console.log('\n📋 Testing repository buildLookupQuery structure:');

// Simulate empty facets (what happens when no languages/frameworks detected)
const emptyFacetsQuery = `
  SELECT DISTINCT p.* 
  FROM patterns p 
  WHERE p.invalid = 0 
  ORDER BY p.trust_score DESC
`;

console.log('Query with empty facets:');
const emptyResults = db.prepare(emptyFacetsQuery).all();
console.log(`Found ${emptyResults.length} patterns`);

// Check if languages are being extracted
console.log('\n📋 Pattern language associations:');
const langAssoc = db.prepare(`
  SELECT pattern_id, lang, COUNT(*) as count 
  FROM pattern_languages 
  GROUP BY lang
`).all();
langAssoc.forEach(l => {
  console.log(`   ${l.lang}: ${l.count} patterns`);
});

adapter.close();
console.log('\n✨ Debug complete!');
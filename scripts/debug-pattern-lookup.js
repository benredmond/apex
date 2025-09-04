#!/usr/bin/env node

// [PAT:ESM:DYNAMIC_IMPORT] ★★★★★ - Dynamic import for optional dependencies
import { PatternRepository } from '../dist/storage/repository.js';

console.log('🔍 Debugging Pattern Lookup...\n');

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

// Check patterns table structure
console.log('📊 Checking patterns table structure:');
const columns = adapter.pragma('table_info(patterns)').map(col => col.name);
console.log('Columns:', columns.join(', '));

// Get a sample pattern
const samplePattern = db.prepare('SELECT * FROM patterns LIMIT 1').get();
console.log('\n📋 Sample pattern from database:');
console.log('ID:', samplePattern.id);
console.log('Title:', samplePattern.title);
console.log('Type:', samplePattern.type);
console.log('Tags CSV:', samplePattern.tags_csv);
console.log('Trust Score:', samplePattern.trust_score);

// Initialize repository
const repository = new PatternRepository({ dbPath: 'patterns.db' });
await repository.initialize();

console.log('\n🔍 Testing repository.get():');
try {
  const pattern = await repository.get(samplePattern.id);
  console.log('Retrieved pattern:', pattern);
  console.log('Pattern tags:', pattern.tags);
  console.log('Pattern invalid:', pattern.invalid);
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
}

console.log('\n🔍 Testing repository.lookup():');
try {
  const result = await repository.lookup({ task: 'test', k: 5 });
  console.log('Lookup result:', result);
  console.log('Patterns found:', result.patterns.length);
  if (result.patterns.length > 0) {
    console.log('First pattern:', result.patterns[0]);
  }
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
}

await repository.shutdown();
adapter.close();
console.log('\n✨ Debug complete!');
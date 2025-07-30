#!/usr/bin/env node

import Database from 'better-sqlite3';
import { PatternRepository } from '../dist/storage/repository.js';

console.log('🔍 Debugging Pattern Lookup...\n');

const db = new Database('patterns.db');

// Check patterns table structure
console.log('📊 Checking patterns table structure:');
const columns = db.pragma('table_info(patterns)').map(col => col.name);
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
db.close();
console.log('\n✨ Debug complete!');
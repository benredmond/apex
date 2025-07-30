#!/usr/bin/env node

import { PatternRepository } from '../dist/storage/repository.js';
import { PackBuilder } from '../dist/ranking/pack-builder.js';
import { PatternRanker } from '../dist/ranking/index.js';

console.log('🔍 Testing Pack Builder...\n');

// Initialize repository
const repository = new PatternRepository({ dbPath: 'patterns.db' });
await repository.initialize();

// Get some patterns
const lookupResult = await repository.lookup({ task: 'test', k: 5 });
console.log(`Found ${lookupResult.patterns.length} patterns\n`);

// Create ranked patterns (simple scoring for now)
const rankedPatterns = lookupResult.patterns.map((p, i) => ({
  id: p.id,
  score: 1.0 - (i * 0.1), // Simple descending scores
  explain: { reason: 'test' }
}));

console.log('Ranked patterns:');
rankedPatterns.forEach(rp => {
  console.log(`  ${rp.id}: score=${rp.score}`);
});

// Test pack builder
const packBuilder = new PackBuilder(repository);

try {
  console.log('\n📦 Building pattern pack...');
  const result = await packBuilder.buildPatternPack(
    'test sqlite sync error',
    rankedPatterns,
    { budgetBytes: 8192, debug: true }
  );
  
  console.log('\nPack result:');
  console.log('  Candidates:', result.pack.candidates.length);
  console.log('  Bytes used:', result.pack.meta.bytes);
  console.log('  Total ranked:', result.pack.meta.total_ranked);
  console.log('  Included:', result.pack.meta.included);
  
  if (result.pack.candidates.length > 0) {
    console.log('\nFirst candidate:');
    const first = result.pack.candidates[0];
    console.log('  ID:', first.id);
    console.log('  Title:', first.title);
    console.log('  Type:', first.type);
    console.log('  Summary:', first.summary);
  }
  
} catch (error) {
  console.error('Error building pack:', error.message);
  console.error('Stack:', error.stack);
}

await repository.shutdown();
console.log('\n✨ Test complete!');
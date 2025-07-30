#!/usr/bin/env node

import { PatternRepository } from '../dist/storage/repository.js';
import { PatternRanker } from '../dist/ranking/index.js';
import { extractSignals, toRankingSignals } from '../dist/mcp/tools/signal-extractor.js';

console.log('🔍 Testing Pattern Ranking...\n');

// Initialize repository
const repository = new PatternRepository({ dbPath: 'patterns.db' });
await repository.initialize();

// Get patterns
const lookupResult = await repository.lookup({ task: 'test', k: 10 });
console.log(`Found ${lookupResult.patterns.length} patterns in database\n`);

// Extract signals from a test query
const testQuery = {
  task: 'fix sqlite sync error',
  language: 'typescript',
  framework: 'better-sqlite3'
};

console.log('Test query:', testQuery);

const extracted = extractSignals(testQuery);
console.log('\nExtracted signals:', extracted);

const signals = toRankingSignals(extracted);
console.log('\nRanking signals:', signals);

// Create pattern metas for ranking
const patternMetas = lookupResult.patterns.map(p => ({
  id: p.id,
  type: p.type,
  scope: {
    paths: [],
    languages: [],
    frameworks: [],
  },
  trust: {
    score: p.trust_score || 0.5,
    alpha: p.alpha || 1,
    beta: p.beta || 1,
  },
  metadata: {},
}));

console.log('\nPattern metas for ranking:');
patternMetas.forEach(pm => {
  console.log(`  ${pm.id}: trust=${pm.trust.score}`);
});

// Test ranking
try {
  const ranker = new PatternRanker(patternMetas);
  const ranked = await ranker.rank(signals);
  
  console.log('\nRanked patterns:');
  ranked.forEach((rp, i) => {
    console.log(`  ${i + 1}. ${rp.id}: score=${rp.score.toFixed(3)}`);
    if (rp.explain) {
      console.log(`     Reason: ${JSON.stringify(rp.explain)}`);
    }
  });
} catch (error) {
  console.error('Ranking error:', error.message);
  console.error('Stack:', error.stack);
}

await repository.shutdown();
console.log('\n✨ Test complete!');
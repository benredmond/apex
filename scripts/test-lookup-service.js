#!/usr/bin/env node

import { PatternRepository } from '../dist/storage/repository.js';
import { PatternLookupService } from '../dist/mcp/tools/lookup.js';

console.log('🔍 Testing lookup service directly...\n');

const repository = new PatternRepository({ dbPath: 'patterns.db' });
await repository.initialize();

const lookupService = new PatternLookupService(repository);

// Clear cache
lookupService.clearCache();

// Test with minimal request
const request = {
  task: 'fix sqlite sync error',
  max_size: 8192
};

console.log('Request:', request);

try {
  const response = await lookupService.lookup(request);
  
  console.log('\nResponse:');
  console.log('  Cache hit:', response.cache_hit);
  console.log('  Latency:', response.latency_ms, 'ms');
  console.log('  Pattern pack:', JSON.stringify(response.pattern_pack, null, 2));
  
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
}

// Test repository lookup directly
console.log('\n\nTesting repository lookup directly:');
try {
  const result = await repository.lookup({
    task: 'test',
    k: 5
  });
  console.log(`Found ${result.patterns.length} patterns`);
} catch (error) {
  console.error('Repository error:', error.message);
}

await repository.shutdown();
console.log('\n✨ Test complete!');
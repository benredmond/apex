#!/usr/bin/env node

import { initializeTools, getToolsList } from '../dist/mcp/tools/index.js';
import { PatternRepository } from '../dist/storage/repository.js';

console.log('🔍 Debugging MCP server setup...\n');

// Initialize repository
const repository = new PatternRepository({ dbPath: 'patterns.db' });
await repository.initialize();

console.log('Repository initialized');

// Initialize tools
initializeTools(repository);
console.log('Tools initialized');

// Get tools list
const tools = getToolsList();
console.log('\nAvailable tools:');
tools.forEach(tool => {
  console.log(`  - ${tool.name}: ${tool.description}`);
});

// Test apex_patterns_lookup directly
console.log('\n\nTesting apex_patterns_lookup handler...');

try {
  // Import the handler
  const { PatternLookupService } = await import('../dist/mcp/tools/lookup.js');
  const lookupService = new PatternLookupService(repository);
  
  const testRequest = {
    task: 'fix sqlite error',
    max_size: 8192
  };
  
  console.log('Request:', testRequest);
  
  const response = await lookupService.lookup(testRequest);
  
  console.log('\nResponse summary:');
  console.log('  Total patterns found:', response.pattern_pack.candidates.length);
  console.log('  Cache hit:', response.cache_hit);
  console.log('  Latency:', response.latency_ms, 'ms');
  
  if (response.pattern_pack.candidates.length > 0) {
    console.log('\nFirst pattern:');
    const first = response.pattern_pack.candidates[0];
    console.log('  ID:', first.id);
    console.log('  Title:', first.title);
    console.log('  Type:', first.type);
    console.log('  Score:', first.score);
  }
  
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
}

await repository.shutdown();
console.log('\n✨ Debug complete!');
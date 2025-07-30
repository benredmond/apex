#!/usr/bin/env node

import { PatternRepository } from '../dist/storage/repository.js';
import { PatternLookupService } from '../dist/mcp/tools/lookup.js';

console.log('🔍 Testing MCP Pattern Lookup...\n');

// Initialize repository and lookup service
const repository = new PatternRepository({ dbPath: 'patterns.db' });
await repository.initialize();

const lookupService = new PatternLookupService(repository);

// Test queries
const testQueries = [
  {
    task: 'fix sqlite sync error',
    description: 'SQLite synchronization issues'
  },
  {
    task: 'implement user authentication',
    description: 'Authentication patterns'
  },
  {
    task: 'add pytest backend tests',
    description: 'Testing patterns'
  },
  {
    task: 'create FastAPI endpoint',
    description: 'API endpoint patterns'
  },
  {
    task: 'fix async test not awaiting fixture',
    description: 'Async test fixes'
  }
];

for (const query of testQueries) {
  console.log(`\n📋 Query: "${query.task}"`);
  console.log(`   Looking for: ${query.description}`);
  
  try {
    const response = await lookupService.lookup({
      task: query.task,
      max_size: 8192
    });
    
    if (response.pattern_pack.candidates.length === 0) {
      console.log('   ❌ No patterns found');
    } else {
      console.log(`   ✅ Found ${response.pattern_pack.candidates.length} patterns:`);
      
      response.pattern_pack.candidates.forEach((pattern, i) => {
        console.log(`      ${i + 1}. [${pattern.id}] ${pattern.title}`);
        console.log(`         ${pattern.summary}`);
        if (pattern.snippets && pattern.snippets.length > 0) {
          console.log(`         📝 ${pattern.snippets.length} code snippet(s)`);
        }
      });
    }
    
    console.log(`   ⏱️  Latency: ${response.latency_ms}ms (cache: ${response.cache_hit})`);
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
}

// Test with session context
console.log('\n\n📋 Testing with session context...');
const contextQuery = {
  task: 'write more tests',
  session_context: {
    recent_patterns: [
      {
        pattern_id: 'PAT:Go5ehT_h12R-',
        success: true,
        timestamp: new Date().toISOString()
      }
    ],
    failed_patterns: []
  }
};

try {
  const response = await lookupService.lookup(contextQuery);
  console.log(`   Found ${response.pattern_pack.candidates.length} patterns with context`);
} catch (error) {
  console.error(`   Error: ${error.message}`);
}

// Cleanup
await repository.shutdown();
console.log('\n✨ Test complete!');
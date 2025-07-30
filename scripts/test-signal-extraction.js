#!/usr/bin/env node

import { extractSignals } from '../dist/mcp/tools/signal-extractor.js';

console.log('🔍 Testing signal extraction...\n');

const testQueries = [
  'fix sqlite sync error',
  'implement user authentication', 
  'add pytest backend tests',
  'create FastAPI endpoint',
  'fix async test not awaiting fixture'
];

for (const query of testQueries) {
  console.log(`\n📋 Query: "${query}"`);
  
  const request = {
    task: query
  };
  
  const extracted = extractSignals(request);
  
  console.log('Extracted signals:');
  console.log('  Languages:', extracted.languages || []);
  console.log('  Frameworks:', extracted.frameworks || []);
  console.log('  Paths:', extracted.paths || []);
  console.log('  Task Intent:', extracted.taskIntent || 'none');
  console.log('  Error Types:', extracted.errorTypes || []);
}

console.log('\n✨ Test complete!');
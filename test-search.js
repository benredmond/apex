#!/usr/bin/env node

import { PatternRepository } from './dist/storage/repository.js';

const repo = new PatternRepository('./patterns.db');

console.log('Testing search with query "jwt"...');
const result = await repo.search({
  task: 'jwt',
  k: 10
});

console.log('Result:', result);
console.log('Pattern count:', result.patterns.length);

if (result.patterns.length > 0) {
  console.log('\nFirst pattern:');
  console.log('- ID:', result.patterns[0].id);
  console.log('- Title:', result.patterns[0].title);
}

console.log('\nTesting search with query "authentication"...');
const result2 = await repo.search({
  task: 'authentication',
  k: 10
});

console.log('Pattern count:', result2.patterns.length);
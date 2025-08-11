#!/usr/bin/env node

import { PatternRepository } from '../../src/storage/repository.js';
import { TableFormatter } from '../../src/cli/commands/shared/formatters.js';

async function testPatternsList() {
  console.log('Testing patterns list command...\n');
  
  try {
    console.log('1. Initializing repository...');
    const repo = new PatternRepository();
    
    console.log('2. Fetching patterns...');
    const startTime = Date.now();
    const patterns = await repo.list({ limit: 3 });
    const fetchTime = Date.now() - startTime;
    console.log(`   Fetched ${patterns.length} patterns in ${fetchTime}ms`);
    
    console.log('\n3. Formatting patterns...');
    const formatStart = Date.now();
    const formatter = new TableFormatter();
    const output = formatter.format(patterns);
    const formatTime = Date.now() - formatStart;
    console.log(`   Formatted in ${formatTime}ms`);
    
    console.log('\n4. Output:');
    console.log(output);
    
    console.log('\n✅ Test completed successfully');
    console.log(`Total time: ${fetchTime + formatTime}ms`);
    
    // Cleanup
    await repo.shutdown();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testPatternsList();
#!/usr/bin/env node

/**
 * Test script for book extraction pipeline
 * Run with: node test-extraction.js
 */

import { BookExtractor } from './dist/extractors/book-extractor.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testExtraction() {
  console.log('🧪 Testing Book Extraction Pipeline\n');
  
  const config = {
    bookFile: path.join(__dirname, 'test-data/clean-code-sample.txt'),
    bookMetadata: {
      title: 'Clean Code',
      author: 'Robert C. Martin',
      isbn: '978-0132350884'
    },
    chapterRange: {
      start: 2,
      end: 2
    },
    maxPatternsPerChapter: 5,
    dryRun: true // Dry run to test without database
  };
  
  const extractor = new BookExtractor('./patterns.db');
  
  try {
    console.log('📖 Extracting from:', config.bookFile);
    console.log('   Book:', config.bookMetadata.title);
    console.log('   Author:', config.bookMetadata.author);
    console.log('   Mode: Dry run (no database insertion)\n');
    
    const result = await extractor.extractFromBook(config);
    
    console.log('\n✅ Test completed successfully!');
    console.log('Results:');
    console.log(`  - Patterns extracted: ${result.extracted}`);
    console.log(`  - Would insert: ${result.inserted}`);
    console.log(`  - Failed chapters: ${result.failed}`);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    extractor.close();
  }
}

testExtraction().catch(console.error);
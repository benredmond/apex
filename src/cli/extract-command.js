#!/usr/bin/env node

import path from 'path';
import { BookExtractor } from '../extractors/book-extractor.js';

/**
 * CLI command for extracting patterns from books
 * Usage: apex extract-book <book-file> --title "Book Title" --author "Author Name"
 */
export function registerExtractCommand(program) {
  program
    .command('extract-book <file>')
    .description('Extract patterns from a technical book')
    .option('-t, --title <title>', 'Book title', 'Unknown Book')
    .option('-a, --author <author>', 'Book author', 'Unknown Author')
    .option('--isbn <isbn>', 'Book ISBN')
    .option('--start-chapter <number>', 'Start from chapter', parseInt)
    .option('--end-chapter <number>', 'End at chapter', parseInt)
    .option('--max-patterns <number>', 'Max patterns per chapter', parseInt, 10)
    .option('--dry-run', 'Run extraction without database insertion')
    .option('--db <path>', 'Database path', './patterns.db')
    .action(async (file, options) => {
      console.log('📚 APEX Book Pattern Extractor');
      console.log('================================\n');

      // Resolve file path
      const bookFile = path.resolve(file);
      
      // Build extraction config
      const config = {
        bookFile,
        bookMetadata: {
          title: options.title,
          author: options.author,
          isbn: options.isbn
        },
        chapterRange: {
          start: options.startChapter,
          end: options.endChapter
        },
        maxPatternsPerChapter: options.maxPatterns,
        dryRun: options.dryRun || false
      };

      // Create extractor
      const extractor = new BookExtractor(options.db);

      try {
        console.log(`📖 Extracting patterns from: ${path.basename(bookFile)}`);
        console.log(`   Title: ${options.title}`);
        console.log(`   Author: ${options.author}`);
        if (options.isbn) {
          console.log(`   ISBN: ${options.isbn}`);
        }
        console.log('');

        const result = await extractor.extractFromBook(config);

        console.log('\n✅ Extraction Complete!');
        console.log('========================');
        console.log(`📊 Patterns extracted: ${result.extracted}`);
        console.log(`💾 Patterns inserted: ${result.inserted}`);
        console.log(`❌ Failed chapters: ${result.failed}`);

        if (options.dryRun) {
          console.log('\n⚠️  Dry run mode - no patterns were actually inserted');
        }
      } catch (error) {
        console.error('\n❌ Extraction failed:', error.message);
        process.exit(1);
      } finally {
        extractor.close();
      }
    });
}

// If run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  import('commander').then(({ program }) => {
    program
      .name('apex-extract')
      .description('APEX Book Pattern Extractor')
      .version('1.0.0');

    registerExtractCommand(program);
    
    program.parse(process.argv);
  });
}
#!/usr/bin/env node

import { BookExtractor } from "../src/extractors/book-extractor.js";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runBookExtractionPipeline() {
  const dbPath = path.join(process.cwd(), ".apex", "patterns.db");
  const bookPath = "/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf";
  
  console.log("=".repeat(80));
  console.log("BOOK EXTRACTION PIPELINE - DRY RUN (1-2 CHAPTERS)");
  console.log("=".repeat(80));
  console.log("\nConfiguration:");
  console.log(`  Book: Clean Code by Robert C. Martin`);
  console.log(`  PDF Path: ${bookPath}`);
  console.log(`  Database: ${dbPath}`);
  console.log(`  Mode: DRY RUN (no database changes)`);
  console.log(`  Chapters: 1-2 only`);
  console.log("");
  
  const extractor = new BookExtractor(dbPath);
  
  try {
    const config = {
      bookFile: bookPath,
      bookMetadata: {
        title: "Clean Code: A Handbook of Agile Software Craftsmanship",
        author: "Robert C. Martin",
        isbn: "978-0132350884"
      },
      // Process only chapters 1-2 for dry run
      chapterRange: {
        start: 1,
        end: 2
      },
      maxPatternsPerChapter: 5,  // Limit patterns per chapter
      dryRun: true  // DRY RUN MODE - won't insert to database
    };
    
    console.log("Starting extraction pipeline...\n");
    console.log("=".repeat(80));
    
    const result = await extractor.extractFromBook(config);
    
    console.log("\n" + "=".repeat(80));
    console.log("EXTRACTION PIPELINE COMPLETE");
    console.log("=".repeat(80));
    console.log("\n📊 Final Results:");
    console.log(`  ✅ Patterns extracted from text: ${result.extracted}`);
    console.log(`  ✅ Patterns validated: ${result.inserted} (would be inserted if not dry-run)`);
    console.log(`  ❌ Failed chapters: ${result.failed}`);
    
    console.log("\n📝 Pipeline Steps Completed:");
    console.log("  1. PDF parsed successfully");
    console.log("  2. Chapters detected and split");
    console.log("  3. LLM extraction performed");
    console.log("  4. Patterns validated");
    console.log("  5. Dry-run mode - no database changes");
    
    console.log("\n💡 Next Steps:");
    console.log("  - Remove dryRun flag to save patterns to database");
    console.log("  - Increase chapter range to process more content");
    console.log("  - Adjust maxPatternsPerChapter for more/fewer patterns");
    
  } catch (error: any) {
    console.error("\n❌ Pipeline Error:", error.message);
    console.error("\nStack trace:", error.stack);
    
    if (error.message.includes('spawn')) {
      console.log("\n💡 Hint: The LLM extraction may have failed. Check that Claude CLI is accessible.");
    }
  } finally {
    extractor.close();
    console.log("\n✅ Database connection closed");
  }
}

// Run the pipeline
console.log("Initializing Book Extraction Pipeline...\n");
runBookExtractionPipeline().catch(console.error);
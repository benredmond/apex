#!/usr/bin/env node

import { BookExtractor } from "../src/extractors/book-extractor";
import path from "path";

async function extractCleanCodePatterns() {
  const dbPath = path.join(process.cwd(), ".apex", "patterns.db");
  const bookPath = "/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf";
  
  console.log("=".repeat(80));
  console.log("CLEAN CODE PATTERN EXTRACTION - DRY RUN");
  console.log("=".repeat(80));
  
  const extractor = new BookExtractor(dbPath);
  
  try {
    const config = {
      bookFile: bookPath,
      bookMetadata: {
        title: "Clean Code",
        author: "Robert C. Martin",
        isbn: "978-0132350884"
      },
      // Process only first 3 chapters for dry run
      chapterRange: {
        start: 1,
        end: 3
      },
      maxPatternsPerChapter: 10,
      dryRun: true // DRY RUN MODE - won't insert to database
    };
    
    console.log("\nConfiguration:");
    console.log(JSON.stringify(config, null, 2));
    console.log("\n" + "=".repeat(80));
    
    const result = await extractor.extractFromBook(config);
    
    console.log("\n" + "=".repeat(80));
    console.log("EXTRACTION COMPLETE");
    console.log("=".repeat(80));
    console.log(`Total patterns extracted: ${result.extracted}`);
    console.log(`Patterns that would be inserted: ${result.inserted}`);
    console.log(`Failed chapters: ${result.failed}`);
    
  } catch (error: any) {
    console.error("\nERROR during extraction:", error);
    console.error("\nStack trace:", error.stack);
  } finally {
    extractor.close();
  }
}

// Run the extraction
extractCleanCodePatterns().catch(console.error);
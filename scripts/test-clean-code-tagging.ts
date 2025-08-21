#!/usr/bin/env node

import { BookExtractor } from "../dist/extractors/book-extractor.js";
import path from "path";
import { ApexConfig } from "../dist/config/apex-config.js";

async function testCleanCodeTagging() {
  const dbPath = await ApexConfig.getProjectDbPath();
  const bookPath = "/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf";
  
  console.log("=".repeat(80));
  console.log("CLEAN CODE TAGGING TEST - Single Chapter");
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
      // Test with just one chapter
      chapterRange: {
        start: 1,
        end: 1
      },
      maxPatternsPerChapter: 3,
      dryRun: true // DRY RUN - just test tag generation
    };
    
    console.log("\nConfiguration:");
    console.log(JSON.stringify(config, null, 2));
    console.log("\n" + "=".repeat(80));
    
    const result = await extractor.extractFromBook(config);
    
    console.log("\n" + "=".repeat(80));
    console.log("TAG VALIDATION TEST RESULTS");
    console.log("=".repeat(80));
    console.log(`Patterns extracted: ${result.extracted}`);
    console.log("\n✅ Check the console output above for:");
    console.log("   - Pattern IDs starting with 'BOOK:CLEAN_CODE'");
    console.log("   - Tags including 'book-pack:clean-code'");
    console.log("   - Tags with 'clean-code:' prefix");
    
  } catch (error: any) {
    console.error("\n❌ ERROR during test:", error);
    console.error("\nStack trace:", error.stack);
    process.exit(1);
  } finally {
    extractor.close();
  }
}

// Run the test
testCleanCodeTagging().catch(console.error);
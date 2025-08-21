#!/usr/bin/env node

import { BookExtractor } from "../dist/extractors/book-extractor.js";
import path from "path";
import { ApexConfig } from "../dist/config/apex-config.js";

async function extractFullCleanCodeBook() {
  const dbPath = await ApexConfig.getProjectDbPath();
  const bookPath = "/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf";
  
  console.log("=".repeat(80));
  console.log("CLEAN CODE PATTERN EXTRACTION - FULL BOOK");
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
      // Process all 17 chapters
      chapterRange: {
        start: 1,
        end: 17
      },
      maxPatternsPerChapter: 10,
      dryRun: false // PRODUCTION MODE - will insert to database
    };
    
    console.log("\nConfiguration:");
    console.log(JSON.stringify(config, null, 2));
    console.log("\n" + "=".repeat(80));
    
    // Add progress tracking
    const startTime = Date.now();
    console.log(`Starting extraction at ${new Date().toISOString()}`);
    console.log("This will process all 17 chapters and may take 60-90 minutes...\n");
    
    const result = await extractor.extractFromBook(config);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    console.log("\n" + "=".repeat(80));
    console.log("EXTRACTION COMPLETE");
    console.log("=".repeat(80));
    console.log(`Total patterns extracted: ${result.extracted}`);
    console.log(`Patterns inserted to database: ${result.inserted}`);
    console.log(`Failed chapters: ${result.failed}`);
    console.log(`Duration: ${minutes}m ${seconds}s`);
    
    // Verify clean-code tags were applied
    if (result.inserted > 0) {
      console.log("\n✅ Patterns successfully stored with clean-code tags");
      console.log("   Patterns can be queried with tag: 'book-pack:clean-code'");
    }
    
  } catch (error: any) {
    console.error("\n❌ ERROR during extraction:", error);
    console.error("\nStack trace:", error.stack);
    process.exit(1);
  } finally {
    extractor.close();
  }
}

// Run the extraction
extractFullCleanCodeBook().catch(console.error);
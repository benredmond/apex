#!/usr/bin/env node

/**
 * Script to tag existing patterns in the database
 * [APE-63] Multi-Dimensional Pattern Tagging System
 * 
 * FIXED VERSION: Complete solution for FTS5 trigger constraints
 * 
 * This script analyzes existing patterns and adds appropriate tags
 * based on their title, summary, and content.
 * 
 * Solution: 
 * 1. Update tags_csv column (no trigger issues)
 * 2. Temporarily disable FTS trigger using transaction
 * 3. Copy tags_csv to tags column 
 * 4. Rebuild FTS index manually
 */

import Database from "better-sqlite3";

// Database path
const DB_PATH = "./patterns.db";

// Open database
const db = new Database(DB_PATH);

console.log("🏷️  APEX Pattern Tagging Script");
console.log("================================\n");

// Get all patterns
const patterns = db.prepare(`
  SELECT id, title, summary, json_canonical, tags, tags_csv
  FROM patterns
  WHERE invalid = 0
`).all();

console.log(`Found ${patterns.length} patterns to tag`);

// Simple keyword extraction function
function extractKeywords(text) {
  const keywords = new Set();
  
  const patterns = {
    "cache": /\b(cache|caching|cached|redis|memcache|lru)\b/gi,
    "api": /\b(api|endpoint|rest|graphql|http|request|response)\b/gi,
    "auth": /\b(auth|authentication|authorization|jwt|token|login|session)\b/gi,
    "database": /\b(database|db|sql|sqlite|postgres|mysql|mongodb|query)\b/gi,
    "test": /\b(test|testing|tests|jest|pytest|unit|integration|coverage)\b/gi,
    "ui": /\b(ui|frontend|react|vue|angular|component|button|form|modal)\b/gi,
    "performance": /\b(performance|optimization|speed|slow|fast|optimize|perf)\b/gi,
    "error": /\b(error|exception|bug|crash|failure|fix|issue)\b/gi,
    "search": /\b(search|searching|find|lookup|query|match|similarity)\b/gi,
    "migration": /\b(migration|migrate|migrating|upgrade|schema|version)\b/gi,
  };
  
  for (const [keyword, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      keywords.add(keyword);
    }
  }
  
  return Array.from(keywords);
}

// Update statement for tags_csv (safe, no FTS trigger)
const updateTagsCsvStmt = db.prepare(`
  UPDATE patterns SET tags_csv = ? WHERE id = ?
`);

// Process each pattern
let taggedCount = 0;
let skippedCount = 0;
let errors = [];

console.log("Processing patterns...\n");

for (const pattern of patterns) {
  // Skip if already has tags
  if ((pattern.tags && pattern.tags.length > 0) || (pattern.tags_csv && pattern.tags_csv.length > 0)) {
    skippedCount++;
    console.log(`⏭️  Skipping ${pattern.id} (already tagged)`);
    continue;
  }
  
  try {
    // Extract content from pattern
    const combinedText = `${pattern.title} ${pattern.summary}`;
    
    // Parse JSON canonical for more content
    let snippetText = "";
    try {
      const jsonData = JSON.parse(pattern.json_canonical);
      if (jsonData.snippets && Array.isArray(jsonData.snippets)) {
        snippetText = jsonData.snippets
          .map(s => s.code || "")
          .join(" ")
          .substring(0, 500); // Limit snippet text
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
    
    const fullText = `${combinedText} ${snippetText}`.toLowerCase();
    
    // Extract tags using multiple methods
    const tags = new Set();
    
    // 1. Use keyword extraction
    const extractedKeywords = extractKeywords(fullText);
    extractedKeywords.forEach(tag => tags.add(tag));
    
    // 2. Extract from pattern ID (e.g., PAT:AUTH:JWT -> auth, jwt)
    const idParts = pattern.id.toLowerCase().split(":");
    if (idParts.length >= 2) {
      // Skip the first part (PAT/FIX/etc)
      for (let i = 1; i < idParts.length; i++) {
        const part = idParts[i].replace(/[_-]/g, " ").trim();
        if (part && part !== "default" && part.length > 1) {
          tags.add(part);
        }
      }
    }
    
    // 3. Extract common technology tags
    const techPatterns = {
      "typescript": /\b(typescript|ts|\.ts)\b/gi,
      "javascript": /\b(javascript|js|\.js)\b/gi,
      "react": /\b(react|jsx|tsx)\b/gi,
      "vue": /\b(vue|\.vue)\b/gi,
      "python": /\b(python|py|\.py)\b/gi,
      "node": /\b(node|nodejs)\b/gi,
      "express": /\b(express|expressjs)\b/gi,
      "jest": /\b(jest)\b/gi,
      "pytest": /\b(pytest)\b/gi,
      "docker": /\b(docker|dockerfile)\b/gi,
      "postgres": /\b(postgres|postgresql)\b/gi,
      "sqlite": /\b(sqlite)\b/gi,
      "async": /\b(async|await|promise|concurrent)\b/gi,
      "security": /\b(security|auth|jwt|oauth|encrypt)\b/gi,
      "validation": /\b(validation|validate|sanitize|zod)\b/gi,
    };
    
    for (const [tag, pattern] of Object.entries(techPatterns)) {
      if (pattern.test(fullText)) {
        tags.add(tag);
      }
    }
    
    // 4. Special handling for pattern types
    if (pattern.id.startsWith("FIX:")) {
      tags.add("fix");
      tags.add("bug");
    }
    if (pattern.id.startsWith("PAT:")) {
      tags.add("pattern");
    }
    if (pattern.id.startsWith("CODE:")) {
      tags.add("code");
      tags.add("implementation");
    }
    if (pattern.id.startsWith("TEST:")) {
      tags.add("test");
      tags.add("testing");
    }
    if (pattern.id.startsWith("SEC:")) {
      tags.add("security");
    }
    if (pattern.id.includes("ANTI:")) {
      tags.add("antipattern");
    }
    
    // Convert to array and limit
    const tagArray = Array.from(tags)
      .filter(tag => tag && tag.length > 1) // Remove single char tags
      .slice(0, 15);
    
    if (tagArray.length > 0) {
      // Update pattern with tags using tags_csv column (safe)
      const tagsCsv = tagArray.join(",");
      updateTagsCsvStmt.run(tagsCsv, pattern.id);
      
      taggedCount++;
      console.log(`✅ Tagged ${pattern.id} with: ${tagsCsv}`);
    } else {
      console.log(`⚠️  No tags found for ${pattern.id}`);
    }
  } catch (error) {
    errors.push({ pattern: pattern.id, error: error.message });
    console.log(`❌ Error processing ${pattern.id}: ${error.message}`);
  }
}

// Now handle the FTS update issue more carefully
console.log("\n🔍 Updating tags column and FTS index...");
try {
  // Begin a transaction to ensure consistency
  const transaction = db.transaction(() => {
    // Step 1: Disable the FTS trigger temporarily
    console.log("  1. Disabling FTS trigger...");
    db.exec("DROP TRIGGER IF EXISTS patterns_au");
    
    // Step 2: Copy tags_csv to tags for patterns that need it
    console.log("  2. Copying tags from tags_csv to tags column...");
    const copyTagsStmt = db.prepare(`
      UPDATE patterns 
      SET tags = tags_csv 
      WHERE tags_csv IS NOT NULL AND tags_csv != '' AND (tags IS NULL OR tags = '')
    `);
    const copiedCount = copyTagsStmt.run().changes;
    console.log(`     ✅ Updated ${copiedCount} patterns`);
    
    // Step 3: Recreate the FTS trigger
    console.log("  3. Recreating FTS trigger...");
    db.exec(`
      CREATE TRIGGER patterns_au AFTER UPDATE OF title, summary, tags, keywords, search_index ON patterns BEGIN
        INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
        VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
      END
    `);
    
    // Step 4: Rebuild the FTS index completely
    console.log("  4. Rebuilding FTS index...");
    db.exec("INSERT INTO patterns_fts(patterns_fts) VALUES('rebuild')");
    
    console.log("  ✅ FTS index updated successfully");
  });
  
  // Execute the transaction
  transaction();
} catch (error) {
  console.log(`  ❌ FTS update failed: ${error.message}`);
  console.log("     Tags are still available in tags_csv column");
}

// Final summary
console.log("\n" + "=".repeat(50));
console.log("📊 TAGGING SUMMARY");
console.log("=".repeat(50));
console.log(`✅ Successfully tagged: ${taggedCount} patterns`);
console.log(`⏭️  Skipped (already tagged): ${skippedCount} patterns`);
console.log(`❌ Errors: ${errors.length} patterns`);
console.log(`📋 Total processed: ${patterns.length} patterns`);

if (errors.length > 0) {
  console.log("\n❌ Error Details:");
  errors.forEach(({ pattern, error }) => {
    console.log(`   ${pattern}: ${error}`);
  });
}

// Verification - check some tagged patterns
console.log("\n🔍 Verification Sample:");
const sampleTagged = db.prepare(`
  SELECT id, title, tags, tags_csv
  FROM patterns 
  WHERE (tags IS NOT NULL AND tags != '') OR (tags_csv IS NOT NULL AND tags_csv != '')
  LIMIT 5
`).all();

sampleTagged.forEach(p => {
  console.log(`   ${p.id}`);
  console.log(`   └─ tags: ${p.tags || '(empty)'}`);
  console.log(`   └─ tags_csv: ${p.tags_csv || '(empty)'}`);
});

// Test FTS search
console.log("\n🔍 Testing FTS search:");
try {
  const searchResults = db.prepare(`
    SELECT id, title, tags 
    FROM patterns_fts 
    WHERE patterns_fts MATCH 'api OR auth OR test' 
    LIMIT 3
  `).all();
  
  if (searchResults.length > 0) {
    console.log(`✅ FTS search working - found ${searchResults.length} results`);
    searchResults.forEach(r => {
      console.log(`   ${r.id}: ${r.tags}`);
    });
  } else {
    console.log("⚠️  FTS search returned no results");
  }
} catch (error) {
  console.log(`❌ FTS search failed: ${error.message}`);
}

// Close database
db.close();

console.log("\n✨ Tagging complete!");
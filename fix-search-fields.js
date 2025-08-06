#!/usr/bin/env node

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Open database
const db = new Database(join(__dirname, 'patterns.db'));

// Function to extract keywords
function extractKeywords(data) {
  const keywords = new Set();
  
  // Extract from title
  if (data.title) {
    const titleWords = data.title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
    titleWords.forEach(w => keywords.add(w));
  }
  
  // Extract from summary
  if (data.summary) {
    const summaryWords = data.summary.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
    summaryWords.forEach(w => keywords.add(w));
  }
  
  // Extract from snippets
  if (data.snippets && Array.isArray(data.snippets)) {
    data.snippets.forEach(snippet => {
      if (snippet.language) {
        keywords.add(snippet.language.toLowerCase());
      }
    });
  }
  
  return Array.from(keywords).join(' ');
}

// Function to build search index
function buildSearchIndex(data) {
  const indexParts = [];
  
  if (data.title) {
    indexParts.push(data.title);
    indexParts.push(data.title); // Double weight
  }
  
  if (data.summary) {
    indexParts.push(data.summary);
  }
  
  if (data.snippets && Array.isArray(data.snippets)) {
    data.snippets.forEach(snippet => {
      if (snippet.content) {
        indexParts.push(snippet.content);
      }
    });
  }
  
  return indexParts.join(' ');
}

try {
  // Temporarily drop the update trigger to avoid SQL logic errors
  console.log('Dropping update trigger temporarily...');
  db.exec(`DROP TRIGGER IF EXISTS patterns_au`);
  
  // Get patterns with NULL search fields
  const patterns = db.prepare(`
    SELECT id, json_canonical 
    FROM patterns 
    WHERE (tags IS NULL OR keywords IS NULL OR search_index IS NULL)
      AND json_canonical IS NOT NULL
  `).all();
  
  console.log(`Found ${patterns.length} patterns to update`);
  
  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE patterns 
    SET tags = ?, keywords = ?, search_index = ?
    WHERE id = ?
  `);
  
  let successCount = 0;
  let errorCount = 0;
  
  // Process each pattern
  for (const pattern of patterns) {
    try {
      const data = JSON.parse(pattern.json_canonical);
      
      // Extract tags
      let tagsStr = '';
      if (data.tags) {
        if (Array.isArray(data.tags)) {
          tagsStr = data.tags.join(',');
        } else if (typeof data.tags === 'string') {
          tagsStr = data.tags;
        }
      }
      
      // Extract keywords and build search index
      const keywords = extractKeywords(data);
      const searchIndex = buildSearchIndex(data);
      
      // Update the pattern
      updateStmt.run(tagsStr, keywords, searchIndex, pattern.id);
      successCount++;
      console.log(`✓ Updated ${pattern.id}`);
      
    } catch (error) {
      console.error(`✗ Error processing ${pattern.id}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\nSuccessfully updated ${successCount} patterns, ${errorCount} errors`);
  
  // Rebuild FTS5 index
  console.log('\nRebuilding FTS5 index...');
  db.exec(`DELETE FROM patterns_fts`);
  db.exec(`
    INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
    SELECT rowid, id, title, summary, tags, keywords, search_index
    FROM patterns
    WHERE invalid = 0
  `);
  db.exec(`INSERT INTO patterns_fts(patterns_fts) VALUES('optimize')`);
  
  console.log('✓ FTS5 index rebuilt successfully');
  
  // Recreate the trigger
  console.log('\nRecreating update trigger...');
  db.exec(`
    CREATE TRIGGER patterns_au AFTER UPDATE OF title, summary, tags, keywords, search_index ON patterns BEGIN
      INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
      VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
      INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
      VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
    END;
  `);
  console.log('✓ Trigger recreated');
  
  // Verify the fix
  const verifyCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM patterns 
    WHERE keywords IS NOT NULL OR search_index IS NOT NULL
  `).get();
  
  console.log(`\n✓ Verification: ${verifyCount.count} patterns now have search fields populated`);
  
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  db.close();
}
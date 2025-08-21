#!/usr/bin/env node

/**
 * Pattern Seeding Script
 * Seeds the database with initial patterns from:
 * 1. CONVENTIONS.pending.md
 * 2. examples/patterns/*.yaml
 * 
 * Uses PatternInserter for direct database insertion
 * [PAT:REFLECTION:DIRECT_INSERT] ★★★★★ - Direct pattern insertion
 * [FIX:SQLITE:SYNC] ★★★★☆ - Synchronous transactions
 */

import Database from 'better-sqlite3';
import { PatternInserter } from '../dist/reflection/pattern-inserter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import yaml from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path
const dbPath = path.join(os.homedir(), '.apex', 'global', 'patterns.db');

// Initialize database and PatternInserter
const db = new Database(dbPath);

// [FIX:SQLITE:SYNC] - Create tables if they don't exist
// Initialize schema before using PatternInserter
db.exec(`
  CREATE TABLE IF NOT EXISTS patterns (
    id                TEXT PRIMARY KEY,
    schema_version    TEXT NOT NULL,
    pattern_version   TEXT NOT NULL,
    type              TEXT NOT NULL CHECK (type IN ('CODEBASE','LANG','ANTI','FAILURE','POLICY','TEST','MIGRATION')),
    title             TEXT NOT NULL,
    summary           TEXT NOT NULL,
    trust_score       REAL NOT NULL CHECK (trust_score >= 0.0 AND trust_score <= 1.0),
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    source_repo       TEXT,
    tags              TEXT,
    pattern_digest    TEXT NOT NULL,
    json_canonical    BLOB NOT NULL,
    invalid           INTEGER NOT NULL DEFAULT 0,
    invalid_reason    TEXT,
    alias             TEXT UNIQUE,
    keywords          TEXT,
    search_index      TEXT,
    alpha             REAL DEFAULT 1.0,
    beta              REAL DEFAULT 1.0
  );
  
  CREATE TABLE IF NOT EXISTS pattern_snippets (
    pattern_id  TEXT NOT NULL,
    snippet_id  TEXT NOT NULL,
    content     TEXT NOT NULL,
    language    TEXT,
    PRIMARY KEY (pattern_id, snippet_id),
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
  );
`);

const patternInserter = new PatternInserter(db);

// Statistics tracking
let totalPatterns = 0;
let successCount = 0;
let failureCount = 0;
let duplicateCount = 0;

/**
 * Parse patterns from CONVENTIONS.pending.md
 * Extracts pattern definitions from markdown format
 */
function parseMarkdownPatterns(content) {
  const patterns = [];
  const lines = content.split('\n');
  
  let currentPattern = null;
  let inCodeBlock = false;
  let codeBuffer = [];
  let codeLanguage = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Pattern header detection
    const patternMatch = line.match(/^##\s+\[([^\]]+)\]\s+-\s+(.+?)(?:\s+★+.*)?$/);
    if (patternMatch) {
      // Save previous pattern if exists
      if (currentPattern) {
        patterns.push(currentPattern);
      }
      
      // Start new pattern
      currentPattern = {
        pattern_id: patternMatch[1],
        title: patternMatch[2],
        summary: '',
        snippets: [],
        evidence: []
      };
      continue;
    }
    
    if (!currentPattern) continue;
    
    // Problem section
    if (line.startsWith('**Problem**:')) {
      const problem = line.substring('**Problem**:'.length).trim();
      if (problem) {
        currentPattern.summary = `Problem: ${problem}`;
      }
      continue;
    }
    
    // Solution section
    if (line.startsWith('**Solution**:')) {
      const solution = line.substring('**Solution**:'.length).trim();
      if (solution) {
        currentPattern.summary += currentPattern.summary ? ` | Solution: ${solution}` : `Solution: ${solution}`;
      }
      continue;
    }
    
    // Code block handling
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = line.substring(3).trim() || 'javascript';
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        if (codeBuffer.length > 0) {
          currentPattern.snippets.push({
            snippet_id: `snippet-${currentPattern.snippets.length + 1}`,
            language: codeLanguage,
            code: codeBuffer.join('\n')
          });
        }
        codeBuffer = [];
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeBuffer.push(line);
    }
    
    // Pattern section for additional details
    if (line.startsWith('**Pattern**:') && i + 1 < lines.length) {
      // Collect pattern steps as part of summary
      let j = i + 1;
      const patternSteps = [];
      while (j < lines.length && lines[j].match(/^\d+\./)) {
        patternSteps.push(lines[j].substring(lines[j].indexOf('.') + 1).trim());
        j++;
      }
      if (patternSteps.length > 0) {
        currentPattern.summary += ` | Steps: ${patternSteps.join('; ')}`;
      }
    }
  }
  
  // Add last pattern
  if (currentPattern) {
    patterns.push(currentPattern);
  }
  
  return patterns;
}

/**
 * Load patterns from YAML files
 */
function loadYamlPatterns(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = yaml.parse(content);
    
    // Convert YAML format to PatternInserter format
    const pattern = {
      pattern_id: data.id,
      title: data.title,
      summary: data.summary,
      snippets: [],
      evidence: data.evidence || []
    };
    
    // Convert snippets
    if (data.snippets && Array.isArray(data.snippets)) {
      pattern.snippets = data.snippets.map((snippet, index) => ({
        snippet_id: `snippet-${index + 1}`,
        language: snippet.language || 'javascript',
        code: snippet.code || '',
        label: snippet.label
      }));
    }
    
    return pattern;
  } catch (error) {
    console.error(`Error loading YAML pattern from ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Insert a pattern into the database
 */
function insertPattern(pattern) {
  totalPatterns++;
  
  try {
    // Validate required fields
    if (!pattern.title || !pattern.summary) {
      console.log(`⚠️  Skipping pattern ${pattern.pattern_id || 'unknown'}: Missing title or summary`);
      failureCount++;
      return;
    }
    
    // [PAT:REFLECTION:DIRECT_INSERT] - Use PatternInserter for direct insertion
    const patternId = patternInserter.insertNewPattern(pattern, 'NEW_PATTERN');
    
    if (patternId) {
      console.log(`✅ Inserted pattern: ${patternId} - ${pattern.title}`);
      successCount++;
    } else {
      console.log(`⚠️  Pattern may already exist: ${pattern.pattern_id} - ${pattern.title}`);
      duplicateCount++;
    }
  } catch (error) {
    console.error(`❌ Failed to insert pattern ${pattern.pattern_id || 'unknown'}:`, error.message);
    failureCount++;
  }
}

/**
 * Main seeding function
 */
async function seedPatterns() {
  console.log('🌱 Starting pattern seeding...\n');
  
  // Check initial pattern count
  const initialCount = db.prepare('SELECT COUNT(*) as count FROM patterns').get();
  console.log(`📊 Initial pattern count: ${initialCount.count}\n`);
  
  // 1. Parse and insert patterns from CONVENTIONS.pending.md
  console.log('📖 Loading patterns from CONVENTIONS.pending.md...');
  const conventionsPath = path.join(__dirname, '..', 'CONVENTIONS.pending.md');
  
  if (fs.existsSync(conventionsPath)) {
    const content = fs.readFileSync(conventionsPath, 'utf8');
    const markdownPatterns = parseMarkdownPatterns(content);
    console.log(`  Found ${markdownPatterns.length} patterns in markdown\n`);
    
    for (const pattern of markdownPatterns) {
      insertPattern(pattern);
    }
  } else {
    console.log('  CONVENTIONS.pending.md not found\n');
  }
  
  // 2. Load and insert patterns from examples/patterns/*.yaml
  console.log('\n📁 Loading patterns from examples/patterns/*.yaml...');
  const examplesDir = path.join(__dirname, '..', 'examples', 'patterns');
  
  if (fs.existsSync(examplesDir)) {
    const yamlFiles = fs.readdirSync(examplesDir).filter(f => f.endsWith('.yaml'));
    console.log(`  Found ${yamlFiles.length} YAML pattern files\n`);
    
    for (const file of yamlFiles) {
      const filePath = path.join(examplesDir, file);
      const pattern = loadYamlPatterns(filePath);
      if (pattern) {
        insertPattern(pattern);
      }
    }
  } else {
    console.log('  examples/patterns directory not found\n');
  }
  
  // Final statistics
  const finalCount = db.prepare('SELECT COUNT(*) as count FROM patterns').get();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Seeding Complete!');
  console.log('='.repeat(60));
  console.log(`Total patterns processed: ${totalPatterns}`);
  console.log(`✅ Successfully inserted: ${successCount}`);
  console.log(`⚠️  Duplicates skipped: ${duplicateCount}`);
  console.log(`❌ Failed insertions: ${failureCount}`);
  console.log(`\n📈 Pattern count: ${initialCount.count} → ${finalCount.count} (${finalCount.count - initialCount.count} added)`);
  
  // Test apex_patterns_lookup functionality
  console.log('\n🔍 Testing pattern lookup...');
  const samplePatterns = db.prepare('SELECT id, title, trust_score FROM patterns LIMIT 3').all();
  if (samplePatterns.length > 0) {
    console.log('Sample patterns in database:');
    samplePatterns.forEach(p => {
      console.log(`  - ${p.id}: ${p.title} (trust: ${p.trust_score})`);
    });
    console.log('\n✅ apex_patterns_lookup should now return results!');
  } else {
    console.log('❌ No patterns found in database after seeding');
  }
  
  // Clean up
  db.close();
  
  return finalCount.count > initialCount.count;
}

// Run seeding
seedPatterns()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error during seeding:', error);
    process.exit(1);
  });
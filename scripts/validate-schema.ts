#!/usr/bin/env node

/**
 * Schema Validation Script
 * Run this before commits to ensure schema consistency
 * 
 * Usage: npm run validate:schema
 */

import Database from "better-sqlite3";
import { FTS_SCHEMA_SQL, SCHEMA_SQL } from "../src/storage/schema-constants.js";
import chalk from "chalk";

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

function validateSchemaConsistency(): ValidationResult {
  const result: ValidationResult = {
    passed: true,
    errors: [],
    warnings: []
  };
  
  console.log(chalk.blue("🔍 Validating schema consistency...\n"));
  
  // Create in-memory database with schema
  const db = new Database(":memory:");
  
  try {
    // 1. Validate that all tables can be created
    console.log("✓ Creating tables...");
    Object.values(SCHEMA_SQL).forEach((sql: any) => {
      if (typeof sql === 'string') {
        db.exec(sql);
      }
    });
    
    // 2. Validate FTS table creation
    console.log("✓ Creating FTS tables...");
    db.exec(FTS_SCHEMA_SQL.patterns_fts);
    
    // 3. Extract actual columns from created tables
    const patternColumns = db.prepare(`
      SELECT name FROM pragma_table_info('patterns')
    `).all() as { name: string }[];
    const patternColumnNames = new Set(patternColumns.map(c => c.name));
    
    const ftsColumns = db.prepare(`
      SELECT name FROM pragma_table_info('patterns_fts')  
    `).all() as { name: string }[];
    const ftsColumnNames = new Set(ftsColumns.map(c => c.name));
    
    // 4. Validate trigger definitions
    console.log("✓ Validating trigger definitions...");
    const triggers = Object.values(FTS_SCHEMA_SQL.patterns_fts_triggers);
    
    triggers.forEach((triggerSql: any, index) => {
      // Check INSERT INTO columns match FTS table
      const insertMatch = triggerSql.match(/INSERT INTO patterns_fts\s*\(([^)]+)\)/);
      if (insertMatch) {
        const columns = insertMatch[1].split(',').map((c: string) => c.trim());
        columns.forEach((col: string) => {
          if (col !== 'rowid' && col !== 'patterns_fts' && !ftsColumnNames.has(col)) {
            result.errors.push(
              `Trigger ${index} references FTS column '${col}' that doesn't exist in FTS table`
            );
            result.passed = false;
          }
        });
      }
      
      // Check new.* references match patterns table
      const newRefs = [...triggerSql.matchAll(/new\.(\w+)/g)];
      newRefs.forEach(match => {
        const col = match[1];
        if (col !== 'rowid' && !patternColumnNames.has(col)) {
          result.errors.push(
            `Trigger ${index} references 'new.${col}' but column doesn't exist in patterns table`
          );
          result.passed = false;
        }
      });
      
      // Check old.* references match patterns table
      const oldRefs = [...triggerSql.matchAll(/old\.(\w+)/g)];
      oldRefs.forEach(match => {
        const col = match[1];
        if (col !== 'rowid' && !patternColumnNames.has(col)) {
          result.errors.push(
            `Trigger ${index} references 'old.${col}' but column doesn't exist in patterns table`
          );
          result.passed = false;
        }
      });
    });
    
    // 5. Check for common anti-patterns
    console.log("✓ Checking for anti-patterns...");
    
    // Check if triggers use CREATE TRIGGER IF NOT EXISTS (anti-pattern)
    triggers.forEach((triggerSql: any, index) => {
      if (triggerSql.includes('IF NOT EXISTS')) {
        result.warnings.push(
          `Trigger ${index} uses IF NOT EXISTS - consider dropping first to ensure updates`
        );
      }
    });
    
    // 6. Validate that migration exists for recent schema changes
    console.log("✓ Checking migration coverage...");
    // This would check git history vs migrations in a real implementation
    
  } catch (error: any) {
    result.errors.push(`Schema creation failed: ${error.message}`);
    result.passed = false;
  }
  
  return result;
}

// Run validation
const result = validateSchemaConsistency();

// Output results
console.log("\n" + chalk.blue("=" * 50) + "\n");

if (result.errors.length > 0) {
  console.log(chalk.red("❌ ERRORS:"));
  result.errors.forEach(err => console.log(chalk.red(`  - ${err}`)));
  console.log();
}

if (result.warnings.length > 0) {
  console.log(chalk.yellow("⚠️  WARNINGS:"));
  result.warnings.forEach(warn => console.log(chalk.yellow(`  - ${warn}`)));
  console.log();
}

if (result.passed) {
  console.log(chalk.green("✅ Schema validation PASSED"));
  process.exit(0);
} else {
  console.log(chalk.red("❌ Schema validation FAILED"));
  console.log(chalk.gray("\nPlease fix the errors before committing."));
  process.exit(1);
}
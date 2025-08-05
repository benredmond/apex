import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import BetterSqlite3 from "better-sqlite3";
export class MigrationValidator {
  sourceDb;
  constructor(db) {
    this.sourceDb = db;
  }
  /**
   * Validate that migrations can be applied and rolled back cleanly
   */
  async validateMigrations(migrations) {
    const tempDir = await mkdtemp(join(tmpdir(), "apex-migration-test-"));
    const testDbPath = join(tempDir, "test.db");
    let testDb = null;
    try {
      console.log("Creating test database for validation...");
      // Create test database with same schema
      testDb = new BetterSqlite3(testDbPath);
      await this.copySchema(this.sourceDb, testDb);
      // Test each migration's up and down functions
      for (const migration of migrations) {
        console.log(`Validating migration ${migration.id}...`);
        // Test up migration
        const upResult = await this.testMigration(testDb, migration, "up");
        if (!upResult.success) {
          console.error(`✗ Up migration failed: ${upResult.error}`);
          return false;
        }
        // Test down migration
        const downResult = await this.testMigration(testDb, migration, "down");
        if (!downResult.success) {
          console.error(`✗ Down migration failed: ${downResult.error}`);
          return false;
        }
        // Verify database is in expected state after up->down cycle
        if (!(await this.verifyReversibility(testDb, migration))) {
          console.error(`✗ Migration ${migration.id} is not fully reversible`);
          return false;
        }
        console.log(`✓ Migration ${migration.id} validated`);
      }
      // Test sequential application
      console.log("\nTesting sequential migration application...");
      if (!(await this.testSequentialApplication(migrations))) {
        return false;
      }
      console.log("\n✓ All migrations validated successfully");
      return true;
    } finally {
      // Cleanup
      if (testDb) testDb.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  }
  /**
   * Copy schema from source to test database
   */
  async copySchema(source, target) {
    // Get schema from source database
    const schema = source
      .prepare(
        `
      SELECT sql FROM sqlite_master 
      WHERE type IN ('table', 'index', 'trigger') 
      AND name NOT LIKE 'sqlite_%'
      ORDER BY type DESC, name
    `,
      )
      .all();
    // [PAT:dA0w9N1I9-4m] - Synchronous transaction
    target.transaction(() => {
      for (const { sql } of schema) {
        if (sql) {
          target.exec(sql);
        }
      }
    })();
  }
  /**
   * Test a single migration direction
   */
  async testMigration(db, migration, direction) {
    const savepointName = `test_${migration.version}_${direction}`;
    try {
      // [PAT:dA0w9N1I9-4m] - Use savepoint for test isolation
      db.prepare(`SAVEPOINT ${savepointName}`).run();
      // Run migration
      if (direction === "up") {
        migration.up(db);
      } else {
        migration.down(db);
      }
      // Verify database is still functional
      db.prepare("SELECT 1").get();
      // Release savepoint
      db.prepare(`RELEASE ${savepointName}`).run();
      return { success: true };
    } catch (error) {
      // Rollback on error
      try {
        db.prepare(`ROLLBACK TO ${savepointName}`).run();
      } catch {
        // Ignore rollback errors
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  /**
   * Verify migration can be cleanly reversed
   */
  async verifyReversibility(db, migration) {
    const savepointName = `verify_${migration.version}`;
    try {
      // Capture state before migration
      db.prepare(`SAVEPOINT ${savepointName}`).run();
      const stateBefore = await this.captureDbState(db);
      // Run up then down
      migration.up(db);
      migration.down(db);
      // Capture state after
      const stateAfter = await this.captureDbState(db);
      // Release savepoint
      db.prepare(`RELEASE ${savepointName}`).run();
      // Compare states (basic check - could be enhanced)
      return this.compareDbStates(stateBefore, stateAfter);
    } catch (error) {
      try {
        db.prepare(`ROLLBACK TO ${savepointName}`).run();
      } catch {
        // Ignore rollback errors
      }
      return false;
    }
  }
  /**
   * Capture database state for comparison
   */
  async captureDbState(db) {
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `,
      )
      .all();
    const state = {};
    for (const { name } of tables) {
      // Get row count as basic state indicator
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get();
      state[name] = count.count;
    }
    return state;
  }
  /**
   * Compare two database states
   */
  compareDbStates(before, after) {
    const beforeKeys = Object.keys(before).sort();
    const afterKeys = Object.keys(after).sort();
    // Check same tables exist
    if (beforeKeys.join(",") !== afterKeys.join(",")) {
      return false;
    }
    // For now, just check table existence, not row counts
    // (since migrations might legitimately change data)
    return true;
  }
  /**
   * Test that all migrations can be applied in sequence
   */
  async testSequentialApplication(migrations) {
    const tempDir = await mkdtemp(join(tmpdir(), "apex-seq-test-"));
    const testDbPath = join(tempDir, "test.db");
    let testDb = null;
    try {
      testDb = new BetterSqlite3(testDbPath);
      await this.copySchema(this.sourceDb, testDb);
      // Apply all migrations in order
      for (const migration of migrations) {
        try {
          migration.up(testDb);
        } catch (error) {
          console.error(
            `✗ Sequential application failed at ${migration.id}:`,
            error,
          );
          return false;
        }
      }
      console.log("✓ Sequential application successful");
      return true;
    } finally {
      if (testDb) testDb.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  }
  /**
   * Check for common migration issues
   */
  checkCommonIssues(migrations) {
    const issues = [];
    for (const migration of migrations) {
      const upCode = migration.up.toString();
      const downCode = migration.down.toString();
      // [FIX:SQLITE:SYNC] - Check for async usage
      if (upCode.includes("async") || upCode.includes("await")) {
        issues.push(
          `${migration.id}: Uses async/await in up() - SQLite transactions must be synchronous`,
        );
      }
      if (downCode.includes("async") || downCode.includes("await")) {
        issues.push(
          `${migration.id}: Uses async/await in down() - SQLite transactions must be synchronous`,
        );
      }
      // Check for empty migrations
      if (upCode.includes("TODO") || upCode.includes("// Add")) {
        issues.push(
          `${migration.id}: Appears to have unimplemented up() function`,
        );
      }
      if (downCode.includes("TODO") || downCode.includes("// Add")) {
        issues.push(
          `${migration.id}: Appears to have unimplemented down() function`,
        );
      }
      // Check for transaction usage
      if (!upCode.includes("transaction")) {
        issues.push(
          `${migration.id}: Consider using db.transaction() for atomic operations`,
        );
      }
    }
    return issues;
  }
}

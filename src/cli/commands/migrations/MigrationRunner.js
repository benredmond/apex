export class MigrationRunner {
  constructor(db) {
    this.tableName = "migration_versions";
    this.db = db;
    this.initializeMigrationTable();
  }
  /**
   * Initialize the migration tracking table
   */
  initializeMigrationTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        version INTEGER PRIMARY KEY,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        execution_time_ms INTEGER NOT NULL
      )
    `);
  }
  /**
   * Get migration status
   */
  getStatus(migrations) {
    const applied = this.db
      .prepare(
        `SELECT version, id, name, checksum, applied_at, execution_time_ms 
         FROM ${this.tableName} ORDER BY version`,
      )
      .all();
    const appliedVersions = new Set(applied.map((m) => m.version));
    const pending = migrations.filter((m) => !appliedVersions.has(m.version));
    return {
      pending,
      applied,
      total: migrations.length,
    };
  }
  /**
   * Get applied migration history
   */
  getHistory() {
    return this.db
      .prepare(
        `SELECT version, id, name, checksum, applied_at, execution_time_ms 
         FROM ${this.tableName} ORDER BY version`,
      )
      .all();
  }
  /**
   * Run pending migrations
   */
  async runMigrations(migrations, options = {}) {
    const { dryRun = false, targetVersion, force = false } = options;
    const status = this.getStatus(migrations);
    // Validate checksums of applied migrations FIRST, before checking pending
    if (!force) {
      this.validateChecksums(migrations, status.applied);
    }
    if (status.pending.length === 0) {
      console.log("No pending migrations");
      return;
    }
    // Filter migrations to run
    let toRun = status.pending;
    if (targetVersion !== undefined) {
      toRun = toRun.filter((m) => m.version <= targetVersion);
    }
    console.log(`Found ${toRun.length} pending migrations`);
    if (dryRun) {
      console.log("DRY RUN - would run:");
      toRun.forEach((m) => console.log(`  ${m.id}: ${m.name}`));
      return;
    }
    // Run migrations in order
    for (const migration of toRun) {
      await this.runSingleMigration(migration);
    }
    console.log(`✓ Applied ${toRun.length} migrations successfully`);
  }
  /**
   * Run a single migration with savepoint protection
   */
  async runSingleMigration(migration) {
    const startTime = Date.now();
    const savepointName = `migration_${migration.version}`;
    console.log(`Running migration ${migration.id}: ${migration.name}`);
    try {
      // [PAT:dA0w9N1I9-4m] - Use savepoints for rollback capability
      this.db.prepare(`SAVEPOINT ${savepointName}`).run();
      // Run the migration
      migration.up(this.db);
      // Record successful migration
      const executionTime = Date.now() - startTime;
      this.db
        .prepare(
          `
        INSERT INTO ${this.tableName} 
        (version, id, name, checksum, applied_at, execution_time_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          migration.version,
          migration.id,
          migration.name,
          migration.checksum,
          new Date().toISOString(),
          executionTime,
        );
      // Release savepoint on success
      this.db.prepare(`RELEASE ${savepointName}`).run();
      console.log(
        `✓ Migration ${migration.id} completed in ${executionTime}ms`,
      );
    } catch (error) {
      // Rollback on error
      this.db.prepare(`ROLLBACK TO ${savepointName}`).run();
      console.error(`✗ Migration ${migration.id} failed:`, error);
      throw error;
    }
  }
  /**
   * Rollback migrations down to target version
   */
  async rollbackMigrations(migrations, targetVersion, options = {}) {
    const { dryRun = false } = options;
    const applied = this.getHistory();
    // Find migrations to rollback (in reverse order)
    const toRollback = applied
      .filter((m) => m.version > targetVersion)
      .reverse();
    if (toRollback.length === 0) {
      console.log("No migrations to rollback");
      return;
    }
    console.log(`Found ${toRollback.length} migrations to rollback`);
    if (dryRun) {
      console.log("DRY RUN - would rollback:");
      toRollback.forEach((m) => console.log(`  ${m.id}: ${m.name}`));
      return;
    }
    // Create migration map for rollback functions
    const migrationMap = new Map(migrations.map((m) => [m.version, m]));
    for (const appliedMigration of toRollback) {
      const migration = migrationMap.get(appliedMigration.version);
      if (!migration) {
        console.warn(
          `Migration ${appliedMigration.id} not found in current migrations, skipping rollback`,
        );
        continue;
      }
      await this.rollbackSingleMigration(migration);
    }
    console.log(`✓ Rolled back ${toRollback.length} migrations successfully`);
  }
  /**
   * Rollback a single migration with savepoint protection
   */
  async rollbackSingleMigration(migration) {
    const savepointName = `rollback_${migration.version}`;
    console.log(`Rolling back migration ${migration.id}: ${migration.name}`);
    try {
      // [PAT:dA0w9N1I9-4m] - Use savepoints for rollback capability
      this.db.prepare(`SAVEPOINT ${savepointName}`).run();
      // Run rollback
      migration.down(this.db);
      // Remove from migration table
      this.db
        .prepare(`DELETE FROM ${this.tableName} WHERE version = ?`)
        .run(migration.version);
      // Release savepoint on success
      this.db.prepare(`RELEASE ${savepointName}`).run();
      console.log(`✓ Rollback of ${migration.id} completed`);
    } catch (error) {
      // Rollback the rollback (restore state)
      this.db.prepare(`ROLLBACK TO ${savepointName}`).run();
      console.error(`✗ Rollback of ${migration.id} failed:`, error);
      throw error;
    }
  }
  /**
   * Validate checksums haven't changed for applied migrations
   */
  validateChecksums(migrations, applied) {
    const migrationMap = new Map(migrations.map((m) => [m.version, m]));
    for (const appliedMigration of applied) {
      const currentMigration = migrationMap.get(appliedMigration.version);
      if (!currentMigration) {
        console.warn(
          `Warning: Applied migration ${appliedMigration.id} not found in current migrations`,
        );
        continue;
      }
      if (currentMigration.checksum !== appliedMigration.checksum) {
        throw new Error(
          `Checksum mismatch for migration ${appliedMigration.id}:\n` +
            `  Applied: ${appliedMigration.checksum}\n` +
            `  Current: ${currentMigration.checksum}\n` +
            "Migration files should not be modified after being applied. " +
            "Use --force to ignore this check.",
        );
      }
    }
  }
  /**
   * Get detailed migration history
   */
  getDetailedHistory() {
    return this.db
      .prepare(
        `SELECT version, id, name, applied_at, execution_time_ms, checksum
         FROM ${this.tableName} 
         ORDER BY version`,
      )
      .all();
  }
}

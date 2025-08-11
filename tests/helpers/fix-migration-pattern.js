/**
 * Helper script to apply migration runner pattern to test files
 * This is a one-time fix for the test suite
 */

export const migrationRunnerPattern = `    // Run ALL migrations to create required tables
    const { MigrationRunner } = await import("../../../src/migrations/migrations/MigrationRunner.js");
    const { MigrationLoader } = await import("../../../src/migrations/migrations/MigrationLoader.js");
    
    const migrationRunner = new MigrationRunner(db);
    const loader = new MigrationLoader();
    
    // Load all migrations
    const migrationsDir = path.resolve(__dirname, "../../../src/migrations");
    const migrations = loader.loadMigrations(migrationsDir);
    
    // Run pending migrations
    const status = migrationRunner.getStatus(migrations);
    for (const migration of status.pending) {
      migrationRunner.apply(migration);
    }`;

export const oldPatterns = [
  `migration006.migration.up(db);`,
  `migration007.migration.up(db);`,
  `migration010.migration.up(db);`,
  `migration008.migration.up(db);`,
  `migration003.migration.up(db);`,
];
#!/usr/bin/env node
import { migrateDraftsToPatterns } from '../src/migrations/001-consolidate-patterns.js';
const dbPath = process.argv[2] || 'patterns.db';
console.log(`Running migration on database: ${dbPath}`);
migrateDraftsToPatterns(dbPath)
    .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
})
    .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
});

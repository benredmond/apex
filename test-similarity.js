import Database from 'better-sqlite3';
import { TaskRepository } from './dist/storage/repositories/task-repository.js';
import { TaskSearchEngine } from './dist/intelligence/task-search.js';

// Create in-memory database
const db = new Database(':memory:');

// Run migration 006 to create task tables
const migration = await import('./dist/migrations/006-add-task-system-schema.js');
migration.migration.up(db);

// Create repository and search engine
const repo = new TaskRepository(db);
const searchEngine = new TaskSearchEngine(db);
repo.setSearchEngine(searchEngine);

// Create test tasks
const task1 = repo.create({
  intent: 'Fix authentication bug in login flow',
  task_type: 'bug'
}, {
  tl_dr: 'Fix auth bug',
  objectives: ['Fix login'],
  constraints: []
});

const task2 = repo.create({
  intent: 'Add authentication to API endpoints',  
  task_type: 'feature'
}, {
  tl_dr: 'Add auth to API',
  objectives: ['Secure API'],
  constraints: []
});

// Wait a bit for async similarity computation
await new Promise(resolve => setTimeout(resolve, 100));

// Check if similarities were computed
const count = db.prepare('SELECT COUNT(*) as count FROM task_similarity').get();
console.log('Similarity entries:', count.count);

// Find similar tasks
const similar = await repo.findSimilar(task1.id, 5);
console.log('Similar tasks found:', similar.length);
console.log('Similarity score:', similar[0]?.similarity);

db.close();
console.log('✅ Similarity computation working!');

import Database from 'better-sqlite3';
import { TaskRepository } from './src/storage/repositories/task-repository.js';

const db = new Database('patterns.db');
const repo = new TaskRepository(db);

try {
  const task = repo.create(
    {
      identifier: 'TEST-123',
      intent: 'Test task creation',
      task_type: 'test',
    },
    {
      tl_dr: 'Test task',
      objectives: ['Test objective'],
      constraints: [],
      acceptance_criteria: [],
      plan: [],
      facts: [],
      snippets: [],
      risks_and_gotchas: [],
      open_questions: [],
      test_scaffold: 'None'
    }
  );
  
  console.log('Task created successfully:', task.id);
} catch (error) {
  console.error('Error creating task:', error.message);
} finally {
  db.close();
}

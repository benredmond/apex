import { TaskService } from './dist/mcp/tools/task.js';
import { TaskRepository } from './dist/storage/repositories/task-repository.js';
import Database from 'better-sqlite3';

const db = new Database('patterns.db');
const repo = new TaskRepository(db);
const service = new TaskService(repo, db);

async function test() {
  try {
    const result = await service.create({
      intent: 'Test task creation via TaskService',
      type: 'test'
    });
    
    console.log('Task created successfully:', result.id);
    console.log('Brief TL;DR:', result.brief.tl_dr);
    
    // Clean up
    db.prepare('DELETE FROM tasks WHERE id = ?').run(result.id);
    console.log('Cleanup successful');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    db.close();
  }
}

test();

import Database from 'better-sqlite3';

const db = new Database('patterns.db');

try {
  // Direct SQL insert to test
  const stmt = db.prepare(`
    INSERT INTO tasks (
      id, identifier, title, intent, task_type, status,
      tl_dr, objectives, constraints, acceptance_criteria, plan,
      facts, snippets, risks_and_gotchas, open_questions, test_scaffold,
      phase, confidence, created_at
    ) VALUES (
      'TEST-DIRECT', null, 'Test Task', 'Test Intent', 'test', 'active',
      'Test TL;DR', '[]', '[]', '[]', '[]',
      '[]', '[]', '[]', '[]', 'test scaffold',
      'ARCHITECT', 0.3, CURRENT_TIMESTAMP
    )
  `);
  
  stmt.run();
  console.log('Direct insert successful');
  
  // Try to retrieve it
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('TEST-DIRECT');
  console.log('Task retrieved:', task.id);
  
  // Clean up
  db.prepare('DELETE FROM tasks WHERE id = ?').run('TEST-DIRECT');
  console.log('Cleanup successful');
} catch (error) {
  console.error('Error:', error.message);
} finally {
  db.close();
}

import Database from 'better-sqlite3';

const db = new Database('patterns.db');

// Minimal reproduction of TaskRepository create logic
const stmt = db.prepare(`
  INSERT INTO tasks (
    id, identifier, title, intent, task_type, status,
    tl_dr, objectives, constraints, acceptance_criteria, plan,
    facts, snippets, risks_and_gotchas, open_questions, test_scaffold,
    phase, confidence, created_at, updated_at
  ) VALUES (
    @id, @identifier, @title, @intent, @task_type, @status,
    @tl_dr, @objectives, @constraints, @acceptance_criteria, @plan,
    @facts, @snippets, @risks_and_gotchas, @open_questions, @test_scaffold,
    @phase, @confidence, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
`);

try {
  stmt.run({
    id: 'TEST-WITH-UPDATED',
    identifier: null,
    title: 'Test Task',
    intent: 'Test Intent',
    task_type: 'test',
    status: 'active',
    tl_dr: 'Test TL;DR',
    objectives: '[]',
    constraints: '[]',
    acceptance_criteria: '[]',
    plan: '[]',
    facts: '[]',
    snippets: '[]',
    risks_and_gotchas: '[]',
    open_questions: '[]',
    test_scaffold: 'test scaffold',
    phase: 'ARCHITECT',
    confidence: 0.3
  });
  console.log('Insert with updated_at successful - THIS SHOULD FAIL');
} catch (error) {
  console.error('Expected error:', error.message);
}

db.close();

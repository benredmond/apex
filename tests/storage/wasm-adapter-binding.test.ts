import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

import { WasmSqliteAdapter } from '../../src/storage/adapters/wasm-sqlite-impl.js';
import { TaskRepository } from '../../src/storage/repositories/task-repository.js';

const BASIC_BRIEF = {
  tl_dr: 'Test task',
  objectives: [],
  constraints: [],
  acceptance_criteria: [],
  plan: [],
  facts: [],
  snippets: [],
  risks_and_gotchas: [],
  open_questions: [],
  test_scaffold: '',
};

describe('WasmSqliteAdapter parameter binding', () => {
  let tempDir: string;
  let dbPath: string;
  let adapter: WasmSqliteAdapter;
  let repo: TaskRepository;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-wasm-binding-'));
    dbPath = path.join(tempDir, 'tasks.db');
    adapter = await WasmSqliteAdapter.create(dbPath);

    adapter.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        identifier TEXT,
        title TEXT NOT NULL,
        intent TEXT,
        task_type TEXT,
        status TEXT,
        tl_dr TEXT,
        objectives TEXT,
        constraints TEXT,
        acceptance_criteria TEXT,
        plan TEXT,
        facts TEXT,
        snippets TEXT,
        risks_and_gotchas TEXT,
        open_questions TEXT,
        test_scaffold TEXT,
        phase TEXT,
        phase_handoffs TEXT,
        confidence REAL,
        tags TEXT,
        files_touched TEXT,
        patterns_used TEXT,
        errors_encountered TEXT,
        claims TEXT,
        prior_impls TEXT,
        failure_corpus TEXT,
        policy TEXT,
        assumptions TEXT,
        outcome TEXT,
        reflection_id TEXT,
        key_learning TEXT,
        duration_ms INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      )
    `);

    adapter.exec(`
      CREATE TABLE task_similarity (
        task_a TEXT NOT NULL,
        task_b TEXT NOT NULL,
        similarity_score REAL NOT NULL,
        calculation_method TEXT,
        calculated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (task_a, task_b)
      )
    `);

    repo = new TaskRepository(adapter);
  });

  afterEach(async () => {
    if (adapter) {
      adapter.close();
    }
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  it('creates tasks without sqlite binding errors when using object parameters', () => {
    let task = null;

    expect(() => {
      task = repo.create(
        {
          intent: 'Verify WASM binding behaviour',
          tags: ['wasm', 'binding'],
        },
        BASIC_BRIEF,
      );
    }).not.toThrow();

    expect(task).toBeTruthy();
    if (!task) {
      return;
    }

    expect(task.intent).toBe('Verify WASM binding behaviour');

    const row = adapter
      .prepare('SELECT identifier, tags FROM tasks WHERE id = ?')
      .get(task.id);

    expect(row.identifier).toBeNull();
    expect(row.tags).toBe(JSON.stringify(['wasm', 'binding']));
  });

  it('converts undefined values to null so sql.js can bind them', () => {
    const task = repo.create(
      {
        intent: 'Ensure undefined coercion',
        identifier: undefined,
      },
      BASIC_BRIEF,
    );

    const row = adapter
      .prepare('SELECT identifier FROM tasks WHERE id = ?')
      .get(task.id);

    expect(row.identifier).toBeNull();
  });
});

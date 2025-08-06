/**
 * Tests for Context Pack Service
 * [TEST:JEST:API_MOCKING] ★★★★★ - Mock API calls in tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type Database from 'better-sqlite3';
import { ContextPackService } from '../../src/intelligence/context-pack-service.js';
import { TaskRepository } from '../../src/storage/repositories/task-repository.js';
import { PatternRepository } from '../../src/storage/repository.js';
import { TaskSearchEngine } from '../../src/intelligence/task-search.js';

// Mock dependencies
jest.mock('../../src/storage/repositories/task-repository.js');
jest.mock('../../src/storage/repository.js');
jest.mock('../../src/intelligence/task-search.js');

describe('ContextPackService', () => {
  let service: ContextPackService;
  let mockTaskRepo: jest.Mocked<TaskRepository>;
  let mockPatternRepo: jest.Mocked<PatternRepository>;
  let mockDb: any;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      prepare: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue({
          completed_count: 100,
          success_count: 85,
          avg_duration: 180000,
          count: 5,
        }),
        all: jest.fn().mockReturnValue([]),
      }),
    };

    // Create mocked repositories
    mockTaskRepo = new TaskRepository(mockDb as any) as jest.Mocked<TaskRepository>;
    mockPatternRepo = new PatternRepository({ dbPath: ':memory:' }) as jest.Mocked<PatternRepository>;

    // Mock task repository methods
    mockTaskRepo.findByStatus = jest.fn().mockReturnValue([
      {
        id: 'T001',
        title: 'Test Task 1',
        current_phase: 'BUILDER',
        intent: 'Implement feature X',
        confidence: 0.8,
        decisions: ['Use React', 'Add tests'],
        files_touched: ['src/app.ts', 'tests/app.test.ts'],
      },
      {
        id: 'T002',
        title: 'Test Task 2',
        current_phase: 'ARCHITECT',
        intent: 'Design API',
        confidence: 0.6,
        decisions: ['REST API', 'JWT auth'],
        files_touched: ['src/api.ts'],
      },
    ]);

    // Mock TaskSearchEngine
    jest.mocked(TaskSearchEngine).prototype.findSimilar = jest.fn().mockResolvedValue([
      {
        task: {
          id: 'T999',
          title: 'Similar Task',
          status: 'completed',
        },
        similarity: 0.9,
        reason: 'Similar architecture patterns',
      },
    ]);

    // Create service instance with precomputation disabled for tests
    service = new ContextPackService(mockTaskRepo, mockPatternRepo, mockDb, { skipPrecompute: true });
  });

  describe('getContextPack', () => {
    it('should return a complete context pack', async () => {
      const result = await service.getContextPack();

      expect(result).toHaveProperty('active_tasks');
      expect(result).toHaveProperty('recent_similar_tasks');
      expect(result).toHaveProperty('task_statistics');
      expect(result).toHaveProperty('task_patterns');
      expect(result).toHaveProperty('metadata');

      expect(result.active_tasks).toHaveLength(2);
      expect(result.active_tasks[0].id).toBe('T001');
      expect(result.task_statistics.total_completed).toBe(100);
      expect(result.task_statistics.success_rate).toBeCloseTo(0.85);
    });

    it('should respect maxActiveTasks option', async () => {
      const result = await service.getContextPack({ maxActiveTasks: 1 });

      expect(result.active_tasks).toHaveLength(1);
      expect(result.active_tasks[0].id).toBe('T001');
    });

    it('should truncate long titles', async () => {
      mockTaskRepo.findByStatus = jest.fn().mockReturnValue([
        {
          id: 'T003',
          title: 'A'.repeat(300), // Very long title
          current_phase: 'BUILDER',
          intent: 'B'.repeat(300), // Very long intent
        },
      ]);

      const result = await service.getContextPack();

      expect(result.active_tasks[0].title).toHaveLength(250);
      expect(result.active_tasks[0].intent).toHaveLength(250);
    });

    it('should use cache on second call', async () => {
      const result1 = await service.getContextPack();
      expect(result1.metadata.cache_hit).toBe(false);

      const result2 = await service.getContextPack();
      expect(result2.metadata.cache_hit).toBe(true);
    });

    it('should include truncation info when size limit exceeded', async () => {
      // Create many tasks to exceed size limit
      const manyTasks = Array.from({ length: 100 }, (_, i) => ({
        id: `T${i}`,
        title: `Task ${i}`,
        current_phase: 'BUILDER',
        intent: 'Some intent',
        confidence: 0.5,
        decisions: ['decision1', 'decision2'],
        files_touched: ['file1.ts', 'file2.ts'],
      }));

      mockTaskRepo.findByStatus = jest.fn().mockReturnValue(manyTasks);

      const result = await service.getContextPack({ maxSizeBytes: 5000 });

      expect(result.metadata.truncation_info).toBeDefined();
      expect(result.metadata.size_bytes).toBeLessThanOrEqual(5000);
    });

    it('should handle empty database gracefully', async () => {
      mockTaskRepo.findByStatus = jest.fn().mockReturnValue([]);
      mockDb.prepare().get.mockReturnValue({
        completed_count: 0,
        success_count: 0,
        avg_duration: null,
        count: 0,
      });

      const result = await service.getContextPack();

      expect(result.active_tasks).toHaveLength(0);
      expect(result.task_statistics.total_completed).toBe(0);
      expect(result.task_statistics.success_rate).toBe(0);
      expect(result.metadata.size_bytes).toBeGreaterThan(0);
    });

    it('should include similar tasks for active tasks', async () => {
      const result = await service.getContextPack();

      expect(result.recent_similar_tasks).toBeDefined();
      expect(Object.keys(result.recent_similar_tasks).length).toBeGreaterThan(0);
      
      const similarTasks = result.recent_similar_tasks['T001_similar'];
      expect(similarTasks).toBeDefined();
      expect(similarTasks[0].task.id).toBe('T999');
    });

    it('should filter by specific task ID', async () => {
      const result = await service.getContextPack({ taskId: 'T001' });

      expect(result.metadata.cache_hit).toBe(false);
      // Different cache key for specific task
    });

    it('should measure generation time', async () => {
      const result = await service.getContextPack();

      expect(result.metadata.generation_time_ms).toBeGreaterThanOrEqual(0);
      expect(result.metadata.generation_time_ms).toBeLessThan(1500); // Should be <1.5s
    });
  });

  describe('Performance', () => {
    it('should complete within 1.5s P50', async () => {
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await service.getContextPack();
        times.push(Date.now() - start);
      }

      times.sort((a, b) => a - b);
      const p50 = times[Math.floor(times.length * 0.5)];

      expect(p50).toBeLessThan(1500);
    });
  });
});
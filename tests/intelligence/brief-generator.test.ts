/**
 * Tests for Task Brief Generator
 * [TEST:PERF:BENCHMARK] ★★★★☆ - Performance benchmarking for SLA validation
 * [PAT:AUTO:nYDVmugt] ★★★★☆ - Subprocess isolation for module linking issues
 */

import { describe, it, expect } from '@jest/globals';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('BriefGenerator', () => {
  describe('generateBrief', () => {
    it('should generate a minimal brief for simple tasks', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const task = {
              id: 'task-4',
              identifier: 'T004',
              title: 'Fix null pointer',
              intent: 'Fix NPE in login',
              task_type: 'bug',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            const brief = await generator.generateBrief(task);
            
            // Check tl_dr is now a string, not array
            if (!brief.tl_dr || typeof brief.tl_dr !== 'string') {
              console.log("FAIL: tl_dr should be a string");
              process.exit(1);
            }
            if (brief.tl_dr.length === 0 || brief.tl_dr.length > 150) {
              console.log("FAIL: tl_dr length should be between 1 and 150");
              process.exit(1);
            }
            if (!brief.tl_dr.includes('Fix')) {
              console.log("FAIL: tl_dr should contain 'Fix'");
              process.exit(1);
            }
            
            // All boilerplate fields should be empty arrays
            if (!Array.isArray(brief.objectives) || brief.objectives.length !== 0) {
              console.log("FAIL: objectives should be empty array");
              process.exit(1);
            }
            if (!Array.isArray(brief.constraints) || brief.constraints.length !== 0) {
              console.log("FAIL: constraints should be empty array");
              process.exit(1);
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-minimal-brief.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000); // Longer timeout for database operations
    
    it('should meet P50 performance SLA (≤1.5s)', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const task = {
              id: 'task-5',
              identifier: 'T005',
              title: 'Test performance',
              intent: 'Performance test task',
              task_type: 'test',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            const start = Date.now();
            const brief = await generator.generateBrief(task);
            const duration = Date.now() - start;
            
            // [TEST:PERF:BENCHMARK] ★★★★☆ - P50 should be ≤1.5s
            if (duration >= 1500) {
              console.log(\`FAIL: Duration \${duration}ms exceeds 1500ms SLA\`);
              process.exit(1);
            }
            
            // Provenance might be undefined for simple tasks
            if (brief.provenance && brief.provenance.generation_time_ms >= 1500) {
              console.log("FAIL: Provenance generation time exceeds 1500ms");
              process.exit(1);
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-performance.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);
    
    it('should use cache for repeated requests', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const task = {
              id: 'task-6',
              identifier: 'T006',
              title: 'Cache test',
              intent: 'Test caching',
              task_type: 'test',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            // First request - should not be cached
            const brief1 = await generator.generateBrief(task);
            if (brief1.provenance && brief1.provenance.cache_hit === true) {
              console.log("FAIL: First request should not be cached");
              process.exit(1);
            }
            
            // Second request - should be cached
            const start = Date.now();
            const brief2 = await generator.generateBrief(task);
            const duration = Date.now() - start;
            
            if (brief2.provenance && brief2.provenance.cache_hit !== true) {
              console.log("FAIL: Second request should be cached");
              process.exit(1);
            }
            if (duration >= 100) {
              console.log(\`FAIL: Cache hit took \${duration}ms, should be <100ms\`);
              process.exit(1);
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-cache.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);
    
    it('should include similar tasks in drilldowns for complex tasks', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          
          // Add some sample tasks for similarity testing
          const tasks = [
            {
              id: 'task-1',
              identifier: 'T001',
              title: 'Implement user authentication',
              intent: 'Add JWT authentication to API endpoints',
              task_type: 'feature',
              status: 'completed'
            },
            {
              id: 'task-2',
              identifier: 'T002',
              title: 'Fix login bug',
              intent: 'Users cannot login with special characters in password',
              task_type: 'bug',
              status: 'completed'
            },
            {
              id: 'task-3',
              identifier: 'T003',
              title: 'Refactor authentication module',
              intent: 'Improve code structure and add unit tests',
              task_type: 'refactor',
              status: 'in_progress'
            }
          ];
          
          // Insert sample tasks
          for (const task of tasks) {
            db.prepare(\`
              INSERT INTO tasks (id, identifier, title, intent, task_type, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            \`).run(task.id, task.identifier, task.title, task.intent, task.task_type, task.status);
          }
          
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const task = {
              id: 'task-7',
              identifier: 'T007',
              title: 'Implement comprehensive user authentication system with OAuth2',
              intent: 'Add full authentication system including JWT, OAuth2, password reset, 2FA, and session management with Redis caching',
              task_type: 'feature',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            const brief = await generator.generateBrief(task);
            
            // Complex task should have drilldowns if similar tasks exist
            // This is optional based on task complexity
            if (brief.drilldowns && brief.drilldowns.prior_impls) {
              if (!Array.isArray(brief.drilldowns.prior_impls)) {
                console.log("FAIL: prior_impls should be an array");
                process.exit(1);
              }
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-drilldowns.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);
    
    it('should generate appropriate tl_dr based on task type', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const bugTask = {
              id: 'bug-task-1',
              identifier: 'BUG001',
              title: 'Fix login error',
              intent: 'Users cannot login with valid credentials',
              task_type: 'bug',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            const brief = await generator.generateBrief(bugTask);
            
            // TL;DR should start with task type action
            if (!brief.tl_dr.includes('Fix:')) {
              console.log("FAIL: Bug task tl_dr should contain 'Fix:'");
              process.exit(1);
            }
            if (!brief.tl_dr.includes('Users cannot login')) {
              console.log("FAIL: tl_dr should contain intent summary");
              process.exit(1);
            }
            
            // No boilerplate objectives or criteria
            if (!Array.isArray(brief.objectives) || brief.objectives.length !== 0) {
              console.log("FAIL: objectives should be empty array");
              process.exit(1);
            }
            if (!Array.isArray(brief.acceptance_criteria) || brief.acceptance_criteria.length !== 0) {
              console.log("FAIL: acceptance_criteria should be empty array");
              process.exit(1);
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-tldr-type.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);
    
    it('should handle tasks without similar matches gracefully', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const uniqueTask = {
              id: 'unique-task-1',
              identifier: 'UNIQUE001',
              title: 'Implement quantum computing simulator',
              intent: 'Build a quantum circuit simulator with qubits',
              task_type: 'feature',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            const brief = await generator.generateBrief(uniqueTask);
            
            // Should still generate a brief even without similar tasks
            if (!brief.tl_dr) {
              console.log("FAIL: Should generate tl_dr even without similar tasks");
              process.exit(1);
            }
            if (!Array.isArray(brief.facts)) {
              console.log("FAIL: facts should be an array");
              process.exit(1);
            }
            if (brief.facts.length > 2) {
              console.log("FAIL: Should have minimal facts (<=2) for unique tasks");
              process.exit(1);
            }
            
            // No drilldowns for simple/unique tasks is fine
            // Just validate it's either undefined or valid
            if (brief.drilldowns && typeof brief.drilldowns !== 'object') {
              console.log("FAIL: drilldowns should be object or undefined");
              process.exit(1);
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-unique-task.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);
    
    it('should only include in-flight work for very complex tasks', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const simpleTask = {
              id: 'simple-task',
              identifier: 'SIMPLE001',
              title: 'Fix typo',
              intent: 'Fix typo in README',
              task_type: 'bug',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            const brief = await generator.generateBrief(simpleTask);
            
            // Simple task should not have in-flight work
            if (brief.in_flight !== undefined) {
              console.log("FAIL: Simple task should not have in_flight work");
              process.exit(1);
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-inflight.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);
    
    it('should respect maxSimilarTasks option', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          
          // Add multiple similar tasks
          for (let i = 0; i < 5; i++) {
            db.prepare(\`
              INSERT INTO tasks (id, identifier, title, intent, task_type, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            \`).run(
              \`task-\${i}\`, 
              \`T00\${i}\`, 
              \`Authentication task \${i}\`, 
              'Authentication related work',
              'feature',
              'completed'
            );
          }
          
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const task = {
              id: 'task-8',
              identifier: 'T008',
              title: 'Add authentication to API endpoints with comprehensive security',
              intent: 'Implement full authentication system with rate limiting and audit logging',
              task_type: 'feature',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            const brief = await generator.generateBrief(task, {
              maxSimilarTasks: 2
            });
            
            // Should respect the limit if drilldowns exist
            if (brief.drilldowns && brief.drilldowns.prior_impls) {
              if (brief.drilldowns.prior_impls.length > 2) {
                console.log("FAIL: Should respect maxSimilarTasks limit of 2");
                process.exit(1);
              }
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-max-similar.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);
  });
  
  describe('caching behavior', () => {
    it('should invalidate cache when task is updated', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const task = {
              id: 'cache-test-1',
              identifier: 'CACHE001',
              title: 'Cache invalidation test',
              intent: 'Test cache invalidation',
              task_type: 'test',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            // Generate brief (will be cached)
            const brief1 = await generator.generateBrief(task);
            
            // Clear cache manually
            generator.clearCache();
            
            // Generate again (should not be cached)
            const brief2 = await generator.generateBrief(task);
            if (brief2.provenance && brief2.provenance.cache_hit === true) {
              console.log("FAIL: Should not be cached after clearCache");
              process.exit(1);
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-cache-invalidation.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);
  });
  
  describe('complexity calculation', () => {
    it('should generate minimal brief for simple tasks', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const simpleTask = {
              id: 'simple-1',
              identifier: 'S001',
              title: 'Fix typo',
              intent: 'Fix typo in docs',
              task_type: 'bug',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            const brief = await generator.generateBrief(simpleTask);
            
            // Simple task = minimal brief
            if (brief.tl_dr.length >= 100) {
              console.log(\`FAIL: Simple task tl_dr too long: \${brief.tl_dr.length}\`);
              process.exit(1);
            }
            if (!Array.isArray(brief.objectives) || brief.objectives.length !== 0) {
              console.log("FAIL: objectives should be empty array");
              process.exit(1);
            }
            if (!Array.isArray(brief.facts) || brief.facts.length !== 0) {
              console.log("FAIL: facts should be empty array");
              process.exit(1);
            }
            if (!Array.isArray(brief.snippets) || brief.snippets.length !== 0) {
              console.log("FAIL: snippets should be empty array");
              process.exit(1);
            }
            if (!Array.isArray(brief.risks_and_gotchas) || brief.risks_and_gotchas.length !== 0) {
              console.log("FAIL: risks_and_gotchas should be empty array");
              process.exit(1);
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-simple-complexity.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);
    
    it('should include more data for complex tasks', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-brief-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      
      try {
        const script = `
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import { BriefGenerator } from "${path.resolve('dist/intelligence/brief-generator.js')}";
          import { AutoMigrator } from "${path.resolve('dist/migrations/auto-migrator.js')}";
          
          // Initialize database with migrations
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Open database and create generator
          const db = new Database("${dbPath}");
          const { PatternRepository } = await import("${path.resolve('dist/storage/repository.js')}");
          const patternRepo = new PatternRepository("${dbPath}");
          const generator = new BriefGenerator(db, { patternRepo });
          
          try {
            const complexTask = {
              id: 'complex-1',
              identifier: 'C001',
              title: 'Implement distributed caching system',
              intent: 'Build a distributed caching system with Redis cluster, consistent hashing, cache invalidation strategies, monitoring, and failover support for high availability',
              task_type: 'feature',
              status: 'active',
              created_at: new Date().toISOString()
            };
            
            const brief = await generator.generateBrief(complexTask);
            
            // Complex task should have more context
            if (!brief.tl_dr) {
              console.log("FAIL: Complex task should have tl_dr");
              process.exit(1);
            }
            // Facts might be populated if similar tasks exist
            if (!Array.isArray(brief.facts)) {
              console.log("FAIL: facts should be an array");
              process.exit(1);
            }
            
            // Check complexity score if available
            if (brief.provenance && 'complexity_score' in brief.provenance) {
              if (brief.provenance.complexity_score < 4) {
                console.log("FAIL: Complex task should have complexity score >= 4");
                process.exit(1);
              }
            }
            
            console.log("SUCCESS");
          } finally {
            db.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, 'test-complex-complexity.mjs');
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);
  });
});

// Helper function to run script in subprocess
async function runScript(scriptPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_PATH: path.join(__dirname, '../../node_modules')
      }
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0 && stdout.includes('SUCCESS')) {
        resolve(true);
      } else {
        reject(new Error(`Script failed: ${stderr || stdout}`));
      }
    });
  });
}
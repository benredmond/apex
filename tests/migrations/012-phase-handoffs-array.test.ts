/**
 * Tests for phase_handoffs array migration
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import * as migration from "../../src/migrations/migrations/012-phase-handoffs-array.js";

describe("012-phase-handoffs-array migration", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");
    
    // Create tasks table with minimal schema
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        phase_handoffs TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe("up migration", () => {
    it("should convert Record format to array format", () => {
      // Insert task with Record format handoffs
      const taskId = "test-task-1";
      const recordHandoffs = {
        ARCHITECT: "Design completed",
        BUILDER: "Implementation done",
        VALIDATOR: "Tests passed"
      };
      
      db.prepare(`
        INSERT INTO tasks (id, phase_handoffs, created_at)
        VALUES (@id, @phase_handoffs, @created_at)
      `).run({
        id: taskId,
        phase_handoffs: JSON.stringify(recordHandoffs),
        created_at: "2025-01-01T00:00:00Z"
      });

      // Run migration
      migration.up(db);

      // Check result
      const result = db.prepare("SELECT phase_handoffs FROM tasks WHERE id = ?").get(taskId);
      const handoffs = JSON.parse(result.phase_handoffs);
      
      expect(Array.isArray(handoffs)).toBe(true);
      expect(handoffs).toHaveLength(3);
      
      // Check each handoff was converted correctly
      const architectHandoff = handoffs.find(h => h.phase === "ARCHITECT");
      expect(architectHandoff).toEqual({
        phase: "ARCHITECT",
        handoff: "Design completed",
        timestamp: "2025-01-01T00:00:00Z"
      });
      
      const builderHandoff = handoffs.find(h => h.phase === "BUILDER");
      expect(builderHandoff).toEqual({
        phase: "BUILDER",
        handoff: "Implementation done",
        timestamp: "2025-01-01T00:00:00Z"
      });
    });

    it("should skip tasks already in array format", () => {
      // Insert task already in array format
      const taskId = "test-task-2";
      const arrayHandoffs = [
        { phase: "ARCHITECT", handoff: "Design v1", timestamp: "2025-01-01T00:00:00Z" },
        { phase: "ARCHITECT", handoff: "Design v2", timestamp: "2025-01-01T01:00:00Z" }
      ];
      
      db.prepare(`
        INSERT INTO tasks (id, phase_handoffs, created_at)
        VALUES (@id, @phase_handoffs, @created_at)
      `).run({
        id: taskId,
        phase_handoffs: JSON.stringify(arrayHandoffs),
        created_at: "2025-01-01T00:00:00Z"
      });

      // Run migration
      migration.up(db);

      // Check result - should be unchanged
      const result = db.prepare("SELECT phase_handoffs FROM tasks WHERE id = ?").get(taskId);
      const handoffs = JSON.parse(result.phase_handoffs);
      
      expect(handoffs).toEqual(arrayHandoffs);
    });

    it("should handle tasks with null phase_handoffs", () => {
      // Insert task with null handoffs
      db.prepare("INSERT INTO tasks (id) VALUES (?)").run("test-task-3");

      // Run migration - should not throw
      expect(() => migration.up(db)).not.toThrow();

      // Check result - should still be null
      const result = db.prepare("SELECT phase_handoffs FROM tasks WHERE id = ?").get("test-task-3");
      expect(result.phase_handoffs).toBeNull();
    });
  });

  describe("down migration", () => {
    it("should convert array format back to Record format", () => {
      // Insert task with array format handoffs
      const taskId = "test-task-4";
      const arrayHandoffs = [
        { phase: "ARCHITECT", handoff: "Design v1", timestamp: "2025-01-01T00:00:00Z" },
        { phase: "ARCHITECT", handoff: "Design v2", timestamp: "2025-01-01T01:00:00Z" },
        { phase: "BUILDER", handoff: "Implementation", timestamp: "2025-01-01T02:00:00Z" }
      ];
      
      db.prepare(`
        INSERT INTO tasks (id, phase_handoffs, created_at)
        VALUES (@id, @phase_handoffs, @created_at)
      `).run({
        id: taskId,
        phase_handoffs: JSON.stringify(arrayHandoffs),
        created_at: "2025-01-01T00:00:00Z"
      });

      // Run down migration
      migration.down(db);

      // Check result
      const result = db.prepare("SELECT phase_handoffs FROM tasks WHERE id = ?").get(taskId);
      const handoffs = JSON.parse(result.phase_handoffs);
      
      expect(Array.isArray(handoffs)).toBe(false);
      expect(handoffs).toEqual({
        ARCHITECT: "Design v2", // Latest handoff for ARCHITECT
        BUILDER: "Implementation"
      });
    });

    it("should skip tasks already in Record format", () => {
      // Insert task already in Record format
      const taskId = "test-task-5";
      const recordHandoffs = {
        ARCHITECT: "Design",
        BUILDER: "Build"
      };
      
      db.prepare(`
        INSERT INTO tasks (id, phase_handoffs, created_at)
        VALUES (@id, @phase_handoffs, @created_at)
      `).run({
        id: taskId,
        phase_handoffs: JSON.stringify(recordHandoffs),
        created_at: "2025-01-01T00:00:00Z"
      });

      // Run down migration
      migration.down(db);

      // Check result - should be unchanged
      const result = db.prepare("SELECT phase_handoffs FROM tasks WHERE id = ?").get(taskId);
      const handoffs = JSON.parse(result.phase_handoffs);
      
      expect(handoffs).toEqual(recordHandoffs);
    });
  });
});
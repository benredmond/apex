/**
 * Migration: Convert phase_handoffs from Record to array format
 * [PAT:MIGRATION:SQLITE] ★★★★☆ - SQLite migration pattern
 *
 * Converts existing phase_handoffs from Record<string, any> to PhaseHandoff[]
 * to support tracking all handoffs instead of just the latest one per phase
 */

export const up = (db) => {
  // Get all tasks with phase_handoffs
  const tasks = db
    .prepare(
      `
    SELECT id, phase_handoffs, created_at
    FROM tasks
    WHERE phase_handoffs IS NOT NULL
  `,
    )
    .all();

  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE tasks
    SET phase_handoffs = @phase_handoffs
    WHERE id = @id
  `);

  // Convert each task's phase_handoffs
  tasks.forEach((task) => {
    try {
      const handoffs = JSON.parse(task.phase_handoffs);

      // Check if already in array format (skip if already migrated)
      if (Array.isArray(handoffs)) {
        return;
      }

      // Convert Record format to array format
      const handoffArray = Object.entries(handoffs).map(([phase, handoff]) => ({
        phase,
        handoff,
        timestamp: task.created_at, // Use task creation time for migrated handoffs
      }));

      // Update the task
      updateStmt.run({
        id: task.id,
        phase_handoffs: JSON.stringify(handoffArray),
      });
    } catch (error) {
      console.error(`Failed to migrate task ${task.id}:`, error);
      // Continue with other tasks even if one fails
    }
  });
};

export const down = (db) => {
  // Get all tasks with phase_handoffs
  const tasks = db
    .prepare(
      `
    SELECT id, phase_handoffs
    FROM tasks
    WHERE phase_handoffs IS NOT NULL
  `,
    )
    .all();

  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE tasks
    SET phase_handoffs = @phase_handoffs
    WHERE id = @id
  `);

  // Convert each task's phase_handoffs back to Record format
  tasks.forEach((task) => {
    try {
      const handoffs = JSON.parse(task.phase_handoffs);

      // Check if in array format
      if (!Array.isArray(handoffs)) {
        return; // Already in Record format
      }

      // Convert array format back to Record format
      // Use the latest handoff for each phase
      // Use the latest handoff for each phase
      const handoffRecord = {};
      const handoffTracker = {}; // Track both handoff and timestamp
      handoffs.forEach((h) => {
        // Store the latest handoff for each phase (array might have multiple)
        if (
          !handoffTracker[h.phase] ||
          h.timestamp > handoffTracker[h.phase].timestamp
        ) {
          handoffTracker[h.phase] = {
            handoff: h.handoff,
            timestamp: h.timestamp,
          };
          handoffRecord[h.phase] = h.handoff;
        }
      });
      // Update the task
      updateStmt.run({
        id: task.id,
        phase_handoffs: JSON.stringify(handoffRecord),
      });
    } catch (error) {
      console.error(`Failed to rollback task ${task.id}:`, error);
      // Continue with other tasks even if one fails
    }
  });
};

export const name = "012-phase-handoffs-array";

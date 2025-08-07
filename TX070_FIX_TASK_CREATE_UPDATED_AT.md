---
id: T070
title: Fix apex_task_create error "no such column: updated_at"
type: bug
status: active
priority: high
created: 2025-01-06T15:00:00-08:00
updated: 2025-01-06T15:00:00-08:00
assigned: claude
tags: [mcp, database, schema, tasks]
acceptance_criteria:
  - apex_task_create successfully creates tasks without updated_at error
  - Tasks table schema includes updated_at column if needed
  - Migration properly handles schema updates
  - Existing tasks preserved during migration
current_phase: ARCHITECT
---

# T070: Fix apex_task_create error "no such column: updated_at"

## Problem Statement

The `apex_task_create` MCP tool fails with error "no such column: updated_at" when attempting to create a task. The tasks table schema defined in migration 006 doesn't include an updated_at column, but the code is trying to reference it.

## Evidence

```
Error: no such column: updated_at
- Occurs when calling apex_task_create
- Tasks table created in migration 006-add-task-system-schema.js
- Schema mismatch between code expectations and database structure
```

## Root Cause Analysis

1. The tasks table schema in migration 006 doesn't define an updated_at column
2. The task creation code (likely in task service or MCP tool) references updated_at
3. This is a schema/code mismatch that needs alignment

## Proposed Solution

1. Identify where updated_at is being referenced in the codebase
2. Determine if updated_at should be added to schema or removed from code
3. Create migration if adding column, or fix code if removing reference
4. Ensure all task-related operations handle the schema correctly

## Files to Investigate

- `/src/migrations/migrations/006-add-task-system-schema.js` - Current tasks table schema
- `/src/mcp/tools/task.ts` or similar - Task creation tool
- `/src/services/task-service.ts` or similar - Task service implementation
- Any other files referencing tasks table

## Technical Requirements

- Maintain backward compatibility with existing tasks
- Ensure migration is idempotent
- Handle both creation and update timestamps if needed
- Verify all task operations after fix
EOF < /dev/null
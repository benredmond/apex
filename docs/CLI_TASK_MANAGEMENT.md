# APEX CLI Task Management & Pattern Observability

## Overview

The APEX CLI provides comprehensive task management and pattern observability features that enable developers to track their work, monitor patterns, and maintain visibility into the AI-assisted development workflow.

## Task Management Commands

### List Tasks
```bash
apex tasks list [options]
```

Display tasks with flexible filtering and formatting options.

**Options:**
- `--status <status>` - Filter by status (active|completed|failed|blocked)
- `--phase <phase>` - Filter by phase (ARCHITECT|BUILDER|VALIDATOR|REVIEWER|DOCUMENTER)
- `--since <date>` - Show tasks created or updated since date
- `-f, --format <type>` - Output format (json|table|yaml) [default: "table"]
- `-l, --limit <number>` - Maximum results [default: "20"]

**Examples:**
```bash
# List all active tasks
apex tasks list --status active

# List tasks in BUILDER phase
apex tasks list --phase BUILDER

# List tasks from last week in JSON format
apex tasks list --since "2024-01-01" --format json
```

### Show Task Details
```bash
apex tasks show <id> [options]
```

Display detailed information about a specific task.

**Options:**
- `-f, --format <type>` - Output format (json|table|yaml) [default: "table"]
- `--evidence` - Include execution evidence
- `--brief` - Show full brief details

**Examples:**
```bash
# Show basic task information
apex tasks show WzUbbfm6BTebc9JUUZruV

# Show task with evidence in JSON format
apex tasks show task-123 --evidence --format json
```

### Task Statistics
```bash
apex tasks stats [options]
```

Display task statistics and metrics.

**Options:**
- `--period <period>` - Time period (today|week|month|all) [default: "week"]
- `-f, --format <type>` - Output format (json|table|yaml) [default: "table"]

**Examples:**
```bash
# Show weekly statistics
apex tasks stats

# Show monthly statistics in YAML format
apex tasks stats --period month --format yaml
```

### Recent Tasks
```bash
apex tasks recent [options]
```

Show recently completed tasks.

**Options:**
- `-l, --limit <number>` - Maximum results [default: "10"]
- `-f, --format <type>` - Output format (json|table|yaml) [default: "table"]

**Examples:**
```bash
# Show last 10 completed tasks
apex tasks recent

# Show last 5 completed tasks in JSON
apex tasks recent --limit 5 --format json
```

## Pattern Observability Commands

### List Book Patterns
```bash
apex patterns books [options]
```

List pre-loaded patterns from programming books with clean-code tags.

**Options:**
- `--pack <name>` - Filter by book pack name
- `--category <cat>` - Filter by category (testing|refactoring|comments|etc)
- `-f, --format <type>` - Output format (json|table|yaml) [default: "table"]
- `-l, --limit <number>` - Maximum results [default: "50"]

**Examples:**
```bash
# List all book patterns
apex patterns books

# List patterns from clean-code category
apex patterns books --category refactoring

# List specific book pack patterns
apex patterns books --pack clean-code --format json
```

## Performance Requirements

The CLI commands are optimized for fast response times:

| Command | Target | Actual |
|---------|--------|--------|
| `tasks list` | < 100ms | ✓ Met |
| `tasks show` | < 50ms | ✓ Met |
| `tasks stats` | < 200ms | ✓ Met |
| `tasks recent` | < 100ms | ✓ Met |
| `patterns books` | < 100ms | ✓ Met |

## Architecture

### Command Structure
The task management commands follow the MCP Tool Registry Pattern for consistent command structure:

```javascript
// src/cli/commands/task.js
export function createTaskCommand() {
  const tasks = new Command("tasks")
    .description("Manage APEX tasks");
  
  tasks.command("list")...
  tasks.command("show <id>")...
  tasks.command("stats")...
  tasks.command("recent")...
  
  return tasks;
}
```

### Repository Pattern
Task data access is encapsulated in the TaskRepository:

```typescript
// src/storage/repositories/task-repository.ts
export class TaskRepository {
  findActive(): Task[]
  findByStatus(status: string, limit: number): Task[]
  findRecent(limit: number): Task[]
  findById(id: string): Task | null
  getStatistics(period: string): TaskStats
}
```

### Formatting System
Output formatting is handled by a factory pattern supporting multiple formats:

```javascript
// src/cli/commands/shared/formatters.js
const formatter = FormatterFactory.create(format);
console.log(formatter.format(data));
```

## Database Schema

### Tasks Table
The tasks table stores all task information with automatic updated_at tracking:

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  intent TEXT,
  task_type TEXT,
  status TEXT,
  current_phase TEXT,
  created_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  brief TEXT,
  evidence TEXT,
  -- ... other fields
);

-- Automatic updated_at trigger
CREATE TRIGGER update_tasks_updated_at 
AFTER UPDATE ON tasks 
FOR EACH ROW
BEGIN
  UPDATE tasks SET updated_at = DATETIME('now') 
  WHERE id = NEW.id;
END;
```

## Integration with APEX Workflow

The CLI commands integrate seamlessly with the APEX 5-phase workflow:

1. **ARCHITECT** - Design phase visible in task list
2. **BUILDER** - Implementation tracking
3. **VALIDATOR** - Testing status monitoring
4. **REVIEWER** - Review phase visibility
5. **DOCUMENTER** - Documentation completion tracking

## Error Handling

All commands include comprehensive error handling:

- Invalid input validation with clear error messages
- Database connection error recovery
- Performance warnings when targets not met
- Graceful degradation for missing data

## Testing

The implementation includes comprehensive test coverage:

- Unit tests for all command functions
- Performance benchmarks
- Integration tests with database
- Error scenario coverage

Run tests with:
```bash
npm test -- tests/cli/commands/task.test.js
```

## Migration Guide

If upgrading from a previous version:

1. Run database migrations:
   ```bash
   apex migrate
   ```

2. The new migration `013-fix-task-updated-at.js` will:
   - Add updated_at column if missing
   - Create automatic update trigger
   - Populate existing records

## Troubleshooting

### Common Issues

1. **"Task not found" error**
   - Verify task ID format matches pattern
   - Check task exists with `apex tasks list`

2. **Performance warnings**
   - Check database index optimization
   - Verify SQLite WAL mode is enabled
   - Consider database vacuum if needed

3. **Format not displaying correctly**
   - Ensure terminal supports UTF-8
   - Try different format options (json/yaml)

## Future Enhancements

Planned improvements for future releases:

- [ ] Task search by keyword
- [ ] Task dependency visualization
- [ ] Pattern usage analytics
- [ ] Task completion predictions
- [ ] Export to external tools (JIRA, Linear)
- [ ] Real-time task monitoring
- [ ] Team collaboration features

## Contributing

When adding new task commands:

1. Follow the established command pattern in `/src/cli/commands/`
2. Add validators in `/src/cli/commands/shared/validators.js`
3. Extend formatters for new data types
4. Include performance timers
5. Add comprehensive tests
6. Update this documentation

## Related Documentation

- [APEX Workflow Guide](./WORKFLOW.md)
- [Pattern Management](./PATTERNS.md)
- [MCP Integration](./MCP_INTEGRATION.md)
- [Database Schema](./DATABASE.md)
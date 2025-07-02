# Todo App - APEX Example

This example demonstrates how to use APEX Intelligence to build a simple todo application.

## Project Structure

```
todo-app/
├── .apex/                 # APEX Intelligence configuration
├── src/
│   ├── index.js          # Main application
│   ├── todos.js          # Todo management
│   └── storage.js        # Data persistence
├── tests/
│   └── todos.test.js     # Tests
└── package.json
```

## APEX Workflow Example

### 1. Initialize APEX

```bash
cd todo-app
apex init
```

### 2. Create a Milestone

In your AI assistant:
```
/apex plan.milestone "Build Todo App MVP"
```

### 3. Create Tasks

```
/apex plan.task "Implement todo CRUD operations"
/apex plan.task "Add persistent storage"
/apex plan.task "Create CLI interface"
```

### 4. Execute Tasks with APEX Intelligence

```
/apex execute.task T001
```

APEX will:
- Analyze the task complexity
- Find relevant patterns
- Check for potential failures
- Guide through the 5-phase execution

### 5. Example Pattern Discovery

After implementing several todos, APEX might discover:

```javascript
[PAT:STORAGE:JSON] ★★★★☆ (12 uses, 92% success) @storage @json @file
// Safe JSON file operations with error handling
const loadData = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return defaultData;
    throw error;
  }
};
```

### 6. Failure Prevention

APEX learns from mistakes:
```json
{
  "error_type": "SyntaxError",
  "error_pattern": "Unexpected token in JSON",
  "prevention": "Always validate JSON before parsing",
  "fix_applied": "Added try-catch with validation"
}
```

## Key APEX Features Demonstrated

1. **Pattern Recognition**: Discovers and reuses successful code patterns
2. **Failure Learning**: Prevents repeated mistakes
3. **Complexity Analysis**: Adapts approach based on task difficulty
4. **Phased Execution**: Structured workflow from design to documentation
5. **Continuous Improvement**: Gets smarter with each task

## Running the Example

```bash
# Install dependencies
npm install

# Run the app
npm start

# Run tests
npm test
```

## Patterns Discovered

Check `.apex/CONVENTIONS.md` to see patterns APEX discovered while building this app:
- JSON storage patterns
- Error handling patterns
- CLI interaction patterns
- Test patterns

## Next Steps

1. Try adding a new feature using APEX
2. Watch how patterns are discovered and promoted
3. See how failures are prevented
4. Experience the intelligence growing over time
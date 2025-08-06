---
id: T064
status: open
sprint: current
complexity: 6
parent_task: T063
created: 2025-08-06
updated: 2025-08-06
---

# Follow-up: Fix Database Instance Management Architecture

## Context
This task addresses the database instance management architecture issue discovered in T063:
- Multiple database instances created across test architecture causing initialization conflicts
- New error: "The 'paths[0]' argument must be of type string. Received undefined"
- Test setup creates PatternDatabase, PatternRepository creates another, ReflectionService creates yet another
- Multiple connections to same/different database files causing path operation errors

## Problem Statement
While T063 successfully resolved the primary parameter type issue, it revealed a deeper architectural problem with database instance management in the test environment. The current architecture creates multiple database instances across different services, leading to connection conflicts and initialization issues.

## Root Cause Analysis
The test architecture has poor separation of database instance management:

1. **Test Setup**: Creates `PatternDatabase` and runs migrations
2. **PatternRepository**: Creates its own `PatternDatabase` instance
3. **ReflectionService**: Creates another `Database` instance
4. **Multiple Connections**: Each service connects independently to database files
5. **Path Conflicts**: Undefined paths passed between service constructors

## Acceptance Criteria
- [ ] Refactor architecture to use shared database connections across services
- [ ] Eliminate multiple database instance creation in test environment
- [ ] Ensure all 4 pattern auto-creation integration tests pass
- [ ] Maintain clean separation of concerns between services
- [ ] Add proper database connection management patterns
- [ ] Document database instance sharing best practices

## Technical Approach
1. Implement dependency injection for database connections
2. Create single database instance per test that's shared across all services
3. Refactor service constructors to accept database instances rather than creating their own
4. Add proper connection lifecycle management
5. Update test setup to provide consistent database instance to all services
6. Validate connection sharing doesn't break existing functionality

## Files Likely to be Modified
- `tests/mcp/tools/reflect.integration.test.ts` - Update test setup for shared database instance
- `src/storage/repositories/pattern-repository.ts` - Accept database instance in constructor
- `src/mcp/tools/reflect.ts` - Use injected database instance
- `src/reflection/pattern-inserter.ts` - Accept database instance instead of creating own
- Service initialization patterns across the codebase

## Dependencies
- T063 must be completed (parameter type fix)
- Integration test structure from T061 (separate test files)
- Understanding of current database connection patterns

## Estimated Effort
- 3 hours (complexity rating: 6/10)
- High risk - architectural changes can have widespread impact
- Requires careful refactoring to maintain existing functionality

## Success Metrics
- All 4 pattern auto-creation integration tests pass: `tests/mcp/tools/reflect.integration.test.ts`
- No "paths[0] argument must be of type string" errors
- Clean database connection sharing across all services
- Zero regression in existing database functionality
- Improved test isolation and reliability

## Related Patterns to Apply
- **PAT:DI:CONSTRUCTOR** - Dependency injection for database instances
- **PAT:TEST:ISOLATION** - Isolated test databases with shared connections
- **FIX:DB:SHARED_CONNECTION** - Share database connections to prevent locking
- **PAT:ARCHITECTURE:SERVICE_PATTERN** - Clean service layer with proper dependency management

## Architecture Strategy
The solution should implement proper dependency injection:

```typescript
// ❌ CURRENT - multiple database instances
class PatternRepository {
  constructor(options: { dbPath?: string }) {
    this.db = new PatternDatabase(options.dbPath); // Creates own instance
  }
}

class ReflectionService {
  constructor() {
    this.db = new Database('path'); // Creates another instance
  }
}

// ✅ TARGET - shared database instance
class PatternRepository {
  constructor(database: Database) {
    this.db = database; // Injected shared instance
  }
}

class ReflectionService {
  constructor(database: Database, patternRepository: PatternRepository) {
    this.db = database; // Same shared instance
    this.patternRepository = patternRepository;
  }
}
```

## Integration Test Architecture
The test setup should create one database instance and inject it into all services:

```typescript
beforeEach(() => {
  // Create single database instance
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-test-'));
  dbPath = path.join(tempDir, 'test.db');
  db = new Database(dbPath);
  runMigrations(db);
  
  // Inject shared database into all services
  patternRepository = new PatternRepository(db);
  reflectionService = new ReflectionService(db, patternRepository);
});
```

## Risk Assessment
- **High Impact**: Changes to core service constructors affect many parts of system
- **Database Connections**: Must ensure no connection leaks or locking issues
- **Backward Compatibility**: Existing service initialization must continue to work
- **Test Isolation**: Shared connections must not cause test contamination

## Success Definition
This task is complete when:
1. All 4 integration tests pass without path operation errors
2. Single database instance is properly shared across all services in tests
3. Production code maintains backward compatibility
4. No regression in existing pattern functionality
5. Clean architecture with proper dependency injection established
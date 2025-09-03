# Universal SQLite Migration - Making APEX "Just Work" Everywhere

## Executive Summary

**Goal**: Enable `npx @benredmond/apex` to work on ANY Node.js version (14+) and platform without compilation issues.

**Problem**: Current better-sqlite3 dependency causes NODE_MODULE_VERSION mismatches when users have different Node versions.

**Solution**: Implement a three-tier database adapter system with automatic fallback to WebAssembly SQLite.

## Current Issues

### Primary Problem
- **Error**: `NODE_MODULE_VERSION 137 vs 115` mismatch
- **Cause**: better-sqlite3 is a native module compiled for specific Node.js versions
- **Impact**: Users can't run `npx @benredmond/apex` unless their Node version exactly matches the build

### Secondary Issues
- Large package size (66.8MB unpacked)
- Binary distribution complexity
- Platform-specific compilation requirements
- Corporate environment restrictions on native modules

## Proposed Solution: Three-Tier Database System

### Architecture
```
┌─────────────────────────────────────┐
│     DatabaseAdapterFactory          │
├─────────────────────────────────────┤
│ 1. Try node:sqlite (Node 22+)      │ ← Future-proof, built-in
│    ↓ (if unavailable)              │
│ 2. Try better-sqlite3               │ ← High performance 
│    ↓ (if fails)                    │
│ 3. Use sql.js (WASM)               │ ← Universal fallback
└─────────────────────────────────────┘
```

### Tier Details

#### Tier 1: node:sqlite (Native, Built-in)
- **Available**: Node.js 22+
- **Performance**: 95-100% of baseline
- **Pros**: No dependencies, native speed, future-proof
- **Cons**: Limited to newer Node versions
- **Implementation**: Already complete (`NodeSqliteAdapter`)

#### Tier 2: better-sqlite3 (Native Module)
- **Available**: When compilation succeeds
- **Performance**: 100% baseline (fastest)
- **Pros**: Mature, feature-rich, excellent performance
- **Cons**: Compilation issues, version mismatches
- **Implementation**: Already complete (`BetterSqliteAdapter`)

#### Tier 3: sql.js (WebAssembly)
- **Available**: ALWAYS (Node 14+)
- **Performance**: 30-70% of baseline
- **Pros**: Universal compatibility, no compilation, smaller size
- **Cons**: Slower performance, higher memory usage
- **Implementation**: TO BE CREATED (`WasmSqliteAdapter`)

## Implementation Plan

### Phase 1: Package Configuration ✅
```json
// package.json changes
{
  "optionalDependencies": {
    "better-sqlite3": "^11.3.0"  // Try to install but don't fail
  },
  "dependencies": {
    "sql.js": "^1.10.3"  // Always available fallback
  }
}
```

### Phase 2: Create WasmSqliteAdapter 🚧
```typescript
// src/storage/adapters/wasm-sqlite-impl.ts
import initSqlJs from 'sql.js';

export class WasmSqliteAdapter implements DatabaseAdapter {
  private SQL: any;
  private db: any;
  
  constructor(dbPath: string) {
    // Initialize WASM SQLite
    this.SQL = await initSqlJs({
      locateFile: file => `node_modules/sql.js/dist/${file}`
    });
    
    // Load existing database or create new
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }
  }
  
  // Implement DatabaseAdapter interface
  prepare(sql: string): Statement { ... }
  exec(sql: string): void { ... }
  transaction(fn: Function): Function { ... }
  close(): void { ... }
}
```

### Phase 3: Update DatabaseAdapterFactory 🚧
```typescript
export class DatabaseAdapterFactory {
  static async create(dbPath: string): Promise<DatabaseAdapter> {
    const errors: string[] = [];
    
    // Tier 1: Try node:sqlite (Node 22+)
    if (this.hasNodeSqlite()) {
      try {
        const { NodeSqliteAdapter } = await import('./adapters/node-sqlite-impl.js');
        console.log('Using node:sqlite (built-in)');
        return new NodeSqliteAdapter(dbPath);
      } catch (error) {
        errors.push(`node:sqlite: ${error.message}`);
      }
    }
    
    // Tier 2: Try better-sqlite3 (if available)
    if (this.hasBetterSqlite()) {
      try {
        const { BetterSqliteAdapter } = await import('./adapters/better-sqlite-impl.js');
        console.log('Using better-sqlite3 (native)');
        return new BetterSqliteAdapter(dbPath);
      } catch (error) {
        errors.push(`better-sqlite3: ${error.message}`);
      }
    }
    
    // Tier 3: Universal WASM fallback
    try {
      const { WasmSqliteAdapter } = await import('./adapters/wasm-sqlite-impl.js');
      console.log('Using sql.js (WebAssembly) - universal compatibility mode');
      return new WasmSqliteAdapter(dbPath);
    } catch (error) {
      throw new Error(
        `All database adapters failed:\n${errors.join('\n')}\nWASM: ${error.message}`
      );
    }
  }
  
  private static hasNodeSqlite(): boolean {
    const majorVersion = parseInt(process.versions.node.split('.')[0]);
    return majorVersion >= 22;
  }
  
  private static hasBetterSqlite(): boolean {
    try {
      require.resolve('better-sqlite3');
      return true;
    } catch {
      return false;
    }
  }
}
```

### Phase 4: Testing Matrix ⏳

| Node Version | Platform | Expected Adapter | Status |
|-------------|----------|------------------|---------|
| 14.x | Linux | sql.js | ⏳ |
| 16.x | macOS | sql.js or better-sqlite3 | ⏳ |
| 18.x | Windows | sql.js or better-sqlite3 | ⏳ |
| 20.x | Linux | sql.js or better-sqlite3 | ⏳ |
| 22.x | macOS | node:sqlite | ⏳ |
| 22.x | Windows | node:sqlite | ⏳ |

### Phase 5: Binary Strategy Update ⏳
- Keep pkg compilation for power users who want maximum performance
- Remove binaries from npm package to reduce size
- Document how to build locally for performance

## Performance Impact Analysis

### APEX Database Usage Patterns
- **Pattern lookups**: Read-heavy, indexed queries
- **Trust score updates**: Light writes, infrequent
- **Search operations**: FTS queries, read-heavy
- **Batch imports**: Write-heavy but rare

### Expected Performance
| Operation | better-sqlite3 | node:sqlite | sql.js |
|-----------|---------------|-------------|---------|
| Pattern lookup | 1ms | 1ms | 2-3ms |
| Trust update | 2ms | 2ms | 5-10ms |
| Search (FTS) | 5ms | 5ms | 10-20ms |
| Batch import (1000) | 100ms | 110ms | 300-500ms |

**Conclusion**: For APEX's use case, WASM performance is acceptable. Most operations remain sub-100ms.

## Bundle Size Impact

### Current State
```
better-sqlite3: 25MB
binaries/: 65.4MB
Total package: 66.8MB unpacked
```

### After Migration
```
sql.js: 1.2MB
better-sqlite3: (optional, may not install)
binaries/: (removed from npm)
Total package: ~5MB unpacked
```

**93% reduction in package size!**

## Risk Mitigation

### Risk 1: WASM Performance Issues
- **Mitigation**: Log adapter selection, allow env var override
- **Fallback**: Document how to force better-sqlite3

### Risk 2: Database Compatibility
- **Mitigation**: All adapters use identical SQLite operations
- **Testing**: Extensive migration testing between adapters

### Risk 3: Memory Usage
- **Mitigation**: Implement connection pooling for WASM
- **Monitoring**: Add memory usage telemetry

### Risk 4: Corporate Restrictions
- **Mitigation**: WASM requires no special permissions
- **Benefit**: Actually improves corporate compatibility

## Success Metrics

- [ ] `npx @benredmond/apex` works on Node 14+
- [ ] `npx @benredmond/apex` works on Node 16
- [ ] `npx @benredmond/apex` works on Node 18
- [ ] `npx @benredmond/apex` works on Node 20
- [ ] `npx @benredmond/apex` works on Node 22+
- [ ] No compilation errors in any environment
- [ ] Package size < 10MB
- [ ] Pattern lookup latency < 10ms (90th percentile)
- [ ] Zero native dependency errors

## Migration Steps for Users

### Automatic (Most Users)
```bash
# Just works - no changes needed
npx @benredmond/apex start
```

### Performance Mode (Power Users)
```bash
# Install with native module
npm install -g @benredmond/apex
export APEX_PREFER_NATIVE=1
apex start
```

### Node 22+ Users
```bash
# Automatically uses built-in node:sqlite
npx @benredmond/apex start
```

## Timeline

- **Week 1**: Implement WasmSqliteAdapter
- **Week 1**: Update DatabaseAdapterFactory
- **Week 1**: Testing across Node versions
- **Week 2**: Performance optimization
- **Week 2**: Documentation updates
- **Week 2**: Release v1.0.0

## Alternative Approaches Considered

### ❌ Post-install Compilation
- Requires build tools on user machines
- Fails in CI/CD environments
- Poor user experience

### ❌ Multiple Packages (@apex/native, @apex/wasm)
- Splits ecosystem
- Confusing for users
- Maintenance overhead

### ❌ Runtime Binary Download
- Security concerns
- Firewall issues
- Network dependency

### ❌ Wait for better-sqlite3 Node-API
- No timeline available
- Blocks current users
- May never happen

### ✅ Three-Tier Fallback (Chosen)
- Best user experience
- Progressive enhancement
- Future-proof

## Testing Checklist

### Functionality Tests
- [ ] All adapters pass same test suite
- [ ] Database migrations work across adapters
- [ ] FTS (full-text search) works in all adapters
- [ ] Transaction handling correct in all adapters
- [ ] Concurrent access handled properly

### Compatibility Tests
- [ ] Node 14.x + npm
- [ ] Node 16.x + npm
- [ ] Node 18.x + npm
- [ ] Node 20.x + npm
- [ ] Node 22.x + npm
- [ ] Alpine Linux (musl)
- [ ] Windows 10/11
- [ ] macOS Intel
- [ ] macOS Apple Silicon
- [ ] Docker containers
- [ ] GitHub Actions CI
- [ ] Corporate proxies

### Performance Tests
- [ ] Pattern lookup < 10ms
- [ ] Search < 50ms
- [ ] Batch import < 1s for 1000 patterns
- [ ] Memory usage < 100MB
- [ ] Startup time < 500ms

## Documentation Updates Needed

1. **README.md**
   - Remove compilation prerequisites
   - Add "works everywhere" messaging
   - Document performance mode for power users

2. **Installation Guide**
   - Simplify to just `npx @benredmond/apex`
   - Remove troubleshooting section for native modules
   - Add adapter selection explanation

3. **Performance Guide**
   - Explain three-tier system
   - Show how to force specific adapter
   - Benchmark comparisons

## Code Changes Summary

### Files to Create
- `src/storage/adapters/wasm-sqlite-impl.ts` - New WASM adapter
- `tests/adapters/wasm-sqlite.test.ts` - WASM adapter tests

### Files to Modify
- `package.json` - Make better-sqlite3 optional, add sql.js
- `src/storage/database-adapter.ts` - Update factory with three-tier logic
- `scripts/build-pkg.js` - Update for optional better-sqlite3
- `scripts/build-sea.js` - Update for optional better-sqlite3

### Files to Remove
- `binaries/*` from npm package (keep in repo for direct downloads)

## Current Status: 🚧 In Progress

### Completed ✅
- [x] Problem analysis
- [x] Solution design
- [x] Systems review by subagent
- [x] Implementation plan
- [x] Install sql.js (Phase 1 - DONE)
- [x] Update package.json (Phase 1 - DONE)
- [x] Move better-sqlite3 to optionalDependencies (Phase 1 - DONE)
- [x] Fix static imports in better-sqlite-impl.ts (Phase 1 - DONE)
- [x] Implement async factory pattern for BetterSqliteAdapter (Phase 1 - DONE)

### In Progress 🚧
- [ ] Create WasmSqliteAdapter (Phase 2 - NEXT)
- [ ] Update DatabaseAdapterFactory for 3-tier system (Phase 2)
- [ ] Fix remaining static imports in other files (Phase 3)

### Pending ⏳
- [ ] Cross-version testing
- [ ] Performance benchmarks
- [ ] Documentation updates
- [ ] Release preparation

## ⚠️ CRITICAL LEARNINGS FROM PHASE 1

### Discovery: Static Imports Break Optional Dependencies
**Issue Found**: Making better-sqlite3 optional in package.json is NOT sufficient. Static imports like `import Database from "better-sqlite3"` will crash at runtime even when the dependency is marked as optional.

**Solution Applied**:
1. Convert all static imports to dynamic imports with try/catch
2. Use async factory pattern for adapters
3. Handle import errors gracefully with clear messaging

**Files That Still Need Fixing** (found via grep):
- `/src/storage/database.ts` - ✅ FIXED
- `/src/storage/adapters/better-sqlite-impl.ts` - ✅ FIXED  
- `/src/reflection/storage.ts` - ⚠️ NEEDS FIX
- `/src/reflection/pattern-inserter.ts` - ⚠️ NEEDS FIX
- `/src/extractors/book-extractor.ts` - ⚠️ NEEDS FIX
- `/src/migrations/auto-migrator.ts` - ⚠️ NEEDS FIX
- `/src/migrations/MigrationRunner.ts` - ⚠️ NEEDS FIX
- Multiple migration files - ⚠️ NEEDS FIX
- Multiple test files - ⚠️ NEEDS FIX

**Pattern to Apply**:
```typescript
// OLD - WILL CRASH
import Database from "better-sqlite3";

// NEW - HANDLES MISSING OPTIONAL
let Database: any;
try {
  Database = (await import("better-sqlite3")).default;
} catch (error) {
  // Handle missing optional dependency
  throw new Error("better-sqlite3 not available, use fallback");
}
```

## Implementation Tickets

### 🎫 Ticket #1: Update Package Dependencies
**Priority**: P0 - Critical
**Estimated Time**: 30 minutes
**Status**: ✅ COMPLETED (2025-09-03)

#### Description
Update package.json to make better-sqlite3 optional and add sql.js as a required dependency.

#### Acceptance Criteria
- [x] better-sqlite3 moved to optionalDependencies
- [x] sql.js added to dependencies
- [x] Package installs without errors on Node 14+
- [x] Package installs without compilation tools

#### Implementation Steps
1. Edit package.json:
   ```json
   "optionalDependencies": {
     "better-sqlite3": "^11.3.0"
   },
   "dependencies": {
     "sql.js": "^1.10.3"
   }
   ```
2. Run `npm install` to test
3. Delete node_modules and test clean install
4. Test with `npm install --no-optional` to simulate failed better-sqlite3

#### Testing
```bash
# Test on different Node versions
nvm use 14 && npm install
nvm use 16 && npm install
nvm use 20 && npm install
nvm use 22 && npm install
```

---

### 🎫 Ticket #2: Create WasmSqliteAdapter
**Priority**: P0 - Critical
**Estimated Time**: 4 hours
**Status**: 🚧 IN PROGRESS - NEXT UP
**Dependencies**: Ticket #1 ✅ COMPLETED

#### Description
Implement a new DatabaseAdapter using sql.js (WebAssembly SQLite) that matches the existing adapter interface.

#### Acceptance Criteria
- [ ] Implements all DatabaseAdapter interface methods
- [ ] Handles database persistence to disk
- [ ] Supports transactions
- [ ] Supports prepared statements
- [ ] Passes all existing database tests
- [ ] Handles concurrent access safely

#### Implementation Steps
1. Create `src/storage/adapters/wasm-sqlite-impl.ts`
2. Implement core structure:
   ```typescript
   import initSqlJs from 'sql.js';
   import fs from 'fs-extra';
   import type { DatabaseAdapter, Statement } from '../database-adapter.js';
   
   export class WasmSqliteAdapter implements DatabaseAdapter {
     private SQL: any;
     private db: any;
     private dbPath: string;
     private saveTimeout: NodeJS.Timeout | null = null;
   }
   ```
3. Implement initialization with auto-save:
   ```typescript
   async initialize(dbPath: string): Promise<void> {
     this.dbPath = dbPath;
     this.SQL = await initSqlJs({
       locateFile: file => `node_modules/sql.js/dist/${file}`
     });
     
     if (await fs.pathExists(dbPath)) {
       const buffer = await fs.readFile(dbPath);
       this.db = new this.SQL.Database(buffer);
     } else {
       this.db = new this.SQL.Database();
       this.saveToFile(); // Create file immediately
     }
   }
   ```
4. Implement auto-save mechanism:
   ```typescript
   private scheduleSave(): void {
     if (this.saveTimeout) clearTimeout(this.saveTimeout);
     this.saveTimeout = setTimeout(() => this.saveToFile(), 100);
   }
   
   private async saveToFile(): Promise<void> {
     const data = this.db.export();
     await fs.writeFile(this.dbPath, Buffer.from(data));
   }
   ```
5. Implement Statement wrapper class
6. Implement transaction support
7. Add proper error handling

#### Key Methods to Implement
- `prepare(sql: string): Statement`
- `exec(sql: string): void`
- `pragma(pragma: string): any`
- `transaction(fn: Function): Function`
- `close(): void`
- `isNodeSqlite(): boolean` (return false)
- `getInstance(): any`

#### Testing
```typescript
// Create test file: tests/adapters/wasm-sqlite-adapter.test.ts
describe('WasmSqliteAdapter', () => {
  test('creates database file', async () => {});
  test('persists data between connections', async () => {});
  test('handles prepared statements', async () => {});
  test('supports transactions', async () => {});
  test('handles concurrent operations', async () => {});
});
```

---

### 🎫 Ticket #3: Create WasmSqliteAdapter Factory Method
**Priority**: P0 - Critical  
**Estimated Time**: 1 hour
**Status**: ⏳ Pending
**Dependencies**: Ticket #2

#### Description
Add static factory method to WasmSqliteAdapter for async initialization pattern.

#### Acceptance Criteria
- [ ] Static create() method that returns Promise<WasmSqliteAdapter>
- [ ] Handles initialization errors gracefully
- [ ] Matches pattern of other adapters

#### Implementation Steps
```typescript
export class WasmSqliteAdapter implements DatabaseAdapter {
  static async create(dbPath: string): Promise<WasmSqliteAdapter> {
    const adapter = new WasmSqliteAdapter();
    await adapter.initialize(dbPath);
    return adapter;
  }
  
  private async initialize(dbPath: string): Promise<void> {
    // Initialization logic from Ticket #2
  }
}
```

---

### 🎫 Ticket #4: Update DatabaseAdapterFactory
**Priority**: P0 - Critical
**Estimated Time**: 2 hours
**Status**: ⏳ Pending
**Dependencies**: Ticket #3

#### Description
Update the DatabaseAdapterFactory to implement the three-tier fallback system with improved detection logic.

#### Acceptance Criteria
- [ ] Checks for node:sqlite availability (Node 22+)
- [ ] Checks for better-sqlite3 availability
- [ ] Falls back to sql.js (always works)
- [ ] Logs which adapter is being used
- [ ] Handles all failure cases gracefully
- [ ] Performance logging for adapter selection

#### Implementation Steps
1. Update `src/storage/database-adapter.ts`
2. Add detection methods:
   ```typescript
   private static hasNodeSqlite(): boolean {
     const majorVersion = parseInt(process.versions.node.split('.')[0]);
     return majorVersion >= 22;
   }
   
   private static async canLoadBetterSqlite(): Promise<boolean> {
     try {
       await import('better-sqlite3');
       return true;
     } catch {
       return false;
     }
   }
   ```
3. Implement three-tier logic with timing:
   ```typescript
   static async create(dbPath: string): Promise<DatabaseAdapter> {
     const startTime = Date.now();
     const errors: string[] = [];
     
     // Log selection process
     if (process.env.APEX_DEBUG) {
       console.log('Selecting database adapter...');
     }
     
     // Tier 1: node:sqlite
     if (this.hasNodeSqlite()) {
       try {
         const { NodeSqliteAdapter } = await import('./adapters/node-sqlite-impl.js');
         console.log(`Using node:sqlite (${Date.now() - startTime}ms)`);
         return new NodeSqliteAdapter(dbPath);
       } catch (error) {
         errors.push(`node:sqlite: ${error.message}`);
       }
     }
     
     // Continue for other tiers...
   }
   ```
4. Add environment variable override:
   ```typescript
   // Allow forcing specific adapter
   if (process.env.APEX_FORCE_ADAPTER) {
     switch (process.env.APEX_FORCE_ADAPTER) {
       case 'node-sqlite': // ...
       case 'better-sqlite3': // ...
       case 'wasm': // ...
     }
   }
   ```

#### Testing
```bash
# Test each tier
APEX_FORCE_ADAPTER=wasm npm test
APEX_FORCE_ADAPTER=better-sqlite3 npm test
APEX_FORCE_ADAPTER=node-sqlite npm test
```

---

### 🎫 Ticket #5: Add Adapter Compatibility Tests
**Priority**: P1 - High
**Estimated Time**: 3 hours
**Status**: ⏳ Pending
**Dependencies**: Ticket #4

#### Description
Create comprehensive test suite that runs the same tests against all three adapters to ensure compatibility.

#### Acceptance Criteria
- [ ] Test suite runs against all adapters
- [ ] Tests cover all DatabaseAdapter methods
- [ ] Tests verify identical behavior across adapters
- [ ] Tests measure performance differences
- [ ] Migration tests between adapters

#### Implementation Steps
1. Create `tests/adapters/adapter-compatibility.test.ts`
2. Create test matrix:
   ```typescript
   const adapters = [
     { name: 'node-sqlite', available: hasNodeSqlite() },
     { name: 'better-sqlite3', available: await canLoadBetterSqlite() },
     { name: 'wasm', available: true }
   ];
   
   describe.each(adapters.filter(a => a.available))(
     'DatabaseAdapter Compatibility - $name',
     ({ name }) => {
       let adapter: DatabaseAdapter;
       
       beforeEach(async () => {
         process.env.APEX_FORCE_ADAPTER = name;
         adapter = await DatabaseAdapterFactory.create(':memory:');
       });
       
       test('creates tables', () => {});
       test('inserts data', () => {});
       test('queries data', () => {});
       test('handles transactions', () => {});
       test('supports FTS', () => {});
     }
   );
   ```
3. Add performance comparison tests
4. Add migration tests (data created by one adapter readable by another)

---

### 🎫 Ticket #6: Remove Binaries from NPM Package
**Priority**: P1 - High
**Estimated Time**: 1 hour
**Status**: ⏳ Pending
**Dependencies**: None

#### Description
Update .npmignore to exclude binaries from the published package while keeping them in the repository.

#### Acceptance Criteria
- [ ] Binaries excluded from npm package
- [ ] Binaries still in git repository
- [ ] Package size reduced by ~65MB
- [ ] Build scripts still work locally

#### Implementation Steps
1. Create/update `.npmignore`:
   ```
   # Exclude binaries from npm package
   binaries/
   
   # Exclude build scripts not needed by users
   scripts/build-sea.js
   scripts/build-pkg.js
   
   # Exclude test files
   tests/
   *.test.ts
   *.test.js
   
   # Exclude docs and development files
   *.md
   !README.md
   .github/
   ```
2. Test with `npm pack --dry-run`
3. Verify package contents
4. Check final package size

---

### 🎫 Ticket #7: Cross-Node Version Testing
**Priority**: P1 - High
**Estimated Time**: 2 hours
**Status**: ⏳ Pending
**Dependencies**: Tickets #1-4

#### Description
Test the package installation and execution across all major Node.js versions.

#### Acceptance Criteria
- [ ] Works on Node 14.x
- [ ] Works on Node 16.x
- [ ] Works on Node 18.x
- [ ] Works on Node 20.x
- [ ] Works on Node 22.x
- [ ] No compilation errors
- [ ] Correct adapter selected for each version

#### Implementation Steps
1. Create test script `scripts/test-node-versions.sh`:
   ```bash
   #!/bin/bash
   for version in 14 16 18 20 22; do
     echo "Testing Node $version"
     nvm use $version
     rm -rf node_modules package-lock.json
     npm install
     npm test
     npx . --version
   done
   ```
2. Test on different platforms (use CI matrix)
3. Document results in compatibility matrix

---

### 🎫 Ticket #8: Performance Benchmarking
**Priority**: P2 - Medium
**Estimated Time**: 2 hours
**Status**: ⏳ Pending
**Dependencies**: Tickets #1-5

#### Description
Create benchmark suite to measure performance differences between adapters.

#### Acceptance Criteria
- [ ] Benchmarks for common operations
- [ ] Results documented
- [ ] Performance regression detection
- [ ] Memory usage tracking

#### Implementation Steps
1. Create `benchmarks/adapter-performance.js`
2. Implement benchmarks:
   ```javascript
   const operations = [
     { name: 'Insert 1000 patterns', fn: insertPatterns },
     { name: 'Query by ID', fn: queryById },
     { name: 'Full-text search', fn: searchPatterns },
     { name: 'Update trust scores', fn: updateTrust },
     { name: 'Transaction with 100 ops', fn: batchTransaction }
   ];
   ```
3. Run against each adapter
4. Generate comparison report
5. Add to CI for regression detection

---

### 🎫 Ticket #9: Update Documentation
**Priority**: P2 - Medium
**Estimated Time**: 2 hours
**Status**: ⏳ Pending
**Dependencies**: All implementation tickets

#### Description
Update all documentation to reflect the new universal compatibility.

#### Acceptance Criteria
- [ ] README.md updated
- [ ] Installation guide simplified
- [ ] Troubleshooting section updated
- [ ] Performance guide added
- [ ] Migration guide for existing users

#### Implementation Steps
1. Update README.md:
   - Remove compilation prerequisites
   - Add "works everywhere" badge
   - Simplify installation to just `npx @benredmond/apex`
2. Create PERFORMANCE.md:
   - Explain three-tier system
   - Show benchmark results
   - Document optimization options
3. Update TROUBLESHOOTING.md:
   - Remove native module sections
   - Add adapter selection debugging
4. Add to CHANGELOG.md

---

### 🎫 Ticket #10: Add Telemetry for Adapter Usage
**Priority**: P3 - Low
**Estimated Time**: 2 hours
**Status**: ⏳ Pending
**Dependencies**: Ticket #4

#### Description
Add anonymous telemetry to understand which adapters are being used in the wild.

#### Acceptance Criteria
- [ ] Optional telemetry (off by default)
- [ ] Records adapter selection
- [ ] Records performance metrics
- [ ] Respects DO_NOT_TRACK
- [ ] Clear privacy policy

#### Implementation Steps
1. Add telemetry collection:
   ```typescript
   if (process.env.APEX_TELEMETRY !== 'false' && !process.env.DO_NOT_TRACK) {
     logTelemetry({
       adapter: adapterName,
       nodeVersion: process.version,
       platform: process.platform,
       selectionTime: Date.now() - startTime
     });
   }
   ```
2. Implement privacy-preserving collection
3. Add opt-out documentation

---

### 🎫 Ticket #11: Create Migration Tool
**Priority**: P3 - Low
**Estimated Time**: 3 hours
**Status**: ⏳ Pending
**Dependencies**: Tickets #1-5

#### Description
Create tool to migrate databases between different adapter formats if needed.

#### Acceptance Criteria
- [ ] Can export from any adapter
- [ ] Can import to any adapter
- [ ] Preserves all data
- [ ] Handles large databases
- [ ] Progress reporting

#### Implementation Steps
1. Create `scripts/migrate-database.js`
2. Implement export/import logic
3. Add streaming for large databases
4. Add verification step
5. Document usage

---

### 🎫 Ticket #12: Release Preparation
**Priority**: P1 - High
**Estimated Time**: 2 hours
**Status**: ⏳ Pending
**Dependencies**: All tickets

#### Description
Prepare for v1.0.0 release with universal compatibility.

#### Acceptance Criteria
- [ ] All tests passing
- [ ] Documentation complete
- [ ] CHANGELOG updated
- [ ] Package.json version bumped
- [ ] GitHub release drafted
- [ ] npm publish --dry-run successful

#### Implementation Steps
1. Run full test suite
2. Update version in package.json
3. Write release notes
4. Create git tag
5. Publish to npm
6. Create GitHub release
7. Announce on social media

---

## Ticket Summary

| Priority | Count | Status |
|----------|-------|--------|
| P0 - Critical | 4 | 1 ✅ Completed, 3 ⏳ Pending |
| P1 - High | 4 | ⏳ Pending |
| P2 - Medium | 2 | ⏳ Pending |
| P3 - Low | 2 | ⏳ Pending |
| **Total** | **12** | **1 Completed, 11 Pending** |

## Implementation Order

1. **Phase 1 - Core Implementation** (P0 tickets)
   - Ticket #1: Update Package Dependencies ✅ COMPLETED
   - Ticket #2: Create WasmSqliteAdapter 🚧 IN PROGRESS
   - Ticket #3: Create Factory Method ⏳ Pending
   - Ticket #4: Update DatabaseAdapterFactory ⏳ Pending

2. **Phase 1.5 - Fix Static Imports** (NEW - CRITICAL)
   - Fix remaining static imports in all files ⚠️ REQUIRED
   - Convert to dynamic imports with error handling
   - Test without better-sqlite3 to verify

3. **Phase 2 - Testing & Validation** (P1 tickets)
   - Ticket #5: Adapter Compatibility Tests ⏳ Pending
   - Ticket #6: Remove Binaries from NPM ⏳ Pending
   - Ticket #7: Cross-Node Version Testing ⏳ Pending
   - Ticket #12: Release Preparation ⏳ Pending

4. **Phase 3 - Polish & Documentation** (P2-P3 tickets)
   - Ticket #8: Performance Benchmarking ⏳ Pending
   - Ticket #9: Update Documentation ⏳ Pending
   - Ticket #10: Add Telemetry ⏳ Pending
   - Ticket #11: Create Migration Tool ⏳ Pending

## Notes

- The dual database approach (node:sqlite vs better-sqlite3) was the right idea but incomplete
- WASM provides the universal fallback that makes it truly "just work"
- 93% package size reduction is a huge win
- Performance hit is acceptable for APEX's use case
- This positions APEX for widespread adoption

## References

- [sql.js Documentation](https://github.com/sql-js/sql.js)
- [better-sqlite3 Issues](https://github.com/WiseLibs/better-sqlite3/issues)
- [Node.js sqlite Documentation](https://nodejs.org/api/sqlite.html)
- [WebAssembly SQLite Performance](https://sqlite.org/wasm/doc/trunk/about.md)
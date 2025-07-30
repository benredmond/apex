# Pending Conventions

These patterns are being tested and will be promoted to CONVENTIONS.md after 3+ successful uses with >80% success rate.

## [FIX:SQLITE:SYNC] - Better-SQLite3 Synchronous Transactions ★☆☆☆☆ (1 use, 100% success)

**Problem**: Transaction function cannot return a promise error with better-sqlite3

**Solution**: Ensure all transaction functions are synchronous
```javascript
// ❌ WRONG - async function returns promise
const result = await db.transaction(async () => {
  await someOperation();
});

// ✅ CORRECT - synchronous function
const result = db.transaction(() => {
  someOperation(); // must be sync
});
```

**Pattern**:
1. Remove `async` keyword from transaction function
2. Remove all `await` keywords inside transaction
3. Ensure all called methods are synchronous
4. Move async operations outside transaction if needed

**Evidence**: 
- Fixed in src/mcp/tools/reflect.ts (commit pending)
- Similar pattern used throughout storage layer

**Trust**: 1 use, 100% success rate
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

**Trust**: 2 uses, 100% success rate

## [PAT:ARCHITECTURE:SERVICE_PATTERN] - Clean Service Layer Architecture ★☆☆☆☆ (1 use, 100% success)

**Problem**: Implementing clean separation between MCP handlers and business logic

**Solution**: Use dedicated service layer with clear interfaces
```javascript
// ❌ WRONG - business logic in MCP handler
export const mcpTool = {
  name: "tool",
  handler: async (args) => {
    // Complex business logic mixed with MCP concerns
    const data = await database.query(...);
    const processed = complexProcessing(data);
    return { result: processed };
  }
};

// ✅ CORRECT - service layer separation
// service/pattern-service.js
export class PatternService {
  async explainPattern(patternId) {
    // Pure business logic
    return this.processPattern(patternId);
  }
}

// mcp/tools/explain.js
export const explainTool = {
  name: "apex.patterns.explain",
  handler: async (args) => {
    // MCP-specific concerns only
    const service = new PatternService();
    return await service.explainPattern(args.pattern_id);
  }
};
```

**Pattern**:
1. Create dedicated service classes for business logic
2. Keep MCP handlers thin - only handle protocol concerns
3. Use dependency injection for testability
4. Clear interface contracts between layers

**Evidence**: 
- Applied in src/mcp/tools/explain.ts
- Clean separation achieved in TAPE-32 Phase 3

**Trust**: 1 use, 100% success rate

## [PAT:ERROR:HANDLING] - Comprehensive Error Management ★☆☆☆☆ (1 use, 100% success)

**Problem**: Inconsistent error handling across different system layers

**Solution**: Standardized error handling with proper validation and graceful degradation
```javascript
// ❌ WRONG - inconsistent error handling
const handler = async (args) => {
  const data = getData(args.id); // throws if not found
  return data;
};

// ✅ CORRECT - comprehensive error handling
const handler = async (args) => {
  try {
    // Input validation
    if (!args.pattern_id) {
      return { error: "pattern_id is required" };
    }
    
    const pattern = await this.findPattern(args.pattern_id);
    
    // Graceful degradation
    if (!pattern) {
      return { 
        error: "Pattern not found",
        suggestions: await this.getSimilarPatterns(args.pattern_id)
      };
    }
    
    return { result: pattern };
  } catch (error) {
    // Proper error logging and user-friendly responses
    console.error("Pattern lookup failed:", error);
    return { error: "Internal error occurred" };
  }
};
```

**Pattern**:
1. Validate inputs early and return clear error messages
2. Handle expected failures gracefully with helpful alternatives
3. Log technical details server-side, return user-friendly messages
4. Provide recovery suggestions when possible

**Evidence**: 
- Applied in src/mcp/tools/explain.ts
- Comprehensive validation and error responses

**Trust**: 1 use, 100% success rate

## [PAT:CACHE:TTL_SIMPLE] - Simple TTL Cache Pattern ★☆☆☆☆ (1 use, 100% success)

**Problem**: Need lightweight caching without complex cache management overhead

**Solution**: Simple Map-based cache with TTL and automatic cleanup
```javascript
// ❌ WRONG - complex cache with unnecessary features
class ComplexCache {
  constructor() {
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };
    this.setupEvictionPolicy();
  }
}

// ✅ CORRECT - simple TTL cache
class SimpleTTLCache {
  constructor(ttlMs = 30 * 60 * 1000) { // 30 minute default
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }
  
  set(key, value) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttlMs
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item || Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return item.value;
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }
}
```

**Pattern**:
1. Use simple Map for storage with expiry timestamps
2. Check expiry on get() and cleanup automatically
3. Periodic cleanup prevents memory leaks
4. 30-minute TTL balances performance vs memory usage

**Evidence**: 
- Applied in session-aware ranking for TAPE-32 Phase 3
- Provides 30-minute session context memory

**Trust**: 1 use, 100% success rate

## [PAT:RANKING:SESSION_AWARE] - Session-Aware Ranking Boost ★☆☆☆☆ (1 use, 100% success)

**Problem**: Pattern rankings don't consider recent usage context within development sessions

**Solution**: Boost patterns used recently in the current session while maintaining overall fairness
```javascript
// ❌ WRONG - static ranking without context
const rankPatterns = (patterns) => {
  return patterns.sort((a, b) => b.trustScore - a.trustScore);
};

// ✅ CORRECT - session-aware ranking
class SessionAwareRanker {
  constructor() {
    this.sessionCache = new SimpleTTLCache(30 * 60 * 1000); // 30 min
  }
  
  rankPatterns(patterns, sessionId) {
    const recentPatterns = this.sessionCache.get(sessionId) || new Set();
    
    return patterns.map(pattern => ({
      ...pattern,
      adjustedScore: pattern.trustScore + 
        (recentPatterns.has(pattern.id) ? 0.1 : 0)
    })).sort((a, b) => b.adjustedScore - a.adjustedScore);
  }
  
  recordUsage(patternId, sessionId) {
    const existing = this.sessionCache.get(sessionId) || new Set();
    existing.add(patternId);
    this.sessionCache.set(sessionId, existing);
  }
}
```

**Pattern**:
1. Track recently used patterns per session with TTL cache
2. Apply small boost (+0.1) to recently used patterns in ranking
3. Maintain session context for 30 minutes for workflow continuity
4. Keep boost small to preserve overall trust-based ranking

**Evidence**: 
- Applied in apex.patterns.explain tool for contextual relevance
- Improves developer workflow without breaking fairness

**Trust**: 1 use, 100% success rate
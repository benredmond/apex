# APEX Reflection Guide: apex_reflect Deep Dive

## Why This Tool is Special

`apex_reflect` is the most complex APEX MCP tool, responsible for updating pattern trust scores and capturing learnings. It has 20+ validation rules, automatic preprocessing to fix common AI mistakes, and supports two input formats (batch and claims). Proper reflection submission is critical for APEX's learning loop - it's how patterns evolve from experimental to proven.

**Key Complexity**: Evidence validation, pattern trust updates, permissive vs strict modes, git reference validation, and comprehensive error handling.

## Schema Overview

`apex_reflect` accepts two formats:

### Format 1: Batch Patterns (Recommended - Simple)
```typescript
{
  task: { id: string, title: string },
  outcome: "success" | "partial" | "failure",
  batch_patterns: [{
    pattern: string,              // Pattern ID
    outcome: PatternOutcome,      // See valid outcomes below
    evidence?: string | EvidenceRef[],
    notes?: string
  }],
  options?: {
    dry_run?: boolean,           // Default: false
    auto_mine?: boolean,         // Default: false
    return_explain?: boolean     // Default: true
  }
}
```

### Format 2: Claims (Advanced - Full Control)
```typescript
{
  task: { id: string, title: string },
  brief_id?: string,
  outcome: "success" | "partial" | "failure",
  artifacts?: {
    pr?: { number: number, repo: string },
    commits?: string[],          // Full 40-char SHAs
    ci_runs?: [{ id: string, provider: string }]
  },
  claims: {
    patterns_used: [{
      pattern_id: string,
      evidence: EvidenceRef[],
      snippet_id?: string,
      notes?: string
    }],
    trust_updates: [{
      pattern_id: string,
      delta?: { alpha: number, beta: number },
      outcome?: PatternOutcome
    }],
    new_patterns?: NewPattern[],
    anti_patterns?: AntiPattern[],
    learnings?: Learning[]
  }
}
```

**IMPORTANT**: Use ONE format, not both. Mixing `claims` and `batch_patterns` causes validation error.

## Evidence Types

Evidence proves that a pattern was actually used. Four types supported:

### 1. git_lines (Most Common)
References specific lines in a git-tracked file.

```typescript
{
  kind: "git_lines",
  file: string,              // Relative to repo root: "src/auth.ts"
  sha: string,               // Git ref: "HEAD", "main", full/short SHA
  start: number,             // Line number (≥ 1)
  end: number,               // Line number (≥ start)
  snippet_hash?: string      // Optional: hash for deduplication
}
```

**Validation**:
- File must exist at specified SHA
- Line range must be valid (start ≤ end, both positive)
- Lines must exist in file at that SHA
- SHA must be valid git reference

**Example**:
```json
{
  "kind": "git_lines",
  "file": "src/cache.ts",
  "sha": "HEAD",
  "start": 45,
  "end": 78
}
```

### 2. commit
References a git commit.

```typescript
{
  kind: "commit",
  sha: string                // 7-40 char hex OR valid git ref
}
```

**Validation**:
- SHA must be 7-40 hex characters OR valid git ref
- In strict mode, commit must exist in repo

**Example**:
```json
{
  "kind": "commit",
  "sha": "a1b2c3d4e5f6789012345678901234567890abcd"
}
```

### 3. pr (Pull Request)
References a pull request.

```typescript
{
  kind: "pr",
  number: number,            // PR number
  repo?: string              // Optional: "owner/repo"
}
```

**Validation**:
- Number must be positive integer
- Repo format: "owner/repo" if provided
- In strict mode, repo must be in allowed list

**Example**:
```json
{
  "kind": "pr",
  "number": 123,
  "repo": "benredmond/apex"
}
```

### 4. ci_run (CI/CD Run)
References a CI/CD run.

```typescript
{
  kind: "ci_run",
  id: string,                // Run ID
  provider: string           // CI provider: "github", "gitlab", etc.
}
```

**Validation**:
- Both id and provider must be non-empty strings

**Example**:
```json
{
  "kind": "ci_run",
  "id": "1234567890",
  "provider": "github"
}
```

## Pattern Outcomes (Trust Updates)

Pattern outcomes map to trust score deltas using Beta distribution:

| Outcome | Success Weight | Alpha | Beta | Meaning |
|---------|----------------|-------|------|---------|
| `worked-perfectly` | 100% | 1.0 | 0.0 | Pattern worked without changes |
| `worked-with-tweaks` | 70% | 0.7 | 0.3 | Minor modifications needed |
| `partial-success` | 50% | 0.5 | 0.5 | Pattern helped but incomplete |
| `failed-minor-issues` | 30% | 0.3 | 0.7 | Pattern had issues but recoverable |
| `failed-completely` | 0% | 0.0 | 1.0 | Pattern didn't work, abandoned |

**Trust Score Calculation**:
- Starts at Beta(1, 1) for new patterns (prior)
- Each outcome updates: Alpha += alpha_delta, Beta += beta_delta
- Trust score = Alpha / (Alpha + Beta)
- ★ rating = round(trust_score * 5)

## Preprocessing Auto-Fixes

The reflection preprocessor automatically fixes common AI mistakes BEFORE validation:

### Fix 1: code_lines → git_lines
**Mistake**: Using `"code_lines"` as evidence kind
**Auto-Fix**: Converted to `"git_lines"`
**Tracked**: `preprocessing_corrections` field increments

```javascript
// BEFORE preprocessing
{ kind: "code_lines", file: "src/auth.ts", ... }

// AFTER preprocessing
{ kind: "git_lines", file: "src/auth.ts", ... }
```

### Fix 2: Missing SHA
**Mistake**: Omitting `sha` field in git_lines evidence
**Auto-Fix**: Adds `sha: "HEAD"`

```javascript
// BEFORE
{ kind: "git_lines", file: "src/auth.ts", start: 10, end: 20 }

// AFTER
{ kind: "git_lines", file: "src/auth.ts", sha: "HEAD", start: 10, end: 20 }
```

### Fix 3: String Evidence → Object Array
**Mistake**: Passing evidence as plain string
**Auto-Fix**: Converted to git_lines evidence object

```javascript
// BEFORE
evidence: "Applied in src/auth.ts:45-78"

// AFTER
evidence: [{
  kind: "git_lines",
  file: "reflection-note",
  sha: "HEAD",
  start: 1,
  end: 1
}]
```

### Fix 4: Single-Segment Pattern IDs
**Mistake**: Using pattern IDs with only 1 segment (e.g., "FIX", "TEST")
**Auto-Fix**: Padded with `:DEFAULT` to create 4 segments

```javascript
// BEFORE
pattern_id: "FIX"

// AFTER
pattern_id: "FIX:DEFAULT:DEFAULT:DEFAULT"
```

**Note**: Pattern IDs with 2+ segments are kept as-is (valid format).

### Fix 5: JSON String → Object
**Mistake**: Passing `batch_patterns` or `claims` as stringified JSON
**Auto-Fix**: Attempts to parse JSON strings back to objects

## Common Validation Errors

### 1. Missing Required Fields
```
Error: "InvalidParamsError: Missing required field 'task.id'"
Solution: Provide both task.id and task.title
```

### 2. Invalid Outcome
```
Error: "InvalidParamsError: Invalid outcome. Must be: success, partial, failure"
Solution: Use exact vocabulary (not "passed", "failed", "done")
```

### 3. Mixed Formats
```
Error: "InvalidParamsError: Cannot specify both 'claims' and 'batch_patterns'"
Solution: Choose ONE format
```

### 4. Duplicate Trust Updates
```
Error: "DUPLICATE_TRUST_UPDATE: Pattern 'PAT:AUTH:JWT' appears multiple times"
Solution: Consolidate to single update per pattern_id
```

### 5. Empty Evidence Array
```
Error: "InvalidParamsError: Evidence array must have at least 1 item"
Solution: Provide at least one evidence reference
```

### 6. Invalid Line Range
```
Error: "LINE_RANGE_NOT_FOUND: Lines 100-200 don't exist in src/auth.ts at HEAD"
Solution: Verify line numbers exist at specified SHA
```

### 7. Pattern Not Found (Strict Mode)
```
Error: "PATTERN_NOT_FOUND: Pattern 'PAT:CUSTOM' doesn't exist"
Solution: Create pattern first OR use permissive mode (default)
```

### 8. Invalid SHA Format
```
Error: "MALFORMED_EVIDENCE: SHA must be 7-40 hex characters or valid git ref"
Solution: Use full/short SHA or branch name (HEAD, main, etc.)
```

## Permissive vs Strict Mode

### Permissive Mode (Default)
**Environment**: `APEX_REFLECTION_MODE` not set or `APEX_REFLECTION_MODE=permissive`

**Behavior**:
- Missing patterns are auto-created with default trust
- Git errors become warnings (validation continues)
- SHA resolution failures tolerated
- Line range errors downgraded to warnings
- Evidence validation more lenient

**When to Use**: Development, experimentation, learning

### Strict Mode
**Environment**: `export APEX_REFLECTION_MODE=strict`

**Behavior**:
- All validation errors are fatal
- No auto-creation of missing patterns
- Git operations must succeed
- Evidence must be fully validated
- SHA must resolve correctly

**When to Use**: Production, CI/CD pipelines, high-confidence reflections

## Complete Examples

### Example 1: Simple Batch Reflection
```typescript
// After completing a task
const draft = await apex_task_complete({
  id: "T123",
  outcome: "success",
  key_learning: "JWT pattern worked perfectly",
  patterns_used: ["PAT:AUTH:JWT"]
})

// Commit changes (CRITICAL - do this BEFORE reflection)
await bash("git add src/auth.ts")
await bash("git commit -m 'feat: implement JWT auth'")

// Submit reflection using batch format
await apex_reflect({
  task: { id: "T123", title: "Implement JWT authentication" },
  outcome: "success",
  batch_patterns: [
    {
      pattern: "PAT:AUTH:JWT",
      outcome: "worked-perfectly",
      evidence: "Applied in src/auth.ts:45-78",  // String auto-converts
      notes: "JWT generation and validation working as expected"
    }
  ]
})
```

### Example 2: Advanced Claims with Multiple Evidence Types
```typescript
await apex_reflect({
  task: { id: "T124", title: "Add Redis caching" },
  outcome: "success",
  artifacts: {
    pr: { number: 456, repo: "myorg/myapp" },
    commits: ["a1b2c3d4e5f6789012345678901234567890abcd"],
    ci_runs: [{ id: "9876543210", provider: "github" }]
  },
  claims: {
    patterns_used: [
      {
        pattern_id: "PAT:CACHE:REDIS",
        evidence: [
          {
            kind: "git_lines",
            file: "src/cache/redis.ts",
            sha: "HEAD",
            start: 10,
            end: 50
          },
          {
            kind: "git_lines",
            file: "src/middleware/cache.ts",
            sha: "HEAD",
            start: 5,
            end: 20
          }
        ],
        notes: "Pattern applied in 2 locations"
      }
    ],
    trust_updates: [
      {
        pattern_id: "PAT:CACHE:REDIS",
        outcome: "worked-with-tweaks"  // 70% success
      }
    ],
    new_patterns: [
      {
        title: "Cache Invalidation with TTL",
        summary: "Robust cache invalidation using Redis TTL with fallback",
        type: "code",
        category: "caching",
        key_insight: "Always set TTL to prevent memory leaks",
        snippets: [{
          language: "typescript",
          code: "await redis.setex(key, ttl, value);",
          explanation: "Set key with automatic expiration"
        }],
        evidence: [{
          kind: "git_lines",
          file: "src/cache/invalidation.ts",
          sha: "HEAD",
          start: 30,
          end: 45
        }]
      }
    ],
    learnings: [
      {
        assertion: "Always validate cache hits before trusting them",
        evidence: [{
          kind: "git_lines",
          file: "src/cache/validation.ts",
          sha: "HEAD",
          start: 15,
          end: 25
        }]
      }
    ]
  }
})
```

### Example 3: Handling Failures
```typescript
await apex_reflect({
  task: { id: "T125", title: "Implement GraphQL subscriptions" },
  outcome: "partial",  // Task mostly complete but issues
  batch_patterns: [
    {
      pattern: "PAT:GRAPHQL:SUBSCRIPTIONS",
      outcome: "partial-success",  // 50% success
      notes: "Pattern worked for simple subscriptions, failed for complex filtering"
    },
    {
      pattern: "PAT:WEBSOCKET:SCALING",
      outcome: "failed-minor-issues",  // 30% success
      notes: "Scaling approach didn't account for sticky sessions"
    }
  ]
})
```

### Example 4: Dry Run (Testing)
```typescript
// Test reflection without persisting
const result = await apex_reflect({
  task: { id: "T126", title: "Test reflection" },
  outcome: "success",
  batch_patterns: [{
    pattern: "PAT:TEST",
    outcome: "worked-perfectly"
  }],
  options: {
    dry_run: true,              // Don't persist
    return_explain: true        // Get validation details
  }
})

// Check for errors
if (result.warnings.length > 0) {
  console.log("Warnings:", result.warnings)
}

// Review preprocessing corrections
if (result.preprocessing_corrections > 0) {
  console.log(`Auto-fixed ${result.preprocessing_corrections} issues`)
}
```

## Response Structure

```typescript
{
  ok: boolean,                    // Overall success
  persisted: boolean,             // Data saved (false if dry_run)
  outcome: string,                // Task outcome echoed back

  accepted: {
    patterns_used: [...],         // Patterns recorded
    new_patterns: [...],          // New patterns created
    anti_patterns: [...],         // Anti-patterns recorded
    learnings: [...],             // Learnings captured
    trust_updates: [{
      pattern_id: string,
      applied_delta: { alpha: number, beta: number },
      alpha_after: number,        // New alpha value
      beta_after: number,         // New beta value
      wilson_lb_after: number     // New trust score
    }]
  },

  warnings: ValidationError[],    // Non-fatal issues
  rejected: ValidationError[],    // Fatal errors (if any)

  preprocessing_corrections: number,  // Auto-fixes applied
  trust_updates_processed: number,    // Trust updates successful

  meta: {
    received_at: string,
    validated_in_ms: number,
    persisted_in_ms: number,
    schema_version: string
  }
}
```

## Best Practices

1. **Always commit before reflecting** - Git evidence validation requires committed files
2. **Use batch format for simple cases** - Less verbose, easier to maintain
3. **Provide real evidence** - Use actual file paths, SHAs, line numbers
4. **Test with dry_run first** - Catch validation errors before persisting
5. **Check preprocessing_corrections** - Learn what's being auto-fixed
6. **Use exact outcome vocabulary** - Don't invent new outcomes
7. **One trust update per pattern** - Consolidate duplicates
8. **Meaningful notes** - Future you will appreciate context
9. **Leverage permissive mode** - During development for auto-creation
10. **Switch to strict mode** - In production for confidence

## Troubleshooting Checklist

When reflection fails:

- [ ] Is `task` object complete? (id and title)
- [ ] Is `outcome` valid? (success, partial, failure)
- [ ] Using ONE format? (claims OR batch_patterns, not both)
- [ ] Have you committed changes? (git evidence validation)
- [ ] Are pattern outcomes valid? (Use exact strings from table)
- [ ] Any duplicate pattern_ids in trust_updates?
- [ ] Is evidence array non-empty?
- [ ] Are SHAs valid? (7-40 hex OR git ref)
- [ ] Do line ranges exist? (Check file at SHA)
- [ ] Tried dry_run mode? (Test before persisting)

## Advanced: Creating New Patterns

When using claims format, you can create new patterns:

```typescript
new_patterns: [{
  title: "Pattern Name",                    // Required
  summary: "What this pattern does",        // Required
  type: "code" | "fix" | "pattern" | "test", // Required
  category: string,                         // Required
  key_insight: "Main takeaway",
  application_strategy: "How to apply",
  when_to_use: ["Situation 1", "Situation 2"],
  related_patterns: ["PAT:ID:1", "PAT:ID:2"],
  snippets: [{
    language: "typescript",
    code: "// Example code",
    explanation: "What this does"
  }],
  evidence: [/* EvidenceRef array */],
  tags: ["tag1", "tag2"]  // Max 15
}]
```

## Advanced: Anti-Patterns

Document what NOT to do:

```typescript
anti_patterns: [{
  title: "Anti-pattern Name",               // Required
  reason: "Why this is bad",                // Required
  evidence: [/* EvidenceRef array */],      // Optional
  alternative_approach: "What to do instead"
}]
```

---

**Remember**: Reflection is how APEX learns. Quality reflections with real evidence make patterns more trustworthy for future tasks.

---
name: using-apex-mcp
description: Use when calling APEX MCP tools (apex_patterns_lookup, apex_task_create, apex_reflect, etc.) for pattern intelligence, task tracking, or submitting reflections. Reference guide for all 12 MCP tools with schemas, trust score interpretation (★ ratings), workflow integration, and common error fixes.
---

# Using APEX MCP

APEX is an intelligent memory layer for AI coding assistants that provides pattern discovery, task intelligence, and continuous learning through 12 MCP (Model Context Protocol) tools.

## Quick Reference

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `apex_patterns_lookup` | Find relevant patterns by context | Starting any task, need proven solutions |
| `apex_patterns_discover` | Semantic pattern search | When lookup insufficient, exploring |
| `apex_patterns_explain` | Get pattern details | Deep dive on specific pattern |
| `apex_task_create` | Create task with auto-brief | Beginning any work |
| `apex_task_find` | Find tasks by criteria | Looking for similar past work |
| `apex_task_find_similar` | Get similar tasks | Need examples of similar implementations |
| `apex_task_update` | Track progress | Phase transitions, adding files/decisions |
| `apex_task_checkpoint` | Add progress note | Frequent progress tracking |
| `apex_task_complete` | Finish task (returns draft) | Work done, before reflection |
| `apex_task_context` | Get intelligence pack | After creating task, need patterns/similar tasks |
| `apex_task_append_evidence` | Add evidence | Tracking pattern usage, decisions |
| `apex_reflect` | Submit outcomes (complex!) | After completion, update pattern trust |

## Trust Score Interpretation

Patterns include trust scores (0.0-1.0) that indicate reliability:

- **★★★★★** (0.9-1.0) - Apply confidently, proven patterns
- **★★★★☆** (0.7-0.9) - High trust, use with confidence
- **★★★☆☆** (0.5-0.7) - Moderate trust, apply with caution
- **★★☆☆☆** (0.3-0.5) - Low confidence, validate carefully
- **★☆☆☆☆** (0.0-0.3) - Untested or failing, avoid

**Application Rule**: Apply patterns with ★★★★☆+ (trust ≥ 0.7) confidently. Question patterns below ★★★☆☆ (trust < 0.5).

## Typical Workflow

```typescript
// 1. Create task
const task = await apex_task_create({
  intent: "Implement user authentication",
  type: "feature",
  tags: ["auth", "security", "api"]
})

// 2. Get intelligence (patterns + similar tasks)
const intel = await apex_task_context({
  task_id: task.id,
  packs: ["tasks", "patterns", "statistics"]
})

// 3. Discover specific patterns
const patterns = await apex_patterns_lookup({
  task: "JWT authentication with rate limiting",
  workflow_phase: "builder",  // architect|builder|validator|reviewer|documenter
  code_context: {
    current_file: "src/auth.ts",
    imports: ["jsonwebtoken"]
  }
})

// 4. Track progress through phases
await apex_task_update({
  id: task.id,
  phase: "BUILDER",  // ARCHITECT→BUILDER→VALIDATOR→REVIEWER→DOCUMENTER
  confidence: 0.75,
  files: ["src/auth.ts", "src/middleware/auth.ts"],
  handoff: "Architecture complete, implementing JWT auth"
})

// 5. Complete task (returns reflection draft - does NOT auto-submit)
const draft = await apex_task_complete({
  id: task.id,
  outcome: "success",  // success|partial|failure
  key_learning: "JWT auth with proper error handling saves 2 hours",
  patterns_used: ["PAT:AUTH:JWT", "FIX:ERROR:HANDLING"]
})

// 6. Submit reflection (MUST be explicit - updates pattern trust)
await apex_reflect(draft)  // Use the draft from apex_task_complete
```

## Pattern Discovery Flow

### Primary: Context-Aware Lookup
```typescript
const patterns = await apex_patterns_lookup({
  task: "implement caching layer",
  task_intent: {
    type: "feature",
    confidence: 0.8
  },
  code_context: {
    current_file: "src/cache.ts",
    imports: ["redis", "ioredis"]
  },
  project_signals: {
    language: "typescript",
    framework: "express"
  }
})

// Returns: pattern_pack with trust-scored patterns
// Apply patterns with trust_score ≥ 0.7 confidently
```

### Secondary: Semantic Search
```typescript
const discovered = await apex_patterns_discover({
  query: "cache invalidation with TTL",
  filters: {
    min_trust: 0.7,  // Only high-trust patterns
    types: ["code", "pattern"]
  },
  max_results: 10
})
```

### Deep Dive: Pattern Explanation
```typescript
const details = await apex_patterns_explain({
  pattern_id: "PAT:CACHE:REDIS",
  verbosity: "detailed",  // concise|detailed|examples
  context: {
    task_type: "caching implementation"
  }
})

// Returns: explanation, when_to_use, how_to_apply, common_mistakes, examples
```

## Task Tracking Pattern

### Creating and Tracking
```typescript
// Create with context
const task = await apex_task_create({
  intent: "Fix authentication timeout bug",
  type: "bug",
  identifier: "AUTH-TIMEOUT-123",  // External ID (e.g., JIRA)
  tags: ["auth", "bug", "timeout", "critical"]
})

// Get similar tasks for learning
const similar = await apex_task_find_similar({
  taskId: task.id
})

// Frequent checkpoints
await apex_task_checkpoint({
  id: task.id,
  message: "Identified root cause in session management",
  confidence: 0.6
})

// Append evidence for learning
await apex_task_append_evidence({
  task_id: task.id,
  type: "pattern",  // pattern|error|decision|learning|file
  content: "Applied PAT:SESSION:TIMEOUT for session expiry",
  metadata: {
    pattern_id: "PAT:SESSION:TIMEOUT",
    file: "src/session.ts",
    line_start: 45,
    line_end: 67
  }
})
```

## Reflection Submission (CRITICAL)

**⚠️ IMPORTANT**: `apex_reflect` is the most complex tool with 20+ validation rules. See `apex-reflect-guide.md` for complete documentation.

### Quick Guide

```typescript
// STEP 1: Complete task (returns draft)
const draft = await apex_task_complete({
  id: task_id,
  outcome: "success",
  key_learning: "Pattern XYZ saved 2 hours",
  patterns_used: ["PAT:AUTH:JWT"]
})

// STEP 2: Commit changes FIRST (reflection validates git evidence)
await bash("git add . && git commit -m 'feat: implement auth'")

// STEP 3: Submit reflection (explicit call required)
await apex_reflect({
  task: { id: task_id, title: "Implement JWT auth" },
  outcome: "success",
  batch_patterns: [  // Simple format (RECOMMENDED)
    {
      pattern: "PAT:AUTH:JWT",
      outcome: "worked-perfectly",  // See valid outcomes below
      evidence: "Applied in src/auth.ts:45-78"
    }
  ]
})
```

### Valid Pattern Outcomes
- `"worked-perfectly"` → 100% success (alpha: 1.0, beta: 0.0)
- `"worked-with-tweaks"` → 70% success (alpha: 0.7, beta: 0.3)
- `"partial-success"` → 50% success (alpha: 0.5, beta: 0.5)
- `"failed-minor-issues"` → 30% success (alpha: 0.3, beta: 0.7)
- `"failed-completely"` → 0% success (alpha: 0.0, beta: 1.0)

### Common Reflection Errors
1. **Using "code_lines" instead of "git_lines"** → Auto-fixed by preprocessor
2. **Missing SHA in git evidence** → Auto-fixed to `"HEAD"`
3. **Mixing claims and batch_patterns** → Error: use ONE format only
4. **Invalid outcome vocabulary** → Use exact strings above
5. **Not committing before reflection** → Evidence validation fails

## Quick Troubleshooting

### Error: "InvalidParamsError"
- Check required fields (`task`, `intent`, `id`, etc.)
- Verify enum values (outcome, phase, type)
- Check length limits (task: 1-1000 chars, key_learning: 1-500 chars)

### Error: "Pattern not found"
- In **permissive mode** (default): Pattern auto-created
- In **strict mode**: Error thrown
- Set mode: `export APEX_REFLECTION_MODE=strict`

### Error: "Line range not found"
- Ensure lines exist at specified SHA
- Check file path is relative to repo root
- Verify git ref is valid (`HEAD`, `main`, SHA)

### Error: "Duplicate trust update"
- Same pattern_id appears twice in trust_updates
- Consolidate to single update per pattern

### Error: "Rate limit exceeded"
- Default: 100 requests per 60 seconds
- Configure via environment variables
- Use caching (5-minute TTL on lookup/discover)

## 5-Phase Workflow Integration

APEX tools map to execution phases:

- **ARCHITECT**: `apex_patterns_lookup` with `workflow_phase: "architect"`, get architecture patterns
- **BUILDER**: `apex_patterns_lookup` with `workflow_phase: "builder"`, implement with patterns, track via `apex_task_update`
- **VALIDATOR**: `apex_patterns_lookup` with `workflow_phase: "validator"`, test patterns
- **REVIEWER**: Use `apex_task_context` to review journey, check patterns applied
- **DOCUMENTER**: `apex_task_complete` + `apex_reflect` to capture learnings

## Advanced Features

### Context Pack Structure
`apex_task_context` returns comprehensive intelligence:
- `active_tasks`: Tasks in progress
- `recent_similar_tasks`: Similar implementations with learnings
- `task_statistics`: Success rates, duration averages
- `task_patterns`: Common patterns by theme

### Evidence Types (for apex_reflect)
- `git_lines`: File, SHA, line range (most common)
- `commit`: Git commit SHA
- `pr`: Pull request number and repo
- `ci_run`: CI run ID and provider

### Batch vs Claims Format
**Batch** (simple, recommended):
```typescript
batch_patterns: [{
  pattern: "PAT:ID",
  outcome: "worked-perfectly",
  notes: "Optional notes"
}]
```

**Claims** (advanced, full control):
```typescript
claims: {
  patterns_used: [{
    pattern_id: "PAT:ID",
    evidence: [{ kind: "git_lines", file: "...", sha: "HEAD", start: 1, end: 10 }]
  }],
  trust_updates: [{ pattern_id: "PAT:ID", outcome: "worked-perfectly" }],
  new_patterns: [...],
  anti_patterns: [...],
  learnings: [...]
}
```

## Additional Resources

- **Complete Reflection Guide**: See `apex-reflect-guide.md` for deep dive on apex_reflect with all validation rules, evidence types, and error handling
- **Tool Schemas**: Full parameter documentation in MCP server source (`src/mcp/tools/`)
- **Trust Calculation**: Beta-Bernoulli model in `src/trust/beta-bernoulli.ts`

---

**Remember**: APEX learns from your reflections. Submit outcomes via `apex_reflect` to improve pattern trust scores for future tasks.

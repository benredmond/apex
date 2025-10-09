# MCP Schema Constraints

This document describes constraints in APEX MCP tool schemas that cannot be fully encoded in JSON Schema due to limitations of the format.

## apex_reflect: XOR Constraint

**Constraint:** The `apex_reflect` tool requires **either** `claims` OR `batch_patterns` to be provided, but **not both** and **not neither**.

**Why This Matters:**
- JSON Schema cannot express complex cross-field validation rules like XOR
- Zod's `.refine()` method enforces this at runtime, but it's not visible in the generated JSON Schema
- AI assistants and schema-driven tooling won't see this constraint automatically

**Implementation:**

The constraint is enforced in three places:

1. **Runtime Validation** (src/reflection/types.ts:200-207):
   ```typescript
   .refine(
     (data) =>
       (data.claims && !data.batch_patterns) ||
       (!data.claims && data.batch_patterns),
     {
       message: "Must provide either claims or batch_patterns",
     },
   )
   ```

2. **Tool Description** (src/mcp/tools/index.ts):
   ```
   "Submit task reflection with evidence to update pattern trust scores and
   discover new patterns. IMPORTANT: Must provide either 'claims' (traditional
   format with patterns_used, trust_updates, etc.) OR 'batch_patterns'
   (batch mode), but not both."
   ```

3. **Field Descriptions** (src/reflection/types.ts):
   - `claims`: "Traditional reflection format with patterns_used and trust_updates. Use this OR batch_patterns, not both."
   - `batch_patterns`: "Batch mode for multiple patterns. Use this OR claims, not both."

**Usage Examples:**

✅ **Correct - Using claims:**
```json
{
  "task": {"id": "abc", "title": "Example"},
  "outcome": "success",
  "claims": {
    "patterns_used": [...],
    "trust_updates": [...]
  }
}
```

✅ **Correct - Using batch_patterns:**
```json
{
  "task": {"id": "abc", "title": "Example"},
  "outcome": "success",
  "batch_patterns": [
    {"pattern": "PAT:EXAMPLE", "outcome": "worked-perfectly"}
  ]
}
```

❌ **Incorrect - Both provided:**
```json
{
  "task": {"id": "abc", "title": "Example"},
  "outcome": "success",
  "claims": {...},
  "batch_patterns": [...]  // ERROR: Cannot use both
}
```

❌ **Incorrect - Neither provided:**
```json
{
  "task": {"id": "abc", "title": "Example"},
  "outcome": "success"
  // ERROR: Must provide either claims or batch_patterns
}
```

**Error Message:**

If the constraint is violated, Zod validation will return:
```
Must provide either claims or batch_patterns
```

## Other Constraints

Currently, `apex_reflect` is the only MCP tool with a constraint that cannot be fully expressed in JSON Schema. Future tools with similar constraints should be documented here.

---

**Last Updated:** 2025-09-30 (Phase 2 of MCP Token Optimization)

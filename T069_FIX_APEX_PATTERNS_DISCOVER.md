---
id: T069
title: Fix apex_patterns_discover returning empty results
type: bug
status: pending
priority: high
created: 2025-01-06T14:20:00-08:00
updated: 2025-01-06T14:20:00-08:00
assigned: claude
tags: [mcp, patterns, search, database]
acceptance_criteria:
  - apex_patterns_discover returns patterns for valid queries
  - Search fields (tags, keywords, search_index) are populated from json_canonical
  - FTS5 search works correctly with populated fields
current_phase: ARCHITECT
---

# T069: Fix apex_patterns_discover returning empty results

## Problem Statement

The `apex_patterns_discover` MCP tool is returning empty results despite having 52 patterns in the database. Investigation shows:

1. Database has 52 patterns in both `patterns` and `patterns_fts` tables
2. The `tags`, `keywords`, and `search_index` columns are all NULL/empty
3. The pattern data exists in `json_canonical` BLOB field but isn't extracted to searchable columns
4. FTS5 search returns no results because searchable fields are empty

## Evidence

```
⏺ apex-mcp - apex_patterns_discover (query: "authentication JWT express API endpoints")
  ⎿  {
       "patterns": [],  // No patterns returned
       "query_interpretation": {
         "keywords": [...],  // Correctly identified
         "inferred_categories": ["auth", "api"]  // Correctly inferred
       }
     }

⏺ Bash(sqlite3 patterns.db "SELECT COUNT(*) FROM patterns")
  ⎿  52  // Patterns exist

⏺ Bash(sqlite3 patterns.db "SELECT id, title, tags, keywords, search_index FROM patterns LIMIT 3")
  ⎿  PAT:8XfklDdNVMDw|Beta Distribution Calculations|||
      PAT:Im0M4rZKi3hX|Beta Distribution Calculations|||
      PAT:dA0w9N1I9-4m|Better-SQLite3 Synchronous Transactions|||
      // All search fields are empty!
```

## Root Cause

The patterns were inserted with search fields empty, and the `json_canonical` data contains the actual pattern information but isn't being extracted to the searchable columns that FTS5 needs.

## Proposed Solution

1. Create a migration or script to extract data from `json_canonical` and populate the search fields
2. Update the pattern insertion logic to properly populate these fields for future patterns
3. Verify FTS5 search works after population

## Files to Investigate/Modify

- `/src/storage/repository.ts` - Pattern search implementation
- `/src/mcp/tools/discover.ts` - Discovery tool that's failing
- Database migration to fix existing data
- Pattern insertion logic to prevent future occurrences
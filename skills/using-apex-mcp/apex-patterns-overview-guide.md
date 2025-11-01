# APEX Pattern Overview Guide: apex_patterns_overview

## Purpose

`apex_patterns_overview` provides a filterable, paginated browsing interface for ALL patterns in the APEX database. Unlike task-driven search (`apex_patterns_lookup`) or semantic discovery (`apex_patterns_discover`), this tool lets you explore patterns by category, trust score, type, and other criteria - perfect for pattern management, bulk analysis, and discovering what patterns exist.

**Use Case**: When you need to browse patterns without a specific task context, understand pattern distribution, or find patterns by administrative criteria (e.g., "show me all low-trust ANTI patterns").

## When to Use

| Scenario | Use apex_patterns_overview |
|----------|----------------------------|
| "What patterns do we have for testing?" | ✅ Filter by type=TEST |
| "Show me all high-trust authentication patterns" | ✅ Filter by tags + min_trust |
| "Which patterns were recently updated?" | ✅ Sort by updated_at DESC |
| "Get statistics on pattern distribution" | ✅ Set include_stats=true |
| "List all anti-patterns for review" | ✅ Filter by type=ANTI |
| "I'm working on user authentication" | ❌ Use apex_patterns_lookup instead |
| "Find patterns similar to my code" | ❌ Use apex_patterns_discover instead |

**Rule of Thumb**: Use `overview` for **browsing/management**, use `lookup` for **task-specific work**, use `discover` for **semantic exploration**.

## Schema

```typescript
{
  // Filters (all optional)
  type?: Pattern["type"][] | "all",     // CODEBASE, LANG, ANTI, FAILURE, POLICY, TEST, MIGRATION
  tags?: string[],                      // Filter by tags (AND logic with type)
  min_trust?: number,                   // 0.0-1.0, filter by trust score
  max_age_days?: number,                // Only patterns created within N days
  status?: "active" | "quarantined" | "all",  // Default: "active"
  
  // Sorting
  order_by?: "trust_score" | "usage_count" | "created_at" | "updated_at" | "title",
  order?: "asc" | "desc",               // Default: "desc"
  
  // Pagination
  page?: number,                        // Default: 1
  page_size?: number,                   // 1-100, default: 50
  
  // Output control
  include_stats?: boolean,              // Default: false (add statistics)
  include_metadata?: boolean            // Default: false (add key_insight, when_to_use)
}
```

## Response Structure

```typescript
{
  patterns: CompressedPattern[],        // Array of compressed patterns
  stats?: OverviewStats,                // Optional statistics (if requested)
  pagination: {
    page: number,
    page_size: number,
    total_items: number,
    total_pages: number,
    has_next: boolean,
    has_prev: boolean
  },
  request_id: string,
  latency_ms: number,
  cache_hit: boolean
}
```

### CompressedPattern Format

Patterns are returned in a **token-optimized format**:

```typescript
{
  id: string,                          // Pattern ID (e.g., "PAT:AUTH:JWT")
  type: string,                        // CODEBASE, LANG, ANTI, etc.
  title: string,                       // Human-readable title
  summary: string,                     // Truncated to 200 chars (ends with "..." if truncated)
  trust_score: number,                 // 0.0-1.0 trust score
  usage_count: number,                 // Times pattern was used
  success_rate?: number,               // 0.0-1.0 success rate (if used)
  tags: string[],                      // Tags array
  alias?: string,                      // URL-friendly alias (optional)
  created_at: string,                  // ISO8601 timestamp
  updated_at: string,                  // ISO8601 timestamp
  
  // Only if include_metadata=true:
  key_insight?: string,                // Core takeaway
  when_to_use?: string                 // Usage scenarios
}
```

### OverviewStats Format

When `include_stats: true`, response includes aggregate statistics:

```typescript
{
  total_patterns: number,              // Total count matching filters
  by_type: {                           // Distribution by type
    "CODEBASE": 45,
    "LANG": 120,
    "ANTI": 23,
    // ...
  },
  avg_trust_score: number,             // Average trust (0.00-1.00)
  high_trust_patterns: number,         // Count with trust > 0.8
  recently_added: number,              // Created in last 7 days
  recently_updated: number             // Updated in last 7 days
}
```

## Common Usage Patterns

### 1. Browse All Patterns (Default)

```typescript
// Get first 50 patterns, sorted by trust score descending
const response = await apex_patterns_overview({})

console.log(`Total patterns: ${response.pagination.total_items}`)
console.log(`Showing ${response.patterns.length} patterns`)

// Access top pattern
const topPattern = response.patterns[0]
console.log(`Top pattern: ${topPattern.title} (trust: ${topPattern.trust_score})`)
```

### 2. Filter by Type

```typescript
// Get all authentication patterns (language-specific)
const authPatterns = await apex_patterns_overview({
  type: ["LANG"],
  tags: ["auth", "security"],
  min_trust: 0.7,              // High-trust only
  page_size: 20
})

// Show results
authPatterns.patterns.forEach(p => {
  const stars = "★".repeat(Math.round(p.trust_score * 5))
  console.log(`${stars} ${p.title} (${p.usage_count} uses)`)
})
```

### 3. Find Anti-Patterns for Review

```typescript
// Get all anti-patterns, sorted by usage (most common first)
const antiPatterns = await apex_patterns_overview({
  type: ["ANTI"],
  order_by: "usage_count",
  order: "desc"
})

console.log(`Found ${antiPatterns.pagination.total_items} anti-patterns`)

// Flag patterns that are being used despite low trust
const problematic = antiPatterns.patterns.filter(p => 
  p.usage_count > 5 && p.trust_score < 0.5
)

console.log(`${problematic.length} high-usage, low-trust anti-patterns need attention`)
```

### 4. Get Statistics Overview

```typescript
// Get comprehensive statistics without listing all patterns
const stats = await apex_patterns_overview({
  include_stats: true,
  page_size: 1                 // Only need 1 pattern for stats
})

console.log("Pattern Database Statistics:")
console.log(`  Total: ${stats.stats.total_patterns}`)
console.log(`  Avg Trust: ${stats.stats.avg_trust_score.toFixed(2)}`)
console.log(`  High Trust (>0.8): ${stats.stats.high_trust_patterns}`)
console.log(`  Recently Added: ${stats.stats.recently_added}`)
console.log(`  By Type:`)

Object.entries(stats.stats.by_type).forEach(([type, count]) => {
  console.log(`    ${type}: ${count}`)
})
```

### 5. Find Recently Updated Patterns

```typescript
// See what patterns were recently modified (learning from recent work)
const recentlyUpdated = await apex_patterns_overview({
  order_by: "updated_at",
  order: "desc",
  page_size: 10,
  include_metadata: true       // Get key_insight and when_to_use
})

console.log("Recently Updated Patterns:")
recentlyUpdated.patterns.forEach(p => {
  const daysAgo = Math.floor(
    (Date.now() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24)
  )
  console.log(`  ${p.title} (updated ${daysAgo} days ago)`)
  if (p.key_insight) {
    console.log(`    💡 ${p.key_insight}`)
  }
})
```

### 6. Pagination Through Large Result Sets

```typescript
// Navigate through all test patterns
let page = 1
let hasMore = true

while (hasMore) {
  const response = await apex_patterns_overview({
    type: ["TEST"],
    page,
    page_size: 25
  })
  
  console.log(`Page ${page}/${response.pagination.total_pages}:`)
  response.patterns.forEach(p => {
    console.log(`  - ${p.title}`)
  })
  
  hasMore = response.pagination.has_next
  page++
  
  // Safety limit
  if (page > 10) break
}
```

### 7. Find Low-Trust Patterns Needing Improvement

```typescript
// Identify patterns that need more validation or should be deprecated
const lowTrustPatterns = await apex_patterns_overview({
  order_by: "trust_score",
  order: "asc",                // Ascending = lowest first
  page_size: 20
})

console.log("Low-Trust Patterns (needs review):")
lowTrustPatterns.patterns.forEach(p => {
  if (p.trust_score < 0.5) {
    const rating = "★".repeat(Math.round(p.trust_score * 5)) + "☆".repeat(5 - Math.round(p.trust_score * 5))
    console.log(`  ${rating} ${p.title}`)
    console.log(`    Used ${p.usage_count} times, ${(p.success_rate * 100).toFixed(0)}% success`)
  }
})
```

### 8. Search Within Specific Tag

```typescript
// Find all caching-related patterns across types
const cachingPatterns = await apex_patterns_overview({
  tags: ["cache", "redis", "memcached"],
  order_by: "trust_score",
  order: "desc"
})

console.log(`Found ${cachingPatterns.pagination.total_items} caching patterns:`)

// Group by type
const byType = cachingPatterns.patterns.reduce((acc, p) => {
  acc[p.type] = (acc[p.type] || 0) + 1
  return acc
}, {} as Record<string, number>)

Object.entries(byType).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`)
})
```

### 9. Find Patterns by Title

```typescript
// Search for patterns with specific terms in title
const jwtPatterns = await apex_patterns_overview({
  order_by: "title",           // Alphabetical sorting
  order: "asc",
  page_size: 100
})

// Client-side filtering by title (server doesn't support title search yet)
const matchingPatterns = jwtPatterns.patterns.filter(p =>
  p.title.toLowerCase().includes("jwt") ||
  p.title.toLowerCase().includes("authentication")
)

console.log(`Found ${matchingPatterns.length} patterns with JWT/authentication:`)
matchingPatterns.forEach(p => {
  console.log(`  ${p.title} (${p.type})`)
})
```

### 10. Compare Pattern Categories

```typescript
// Get statistics for different pattern types
const types = ["CODEBASE", "LANG", "ANTI", "TEST"] as const

for (const type of types) {
  const response = await apex_patterns_overview({
    type: [type],
    include_stats: true,
    page_size: 1
  })
  
  const stats = response.stats!
  console.log(`${type} Patterns:`)
  console.log(`  Total: ${stats.total_patterns}`)
  console.log(`  Avg Trust: ${stats.avg_trust_score.toFixed(2)}`)
  console.log(`  High Trust: ${stats.high_trust_patterns} (${(stats.high_trust_patterns / stats.total_patterns * 100).toFixed(0)}%)`)
  console.log()
}
```

## Performance Optimizations

### Token Efficiency
- **Summaries truncated** to 200 chars (saves ~60% tokens vs full text)
- **Heavy fields excluded**: json_canonical, search_index, full implementation
- **Optional metadata**: key_insight and when_to_use only if requested
- **Optional statistics**: Stats calculated only when include_stats=true

### Query Optimization
- **Accurate pagination**: Fetches only requested page size (not all patterns)
- **Efficient counting**: Uses SQL COUNT() before fetching patterns
- **Index usage**: Leverages database indexes on type, trust_score, tags
- **Statistics caching**: Stats cached for 1 minute to reduce repeated queries

### Rate Limiting
- **50 requests per minute** (lower than lookup's 100 due to potentially expensive stats queries)
- Use pagination wisely - don't request page_size=100 if you only need 10 patterns
- Cache results client-side when possible

## Advanced Features

### Combining Filters

Filters use **AND logic** - all conditions must match:

```typescript
// Find high-trust, recently-created authentication test patterns
const specific = await apex_patterns_overview({
  type: ["TEST"],              // AND
  tags: ["auth"],              // AND
  min_trust: 0.8,              // AND
  max_age_days: 30,            // AND
  order_by: "trust_score",
  order: "desc"
})
```

### Handling NULL Fields

Some patterns may have optional fields:
- `alias` - May be null if no URL-friendly alias set
- `success_rate` - Only present if pattern was actually used (usage_count > 0)
- `key_insight` - Only in response if include_metadata=true
- `when_to_use` - Only in response if include_metadata=true

### Status Filtering

```typescript
// Default: Only active patterns
const active = await apex_patterns_overview({ status: "active" })

// Get quarantined patterns (invalid or flagged)
const quarantined = await apex_patterns_overview({ status: "quarantined" })

// Get all patterns regardless of status
const all = await apex_patterns_overview({ status: "all" })
```

## Common Errors and Solutions

### Error: "Invalid overview request: page_size: Number must be less than or equal to 100"
**Solution**: Set `page_size` to 100 or less. Default is 50.

### Error: "Rate limit exceeded (50 requests per minute)"
**Solution**: 
- Reduce request frequency
- Use pagination more efficiently (larger page_size)
- Cache results client-side

### Error: "Invalid overview request: min_trust: Number must be less than or equal to 1"
**Solution**: Trust scores are 0.0-1.0, not percentages. Use 0.8, not 80.

### Response has 0 patterns despite matching criteria
**Possible causes**:
- No patterns match all filters (filters use AND logic)
- Page number exceeds total_pages
- status="active" but all matching patterns are quarantined

**Debug strategy**:
```typescript
// Remove filters one by one to find the constraint
const response1 = await apex_patterns_overview({ type: ["LANG"] })
console.log(`LANG patterns: ${response1.pagination.total_items}`)

const response2 = await apex_patterns_overview({ type: ["LANG"], tags: ["auth"] })
console.log(`LANG + auth patterns: ${response2.pagination.total_items}`)

const response3 = await apex_patterns_overview({ 
  type: ["LANG"], 
  tags: ["auth"], 
  min_trust: 0.8 
})
console.log(`LANG + auth + high-trust: ${response3.pagination.total_items}`)
```

## Integration with Other Tools

### Overview → Explain (Deep Dive)

```typescript
// 1. Browse patterns to find interesting ones
const overview = await apex_patterns_overview({
  type: ["LANG"],
  tags: ["auth"],
  min_trust: 0.8
})

// 2. Pick pattern for deep dive
const interestingPattern = overview.patterns[0]

// 3. Get full details
const details = await apex_patterns_explain({
  pattern_id: interestingPattern.id,
  verbosity: "detailed"
})

console.log(`Pattern: ${details.pattern.title}`)
console.log(`Trust: ${details.trust_context.trust_score}`)
console.log(`When to use: ${details.explanation.when_to_use}`)
console.log(`Examples:`, details.examples)
```

### Overview → Lookup (Task Context)

```typescript
// 1. Browse test patterns to see what's available
const testPatterns = await apex_patterns_overview({
  type: ["TEST"],
  order_by: "trust_score",
  order: "desc"
})

console.log(`We have ${testPatterns.pagination.total_items} test patterns`)

// 2. Now use task-specific lookup for current work
const relevantPatterns = await apex_patterns_lookup({
  task: "write unit tests for authentication API",
  workflow_phase: "validator",
  code_context: {
    current_file: "tests/auth.test.ts"
  }
})
```

### Statistics for Reporting

```typescript
// Generate pattern health report
async function generatePatternReport() {
  // Get overall stats
  const overall = await apex_patterns_overview({
    include_stats: true,
    page_size: 1
  })
  
  // Get type-specific breakdowns
  const types = ["CODEBASE", "LANG", "ANTI", "TEST", "MIGRATION"]
  const breakdown = {}
  
  for (const type of types) {
    const response = await apex_patterns_overview({
      type: [type],
      include_stats: true,
      page_size: 1
    })
    breakdown[type] = response.stats
  }
  
  // Generate report
  console.log("📊 APEX Pattern Database Report")
  console.log("================================")
  console.log(`Total Patterns: ${overall.stats.total_patterns}`)
  console.log(`Average Trust: ${overall.stats.avg_trust_score.toFixed(2)}`)
  console.log(`High-Trust Patterns: ${overall.stats.high_trust_patterns}`)
  console.log()
  console.log("By Type:")
  Object.entries(breakdown).forEach(([type, stats]) => {
    console.log(`  ${type}: ${stats.total_patterns} (avg trust: ${stats.avg_trust_score.toFixed(2)})`)
  })
}
```

## Best Practices

1. **Use appropriate page_size**: Default 50 is good for browsing. Use smaller (10-20) for initial exploration, larger (100) for bulk operations.

2. **Cache statistics**: If showing stats in UI, cache for 1+ minute since they're expensive to calculate.

3. **Progressive loading**: Load first page immediately, subsequent pages on demand (pagination UX pattern).

4. **Filter early**: Apply filters at API level, not client-side, for better performance.

5. **Sort by trust for quality**: When unsure, sort by trust_score DESC to see best patterns first.

6. **Include metadata selectively**: Only request metadata when you'll actually use it (saves tokens).

7. **Combine with lookup**: Use overview for discovery, then lookup for task-specific recommendations.

8. **Monitor pagination totals**: If total_items is unexpectedly low, check your filters.

9. **Check success_rate**: Higher success_rate is often more important than raw trust_score for practical patterns.

10. **Respect rate limits**: 50 req/min is plenty for browsing. Don't hammer the API.

## Comparison with Other Pattern Tools

| Feature | overview | lookup | discover | explain |
|---------|----------|--------|----------|---------|
| **Primary Use** | Browse/manage | Task-specific | Semantic search | Deep dive |
| **Input** | Filters | Task description | Natural language | Pattern ID |
| **Context Aware** | ❌ No | ✅ Yes | ⚠️ Partial | ⚠️ Partial |
| **Pagination** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ N/A |
| **Statistics** | ✅ Optional | ❌ No | ⚠️ Implicit | ❌ No |
| **Sorting** | ✅ 5 fields | ⚠️ By rank | ⚠️ By score | ❌ N/A |
| **Filtering** | ✅ Rich | ⚠️ Facets | ⚠️ Basic | ❌ N/A |
| **Token Cost** | Low | Medium | Medium | High |
| **Response Size** | Compressed | Compressed | Medium | Full |

**When to use each**:
- 🔍 **overview**: "Show me all auth patterns", "What test patterns exist?", "Pattern health dashboard"
- 🎯 **lookup**: "Patterns for implementing JWT auth", "Patterns for my current file context"
- 🔮 **discover**: "Find patterns about caching", "Patterns similar to my approach"
- 📖 **explain**: "How do I use PAT:AUTH:JWT?", "When should I apply this pattern?"

---

**Remember**: `apex_patterns_overview` is your pattern catalog browser. Use it to understand what patterns exist, track pattern health, and discover patterns by administrative criteria. For task-specific work, switch to `apex_patterns_lookup` or `apex_patterns_discover`.

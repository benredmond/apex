# Compound Knowledge System Design

**Date**: 2026-01-26
**Status**: Approved
**Task**: compound-knowledge (sDRrzDhi1yAXFglMiAKiV)

## Overview

Capture learnings from any session to make future agents more effective.

**Data flow**:
```
Session ends → /apex:compound → <future-agent-notes> in task file
                                      ↓
                              (optional) promote to CLAUDE.md
                                      ↓
New session → /apex:research → learnings-researcher agent
                                      ↓
                              Top 5 relevant past learnings in context
```

## Artifacts

### New Files
- `/skills/compound/SKILL.md` - The `/apex:compound` skill
- `/agents/learnings-researcher.md` - Required research agent

### Modified Files
- `/skills/research/SKILL.md` - Add learnings-researcher to required agents, add `<past-learnings>` output
- `/skills/ship/SKILL.md` - Add prompt after commit

### Data Changes
- Task files get `<future-agent-notes>` section and `related_tasks` frontmatter
- CLAUDE.md gets `## Learnings` section (when promoted)

---

## 1. `<future-agent-notes>` Structure

**Location**: Appended to task file (`apex/tasks/<identifier>.md`)

**Frontmatter addition**:
```yaml
---
# ... existing frontmatter ...
related_tasks: [task-id-1, task-id-2]
---
```

**Section structure**:
```xml
<future-agent-notes>
  <timestamp>2026-01-26</timestamp>

  <problems>
    <problem>
      <what>Database queries timing out under load</what>
      <symptoms>
        - API responses > 30s on /users endpoint
        - PostgreSQL logs showing sequential scans
      </symptoms>
      <root-cause>Missing index on users.organization_id</root-cause>
      <solution>Added composite index (organization_id, created_at)</solution>
      <prevention>Run EXPLAIN ANALYZE on new queries hitting large tables</prevention>
    </problem>
  </problems>

  <decisions>
    <decision>
      <choice>Used Redis for session storage instead of PostgreSQL</choice>
      <alternatives>PostgreSQL sessions, JWT stateless</alternatives>
      <rationale>Need sub-ms lookup; PostgreSQL added 15ms latency; JWT couldn't support revocation</rationale>
    </decision>
  </decisions>

  <gotchas>
    <gotcha>NextJS middleware runs on edge - can't use Node.js APIs like `fs`</gotcha>
    <gotcha>Prisma requires regenerating client after schema changes, even in dev</gotcha>
  </gotchas>
</future-agent-notes>
```

**Rules**:
- All three sections optional (include only what's relevant)
- Multiple items per section allowed
- Freeform markdown within each element

---

## 2. `/apex:compound` Skill Workflow

**Invocation**: `/apex:compound [task-identifier]` (or infer from current task file)

### Step 1: Check existing learnings
- Search `apex/tasks/*.md` for similar problems/decisions/gotchas
- Use grep on `<future-agent-notes>` sections with keywords from current task
- If similar found, display them:
  ```
  Found potentially related learnings:

  1. task-abc123: "Missing index on large table caused timeouts"
  2. task-def456: "Chose Redis over PostgreSQL for sessions"

  Continue documenting? (These will be linked as related)
  ```

### Step 2: Gather learnings from session
- Prompt agent to review conversation/task for:
  - Problems encountered and how they were solved
  - Decisions made and their rationale
  - Surprising gotchas or caveats discovered
- Agent synthesizes into structured format

### Step 3: Write to task file
- Append `<future-agent-notes>` section to task file
- Update frontmatter with `related_tasks` if similar tasks found

### Step 4: Offer promotion
```
Learnings captured.

Promote any to CLAUDE.md? (These become "always loaded" context)
1. [Problem] Missing index on users.organization_id
2. [Gotcha] NextJS middleware can't use Node.js APIs
3. None - done

Select (1, 2, 3, or comma-separated):
```

### Step 5: Promote to CLAUDE.md (if selected)
- Read CLAUDE.md
- Find or create `## Learnings` section
- Append selected items in condensed format

---

## 3. `learnings-researcher` Agent

**Location**: `/agents/learnings-researcher.md`

**Purpose**: Find relevant past learnings during research phase. Required agent (always runs).

**Inputs**:
- Task intent/description from current task
- Keywords extracted from intent

**Process**:
1. Grep `apex/tasks/*.md` for `<future-agent-notes>` sections
2. Also scan `<research>`, `<plan>`, `<implementation>`, `<ship>` for relevant context
3. Score relevance based on keyword overlap with current task intent
4. Follow `related_tasks` links to find connected learnings
5. Rank and select top 5

**Output format**:
```yaml
learnings_found: 5
relevance_threshold: 0.3

relevant_learnings:
  - task_id: task-abc123
    title: "Add user search API endpoint"
    relevance: 0.85
    summary: |
      Problem: N+1 queries on user.organizations relationship
      Solution: Added eager loading with includes()
      Gotcha: Prisma include syntax differs from ActiveRecord
    source_sections: [future-agent-notes, implementation]

  - task_id: task-def456
    title: "Optimize dashboard queries"
    relevance: 0.72
    summary: |
      Decision: Used materialized view instead of real-time aggregation
      Rationale: Dashboard could tolerate 5-min staleness, 100x faster
    source_sections: [future-agent-notes, plan]
```

**Integration**: Research phase includes this output in the intelligence report under a new `<past-learnings>` section.

---

## 4. Changes to Existing Skills

### `research/SKILL.md`

Add `learnings-researcher` to required agents (step 6):
```markdown
6. **Spawn 6+ parallel agents:**
   - `intelligence-gatherer` - Pattern library + similar tasks
   - `implementation-pattern-extractor` - Codebase conventions
   - `web-researcher` - Official docs, best practices
   - `apex:git-historian` - 9-month git analysis
   - `apex:documentation-researcher` - Project docs, ADRs
   - `learnings-researcher` - Past task learnings (REQUIRED)
   - `apex:systems-researcher` (signal-based)
   - `apex:risk-analyst` (signal-based)
```

Add `<past-learnings>` to research output structure:
```xml
<research>
  <!-- ... existing sections ... -->

  <past-learnings>
    <count>5</count>
    <learnings>
      <!-- Output from learnings-researcher agent -->
    </learnings>
  </past-learnings>

  <!-- ... rest of sections ... -->
</research>
```

### `ship/SKILL.md`

After commit step, add prompt:
```markdown
8. **Prompt for compounding**
   After successful commit, display:

   ✓ Committed: [commit SHA]

   Run `/apex:compound` to capture learnings for future agents.
```

---

## 5. CLAUDE.md Promotion Format

**Section location**: `## Learnings` (create at end of file if doesn't exist)

**Format**:
```markdown
## Learnings

<!-- Auto-generated by /apex:compound. Do not edit directly. -->

### Problems

- **Missing database indexes cause timeouts** - Always run EXPLAIN ANALYZE on queries hitting large tables. (from task-abc123, 2026-01-26)

- **Connection pooling leaks without try-finally** - Wrap pooled connections in try-finally with explicit close(). (from task-xyz789, 2026-01-20)

### Gotchas

- **NextJS middleware runs on edge** - Can't use Node.js APIs like `fs` or `path` in middleware. Use edge-compatible alternatives. (from task-abc123, 2026-01-26)

### Decisions

- **Redis over PostgreSQL for sessions** - When sub-ms lookup needed and revocation required, Redis wins over PostgreSQL (15ms latency) or JWT (no revocation). (from task-def456, 2026-01-15)
```

**Rules**:
- Condensed format (1-2 sentences max)
- Always include source task and date for traceability
- Grouped by type (problems, gotchas, decisions)
- Agent checks for duplicates before adding

---

## Implementation Order

1. Create `/agents/learnings-researcher.md`
2. Create `/skills/compound/SKILL.md`
3. Modify `/skills/research/SKILL.md` - add agent and output section
4. Modify `/skills/ship/SKILL.md` - add prompt
5. Test end-to-end flow

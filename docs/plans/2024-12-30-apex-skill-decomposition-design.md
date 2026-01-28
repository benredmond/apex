# APEX Skill Decomposition Design

**Date**: 2024-12-30
**Status**: Approved
**Author**: Ben + Claude

## Problem

The current `execute_task.md` is a ~2000-line monolith that runs all 5 phases (ARCHITECT, BUILDER, VALIDATOR, REVIEWER, DOCUMENTER) in a single session. This creates issues:

1. **Context overflow**: Long tasks exhaust context windows
2. **No natural breakpoints**: Can't pause between phases
3. **Hard to iterate**: Changing one phase requires editing the monolith
4. **No session isolation**: Can't start fresh context between phases

## Solution

Decompose into **4 focused skills** + **1 orchestrator**, with a **single task file** that grows as phases complete.

### Skill Structure

```
skills/apex/
├── research.md      # Intelligence gathering
├── plan.md          # Architecture (ARCHITECT phase)
├── implement.md     # Build + validate loop (BUILDER + VALIDATOR)
├── ship.md          # Review + finalize (REVIEWER + DOCUMENTER + reflect)
└── execute.md       # Orchestrator - calls all 4 in sequence
```

### Phase Mapping

| Old Phase | New Skill | Responsibility |
|-----------|-----------|----------------|
| (Pre-execution) | `/apex research` | Spawn intelligence agents, gather patterns, explore codebase |
| ARCHITECT | `/apex plan` | 5 mandatory artifacts, architecture decision |
| BUILDER + VALIDATOR | `/apex implement` | Write code, run tests, iterate until passing |
| REVIEWER + DOCUMENTER | `/apex ship` | Adversarial review, documentation, `apex_reflect` |

### Task File

**Location**: `./apex/tasks/[ID].md` (project-local for greppability)

**Format** (XML sections for better LLM parsing):
```markdown
---
id: [database_id]
identifier: [human-readable-id]
title: [Task title]
created: [ISO timestamp]
updated: [ISO timestamp]
phase: research|plan|implement|ship|complete
status: active|complete|failed
---

# [Title]

<research>
[Appended by /apex research]
</research>

<plan>
[Appended by /apex plan]
</plan>

<implementation>
[Appended by /apex implement]
</implementation>

<ship>
[Appended by /apex ship]
</ship>
```

### Invocation Patterns

**Starting a task**:
```bash
/apex research "implement dark mode toggle"
/apex research APE-59
/apex research ./tickets/feature.md
```

**Continuing a task**:
```bash
/apex plan auth-timeout-fix
/apex implement auth-timeout-fix
/apex ship auth-timeout-fix
```

**Full run (single session)**:
```bash
/apex execute "implement dark mode toggle"
/apex execute APE-59
```

### Phase Gating

Each skill checks frontmatter `phase` before running:

| Skill | Requires Phase | Sets Phase To |
|-------|---------------|---------------|
| `/apex research` | (none - creates file) | `research` |
| `/apex plan` | `research` | `plan` |
| `/apex implement` | `plan` | `implement` |
| `/apex ship` | `implement` | `complete` |

If phase doesn't match, skill refuses with helpful message pointing to correct skill.

### Orchestrator Behavior

`/apex execute [input]`:

1. Invoke `/apex research [input]` via Skill tool
2. Wait for completion, verify phase is `research`
3. Invoke `/apex plan [task_id]`
4. Wait for completion, verify phase is `plan`
5. Invoke `/apex implement [task_id]`
6. Wait for completion, verify phase is `implement`
7. Invoke `/apex ship [task_id]`
8. Wait for completion, verify phase is `complete`
9. Report final summary

If any skill needs user input or fails, orchestrator pauses. User can resume with individual skills.

### Section Content Requirements

| Section | Must Include |
|---------|--------------|
| `## Research` | Context pack summary, patterns found (with trust scores), risks identified, 3 solution recommendations |
| `## Plan` | Chosen architecture, 5 ARCHITECT artifacts, files to modify, implementation sequence, validation plan |
| `## Implementation` | Files changed (with diffs/summaries), test results, patterns applied, issues encountered |
| `## Ship` | Review findings (from adversarial agents), final status, reflection summary, lessons learned |

### Migration Plan

**Phase 1: Rename legacy commands**
```
commands/research.md → commands/research-legacy.md
commands/plan.md → commands/plan-legacy.md
```

**Phase 2: Create new skills**
```
skills/apex/research.md      (~300 lines, adapted from research-legacy)
skills/apex/plan.md          (~400 lines, adapted from plan-legacy)
skills/apex/implement.md     (~400 lines, extracted from execute_task.md)
skills/apex/ship.md          (~300 lines, extracted from execute_task.md)
skills/apex/execute.md       (~50 lines, new orchestrator)
```

**Phase 3: Deprecate execute_task.md**
- Keep for reference initially
- Remove once new skills are validated

### Skill Format: XML-Based

Skills should use XML structure for information density and LLM parseability:

```xml
<skill>
  <name>apex:research</name>
  <description>Intelligence gathering phase</description>

  <phase-gate requires="none" sets="research" />

  <workflow>
    <step id="1" title="Identify or create task">
      <instructions>...</instructions>
    </step>
    <step id="2" title="Spawn intelligence agents">
      <agents parallel="true">
        <agent type="intelligence-gatherer">...</agent>
        <agent type="web-researcher">...</agent>
      </agents>
    </step>
  </workflow>

  <output appends-to="research">
    <format>...</format>
  </output>
</skill>
```

Benefits over markdown-with-headers:
- Clearer boundaries for LLM parsing
- More information dense
- Structured attributes (e.g., `parallel="true"`)
- Easier to validate/lint

### Shared Patterns

Extract to skill preamble or shared reference:
- Frontmatter parsing/updating
- Phase gate checking
- Task file read/append logic
- APEX MCP tool usage patterns

### Benefits

1. **Session isolation**: Start fresh context for each phase
2. **Debuggability**: One file shows full task history
3. **Flexibility**: Run phases individually or chained
4. **Maintainability**: ~400 lines per skill vs 2000-line monolith
5. **Greppability**: `./apex/tasks/` is project-local

### Future Work

**`/apex debug` skill** - fits into the implement loop:

```
/apex implement ←→ /apex debug
      ↑_______________|
      (loop until fixed)
```

- Reads `<implementation>` section and error context
- Applies systematic debugging methodology
- Spawns diagnostic agents (systems-researcher, git-historian)
- Appends findings to `<debug>` section (or inline in implementation)
- Hands back to `/apex implement` to retry

### Open Questions

None - design approved.

---

*Generated during brainstorming session 2024-12-30*

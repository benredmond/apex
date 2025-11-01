# APEX Migration Plan: MCP → CLI + Skills Plugin

**Date**: 2025-10-18
**Version**: 2.0.0 Migration Strategy
**Status**: Planning Phase
**Author**: Claude Code Research

---

## Executive Summary

**Goal**: Transform APEX from MCP server to agent-first CLI + Skills plugin architecture

**Strategy**: Big Bang migration (v2.0.0) - Remove MCP, ship CLI primitives + orchestration Skills

**Timeline**: 8-10 week single release cycle (includes Week 0 foundation + beta testing)

**Key Changes**:
- ✅ CLI expands to 23 agent-first primitive commands (JSON output)
- ✅ Skills package as Claude Code plugin for auto-discovery
- ✅ Progressive disclosure via Skill structure (not MCP tool schemas)
- ✅ Slash command kickstarts → Skill orchestrates workflow
- ❌ MCP completely removed (breaking change acceptable)

**Why This Migration?**
- **Context Efficiency**: MCP tool schemas bloat context; Skills use progressive disclosure
- **Agent-First Design**: JSON output optimized for AI parsing, not human reading
- **Unix Philosophy**: CLI primitives compose well, Skills orchestrate them
- **Easy Distribution**: Plugin system enables one-command installation

---

## Current State Analysis

### MCP Architecture (v1.x)

**12 MCP Tools**:
1. `apex_patterns_lookup` - Find relevant patterns
2. `apex_reflect` - Submit reflections
3. `apex_patterns_discover` - Semantic search
4. `apex_patterns_explain` - Pattern details
5. `apex_task_create` - Create tasks
6. `apex_task_find` - Find tasks
7. `apex_task_find_similar` - Similarity search
8. `apex_task_update` - Update task
9. `apex_task_checkpoint` - Progress tracking
10. `apex_task_complete` - Complete task
11. `apex_task_context` - Get intelligence
12. `apex_task_append_evidence` - Evidence tracking

**Context Cost**: ~13,300 tokens for all tool schemas (before optimization)
**After optimization**: ~2,311 tokens (82.6% reduction, still too much)

**Problem**: All tool schemas loaded upfront, even if only 1-2 tools used per session

### Target State (v2.0)

**23 CLI Commands** (agent-first, JSON output)
**1 Reference Skill** (CLI usage guide, progressive disclosure)
**1 Slash Command** (workflow orchestration)
**0 MCP Tools** (complete removal)

**Context Cost**: ~150-250 tokens for Skill frontmatter, details loaded progressively

**Benefit**: 80-90% context reduction through progressive disclosure

---

## Phase 1: CLI Primitive Expansion

### Current CLI (6 commands)
```bash
apex start                 # Setup
apex patterns list/search  # Pattern viewing
apex tasks list/stats      # Task viewing
apex doctor                # Health check
apex mcp info/serve/test   # MCP (to be removed)
```

### Target CLI (23 commands)

#### Task Management (10 commands)

```bash
# Create task with auto-generated brief
apex task create <intent> [--type TYPE] [--identifier ID] [--tags TAGS]
# Output: {"success": true, "data": {"task_id": "T001", "brief": {...}}}

# Find tasks by criteria
apex task find [--status STATUS] [--task-id ID] [--tags TAGS] [--limit N]
# Output: {"success": true, "data": {"tasks": [...]}}

# Find similar tasks using cached similarity
apex task similar <task-id> [--limit N]
# Output: {"success": true, "data": {"tasks": [...]}}

# Get single task details
apex task get <task-id>
# Output: {"success": true, "data": {"task": {...}}}

# Update task (phase, confidence, files, errors)
apex task update <task-id> [--phase PHASE] [--confidence N] [--files FILES]
# Output: {"success": true, "data": {"updated": true}}

# Add checkpoint
apex task checkpoint <task-id> <message> [--confidence N]
# Output: {"success": true, "data": {"checkpoint_id": "..."}}

# Complete task and get reflection draft
apex task complete <task-id> --outcome OUTCOME --learning TEXT [--patterns PATS]
# Output: {"success": true, "data": {"reflection_draft": {...}}}

# Get context pack (intelligence)
apex task context <task-id> [--packs LIST] [--max-size BYTES]
# Output: {"success": true, "data": {"context_pack": {...}}}

# Append evidence
apex task evidence <task-id> --type TYPE <content> [--metadata JSON]
# Output: {"success": true, "data": {"evidence_id": "..."}}

# List recent tasks
apex task list [--limit N] [--status STATUS]
# Output: {"success": true, "data": {"tasks": [...]}}
```

#### Pattern Operations (7 commands)

```bash
# Context-aware pattern lookup
apex patterns lookup <task> [--phase PHASE] [--context JSON] [--page N]
# Output: {"success": true, "data": {"pattern_pack": {...}}}

# Semantic pattern search
apex patterns discover <query> [--min-score N] [--limit N] [--context JSON]
# Output: {"success": true, "data": {"patterns": [...]}}

# Get pattern explanation
apex patterns explain <pattern-id> [--verbosity LEVEL] [--context JSON]
# Output: {"success": true, "data": {"explanation": {...}}}

# List all patterns
apex patterns list [--limit N] [--format json]
# Output: {"success": true, "data": {"patterns": [...]}}

# Search patterns by text
apex patterns search <query> [--limit N]
# Output: {"success": true, "data": {"patterns": [...]}}

# Pattern statistics
apex patterns stats
# Output: {"success": true, "data": {"total": N, "by_category": {...}}}

# Export patterns
apex patterns export [--format json]
# Output: {"success": true, "data": {"patterns": [...]}}
```

#### Reflection (2 commands)

```bash
# Submit reflection
apex reflect <task-id> --outcome OUTCOME [--claims JSON] [--patterns USED]
# Output: {"success": true, "data": {"reflection_id": "..."}}

# Validate reflection structure
apex reflect validate <reflection-file>
# Output: {"success": true, "data": {"valid": true, "errors": []}}
```

#### System (4 commands)

```bash
# Initialize APEX (remove MCP setup)
apex start [--force]
# Output: {"success": true, "data": {"db_path": "...", "plugin_suggested": true}}

# System diagnostics
apex doctor [--verbose]
# Output: {"success": true, "data": {"health": {...}}}

# Database info
apex db info
# Output: {"success": true, "data": {"path": "...", "size": N, "tables": [...]}}

# Run migrations
apex db migrate
# Output: {"success": true, "data": {"migrations_run": N}}
```

### Output Format Standard

**Success Response**:
```json
{
  "success": true,
  "data": {
    // Command-specific data
  },
  "metadata": {
    "timestamp": "2025-10-18T12:34:56Z",
    "version": "2.0.0",
    "command": "apex task create"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task T001 not found in database",
    "details": {}
  },
  "metadata": {
    "timestamp": "2025-10-18T12:34:56Z",
    "version": "2.0.0",
    "command": "apex task get"
  }
}
```

### Implementation Strategy

**File Organization**:
```
src/cli/
├── apex.js                    # Main CLI entry (updated)
├── commands/
│   ├── task.js               # NEW: 10 task commands
│   ├── patterns.js           # NEW: 7 pattern commands
│   ├── reflect.js            # NEW: 2 reflection commands
│   └── system.js             # NEW: 4 system commands
├── formatters/
│   └── json-output.js        # NEW: Standardized JSON formatting
└── utils/
    ├── cli-args.js           # NEW: Argument parsing
    └── error-codes.js        # NEW: Error code constants
```

**Service Reuse**:
- CLI commands are thin wrappers around existing services
- `TaskService`, `PatternLookupService`, `ReflectionService` remain unchanged
- Database layer stays the same
- Only interface changes: MCP → CLI

**Testing Strategy**:
- Unit tests for each CLI command
- Integration tests with database
- Snapshot tests for JSON output format
- Error handling tests for each error code

---

## Phase 2: Skills Architecture

### Plugin Structure

```
apex-plugin/                          # NEW: Plugin repository
├── .claude-plugin/
│   └── plugin.json                   # Plugin manifest
├── skills/
│   └── using-apex-cli/
│       └── SKILL.md                  # CLI reference guide
├── commands/
│   └── apex-task.md                  # Slash command for workflow orchestration
└── README.md
```

### Skill: using-apex-cli/SKILL.md

**Purpose**: Reference documentation for APEX CLI primitives - a comprehensive man page for all CLI commands, JSON output formats, and usage patterns.

**When to Use**:
- When you need help with CLI command syntax
- When parsing JSON output from APEX commands
- When interpreting pattern trust scores
- When troubleshooting CLI errors

**NOT a workflow guide** - This skill is a reference manual. For workflow orchestration, use the `/apex-task` slash command.

**Key Content**:
```markdown
---
name: Using APEX CLI
description: Reference guide for APEX CLI primitives, JSON output formats, and command usage
when_to_use: When you need help with CLI syntax, JSON parsing, or command reference. NOT for workflow orchestration.
version: 2.0.0
---

# Using APEX CLI Reference

## Quick Reference

### Task Commands
```bash
apex task create <intent> [--type TYPE] [--tags TAGS]
apex task find [--status STATUS] [--task-id ID]
apex task get <task-id>
apex task update <task-id> [--phase PHASE] [--confidence N]
apex task checkpoint <task-id> <message> [--confidence N]
apex task complete <task-id> --outcome OUTCOME --learning TEXT
apex task context <task-id> [--packs LIST]
apex task evidence <task-id> --type TYPE <content>
apex task similar <task-id> [--limit N]
apex task list [--limit N]
```

### Pattern Commands
```bash
apex patterns lookup <task> [--phase PHASE]
apex patterns discover <query> [--min-score N]
apex patterns explain <pattern-id> [--verbosity LEVEL]
apex patterns list [--limit N]
apex patterns search <query>
apex patterns stats
apex patterns export
```

### Reflection Commands
```bash
apex reflect <task-id> --outcome OUTCOME [--claims JSON]
apex reflect validate <reflection-file>
```

### System Commands
```bash
apex start
apex doctor
apex db info
apex db migrate
```

## JSON Output Format

All commands return standardized JSON:

**Success Response**:
```json
{
  "success": true,
  "data": {
    // Command-specific data
  },
  "metadata": {
    "timestamp": "2025-10-18T12:34:56Z",
    "version": "2.0.0",
    "command": "apex task create"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task T001 not found in database",
    "details": {}
  },
  "metadata": {
    "timestamp": "2025-10-18T12:34:56Z",
    "version": "2.0.0",
    "command": "apex task get"
  }
}
```

## Command Documentation

### apex task create

Create a new task with auto-generated brief.

**Syntax**:
```bash
apex task create <intent> [--type TYPE] [--identifier ID] [--tags TAGS]
```

**Arguments**:
- `<intent>`: Task description (required)
- `--type`: Task type (feature|bug|refactor|test|docs|perf)
- `--identifier`: External ID (e.g., "APE-123")
- `--tags`: Comma-separated tags

**Output**:
```json
{
  "success": true,
  "data": {
    "task_id": "T001",
    "brief": {
      "intent": "Implement user authentication",
      "type": "feature",
      "tags": ["auth", "security"]
    }
  }
}
```

**Example**:
```bash
TASK_JSON=$(apex task create "Implement JWT auth" --type feature --tags "auth,security")
TASK_ID=$(echo $TASK_JSON | jq -r '.data.task_id')
```

### apex task context

Get intelligence pack for a task (similar tasks, patterns, execution strategy).

**Syntax**:
```bash
apex task context <task-id> [--packs LIST] [--max-size BYTES]
```

**Output**:
```json
{
  "success": true,
  "data": {
    "context_pack": {
      "similar_tasks": [...],
      "pattern_cache": [...],
      "execution_strategy": {...}
    }
  }
}
```

**Example**:
```bash
CONTEXT=$(apex task context T001 --packs tasks,patterns)
PATTERNS=$(echo $CONTEXT | jq -r '.data.context_pack.pattern_cache')
```

### apex patterns lookup

Find patterns relevant to a task (context-aware).

**Syntax**:
```bash
apex patterns lookup <task> [--phase PHASE] [--context JSON]
```

**Output**:
```json
{
  "success": true,
  "data": {
    "pattern_pack": {
      "patterns": [
        {
          "id": "PAT:AUTH:JWT",
          "title": "JWT Authentication",
          "trust_score": 0.92,
          "usage_count": 15,
          "snippets": [...]
        }
      ]
    }
  }
}
```

### apex reflect

Submit reflection to update pattern trust scores.

**Syntax**:
```bash
apex reflect <task-id> --outcome OUTCOME [--patterns PATS] [--claims JSON]
```

**Arguments**:
- `--outcome`: success|partial|failure
- `--patterns`: Comma-separated pattern IDs
- `--claims`: JSON object with pattern outcomes

**Example**:
```bash
apex reflect T001 --outcome success \
  --patterns "PAT:AUTH:JWT" \
  --claims '{
    "patterns_used": [
      {"pattern_id": "PAT:AUTH:JWT", "outcome": "worked-perfectly"}
    ],
    "trust_updates": [
      {"pattern_id": "PAT:AUTH:JWT", "outcome": "worked-perfectly"}
    ]
  }'
```

## Pattern Trust Scores

Trust scores range from 0.0 to 1.0:

- **★★★★★ (0.9+)**: Proven pattern, apply confidently
- **★★★★☆ (0.8-0.9)**: Reliable, may need minor tweaks
- **★★★☆☆ (0.6-0.8)**: Promising, validate before using
- **★★☆☆☆ (<0.6)**: Experimental, use with caution

**Parsing trust scores**:
```bash
PATTERNS=$(apex patterns lookup "authentication")
echo $PATTERNS | jq -r '.data.pattern_pack.patterns[] |
  select(.trust_score >= 0.8) |
  "\(.id): \(.title) (\(.trust_score))"'
```

## Common Patterns

### Error Handling
```bash
# Check CLI success
if ! echo $OUTPUT | jq -e '.success' > /dev/null; then
  ERROR=$(echo $OUTPUT | jq -r '.error.message')
  echo "Error: $ERROR"
  exit 1
fi
```

### Parsing Task ID
```bash
TASK_JSON=$(apex task create "Fix bug")
TASK_ID=$(echo $TASK_JSON | jq -r '.data.task_id')
```

### Extracting Patterns from Context
```bash
CONTEXT=$(apex task context T001)
PATTERNS=$(echo $CONTEXT | jq -r '.data.context_pack.pattern_cache')
HIGH_TRUST=$(echo $PATTERNS | jq -r '.[] | select(.trust_score >= 0.8)')
```

### Building Claims JSON
```bash
CLAIMS=$(cat <<'EOF'
{
  "patterns_used": [
    {"pattern_id": "PAT:AUTH:JWT", "outcome": "worked-perfectly"}
  ],
  "trust_updates": [
    {"pattern_id": "PAT:AUTH:JWT", "outcome": "worked-perfectly"}
  ],
  "learnings": [
    {"assertion": "Pattern saved 2 hours vs manual implementation"}
  ]
}
EOF
)

apex reflect T001 --outcome success --claims "$CLAIMS"
```

## Troubleshooting

**CLI not found**:
```bash
npm install -g @benredmond/apex
apex --version
```

**Database not initialized**:
```bash
apex start
# Initializes ~/.apex/apex.db
```

**jq not found** (for JSON parsing):
```bash
# macOS
brew install jq

# Linux
sudo apt install jq

# Verify
which jq
```

**Task not found**:
```bash
# List recent tasks
apex task list --limit 20

# Find by identifier
apex task find --identifier "APE-123"
```

**Invalid JSON output**:
- Ensure you're on APEX v2.0.0+: `apex --version`
- Check for errors: `jq -r '.error.message'`
- Use `--verbose` flag if available

## Reference: Phase Names

Valid phase values for `apex task update --phase`:
- `ARCHITECT` - Research and design
- `BUILDER` - Implementation
- `VALIDATOR` - Testing
- `REVIEWER` - Code review
- `DOCUMENTER` - Reflection and learning

## Reference: Outcome Values

Valid outcome values for `apex reflect --outcome`:
- `success` - Task completed successfully
- `partial` - Task mostly complete, some issues
- `failure` - Task failed, captured learnings

## Reference: Pattern Outcome Values

Valid pattern outcome values in claims JSON:
- `worked-perfectly` - Applied pattern successfully, no changes
- `worked-with-tweaks` - Applied pattern with minor modifications
- `partial-success` - Pattern helped but incomplete solution
- `failed-minor-issues` - Pattern had issues but recoverable
- `failed-completely` - Pattern did not work, abandoned
```

### Slash Command: apex-task.md

**Purpose**: Workflow orchestrator that executes the 5-phase APEX development workflow by calling CLI primitives.

**When to Use**:
- When user describes work: "implement X", "fix Y", "refactor Z"
- Explicit invocation: `/apex-task "fix auth bug"`
- Any time you need structured task execution with learning

**How it Works**: The slash command orchestrates the workflow by calling APEX CLI commands and guiding you through each phase. For CLI details, it references the `using-apex-cli` skill.

**Key Content**:
```markdown
---
description: Execute development tasks with APEX 5-phase workflow (ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER)
---

# APEX Task Execution Workflow

You are about to execute a task using APEX's proven 5-phase workflow.

## Overview

This workflow guides you through:
1. **ARCHITECT** - Research and design
2. **BUILDER** - Implementation with patterns
3. **VALIDATOR** - Thorough testing
4. **REVIEWER** - Code review
5. **DOCUMENTER** - Reflection and learning

Each phase leverages pattern intelligence from your project's learning history.

## Prerequisites

Ensure APEX is set up:
```bash
# Install CLI (if not already)
npm install -g @benredmond/apex

# Initialize database
apex start
```

## Workflow Execution

### Phase 0: Task Identification

Determine what you're working on:
- **Text description**: "fix the authentication bug"
- **Task ID**: "T001"
- **Issue tracker ID**: "APE-123"

```bash
# If new task:
TASK_JSON=$(apex task create "Fix authentication timeout bug" --type bug)
TASK_ID=$(echo $TASK_JSON | jq -r '.data.task_id')

# If existing task:
TASK_ID="T001"
```

**Need CLI help?** Reference `/superpower:apex:using-apex-cli` for command syntax.

### Phase 1: Load Intelligence

Get context pack with similar tasks, patterns, and execution strategy:

```bash
CONTEXT=$(apex task context $TASK_ID --packs tasks,patterns,statistics)
```

**Parse the intelligence**:
```bash
SIMILAR_TASKS=$(echo $CONTEXT | jq -r '.data.context_pack.similar_tasks')
PATTERNS=$(echo $CONTEXT | jq -r '.data.context_pack.pattern_cache')
STRATEGY=$(echo $CONTEXT | jq -r '.data.context_pack.execution_strategy')
```

Use this intelligence throughout all phases.

### Phase 2: ARCHITECT

Research and design the solution.

```bash
# 1. Enter phase
apex task update $TASK_ID --phase ARCHITECT

# 2. Look up architecture patterns
ARCH_PATTERNS=$(apex patterns lookup "$TASK_DESCRIPTION" --phase architect)

# 3. Execute architecture work
# - Review similar tasks
# - Apply relevant patterns (check trust scores!)
# - Design solution
# - Document key decisions

# 4. Record evidence
apex task evidence $TASK_ID --type decision \
  "Chose PostgreSQL migration strategy" \
  --metadata '{"pattern":"PAT:DB:MIGRATIONS"}'

# 5. Checkpoint
apex task checkpoint $TASK_ID "Architecture complete" --confidence 0.85
```

**Pattern Application**: Check trust scores before using:
- ★★★★☆+ (0.8+) = apply confidently
- ★★★☆☆ (0.6-0.8) = apply with caution

### Phase 3: BUILDER

Implement the solution using patterns.

```bash
# 1. Enter phase
apex task update $TASK_ID --phase BUILDER

# 2. Look up implementation patterns
BUILD_PATTERNS=$(apex patterns lookup "$TASK_DESCRIPTION" --phase builder)

# 3. Execute implementation
# - Apply patterns from architecture phase
# - Write code following discovered patterns
# - Checkpoint frequently

# 4. Checkpoint progress
apex task checkpoint $TASK_ID "Core implementation complete" --confidence 0.80
```

### Phase 4: VALIDATOR

Test thoroughly.

```bash
# 1. Enter phase
apex task update $TASK_ID --phase VALIDATOR

# 2. Look up testing patterns
TEST_PATTERNS=$(apex patterns lookup "$TASK_DESCRIPTION" --phase validator)

# 3. Execute testing
# - Run unit tests
# - Run integration tests
# - Verify edge cases
# - Check test coverage

# 4. Checkpoint
apex task checkpoint $TASK_ID "All tests passing" --confidence 0.95
```

### Phase 5: REVIEWER

Review the code quality.

```bash
# 1. Enter phase
apex task update $TASK_ID --phase REVIEWER

# 2. Execute review
# - Code quality check
# - Security review
# - Performance review
# - Documentation review

# 3. Checkpoint
apex task checkpoint $TASK_ID "Code review complete" --confidence 0.90
```

### Phase 6: DOCUMENTER

Reflect and capture learnings.

```bash
# 1. Enter phase
apex task update $TASK_ID --phase DOCUMENTER

# 2. Complete task
COMPLETE_JSON=$(apex task complete $TASK_ID \
  --outcome success \
  --learning "Migration pattern worked well, saved 2 hours")

# 3. Submit reflection with pattern outcomes
apex reflect $TASK_ID \
  --outcome success \
  --patterns "PAT:DB:MIGRATIONS,PAT:TEST:INTEGRATION" \
  --claims '{
    "patterns_used": [
      {"pattern_id": "PAT:DB:MIGRATIONS", "outcome": "worked-perfectly"}
    ],
    "trust_updates": [
      {"pattern_id": "PAT:DB:MIGRATIONS", "outcome": "worked-perfectly"}
    ],
    "learnings": [
      {"assertion": "Pattern saved 2 hours vs manual approach"}
    ]
  }'
```

## CLI Reference

For detailed command syntax, JSON output formats, error handling, etc., reference:

**Skill**: `/superpower:apex:using-apex-cli`

This provides complete CLI documentation including:
- All command syntax and arguments
- JSON output format reference
- Pattern trust score interpretation
- Error handling patterns
- Troubleshooting guide

## Checkpointing Best Practices

Checkpoint frequently to track progress:
```bash
# After each significant step
apex task checkpoint $TASK_ID "Completed database schema" --confidence 0.8
apex task checkpoint $TASK_ID "Implemented migration scripts" --confidence 0.85
apex task checkpoint $TASK_ID "All tests passing" --confidence 0.95
```

Confidence ranges:
- 0.0-0.4: Early exploration, high uncertainty
- 0.5-0.7: Making progress, some blockers
- 0.8-0.9: Nearly complete, minor issues
- 0.95+: Complete and verified

## Success Indicators

✅ Task complete when:
- All 5 phases executed
- Tests passing
- Code reviewed
- Reflection submitted
- Pattern trust scores updated

## Troubleshooting

**CLI command failed?** Check the JSON output:
```bash
if ! echo $OUTPUT | jq -e '.success'; then
  echo $OUTPUT | jq -r '.error.message'
fi
```

**Need CLI help?** Reference `/superpower:apex:using-apex-cli`

**Pattern lookup empty?** Patterns build as you work. After first few tasks, pattern database will populate.
```

---

## Phase 3: Plugin Packaging

### Plugin Manifest

**File**: `apex-plugin/.claude-plugin/plugin.json`

```json
{
  "name": "apex",
  "description": "APEX - Autonomous Pattern-Enhanced eXecution. AI-powered development workflow with pattern recognition and task execution.",
  "version": "2.0.0",
  "author": {
    "name": "Ben Redmond",
    "url": "https://github.com/benredmond"
  },
  "homepage": "https://github.com/benredmond/apex",
  "repository": {
    "type": "git",
    "url": "https://github.com/benredmond/apex-plugin"
  },
  "keywords": [
    "ai",
    "development",
    "workflow",
    "patterns",
    "automation",
    "learning",
    "intelligence"
  ],
  "license": "MIT",
  "engines": {
    "claude-code": ">=1.0.0"
  },
  "dependencies": {
    "cli": {
      "package": "@benredmond/apex",
      "version": ">=2.0.0",
      "install": "npm install -g @benredmond/apex",
      "verify": "apex --version"
    }
  },
  "permissions": {
    "bash": true,
    "read": true,
    "write": true
  }
}
```

### Repository Structure

Two repositories needed:

#### 1. apex (CLI package - existing, modified)
```
apex/
├── src/
│   ├── cli/
│   │   ├── apex.js
│   │   └── commands/
│   │       ├── task.js       # NEW
│   │       ├── patterns.js   # NEW
│   │       ├── reflect.js    # NEW
│   │       └── system.js     # NEW
│   ├── storage/              # Existing
│   ├── intelligence/         # Existing
│   └── migrations/           # Existing
├── tests/
├── package.json              # Modified
└── README.md                 # Updated
```

#### 2. apex-plugin (NEW - plugin package)
```
apex-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── task-execution/
│   ├── pattern-discovery/
│   └── reflection/
├── commands/
│   └── apex-task.md
├── README.md
└── LICENSE
```

### Marketplace Structure

```
apex-marketplace/              # NEW - marketplace repository
├── .claude-plugin/
│   └── marketplace.json
└── README.md
```

**marketplace.json**:
```json
{
  "name": "apex-marketplace",
  "description": "Official APEX plugins for AI-assisted development",
  "owner": {
    "name": "Ben Redmond",
    "url": "https://github.com/benredmond"
  },
  "plugins": [
    {
      "name": "apex",
      "source": "https://github.com/benredmond/apex-plugin",
      "description": "APEX task execution with pattern intelligence",
      "version": "2.0.0"
    }
  ]
}
```

### Installation Flow

**User Journey**:
```bash
# 1. Install CLI globally
npm install -g @benredmond/apex

# 2. Initialize database
apex start

# 3. In Claude Code, add marketplace
/plugin marketplace add benredmond/apex-marketplace

# 4. Install plugin
/plugin install apex@apex-marketplace

# 5. Ready to use!
# Skills auto-invoke based on intent, or:
/apex-task "implement user authentication"
```

**Auto-Setup Detection**:
When plugin is installed, it can check for CLI:
```bash
# Plugin installation hook could run:
if ! command -v apex &> /dev/null; then
  echo "APEX CLI not found. Install with: npm install -g @benredmond/apex"
fi
```

---

## Phase 4: Migration Execution Plan

### Success Criteria (Measurable)

Before diving into the week-by-week breakdown, we need clear success metrics to verify we've achieved our goals:

#### Token Usage Target
- **Baseline**: MCP v1.x with optimization = ~2,311 tokens
- **Target**: Skills v2.0 frontmatter = ≤700 tokens (≤30% of baseline)
- **Verification**: Measure skill frontmatter token count using Claude's token counter
- **Acceptance**: Skills load <30% context of MCP for equivalent functionality

#### Performance Target
- **Baseline**: MCP tool call latency (median)
- **Target**: CLI command latency within 2x of MCP (accounting for bash overhead)
- **Verification**: Benchmark 100 calls of each command type
- **Acceptance**: p50 latency ≤ 2x MCP, p95 latency ≤ 3x MCP

#### Functional Completeness
- **Target**: 100% feature parity with MCP v1.x
- **Verification**: Integration test suite covering all 12 MCP tool equivalents
- **Acceptance**: All integration tests pass, no feature gaps

#### Skills Effectiveness
- **Target**: Skills successfully orchestrate full workflow without manual intervention
- **Verification**: Automated test suite executes 5-phase workflow via slash command
- **Acceptance**: 95% success rate on test cases (automated, not manual subagent testing)

### Week-by-Week Breakdown

#### Week 0: Pre-Flight Audit & Foundation (NEW)

**Purpose**: Establish foundation before implementation begins to avoid mid-stream blockers.

**Tasks**:
- [ ] **Locate and audit current `task.md`**
  - Verify `/src/commands/execute/task.md` exists and is suitable for porting
  - Document MCP tool references that need CLI replacements
  - Identify any hardcoded assumptions to address

- [ ] **Audit MCP dependencies**
  - List all `@modelcontextprotocol/sdk` usages
  - Map MCP-specific patterns to generic alternatives
  - Document removal plan for each dependency

- [ ] **Create database factory pattern**
  - Design `DatabaseFactory.create()` for consistent initialization
  - Handle connection pooling and lifecycle
  - Add tests for factory pattern

- [ ] **Create service factory pattern**
  - Design `ServiceFactory.create(serviceName, db)` for DI
  - Centralize service initialization logic
  - Add tests for factory pattern

- [ ] **Design JSON schema standard**
  - Define success/error response schemas
  - Create JSON Schema files for validation
  - Design error code taxonomy (see error-codes.js plan)

- [ ] **Set up automated skills testing framework**
  - Design test harness for skill invocation
  - Plan snapshot testing for skill outputs
  - Define test coverage targets (>80%)

**Deliverable**: Foundation code (factories, schemas) + audit reports + testing framework plan

**Risk**: If `task.md` is not suitable or missing, Week 3 will be blocked. Mitigate by auditing NOW.

#### Week 1: Task CLI Commands
- [ ] Create `/src/cli/commands/task.js` using DatabaseFactory and ServiceFactory
- [ ] Implement 10 task management commands with standardized JSON output
- [ ] Wire to existing `TaskService`, `TaskRepository` via factories
- [ ] Implement `/src/cli/formatters/json-output.js` (formatOutput, formatError)
- [ ] Implement `/src/cli/utils/error-codes.js` with error code constants
- [ ] Unit tests for each command (10 test suites)
- [ ] Integration tests with database
- [ ] Error handling and validation using error codes

**Deliverable**: `apex task <subcommand>` fully functional with standardized JSON

**Buffer**: Task commands are complex - allow extra time for edge cases and error handling

#### Week 2a: Pattern CLI Commands
- [ ] Create `/src/cli/commands/patterns.js`
- [ ] Implement 7 pattern commands with JSON output
- [ ] Wire to `PatternLookupService` via ServiceFactory
- [ ] Unit tests for pattern commands (7 test suites)
- [ ] Integration tests with pattern database

**Deliverable**: `apex patterns <subcommand>` fully functional

#### Week 2b: Reflection + System CLI Commands
- [ ] Create `/src/cli/commands/reflect.js`
- [ ] Implement 2 reflection commands
- [ ] Create `/src/cli/commands/system.js`
- [ ] Implement 4 system commands (update `apex start`, `doctor`, `db info`, `db migrate`)
- [ ] Wire to `ReflectionService` via ServiceFactory
- [ ] Create `/src/cli/utils/cli-args.js` for argument parsing
- [ ] Unit + integration tests for all commands

**Deliverable**: All 23 CLI commands working with JSON output

#### Week 3: Skills Development
- [ ] Create `apex-plugin` repository
- [ ] Port audited `task.md` → `commands/apex-task.md` (slash command)
- [ ] Replace MCP tool calls with CLI command references
- [ ] Create `skills/using-apex-cli/SKILL.md` (ONE skill, not three)
- [ ] Populate CLI reference guide with all 23 commands
- [ ] Add JSON parsing examples (bash + jq)
- [ ] Add pattern trust score interpretation guide
- [ ] Add troubleshooting section

**Deliverable**: ONE skill (using-apex-cli) + ONE slash command (apex-task)

**Note**: Simplified from 3 skills to 1 skill per user feedback

#### Week 3.5: Automated Skills Testing Framework
- [ ] **Design automated testing approach**
  - Create test harness that invokes skills programmatically
  - Implement snapshot testing for skill outputs
  - Design integration tests for slash command workflow

- [ ] **Implement skills test suite**
  - Test skill loading and frontmatter parsing
  - Test slash command → skill reference flow
  - Test 5-phase workflow execution (ARCHITECT → DOCUMENTER)
  - Verify CLI commands are called correctly

- [ ] **Establish coverage targets**
  - Skill content coverage >80%
  - Workflow path coverage >95%
  - Error handling coverage >90%

**Deliverable**: Automated test suite for skills (REPLACES manual subagent testing)

**Rationale**: Manual subagent testing is not scalable or repeatable. Automated tests prevent regressions.

#### Week 4: Plugin Packaging & Local Testing
- [ ] Create `.claude-plugin/plugin.json` with correct dependencies
- [ ] Validate plugin manifest against Claude Code schema
- [ ] Create `apex-marketplace` repository with marketplace.json
- [ ] Set up local marketplace for testing
- [ ] Test plugin installation flow end-to-end
- [ ] Test skill invocation (auto-invoke based on intent)
- [ ] Test slash command loading and execution
- [ ] Integration testing (full 5-phase workflow via plugin)
- [ ] Run automated skills test suite in plugin context

**Deliverable**: Plugin installs and works locally, all automated tests pass

#### Weeks 5-6: Documentation (2 weeks, NOT 1)

**Week 5: Core Documentation**
- [ ] Delete `/src/mcp/` directory entirely (server.ts, tools/, resources/, etc.)
- [ ] Remove MCP dependencies from `package.json`
- [ ] Remove MCP-related code from `apex start`
- [ ] Update `README.md` with new architecture (comprehensive rewrite)
- [ ] Create `MIGRATION_GUIDE.md` for v1.x users (detailed guide)
- [ ] Document all breaking changes with examples
- [ ] Create plugin installation guide with troubleshooting

**Week 6: Extended Documentation & Examples**
- [ ] Update all code examples in documentation
- [ ] Create workflow examples (common use cases)
- [ ] Update contributing guide
- [ ] Create API reference for all 23 CLI commands
- [ ] Document JSON schemas with examples
- [ ] Create video walkthrough (optional but recommended)
- [ ] Review and polish all documentation

**Deliverable**: Complete, production-ready documentation

**Rationale**: Documentation was severely underestimated. 2 weeks needed for quality docs.

#### Week 7.5: Beta Testing Phase (NEW)

**Purpose**: Validate migration in real-world usage before public release

**Tasks**:
- [ ] **Recruit beta testers** (5-10 users, mix of v1.x users and new users)
- [ ] **Distribute beta builds**
  - Publish to npm with `@beta` tag
  - Share plugin via GitHub beta branch
- [ ] **Monitor beta usage**
  - Set up issue tracking for beta feedback
  - Monitor token usage in real workflows
  - Track CLI command performance
  - Identify pain points in installation/setup
- [ ] **Iterate on feedback**
  - Fix critical bugs immediately
  - Document common issues
  - Improve error messages based on real usage
- [ ] **Validate success criteria**
  - Verify token usage ≤30% baseline
  - Verify CLI performance within 2x MCP
  - Verify 95% automated test pass rate
  - Collect beta tester satisfaction scores

**Deliverable**: Beta-validated build ready for public release + feedback report

**Exit Criteria**:
- ≥80% beta tester satisfaction
- No critical bugs remaining
- All success criteria met

**Rationale**: Beta testing catches issues that automated tests miss. Essential for major version.

#### Week 8: Public Release & Support
- [ ] Version bump to 2.0.0 in `package.json`
- [ ] Remove `@beta` tag, publish CLI to npm: `npm publish`
- [ ] Push plugin to GitHub: `apex-plugin` repo (main branch)
- [ ] Push marketplace to GitHub: `apex-marketplace` repo (main branch)
- [ ] Create GitHub release with comprehensive changelog
- [ ] Announce on relevant channels (Twitter, Reddit, HN, etc.)
- [ ] Monitor issues and provide migration support
- [ ] Collect feedback for iteration
- [ ] Update website/landing page if applicable

**Deliverable**: Public v2.0.0 release with support infrastructure

#### Weeks 9-10: Buffer & Iteration (NEW)

**Purpose**: Account for unforeseen issues and iteration based on real-world usage

**Expected Activities**:
- Address post-launch issues
- Patch releases (v2.0.1, v2.0.2, etc.)
- Documentation improvements based on user questions
- Performance optimizations if needed
- Plan v2.1.0 enhancements

**Rationale**: All software projects have unforeseen issues. Build buffer into timeline.

---

## Breaking Changes Documentation

### What's Removed

**Entire MCP Infrastructure**:
- ❌ `/src/mcp/` directory (1,500+ lines)
- ❌ `@modelcontextprotocol/sdk` dependency
- ❌ All MCP tool names (`apex_patterns_lookup`, `apex_task_create`, etc.)
- ❌ MCP server configuration in `apex start`
- ❌ MCP-related documentation

**Commands Removed**:
- ❌ `apex mcp info`
- ❌ `apex mcp serve`
- ❌ `apex mcp test`

### What's Added

**CLI Expansion**:
- ✅ 17 new commands (23 total vs 6 before)
- ✅ Agent-first JSON output for all commands
- ✅ Standardized error handling
- ✅ Better composability (Unix philosophy)

**Plugin System**:
- ✅ 3 focused Skills (task-execution, pattern-discovery, reflection)
- ✅ Progressive disclosure (load only what's needed)
- ✅ Auto-invocation based on intent
- ✅ Slash command for explicit invocation

**Distribution**:
- ✅ Plugin marketplace for easy installation
- ✅ One-command setup after CLI install

### Migration Path for Existing Users

**v1.x (MCP) → v2.0 (CLI + Skills)**

#### Old Way (v1.x)
```bash
# Install
npm install -g @benredmond/apex

# Setup MCP
apex start
# Manually edit ~/.config/claude/config.json to add MCP server

# Use via MCP tools
# Claude calls apex_task_create, apex_patterns_lookup, etc.
```

#### New Way (v2.0)
```bash
# Install
npm install -g @benredmond/apex@2.0.0

# Setup
apex start  # No MCP configuration needed

# Install plugin in Claude Code
/plugin marketplace add benredmond/apex-marketplace
/plugin install apex@apex-marketplace

# Use via Skills (auto-invoke) or slash command
# Claude: "I need to implement authentication"
# Or: /apex-task "implement authentication"
```

#### Migration Script (Optional Helper)

**File**: `scripts/migrate-v1-to-v2.sh`
```bash
#!/bin/bash
# APEX v1 → v2 Migration Helper

echo "🔄 APEX Migration: v1.x (MCP) → v2.0 (CLI + Skills)"
echo ""

# 1. Upgrade CLI
echo "📦 Upgrading APEX CLI to v2.0..."
npm install -g @benredmond/apex@2.0.0

# 2. Remove old MCP config (optional)
echo "🧹 Cleaning old MCP configuration..."
# This is optional - user can keep both if they want
if [ -f ~/.config/claude/config.json ]; then
  echo "   Found Claude config. You may want to remove APEX MCP server manually."
  echo "   File: ~/.config/claude/config.json"
fi

# 3. Verify installation
echo "✅ Verifying installation..."
apex --version

# 4. Instructions for plugin
echo ""
echo "📋 Next steps in Claude Code:"
echo "   1. /plugin marketplace add benredmond/apex-marketplace"
echo "   2. /plugin install apex@apex-marketplace"
echo "   3. Start using APEX with /apex-task or let Claude auto-invoke!"
echo ""
echo "Migration complete! 🎉"
```

---

## Technical Implementation Details

### Week 0 Foundation Patterns

#### DatabaseFactory Pattern

**Purpose**: Centralize database initialization and lifecycle management for consistency across CLI commands.

**File**: `src/storage/database-factory.js`

```javascript
import { PatternDatabase } from './database.js';

export class DatabaseFactory {
  static #instance = null;
  static #dbPath = null;

  /**
   * Create or get database instance
   * @param {string} dbPath - Optional path override (for testing)
   * @returns {Promise<PatternDatabase>}
   */
  static async create(dbPath = null) {
    // Use provided path or fall back to default
    const path = dbPath || this.#dbPath || this.#getDefaultPath();

    // Reuse instance if same path (connection pooling)
    if (this.#instance && this.#dbPath === path) {
      return this.#instance;
    }

    // Create new instance
    this.#instance = await PatternDatabase.create(path);
    this.#dbPath = path;

    return this.#instance;
  }

  /**
   * Close database connection (for cleanup)
   */
  static async close() {
    if (this.#instance) {
      await this.#instance.close();
      this.#instance = null;
      this.#dbPath = null;
    }
  }

  /**
   * Reset factory (for testing)
   */
  static reset() {
    this.#instance = null;
    this.#dbPath = null;
  }

  static #getDefaultPath() {
    return path.join(os.homedir(), '.apex', 'apex.db');
  }
}
```

**Tests**: `tests/storage/database-factory.test.js`
- Test singleton behavior (same path returns same instance)
- Test path override (different path creates new instance)
- Test close() cleanup
- Test reset() for testing isolation

#### ServiceFactory Pattern

**Purpose**: Centralize service initialization with proper dependency injection.

**File**: `src/services/service-factory.js`

```javascript
import { TaskService } from './task.js';
import { PatternLookupService } from './pattern-lookup.js';
import { ReflectionService } from './reflection.js';
import { TaskRepository } from '../storage/repositories/task-repository.js';
import { PatternRepository } from '../storage/repositories/pattern-repository.js';
import { DatabaseFactory } from '../storage/database-factory.js';

export class ServiceFactory {
  static #services = new Map();

  /**
   * Create or get service instance
   * @param {string} serviceName - 'task' | 'pattern' | 'reflection'
   * @param {object} options - { dbPath?: string }
   * @returns {Promise<Service>}
   */
  static async create(serviceName, options = {}) {
    const cacheKey = `${serviceName}:${options.dbPath || 'default'}`;

    // Return cached service if exists
    if (this.#services.has(cacheKey)) {
      return this.#services.get(cacheKey);
    }

    // Get database instance
    const db = await DatabaseFactory.create(options.dbPath);
    const database = db.database;

    // Create service based on name
    let service;
    switch (serviceName) {
      case 'task':
        const taskRepo = new TaskRepository(database);
        service = new TaskService(taskRepo, database);
        break;

      case 'pattern':
        const patternRepo = new PatternRepository(database);
        service = new PatternLookupService(patternRepo, database);
        break;

      case 'reflection':
        service = new ReflectionService(database);
        break;

      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }

    // Cache and return
    this.#services.set(cacheKey, service);
    return service;
  }

  /**
   * Clear service cache (for testing)
   */
  static reset() {
    this.#services.clear();
  }
}
```

**Tests**: `tests/services/service-factory.test.js`
- Test each service type creation
- Test caching behavior
- Test invalid service name error
- Test reset() cleanup
- Test database path propagation

### CLI Command Implementation Pattern

**Template** (`src/cli/commands/task.js`):
```javascript
import { ServiceFactory } from '../../services/service-factory.js';
import { formatOutput, formatError } from '../formatters/json-output.js';
import { ERROR_CODES } from '../utils/error-codes.js';

export async function taskCreate(args) {
  try {
    // Validate required arguments
    if (!args.intent || args.intent.trim() === '') {
      throw {
        code: ERROR_CODES.INVALID_ARGUMENT,
        message: 'Intent is required and cannot be empty',
        details: { argument: 'intent' }
      };
    }

    // Get service via factory (handles DB initialization)
    const taskService = await ServiceFactory.create('task');

    // Call service method
    const result = await taskService.create({
      intent: args.intent,
      type: args.type,
      identifier: args.identifier,
      tags: args.tags ? args.tags.split(',') : []
    });

    return formatOutput('apex task create', result);
  } catch (error) {
    return formatError('apex task create', error);
  }
}

export async function taskFind(args) {
  try {
    const taskService = await ServiceFactory.create('task');
    const result = await taskService.find({
      status: args.status,
      taskId: args.taskId,
      tags: args.tags ? args.tags.split(',') : [],
      limit: args.limit || 50
    });
    return formatOutput('apex task find', result);
  } catch (error) {
    return formatError('apex task find', error);
  }
}

// ... 8 more task commands following same pattern
```

**Key Improvements with Factories**:
1. ✅ No manual database initialization - factory handles it
2. ✅ Connection pooling - reuses database instance
3. ✅ Consistent error handling - all errors go through formatError
4. ✅ Argument validation - check before calling service
5. ✅ Testable - factories can be mocked/reset in tests

**Error Codes** (`src/cli/utils/error-codes.js`):
```javascript
/**
 * Standardized error codes for CLI commands
 * Format: DOMAIN_SPECIFIC_ERROR
 */
export const ERROR_CODES = {
  // Argument validation errors (1xxx)
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  MISSING_ARGUMENT: 'MISSING_ARGUMENT',
  INVALID_ARGUMENT_TYPE: 'INVALID_ARGUMENT_TYPE',

  // Task errors (2xxx)
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TASK_CREATE_FAILED: 'TASK_CREATE_FAILED',
  TASK_UPDATE_FAILED: 'TASK_UPDATE_FAILED',
  TASK_ALREADY_COMPLETE: 'TASK_ALREADY_COMPLETE',

  // Pattern errors (3xxx)
  PATTERN_NOT_FOUND: 'PATTERN_NOT_FOUND',
  PATTERN_LOOKUP_FAILED: 'PATTERN_LOOKUP_FAILED',
  PATTERN_DISCOVERY_FAILED: 'PATTERN_DISCOVERY_FAILED',

  // Reflection errors (4xxx)
  REFLECTION_INVALID_CLAIMS: 'REFLECTION_INVALID_CLAIMS',
  REFLECTION_SUBMIT_FAILED: 'REFLECTION_SUBMIT_FAILED',
  REFLECTION_VALIDATION_FAILED: 'REFLECTION_VALIDATION_FAILED',

  // Database errors (5xxx)
  DATABASE_INIT_FAILED: 'DATABASE_INIT_FAILED',
  DATABASE_QUERY_FAILED: 'DATABASE_QUERY_FAILED',
  DATABASE_CONNECTION_FAILED: 'DATABASE_CONNECTION_FAILED',

  // Generic errors (9xxx)
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};
```

**Output Formatter** (`src/cli/formatters/json-output.js`):
```javascript
export function formatOutput(command, data) {
  return JSON.stringify({
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      version: process.env.APEX_VERSION || '2.0.0',
      command
    }
  }, null, 2);
}

export function formatError(command, error) {
  const errorCode = error.code || 'UNKNOWN_ERROR';
  const errorMessage = error.message || 'An unknown error occurred';

  return JSON.stringify({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      details: error.details || {}
    },
    metadata: {
      timestamp: new Date().toISOString(),
      version: process.env.APEX_VERSION || '2.0.0',
      command
    }
  }, null, 2);
}
```

### Service Layer Reuse

**No changes to services needed**. CLI commands are thin wrappers:

```javascript
// OLD (MCP tool handler)
case "apex_task_create":
  if (!taskService) throw new Error("Task service not initialized");
  const createResponse = await taskService.create(args);
  return { content: [{ type: "text", text: JSON.stringify(createResponse) }] };

// NEW (CLI command)
export async function taskCreate(args) {
  const service = await initTaskService();
  const result = await service.create(args);
  return formatOutput('apex task create', result);
}
```

### Testing Strategy

**Unit Tests** (`tests/cli/commands/task.test.js`):
```javascript
import { describe, it, expect } from 'vitest';
import { taskCreate } from '../../../src/cli/commands/task.js';

describe('apex task create', () => {
  it('should create task and return JSON', async () => {
    const result = await taskCreate({
      intent: 'Test task',
      type: 'feature'
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.task_id).toBeDefined();
    expect(parsed.metadata.command).toBe('apex task create');
  });

  it('should handle errors gracefully', async () => {
    const result = await taskCreate({ intent: '' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBeDefined();
  });
});
```

---

## Success Criteria

### Functional Requirements
- [ ] All 12 MCP tool capabilities replicated in CLI
- [ ] All 23 CLI commands return valid JSON
- [ ] task-execution Skill successfully orchestrates full 5-phase workflow
- [ ] pattern-discovery Skill finds and explains patterns
- [ ] reflection Skill submits outcomes and updates trust scores
- [ ] Plugin installs via `/plugin install apex@marketplace`
- [ ] Skills auto-invoke based on user intent
- [ ] Slash command `/apex-task` loads task-execution skill
- [ ] No MCP code remains in codebase

### Quality Requirements
- [ ] Test coverage remains >80%
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] CLI commands have comprehensive error handling
- [ ] JSON output validates against schema
- [ ] Skills tested with subagents (manual validation)

### Documentation Requirements
- [ ] README.md updated with new architecture
- [ ] MIGRATION_GUIDE.md created for v1.x users
- [ ] Plugin installation guide created
- [ ] All code examples updated
- [ ] API documentation for CLI commands
- [ ] Skill authoring guide

### Release Requirements
- [ ] Version 2.0.0 published to npm
- [ ] Plugin published to GitHub
- [ ] Marketplace published to GitHub
- [ ] GitHub release created with changelog
- [ ] Breaking changes clearly documented
- [ ] Migration path documented

---

## Risk Mitigation

### Risk 1: Breaking Existing MCP Users
**Probability**: High
**Impact**: High
**Mitigation**:
- Clear communication: Major version bump (2.0.0)
- Comprehensive migration guide
- Support window for questions
- Consider maintaining v1.x branch for critical bugs (3-6 months)

### Risk 2: CLI Commands Have Bugs
**Probability**: Medium
**Impact**: High
**Mitigation**:
- Reuse existing, tested services (TaskService, etc.)
- Comprehensive unit + integration tests
- Beta testing period before release
- Gradual rollout (publish with `@beta` tag first)

### Risk 3: Skills Don't Load Properly
**Probability**: Low
**Impact**: High
**Mitigation**:
- Test with local marketplace extensively
- Validate plugin.json schema
- Test installation flow on clean system
- Provide fallback: direct CLI usage if skills fail

### Risk 4: Context Bloat (Skills Too Verbose)
**Probability**: Medium
**Impact**: Medium
**Mitigation**:
- Follow progressive disclosure pattern strictly
- Keep frontmatter minimal (<200 tokens)
- Use supporting files for details
- Test token usage vs MCP baseline

### Risk 5: Plugin Distribution Issues
**Probability**: Low
**Impact**: Medium
**Mitigation**:
- Test marketplace installation end-to-end
- Provide multiple installation methods
- Clear troubleshooting guide
- Monitor GitHub issues closely at launch

### Risk 6: CLI Performance Regression
**Probability**: Low
**Impact**: Low
**Mitigation**:
- Benchmark CLI commands vs MCP tools
- Use same database/service layer (no changes)
- Profile JSON serialization overhead
- Optimize if needed (likely negligible)

---

## Post-Migration Monitoring

### Week 1 After Release
- Monitor GitHub issues for installation problems
- Track npm download stats
- Collect user feedback on migration experience
- Address critical bugs immediately

### Month 1 After Release
- Analyze plugin adoption rate
- Identify common pain points
- Iterate on Skills based on usage patterns
- Consider adding more Skills if gaps identified

### Ongoing
- Track context token usage vs v1.x MCP baseline
- Monitor pattern discovery effectiveness
- Collect success stories
- Plan future enhancements

---

## Future Enhancements (Post v2.0)

### Potential Additions
1. **More Skills**: Phase-specific skills (architect, builder, validator, etc.)
2. **CLI Plugins**: Extend CLI with custom commands
3. **Workflow Templates**: Pre-built workflows for common tasks
4. **Integration Skills**: Git, CI/CD, issue trackers
5. **Team Features**: Shared pattern databases, collaborative learning
6. **Analytics Dashboard**: Pattern usage, task metrics visualization

### Not in Scope for v2.0
- MCP compatibility layer (clean break)
- GUI for APEX (stays CLI-first)
- Cloud sync (local-first architecture)
- Real-time collaboration (future consideration)

---

## Appendix

### A. Command Reference Matrix

| v1.x MCP Tool | v2.0 CLI Command | Skill Usage |
|---------------|------------------|-------------|
| apex_patterns_lookup | apex patterns lookup | task-execution, pattern-discovery |
| apex_reflect | apex reflect | task-execution, reflection |
| apex_patterns_discover | apex patterns discover | pattern-discovery |
| apex_patterns_explain | apex patterns explain | pattern-discovery |
| apex_task_create | apex task create | task-execution |
| apex_task_find | apex task find | task-execution |
| apex_task_find_similar | apex task similar | task-execution |
| apex_task_update | apex task update | task-execution |
| apex_task_checkpoint | apex task checkpoint | task-execution |
| apex_task_complete | apex task complete | task-execution |
| apex_task_context | apex task context | task-execution |
| apex_task_append_evidence | apex task evidence | task-execution |

### B. Token Usage Comparison

**MCP (v1.x)**:
- Tool schemas: ~2,311 tokens (after optimization)
- Loaded upfront: Yes
- Progressive disclosure: No

**Skills (v2.0)**:
- Skill frontmatter: ~200-300 tokens per skill
- Loaded upfront: Only frontmatter
- Progressive disclosure: Yes (templates loaded on demand)

**Estimated savings**: 70-85% context reduction for typical workflows

### C. Repository Links

**Main Repositories**:
- CLI Package: `https://github.com/benredmond/apex`
- Plugin Package: `https://github.com/benredmond/apex-plugin`
- Marketplace: `https://github.com/benredmond/apex-marketplace`

**Documentation**:
- Main Docs: `https://github.com/benredmond/apex/blob/main/README.md`
- Migration Guide: `https://github.com/benredmond/apex/blob/main/MIGRATION_GUIDE.md`
- Plugin Guide: `https://github.com/benredmond/apex-plugin/blob/main/README.md`

---

## Architecture Review Feedback (Incorporated)

This plan was reviewed by three independent architecture agents. Key findings and revisions:

### Technical Feasibility Review
**Finding**: Migration is feasible but needs Week 0 foundation work
**Incorporated**:
- ✅ Added Week 0: Pre-flight Audit & Foundation
- ✅ Created DatabaseFactory and ServiceFactory patterns
- ✅ Extended timeline to 8-10 weeks (from 6)

### Architecture Coherence Review
**Finding**: Suggested hybrid approach (keep MCP + add CLI) as lower risk
**Decision**: User chose Path A (full migration) to achieve context efficiency goals
**Incorporated**:
- ✅ Acknowledged hybrid path exists but proceeding with full migration
- ✅ Added measurable success criteria to validate architecture choice
- ✅ Added beta testing phase to de-risk migration

### Implementation Plan Review
**Finding**: Timeline underestimated, testing strategy weak, documentation insufficient
**Incorporated**:
- ✅ Extended timeline from 6 weeks → 8-10 weeks
- ✅ Added automated skills testing framework (Week 3.5)
- ✅ Expanded documentation from 1 week → 2 weeks
- ✅ Added Week 7.5 beta testing phase
- ✅ Added Weeks 9-10 buffer for iteration
- ✅ Added measurable success criteria with verification methods

---

## Conclusion

This migration transforms APEX from an MCP server to an agent-first CLI + Skills architecture, delivering:

✅ **80-90% context reduction** through progressive disclosure (target: ≤30% of MCP baseline)
✅ **Better composability** via Unix-philosophy CLI primitives
✅ **Easier distribution** through plugin marketplace
✅ **Agent-optimized** interface (JSON output, Skill orchestration)
✅ **No runtime overhead** from MCP protocol
✅ **Measurable success criteria** to validate architecture decisions

The big bang approach (Path A) is justified because:
1. Early stage (manageable user base, easier to migrate now than later)
2. Clear architectural vision (user's explicit goal: eliminate MCP context bloat)
3. Maintains core intelligence (services unchanged, database unchanged)
4. Plugin system is mature and proven
5. Beta testing phase de-risks migration
6. Measurable criteria ensure we achieve goals

**Timeline**: 8-10 weeks from start to public release (includes Week 0 foundation, beta testing, and buffer)
**Effort**: ~200-250 hours total (revised from 120-150 based on reviews)
**Breaking Change**: Yes (v2.0.0), but with comprehensive migration path and beta testing
**Result**: APEX becomes the reference implementation for agent-first development tools with proven context efficiency

### Timeline Summary
- **Week 0**: Foundation (factories, schemas, audit)
- **Weeks 1-2**: CLI implementation (23 commands)
- **Week 3**: Skills development (1 skill + 1 slash command)
- **Week 3.5**: Automated skills testing framework
- **Week 4**: Plugin packaging & local testing
- **Weeks 5-6**: Documentation (comprehensive)
- **Week 7.5**: Beta testing & validation
- **Week 8**: Public release
- **Weeks 9-10**: Buffer & iteration

**Key Risks Mitigated**:
- Week 0 foundation prevents mid-stream blockers
- Automated testing prevents manual testing bottleneck
- Beta testing validates real-world usage before public launch
- Buffer weeks account for unforeseen issues
- Measurable criteria ensure we achieve architectural goals
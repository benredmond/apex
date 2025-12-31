# APEX Claude Code Plugin

An intelligent memory layer for AI coding assistants that provides pattern discovery, task tracking, and continuous learning through MCP tools and a 4-phase workflow.

## What's Included

This plugin provides:

- **MCP Server**: 13 intelligent tools for pattern discovery, task tracking, and reflection
- **7 Skills**: Workflow phases (research, plan, implement, ship, execute, debug) + MCP reference guide
- **7 Slash Commands**: `/apex:research`, `/apex:plan`, `/apex:implement`, `/apex:ship`, `/apex:execute`, `/apex:debug`, `/apex:review-pr`
- **12 Agents**: Specialized AI agents for intelligence gathering, code review, and analysis

## Features

### MCP Tools (12 Available)

- **Pattern Discovery**
  - `apex_patterns_lookup` - Context-aware pattern discovery
  - `apex_patterns_discover` - Semantic pattern search
  - `apex_patterns_explain` - Get detailed pattern explanations

- **Task Intelligence**
  - `apex_task_create` - Create tasks with auto-generated briefs
  - `apex_task_find` - Find tasks by criteria
  - `apex_task_find_similar` - Get similar task examples
  - `apex_task_update` - Track progress through phases
  - `apex_task_checkpoint` - Add progress checkpoints
  - `apex_task_complete` - Complete task and generate reflection draft
  - `apex_task_context` - Get intelligence pack (patterns + similar tasks)
  - `apex_task_append_evidence` - Track evidence for learning

- **Learning & Reflection**
  - `apex_reflect` - Submit outcomes to update pattern trust scores

### Skills (7 Available)

Skills provide workflow guidance and are auto-triggered based on context:

**Workflow Skills:**
- `research` - Intelligence gathering phase, spawns parallel agents
- `plan` - Architecture design with 5 mandatory artifacts
- `implement` - Build and validate loop with pattern guidance
- `ship` - Review, commit, and reflection phase
- `execute` - Full workflow orchestrator (research → plan → implement → ship)
- `debug` - Systematic debugging with hypothesis-driven investigation and pattern learning

**Reference Skill:**
- `using-apex-mcp` - Complete MCP tools reference with schemas and examples

### Slash Commands (7 Available)

```bash
/apex:research <task>      # Gather intelligence via parallel agents
/apex:plan <task-id>       # Transform research into architecture
/apex:implement <task-id>  # Build and validate code
/apex:ship <task-id>       # Review, commit, and reflect
/apex:execute <task>       # Run full workflow in sequence
/apex:debug <task-id>      # Systematic debugging with pattern learning
/apex:review-pr            # Adversarial code review
```

### Agents (12 Available)

Claude can automatically invoke these specialized agents when relevant:

**Research & Intelligence:**
- `intelligence-gatherer` - Orchestrates APEX MCP queries and context loading
- `systems-researcher` - Deep codebase analysis, architecture mapping
- `git-historian` - Git history analysis for patterns and regressions
- `documentation-researcher` - Searches project markdown documentation
- `web-researcher` - External research with source verification

**Pattern & Analysis:**
- `pattern-discovery` - Discovers new reusable patterns from codebases
- `implementation-pattern-extractor` - Extracts concrete patterns with file:line refs
- `failure-predictor` - Predicts failures from historical patterns
- `risk-analyst` - Surfaces novel risks and edge cases

**Quality & Validation:**
- `quality-reviewer` - Multi-lens code review (correctness, maintainability, resilience)
- `test-validator` - Comprehensive testing with predictive analysis
- `gemini-orchestrator` - AI-to-AI discussions for complex problems

## Installation

### Prerequisites

```bash
# Install APEX npm package globally
npm install -g @benredmond/apex
```

### Option 1: Install from Local Directory (Development)

```bash
# Start Claude Code
claude

# Add APEX repository as a marketplace
/plugin marketplace add /Users/ben/dev/apex

# Install the plugin
/plugin install apex@apex

# Restart Claude Code when prompted
```

### Option 2: Install from Git Repository (Recommended)

```bash
# Start Claude Code
claude

# Add APEX repository as a marketplace
/plugin marketplace add benredmond/apex

# Install the plugin
/plugin install apex@apex

# Restart Claude Code when prompted
```

### Verify Installation

After restarting Claude Code:

1. **Check MCP tools are available**: The APEX MCP server should start automatically
2. **Verify commands loaded**: Type `/` and look for `/apex:research`, `/apex:plan`, `/apex:implement`, `/apex:ship`, `/apex:execute`
3. **Verify agents loaded**: Type `/agents` to see all 12 APEX agents listed
4. **Verify skills loaded**: All 6 skills auto-trigger based on workflow context
5. **Test with a command**: Try `/apex:execute "Write a hello world function"`

## Usage

### Quick Start - Slash Commands

```bash
# Full workflow (recommended)
/apex:execute "Implement user authentication"

# Or step-by-step for more control
/apex:research "Implement user authentication"   # Creates task, gathers intel
/apex:plan T001                                   # Design architecture
/apex:implement T001                              # Build and test
/apex:ship T001                                   # Review, commit, reflect
```

### Direct MCP Tool Usage

```typescript
// 1. Create a task
const task = await apex_task_create({
  intent: "Implement user authentication",
  type: "feature",
  tags: ["auth", "security"]
})

// 2. Get intelligence (patterns + similar tasks)
const intel = await apex_task_context({
  task_id: task.id,
  packs: ["patterns", "tasks"]
})

// 3. Find relevant patterns
const patterns = await apex_patterns_lookup({
  task: "JWT authentication with rate limiting",
  workflow_phase: "builder"
})

// 4. Complete and reflect
const draft = await apex_task_complete({
  id: task.id,
  outcome: "success",
  key_learning: "JWT auth pattern saved 2 hours"
})

await apex_reflect(draft)
```

### Understanding Trust Scores

Patterns include trust scores that indicate reliability:

- **★★★★★** (0.9-1.0) - Apply confidently, proven patterns
- **★★★★☆** (0.7-0.9) - High trust, use with confidence  
- **★★★☆☆** (0.5-0.7) - Moderate trust, apply with caution
- **★★☆☆☆** (0.3-0.5) - Low confidence, validate carefully
- **★☆☆☆☆** (0.0-0.3) - Untested or failing, avoid

**Rule**: Apply patterns with ★★★★☆+ (trust ≥ 0.7) confidently.

### 4-Phase Workflow Integration

Skills and commands map to the APEX workflow:

| Phase | Command | Skill | Key Agents |
|-------|---------|-------|------------|
| Research | `/apex:research` | `research` | intelligence-gatherer, git-historian, systems-researcher |
| Plan | `/apex:plan` | `plan` | (interactive design with user) |
| Implement | `/apex:implement` | `implement` | pattern-discovery, test-validator |
| Ship | `/apex:ship` | `ship` | quality-reviewer, gemini-orchestrator |

### How Components Work Together

**Commands → Skills**
- `/apex:research` invokes the `research` skill which spawns parallel agents
- `/apex:execute` chains all 4 skills in sequence

**Skills → Agents**
- `research` skill spawns 7 agents in parallel for intelligence gathering
- `ship` skill invokes `quality-reviewer` for adversarial code review

**Agents → MCP Tools**
- `intelligence-gatherer` uses `apex_patterns_lookup`, `apex_task_context`
- `quality-reviewer` uses `apex_patterns_discover` for pattern validation
- All agents can access relevant MCP tools for their domain

**Skills → MCP Tools**
- Skills use MCP tools directly for task management
- `apex_task_create` at research start, `apex_reflect` at ship end
- `apex_task_update` tracks phase transitions

## Database Location

APEX stores pattern intelligence in `~/.apex/<repo-id>/patterns.db`

The database is automatically created and migrated when the MCP server starts.

## Configuration

The plugin uses these defaults:

- **MCP Server Command**: `npx @benredmond/apex mcp serve`
- **Database**: Auto-discovered at `~/.apex/<repo-id>/patterns.db`
- **Caching**: 5-minute TTL on lookup/discover operations
- **Rate Limiting**: 100 requests per 60 seconds

## Troubleshooting

### Plugin Not Loading

```bash
# Verify APEX is installed
npm list -g @benredmond/apex

# Check plugin status
/plugin

# Enable debug mode
claude --debug
```

### MCP Server Not Starting

```bash
# Test MCP server manually
apex mcp serve

# Check MCP server info
apex mcp info

# Verify database exists
ls ~/.apex/
```

### Skills Not Auto-Loading

The `using-apex-mcp` skill loads automatically when:
- The plugin is installed and enabled
- You mention APEX tool names (apex_patterns_lookup, apex_task_create, etc.)
- You ask about pattern discovery or task tracking

## Development

### Local Testing

```bash
# Make changes to plugin files
# Uninstall and reinstall to test changes
/plugin uninstall apex@apex
/plugin install apex@apex
```

### Plugin Structure

```
apex/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── skills/                   # 7 workflow skills
│   ├── research/SKILL.md     # Intelligence gathering
│   ├── plan/SKILL.md         # Architecture design
│   ├── implement/SKILL.md    # Build and validate
│   ├── ship/SKILL.md         # Review and reflect
│   ├── execute/SKILL.md      # Full workflow orchestrator
│   ├── debug/SKILL.md        # Systematic debugging
│   └── using-apex-mcp/       # MCP reference
│       ├── SKILL.md
│       └── apex-reflect-guide.md
├── agents/                   # 12 specialized agents
│   ├── intelligence-gatherer.md
│   ├── git-historian.md
│   ├── systems-researcher.md
│   └── ... (9 more)
├── commands/                 # Slash commands
│   ├── research.md
│   ├── plan.md
│   ├── implement.md
│   ├── ship.md
│   ├── execute.md
│   └── review-pr.md
└── README-PLUGIN.md          # This file
```

## Additional Resources

- **Main Repository**: https://github.com/benredmond/apex
- **NPM Package**: https://www.npmjs.com/package/@benredmond/apex
- **Workflow Skills**: See `skills/research/`, `skills/plan/`, `skills/implement/`, `skills/ship/`
- **MCP Reference**: See `skills/using-apex-mcp/SKILL.md`
- **Reflection Guide**: See `skills/using-apex-mcp/apex-reflect-guide.md`

## License

MIT License - See LICENSE file in repository

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/benredmond/apex/issues
- Repository: https://github.com/benredmond/apex

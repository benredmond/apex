# APEX Claude Code Plugin

An intelligent memory layer for AI coding assistants that provides pattern discovery, task tracking, and continuous learning through 12 MCP tools.

## What's Included

This plugin provides:

- **MCP Server**: 12 intelligent tools for pattern discovery, task tracking, and reflection
- **Agent Skill**: `using-apex-mcp` - Complete reference guide for all APEX MCP tools with schemas, trust score interpretation, and workflow integration
- **Slash Commands**: 2 powerful workflow commands (`/execute_task`, `/apex_init`)
- **Subagents**: 12 specialized AI agents for intelligence gathering, pattern discovery, quality review, and more

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

### Agent Skill: using-apex-mcp

Provides comprehensive guidance including:

- Quick reference table for all 12 MCP tools
- Trust score interpretation (★★★★★ ratings)
- Typical workflow patterns
- 5-phase execution integration (ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER)
- Complete apex_reflect documentation with validation rules

### Slash Commands

**`/execute_task`** - Main task execution workflow
- 5-phase ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER workflow
- Automatic intelligence gathering via MCP tools
- Pattern-driven development with trust-scored recommendations
- Comprehensive evidence tracking and reflection
- Usage: `/execute_task "Implement user authentication"`

**`/apex_init`** - Initialize pattern database from codebase
- Discovers reusable patterns from existing code
- Seeds APEX database with project-specific patterns
- Analyzes architecture, conventions, and best practices
- One-time setup or periodic refresh
- Usage: `/apex_init`

### Subagents (12 Available)

Claude can automatically invoke these specialized agents when relevant:

**Core Intelligence:**
- `intelligence-gatherer` - Orchestrates parallel intelligence gathering and context assembly
- `systems-researcher` - Deep codebase analysis, architecture mapping, dependency tracing
- `pattern-discovery` - Discovers new reusable patterns from codebases
- `pattern-analyst` - Analyzes pattern quality and effectiveness

**Quality & Validation:**
- `quality-reviewer` - Code quality review and best practices enforcement
- `test-validator` - Test coverage validation and quality assessment
- `architecture-validator` - Architecture pattern validation and design review

**Specialized Utilities:**
- `failure-predictor` - Predicts failures based on historical patterns
- `context-loader` - Loads relevant context for task execution
- `ui-debugger` - Frontend/UI debugging and troubleshooting
- `ml-prompt-engineer` - Optimizes prompts for ML/AI tasks
- `gemini-orchestrator` - Routes complex tasks to Gemini AI

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
2. **Verify commands loaded**: Run `/help` and look for `/execute_task` and `/apex_init`
3. **Verify agents loaded**: Type `/agents` to see all 12 APEX subagents listed
4. **Verify skill loaded**: The `using-apex-mcp` skill is automatically available when APEX tools are mentioned
5. **Test with a command**: Try `/execute_task "Write a hello world function"`

## Usage

### Quick Start

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

### 5-Phase Workflow Integration

APEX tools map to execution phases:

- **ARCHITECT**: `apex_patterns_lookup` with `workflow_phase: "architect"`
- **BUILDER**: Implement with patterns, track via `apex_task_update`
- **VALIDATOR**: Test patterns with `workflow_phase: "validator"`
- **REVIEWER**: Review journey with `apex_task_context`
- **DOCUMENTER**: Capture learnings via `apex_task_complete` + `apex_reflect`

### How Components Work Together

**Commands → MCP Tools**
- `/execute_task` orchestrates the 5-phase workflow using MCP tools internally
- Creates tasks with `apex_task_create`, gets intelligence with `apex_task_context`
- Tracks progress with `apex_task_update`, submits reflections with `apex_reflect`

**Commands → Subagents**
- `/execute_task` automatically invokes specialized subagents for each phase
- ARCHITECT phase: Uses `intelligence-gatherer`, `systems-researcher`
- BUILDER phase: Uses `pattern-discovery`, `pattern-analyst`
- VALIDATOR phase: Uses `test-validator`, `quality-reviewer`

**Subagents → MCP Tools**
- All subagents have access to relevant APEX MCP tools
- `intelligence-gatherer` uses full MCP toolkit for comprehensive analysis
- Domain-specific agents use focused tool subsets

**Skills → Everything**
- `using-apex-mcp` skill provides reference documentation
- Auto-loads when commands, agents, or direct MCP tool usage is detected
- Ensures correct tool usage across all components

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
├── skills/
│   └── using-apex-mcp/
│       ├── SKILL.md          # Main skill reference
│       └── apex-reflect-guide.md  # Deep dive on apex_reflect
└── README-PLUGIN.md          # This file
```

## Additional Resources

- **Main Repository**: https://github.com/benredmond/apex
- **NPM Package**: https://www.npmjs.com/package/@benredmond/apex
- **Skill Documentation**: See `skills/using-apex-mcp/SKILL.md`
- **Reflection Guide**: See `skills/using-apex-mcp/apex-reflect-guide.md`

## License

MIT License - See LICENSE file in repository

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/benredmond/apex/issues
- Repository: https://github.com/benredmond/apex

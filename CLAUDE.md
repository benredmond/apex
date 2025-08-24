# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

APEX (Autonomous Pattern-Enhanced eXecution) is an AI-powered development workflow tool that enhances AI coding assistants through pattern recognition, hierarchical task management, and a 5-phase execution workflow.

## Development Commands

```bash
# Testing
npm test                    # Run all tests
npm run test:watch         # Run tests in watch mode
node --experimental-vm-modules node_modules/jest/bin/jest.js -- path/to/test.js  # Run single test file

# Code Quality
npm run lint               # Run ESLint
npm run format            # Format code with Prettier

# Release Commands
npm run release:patch     # Release patch version (x.x.1)
npm run release:minor     # Release minor version (x.1.x)
npm run release:major     # Release major version (1.x.x)
```

## Architecture Overview

### Core Components

1. **CLI System** (`/src/cli/`)
   - `index.js` - Main CLI entry point and command registration
   - `apex.js` - Main CLI file with `apex start` command (simplified from `apex init`)
   - `pattern-command.js` - Pattern management commands

2. **Intelligence Layer** (`/src/intelligence/`)
   - `pattern-manager.js` - Pattern lifecycle management (discovery → validation → promotion)
   - `failure-tracker.js` - Tracks and learns from failures
   - `trust-calculator.js` - Calculates pattern trust scores

3. **Command Templates** (`/src/commands/`)
   - Markdown templates for AI assistants organized by domain
   - Previously used by `apex init` (deprecated) to create command structure

### Key Concepts

- **Pattern Format**: `[TYPE:CATEGORY:SPECIFIC]` (e.g., `[PAT:AUTH:JWT]`)
- **Pattern Lifecycle**: Patterns start in `CONVENTIONS.pending.md`, promote to `CONVENTIONS.md` after 3+ uses with >80% success
- **Trust Score**: Based on usage count and success rate, visualized with star ratings (★★★★★)
- **5-Phase Workflow**: ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER

### Project Structure (legacy - created by deprecated `apex init`)

```
.apex/
├── 01_PROJECT_DOCS/          # Architecture & specifications
├── 02_PLANNING/MILESTONES/   # Hierarchical planning
├── 03_ACTIVE_SPRINTS/        # Current sprint work
├── 04_GENERAL_TASKS/         # Non-sprint tasks
├── 09_LEARNING/              # Failure patterns database
├── 10_KNOWLEDGE/             # Domain knowledge
├── CONVENTIONS.md            # Active patterns (★★★★☆+)
├── CONVENTIONS.pending.md    # Testing patterns (<3 uses)
├── PATTERN_METADATA.json     # Pattern statistics
└── config.json              # APEX configuration
```

## Important Implementation Details

- Uses ES modules (`"type": "module"` in package.json)
- Requires Node.js >=16.0.0
- Published as `@benredmond/apex` npm package
- CLI binary exposed as `apex` command globally
- Pattern promotion threshold: 3+ uses with >80% success rate
- Complexity routing: Automatically engages Gemini AI for complex tasks

## MCP Integration & Self-Improvement

### How APEX Works with Claude Code

APEX operates as an MCP (Model Context Protocol) server that provides intelligent tools to AI coding assistants. Rather than manipulating files directly, APEX exposes specialized tools through MCP that enable:

### Available MCP Tools

- **Pattern Discovery & Management**
  - `apex_patterns_lookup` - Find relevant patterns for current task
  - `apex_patterns_discover` - Discover new patterns using semantic search
  - `apex_patterns_explain` - Get detailed pattern explanations
  
- **Task Intelligence**
  - `apex_task_create` - Create tasks with auto-generated briefs
  - `apex_task_context` - Get comprehensive task context
  - `apex_task_update` - Track task progress through phases
  - `apex_task_complete` - Complete tasks and generate reflection draft
  - `apex_task_checkpoint` - Add progress checkpoints
  - `apex_task_append_evidence` - Track evidence for learning
  
- **Learning & Reflection**
  - `apex_reflect` - Submit pattern usage outcomes for trust updates
  - Evidence tracking for continuous improvement
  - Pattern evolution based on real-world results
  
### Self-Improvement Mechanism

APEX learns and improves through a continuous cycle:

1. **Pattern Discovery** - Identifies reusable solutions during task execution
2. **Usage Tracking** - Records when patterns are applied via MCP tools
3. **Outcome Reflection** - Captures success/failure through `apex_reflect`
4. **Trust Evolution** - Updates pattern confidence scores based on results
5. **Pattern Promotion** - Graduates high-performing patterns to active conventions

This creates a feedback loop where each task execution makes the next one more efficient.

### Integration with AI Assistants

- APEX runs as an MCP server (using SDK v0.6.1)
- AI assistants connect as MCP clients to access APEX tools
- Tools provide context-aware intelligence based on learned patterns
- No runtime overhead - tools are invoked on-demand only
- Pattern cache enables 40-55% faster development through reuse
- the db is in ~/.apex
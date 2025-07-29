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
   - `init-command.js` - Handles `apex init` for project setup
   - `pattern-command.js` - Pattern management commands

2. **Intelligence Layer** (`/src/intelligence/`)
   - `pattern-manager.js` - Pattern lifecycle management (discovery → validation → promotion)
   - `failure-tracker.js` - Tracks and learns from failures
   - `trust-calculator.js` - Calculates pattern trust scores

3. **Command Templates** (`/src/commands/`)
   - Markdown templates for AI assistants organized by domain
   - Used by `apex init` to create `.claude/commands/apex/` structure

### Key Concepts

- **Pattern Format**: `[TYPE:CATEGORY:SPECIFIC]` (e.g., `[PAT:AUTH:JWT]`)
- **Pattern Lifecycle**: Patterns start in `CONVENTIONS.pending.md`, promote to `CONVENTIONS.md` after 3+ uses with >80% success
- **Trust Score**: Based on usage count and success rate, visualized with star ratings (★★★★★)
- **5-Phase Workflow**: ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER

### Project Structure (created by `apex init`)

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
# APEX - Autonomous Pattern-Enhanced eXecution

> AI-powered development workflow with APEX Intelligence for pattern recognition, learning, and task execution

[![npm version](https://badge.fury.io/js/%40apex-intelligence%2Fapex.svg)](https://badge.fury.io/js/%40apex-intelligence%2Fapex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

```bash
# Get started in seconds - no installation required!
npx @apex-intelligence/apex init
```

## What is APEX?

APEX is a zero-runtime intelligence layer that transforms AI coding assistants (like Claude Code, Cursor, or GitHub Copilot) into predictive, learning development partners with:

- **🧠 APEX Intelligence**: Pattern recognition and learning system that improves over time (40-55% productivity gain)
- **📊 Hierarchical Task Management**: Milestone → Sprint → Task workflow for organized development
- **🔄 Continuous Learning**: Captures patterns, failures, and successes to prevent repeated mistakes
- **⚡ 5-Phase Execution**: ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER workflow
- **🚀 Complexity-Aware Routing**: Automatically engages Gemini AI for complex tasks (complexity ≥5)

## Quick Start

```bash
# Initialize APEX in your project (no installation needed!)
cd your-project
npx @apex-intelligence/apex init

# Or if you prefer global installation
npm install -g @apex-intelligence/apex
apex init

# Prime your AI assistant with APEX context
/prime

# Create a milestone and sprint hierarchy
/milestone "User Authentication System"
/sprint M01 "Core Authentication"
/create_task "Add JWT authentication" --sprint S01

# Execute the task
/task T001
```

## How APEX Works

APEX is a **zero-runtime intelligence layer** - it doesn't run continuously but instead:

1. **Setup Phase** (one-time): `apex init` creates the project structure and installs command templates
2. **Runtime Phase** (in AI): Commands are markdown prompts that guide your AI assistant
3. **Learning Phase** (continuous): Every task execution updates patterns and learnings

The magic happens through prompt engineering - APEX commands are carefully crafted prompts that make your AI assistant follow proven workflows and apply learned patterns.

## Core Concepts

### APEX Intelligence Engine

The heart of APEX is its zero-runtime intelligence engine that:
- **Pattern Recognition**: Tracks successful patterns with trust scores (★★★★★ system)
- **Failure Prevention**: Learns from mistakes to prevent repetition
- **Smart Context Loading**: Intelligence triggers auto-load relevant patterns
- **Complexity Analysis**: Scores tasks 1-10 and routes to appropriate tools
- **Gemini Integration**: Engages for architecture (complexity ≥7) and review (complexity ≥5)

### Task Hierarchy

APEX organizes work in a clear hierarchy:

```
📌 Milestone (M01: User Authentication)
└── 📅 Sprint (S01: Core Authentication)
    ├── 📋 Task (T001: JWT Implementation)
    ├── 📋 Task (T002: User Model)
    └── 📋 Task (T003: Auth Middleware)
```

### 5-Domain Command Structure

1. **Plan**: Create milestones → sprints → tasks
2. **Execute**: Process tasks using 5-phase APEX workflow
3. **Quality**: Review, test, debug, and improve
4. **Finalize**: Commit and extract learnings
5. **System**: Initialize, prime, and verify APEX

### Pattern System

APEX automatically discovers and tracks patterns through their lifecycle:

#### Pattern Lifecycle
1. **Discovery**: New patterns found during task execution
2. **Pending**: Added to `CONVENTIONS.pending.md` for testing
3. **Validation**: After 3+ successful uses with >80% success rate
4. **Promotion**: Moved to `CONVENTIONS.md` as trusted pattern
5. **Evolution**: Trust score updates based on continued use

#### Pattern Format
```
[PAT:AUTH:JWT] ★★★★★ (47 uses, 98% success)
```javascript
// Secure JWT implementation
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
```
CONTEXT: User authentication tokens
PREVENTS: Security vulnerabilities, token expiration issues
```

#### Pattern Types
- `[PAT:*]` - Code patterns
- `[CMD:*]` - Command patterns
- `[FIX:*]` - Bug fix patterns
- `[ARCH:*]` - Architecture patterns

## Command Reference

**Note**: In Claude Code, commands are called by their filename. For example, `task.md` becomes `/task`.

### Planning Domain (01_plan/)
- `/milestone` - Create high-level project milestones
- `/sprint [MILESTONE_ID]` - Break milestones into time-boxed sprints
- `/create_task --sprint [SPRINT_ID]` - Create specific implementation tasks

### Execution Domain (02_execute/)
- `/task [TASK_ID]` - Process task through 5-phase workflow
- `/yolo` - Autonomous multi-task execution mode

### Quality Domain (03_quality/)
- `/review` - AI-powered code review with learning capture
- `/test` - Test execution and quality analysis
- `/debug` - Systematic debugging with failure database
- `/design` - Architecture and design assistance
- `/prompt_engineer` - Optimize AI prompts for better results

### Finalization Domain (04_finalize/)
- `/commit` - Create contextual git commits
- `/reflect` - Extract learnings and update knowledge base

### System Domain (05_system/)
- `/init` - Initialize APEX in your project (via CLI: `apex init`)
- `/prime` - Load APEX context into AI assistant
- `/verify` - Verify installation and health

## Installation Options

### No Installation Required (Recommended)
```bash
# Run directly with npx - no installation needed!
npx @apex-intelligence/apex init

# All commands available via npx
npx @apex-intelligence/apex verify
npx @apex-intelligence/apex patterns
```

### Global Installation
```bash
# Install once, use everywhere
npm install -g @apex-intelligence/apex
apex init
```

### Project-specific Installation
```bash
# Add to your project's dev dependencies
npm install --save-dev @apex-intelligence/apex

# Run via npm scripts or npx
npx apex init
```

### Manual Setup
```bash
# Clone and copy templates manually
git clone https://github.com/yourusername/apex
cd your-project
cp -r apex/templates/.apex .
cp -r apex/templates/.claude .  # For Claude users
```

## Directory Structure

APEX creates an organized project structure:
```
.apex/
├── 00_SYSTEM/                 # APEX configuration
│   └── manifest.json          # Project metadata
├── 01_PROJECT_DOCS/           # Architecture & specifications
├── 02_PLANNING/               # Planning hierarchy
│   └── MILESTONES/           # Project milestones
├── 03_ACTIVE_SPRINTS/         # Current sprint work
├── 04_GENERAL_TASKS/          # Non-sprint tasks
├── 09_LEARNING/               # Learning database
│   ├── failures.jsonl         # Failure patterns
│   ├── patterns/              # Pattern discoveries
│   └── TASK_LEARNINGS.md      # Extracted learnings
├── 10_KNOWLEDGE/              # Domain knowledge
├── CONVENTIONS.md             # Active patterns (★★★★☆+)
├── CONVENTIONS.pending.md     # Testing patterns (<3 uses)
├── INTELLIGENCE_TRIGGERS.md   # Smart context loading
├── PATTERN_METADATA.json      # Pattern statistics
└── config.json               # APEX configuration

.claude/commands/apex/         # AI command templates
├── 01_plan/                  # Planning commands
├── 02_execute/               # Execution commands
├── 03_quality/               # Quality commands
├── 04_finalize/              # Finalization commands
└── 05_system/                # System commands
```

## Features

### 🎯 Intelligent Task Execution
- Complexity analysis and optimal approach selection
- Automatic pattern recognition and application
- Failure prevention through historical learning

### 📊 Pattern Management
- Automatic pattern discovery
- Trust score tracking
- Pattern promotion based on success rate
- Shareable pattern libraries

### 🔄 Continuous Learning
- Captures successful implementations
- Learns from failures
- Builds project-specific knowledge base
- Improves suggestions over time

### 🤖 AI Integration
- Designed for AI coding assistants
- Optional Gemini integration for complex tasks
- Works with any LLM-based tool

## Configuration

Create `.apex/config.json` for custom settings:
```json
{
  "apex": {
    "geminiApiKey": "your-api-key",
    "patternPromotionThreshold": 3,
    "trustScoreThreshold": 0.8,
    "complexityThreshold": 5,
    "enableAutoPatterns": true
  }
}
```

## Workflow Example

### Complete Development Flow
```bash
# 1. Initialize APEX in your project
npx @apex-intelligence/apex init

# 2. Open your AI assistant (Claude Code, Cursor, etc.)
# 3. Prime the AI with APEX context
/prime

# 4. Plan your work hierarchically
/milestone "E-commerce Platform MVP"
# Returns: M01 created

/sprint M01 "User Management"
# Returns: S01 created

/create_task "Design user database schema" --sprint S01
# Returns: T001 created

/create_task "Implement user registration API" --sprint S01  
# Returns: T002 created

# 5. Execute tasks with intelligent workflow
/task T001
# APEX will:
# - Load relevant patterns and past learnings
# - Run through ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER
# - Apply trusted patterns automatically
# - Engage Gemini for complex architecture decisions

# 6. Ensure quality
/review
/test

# 7. Finalize and learn
/commit
/reflect
```

### Task Execution Deep Dive
When you run `/task T001`, APEX:

1. **Intelligence Phase**: Analyzes task complexity and loads relevant patterns
2. **ARCHITECT Phase**: Researches and designs the solution
3. **BUILDER Phase**: Implements code following established patterns
4. **VALIDATOR Phase**: Runs comprehensive tests
5. **REVIEWER Phase**: Performs quality checks (Gemini-assisted if complex)
6. **DOCUMENTER Phase**: Captures learnings and updates knowledge base

### Working with Patterns
```bash
# View current patterns
npx @apex-intelligence/apex patterns  # Run in terminal

# The patterns command shows all active patterns
# Pattern testing happens automatically during task execution
# Patterns are shared via version control of CONVENTIONS.md
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Pattern Contributions
- Document in `CONVENTIONS.pending.md`
- Include trust score justification
- Provide usage examples
- Test across multiple scenarios

## License

MIT License - see [LICENSE](LICENSE) for details

## Acknowledgments

APEX was inspired by the need for structured, intelligent workflows in AI-assisted development. Special thanks to the Claude, Cursor, and AI coding community.

---

Built with ❤️ and APEX Intelligence
# APEX - Autonomous Pattern-Enhanced eXecution

> AI-powered development workflow with APEX Intelligence for pattern recognition, learning, and task execution

[![npm version](https://badge.fury.io/js/apex.svg)](https://badge.fury.io/js/apex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is APEX?

APEX is an intelligent development workflow system that enhances AI coding assistants (like Claude, Cursor, or GitHub Copilot) with:

- **🧠 APEX Intelligence**: Pattern recognition and learning system that improves over time
- **📋 Structured Workflows**: 5-phase execution model (Plan → Execute → Quality → Finalize → System)
- **🎯 Smart Task Management**: Hierarchical organization with milestones, sprints, and tasks
- **🔄 Continuous Learning**: Captures patterns, failures, and successes to prevent repeated mistakes
- **🚀 Autonomous Execution**: AI-driven task processing with complexity-aware routing

## Quick Start

```bash
# Install APEX globally
npm install -g apex

# Initialize in your project
cd your-project
apex init

# Start using APEX commands in your AI assistant
/apex plan.task "Add user authentication"
/apex execute.task T001
/apex quality.review
/apex finalize.commit
```

## Core Concepts

### APEX Intelligence Engine

The heart of APEX is its intelligence engine that:
- Tracks successful patterns with trust scores
- Learns from failures to prevent repetition
- Suggests optimal approaches based on complexity
- Integrates with external AI (Gemini) for complex analysis

### 5-Phase Workflow

1. **Plan**: Define milestones, sprints, and tasks
2. **Execute**: Implement using the APEX workflow (Architect → Builder → Validator → Reviewer → Documenter)
3. **Quality**: Test, review, and debug
4. **Finalize**: Commit changes and capture learnings
5. **System**: Manage APEX itself

### Pattern System

APEX automatically discovers and tracks patterns:
```
[PAT:AUTH:JWT] ★★★★★ (47 uses, 98% success)
```javascript
// Secure JWT implementation
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
```
CONTEXT: User authentication tokens
PREVENTS: Security vulnerabilities, token expiration issues
```

## Commands

### Planning Domain
- `apex plan.milestone` - Create project milestones
- `apex plan.sprint` - Define sprints within milestones
- `apex plan.task` - Create individual tasks

### Execution Domain
- `apex execute.task [ID]` - Process a specific task with APEX Intelligence
- `apex execute.yolo` - Autonomous multi-task execution

### Quality Domain
- `apex quality.review` - Intelligent code review
- `apex quality.test` - Run and analyze tests
- `apex quality.debug` - Systematic debugging assistance

### Finalization Domain
- `apex finalize.commit` - Create contextual commits
- `apex finalize.reflect` - Capture and store learnings

### System Domain
- `apex system.init` - Initialize APEX in a project
- `apex system.prime` - Load project context
- `apex system.verify` - Check system health

## Installation Options

### Global Installation (Recommended)
```bash
npm install -g apex
apex init
```

### Project-specific Installation
```bash
npm install --save-dev apex
npx apex init
```

### Manual Setup
```bash
git clone https://github.com/yourusername/apex
cd your-project
cp -r apex/templates/.apex .
cp -r apex/templates/.claude .  # For Claude users
```

## Directory Structure

APEX creates an organized project structure:
```
.apex/
├── 00_SYSTEM/           # APEX configuration
├── 01_PROJECT_DOCS/     # Architecture & specs
├── 02_PLANNING/         # Milestones & requirements
├── 03_ACTIVE_SPRINTS/   # Current work
├── 04_GENERAL_TASKS/    # Non-sprint tasks
├── 09_LEARNING/         # Patterns & failures
└── CONVENTIONS.md       # Active patterns
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

## Examples

### Starting a New Feature
```bash
# Create a milestone
/apex plan.milestone "User Authentication System"

# Break it into sprints
/apex plan.sprint M01 "Core Authentication"

# Create specific tasks
/apex plan.task "Implement JWT tokens" --sprint S01

# Execute the task
/apex execute.task T001
```

### Working with Patterns
```bash
# View current patterns
/apex system.patterns

# Test a pattern before promotion
/apex quality.test-pattern "[PAT:API:VALIDATION]"

# Share patterns with team
/apex system.export-patterns
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
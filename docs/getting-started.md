# Getting Started with APEX

Welcome to APEX (Autonomous Pattern-Enhanced eXecution) - an AI-powered development workflow system that makes your AI coding assistant smarter over time.

## What is APEX Intelligence?

APEX Intelligence is a learning system that:
- **Discovers patterns** in your successful code implementations
- **Learns from failures** to prevent repeated mistakes  
- **Adapts complexity** based on task requirements
- **Provides structured workflows** for consistent quality

## Installation

### Global Installation (Recommended)

```bash
npm install -g apex
```

### Project-specific Installation

```bash
npm install --save-dev apex
```

## Quick Start

### 1. Initialize APEX in Your Project

```bash
cd your-project
apex init
```

This creates:
- `.apex/` - APEX Intelligence configuration and data
- `.claude/commands/apex/` - Command templates for Claude (if using Claude)
- Pattern tracking files
- Project manifest

### 2. Prime Your AI Assistant

Start your AI coding assistant (Claude, Cursor, GitHub Copilot, etc.) and run:

```bash
apex prime
```

Copy the output into your AI assistant to load APEX Intelligence.

### 3. Create Your First Task

In your AI assistant:
```
/apex plan.task "Add user authentication to the app"
```

### 4. Execute with Intelligence

```
/apex execute.task T001
```

APEX will:
1. Analyze the task complexity
2. Search for relevant patterns
3. Check for similar past failures
4. Guide through 5-phase execution
5. Learn from the implementation

## The APEX Workflow

### Phase 1: Plan
Define what you want to build:
- **Milestones**: Major features or versions
- **Sprints**: Time-boxed work periods
- **Tasks**: Specific implementations

### Phase 2: Execute
Implement with intelligence:
- **ARCHITECT**: Design the solution
- **BUILDER**: Write the code
- **VALIDATOR**: Test thoroughly  
- **REVIEWER**: Ensure quality
- **DOCUMENTER**: Capture learnings

### Phase 3: Quality
Ensure excellence:
- **Review**: Code quality checks
- **Test**: Automated testing
- **Debug**: Systematic problem solving

### Phase 4: Finalize
Complete the work:
- **Commit**: Contextual git commits
- **Reflect**: Extract patterns and learnings

### Phase 5: System
Manage APEX itself:
- **Verify**: Check system health
- **Patterns**: View discovered patterns
- **Stats**: See intelligence metrics

## Understanding Patterns

APEX automatically discovers patterns as you work:

```javascript
[PAT:AUTH:JWT] ★★★★★ (23 uses, 96% success) @auth @security
// Secure JWT token generation
const token = jwt.sign(
  { userId: user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '24h', algorithm: 'HS256' }
);
```

- **Pattern ID**: `[TYPE:CATEGORY:SPECIFIC]`
- **Trust Score**: ★ rating based on success rate
- **Usage Stats**: How often used and success rate
- **Tags**: For easy discovery

## Configuration

Edit `.apex/config.json`:

```json
{
  "apex": {
    "patternPromotionThreshold": 3,
    "trustScoreThreshold": 0.8,
    "complexityThreshold": 5,
    "enableAutoPatterns": true,
    "geminiApiKey": "your-key-here"
  }
}
```

## Best Practices

1. **Let APEX Learn**: Don't manually edit pattern files
2. **Complete Tasks**: Finish the full workflow for maximum learning
3. **Document Failures**: When things go wrong, let APEX record it
4. **Review Patterns**: Periodically check discovered patterns
5. **Share Knowledge**: Export patterns for team use

## Troubleshooting

### APEX not initialized
```bash
apex verify  # Check installation
apex init    # Reinitialize if needed
```

### Patterns not being discovered
- Ensure you complete full task workflows
- Check `.apex/CONVENTIONS.pending.md` for pending patterns
- Verify pattern threshold in config

### AI assistant doesn't recognize commands
1. Run `apex prime` to load context
2. Ensure `.claude/commands/apex/` exists
3. Check AI assistant supports custom commands

## Next Steps

1. **Explore Examples**: Check the `examples/` directory
2. **Read Architecture**: Understand the [system design](architecture.md)
3. **Contribute**: Share patterns and improvements
4. **Join Community**: Discuss in GitHub Discussions

## Getting Help

- **Documentation**: Full docs in `docs/`
- **Issues**: Report bugs on GitHub
- **Discussions**: Ask questions in Discussions
- **Examples**: Learn from example projects

Welcome to intelligent development with APEX! 🚀
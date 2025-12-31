# Getting Started with APEX

Welcome to APEX (Autonomous Pattern-Enhanced eXecution) - an AI-powered development workflow system that makes your AI coding assistant smarter over time.

## Prerequisites

✅ **Only requirement**: Node.js 14 or higher
- No compilation tools needed
- No Python required
- No build dependencies
- Works on Windows, macOS, Linux, and containers

## What is APEX Intelligence?

APEX Intelligence is a learning system that:
- **Discovers patterns** in your successful code implementations
- **Learns from failures** to prevent repeated mistakes
- **Adapts complexity** based on task requirements
- **Provides structured workflows** for consistent quality

## Installation

### Quick Start (No Installation)

```bash
# Works instantly - no global install needed
npx @benredmond/apex start
```

### Global Installation

```bash
# Install once, use everywhere
npm install -g @benredmond/apex
apex start
```

### Project-specific Installation

```bash
# Add to your project
npm install --save-dev @benredmond/apex
```

## Quick Start

### 1. Start APEX in Your Project

```bash
cd your-project
npx @benredmond/apex start
```

This automatically:
- ✅ Detects your project structure
- ✅ Initializes the pattern database
- ✅ Sets up MCP integration (if available)
- ✅ Optimizes based on your Node.js version

### 2. Use with Your AI Assistant

APEX works with any AI coding assistant (Claude Code, Cursor, GitHub Copilot, etc.)

For Claude Code users:
```bash
# MCP integration is automatic
apex mcp install
```

For other AI assistants:
```bash
# Load APEX context
apex prime
```

### 3. Run a Workflow

In Claude Code, use slash commands:
```bash
# Full workflow (recommended)
/execute "Add user authentication to the app"

# Or step-by-step
/research "Add user authentication"   # Creates task, gathers intel
/plan T001                            # Design architecture
/implement T001                       # Build and test
/ship T001                            # Review, commit, reflect
```

APEX will:
1. Spawn parallel agents for intelligence gathering
2. Search for relevant patterns from the database
3. Design architecture with 5 mandatory artifacts
4. Build code with pattern-guided development
5. Run adversarial code review
6. Submit reflection to update pattern trust scores

## The APEX Workflow

### Phase 1: Research (`/research`)
Gather intelligence before coding:
- **Parallel agents**: intelligence-gatherer, git-historian, systems-researcher
- **Pattern lookup**: Find relevant patterns from database
- **Similar tasks**: Learn from past implementations
- **Creates**: Task file at `.apex/tasks/T001.md`

### Phase 2: Plan (`/plan`)
Design the architecture:
- **5 artifacts**: Chain of Thought, Tree of Thought, Chain of Draft, YAGNI, Pattern Selection
- **Interactive**: Review and refine with user
- **Appends**: Plan section to task file

### Phase 3: Implement (`/implement`)
Build and validate:
- **Pattern-guided**: Apply trusted patterns
- **Test loop**: Build → test → iterate until green
- **Evidence tracking**: Log decisions and outcomes

### Phase 4: Ship (`/ship`)
Review and finalize:
- **Adversarial review**: quality-reviewer agent
- **Commit**: With contextual message
- **Reflect**: Update pattern trust scores via `apex_reflect`

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

### Commands not appearing in Claude Code
```bash
# Verify plugin is installed
/plugins

# Reinstall if needed
/plugins install apex@apex
```

### Patterns not being applied
- Check pattern trust score with `apex patterns list`
- Ensure you complete workflows with `/ship` to update trust scores
- Verify MCP server is running: `apex mcp info`

### MCP tools not responding
```bash
apex doctor           # Check system health
apex mcp serve        # Test MCP server manually
ls ~/.apex/           # Verify database exists
```

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
# APEX - Stop Your AI From Making The Same Mistakes Twice

> APEX gives AI assistants memory, learning, and pattern recognition for 40-55% faster development

[![npm version](https://badge.fury.io/js/%40benredmond%2Fapex.svg)](https://badge.fury.io/js/%40benredmond%2Fapex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14-brightgreen)](https://nodejs.org)
[![Works Everywhere](https://img.shields.io/badge/works-everywhere-blue)](https://www.npmjs.com/package/@benredmond/apex)

```bash
# See APEX in action - no installation required!
npx @benredmond/apex start
```

## 🌍 Universal Compatibility

**APEX now works everywhere** - no compilation, no native module errors, just intelligence:

- ✅ **Works on Node.js 14+** - Supports all modern Node versions
- 📦 **93% smaller package** - Reduced from 66.8MB to ~5MB
- 🚀 **Zero compilation required** - No build tools or Python needed
- 🎯 **Automatic optimization** - Uses the fastest available SQLite adapter
- 🛡️ **Always works** - Graceful fallback ensures compatibility

## The Problem

Your AI coding assistant is powerful, but it:
- 🔄 Repeats the same mistakes
- 🤷 Doesn't learn from your codebase
- 📋 Lacks memory between sessions
- 🎯 Misses patterns that could save hours

## The Solution

APEX transforms your AI assistant into an intelligent development partner that learns and improves:

```
Without APEX: AI suggests generic solution → Often wrong → You fix it → AI forgets
With APEX:    AI recalls what worked → Applies proven patterns → Prevents past failures → Gets smarter
```

## Why APEX?

### 🎯 Four Key Differentiators

1. **Universal Compatibility** - Works on any Node.js 14+ without compilation
2. **Zero-Runtime Intelligence** - No background processes, no performance impact
3. **Pattern Evolution** - Discovers, validates, and promotes patterns automatically
4. **Failure Prevention** - Learns from mistakes to prevent repetition

### 💬 Real Developer Experience

> "After 50 tasks, APEX prevented every single MongoDB async/await error that used to waste 30 minutes each time. The pattern system is like having a senior developer's knowledge built into my AI." - APEX User

## Getting Started

**No compilation required!** APEX works instantly on any system with Node.js 14+:

### 🚀 Try It Now (Recommended)
```bash
# Run this in any project - works instantly, no build tools needed
npx @benredmond/apex start

# That's it! APEX is now active in your AI assistant
```

### 📦 Install Globally
```bash
# Install once, use everywhere
npm install -g @benredmond/apex
apex start
```

### 🛠️ CLI Commands
```bash
apex start              # Initialize APEX in your project
apex patterns list      # View available patterns
apex patterns search    # Find patterns by text
apex tasks list         # View tasks
apex tasks stats        # Task metrics
apex doctor             # System health check
apex mcp install        # Setup MCP integration
```

### 🚀 Workflow Commands (Claude Code Plugin)
```bash
/research <task>        # Gather intelligence via parallel agents
/plan <task-id>         # Transform research into architecture
/implement <task-id>    # Build and validate code
/ship <task-id>         # Review, commit, and reflect
/execute <task>         # Run full workflow (research → plan → implement → ship)
/review-pr              # Adversarial code review
```

## Your First APEX Workflow

Let's fix a bug using APEX intelligence:

```bash
# 1. In your project
npx @benredmond/apex start

# 2. In Claude Code, run the full workflow
/execute "Fix authentication test timeout error"
```

Or step-by-step for more control:

```bash
/research "Fix authentication test timeout error"  # Creates task, gathers intel
/plan T001                                         # Design the fix
/implement T001                                    # Build and test
/ship T001                                         # Review, commit, reflect
```

### What APEX Does Behind the Scenes

```
🔍 RESEARCH... Spawning parallel agents for intelligence gathering
📚 PATTERNS... Found 3 relevant patterns from database
🏗️ PLAN... Designing architecture with 5 mandatory artifacts
🔨 IMPLEMENT... Building with pattern-guided development
✅ VALIDATE... Running tests until green
🔎 REVIEW... Adversarial code review via specialized agents
📝 REFLECT... Updating pattern trust scores based on outcome
```

## Core Concepts

### 🧠 APEX Intelligence Engine

Think of APEX as your AI's long-term memory and pattern recognition system:

```
Your Code → APEX Learns → AI Remembers → Better Suggestions → Less Debugging
```

**Key Components:**
- **Pattern Recognition**: Tracks what works with trust scores (★★★★★)
- **Failure Database**: Never repeat the same mistake
- **Smart Context**: Loads only relevant patterns per task
- **Complexity Routing**: Simple tasks stay fast, complex tasks get deep analysis

### 📊 Pattern Lifecycle

Watch patterns evolve from discovery to trusted solution:

```
NEW DISCOVERY          TESTING              VALIDATED            TRUSTED
     ↓                    ↓                    ↓                   ↓
[untracked] ──→ [★★★☆☆ 1 use] ──→ [★★★★☆ 3 uses] ──→ [★★★★★ 47 uses]
              CONVENTIONS.pending.md                    CONVENTIONS.md
```

Real example:
```javascript
[PAT:AUTH:JWT] ★★★★★ (47 uses, 98% success)
// Secure JWT implementation - discovered in T012, now prevents auth vulnerabilities
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
```

### 🔄 4-Phase Workflow

Every task follows a proven methodology via skills and commands:

```
/research → /plan → /implement → /ship
    ↓          ↓          ↓          ↓
 Gather    Architect    Build     Review &
 Intel     Design       & Test    Reflect
```

Each phase is powered by specialized agents and MCP tools:
- **RESEARCH**: Parallel agents gather patterns, git history, similar tasks
- **PLAN**: 5 mandatory design artifacts (Chain of Thought, Tree of Thought, etc.)
- **IMPLEMENT**: Pattern-guided development with continuous validation
- **SHIP**: Adversarial review, commit, and reflection to update trust scores

### 📋 Task Hierarchy

Organize work the way you think:

```
📌 Milestone: "User Authentication System"
  └── 📅 Sprint: "Core Auth Features"
        ├── 📋 Task: "Design auth schema"     [2h]
        ├── 📋 Task: "Build login API"       [3h]
        └── 📋 Task: "Add JWT middleware"    [2h]
```

## Workflows & Examples

### 🐛 Workflow 1: Fixing a Bug

**Scenario**: Your test suite has a flaky test that fails intermittently.

```bash
# Run full workflow
/execute "Fix flaky user creation test"

# Or step by step:
/research "Fix flaky user creation test"   # → Creates T001
/plan T001
/implement T001
/ship T001
```

**APEX in Action:**
```
🔍 RESEARCH PHASE:
- Spawning: intelligence-gatherer, git-historian, failure-predictor
- Found 5 similar flaky test fixes in history
- Pattern match: [FIX:TEST:ASYNC_RACE] (★★★★★ 94% success)

🏗️ PLAN PHASE:
- Chain of Thought: Race condition in async setup
- Tree of Thought: 3 approaches evaluated
- Selected: Add proper await + cleanup pattern

🔨 IMPLEMENT PHASE:
- Applied [FIX:TEST:ASYNC_RACE] pattern
- Tests green after 2 iterations

🚀 SHIP PHASE:
- Adversarial review: No issues found
- Committed: "fix: resolve race condition in user test"
- Reflection submitted: Pattern trust 94% → 95%
```

### 🚀 Workflow 2: Adding a Feature

**Scenario**: Add email notifications to your application.

```bash
/execute "Add email notification system with SendGrid"
```

**APEX Intelligence Throughout:**
```
🔍 RESEARCH:
- 7 agents spawned in parallel
- Found 12 email implementation patterns
- Similar tasks: T089 (email templates), T102 (SendGrid)

🏗️ PLAN:
- 5 design artifacts created
- Architecture: Template-based with provider abstraction
- YAGNI check: Removed unnecessary multi-provider support

🔨 IMPLEMENT:
- Applied patterns: [PAT:EMAIL:TEMPLATE], [PAT:API:RETRY]
- Tests passing after 3 iterations
- Coverage: 87%

🚀 SHIP:
- Review agents found 1 medium issue (fixed)
- New pattern discovered: SendGrid webhook validation
- Reflection: 3 patterns updated, 1 new pattern added
```

### 🔧 Workflow 3: Refactoring Legacy Code

**Scenario**: Modernize callback-based code to async/await.

```bash
/research "Refactor payment.js from callbacks to async/await"
/plan T001
/implement T001
/ship T001
```

**Pattern Discovery in Action:**
```
🔍 RESEARCH:
- systems-researcher: Mapped 147 callback chains
- git-historian: Found similar refactor in commit abc123
- Pattern: [PAT:REFACTOR:CALLBACK_TO_ASYNC] ★★★★★

🏗️ PLAN:
- Progressive refactoring strategy
- 12 files identified, priority ordered
- Risk analysis: High-churn payment.js needs extra tests

🔨 IMPLEMENT:
- Refactored in 4 batches, tests green each batch
- Applied [PAT:REFACTOR:PROGRESSIVE] pattern

🚀 SHIP:
- Review: Clean, no issues
- New pattern discovered: Payment provider error mapping
- Reflection submitted with evidence
```

## Command Reference

### 🚀 Workflow Commands (Claude Code)

The primary workflow uses 4 phase-based commands:

```bash
/research <task-description>    # Phase 1: Spawn agents, gather intelligence
/plan <task-id>                 # Phase 2: Design architecture with 5 artifacts
/implement <task-id>            # Phase 3: Build code, run tests, iterate
/ship <task-id>                 # Phase 4: Review, commit, reflect
```

Or run all phases in sequence:
```bash
/execute <task-description>     # Full workflow: research → plan → implement → ship
```

### ✅ Quality Commands
```bash
/review-pr                      # Adversarial code review with specialized agents
```

### ⚙️ CLI Commands (Terminal)
```bash
apex start                      # Initialize APEX in your project
apex patterns list              # View discovered patterns
apex patterns search <query>    # Search patterns
apex tasks list                 # View tasks
apex doctor                     # System health check
apex mcp install                # Setup MCP integration
```

## Advanced Usage

### Pattern Management

View and manage your pattern library:

```bash
# In terminal
npx @benredmond/apex patterns         # List all active patterns
npx @benredmond/apex patterns pending  # Show patterns being tested
npx @benredmond/apex patterns stats    # Pattern usage statistics
```

Share patterns with your team:
```bash
# Patterns are stored in version control
git add .apex/CONVENTIONS.md
git commit -m "Share authentication patterns"
```

### Gemini Integration

For complex tasks (complexity ≥7), APEX automatically engages Gemini for deeper analysis:

```json
// .apex/config.json
{
  "apex": {
    "geminiApiKey": "your-api-key",
    "complexityThreshold": 7,  // When to engage Gemini
    "geminiModel": "gemini-pro"
  }
}
```

### Custom Configuration

Fine-tune APEX behavior:

```json
{
  "apex": {
    "patternPromotionThreshold": 3,    // Uses before promotion
    "trustScoreThreshold": 0.8,        // Success rate for promotion
    "autoPatternDiscovery": true,      // Find patterns automatically
    "contextTokenBudget": 30000,       // Max context size
    "enableFailurePrevention": true    // Warn about past failures
  }
}
```

## Project Structure

APEX uses a centralized database and plugin architecture:

```
~/.apex/                            # Global APEX data directory
├── <repo-id>/                      # Per-repository intelligence
│   └── patterns.db                 # SQLite database (patterns, tasks, reflections)
│
your-project/
├── .apex/                          # Project-specific files (optional)
│   └── tasks/                      # Task files created by /research
│       └── T001.md                 # Task brief with research, plan, evidence
│
# Plugin components (in apex package)
├── skills/                         # 6 workflow skills
│   ├── research/SKILL.md           # Intelligence gathering
│   ├── plan/SKILL.md               # Architecture design
│   ├── implement/SKILL.md          # Build and validate
│   ├── ship/SKILL.md               # Review and reflect
│   ├── execute/SKILL.md            # Full workflow orchestrator
│   └── using-apex-mcp/SKILL.md     # MCP tools reference
├── agents/                         # 12 specialized agents
│   ├── intelligence-gatherer.md    # Orchestrates research
│   ├── git-historian.md            # Git history analysis
│   ├── systems-researcher.md       # Codebase deep dives
│   └── ...                         # And 9 more
└── commands/                       # Slash commands
    ├── research.md                 # /research
    ├── plan.md                     # /plan
    ├── implement.md                # /implement
    ├── ship.md                     # /ship
    └── execute.md                  # /execute
```

## Troubleshooting

### Common Issues

**Skills/commands not appearing in Claude Code**
- Verify plugin is installed: `/plugins` in Claude Code
- Reinstall: `/plugins install apex@apex`
- Check MCP server: `apex mcp info`

**Patterns not being applied**
- Check pattern trust score - must be ★★★☆☆ or higher
- Verify pattern context matches your use case
- Run `apex patterns list` to see available patterns

**MCP tools not responding**
- Run `apex doctor` to check system health
- Verify database exists: `ls ~/.apex/`
- Check MCP server: `apex mcp serve` (manual test)

### FAQ

**Q: How does APEX work with my AI assistant?**
A: APEX provides markdown-based commands that guide your AI through proven workflows. It's like giving your AI a memory and a methodology.

**Q: Is my code/data private?**
A: Yes. APEX runs locally and stores all patterns/learnings in your project. Nothing is sent to external servers except optional Gemini API calls for complex tasks.

**Q: Can I use APEX with [Cursor/GitHub Copilot/other AI]?**
A: Yes! APEX works with any AI that can read markdown files and execute commands. The commands are universal.

**Q: How long before I see productivity gains?**
A: Immediately for workflow organization. Pattern benefits appear after 5-10 tasks. Full 40-55% gains typically seen after 50+ tasks as the pattern library grows.

**Q: Can I share patterns with my team?**
A: Yes! Patterns are stored in `.apex/CONVENTIONS.md` which can be committed to version control and shared.

## Performance & Database Adapters

APEX automatically selects the best SQLite adapter for your environment:

### Three-Tier Adapter System
```
┌─────────────────────────────────────┐
│     Automatic Adapter Selection     │
├─────────────────────────────────────┤
│ Node 22+ → node:sqlite (built-in)  │
│ Node 14-21 → better-sqlite3/sql.js │
│ Containers → sql.js (universal)    │
└─────────────────────────────────────┘
```

**Performance comparison:**
| Operation | Native | WASM | Impact |
|-----------|--------|------|--------|
| Pattern lookup | 1ms | 2-3ms | ✅ Excellent |
| Search | 5ms | 10-20ms | ✅ Good |
| Batch import | 100ms | 300ms | ✅ Acceptable |

### Force Specific Adapter (Optional)
```bash
export APEX_FORCE_ADAPTER=wasm  # Always works
export APEX_FORCE_ADAPTER=better-sqlite3  # If available
export APEX_FORCE_ADAPTER=node-sqlite  # Node 22+ only
```

## Troubleshooting & Support

### Quick Diagnostics
```bash
apex doctor           # System health check
apex doctor --verbose # Detailed diagnostics
```

### Common Solutions

**"Cannot find module 'better-sqlite3'"**
✅ Normal - APEX automatically uses WebAssembly fallback

**Slow pattern lookups**
→ Check adapter: `apex doctor`
→ Upgrade to Node 22+ for native performance

**"Database locked" error**
→ Kill other APEX processes: `pkill -f apex`

### Debug Mode
```bash
export APEX_DEBUG=1      # Basic debug output
export APEX_TRACE=1      # Verbose logging
export APEX_PERF_LOG=1   # Performance metrics
```

## Migration from Earlier Versions

### v1.0.0 Universal Compatibility Update

**What changed:**
- 93% smaller package (66.8MB → ~5MB)
- No compilation required
- Works on Node.js 14+
- Automatic adapter selection

**For existing users:**
```bash
npm update -g @benredmond/apex
apex start  # Automatic migration
```

Your patterns and database work identically across all adapters.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Key areas for contribution:
- Domain-specific pattern libraries
- AI assistant integrations
- Workflow improvements
- Documentation examples

## License

MIT License - see [LICENSE](LICENSE) for details

## Changelog

### v0.5.0 - Skill-Based Workflow
- ✨ New 4-phase workflow: /research → /plan → /implement → /ship
- 🚀 6 skills for modular, composable workflows
- 🤖 12 specialized agents for parallel intelligence gathering
- 📝 Slash commands for direct skill invocation
- 🔧 Agent architecture refactored and streamlined

### v0.4.4 - Universal Compatibility
- Works on any Node.js 14+ without compilation
- Three-tier SQLite adapter system
- MCP integration improvements

See full [release history](https://github.com/benredmond/apex/releases)

---

**Ready to stop repeating mistakes?** Run `npx @benredmond/apex start` and watch your AI assistant get smarter with every task.

Built with ❤️ and Intelligence by the APEX Community
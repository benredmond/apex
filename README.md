# APEX - Stop Your AI From Making The Same Mistakes Twice

> APEX gives AI assistants memory, learning, and pattern recognition for 40-55% faster development

[![npm version](https://badge.fury.io/js/%40benredmond%2Fapex.svg)](https://badge.fury.io/js/%40benredmond%2Fapex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

```bash
# See APEX in action - no installation required!
npx @benredmond/apex start
```

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

## Why APEX?|

### 🎯 Three Key Differentiators

1. **Zero-Runtime Intelligence** - No background processes, no performance impact
2. **Pattern Evolution** - Discovers, validates, and promotes patterns automatically
3. **Failure Prevention** - Learns from mistakes to prevent repetition

### 💬 Real Developer Experience

> "After 50 tasks, APEX prevented every single MongoDB async/await error that used to waste 30 minutes each time. The pattern system is like having a senior developer's knowledge built into my AI." - APEX User

## Getting Started

Choose your preferred way to start:

### 🚀 Try It Now (Recommended)
```bash
# Run this in any project - installs nothing globally
npx @benredmond/apex start

# That's it! APEX is now active in your AI assistant
```

### 📦 Install Globally
```bash
# Install once, use everywhere
npm install -g @benredmond/apex
apex start
```

### 🛠️ Manual Setup
```bash
# For complete control
git clone https://github.com/benredmond/apex
cp -r apex/templates/.apex your-project/
cp -r apex/templates/.claude your-project/  # For Claude users
```

## Your First APEX Workflow

Let's fix a bug using APEX intelligence - this takes less than 5 minutes:

```bash
# 1. In your project with a failing test
npx @benredmond/apex start

# 2. Open your AI assistant (Claude Code, Cursor, etc.)

# 3. Create a task for the bug
/create_task "Fix authentication test timeout error"

# 4. Let APEX guide the fix
/task T001
```

### What APEX Does Behind the Scenes

```
🧠 ANALYZING... Complexity: 3/10
📚 LOADING... Found 3 similar past fixes
⚡ PATTERN... Applying [FIX:TEST:ASYNC_TIMEOUT] (★★★★★ 98% success)
🛡️ PREVENTING... Warning: This error often caused by missing await
✅ EXECUTING... Test fixed in one try (vs 3 tries typically)
📈 LEARNING... Pattern trust score increased
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

### 🔄 5-Phase Workflow

Every task follows a proven methodology:

```
ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER
    ↓          ↓          ↓           ↓            ↓
 Research   Implement    Test      Review    Learn & Document
```

This isn't just process - it's intelligence-driven:
- **ARCHITECT**: Loads similar task solutions
- **BUILDER**: Applies proven patterns
- **VALIDATOR**: Runs learned test strategies  
- **REVIEWER**: AI + Gemini review (complex tasks)
- **DOCUMENTER**: Captures new patterns

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
# Create the bug fix task
/create_task "Fix flaky user creation test"
# Output: Created task T001

# Execute with APEX intelligence
/task T001
```

**APEX in Action:**
```
🧠 ANALYZING... 
- Complexity: 3/10 (single test file)
- Similar issues: Found 5 flaky test fixes
- Pattern match: [FIX:TEST:ASYNC_RACE] likely applies

📚 INTELLIGENCE LOADED:
- TX089: Fixed similar race condition (2h → 15min with pattern)
- Pattern: Always await user.save() before assertions
- Warning: db.clean() must complete before test

🔨 IMPLEMENTING...
Applied [FIX:TEST:ASYNC_RACE] pattern:
  - Added await before user.save()
  - Wrapped in act() for React updates
  - Added afterEach cleanup

✅ VALIDATING...
- Ran test 50x: 0 failures (was failing 30% before)
- All related tests still passing

📝 DOCUMENTING...
- Pattern success rate: 94% → 95%
- Saved to learning database
- Estimated time saved: 1.5 hours
```

### 🚀 Workflow 2: Adding a Feature

**Scenario**: Add email notifications to your application.

```bash
# Create a sprint for the feature
/sprint M01 "Email Integration" 
# Output: Created sprint S03

# Break down into tasks
/create_task "Design email template system" --sprint S03
/create_task "Integrate SendGrid API" --sprint S03  
/create_task "Add email preferences to user model" --sprint S03

# Execute first task
/task T001
```

**APEX Intelligence Throughout:**
```
ARCHITECT PHASE:
🧠 Loading email patterns from 12 previous implementations
📊 Complexity: 6/10 - Will engage Gemini for architecture review
🎯 Suggested approach: Template-based with provider abstraction

BUILDER PHASE:
⚡ Auto-applied patterns:
- [PAT:EMAIL:TEMPLATE_ENGINE] - Handlebars with layouts
- [PAT:API:RETRY_LOGIC] - Exponential backoff for sends
- [PAT:CONFIG:ENV_VALIDATION] - Ensure API keys present

VALIDATOR PHASE:
✅ Tests generated using [PAT:TEST:EMAIL_MOCK] pattern
🛡️ Prevented common issue: Emails sending in test environment

RESULT: Feature complete in 2.5h (vs 5h estimated)
```

### 🔧 Workflow 3: Refactoring Legacy Code

**Scenario**: Modernize callback-based code to async/await.

```bash
# Create refactoring task
/create_task "Refactor payment.js from callbacks to async/await"

# Execute with intelligence
/task T001
```

**Pattern Discovery in Action:**
```
🧠 ANALYZING payment.js...
- 147 callback chains detected
- Error handling inconsistent
- Similar refactor: TX142 (saved 3 hours)

📋 APPLYING PATTERNS:
1. [PAT:REFACTOR:CALLBACK_TO_ASYNC] ★★★★★
   - Preserve error handling semantics
   - Maintain callback API for backwards compatibility

2. [PAT:REFACTOR:PROGRESSIVE] ★★★★☆  
   - Refactor in testable chunks
   - Keep tests green throughout

🔄 DISCOVERING NEW PATTERN:
Found repeated pattern not in database:
- Payment providers need .catch() → try/catch wrapper
- Adding to CONVENTIONS.pending.md for validation

✅ RESULT:
- 147 callbacks → clean async/await
- All tests passing
- 0 production issues after deploy
- New pattern discovered for future use
```

## Command Reference

APEX commands are organized by development phase:

### 📅 Planning Commands
```bash
/milestone "Project Goal"           # Create high-level milestone
/sprint M01 "Sprint Name"          # Create sprint in milestone  
/create_task "Task" --sprint S01   # Create task in sprint
/plan                              # View current plan
```

### 🚀 Execution Commands
```bash
/task T001                         # Execute task with full intelligence
/task                             # Continue current task
/yolo                            # Autonomous multi-task mode
```

### ✅ Quality Commands
```bash
/review                          # AI code review with learning
/test                           # Run tests with pattern analysis
/debug "error message"          # Debug with failure database
/design "component"             # Architecture assistance
```

### 📝 Finalization Commands
```bash
/commit                         # Smart commit with context
/reflect                       # Extract and save learnings
```

### ⚙️ System Commands
```bash
apex start                     # Initialize APEX patterns database (in terminal)
/prime                        # Load APEX context into AI
/verify                      # Check APEX health
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

APEX creates an intelligent project organization:

```
your-project/
├── .apex/                          # APEX Intelligence Hub
│   ├── CONVENTIONS.md              # Trusted patterns (★★★★☆+)
│   ├── CONVENTIONS.pending.md      # Testing patterns (<3 uses)
│   ├── 09_LEARNING/               
│   │   ├── failures.jsonl          # What went wrong & how to prevent
│   │   └── TASK_LEARNINGS.md       # Successful approaches
│   └── PATTERN_METADATA.json       # Pattern statistics & trust scores
│
└── .claude/commands/apex/          # AI command templates
    ├── 01_plan/                    # Planning phase commands
    ├── 02_execute/                 # Execution with intelligence
    ├── 03_quality/                 # Smart testing & review
    └── 04_finalize/                # Learning capture
```

## Troubleshooting

### Common Issues

**"Command not found" in AI assistant**
- Run `/prime` to load APEX commands into context
- Ensure you ran `apex start` in your project root
- Check that `.claude/commands/apex/` exists

**Patterns not being applied**
- Check pattern trust score - must be ★★★☆☆ or higher
- Verify pattern context matches your use case
- Run `apex patterns stats` to see pattern health

**High complexity score on simple task**
- Review task description for trigger words
- Check if task touches multiple systems
- Complexity can be manually overridden in task file

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

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Key areas for contribution:
- Domain-specific pattern libraries
- AI assistant integrations  
- Workflow improvements
- Documentation examples

## License

MIT License - see [LICENSE](LICENSE) for details

## Acknowledgments

APEX was inspired by the need for AI assistants that truly learn and improve. Special thanks to:
- The Claude, Cursor, and Copilot communities
- Early adopters who provided pattern data
- Contributors who shaped the workflow methodology

---

**Ready to stop repeating mistakes?** Run `npx @benredmond/apex start` and watch your AI assistant get smarter with every task.

Built with ❤️ and Intelligence by the APEX Community
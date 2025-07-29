# APEX Command Templates

This directory contains markdown templates for APEX's 5-phase workflow system.

## Directory Structure

```
commands/
├── plan/         # Planning phase commands (milestones, sprints, tasks)
├── execute/      # Execution phase commands (task implementation)
├── quality/      # Quality phase commands (testing, review, debugging)
├── finalize/     # Finalization phase commands (commits, documentation)
└── system/       # System commands (init, prime, verify)
```

## 5-Phase Workflow

1. **ARCHITECT** - Design and plan the solution
2. **BUILDER** - Implement according to specifications
3. **VALIDATOR** - Test and validate the implementation
4. **REVIEWER** - Review code quality and patterns
5. **DOCUMENTER** - Document learnings and update patterns

## Key Features

- **Pattern Recognition**: Automatically discovers and tracks code patterns
- **Trust Scoring**: ★★★★★ star ratings based on pattern effectiveness
- **Failure Prevention**: Learns from past failures to prevent future issues
- **Parallel Execution**: Uses Task agents for concurrent operations
- **Gemini Integration**: Engages Gemini AI for complex tasks (complexity ≥ 5)

## Usage

These templates are used by AI assistants (Claude, Cursor, etc.) when executing APEX commands:

```bash
# Execute a task
/execute.task APE-21

# Create a milestone
/plan.milestone "MVP Release"

# Review code quality
/quality.review
```

## Pattern Format

All patterns follow the format: `[TYPE:CATEGORY:SPECIFIC]`

- **CMD**: Command patterns (git, npm, pytest)
- **PAT**: Code patterns (async, error handling)
- **FIX**: Failure fixes (known issues)
- **ARCH**: Architecture patterns
- **PROJ**: Project-specific patterns

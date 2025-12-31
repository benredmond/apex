# Adversarial Multi-Agent Code Review System

A production-grade code review system that uses adversarial agents to eliminate false positives while maintaining thoroughness.

## Overview

This system implements a **three-phase** review process:

1. **Phase 1 (First-Pass Review)**: 5 specialized agents find issues with **0-100 confidence scoring**
2. **Phase 2 (Adversarial Challenge)**: 1 unified challenger validates, checks history, analyzes ROI, and applies overrides
3. **Phase 3 (Synthesis)**: Tiered threshold filtering (≥80 Fix Now, 60-79 Should Fix, <60 filtered)

**Key Innovation**:
- Phase 1 agents use **pre-filtering** (diff-only, not linter-catchable) to focus on high-signal findings
- Phase 2 unified challenger can **pull forward** (→ Fix Now) or **push back** (→ Should Fix) findings
- Result: High-confidence actionable findings with low noise (<60 filtered out)

## Architecture

```
/review-pr <target>
       ↓
Phase 1: First-Pass Review (5 agents in parallel)
├─ security-analyst      (vulnerabilities, auth, injection)
├─ git-historian         (pattern violations, regressions)
├─ architecture-analyst  (design patterns, consistency)
├─ test-coverage-analyst (test gaps, edge cases)
└─ code-quality-analyst  (maintainability, readability)
       ↓
Phase 2: Unified Challenger
└─ challenger (validates, checks history, analyzes ROI, overrides)
       ↓
Phase 3: Synthesis & Tiered Thresholds
├─ ≥80 → 🔴 Fix Now
├─ 60-79 → 🟡 Should Fix
└─ <60 → Filtered (not shown)
       ↓
Final Report: Fix Now / Should Fix / Filtered
```

## Installation

The review system is part of the APEX repository. Agents are located in:

```
agents/review/
├── phase1/           # First-pass review agents (0-100 confidence)
│   ├── security-analyst.md
│   ├── git-historian.md         # Pattern violations, regressions
│   ├── architecture-analyst.md
│   ├── test-coverage-analyst.md
│   └── code-quality-analyst.md
│
├── phase2/           # Adversarial challenge agent
│   └── challenger.md            # Unified: validation, history, ROI, overrides
│
└── README.md

commands/
└── review-pr.md     # Main orchestrator
```

## Usage

### Basic Usage

```bash
# Review a PR by number (requires gh CLI)
/review-pr 123

# Review changes on a branch
/review-pr feature/add-authentication

# Review specific files
/review-pr src/api/auth.ts src/middleware/security.ts

# Review uncommitted changes
/review-pr HEAD
```

### Example Workflow

1. **Create a PR or make changes**
2. **Run the review**: `/review-pr feature-branch`
3. **Wait for Phase 1** (5 agents analyze in parallel with 0-100 scoring)
4. **Wait for Phase 2** (unified challenger validates and adjusts)
5. **Review final report** with tiered recommendations
6. **Act on recommendations**:
   - **🔴 Fix Now** (≥80): Must fix before merge
   - **🟡 Should Fix** (60-79): Should fix, can defer with reason
   - **Filtered** (<60): Not shown, noise removed

## Phase 1: First-Pass Review Agents

All Phase 1 agents use **0-100 confidence scoring** with **pre-filtering rules**.

### Pre-Filtering Rules

| Skip If... | Rationale |
|------------|-----------|
| Linter/formatter would catch it | ESLint, Prettier, ruff handle these |
| Issue exists in unchanged code | Only review changes in the diff |
| Pure style preference | Not actionable without team consensus |

**Key Principle**: Focus on high-signal findings that require human judgment.

### security-analyst

**Focus**: Security vulnerabilities (SQL injection, XSS, auth bypasses)

**Confidence Factors**: Exploit reproducibility, mitigation effectiveness, data sensitivity

**Output**: YAML findings with 0-100 confidence scores

### git-historian

**Focus**: Pattern violations, regressions, codebase inconsistencies

**Approach**: Uses git history to detect when changes break established patterns

**Checks**:
- Pattern violations (divergence from codebase conventions)
- Regression indicators (reverting previous improvements)
- Ownership context (who maintains this code)

**Output**: YAML findings with 0-100 confidence scores

### architecture-analyst

**Focus**: Architectural violations (layer separation, circular dependencies, pattern consistency)

**Confidence Factors**: Violation severity, counter-examples in codebase, documented exceptions

**Output**: YAML findings with 0-100 confidence scores

### test-coverage-analyst

**Focus**: Test coverage gaps (untested paths, missing edge cases)

**Confidence Factors**: Code criticality, existing coverage, test quality

**Output**: YAML findings with 0-100 confidence scores

### code-quality-analyst

**Focus**: Code quality (complexity, readability, maintainability)

**Confidence Factors**: Cyclomatic complexity, duplication, naming clarity

**Output**: YAML findings with 0-100 confidence scores

## Phase 2: Unified Challenger

Phase 2 uses a **single unified challenger** that evaluates all Phase 1 findings across 4 dimensions.

### challenger

**Focus**: Validate findings and adjust confidence scores

**4 Dimensions**:
1. **Validation** - Is the finding accurate?
   - Did Phase 1 read the code correctly?
   - Does the framework prevent this issue?
   - Is there existing mitigation?

2. **Historical Context** - Is there justification?
   - Previous failed attempts to fix this?
   - Documented decisions explaining this pattern?
   - Intentional technical debt?

3. **ROI Analysis** - Is fixing worth it?
   - Fix complexity (lines changed, risk)
   - Benefit magnitude (user impact, maintenance)
   - Opportunity cost

4. **Override Decision** - Should this be pulled forward or pushed back?
   - **Pull forward** (→ Fix Now): Security issues, code smells, future problems
   - **Push back** (→ Should Fix): Deprecated code, one-time use, low traffic paths

**Confidence Adjustments**:
```javascript
confidence = phase1Confidence
confidence *= (0.5 + evidenceScore * 0.5)  // Evidence quality
if (previousAttemptFailed) confidence *= 0.3
else if (documentedDecision) confidence *= 0.4
else if (intentionalDebt) confidence *= 0.5
if (lowROI) confidence *= 0.7

// Override decisions
if (pullForward) confidence = max(confidence, 80)  // → Fix Now
if (pushBack) confidence = min(confidence, 79)     // → Should Fix at most
```

**Key Principle**: Challenge EVERY finding. No conditional skip. No self-classification bypass.

## Phase 3: Synthesis & Tiered Thresholds

The orchestrator applies challenger adjustments and tiered thresholds:

### Tiered Thresholds

| Final Confidence | Recommendation | Action |
|-----------------|----------------|--------|
| ≥80 | 🔴 Fix Now | Must fix before merge |
| 60-79 | 🟡 Should Fix | Should fix, may defer with reason |
| <60 | Filtered | Not shown in output |

### Override Rules

The challenger can override thresholds for specific cases:

- **Pull Forward** (→ Fix Now): Security issues, code smells that will compound, architectural debt
- **Push Back** (→ Should Fix at most): Deprecated code paths, one-time scripts, low-traffic paths

## Output Format

### Summary

```markdown
## Review Summary
Found 15 issues → 4 Fix Now, 6 Should Fix, 5 filtered

### 🔴 Fix Now (4)
| ID | Score | Issue | Location |
|----|-------|-------|----------|
| SEC-001 | 92 | SQL injection in user search | src/api/users.ts:142 |

### 🟡 Should Fix (6)
| ID | Score | Issue | Location |
|----|-------|-------|----------|
| ARCH-002 | 71 | Circular dependency | src/utils.ts:12 |
```

### Finding Detail (Fix Now only)

```markdown
### SEC-001: SQL Injection in user search
**Score**: 92 | **Location**: `src/api/users.ts:142-144`

**Issue**: User input directly concatenated into SQL query

**Evidence**:
- String template with user input
- Pattern match: [ANTI:SEC:SQL_INJECTION]
- Missing sanitization: No parameterized query

**Fix**:
```typescript
// Before
const query = `SELECT * FROM users WHERE email = '${email}'`;

// After
const query = 'SELECT * FROM users WHERE email = ?';
const result = await db.execute(query, [email]);
```
```

## Success Metrics

**Target Metrics**:
- Filter Rate: >30% (noise filtered by <60 threshold)
- Fix Now Accuracy: >90% (high-confidence findings are real issues)
- Override Usage: <20% (most findings don't need override)
- Review Time: < 10 minutes for standard PR

**Quality Indicators**:
- Fix Now (≥80) should be real, actionable issues
- Should Fix (60-79) should be valid but lower priority
- Filtered (<60) should be noise or false positives
- Override decisions should have documented reasoning

## Configuration

### Adjusting Thresholds

Edit `/commands/review-pr.md` to tune the tiered thresholds:

```javascript
// Tiered thresholds (0-100 scale)
const FIX_NOW_THRESHOLD = 80;     // Higher = fewer Fix Now
const SHOULD_FIX_THRESHOLD = 60;  // Higher = more filtered out
```

### Enabling/Disabling Agents

To disable an agent, simply don't invoke it in the orchestrator. Comment out the `<Task>` call in `/commands/review-pr.md`.

## Best Practices

### For Users

1. **Review incrementally**: Run on small PRs (< 500 lines)
2. **Act on Fix Now**: They're high-confidence, must fix before merge
3. **Prioritize Should Fix**: Valid issues, but can defer with reason
4. **Trust filtering**: <60 findings are noise

### For Developers

1. **Trust the process**: Unified challenger filters false positives
2. **Provide context**: Add comments explaining unusual patterns
3. **Write tests**: Test coverage analyst is thorough
4. **Follow patterns**: Architecture analyst enforces consistency
5. **Fix security issues**: Security analyst is aggressive for good reason

## Troubleshooting

### "Too many false positives"

- Check unified challenger is running
- Lower pre-filtering thresholds
- Review challenger override decisions

### "Missing real issues"

- Lower tiered thresholds (e.g., 70/50 instead of 80/60)
- Check Phase 1 agents aren't pre-filtering too aggressively
- Review filtered findings for patterns

### "Review takes too long"

- Review smaller changesets
- Consider disabling code-quality-analyst for quick reviews
- Run security-analyst only for critical paths

## Architecture Decisions

### Why Adversarial?

Traditional code review tools have high false positive rates (20-40%) because they prioritize recall over precision. Our system inverts this: Phase 1 achieves high recall, Phase 2 achieves high precision.

### Why 5 + 1 agents?

- **Phase 1 (5 agents)**: Covers major review categories (security, git-history, architecture, tests, quality)
- **Phase 2 (1 unified challenger)**: Consolidates validation, historical context, ROI analysis, and override decisions into a single agent
- Previous 3-agent Phase 2 had overlapping responsibilities; unified challenger achieves same coverage with less overhead
- Pre-filtering in Phase 1 reduces Phase 2 workload by removing obvious noise upfront

### Why YAML output?

- Structured and parseable
- Easy for synthesis algorithm to process
- Human-readable for debugging
- Consistent format across agents

### Why 0-100 confidence scoring?

- Intuitive scale (percentage-like)
- Enables tiered thresholds (≥80/60/<60)
- Transparent reasoning (not black box)
- Adjustable thresholds

## Future Enhancements

Potential improvements (not yet implemented):

1. **Machine Learning**: Calibrate confidence scores from historical outcomes
2. **Pattern Database**: Learn from accepted/rejected findings
3. **Custom Agents**: Domain-specific reviewers (e.g., accessibility, i18n)
4. **IDE Integration**: Real-time review as you type
5. **Team Metrics**: Track false positive rates per agent
6. **Auto-fix**: Generate pull requests for simple fixes

## Contributing

To add a new review agent:

1. Create markdown file in `agents/review/phase1/` or `phase2/`
2. Follow existing agent format (frontmatter + structured content)
3. Define clear output format (YAML)
4. Add invocation to `/commands/review-pr.md`
5. Test with sample code
6. Document in this README

## License

Part of the APEX project. See main repository for license details.

## Contact

For issues or questions, see the main APEX repository.

---

**Built with Claude Code** | **Powered by APEX Pattern Intelligence**

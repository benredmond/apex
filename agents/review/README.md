# Adversarial Multi-Agent Code Review System

A production-grade code review system that uses adversarial agents to eliminate false positives while maintaining thoroughness.

## Overview

This system implements a **three-phase** review process:

1. **Phase 1 (First-Pass Review)**: 5 specialized agents aggressively find issues
2. **Phase 2 (Adversarial Challenge)**: 5 agents challenge findings to eliminate false positives
3. **Phase 3 (Synthesis)**: Evidence-based confidence scoring and prioritized recommendations

**Key Innovation**: Agents "fight with each other" - Phase 1 overreports (high recall), Phase 2 filters (high precision), producing high-confidence actionable findings.

## Architecture

```
/review-pr <target>
       ↓
Phase 1: First-Pass Review (Parallel)
├─ security-analyst
├─ performance-analyst
├─ architecture-analyst
├─ test-coverage-analyst
└─ code-quality-analyst
       ↓
Phase 2: Adversarial Challenge (Parallel)
├─ devils-advocate
├─ false-positive-hunter
├─ context-defender
├─ tradeoff-analyst
└─ evidence-validator
       ↓
Phase 3: Synthesis & Reconciliation
└─ Confidence scoring + prioritization
       ↓
Final Report: Fix / Defer / Accept / Dismiss
```

## Installation

The review system is part of the APEX repository. Agents are located in:

```
agents/review/
├── phase1/          # First-pass review agents
│   ├── security-analyst.md
│   ├── performance-analyst.md
│   ├── architecture-analyst.md
│   ├── test-coverage-analyst.md
│   └── code-quality-analyst.md
│
├── phase2/          # Adversarial challenge agents
│   ├── devils-advocate.md
│   ├── false-positive-hunter.md
│   ├── context-defender.md
│   ├── tradeoff-analyst.md
│   └── evidence-validator.md
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
3. **Wait for Phase 1** (5 agents analyze in parallel)
4. **Wait for Phase 2** (5 agents challenge findings)
5. **Review synthesis report** with confidence scores
6. **Act on recommendations**:
   - **Fix**: High-confidence, high-priority issues
   - **Defer**: Valid but low ROI (add to backlog)
   - **Accept**: Context-justified (document)
   - **Dismiss**: False positives

## Phase 1: First-Pass Review Agents

### security-analyst

**Focus**: Security vulnerabilities (SQL injection, XSS, auth bypasses)

**Approach**: Aggressive - flags all potential security issues

**Output**: Findings with exploit scenarios, fix suggestions, confidence scores

**Severity Tiers**: Critical (RCE, data breach) → High (XSS, weak crypto) → Medium (missing headers) → Low (info disclosure)

### performance-analyst

**Focus**: Performance bottlenecks (N+1 queries, O(n²) algorithms, memory leaks)

**Approach**: Assumes production scale - flags anything that won't scale

**Output**: Findings with impact estimates, complexity analysis, optimization suggestions

**Metrics**: Complexity (O notation), query counts, memory growth

### architecture-analyst

**Focus**: Architectural violations (layer separation, circular dependencies, pattern consistency)

**Approach**: Enforces existing project patterns strictly

**Output**: Findings with counter-examples from codebase, refactoring suggestions

**Compares**: New code vs established patterns in same codebase

### test-coverage-analyst

**Focus**: Test coverage gaps (untested paths, missing edge cases, quality issues)

**Approach**: Prioritizes critical paths over coverage percentage

**Output**: Findings with specific untested paths, suggested test code

**Checks**: Unit tests, integration tests, edge cases, error paths

### code-quality-analyst

**Focus**: Code quality (complexity, readability, naming, duplication)

**Approach**: Pragmatic - focuses on real maintainability issues, not style nitpicks

**Output**: Findings with complexity metrics, refactoring examples

**Metrics**: Cyclomatic complexity, function length, nesting depth

## Phase 2: Adversarial Challenge Agents

### devils-advocate

**Focus**: Challenge validity of every finding

**Approach**: Ruthlessly skeptical - finds ANY reason to dismiss

**Challenges**:
- Severity overstatement (mitigations reduce actual risk)
- Evidence misreading (code was misunderstood)
- Impact exaggeration (blast radius smaller than claimed)
- Compensating controls (safeguards missed by Phase 1)

### false-positive-hunter

**Focus**: Identify pattern-matching errors and code misreadings

**Approach**: Trust nothing - verify everything by reading actual code

**Detects**:
- Code misread (missed validation/error handling)
- Pattern mismatch (framework auto-handles issue)
- Missing context (didn't check surrounding code)
- Framework magic (ORM auto-parameterizes, React auto-escapes)

### context-defender

**Focus**: Find historical justifications for "problematic" code

**Approach**: Use git archaeology to find the "why"

**Research**:
- Git history (commit messages, blame)
- Previous attempts (reverted refactorings)
- Documentation (ADRs, design docs)
- External constraints (API limitations, compliance)

### tradeoff-analyst

**Focus**: Evaluate fix ROI (effort vs benefit)

**Approach**: Pragmatic - engineering time is precious

**Analysis**:
- Fix complexity (hours/days/weeks)
- Fix risk (could introduce bugs)
- Actual benefit (measured, not theoretical)
- Opportunity cost (what else could be built)

**ROI Formula**: `benefit / (benefit + cost)`

### evidence-validator

**Focus**: Rate quality and strength of evidence

**Approach**: Rigorous - evidence must be verifiable

**Ratings**:
- **Strong** (0.85-1.0): Failing test, measured metrics, reproducible exploit
- **Medium** (0.6-0.85): Pattern match, code inspection, historical issue
- **Weak** (0.0-0.6): Speculation, theoretical, unverified

## Phase 3: Synthesis Algorithm

The orchestrator synthesizes Phase 1 and Phase 2 results using evidence-based scoring:

### Confidence Calculation

```typescript
validityConfidence = phase1.confidence
  * (1 - challengeRate * 0.4)          // Reduce for challenges
  * (0.5 + evidenceScore * 0.5)        // Adjust for evidence quality
  * (contextJustified ? 0.3 : 1.0)     // Reduce if justified

// challengeRate = (# of Phase 2 agents that challenged) / 5
// evidenceScore = 0.0-1.0 from evidence-validator
// contextJustified = context-defender found justification
```

### Priority Calculation

```typescript
severityPoints = {Critical: 100, High: 75, Medium: 50, Low: 25}
priority = severityPoints[severity] * validityConfidence * roiScore

// roiScore = 0.0-1.0 from tradeoff-analyst
```

### Recommendation Logic

```typescript
if (validityConfidence < 0.3) return "Dismiss"  // False positive
else if (contextJustified && validityConfidence < 0.6) return "Accept"  // Justified
else if (roiScore < 0.3) return "Defer"  // Negative ROI
else if (validityConfidence > 0.7 && priority > 60) return "Fix"  // High value
else if (priority > 40) return "Defer"  // Medium value
else return "Accept"  // Low value
```

## Output Format

### Summary

```
Phase 1 Findings: 22
Phase 2 Challenges: 47
Final Recommendations:
  ✅ Fix: 5
  ⏸️ Defer: 8
  ✓ Accept: 3
  ✖️ Dismiss: 6
False Positive Rate: 27%
Avg Confidence: 0.73
```

### Finding Detail

```markdown
### SEC-001: SQL Injection in user search
**Severity**: Critical | **Confidence**: 0.95 | **Priority**: 95

**Location**: `src/api/users.ts:142-144`

**Issue**: User input directly concatenated into SQL query

**Evidence**:
- ✅ Code inspection: String template with user input
- ✅ Pattern match: [ANTI:SEC:SQL_INJECTION]
- ✅ Missing sanitization: No parameterized query

**Phase 2 Challenges**:
- Devil's Advocate: "Rate limiting mitigates" (rejected)

**Fix**:
```typescript
// Before
const query = `SELECT * FROM users WHERE email = '${email}'`;

// After
const query = 'SELECT * FROM users WHERE email = ?';
const result = await db.execute(query, [email]);
```

**Recommendation**: Fix immediately
```

## Success Metrics

**Target Metrics**:
- False Positive Rate: < 30%
- Signal Ratio: > 60% actionable findings
- Confidence Accuracy: 80%+ correlation with reality
- Review Time: < 10 minutes for standard PR

**Quality Indicators**:
- High-confidence findings should be real issues
- Low-confidence findings should be questionable
- Dismissed findings should be false positives
- Accepted findings should be justified

## Configuration

### Adjusting Thresholds

Edit `/commands/review-pr.md` to tune the synthesis algorithm:

```typescript
// Confidence thresholds
const DISMISS_THRESHOLD = 0.3;  // Lower = more strict
const ACCEPT_THRESHOLD = 0.6;   // Higher = less accepting

// Priority thresholds
const FIX_PRIORITY = 60;    // Lower = more fixes
const DEFER_PRIORITY = 40;  // Lower = more defers

// ROI threshold
const ROI_THRESHOLD = 0.3;  // Higher = more selective
```

### Enabling/Disabling Agents

To disable an agent, simply don't invoke it in the orchestrator. Comment out the `<Task>` call in `/commands/review-pr.md`.

## Best Practices

### For Users

1. **Review incrementally**: Run on small PRs (< 500 lines)
2. **Act on Fix recommendations**: They're high-confidence
3. **Question Dismiss decisions**: Verify they're actually false positives
4. **Document Accept decisions**: Add comments explaining why
5. **Defer wisely**: Add to backlog, don't ignore

### For Developers

1. **Trust the process**: Phase 2 filters false positives
2. **Provide context**: Add comments explaining unusual patterns
3. **Write tests**: Test coverage analyst is thorough
4. **Follow patterns**: Architecture analyst enforces consistency
5. **Fix security issues**: Security analyst is aggressive for good reason

## Troubleshooting

### "Too many false positives"

- Check Phase 2 agents are running
- Verify evidence-validator is rejecting weak evidence
- Increase confidence thresholds in synthesis

### "Missing real issues"

- Lower confidence thresholds
- Check Phase 1 agents aren't being too conservative
- Review dismissed findings manually

### "Review takes too long"

- Review smaller changesets
- Consider disabling code-quality-analyst for quick reviews
- Run security-analyst only for critical paths

## Architecture Decisions

### Why Adversarial?

Traditional code review tools have high false positive rates (20-40%) because they prioritize recall over precision. Our system inverts this: Phase 1 achieves high recall, Phase 2 achieves high precision.

### Why 5 + 5 agents?

- **Phase 1**: Covers major review categories (security, performance, architecture, tests, quality)
- **Phase 2**: Each challenger has distinct role (validity, accuracy, context, ROI, evidence)
- More agents = diminishing returns, slower reviews

### Why YAML output?

- Structured and parseable
- Easy for synthesis algorithm to process
- Human-readable for debugging
- Consistent format across agents

### Why confidence scoring?

- Enables ROI-based prioritization
- Transparent reasoning (not black box)
- Adjustable thresholds
- Accounts for uncertainty

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

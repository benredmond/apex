# Adversarial Multi-Agent Code Review System

A production-grade code review system that uses adversarial agents to eliminate false positives while maintaining thoroughness.

## Overview

This system implements a **three-phase** review process:

1. **Phase 1 (First-Pass Review)**: 5 specialized agents find issues with **mitigation-aware reporting**
2. **Phase 2 (Adversarial Challenge)**: 3 agents challenge findings to eliminate false positives
3. **Phase 3 (Synthesis)**: Evidence-based confidence scoring and prioritized recommendations

**Key Innovation**:
- Phase 1 agents **always report findings** but adjust confidence via mitigation assessment (never suppress)
- Phase 2 agents challenge validity, check evidence quality, and provide context
- Result: High-confidence actionable findings with low false positive rate (<15% target)

## Architecture

```
/review-pr <target>
       ↓
Phase 1: Mitigation-Aware Review (Parallel)
├─ security-analyst      (reports + assesses mitigations)
├─ performance-analyst   (reports + assesses mitigations)
├─ architecture-analyst  (reports + assesses mitigations)
├─ test-coverage-analyst (reports + assesses mitigations)
└─ code-quality-analyst  (reports + assesses mitigations)
       ↓
Phase 2: Adversarial Challenge (Parallel)
├─ challenger          (unified validity/evidence/pattern checking)
├─ context-defender    (git archaeology, historical justification)
└─ tradeoff-analyst    (ROI calculation)
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
├── phase1/           # First-pass review agents (mitigation-aware)
│   ├── security-analyst.md
│   ├── performance-analyst.md
│   ├── architecture-analyst.md
│   ├── test-coverage-analyst.md
│   └── code-quality-analyst.md
│
├── phase2/           # Adversarial challenge agents
│   ├── challenger.md           # Unified validity/evidence checker
│   ├── context-defender.md     # Git archaeology
│   ├── tradeoff-analyst.md     # ROI analysis
│   └── archived/               # Legacy agents (replaced by challenger)
│       ├── devils-advocate.md
│       ├── false-positive-hunter.md
│       └── evidence-validator.md
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
3. **Wait for Phase 1** (5 agents analyze in parallel with mitigation assessment)
4. **Wait for Phase 2** (3 agents challenge findings)
5. **Review synthesis report** with confidence scores
6. **Act on recommendations**:
   - **Fix**: High-confidence, high-priority issues
   - **Defer**: Valid but low ROI (add to backlog)
   - **Accept**: Context-justified (document)
   - **Dismiss**: False positives

## Phase 1: Mitigation-Aware Review Agents

All Phase 1 agents now use **mitigation-aware reporting**: they always report findings but adjust confidence based on mitigations found.

### Mitigation Assessment Framework

| Classification | Definition | Confidence Adjustment |
|---------------|------------|----------------------|
| FULLY_EFFECTIVE | Completely prevents the issue | × 0.3 |
| PARTIALLY_EFFECTIVE | Reduces but doesn't eliminate risk | × 0.5 |
| INSUFFICIENT | Trivially bypassable | × 0.8 |
| WRONG_LAYER | Addresses different concern | × 1.0 (no adjustment) |

**Key Principle**: Always report, never suppress. Adjust confidence via mitigation assessment.

### security-analyst

**Focus**: Security vulnerabilities (SQL injection, XSS, auth bypasses)

**Approach**: Reports all potential security issues with mitigation assessment

**Mitigations Checked**: ORM parameterization, framework escaping, rate limiting, validation

**Output**: Findings with exploit scenarios, mitigation assessment, confidence calculation

**Defense-in-depth**: Auth/payment/PII findings always reported with minimum 0.4 confidence

### performance-analyst

**Focus**: Performance bottlenecks (N+1 queries, O(n²) algorithms, memory leaks)

**Approach**: Assumes production scale with mitigation assessment

**Mitigations Checked**: Caching, eager loading, pagination, indexing

**Output**: Findings with impact estimates, mitigation assessment, complexity analysis

### architecture-analyst

**Focus**: Architectural violations (layer separation, circular dependencies, pattern consistency)

**Approach**: Enforces patterns with mitigation assessment for documented exceptions

**Mitigations Checked**: ADRs, documented exceptions, framework constraints, refactoring plans

**Output**: Findings with counter-examples, mitigation assessment, refactoring suggestions

### test-coverage-analyst

**Focus**: Test coverage gaps (untested paths, missing edge cases, quality issues)

**Approach**: Prioritizes critical paths with mitigation assessment

**Mitigations Checked**: Integration tests, E2E tests, monitoring, property-based tests

**Output**: Findings with specific untested paths, mitigation assessment, suggested test code

### code-quality-analyst

**Focus**: Code quality (complexity, readability, naming, duplication)

**Approach**: Pragmatic with mitigation assessment for documented complexity

**Mitigations Checked**: JSDoc, README docs, refactoring tickets, domain complexity

**Output**: Findings with complexity metrics, mitigation assessment, refactoring examples

## Phase 2: Adversarial Challenge Agents

Phase 2 now uses **3 specialized agents** (reduced from 5) for more efficient challenging.

### challenger (NEW - replaces 3 agents)

**Focus**: Unified validity, accuracy, and evidence checking

**Replaces**: devils-advocate + false-positive-hunter + evidence-validator

**Evaluates 4 dimensions for each finding**:
1. **Code Accuracy**: Did Phase 1 read the code correctly?
2. **Pattern Applicability**: Does the framework prevent this issue?
3. **Mitigation Verification**: Are Phase 1's mitigation assessments accurate?
4. **Evidence Quality**: Strong (0.85-1.0) / Medium (0.6-0.85) / Weak (0.0-0.6)

**Challenge Results**:
- **UPHELD**: Finding valid as reported
- **DOWNGRADED**: Finding valid but overstated
- **DISMISSED**: False positive

**Key Principle**: Challenge EVERY finding. No conditional skip. No self-classification bypass.

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

## Phase 3: Synthesis Algorithm

The orchestrator synthesizes Phase 1 and Phase 2 results using evidence-based scoring:

### Confidence Calculation

```typescript
validityConfidence = phase1.confidence
  * (1 - challengeRate * 0.4)          // Reduce for challenges
  * (0.5 + evidenceScore * 0.5)        // Adjust for evidence quality
  * (contextJustified ? 0.3 : 1.0)     // Reduce if justified

// challengeRate = (# of Phase 2 agents that challenged) / 3  // Changed from / 5
// evidenceScore = 0.0-1.0 from challenger agent
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
- False Positive Rate: < 15% (improved from ~27%)
- Signal Ratio: > 70% actionable findings
- Confidence Accuracy: 80%+ correlation with reality
- Review Time: < 10 minutes for standard PR

**Quality Indicators**:
- High-confidence findings should be real issues
- Low-confidence findings should be questionable
- Dismissed findings should be false positives
- Accepted findings should be justified
- Mitigation-adjusted findings should have accurate adequacy assessments

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

### Why 5 + 3 agents?

- **Phase 1 (5 agents)**: Covers major review categories (security, performance, architecture, tests, quality)
- **Phase 2 (3 agents)**: Consolidated for efficiency - challenger combines validity/accuracy/evidence checking, context-defender provides git archaeology, tradeoff-analyst calculates ROI
- Previous 5-agent Phase 2 had overlapping responsibilities; 3 agents achieves same coverage with less overhead
- Mitigation-aware Phase 1 reduces Phase 2 workload by providing better-calibrated confidence upfront

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

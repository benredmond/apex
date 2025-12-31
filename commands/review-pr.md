---
description: Comprehensive adversarial code review using multi-agent system
argument-hint: [pr-number|git-ref|files]
---

# Adversarial Code Review: $ARGUMENTS

You are orchestrating a comprehensive code review using a two-phase adversarial system where specialized agents find issues, then adversarial agents challenge those findings to eliminate false positives.

## Phase 1: Gather Code Changes

First, determine what code to review:

**If argument is a PR number (e.g., "123")**:
```bash
gh pr view $1 --json files,additions,deletions,title,body
gh pr diff $1
```

**If argument is a git ref (e.g., "feature-branch" or "HEAD~5..HEAD")**:
```bash
git diff main..$1 --stat
git diff main..$1
git log main..$1 --oneline
```

**If argument is file paths**:
```bash
git diff HEAD -- $ARGUMENTS
```

**Also gather context**:
```bash
# Get recent commits touching these files
git log --oneline -20 -- <modified_files>

# Get file list
git diff --name-only <ref>
```

## Phase 2: Launch First-Pass Review Agents

**CRITICAL**: Launch ALL 5 Phase 1 agents in a SINGLE message for true parallelism.

Provide each agent with:
- Full code diff
- List of modified files
- Commit messages for context
- Recent git history (last 20 commits touching these files)

```markdown
<Task subagent_type="review-security-analyst" description="Security vulnerability review">
**Code Changes:**
[Insert full diff here]

**Files Modified:**
[List files with line counts]

**Context:**
- Review target: $ARGUMENTS
- Recent commits:
[Recent commit messages]

Review ONLY code in the diff for security vulnerabilities. Pre-filter linter-catchable issues.
Return YAML findings with id, severity, confidence (0-100), location, issue, evidence.
</Task>

<Task subagent_type="review-architecture-analyst" description="Architecture review">
**Code Changes:**
[Insert full diff here]

**Files Modified:**
[List files with line counts]

**Context:**
- Review target: $ARGUMENTS
- Recent commits:
[Recent commit messages]

Review ONLY code in the diff for architecture violations. Pre-filter linter-catchable issues.
Return YAML findings with id, severity, confidence (0-100), location, issue, evidence.
</Task>

<Task subagent_type="review-test-coverage-analyst" description="Test coverage review">
**Code Changes:**
[Insert full diff here]

**Files Modified:**
[List files with line counts]

**Context:**
- Review target: $ARGUMENTS
- Recent commits:
[Recent commit messages]

Review ONLY new/changed code for test coverage gaps. Pre-filter trivial gaps.
Return YAML findings with id, severity, confidence (0-100), location, issue, evidence.
</Task>

<Task subagent_type="review-code-quality-analyst" description="Code quality review">
**Code Changes:**
[Insert full diff here]

**Files Modified:**
[List files with line counts]

**Context:**
- Review target: $ARGUMENTS
- Recent commits:
[Recent commit messages]

Review ONLY code in the diff for quality issues. Pre-filter linter-catchable/cosmetic issues.
Return YAML findings with id, severity, confidence (0-100), location, issue, evidence.
</Task>

<Task subagent_type="review-git-historian" description="Git history review">
**Code Changes:**
[Insert full diff here]

**Files Modified:**
[List files with line counts]

**Context:**
- Review target: $ARGUMENTS
- Recent commits:
[Recent commit messages]
- Git blame for modified lines

Review for pattern violations, regressions, and inconsistencies using git history.
Return YAML findings with id, severity, confidence (0-100), location, issue, evidence.
</Task>
```

**WAIT** for ALL 5 agents to complete before proceeding.

## Phase 3: Aggregate Phase 1 Findings

Parse the YAML output from each agent and create a structured summary:

```yaml
phase1_summary:
  total_findings: <count>
  by_severity:
    critical: <count>
    high: <count>
    medium: <count>
    low: <count>
  by_agent:
    security: <count> findings
    performance: <count> findings
    architecture: <count> findings
    testing: <count> findings
    quality: <count> findings

  all_findings:
    - [Combine all findings from all 5 agents with their IDs]
```

Display this summary to the user before Phase 2.

## Phase 4: Launch Unified Challenger

Launch the unified challenger agent to validate all Phase 1 findings:

Provide the challenger with:
- All Phase 1 findings (complete YAML)
- Original code diff
- Git history
- File context

```markdown
<Task subagent_type="apex:review:phase2:review-challenger" description="Challenge all findings">
**Phase 1 Findings:**
[Insert ALL findings from all 5 Phase 1 agents in YAML format]

**Original Code:**
[Full diff]

**Git History:**
[Recent commits]

**File Context:**
[Related files that might provide context]

For EACH finding, evaluate across 4 dimensions:

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
   - Pull forward (→ Fix Now): Security issues, code smells, future problems
   - Push back (→ Should Fix): Deprecated code, one-time use, low traffic paths

Return YAML with adjusted confidence scores (0-100) and override decisions.
</Task>
```

**WAIT** for challenger to complete.

## Phase 5: Synthesis & Reconciliation

Apply the challenger's adjusted confidence scores using tiered thresholds:

```
For each finding:
  1. Start with Phase 1 confidence (0-100)

  2. Apply challenger adjustments:
     # Evidence quality multiplier
     confidence *= (0.5 + evidenceScore * 0.5)

     # Historical context penalties
     if previousAttemptFailed: confidence *= 0.3
     else if documentedDecision: confidence *= 0.4
     else if intentionalDebt: confidence *= 0.5

     # ROI adjustments
     if lowROI: confidence *= 0.7

  3. Apply override decisions:
     if pullForward: confidence = max(confidence, 80)  # → Fix Now
     if pushBack: confidence = min(confidence, 79)     # → Should Fix at most

  4. Apply tiered thresholds:
     if confidence >= 80: "🔴 Fix Now"
     else if confidence >= 60: "🟡 Should Fix"
     else: filtered (not shown in output)
```

### Output Format

```markdown
## Review Summary
Found X issues → Y Fix Now, Z Should Fix, W filtered

### 🔴 Fix Now (Y)
| ID | Score | Issue | Location |
|----|-------|-------|----------|
| SEC-001 | 92 | SQL injection in user input | src/api.ts:45 |

For each Fix Now item:
- **Issue**: Detailed description
- **Evidence**: Key evidence points
- **Fix**: Concrete code suggestion

### 🟡 Should Fix (Z)
| ID | Score | Issue | Location |
|----|-------|-------|----------|
| ARCH-002 | 71 | Circular dependency | src/utils.ts:12 |

### Filtered (W)
[Not shown - logged for transparency]
```

## Phase 6: Final Summary

After synthesis, output the final report using the format from Phase 5.

Include metrics:
- **Filter rate**: (Filtered / Phase 1 total) %
- **Fix Now rate**: (Fix Now / Passed threshold) %
- **Override usage**: How many findings were pulled forward or pushed back

## Best Practices

1. **Parallel Execution**: All 5 Phase 1 agents in a single message
2. **Complete Context**: Provide full diffs and git history to each agent
3. **Pre-Filtering**: Agents skip linter-catchable and pre-existing issues
4. **Evidence-Based**: Every confidence score backed by specific evidence
5. **Reviewer Discretion**: Challenger can pull forward or push back findings
6. **Actionable Output**: Fix Now items include concrete code suggestions

## Notes

- **Pre-filtering** keeps output focused (diff-only, not linter-catchable)
- Phase 1 agents use **0-100 confidence scoring** with tiered thresholds
- Phase 2 uses a **unified challenger** that validates, checks history, analyzes ROI, and applies overrides
- **Tiered thresholds**: ≥80 Fix Now, 60-79 Should Fix, <60 filtered
- **Overrides**: Challenger can pull forward (security, code smells) or push back (deprecated, low-traffic)
- All findings include reasoning chains for transparency

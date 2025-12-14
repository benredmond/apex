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

Perform comprehensive security review. Return findings in YAML format with confidence scores and evidence.
</Task>

<Task subagent_type="review-performance-analyst" description="Performance issue review">
**Code Changes:**
[Insert full diff here]

**Files Modified:**
[List files with line counts]

**Context:**
- Review target: $ARGUMENTS
- Recent commits:
[Recent commit messages]

Perform comprehensive performance review. Return findings in YAML format with confidence scores and evidence.
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

Perform comprehensive architecture review. Return findings in YAML format with confidence scores and evidence.
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

Perform comprehensive test coverage review. Return findings in YAML format with confidence scores and evidence.
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

Perform comprehensive code quality review. Return findings in YAML format with confidence scores and evidence.
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

## Phase 4: Launch Adversarial Challenge Agents

**CRITICAL**: Launch ALL 3 Phase 2 agents in a SINGLE message for true parallelism.

Phase 2 uses 3 specialized agents:
1. **challenger** - Unified validity/evidence challenger (challenges ALL findings)
2. **context-defender** - Git archaeology, historical justification
3. **tradeoff-analyst** - ROI calculation

Provide each agent with:
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

Challenge EVERY finding for:
- Code accuracy (did Phase 1 read correctly?)
- Pattern applicability (does framework prevent this?)
- Mitigation verification (are Phase 1 assessments accurate?)
- Evidence quality (Strong/Medium/Weak rating)

Return challenges in YAML format with evidence and confidence scores.
</Task>

<Task subagent_type="apex:review:phase2:review-context-defender" description="Find historical justifications">
**Phase 1 Findings:**
[Insert ALL findings]

**Original Code:**
[Full diff]

**Repository:**
[Path and git info]

Use git history to find justifications for seemingly problematic code. Return in YAML format.
</Task>

<Task subagent_type="apex:review:phase2:review-tradeoff-analyst" description="Analyze fix ROI">
**Phase 1 Findings:**
[Insert ALL findings]

**Original Code:**
[Full diff]

Analyze effort vs benefit for each finding. Return ROI analysis in YAML format.
</Task>
```

**WAIT** for ALL 3 agents to complete.

## Phase 5: Synthesis & Reconciliation

For each Phase 1 finding, calculate final scores using this algorithm:

```
For each finding:
  1. Get challenge result from challenger agent:
     - UPHELD: finding valid as reported
     - DOWNGRADED: finding valid but overstated
     - DISMISSED: false positive

     # Count how many of 3 agents challenged it
     challenge_rate = challenges_count / 3  # Changed from / 5

  2. Get evidence score from challenger (0.0-1.0)
     # Challenger rates evidence as Strong (0.85-1.0), Medium (0.6-0.85), Weak (0.0-0.6)

  3. Check if context-defender found justification (boolean)

  4. Get ROI score from tradeoff-analyst (0.0-1.0)

  5. Calculate validity confidence:
     confidence = finding.initial_confidence
     confidence *= (1 - challenge_rate * 0.4)  # Penalty for challenges
     confidence *= (0.5 + evidence_score * 0.5)  # Evidence quality factor
     if context_justified: confidence *= 0.3  # Historical justification reduces priority

  6. Calculate priority:
     severity_points = {Critical: 100, High: 75, Medium: 50, Low: 25}
     priority = severity_points * confidence * roi_score

  7. Make recommendation:
     if confidence < 0.3: "Dismiss"
     else if context_justified AND confidence < 0.6: "Accept"
     else if roi_score < 0.3: "Defer"
     else if confidence > 0.7 AND priority > 60: "Fix"
     else if priority > 40: "Defer"
     else: "Accept"
```

Group findings by recommendation: Fix, Defer, Accept, Dismiss

Sort each group by priority score (highest first)

## Phase 6: Generate Final Report

Create a comprehensive markdown report with these sections:

### Summary
- Phase 1 findings: X
- Phase 2 challenges: Y
- Final recommendations: Fix (A), Defer (B), Accept (C), Dismiss (D)
- False positive rate: (Dismissed / Total) %
- Average confidence: X.XX

### Immediate Action Items (Fix)
For each "Fix" recommendation (sorted by priority):
- **ID**: Finding ID (e.g., SEC-001)
- **Title**: Brief description
- **Severity**: Critical/High/Medium/Low
- **Confidence**: X.XX
- **Priority**: XX
- **Location**: file:line
- **Issue**: Detailed description
- **Evidence**: Key evidence points
- **Phase 2 Outcome**: Summary of challenges (e.g., "Challenged by 1/5 agents, all dismissed")
- **Fix**: Concrete code suggestion
- **Pattern**: Reference any applicable patterns

### Technical Debt (Defer)
For each "Defer" recommendation:
- Why deferred (usually low ROI or low priority)
- Suggested backlog placement

### Accepted Risks (Accept)
For each "Accept" recommendation:
- Justification (from context-defender)
- Recommendation to document

### Dismissed (False Positives)
For each "Dismiss" recommendation:
- Brief reason why dismissed
- Which Phase 2 agent(s) successfully challenged it

### Metrics
- Review effectiveness: (High confidence findings / Total findings)
- False positive prevention: (Dismissed / Phase 1 total)
- Context awareness: (Accepted with justification / Total)

## Output Format

Use clear markdown formatting with:
- Headers for each section
- Tables for summaries
- Code blocks for fixes
- Emoji indicators (✅ Fix, ⏸️ Defer, ✓ Accept, ✖️ Dismiss)

## Best Practices

1. **Parallel Execution**: All Phase 1 agents in one message, all Phase 2 agents in one message
2. **Complete Context**: Provide full diffs and context to each agent
3. **Evidence-Based**: Every score must be calculated from actual evidence
4. **Transparent**: Show reasoning for each recommendation
5. **Actionable**: Provide concrete fixes, not just descriptions

## Notes

- This system is designed to eliminate false positives while maintaining thoroughness
- Phase 1 agents are **mitigation-aware** (report everything, adjust confidence via mitigation assessment)
- Phase 2 uses **3 specialized agents** (challenger, context-defender, tradeoff-analyst)
- The **challenger** agent combines validity checking, evidence rating, and pattern verification
- The synthesis algorithm balances severity, confidence, and ROI
- All findings include complete reasoning chains for transparency

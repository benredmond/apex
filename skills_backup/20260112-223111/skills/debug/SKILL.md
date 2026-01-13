---
name: apex:debug
description: Systematic debugging with APEX pattern learning. Applies hypothesis-driven investigation, evidence collection, and reflection to update pattern trust scores.
argument-hint: [task-identifier or error-description]
---

<skill name="apex:debug" phase="any">

<overview>
Systematic debugging workflow that leverages APEX pattern intelligence and reflection.

Integrates with failure-predictor and git-historian agents to provide historical context.
Produces evidence that feeds into `apex_reflect` for continuous learning.

Can operate phase-agnostic: debug sessions can happen at any point in the workflow.
</overview>

<phase-gate requires="none" sets="none">
  <reads-file>./.apex/tasks/[ID].md (if task-linked)</reads-file>
  <appends-section>debug</appends-section>
  <note>Debug is phase-agnostic - can be invoked at any workflow stage</note>
</phase-gate>

<principles>
- **Evidence-Based**: Every hypothesis needs concrete evidence (error messages, stack traces, git bisect results)
- **Pattern-Informed**: Query APEX patterns for known failure modes before investigating
- **Learn From History**: Check similar past bugs and their resolutions
- **Reflective**: Submit debugging outcomes to improve future debugging via `apex_reflect`
- **Systematic**: Follow structured methodology - no shotgun debugging
- **Hypothesis Discipline**: Maximum 3 concurrent hypotheses to prevent scattered investigation
</principles>

<initial-response>
<if-no-arguments>
I'll help debug systematically. Please provide either:
- A task identifier from `./.apex/tasks/`
- An error description to investigate

Usage: `/apex:debug [task-id]` or `/apex:debug "error message or description"`
</if-no-arguments>
<if-arguments>Initialize debug session with provided context.</if-arguments>
</initial-response>

<workflow>

<step id="1" title="Initialize debug session">
<instructions>
1. **Parse argument**: Determine if task ID or error description
2. **Query patterns**: Call `apex_patterns_lookup` for debugging/failure patterns
3. **Link or create task**:
   - If task ID provided: Read `./.apex/tasks/[ID].md`
   - If error description: Create new debug task with `apex_task_create`
4. **Spawn failure-predictor**: Get historical failure context
</instructions>

<mcp-calls>
```javascript
// Query for relevant debugging patterns
apex_patterns_lookup({
  task: "[error description or task title]",
  task_intent: { type: "bug_fix", confidence: 0.8 }
})

// If creating new task
apex_task_create({
  intent: "Debug: [error summary]",
  type: "bug",
  tags: ["debugging", "investigation"]
})
```
</mcp-calls>

<spawn-agents>
<agent type="apex:failure-predictor">
**Error Context**: [Error message or symptom]
**File Context**: [Suspected files if known]

Predict likely failure modes based on historical patterns.
Return: Predicted failures with prevention strategies.
</agent>
</spawn-agents>

<mcp-checkpoint>
```javascript
apex_task_checkpoint(taskId, "DEBUG: Initialized debug session", 0.3)
```
</mcp-checkpoint>
</step>

<step id="2" title="Reproduce and gather evidence">
<critical>
Do NOT proceed without reproducing the bug. Reproducibility is mandatory.
</critical>

<instructions>
1. **Create minimal reproduction**:
   - Write smallest test case that triggers the bug
   - Document exact reproduction steps
   - If cannot reproduce, investigate intermittency patterns

2. **Capture evidence**:
   - Error messages (exact text)
   - Stack traces (full trace)
   - Logs (relevant entries)
   - Environment state (versions, config)
   - Recent changes (git log)

3. **Record evidence** via MCP:
</instructions>

<mcp-calls>
```javascript
// Record reproduction evidence
apex_task_append_evidence(taskId, "error",
  "Error message: [exact error]",
  { file: "[file]", line_start: N, line_end: M }
)

apex_task_append_evidence(taskId, "file",
  "Reproduction test case at [location]",
  { file: "[test file]" }
)
```
</mcp-calls>

<reproduction-checklist>
- [ ] Bug reproduces consistently OR intermittency pattern documented
- [ ] Exact error message captured
- [ ] Stack trace saved
- [ ] Minimal test case created (if possible)
- [ ] Environment details recorded
</reproduction-checklist>
</step>

<step id="3" title="Root cause investigation">
<instructions>
1. **Spawn git-historian**: Find related changes
2. **Query similar failures**: Search APEX patterns for matches
3. **Trace data flow**: Follow bad value to its source
4. **Form hypotheses**: Based on evidence (MAX 3 concurrent)
</instructions>

<spawn-agents>
<agent type="apex:git-historian">
**Scope**: [Suspected files/directories]
**Window**: 30 days (recent changes)
**Focus**: Commits that touched error location

Find: Recent changes, regressions, related fixes.
Return: Git intelligence with blame and commit analysis.
</agent>
</spawn-agents>

<mcp-calls>
```javascript
// Search for similar failures in pattern database
apex_patterns_discover({
  query: "[error symptoms]",
  filters: { types: ["ANTI", "FAILURE"] },
  max_results: 10
})
```
</mcp-calls>

<hypothesis-formation>
Form hypotheses based on evidence gathered:

```markdown
### Hypothesis 1: [Title]
- **Based on**: [Evidence that supports this]
- **Predicts**: [What we'd see if true]
- **Test**: [How to verify]

### Hypothesis 2: [Title]
...

### Hypothesis 3: [Title]
...
```

LIMIT: Maximum 3 concurrent hypotheses.
If all 3 fail, revisit evidence before forming new ones.
</hypothesis-formation>

<root-cause-techniques>
**5 Whys Method**:
```
Problem: [Symptom]
Why? → [First-level cause]
Why? → [Second-level cause]
Why? → [Third-level cause]
Why? → [Fourth-level cause]
Why? → ROOT CAUSE: [Fundamental issue]
```

**Binary Search (git bisect)**:
```bash
git bisect start
git bisect bad HEAD
git bisect good [known-good-commit]
# Test each midpoint until culprit found
```
</root-cause-techniques>

<mcp-checkpoint>
```javascript
apex_task_checkpoint(taskId, "DEBUG: Investigation - [N] hypotheses formed", 0.5)
```
</mcp-checkpoint>
</step>

<step id="4" title="Hypothesis testing">
<critical>
Test ONE hypothesis at a time. Make SMALLEST possible change to test.
</critical>

<instructions>
1. **Select hypothesis**: Choose most likely based on evidence
2. **Design minimal test**: Smallest change to verify
3. **Execute test**: Run and observe
4. **Record result**: Document outcome for each hypothesis
5. **Iterate or escalate**:
   - If confirmed → proceed to fix
   - If refuted → test next hypothesis
   - If 3+ hypotheses fail → question assumptions, escalate
</instructions>

<testing-discipline>
For each hypothesis:
```markdown
### Testing Hypothesis [N]: [Title]
- **Test method**: [What we're doing]
- **Expected if true**: [Prediction]
- **Actual result**: [What happened]
- **Conclusion**: CONFIRMED | REFUTED | INCONCLUSIVE
```
</testing-discipline>

<escalation-trigger>
If 3 hypotheses fail:
1. Re-examine evidence - something was missed
2. Question architectural assumptions
3. Ask user for additional context
4. Consider spawning systems-researcher for deeper analysis
</escalation-trigger>

<mcp-calls>
```javascript
// Record hypothesis testing results
apex_task_append_evidence(taskId, "decision",
  "Hypothesis [N] [confirmed|refuted]: [summary]",
  { pattern_id: "[if pattern-related]" }
)
```
</mcp-calls>
</step>

<step id="5" title="Fix implementation">
<critical>
Create failing test BEFORE implementing fix. TDD for bug fixes.
</critical>

<instructions>
1. **Write failing test**: Test that reproduces the exact bug
2. **Verify test fails**: Confirm it catches the bug
3. **Implement minimal fix**: Single change addressing root cause
4. **Verify test passes**: Bug is fixed
5. **Run full test suite**: No regressions introduced
</instructions>

<fix-checklist>
- [ ] Failing test written that reproduces bug
- [ ] Test verified to fail before fix
- [ ] Fix implemented (single, minimal change)
- [ ] Bug-specific test now passes
- [ ] Full test suite passes
- [ ] No new lint errors
</fix-checklist>

<validation-commands>
```bash
# Run targeted test
npm test -- [test-file]

# Run full suite
npm test

# Lint check
npm run lint
```
</validation-commands>

<mcp-checkpoint>
```javascript
apex_task_checkpoint(taskId, "DEBUG: Fix implemented and validated", 0.8)
```
</mcp-checkpoint>
</step>

<step id="6" title="Reflection and learning">
<critical>
Without reflection, debugging learnings are lost. This step is MANDATORY.
</critical>

<instructions>
1. **Document root cause**: Clear explanation of what caused the bug
2. **Document fix**: What changed and why
3. **Identify patterns**:
   - Did existing patterns help? (update trust scores)
   - Discovered new failure mode? (propose new pattern)
4. **Submit reflection**: Call `apex_reflect` with evidence
5. **Update task**: Complete debug section
</instructions>

<reflection-template>
```markdown
### Debug Summary
- **Root Cause**: [What actually caused the bug]
- **Fix**: [What we changed]
- **Prevention**: [How to prevent similar bugs]

### Patterns
- **Used**: [Patterns that helped, with outcomes]
- **Discovered**: [New failure modes or fixes]

### Learnings
- [Key insight 1]
- [Key insight 2]
```
</reflection-template>

<mcp-calls>
```javascript
// Submit debugging reflection
apex_reflect({
  task: { id: taskId, title: "[task title]" },
  outcome: "success", // or "partial" or "failure"
  claims: {
    patterns_used: [
      {
        pattern_id: "[PAT:ID]",
        evidence: [
          {
            kind: "git_lines",
            file: "[file]",
            sha: "HEAD",
            start: 1,
            end: 10
          }
        ],
        notes: "[how it helped]"
      }
    ],
    trust_updates: [
      {
        pattern_id: "[PAT:ID]",
        outcome: "worked-perfectly" // or "worked-with-tweaks", "failed-completely"
      }
    ],
    learnings: [
      { assertion: "[What we learned]", evidence: [...] }
    ],
    // Only if genuinely new pattern discovered:
    new_patterns: [
      {
        title: "[Pattern title]",
        summary: "[What it does]",
        snippets: [
          {
            snippet_id: "[snippet id]",
            source_ref: {
              kind: "git_lines",
              file: "[file]",
              sha: "HEAD",
              start: 1,
              end: 10
            }
          }
        ],
        evidence: [...]
      }
    ]
  }
})

// Complete task if appropriate
apex_task_complete({
  id: taskId,
  outcome: "success",
  key_learning: "[Most important takeaway]",
  patterns_used: ["[PAT:IDs]"]
})
```
</mcp-calls>
</step>

</workflow>

<output-format>
Append to task file `./.apex/tasks/[ID].md`:

```xml
<debug>
<metadata>
  <timestamp>[ISO]</timestamp>
  <duration>[Time spent]</duration>
  <hypotheses-tested>[N]</hypotheses-tested>
</metadata>

<reproduction>
  <reproducible>true|false</reproducible>
  <steps>[Reproduction steps]</steps>
  <minimal-case>[Test case location if created]</minimal-case>
</reproduction>

<investigation>
  <evidence>
    <error-message>[Exact error]</error-message>
    <stack-trace>[Relevant portions]</stack-trace>
    <related-commits>[Git history findings]</related-commits>
    <pattern-matches>[APEX patterns that matched]</pattern-matches>
  </evidence>

  <hypotheses>
    <hypothesis id="1" status="confirmed|refuted|untested">
      <title>[Hypothesis]</title>
      <evidence>[Supporting evidence]</evidence>
      <test-result>[What happened when tested]</test-result>
    </hypothesis>
  </hypotheses>
</investigation>

<root-cause>
  <description>[What actually caused the bug]</description>
  <five-whys>[If used, the chain of whys]</five-whys>
</root-cause>

<fix>
  <description>[What was changed]</description>
  <files-modified>[List of files]</files-modified>
  <test-added>[New test location]</test-added>
</fix>

<reflection>
  <patterns-used>
    <pattern id="[PAT:ID]" outcome="worked|tweaked|failed">[How it helped]</pattern>
  </patterns-used>
  <learnings>
    <learning>[Key insight]</learning>
  </learnings>
  <prevention>[How to prevent similar bugs]</prevention>
</reflection>
</debug>
```
</output-format>

<antipatterns>
<avoid name="Shotgun Debugging">
Making random changes hoping something works.
**Instead**: Form hypotheses based on evidence, test systematically.
</avoid>

<avoid name="Symptom Fixing">
Quick patches that don't address root cause.
**Instead**: Use 5 Whys to find fundamental issue.
</avoid>

<avoid name="Evidence-Free Hypotheses">
Guessing without data.
**Instead**: Every hypothesis must cite specific evidence.
</avoid>

<avoid name="Hypothesis Sprawl">
Forming 10+ hypotheses without testing any.
**Instead**: Limit to 3 concurrent, test each fully.
</avoid>

<avoid name="Skipping Reflection">
Fixing bug but not recording learnings.
**Instead**: Always call `apex_reflect` at the end.
</avoid>
</antipatterns>

<success-criteria>
- Bug reproduced (or intermittency documented)
- Evidence gathered and recorded via `apex_task_append_evidence`
- Root cause identified through systematic investigation
- Fix implemented with failing test first
- All tests pass including new regression test
- `apex_reflect` called with debugging outcomes
- Task file updated with `<debug>` section
- Checkpoints recorded at each major step
</success-criteria>

<next-steps>
After debugging:
- If part of existing task: Continue with current workflow phase
- If standalone debug: `/apex:ship [identifier]` to finalize and reflect
</next-steps>

</skill>

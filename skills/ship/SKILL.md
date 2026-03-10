---
name: ship
description: Review and finalize (REVIEWER + DOCUMENTER phases) - runs adversarial code review, commits changes, completes task, and records reflection to capture pattern outcomes.
argument-hint: [task-identifier]
---

<skill name="apex:ship" phase="ship">

<overview>
Final phase: Review implementation with adversarial agents, commit changes, complete task, and record reflection.

Combines REVIEWER (adversarial code review) and DOCUMENTER (commit, complete, reflect).
</overview>

<phase-model>
phase_model:
  frontmatter: [research, plan, implement, rework, complete]
  rework: enabled
  db_role: [RESEARCH, ARCHITECT, BUILDER, BUILDER_VALIDATOR, REVIEWER, DOCUMENTER]
  legacy_db_role: [VALIDATOR]
source_of_truth:
  gating: frontmatter.phase
  telemetry: db_role
</phase-model>

<phase-gate requires="implement" sets="complete">
  <reads-file>./apex/tasks/[ID].md</reads-file>
  <requires-section>implementation</requires-section>
  <appends-section>ship</appends-section>
</phase-gate>

<mandatory-actions>
This phase requires THREE mandatory actions in order:
1. **Adversarial Review** - Launch review agents
2. **Git Commit** - Commit all changes
3. **Final Reflection** - Record pattern outcomes and key learnings

YOU CANNOT SKIP ANY OF THESE for APPROVE or CONDITIONAL outcomes.
If REJECT, stop after review, set frontmatter to `phase: rework`, and return to `/apex:implement`.
</mandatory-actions>

<initial-response>
<if-no-arguments>
I'll review and finalize the implementation. Please provide the task identifier.

You can find active tasks in `./apex/tasks/` or run with:
`/apex:ship [identifier]`
</if-no-arguments>
<if-arguments>Load task file and begin review.</if-arguments>
</initial-response>

<workflow>

<step id="1" title="Load task and verify phase">
<instructions>
1. Read `./apex/tasks/[identifier].md`
2. Verify frontmatter `phase: implement`
3. Parse `<task-contract>` first and note its latest version and any amendments
4. Parse all sections for full context
5. If phase != implement, refuse with: "Task is in [phase] phase. Expected: implement"

Contract rules:
- Final report MUST map changes to AC-* and confirm no out-of-scope work
- If scope/ACs changed during implement, ensure amendments are recorded with rationale and version bump
</instructions>
</step>

<step id="2" title="Gather review context">
<extract>
- `<task-contract>` - Authoritative scope/ACs and amendment history
- `<implementation><files-modified>` - What changed
- `<implementation><files-created>` - What's new
- `<implementation><patterns-used>` - Patterns to validate
- `<implementation><validation-results>` - Test status
- `<implementation><reviewer-handoff>` - Key points for review
- `<plan><architecture-decision>` - Original intentions
- `<plan><warnings>` - Risks to verify mitigated
</extract>

<get-diffs>
```bash
git diff HEAD~N  # or appropriate range for this task's changes
git log --oneline -10
```
</get-diffs>
</step>

<step id="2.5" title="Classify review mode">
<purpose>
Select the lightest review mode that is still safe for the change. If signals conflict, choose the stricter mode.
</purpose>

<review-modes>
- `light`:
  - Small, localized, low-risk change with a limited blast radius
  - Often docs, prompts, tests, or tightly local refactors and bugfixes
  - Green validation or validation that is not materially needed
  - Does not reshape system boundaries
- `standard`:
  - Default for normal feature or bugfix work
  - Use whenever there is meaningful runtime behavior change
  - Also use when signals are mixed and confidence in `light` is not high
- `deep`:
  - Broad, risky, or cross-cutting change
  - Touches auth, permissions, parsing, persistence, schemas, migrations, public API/CLI, concurrency, build/release, or shared abstractions
  - Validation is partial, warnings remain open, or regression potential is high
</review-modes>

<classification-signals>
Assess and record:
- changed file count and subsystem spread
- whether behavior, contracts, or data shape changed
- whether risky surfaces were touched
- whether plan warnings remain relevant
- whether validation is strong, weak, or absent
- whether git history suggests high churn or regression risk
</classification-signals>

<mode-selection-rules>
1. Start from the smallest plausible mode.
2. Escalate to `standard` or `deep` when risky surfaces or mixed signals appear.
3. `light` is only valid when the change is obviously low-risk and easy to verify.
4. Record both the chosen mode and the rationale in the final `<ship>` section.
</mode-selection-rules>
</step>

<step id="2.6" title="Assemble mode-specific context pack">
<instructions>
Before launching reviewers, build the context pack that matches the selected mode:

- `light`:
  - full diff
  - modified/created file list
  - validation summary
  - reviewer handoff summary
  - recent commits, churn/regression signals, and ownership summary for modified files

- `standard`:
  - everything in `light`
  - plan warnings and architecture decision summary
  - churn/regression signals for modified files

- `deep`:
  - everything in `standard`
  - adjacent snippets for changed functions/classes
  - closely related tests, call sites, or neighboring abstractions needed to reason about downstream impact of the changed lines

Use the selected context pack consistently in Phase 1 and Phase 2 prompts.
</instructions>
</step>

<step id="3" title="Phase 1: Launch mode-appropriate review agents">
<critical>
Launch ALL 5 Phase 1 agents in a SINGLE message for true parallelism.
Only use agents that actually exist in `agents/review/phase1/`.
</critical>

<mode-behavior>
All modes use the same 5 Phase 1 agents:
- `review-security-analyst`
- `review-architecture-analyst`
- `review-test-coverage-analyst`
- `review-code-quality-analyst`
- `review-git-historian`

Modes change context depth, not reviewer count or scoring rules:
- `light` → concise context pack for low-risk, localized changes
- `standard` → normal context pack
- `deep` → richer context pack (plan warnings, validation gaps, git churn, adjacent snippets) and more explicit prompts for scrutinizing downstream impact of changed lines
</mode-behavior>

<agents parallel="true">

<agent type="apex:review:phase1:review-security-analyst">
Include in every mode.

**Task ID**: [taskId]
**Review Mode**: [selected mode]
**Code Changes**: [Full diff]
**Mode Context Pack**: [Context assembled in Step 2.6 for the selected mode]
**Journey Context**: Architecture warnings, implementation decisions, test results

Review for security vulnerabilities. In `deep`, read adjacent context and likely exploit paths to better assess changed lines, but only report findings rooted in the diff. Return the standard security-analyst YAML schema.
</agent>

<agent type="apex:review:phase1:review-architecture-analyst">
Include in every mode.

**Task ID**: [taskId]
**Review Mode**: [selected mode]
**Code Changes**: [Full diff]
**Mode Context Pack**: [Context assembled in Step 2.6 for the selected mode]
**Journey Context**: Original architecture from plan, pattern selections

Review for architecture violations and pattern consistency. In `deep`, use neighboring abstractions and dependency context to assess the changed lines more rigorously, but keep findings anchored to the diff. Return the standard architecture-analyst YAML schema.
</agent>

<agent type="apex:review:phase1:review-test-coverage-analyst">
Include in every mode.

**Task ID**: [taskId]
**Review Mode**: [selected mode]
**Code Changes**: [Full diff]
**Mode Context Pack**: [Context assembled in Step 2.6 for the selected mode]
**Validation Results**: [From implementation section]

Review for test coverage gaps. In `deep`, use integration seams and adjacent helpers to reason about risky changed paths, but only flag gaps tied to changed behavior. Return the standard test-coverage-analyst YAML schema.
</agent>

<agent type="apex:review:phase1:review-code-quality-analyst">
Include in every mode.

**Task ID**: [taskId]
**Review Mode**: [selected mode]
**Code Changes**: [Full diff]
**Mode Context Pack**: [Context assembled in Step 2.6 for the selected mode]
**Journey Context**: Patterns applied, conventions followed

Review for maintainability and code quality. In `deep`, examine long-term complexity and compounding design debt around the changed lines, but keep findings tied to the diff. Return the standard code-quality-analyst YAML schema.
</agent>

<agent type="apex:review:phase1:review-git-historian">
Include in every mode.

**Task ID**: [taskId]
**Review Mode**: [selected mode]
**Code Changes**: [Full diff]
**Mode Context Pack**: [Context assembled in Step 2.6 for the selected mode]
**Git Context**: [recent commits, churn, regressions, ownership signals from the selected mode context pack]

Review for pattern violations, regressions, and inconsistencies using git history. In `deep`, prioritize high-churn and previously reverted areas to pressure-test the changed lines. Return the standard git-historian YAML schema.
</agent>

</agents>

<wait-for-all>WAIT for ALL 5 Phase 1 agents to complete before Phase 2.</wait-for-all>
</step>

<step id="4" title="Phase 2: Adversarial challenge">
<agents parallel="true">
<agent type="apex:review:phase2:review-challenger">
**Review Mode**: [selected mode]
**Review Mode Rationale**: [why this mode was chosen]
**Phase 1 Agents Used**: [all 5 Phase 1 agents]
**Phase 1 Findings**: [YAML from all 5 Phase 1 agents]
**Mode Context Pack**: [Context assembled in Step 2.6 for the selected mode]
**Original Code**: [Relevant snippets]
**Journey Context**: Plan rationale, implementation justifications, validation status, git risk signals

Challenge EVERY finding using the standard challenger contract:
- validate code accuracy and evidence quality
- assess historical context and justification
- analyze ROI and overrides using the challenger’s standard enums and schema
- return the standard challenger YAML output, including per-finding validation, historical_context, roi_analysis, override, challenge_result, final_confidence, and final_category

Use the selected review mode only to decide how much context to read before applying the standard contract:
- `light` → concise context pack
- `standard` → normal context pack
- `deep` → richer context pack and more context-reading before judgment
</agent>
</agents>

<wait-for-all>WAIT for the challenger to complete.</wait-for-all>
</step>

<step id="5" title="Synthesize review results">
<confidence-adjustment>
For each challenge in `challenger.challenges[]`:
  REQUIRE challenge.final_confidence and challenge.final_category
  If either is missing:
    STOP and re-run Phase 2 with the standard challenger schema
  finalConfidence = challenge.final_confidence
  finalCategory = challenge.final_category
</confidence-adjustment>

<action-decision>
- if finalConfidence >= 80 → FIX_NOW
- else if finalConfidence >= 60 → SHOULD_FIX
- else → FILTERED

If finalCategory disagrees with the threshold-implied category:
- STOP and re-run Phase 2 with the standard challenger schema

Filtered findings are internal only:
- do not add them to `<action-items>`
- do not include filtered findings as individual action items or detailed findings
- do record aggregate filtered counts in the review summary
</action-decision>

<review-decision>
- 0 FIX_NOW and no critical security → APPROVE (proceed to commit)
- 1-2 FIX_NOW minor and no critical security → CONDITIONAL (fix or accept with docs)
- 3+ FIX_NOW or any critical security finding → REJECT (return to /apex:implement)
</review-decision>

<reject-flow>
On REJECT:
1. Write a minimal `<ship>` section that includes:
   - `<decision>REJECT</decision>`
   - `<review-summary><review-mode>[selected mode]</review-mode><review-mode-rationale>[why this mode was chosen]</review-mode-rationale></review-summary>`
   - a brief reject rationale
2. Update frontmatter: `phase: rework`, `updated: [ISO timestamp]`
3. STOP. Do NOT commit or finalize reflection. Return to `/apex:implement`.
</reject-flow>
</step>

<step id="5.5" title="Documentation Updates">
<purpose>
Ensure documentation stays in sync with code changes.
</purpose>

<documentation-checklist>
**If task modified workflow or architecture**:
- [ ] CLAUDE.md - Check for stale references to changed behavior
- [ ] README.md - Update any affected workflow descriptions
- [ ] Related design docs - Search in docs/ directory

**If task modified API or CLI**:
- [ ] API documentation files
- [ ] CLI command documentation
- [ ] Usage examples in docs

**If task modified data structures**:
- [ ] Type definition docs
- [ ] Schema documentation
- [ ] Migration notes if breaking change

**Search strategy**:
```bash
# Find docs that might reference changed files
for file in [modified_files]; do
  grep -r "$(basename $file .ts)" docs/ README.md CLAUDE.md
done
```
</documentation-checklist>

<update-procedure>
1. Search for references to modified code
2. Read each found doc FULLY
3. Update outdated references
4. Verify accuracy after update
5. Add to git staging for commit
</update-procedure>

<docs-to-update-output>
Record in `<implementation><docs-updated>`:
```xml
<docs-updated>
  <doc path="[path]" reason="[Why updated]"/>
</docs-updated>
```
</docs-to-update-output>
</step>

<step id="6" title="Git commit">
<critical>
Commit BEFORE final reflection - reflection should reference an immutable commit.
</critical>

<commands>
```bash
git status --short
git add [relevant files]
git commit -m "[Task ID]: [Description]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
git log -1 --oneline  # Capture commit SHA
```
</commands>

<checkpoint>Commit SHA captured for evidence.</checkpoint>

<compound-prompt>
After successful commit, display:
```
Committed: [SHA]

Run `/apex:compound [identifier]` to capture learnings for future agents.
```
</compound-prompt>
</step>

<step id="7" title="Reflection and completion">
<critical>
You MUST record a final reflection. This is NOT optional.

Without reflection:
- Learnings aren't captured
- Pattern outcomes aren't recorded
- Future tasks don't benefit
</critical>

<reflection-format>
```markdown
### Reflection
- **Outcome**: success | partial | failure
- **Key Learning**: [Main lesson from this task]
- **Patterns Used**: [PAT:ID from plan] with outcome notes
- **New Patterns / Anti-patterns**: [If discovered]
- **Evidence**: [Commit SHA, files, tests]
```
</reflection-format>

<instructions>
1. Summarize outcome and key learning
2. List patterns used from the plan with outcome notes
3. Capture any new patterns or anti-patterns discovered
4. Reference evidence (commit SHA, file paths, tests)
5. Update the task file's `<ship><reflection>` section
</instructions>
</step>

<step id="9" title="Write ship section to task file">
<output-format>
Append to `<ship>` section:

```xml
<ship>
<metadata>
  <timestamp>[ISO]</timestamp>
  <outcome>success|partial|failure</outcome>
  <commit-sha>[SHA]</commit-sha>
</metadata>

<review-summary>
  <review-mode>[light|standard|deep]</review-mode>
  <review-mode-rationale>[Why this mode was selected]</review-mode-rationale>
  <phase1-findings count="X">
    <by-severity critical="N" high="N" medium="N" low="N"/>
    <by-agent>
      <agent name="code-quality-analyst" findings="N"/>
      <agent name="git-historian" findings="N"/>
      <agent name="test-coverage-analyst" findings="N"/>
      <agent name="architecture-analyst" findings="N"/>
      <agent name="security-analyst" findings="N"/>
    </by-agent>
  </phase1-findings>
  <phase2-challenges>
    <upheld>N</upheld>
    <downgraded>N</downgraded>
    <dismissed>N</dismissed>
  </phase2-challenges>
  <final-categories fix-now="N" should-fix="N" filtered="N"/>
  <false-positive-rate>[X%]</false-positive-rate>
</review-summary>

<contract-verification>
  <contract-version>[N]</contract-version>
  <amendments-audited>[List amendments or "none"]</amendments-audited>
  <acceptance-criteria-verification>
    <criterion id="AC-1" status="met|not-met">[Evidence or exception]</criterion>
  </acceptance-criteria-verification>
  <out-of-scope-check>[Confirm no out-of-scope work slipped in]</out-of-scope-check>
</contract-verification>

  <action-items>
  <fix-now>
    <item id="[ID]" severity="[S]" confidence="[C]" location="[file:line]">
      [Issue and fix]
    </item>
  </fix-now>
  <should-fix>[Deferred items]</should-fix>
  <accepted>[Accepted risks with justification]</accepted>
</action-items>

<commit>
  <sha>[Full SHA]</sha>
  <message>[Commit message]</message>
  <files>[List of files]</files>
</commit>

<reflection>
  <patterns-reported>
    <pattern id="PAT:X:Y" outcome="[outcome]"/>
  </patterns-reported>
  <key-learning>[Main lesson]</key-learning>
  <reflection-status>recorded|missing</reflection-status>
</reflection>

<final-summary>
  <what-was-built>[Concise description]</what-was-built>
  <patterns-applied count="N">[List]</patterns-applied>
  <test-status passed="X" failed="Y"/>
  <documentation-updated>[What docs changed]</documentation-updated>
</final-summary>
</ship>
```
</output-format>

<update-frontmatter>
For APPROVE or CONDITIONAL only:
Set `phase: complete`, `status: complete`, and `updated: [ISO timestamp]`
</update-frontmatter>
</step>

<step id="10" title="Final report to user">
<template>
✅ **Task Complete**: [Title]

📊 **Metrics**:
- Complexity: [X]/10
- Files modified: [N]
- Files created: [N]
- Tests: [passed]/[total]

💬 **Summary**: [Concise description of what was built]

📚 **Patterns**:
- Applied: [N] patterns
- Reflection: ✅ Recorded

✅ **Acceptance Criteria**:
- AC-* coverage: [met|not met with exceptions]

🔍 **Review**:
- Phase 1 findings: [N]
- Filtered by thresholds: [N]
- Dismissed by challenger: [N] ([X]%)
- Action items: [N] (all resolved)

⏭️ **Next**: Task complete. No further action required.
</template>
</step>

</workflow>

<completion-verification>
BEFORE reporting to user, verify ALL actions completed:

- [ ] Phase 1 review agents launched and returned?
- [ ] Review mode selected and rationale recorded?
- [ ] Phase 2 challenger launched and returned (with ROI analysis)?
- [ ] Documentation checklist completed?
- [ ] Contract verification completed (AC mapping + out-of-scope check)?
- [ ] Git commit created? (verify with git log -1)
- [ ] Reflection recorded in `<ship><reflection>`?

**If ANY unchecked → GO BACK AND COMPLETE IT.**
</completion-verification>

<success-criteria>
- Adversarial review completed with a selected mode (`light`, `standard`, or `deep`)
- All 5 Phase 1 agents ran with the selected context depth
- ROI analysis included in challenger findings
- Challenger used the selected mode as posture guidance while returning the standard schema
- Documentation checklist completed (grep → read → update → verify)
- Contract verification completed with AC mapping and scope confirmation
- All FIX_NOW items resolved (or explicitly accepted)
- Git commit created with proper message
- Reflection recorded with patterns and learnings
- Task file updated with complete ship section
- Frontmatter shows phase: complete, status: complete
</success-criteria>

</skill>

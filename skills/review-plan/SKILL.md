---
name: review-plan
description: Use when a task already has research and plan sections and the plan needs adversarial review before implementation
argument-hint: [task-identifier]
---

<skill name="apex:review-plan" phase="advisory">

<overview>
Iterative adversarial plan review.

Run a fresh reviewer round against the current task plan, revise the `<plan>` section after every in-scope `VERDICT: REVISE`, and repeat until the plan reaches `VERDICT: APPROVED`, the loop hits 5 rounds, or the task must return to `/apex:research` or `/apex:plan` because the inputs are too weak for safe review.

Target: 2-3 rounds. Hard max: 5 rounds.
</overview>

<phase-gate requires="none" sets="none">
  <reads-file>./apex/tasks/[ID].md</reads-file>
  <expects-sections>research, plan</expects-sections>
  <updates-section>plan</updates-section>
  <outputs-to>chat</outputs-to>
</phase-gate>

<principles>
- **Approval Gate**: Do not recommend implementation until the final verdict is `APPROVED`
- **Fresh Adversary**: Spawn a new reviewer subagent each round
- **Read-Only Reviewer**: Reviewer analyzes only; primary agent owns all plan edits
- **Fix Forward**: Address `REVISE` findings immediately in the task's `<plan>` section
- **High-Signal Review**: Prioritize architecture, security, edge cases, concurrency/state, sequencing, and validation realism
- **No Silent Scope Drift**: Do not change `<task-contract>` in this skill; if approval requires contract changes, stop and route back to `/apex:plan`
- **Evidence First**: If research is missing or the plan is below the minimum review threshold, stop early instead of speculating
</principles>

<initial-response>
<if-no-arguments>
I'll run iterative adversarial review on the plan. Please provide the task identifier.

You can find tasks in `./apex/tasks/` or run with:
`/apex:review-plan [identifier]`
</if-no-arguments>
<if-arguments>Load task file, extract the current plan, and start round 1.</if-arguments>
</initial-response>

<workflow>

<step id="1" title="Load task and build the review packet">
<instructions>
1. Read `./apex/tasks/[identifier].md`
2. Note current phase from frontmatter for context only; do not block on it
3. Extract:
   - `<task-contract>` from the research section
   - `<research>`
   - `<plan>`
4. Check reviewability before starting round 1:
   - If `<research>` is missing, lacks `<task-contract>`, or is too thin to identify risks, recommendations, and relevant evidence:
     - stop immediately
     - return `VERDICT: REVISE`
     - set next action to `RETURN_TO_RESEARCH`
     - instruct the user to run `/apex:research [identifier]`
   - If `<plan>` is missing, or below the minimum plan threshold:
     - stop immediately
     - return `VERDICT: REVISE`
     - set next action to `RETURN_TO_PLAN`
     - instruct the user to run `/apex:plan [identifier]`
5. Minimum plan threshold for `review-plan`:
   - the 5 mandatory plan artifacts from `/apex:plan` are present in substantive form
   - architecture decision / implementation sequence exists
   - builder handoff exists
   - contract validation / AC coverage exists
6. Capture the plan review packet:
   - Task title and identifier
   - Contract version, acceptance criteria, amendments
   - Research risks, security concerns, recommendations, documentation drift, patterns, and relevant file references
   - Current `<plan>` contents
7. Verify any existing files referenced in the plan's implementation path using `ls`, `rg`, or equivalent read-only inspection
</instructions>
</step>

<step id="2" title="Run the adversarial review loop">
<instructions>
For rounds `1..5`:

1. Create a compact round summary for the reviewer:
   - Current plan snapshot
   - Contract and research constraints
   - Prior round findings and what changed since then
2. Spawn exactly one fresh subagent for the round
3. Instruct the subagent:
   - This is a read-only review round
   - Do not edit files
   - Review the plan as an adversary, not a collaborator
   - Inspect repo files if needed to verify feasibility
   - Focus on:
     - mandatory artifact completeness
     - architecture soundness
     - contract coverage
     - contract version / amendment acknowledgement
     - security concerns
     - edge cases and failure modes
     - concurrency, state, ordering, and race risks
     - pattern provenance and trust alignment
     - documentation drift
     - non-functional requirement coverage
     - validation quality and realism
     - implementation sequencing and dependency order
     - research-to-plan mismatches
4. Require the subagent to return this structure:

```text
ROUND: [N]
VERDICT: [REVISE|APPROVED]
NEXT ACTION: [CONTINUE|RETURN_TO_RESEARCH|RETURN_TO_PLAN|IMPLEMENT]

MUST FIX
- ...

NON-BLOCKING
- ...

SUGGESTED PLAN EDITS
- ...

APPROVAL SUMMARY
- ...
```

Rules for the verdict:
- `APPROVED` only when there are no blocking issues left
- `REVISE` when any blocking issue remains
- Reviewer must not use softer top-line verdicts like `PROCEED` or `RETHINK`

Rules for `NEXT ACTION`:
- `CONTINUE` means the plan is reviewable and can be revised in place
- `RETURN_TO_RESEARCH` means the evidence base is too weak for safe review
- `RETURN_TO_PLAN` means the plan is below threshold or requires scope / contract rework
- `IMPLEMENT` is only valid with `VERDICT: APPROVED`
</instructions>
</step>

<step id="3" title="Handle REVISE rounds">
<instructions>
If the reviewer returns `VERDICT: REVISE`:

1. Extract the blocking findings
2. If `NEXT ACTION` is `RETURN_TO_RESEARCH`:
   - stop the loop
   - do not edit `<plan>`
   - instruct the user to run `/apex:research [identifier]`
3. If `NEXT ACTION` is `RETURN_TO_PLAN`:
   - stop the loop
   - do not edit `<plan>`
   - instruct the user to run `/apex:plan [identifier]`
4. Otherwise continue with in-scope plan fixes
5. Update the task's `<plan>` section directly to resolve them
6. Keep edits scoped to the plan:
   - preserve all 5 mandatory artifacts
   - preserve architecture decision, builder handoff, and contract validation
   - acknowledge contract version and any amendments
   - preserve or restore docs drift, pattern provenance, and NFR coverage checks
   - refine architecture choice
   - add missing mitigations
   - cover uncovered acceptance criteria
   - tighten sequencing
   - replace vague validation with concrete commands
   - clarify ownership of edge cases or concurrency handling
7. Do not edit `<task-contract>` or `<research>`
8. If a blocking issue cannot be fixed without changing contract scope, assumptions, or acceptance criteria:
   - stop the loop
   - report `VERDICT: REVISE`
   - set next action to `RETURN_TO_PLAN`
   - instruct the user to return to `/apex:plan [identifier]`
9. After editing the plan, validate the mutation before the next round:
   - reread the task file
   - confirm the `<plan>` block still parses and is isolated from surrounding sections
   - confirm the edit stayed scoped to `<plan>`
   - confirm required plan artifacts were not accidentally removed
   - if the task file is malformed, repair it before continuing; if that is not possible, stop and return to `/apex:plan [identifier]`
10. After each revision, summarize in chat:
   - what the reviewer flagged
   - what changed in the plan
   - what remains to validate next round
11. Start the next round with a fresh reviewer subagent
</instructions>
</step>

<step id="4" title="Handle APPROVED or max-round exit">
<instructions>
If the reviewer returns `VERDICT: APPROVED`:
- Stop immediately
- Set next action to `IMPLEMENT`
- Do not run extra review rounds
- Present the final approval summary and the most important improvements made during the loop

If round 5 ends with `VERDICT: REVISE`:
- Stop the loop
- Set next action to `RETURN_TO_PLAN`
- Do not continue beyond 5 rounds
- Present the unresolved blockers
- Recommend returning to `/apex:plan [identifier]` for a larger rework
</instructions>
</step>

<step id="5" title="Deliver the final review result">
<output-format>
# Plan Review: [Task Title]

## Round Status
- Round [N]: [REVISE|APPROVED]
- Repeat for each executed round, up to 5

## Final Verdict
`VERDICT: [REVISE|APPROVED]`

## Next Action
`[RETURN_TO_RESEARCH|RETURN_TO_PLAN|IMPLEMENT]`

## Blocking Findings
- [Finding + exact fix, if any remain]

## Plan Changes Made
- [High-signal summary of plan revisions applied during the loop]

## Final Notes
- [If IMPLEMENT]: Ready for `/apex:implement [identifier]`
- [If RETURN_TO_RESEARCH]: Return to `/apex:research [identifier]`
- [If RETURN_TO_PLAN]: Return to `/apex:plan [identifier]`
</output-format>
</step>

</workflow>

<review-rubric>
Treat these as blocking unless the plan clearly handles them:

- Missing mandatory plan artifacts or thin placeholder artifacts
- Missing or contradictory contract coverage
- Missing contract version / amendment acknowledgement
- Architecture that does not match research evidence
- Security-sensitive gaps with no mitigation or explicit exclusion
- Concurrency/state/order-of-operations risks left implicit
- Edge cases handled with wishful thinking
- Pattern claims that do not trace back to research or codebase evidence
- Documentation drift identified in research but absent from the plan
- Non-functional requirements without validation coverage
- Validation gates that are vague, manual-only, or not runnable
- File or dependency assumptions that do not match the repo
</review-rubric>

<success-criteria>
- Task file loaded and parsed
- Unreviewable research or plan states fail fast to the correct upstream skill
- Plan reviewed in iterative rounds, not one pass
- Fresh reviewer used for each round
- Reviewer returns a verdict and next action
- `REVISE` rounds produce inline `<plan>` updates
- Each plan edit is reread and structure-checked before the next round
- Loop stops on approval or after 5 rounds
- Final result clearly states verdict, key fixes, and next step
</success-criteria>

</skill>

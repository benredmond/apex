---
name: research
description: Intelligence gathering phase - spawns parallel agents to analyze codebase, patterns, git history, and web research. Creates or updates task file with findings.
argument-hint: [task-description|ticket-id|file-path|task-id]
---

<skill name="apex:research" phase="research">

<overview>
Conduct comprehensive research by orchestrating parallel sub-agents. Outputs to `./apex/tasks/[ID].md`.

This is the **first phase** of the APEX workflow. It gathers all intelligence needed for planning and implementation.
</overview>

<initial-response>
<if-no-arguments>
I'll conduct comprehensive research to gather intelligence and explore the codebase.

Please provide:
- Task description (e.g., "implement dark mode toggle")
- Linear/JIRA ticket ID (e.g., "APE-59")
- Path to task file (e.g., "./tickets/feature.md")
- Existing APEX task ID

I'll analyze patterns, explore the codebase, find similar tasks, and create a detailed research document.
</if-no-arguments>
<if-arguments>Immediately begin research - skip this message.</if-arguments>
</initial-response>

<workflow>

<step id="1" title="Parse input and identify task">
<instructions>
Determine input type and create/find task:

**Text description**: Create a task entry with intent, inferred type, generated identifier, and tags
**Ticket ID (APE-59)**: Fetch ticket details (if available), then create a task entry with identifier set to ticket ID
**File path**: Read file fully, parse content, then create a task entry
**Database ID**: Look up existing task by ID to retrieve it

Store `taskId` and `identifier` for all subsequent operations.
</instructions>
</step>

<step id="2" title="Clarify intent and scope">
<instructions>
Before any deep research, answer these three questions in 1-2 sentences each:

1. **Intent**: What is the user actually trying to accomplish? (Look past the literal request)
2. **Scope**: What files/systems are in play? What's explicitly out?
3. **Verification**: How will we know it's done? (Test command, observable behavior, or acceptance criteria)

If any answer is "I don't know," that's an ambiguity to resolve in step 4.
</instructions>
</step>

<step id="3" title="Read mentioned files FULLY">
<critical>
Before ANY analysis or spawning agents:
- If user mentions specific files, READ THEM FULLY first
- Use Read tool WITHOUT limit/offset parameters
- Read in main context BEFORE spawning sub-tasks
- This ensures full context before decomposing research
</critical>
</step>

<step id="4" title="Triage scan + Ambiguity Gate">
<purpose>
Run cheap scans to locate target areas and detect ambiguity before spawning agents.
</purpose>

<triage-scan>
- Use Grep/Glob to locate entrypoints, tests, and likely target areas using keywords from step 2.
- Capture candidate files/areas to refine scope.
- Do NOT open large files unless the user explicitly mentioned them.
</triage-scan>

<critical>
Ambiguity is a BLOCKING condition that ONLY users can resolve.
DO NOT spawn deep research agents with unclear requirements.
</critical>

<ambiguity-triggers>
Ask the user if ANY of these are true:
- Goal is vague ("improve", "enhance", "optimize") without measurable criteria
- Multiple plausible interpretations exist after triage scan
- Architecture/library choices the user should make
- Scope is unbounded (no clear in/out boundary)
</ambiguity-triggers>

<decision>
- **0 ambiguities**: PROCEED to determine research depth and spawn agents
- **1+ ambiguities**: ASK USER (max 1 round, options with implications, then proceed)
</decision>
</step>

<step id="4b" title="Determine research depth">
<purpose>
Scale agent deployment to task complexity. Not every task needs 6+ agents.
</purpose>

<complexity-signals>
Assess from triage scan results:
- **How many files/systems are touched?** (1-3 files = small, 4-10 = medium, 10+ = large)
- **Does this involve external APIs, libraries, or unfamiliar tech?** (triggers web research)
- **Does this cross module/package boundaries?** (triggers systems research)
- **Is this in a high-risk area (auth, data, payments, public API)?** (triggers risk analyst)
</complexity-signals>

<depth-tiers>
**LIGHT** (simple bug fix, small refactor, test addition):
- Skip: web-researcher, systems-researcher, risk-analyst
- Run: implementation-pattern-extractor, git-historian, learnings-researcher
- Output: Concise but complete research section — include all core sections (executive summary, target files, codebase patterns, risks, recommendations, task contract) even if brief

**STANDARD** (feature, multi-file change, moderate complexity):
- Run: implementation-pattern-extractor, git-historian, documentation-researcher, learnings-researcher
- Conditional: web-researcher (only if external dependencies involved)
- Conditional: systems-researcher (only if cross-module)
- Output: Full research section

**DEEP** (architecture change, new subsystem, high-risk, cross-cutting):
- Run: ALL agents including risk-analyst and systems-researcher
- Output: Full research section with all sections populated
</depth-tiers>
</step>

<step id="5" title="Create task file">
<instructions>
Create `./apex/tasks/[identifier].md` with frontmatter:

```markdown
---
id: [database_id]
identifier: [identifier]
title: [Task title]
created: [ISO timestamp]
updated: [ISO timestamp]
phase: research
status: active
---

# [Title]

<research>
<!-- Will be populated by this skill -->
</research>

<plan>
<!-- Populated by /apex:plan -->
</plan>

<implementation>
<!-- Populated by /apex:implement -->
</implementation>

<ship>
<!-- Populated by /apex:ship -->
</ship>
```
</instructions>
</step>

<step id="6" title="Spawn parallel research agents">
<critical>
- Use clarified intent from step 2 as source of truth for all agent prompts.
- Only spawn agents appropriate for the depth tier from step 4b.
- Launch all selected agents in parallel.
</critical>

<agents>

<agent type="implementation-pattern-extractor" tier="LIGHT+">
**Task Context**: [Brief description]
**Task Type**: [bug|feature|refactor|test]

Extract concrete implementation patterns from THIS codebase with file:line references.
Return: primary patterns, conventions, reusable snippets, testing patterns.
</agent>

<agent type="apex:git-historian" tier="LIGHT+">
**Scope**: [files/directories from triage scan]
**Window**: 9 months

Analyze git history for similar changes, regressions, ownership.
Return: Structured git intelligence.
</agent>

<agent type="apex:documentation-researcher" tier="STANDARD+">
**Focus**: [Task-relevant topics]

Search project docs for architecture context, past decisions, learnings, and gotchas.
Return: architecture_context, past_decisions, historical_learnings, docs_to_update.
</agent>

<agent type="learnings-researcher" tier="STANDARD+">
**Task Intent**: [Intent from step 2]
**Keywords**: [Extracted keywords]

Search past task files for problems solved, decisions made, and gotchas.
Return: Top 5 relevant learnings ranked by relevance.
</agent>

<agent type="web-researcher" tier="STANDARD+ when external deps involved">
**Research Topic**: [Component/Technology/Pattern]
**Context**: [What we're trying to accomplish]

Find official documentation, best practices, security concerns.
Return: official_docs, best_practices, security_concerns, recent_changes.

**Skip this agent when**: task is purely internal codebase work with no external APIs or libraries.
</agent>

<agent type="apex:systems-researcher" tier="DEEP or cross-module">
**Focus Area**: [Component or subsystem]

Trace execution flow, dependencies, state transitions, integration points.
</agent>

<agent type="apex:risk-analyst" tier="DEEP or high-risk area">
Surface forward-looking risks, edge cases, monitoring gaps, mitigations.
</agent>

</agents>

<wait-for-all>Wait for ALL spawned agents to complete before proceeding.</wait-for-all>
</step>

<step id="7" title="Synthesize findings">
<priority-order>
1. Live codebase = primary truth (what actually exists)
2. Implementation patterns = concrete project conventions
3. Official documentation = authoritative reference
4. Pattern library = proven cross-project solutions
5. Best practices = industry consensus
6. Git history = evolution understanding
</priority-order>

<synthesis-tasks>
- Validate pattern library findings against actual codebase
- Cross-reference with official docs
- Identify gaps between current code and recommendations
- Flag inconsistencies and deprecated patterns
- Note security concerns
- Resolve contradictions (codebase > docs > patterns > opinions)
</synthesis-tasks>

<evidence-rule>
**Every factual assertion must cite its source.** No bare claims.
- Code assertions → file:line or function name with file path
- Behavioral claims → test name or command that demonstrates it
- Risk claims → specific code construct that could fail, not "could break things"
- Performance claims → allocation count, hot-path evidence, or "no perf data available"
If you cannot cite evidence for a claim, qualify it as an assumption or open question.
</evidence-rule>
</step>

<step id="8" title="Display Intelligence Report">
<purpose>Give user visibility into gathered intelligence before the gap check.</purpose>

<display-format>
```
## Research Summary

**Task**: [Title]
**Depth**: [LIGHT|STANDARD|DEEP] — [N] agents deployed

### Target Files
- [file:line] — [why this file changes]

### Key Findings
1. [Most important finding from agents]
2. [Second most important]
3. [Third, if applicable]

### Recommended Approach
[1-2 sentence summary of the winning solution]

### Open Questions
- [Any gaps or unknowns for the plan phase]
```
</display-format>
</step>

<step id="9" title="Gap check">
<purpose>
Before writing the research document, verify you can answer these concrete questions.
If you can't, that's a gap to flag — not a score to compute.
</purpose>

<must-know>
1. **Which files change?** (specific paths from triage + pattern extraction)
2. **How is this tested?** (existing test patterns or new test strategy)
3. **What could break?** (downstream consumers, edge cases from git history)
4. **Is there a prior art?** (similar past task, codebase pattern, or documented decision)
</must-know>

<if-gaps>
If any must-know is unanswered:
- Spawn a targeted recovery agent for the specific gap, OR
- Flag it as an open question in the research output for the user/architect
Do NOT block on gaps that the plan phase can resolve.
</if-gaps>
</step>

<step id="10" title="Generate solution approaches">
<instructions>
**For all tasks**: Produce at least 2 solution approaches with pros, cons, risk level, and a recommended winner. The second approach provides valuable contrast even when one approach is clearly better.

**For genuinely ambiguous tasks** (multiple viable architectures, real trade-offs):
Produce 3 distinct approaches.

Do not pad to 3 by inventing obviously bad options — but always have at least 2.

**For each approach**: Name the specific functions/types to create or modify (not abstract descriptions). Include before/after signatures for key interface changes.
</instructions>
</step>

<step id="11" title="Write research section to task file">
<output-format>
Append to `<research>` section. **Include all core sections** even if brief — the completeness of coverage matters for downstream quality assessment. Optional sections (web-research, past-learnings) may be omitted when agents returned nothing relevant.

```xml
<research>
<metadata>
  <timestamp>[ISO]</timestamp>
  <depth>[LIGHT|STANDARD|DEEP]</depth>
  <agents-deployed>[N]</agents-deployed>
  <files-analyzed>[X]</files-analyzed>
</metadata>

<executive-summary>
[1-3 paragraphs synthesizing findings. This is the most important section — downstream
phases read this first. Lead with: what changes, where, why, and the recommended approach.]
</executive-summary>

<target-files>
[List of files that will change, with file:line references and brief rationale.
Include function/method names — bare file paths are insufficient.
This is what the plan phase consumes most directly.]
</target-files>

<codebase-patterns>
  <primary-pattern location="file:line">[Description with code snippet]</primary-pattern>
  <key-signatures>[Before/after signatures for interfaces or types being modified]</key-signatures>
  <testing-patterns>[How similar features are tested, with specific test file:line references]</testing-patterns>
  <conventions>[Only if non-obvious naming/structure/error-handling conventions exist]</conventions>
</codebase-patterns>

<!-- Include only sections with real findings. Omit empty sections. -->

<web-research><!-- Only if web-researcher was deployed -->
  <official-docs>[Key findings with URLs]</official-docs>
  <best-practices>[Practices with sources]</best-practices>
  <security-concerns>[Issues with severity and mitigation]</security-concerns>
</web-research>

<past-learnings><!-- Only if learnings-researcher found relevant matches -->
  <learning task-id="[ID]">[What's relevant and why — problems, decisions, gotchas]</learning>
</past-learnings>

<git-history>
  <similar-changes>[Commits with lessons]</similar-changes>
</git-history>

<risks><!-- Only if concrete risks identified -->
  <risk probability="H|M|L" impact="H|M|L" evidence="[file:line or code construct]">
    [Description]. Mitigation: [concrete action, not "be careful"].
  </risk>
</risks>

<performance><!-- Include when changes touch request paths, loops, or allocation-heavy code -->
  [Allocation impact, hot-path analysis, or explicit "no perf impact — [reason]"]
</performance>

<recommendations>
  <!-- For straightforward tasks: single recommended approach -->
  <!-- For ambiguous tasks: 2-3 approaches with winner -->
  <solution id="A" name="[Name]">
    <path>[Implementation steps]</path>
    <pros>[Advantages]</pros>
    <cons>[Disadvantages]</cons>
    <risk-level>[Low|Medium|High]</risk-level>
  </solution>
  <winner id="[A]" reasoning="[Why]"/>
</recommendations>

<task-contract version="1">
  <intent>[Single-sentence intent]</intent>
  <in-scope>[Explicit inclusions]</in-scope>
  <out-of-scope>[Explicit exclusions]</out-of-scope>
  <acceptance-criteria>
    <criterion id="AC-1">Given..., When..., Then...</criterion>
  </acceptance-criteria>
  <verification>
    <command>[Exact test command an agent can run to verify success]</command>
    <test-strategy>[Which test files/patterns cover this change]</test-strategy>
  </verification>
  <open-questions><!-- Gaps from step 9 that plan phase should resolve -->
    <question>[Specific unanswered question]</question>
  </open-questions>
</task-contract>

<next-steps>
Run `/apex:plan [identifier]` to create architecture from these findings.
</next-steps>
</research>
```
</output-format>

<update-frontmatter>
Set `updated: [ISO timestamp]` and verify `phase: research`
</update-frontmatter>
</step>

</workflow>

<success-criteria>
- Intent, scope, and verification strategy clarified
- All mentioned files read fully before spawning agents
- Ambiguity resolved before spawning agents (0 ambiguities OR user clarified)
- Research depth determined (LIGHT/STANDARD/DEEP) and agents scaled accordingly
- All spawned agents completed
- Target files identified with file:line references
- Implementation patterns extracted from codebase
- Gap check passed (must-know questions answered or flagged)
- Recommended approach documented with rationale
- Task contract created with intent, scope, and acceptance criteria
- Task file created/updated at ./apex/tasks/[ID].md
- Intelligence report displayed to user
</success-criteria>

<next-phase>
`/apex:plan [identifier]` - Architecture and design decisions
</next-phase>

</skill>

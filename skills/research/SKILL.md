---
name: research
description: Intelligence gathering phase - spawns parallel agents to analyze codebase, patterns, git history, and web research. Creates or updates task file with findings.
argument-hint: [task-description|ticket-id|file-path|task-id]
---

<skill name="apex:research" phase="research">

<overview>
Conduct comprehensive research by orchestrating parallel sub-agents. Outputs to `./.apex/tasks/[ID].md`.

This is the **first phase** of the APEX workflow. It gathers all intelligence needed for planning and implementation.
</overview>

<phase-gate requires="none" sets="research">
  <creates-file>./.apex/tasks/[ID].md</creates-file>
  <appends-section>research</appends-section>
</phase-gate>

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

**Text description**: Call `apex_task_create` with intent, inferred type, generated identifier, and tags
**Ticket ID (APE-59)**: Fetch via MCP, then `apex_task_create` with identifier set to ticket ID
**File path**: Read file fully, parse content, then `apex_task_create`
**Database ID**: Call `apex_task_find` to retrieve existing task

Store `taskId` and `identifier` for all subsequent operations.
</instructions>
</step>

<step id="2" title="Read mentioned files FULLY">
<critical>
Before ANY analysis or spawning agents:
- If user mentions specific files, READ THEM FULLY first
- Use Read tool WITHOUT limit/offset parameters
- Read in main context BEFORE spawning sub-tasks
- This ensures full context before decomposing research
</critical>
</step>

<step id="3" title="Create task file">
<instructions>
Create `./.apex/tasks/[identifier].md` with frontmatter:

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
<!-- Populated by /apex plan -->
</plan>

<implementation>
<!-- Populated by /apex implement -->
</implementation>

<ship>
<!-- Populated by /apex ship -->
</ship>
```
</instructions>
</step>

<step id="4" title="Spawn parallel research agents">
<agents parallel="true">

<agent type="intelligence-gatherer" required="true">
**Task ID**: [taskId]
**Research Focus**: [User's question/area]

Discover APEX patterns, find similar tasks, identify predicted failures, generate execution strategy.
Return: Context pack with pattern intelligence.
</agent>

<agent type="implementation-pattern-extractor" required="true">
**Task Context**: [Brief description]
**Task Type**: [bug|feature|refactor|test]

Extract concrete implementation patterns from THIS codebase with file:line references.
Return: YAML with primary patterns, conventions, reusable snippets, testing patterns.
</agent>

<agent type="web-researcher" required="true">
**Research Topic**: [Component/Technology/Pattern]
**Context**: [What we're trying to accomplish]

Find official documentation, best practices, security concerns, recent changes.
Return: YAML with official_docs, best_practices, security_concerns, recent_changes.
</agent>

<agent type="apex:git-historian" required="true">
**Scope**: [files/directories]
**Window**: 9 months

Analyze git history for similar changes, regressions, ownership.
Return: Structured git intelligence.
</agent>

<agent type="apex:systems-researcher" signal-based="true">
**Trigger**: Cross-component changes, architectural impacts
**Focus Area**: [Component or subsystem]

Trace execution flow, dependencies, state transitions, integration points.
</agent>

<agent type="apex:risk-analyst" signal-based="true">
**Trigger**: Complexity >= 7, production-critical, security-sensitive

Surface forward-looking risks, edge cases, monitoring gaps, mitigations.
</agent>

</agents>

<wait-for-all>CRITICAL: Wait for ALL agents to complete before proceeding.</wait-for-all>
</step>

<step id="5" title="Synthesize findings">
<priority-order>
1. Live codebase = primary truth (what actually exists)
2. Implementation patterns = concrete project conventions
3. Official documentation = authoritative reference
4. APEX patterns = proven cross-project solutions
5. Best practices = industry consensus
6. Git history = evolution understanding
</priority-order>

<synthesis-tasks>
- Validate APEX patterns against actual codebase
- Cross-reference with official docs
- Identify gaps between current code and recommendations
- Flag inconsistencies and deprecated patterns
- Note security concerns
- Resolve contradictions (codebase > docs > patterns > opinions)
</synthesis-tasks>
</step>

<step id="6" title="Generate Tree of Thought recommendations">
<instructions>
Produce exactly 3 distinct solution approaches:

**Solution A**: [Approach name]
- Philosophy, implementation path, pros, cons, risk level

**Solution B**: [Different paradigm]
- Philosophy, implementation path, pros, cons, risk level

**Solution C**: [Alternative architecture]
- Philosophy, implementation path, pros, cons, risk level

**Comparative Analysis**: Winner with reasoning, runner-up with why not
</instructions>
</step>

<step id="7" title="Write research section to task file">
<output-format>
Append to `<research>` section:

```xml
<research>
<metadata>
  <timestamp>[ISO]</timestamp>
  <agents-deployed>[N]</agents-deployed>
  <files-analyzed>[X]</files-analyzed>
  <confidence>[0-10]</confidence>
</metadata>

<executive-summary>
[2-3 paragraphs synthesizing ALL findings]
</executive-summary>

<web-research>
  <official-docs>[Key findings with URLs]</official-docs>
  <best-practices>[Practices with sources]</best-practices>
  <security-concerns>[Issues with severity and mitigation]</security-concerns>
  <gap-analysis>[Codebase vs recommendations]</gap-analysis>
</web-research>

<codebase-patterns>
  <primary-pattern location="file:line">[Description with code snippet]</primary-pattern>
  <conventions>[Naming, structure, types, error handling]</conventions>
  <reusable-snippets>[Copy-pasteable code with sources]</reusable-snippets>
  <testing-patterns>[How similar features are tested]</testing-patterns>
  <inconsistencies>[Multiple approaches found]</inconsistencies>
</codebase-patterns>

<apex-patterns>
  <pattern id="PAT:X:Y" trust="★★★★☆" uses="N" success="X%">[Relevance]</pattern>
  <anti-patterns>[Patterns to avoid with reasons]</anti-patterns>
</apex-patterns>

<git-history>
  <similar-changes>[Commits with lessons]</similar-changes>
  <evolution>[How code got here]</evolution>
</git-history>

<risks>
  <risk probability="H|M|L" impact="H|M|L">[Description with mitigation]</risk>
</risks>

<recommendations>
  <solution id="A" name="[Name]">
    <philosophy>[Core principle]</philosophy>
    <path>[Implementation steps]</path>
    <pros>[Advantages]</pros>
    <cons>[Disadvantages]</cons>
    <risk-level>[Low|Medium|High]</risk-level>
  </solution>
  <solution id="B" name="[Name]">...</solution>
  <solution id="C" name="[Name]">...</solution>
  <winner id="[A|B|C]" reasoning="[Why]"/>
</recommendations>

<next-steps>
Run `/apex plan [identifier]` to create architecture from these findings.
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
- All mentioned files read fully
- All parallel agents completed
- Implementation patterns extracted with file:line refs
- Web research validated against official docs
- APEX patterns analyzed with trust scores
- Git history examined
- 3 solution approaches generated (Tree of Thought)
- Risks identified with mitigations
- Task file created/updated at ./.apex/tasks/[ID].md
</success-criteria>

<next-phase>
`/apex plan [identifier]` - Architecture and design decisions
</next-phase>

</skill>

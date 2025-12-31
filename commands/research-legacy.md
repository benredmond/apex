# APEX Research - Comprehensive Intelligence & Codebase Analysis

**Domain**: Research & Intelligence
**Purpose**: Conduct comprehensive research across codebases, patterns, and historical context by orchestrating parallel sub-agents
**Output**: `~/.apex/plans/research_[TASK_ID].md`

## Quick Reference

**When to use**: Beginning of any task to gather intelligence, discover patterns, and understand codebase
**Typical duration**: 5-15 minutes depending on complexity
**Prerequisites**: Task ID, ticket reference, or research question
**Output**: Comprehensive research document with context pack and findings

## Initial Response

When invoked with arguments, immediately begin research.
If no arguments provided, respond with:

```
I'll conduct comprehensive research to gather intelligence and explore the codebase.

Please provide:
- Task ID from APEX database, OR
- Linear/JIRA ticket ID (e.g., "APE-59"), OR
- Research question or area of interest

I'll analyze patterns, explore the codebase, find similar tasks, and create a detailed research document.
```

## Core Workflow

**CREATE A TODO LIST** with these items:

1. Identify or create task (if applicable)
2. Read any directly mentioned files FULLY
3. Analyze and decompose the research question
4. Spawn parallel sub-agents for comprehensive research (including web research)
5. Synthesize findings from all agents (codebase + web + patterns + history)
6. Generate pattern analysis and insights with external validation
7. Create research document with complete findings and source attribution

## Step 1: Identify or Create Task

### If database task ID provided:
```python
task = apex_task_find(task_id)
```

### If Linear/JIRA ID provided:
1. Fetch issue details via MCP
2. Create task:
```python
apex_task_create(
    intent=issue_description,
    type=inferred_type,
    identifier=linear_id
)
```

### If description provided:
```python
apex_task_create(
    intent=description,
    type=inferred_type,
    identifier=generated_id
)
```

## Step 2: Read Mentioned Files FULLY

**CRITICAL**: Before ANY analysis or spawning agents:
   - If the user mentions specific files (tickets, docs, JSON), read them FULLY first
   - **IMPORTANT**: Use the Read tool WITHOUT limit/offset parameters to read entire files
   - **CRITICAL**: Read these files yourself in the main context before spawning any sub-tasks
   - This ensures you have full context before decomposing the research

## Step 3: Analyze and Decompose Research Question

Break down the research into multiple dimensions:

```yaml
research_decomposition:
  core_analysis:
    - What is the user REALLY trying to understand?
    - What underlying patterns or connections might be relevant?
    - What architectural implications should be explored?

  research_areas:
    - Components: Which parts of the codebase are involved?
    - Patterns: What design patterns or conventions apply?
    - History: What similar work has been done before?
    - Context: What documentation or thoughts exist?

  agent_strategy:
    - Start with locator agents to find relevant files
    - Deploy analyzer agents on promising findings
    - Use pattern discovery for APEX intelligence
    - Explore thoughts/ for historical context
```

## Step 4: Execute Parallel Research Operations

### 4.1 Orchestrate Multiple Research Agents

Deploy agents in parallel for maximum efficiency:

```python
# Launch these agents concurrently for comprehensive research:

parallel_agents = [
    # APEX Pattern Intelligence (if task-based) - ONLY this uses special subagent
    <Task subagent_type="intelligence-gatherer" description="Discover APEX patterns and similar tasks">
        [Prompt for APEX pattern discovery]
    </Task>,

    # Web Research - Uses specialized subagent for external validation
    <Task subagent_type="web-researcher" description="Research latest docs and best practices">
        [Prompt for web research and documentation discovery]
    </Task>,

    # Implementation Pattern Extraction - Uses specialized subagent for codebase patterns
    <Task subagent_type="implementation-pattern-extractor" description="Extract concrete implementation patterns">
        [Prompt for extracting task-specific patterns from THIS codebase]
    </Task>,

    # Codebase Exploration - Generic Task agents
    <Task description="Find and analyze relevant code components">
        [Prompt to search and analyze codebase]
    </Task>,

    <Task description="Trace data flow and dependencies">
        [Prompt to understand system architecture]
    </Task>,

    # Git History Analysis - Generic Task agents
    <Task description="Analyze git history for similar changes">
        [Prompt to search git commits and evolution]
    </Task>,

    <Task description="Find previous implementations">
        [Prompt to discover historical approaches]
    </Task>,

    # Architecture Analysis - Generic Task agents
    <Task description="Verify architectural assumptions">
        [Prompt for architecture validation]
    </Task>,

    <Task description="Identify codebase patterns">
        [Prompt for pattern discovery]
    </Task>
]
```

### 4.2 Agent-Specific Prompts

#### For APEX Intelligence (when applicable):
```markdown
<Task subagent_type="intelligence-gatherer" description="APEX pattern discovery">
**Task ID**: [TASK_ID if available]
**Research Focus**: [User's question/area]

**Priorities**:
1. Find similar tasks in APEX history
2. Discover high-trust patterns
3. Identify predicted failures
4. Generate execution strategy

**Return**: Context pack with pattern intelligence
</Task>
```

#### For Web Research (always recommended):
```markdown
<Task subagent_type="web-researcher" description="Research latest documentation and best practices">
**Research Topic**: [Component/Technology/Pattern being researched]
**Context**: [Brief description of what we're trying to accomplish]

**Your mission**: Find authoritative, current information to inform our implementation.

**Search for**:
1. **Official Documentation**:
   - Latest API documentation
   - Migration guides and changelogs
   - Official examples and tutorials
   - Breaking changes and deprecations

2. **Best Practices**:
   - Recommended patterns and architectures
   - Performance optimization guidelines
   - Security considerations
   - Testing strategies

3. **Community Knowledge**:
   - Recent GitHub issues and discussions
   - Stack Overflow solutions (recent, highly-voted)
   - Blog posts from maintainers or experts
   - Framework-specific patterns

4. **Security & Reliability**:
   - Known vulnerabilities or CVEs
   - Security advisories
   - Production gotchas and edge cases
   - Deprecation notices

**Quality filters**:
- Prioritize official docs over third-party
- Prefer recent content (last 12 months) unless dealing with stable APIs
- Look for 2024-2025 content when available
- Verify information against multiple authoritative sources

**Return format**:
```yaml
official_docs:
  - url: [URL]
    title: [Title]
    key_insights: [3-5 bullet points]
    last_updated: [Date if available]

best_practices:
  - source: [URL or "Multiple sources"]
    practice: [Description]
    reasoning: [Why this is recommended]
    evidence: [Citations or consensus indicators]

security_concerns:
  - issue: [Description]
    severity: [High/Medium/Low]
    mitigation: [Recommended approach]
    source: [URL]

recent_changes:
  - change: [What changed]
    version: [Version if applicable]
    impact: [How this affects us]
    source: [URL]

recommended_reading:
  - [URL] - [Brief description of why this is valuable]
```

**Search strategy**:
1. Start with official documentation sites
2. Check GitHub repo (README, docs/, CHANGELOG, issues, discussions)
3. Search for "[technology] best practices 2024"
4. Search for "[technology] common mistakes"
5. Search for "[technology] production tips"
6. Check security advisories and CVE databases if applicable

**Deliverable**: Synthesized findings with source attribution, focusing on actionable insights that will inform our implementation decisions.
</Task>
```

#### For Implementation Pattern Extraction:
```markdown
<Task subagent_type="implementation-pattern-extractor" description="Extract concrete codebase patterns">
**Research Topic**: [Component/Feature/Pattern being researched]
**Task Context**: [Brief description of what we're trying to implement]
**Task Type**: [bug|feature|refactor|test]
**Technologies**: [Inferred technologies/frameworks]

**Your mission**: Find concrete implementation examples from THIS codebase that directly inform how to implement this task.

**Search for**:
1. **Similar Feature Implementations**:
   - How are similar features currently implemented? (file:line references)
   - What patterns are used consistently?
   - What's the dominant approach?

2. **Project-Specific Conventions**:
   - Naming conventions (functions, files, variables)
   - File organization and structure patterns
   - Import/export patterns
   - Type definitions and usage
   - Error handling approaches

3. **Reusable Code Patterns**:
   - Copy-pasteable code snippets from similar features
   - Function signatures that handle similar tasks
   - Middleware/decorator/hook patterns
   - Configuration patterns

4. **Testing Patterns**:
   - How are similar features tested?
   - What testing framework and patterns are used?
   - Mock/fixture patterns
   - Test file organization

5. **Inconsistencies**:
   - Multiple ways of doing the same thing
   - Legacy vs modern patterns
   - Areas where standards aren't followed

**Search strategy**:
1. Use Glob to find relevant files (e.g., `**/*auth*.ts`)
2. Use Grep or ripgrep to find patterns in files
3. Read complete files to get full context
4. Check git history for evolution of patterns

**Return format**:
```yaml
implementation_patterns:
  pattern_type: string
  primary_pattern:
    name: string
    description: string
    locations: [{file, lines, purpose}]
    code_snippet: |
      [Actual code from codebase]
    usage_frequency: dominant|common|occasional
    recency: recent|established|legacy
    key_conventions: [list]
    testing_pattern: {test_file, test_approach}

  alternative_patterns: [...]
  project_conventions: {naming, structure, types, error_handling}
  reusable_snippets: [{title, purpose, code, source, adaptation_needed}]
  testing_patterns: [...]
  inconsistencies_detected: [{area, examples, recommendation}]
  gaps_identified: [...]

metadata:
  files_analyzed: number
  patterns_extracted: number
  directories_searched: [list]
  confidence: 1-10
```

**Quality requirements**:
- Every pattern MUST have file:line references
- Include actual code snippets (not pseudocode)
- Identify the dominant/canonical pattern clearly
- Flag inconsistencies honestly with impact assessment
- Include testing patterns for similar features
- Calculate confidence based on pattern consistency

**Deliverable**: Complete YAML with concrete, copy-pasteable patterns from THIS codebase.
</Task>
```

#### For Deep Systems Analysis (Specialized Agent):
```markdown
<Task subagent_type="apex:systems-researcher" description="Map component relationships">
**Focus Area**: [Component or subsystem]

Please trace execution flow, dependencies, state transitions, and integration points.
Include file:line references, data flow notes, and any implicit contracts.
</Task>
```

#### For Git History Intelligence (Specialized Agent):
```markdown
<Task subagent_type="apex:git-historian" description="Analyze git history for [topic]">
Scope: [files/directories]
Window: [e.g., "9 months"]
Highlights needed: regressions, reverts, maintainers, architectural shifts.
</Task>
```

#### For Forward-Looking Risk Discovery (Specialized Agent):
```markdown
<Task subagent_type="apex:risk-analyst" description="Surface forward-looking risks">
Inputs: Task brief, context pack excerpts, architecture decisions.
Deliver risk matrix, edge cases, monitoring gaps, and mitigation recommendations.
</Task>
```

### 4.3 Wait and Synthesize All Findings

**CRITICAL**: Wait for ALL sub-agents to complete before proceeding.

```yaml
synthesis_approach:
  collect_results:
    - APEX patterns from intelligence-gatherer (abstract cross-project patterns)
    - Web research from web-researcher (official docs, best practices, security)
    - Implementation patterns from implementation-pattern-extractor (concrete codebase examples)
    - Systems intelligence from systems-researcher (architecture, dependencies)
    - Git history insights from git-historian (evolution, lessons)
    - Forward-looking risks from risk-analyst (edge cases, mitigations)
    - Architecture patterns from validation agents (constraints, requirements)

  prioritize_findings:
    - Live codebase = primary truth (what actually exists)
    - Implementation patterns = concrete project conventions and working code
    - Official documentation = authoritative reference for frameworks/APIs
    - APEX patterns = proven solutions from cross-project experience
    - Best practices = industry consensus and validation
    - Git history = evolution understanding and lessons learned
    - Architecture patterns = design constraints and insights

  connect_insights:
    - Validate APEX patterns against actual codebase implementations
    - Cross-reference implementation patterns with official recommendations
    - Verify best practices are actually used in the codebase
    - Identify gaps between current code and APEX/external patterns
    - Flag inconsistencies between codebase patterns and best practices
    - Note security concerns from web research against actual implementation
    - Resolve contradictions (priority: codebase reality > official docs > APEX patterns > opinions)
    - Build complete picture with internal and external validation
```

## Step 5: Create Research Document

### 5.1 Gather Metadata

```bash
# Get git information
git_commit=$(git rev-parse HEAD)
git_branch=$(git branch --show-current)
repo_name=$(basename $(git rev-parse --show-toplevel))
current_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
```

### 5.2 Write Research Document

**Path**: `~/.apex/plans/research_[TASK_ID].md`

```markdown
---
date: [Current ISO timestamp]
researcher: Claude
git_commit: [Commit hash]
branch: [Branch name]
repository: [Repo name]
task_id: [TASK_ID if applicable]
topic: "[Research Topic/Question]"
tags: [research, codebase, patterns, relevant-components]
status: complete
agents_deployed: [N]
files_analyzed: [X]
confidence_score: [0-10]
---

# Research: [Topic/Question]

**Date**: [ISO timestamp]
**Repository**: [Repo name]
**Branch**: [Branch] @ [Commit]
**Research Coverage**: [N] agents, [X] files analyzed

## Research Question

[Original user query or task description]

## Executive Summary

[2-3 paragraphs synthesizing ALL findings - codebase, patterns, history]

## Web Research Findings

### Official Documentation
- **[Technology/Framework]**: [Latest version, key updates]
  - Official docs: [URL]
  - Key insights: [3-5 bullets from official docs]
  - Breaking changes: [Any relevant breaking changes]

### Industry Best Practices
| Practice | Source | Reasoning | Adoption |
|----------|--------|-----------|----------|
| [Practice 1] | [Official/Expert/Community] | [Why recommended] | [Widely adopted/Emerging] |
| [Practice 2] | [Source] | [Reasoning] | [Status] |

### Security & Reliability Findings
- **[Security concern/CVE]**: [Description]
  - Severity: [High/Medium/Low]
  - Mitigation: [Recommended approach]
  - Source: [URL]

### Recent Changes & Deprecations
- **[Version/Date]**: [What changed]
  - Impact on our implementation: [Assessment]
  - Migration path: [If applicable]
  - Source: [URL]

### Gap Analysis
Comparing our codebase against latest documentation:
- ✅ **Aligned**: [Patterns we're following correctly]
- ⚠️ **Gaps**: [Areas where we differ from recommendations]
- 🔄 **Opportunities**: [Modern patterns we could adopt]

## Implementation Patterns from Codebase

### Primary Pattern
- **[Pattern Name]**: `[file.ts:123-145]`
  - Description: [2-3 sentence description]
  - Usage: [How commonly used - dominant/common/occasional]
  - Recency: [recent/established/legacy]
  - Code example:
    ```[language]
    [Actual code snippet from file]
    ```
  - Testing: `[test/file.spec.ts:67-89]` - [Testing approach]

### Project Conventions Discovered
| Convention | Pattern | Examples | Locations |
|------------|---------|----------|-----------|
| Function naming | [Pattern like "handle*"] | handleAuth, handleError | [file:line] |
| File structure | [Pattern like "colocated tests"] | auth.ts + auth.test.ts | [directory] |
| Type patterns | [Pattern like "Result<T>"] | Result<User>, Result<void> | [file:line] |
| Error handling | [Pattern like "AppError extends Error"] | class ValidationError extends AppError | [file:line] |

### Reusable Code Snippets
1. **[Snippet Title]**: `[source-file.ts:45-78]`
   - Purpose: [What problem it solves]
   - Adaptation needed: [What to customize]
   - Code:
     ```[language]
     [Copy-pasteable snippet]
     ```

2. **[Another Snippet]**: `[file.py:123-156]`
   - Purpose: [What it does]
   - Code snippet available in findings

### Testing Patterns
- Framework: [Jest/pytest/etc.]
- Approach: [How similar features are tested]
- Example: `[test/auth.test.ts:23-67]`
- Conventions:
  - [Test organization pattern]
  - [Mocking approach]
  - [Assertion style]

### Inconsistencies Detected
| Area | Inconsistency | Impact | Recommendation |
|------|---------------|--------|----------------|
| [Error handling] | [3 different approaches found] | MEDIUM | [Use AppError (8/12 files)] |
| [API responses] | [JSON vs Result<T>] | LOW | [Migrate to Result<T>] |

### Pattern Confidence
- **Confidence Score**: [X]/10
- **Files Analyzed**: [N] files in [directories]
- **Dominant Pattern Coverage**: [Y]% of relevant files use primary pattern

## Codebase Analysis

### Primary Components
- **[Component A]**: `[file.ts:123-145]` - [What it does]
  - Key functions: [list]
  - Dependencies: [list]
  - Patterns: [observed patterns]
  - Alignment with docs: [How it compares to official recommendations]

- **[Component B]**: `[file.py:67-89]` - [Purpose]
  - Related files: [list with references]
  - Data flow: [how it connects]
  - Best practice validation: [Matches/differs from industry standards]

### Architecture Insights
[Patterns, conventions, and design decisions discovered in the code]

**Validation against external sources:**
- [How our patterns align with official recommendations]
- [Industry best practices we're following]
- [Potential improvements based on latest documentation]

### Code References
- `path/to/file.ts:123` - [Specific implementation]
- `another/file.py:45-67` - [Pattern example]
- `test/file.spec.js:234` - [Test approach]

## Pattern Intelligence (if applicable)

### APEX Patterns Discovered
| Pattern ID | Trust | Uses | Success | Relevance |
|------------|-------|------|---------|-----------|
| PAT:ERROR:HANDLING | ★★★★★ | 156 | 100% | Direct match |
| PAT:API:VALIDATION | ★★★★☆ | 89 | 92% | Partial match |

### Anti-Patterns Identified
- [Pattern]: [Why to avoid]
- [Pattern]: [Specific risk in this context]

## Git History Analysis

### Similar Changes
| Commit | Date | Author | Summary | Files Changed |
|--------|------|--------|---------|---------------|
| [SHA] | [Date] | [Author] | [Message] | [Files] |
| [SHA] | [Date] | [Author] | [Message] | [Files] |

### Code Evolution
1. **[Feature/Component]** evolution:
   - Initial implementation: [commit SHA] - [approach]
   - Refactored: [commit SHA] - [what changed and why]
   - Current state: [assessment]

### Lessons from History
- [Pattern that worked]: [commit reference]
- [Approach that failed]: [commit reference and why]
- [Key learning]: [what the history teaches us]

## Risk Analysis

### Identified Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk 1] | High/Med/Low | High/Med/Low | [Strategy] |
| [Risk 2] | High/Med/Low | High/Med/Low | [Strategy] |

### Dependencies & Constraints
- [Technical constraint]
- [Business rule]
- [Integration requirement]

## Recommendations - Tree of Thought Analysis

### Solution A: [Approach Name]
**Philosophy**: [Core principle of this approach]

**Implementation Path**:
1. [Step 1]: [What and why]
2. [Step 2]: [What and why]
3. [Step 3]: [What and why]

**Pros**:
- [Advantage 1]
- [Advantage 2]

**Cons**:
- [Disadvantage 1]
- [Disadvantage 2]

**Risk Level**: [Low/Medium/High]

### Solution B: [Alternative Approach]
**Philosophy**: [Different principle]

**Implementation Path**:
1. [Step 1]: [What and why]
2. [Step 2]: [What and why]
3. [Step 3]: [What and why]

**Pros**:
- [Advantage 1]
- [Advantage 2]

**Cons**:
- [Disadvantage 1]
- [Disadvantage 2]

**Risk Level**: [Low/Medium/High]

### Solution C: [Third Option]
**Philosophy**: [Yet another approach]

**Implementation Path**:
1. [Step 1]: [What and why]
2. [Step 2]: [What and why]
3. [Step 3]: [What and why]

**Pros**:
- [Advantage 1]
- [Advantage 2]

**Cons**:
- [Disadvantage 1]
- [Disadvantage 2]

**Risk Level**: [Low/Medium/High]

### Comparative Analysis
| Criteria | Solution A | Solution B | Solution C |
|----------|------------|------------|------------|
| Complexity | [Score] | [Score] | [Score] |
| Time to Implement | [Estimate] | [Estimate] | [Estimate] |
| Maintenance Burden | [Low/Med/High] | [Low/Med/High] | [Low/Med/High] |
| Scalability | [Assessment] | [Assessment] | [Assessment] |
| Risk | [Level] | [Level] | [Level] |

### Recommendation
**Preferred Solution**: [A/B/C]
**Reasoning**: [Why this solution wins based on research findings]
**Runner-up**: [A/B/C] - [Why it's second choice]

### Key Decisions Needed
- [Technical choice requiring input]
- [Design decision with trade-offs]

## Next Steps

1. Review findings with stakeholders
2. Create implementation plan: `/apex_plan`
3. Consider [specific investigation if needed]

## References

### GitHub Permalinks (if available)
- [Permalink to key implementation]
- [Permalink to similar pattern]

### APEX Context
- Task ID: [ID if applicable]
- Similar Tasks: [IDs with outcomes]
- Patterns: [Pattern IDs used]

### Documentation
- [External docs]
- [ADRs]
- [Related tickets]

---
*Generated by APEX Research Intelligence System*
*Task ID: [TASK_ID] | Confidence: [X]/10 | Cache Hit: [Y]%*
```

## Step 6: Add GitHub Permalinks (if applicable)

Generate permanent references when possible:

```bash
# Check if on main branch or commit is pushed
git_status=$(git status --porcelain)
current_branch=$(git branch --show-current)

if [[ "$current_branch" == "main" || "$current_branch" == "master" || -z "$git_status" ]]; then
    # Get repository information
    repo_info=$(gh repo view --json owner,name)

    # Convert file:line references to GitHub permalinks
    # Format: https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}
fi
```

Replace local references with permalinks in the document for permanent access.

## Step 7: Handle Follow-up Questions

If the user has follow-up questions:

1. **Update existing document** (don't create new one):
   - Update `last_updated` timestamp
   - Add `last_updated_note` to frontmatter
   - Add new section: `## Follow-up Research [timestamp]`

2. **Spawn targeted agents** for specific follow-up areas

3. **Append findings** to maintain complete context

## Important Notes

1. **Always Read First**: Read mentioned files FULLY before any analysis
2. **Parallel Agents**: Deploy multiple agents concurrently for efficiency
3. **Agent Types**: intelligence-gatherer, web-researcher, and implementation-pattern-extractor use special subagent_type; others are generic Tasks
4. **Comprehensive Research**: Not just APEX patterns - full codebase patterns, git history, AND external documentation/best practices
5. **Pattern Extraction Priority**: Always extract concrete implementation patterns from codebase with file:line references
6. **Web Research Priority**: Always include web research to validate against official docs and current best practices
7. **Concrete References**: Include specific file:line references, commit SHAs, documentation URLs, and actual code snippets
8. **Synthesis Focus**: Connect findings across all research dimensions INCLUDING codebase patterns and external validation
9. **Actionable Output**: Research should directly inform planning phase with Tree of Thought and reusable code snippets
10. **No Implementation**: This is research only - no code changes
11. **Git History**: Analyze commits for patterns and evolution
12. **GitHub Links**: Generate permalinks when possible
13. **Follow-ups Welcome**: Support iterative research in same document
14. **Source Attribution**: Always cite sources (file:line for code, URLs for external docs)
15. **Inconsistency Awareness**: Flag multiple implementation approaches honestly

## Success Indicators

✅ Research is complete when:
- All mentioned files have been read fully
- All parallel agents have completed their research
- Implementation patterns extracted with file:line references and actual code snippets
- Reusable code snippets identified for the task
- Project conventions documented (naming, structure, types, error handling)
- Testing patterns discovered for similar features
- Web research has validated against official documentation and best practices
- APEX patterns have been analyzed (if applicable)
- Git history has been examined for similar changes
- Security concerns and deprecations have been identified
- Gap analysis completed (codebase vs. APEX patterns vs. latest standards)
- Inconsistencies in codebase flagged with recommendations
- Three solution approaches have been generated (Tree of Thought)
- Risks have been identified with mitigations
- Research document has been created at ~/.apex/plans/
- Document includes commit SHAs, file:line references, code snippets, and documentation URLs

## Common Patterns

### For Bug Fixes:
- **Web research**: Search for known issues, CVEs, and bug reports in official trackers
- Search git history for similar bug fixes with `git log --grep="fix"`
- Identify fix patterns from APEX pattern_cache
- Check what commits introduced the bug with `git bisect` or `git blame`
- Validate fix approaches against official documentation
- Generate three fix approaches using Tree of Thought

### For New Features:
- **Web research**: Find official examples, recommended patterns, and migration guides
- Analyze git history for similar feature additions
- Discover architecture patterns in existing code
- Find integration points via dependency analysis
- Check for framework updates that might affect implementation
- Propose three implementation strategies validated against best practices

### For Refactoring:
- **Web research**: Identify latest patterns, deprecations, and recommended migrations
- Study evolution via `git log -p -- [file/directory]`
- Analyze why previous refactoring attempts succeeded/failed
- Find patterns that have proven stable over time
- Check for breaking changes in dependencies
- Create three refactoring approaches with risk assessment

### For Dependency Updates:
- **Web research**: Check changelogs, migration guides, and breaking changes
- Review security advisories and CVEs
- Find community migration experiences (GitHub issues, discussions)
- Identify deprecation warnings and replacement APIs
- Validate compatibility with existing codebase patterns

## Integration with Next Phases

The research document serves as input for:
- `/apex_plan`: Uses pattern intelligence for architecture decisions
- `/apex_execute`: References risk mitigations and patterns
- `apex_reflect`: Validates predictions against actual outcomes

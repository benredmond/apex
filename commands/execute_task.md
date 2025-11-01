# Execute.Task - Process Tasks with APEX Intelligence

**Domain**: Execution
**Purpose**: Implement tasks using intelligent 5-phase workflow with PatternPack integration
**Hierarchy**: Works on tasks from ANY source (text, issues, files)

## Quick Reference

**When to use**: Implementing any development task (features, bugs, refactors)
**Typical duration**: 1-4 hours depending on complexity
**Complexity**: Adaptive (uses intelligence to determine approach)
**Prerequisites**: Task source (text, issue ID, file path, or database ID)
**Output**: Completed implementation with tests and documentation

## Core Workflow

**CREATE A TODO LIST** with exactly these 6 items:

1. Analyse scope from argument (what kind of input?)
2. Identify or create task (get it into database)
3. Optimize and improve prompt (enhance clarity and specificity)
4. Execute Comprehensive Intelligence & Context Assembly
5. Set status to in_progress (begin phase workflow)
6. Execute phases until task complete

**Phase Progression**: ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER

<system-reminder>
**🚨 PHASE DISCIPLINE IS MANDATORY - NO EXCEPTIONS 🚨**

ALL 5 PHASES MUST BE EXECUTED IN ORDER. YOU CANNOT SKIP PHASES.

**Common Violations (DO NOT DO THESE)**:
❌ "Tests passing, jumping to apex_task_complete" → VIOLATION: skipped VALIDATOR, REVIEWER, DOCUMENTER
❌ "Code works, calling apex_task_complete" → VIOLATION: skipped VALIDATOR, REVIEWER, DOCUMENTER
❌ "Already ran tests during BUILDER" → VIOLATION: running tests ≠ VALIDATOR phase execution

**The Rule**:
- Each phase has a mandatory checkpoint via apex_task_checkpoint
- apex_task_complete can ONLY be called from DOCUMENTER phase
- If current_phase ≠ DOCUMENTER, apex_task_complete is FORBIDDEN

**Why This Matters**:
- VALIDATOR: Catches regressions and integration issues
- REVIEWER: Ensures code quality and maintainability
- DOCUMENTER: Updates documentation and captures learnings

Skipping phases leads to: documentation debt, missed quality issues, and fabricated pattern claims.

IMPORTANT: Subagents MUST NOT create .md files or documentation files in any phase except DOCUMENTER. They should return their analysis as structured text responses only.
</system-reminder>

## 🔧 Shared Templates & Patterns

### Phase Gate Validation Template

<phase-gate-template>
**MANDATORY PHASE GATE CHECK** (applies to ALL phases):

1. Call apex_task_context(taskId) to get current phase from database
2. Verify response.task_data.phase matches the phase you're about to execute
3. If mismatch: STOP - you are in wrong phase or skipped required phases
4. Proceed only if phase matches

**ENFORCEMENT**:
- Task identification (Step 1-3) must complete before intelligence gathering (Step 4)
- Intelligence gathering must complete before ARCHITECT
- ARCHITECT must complete before BUILDER
- BUILDER must complete before VALIDATOR
- VALIDATOR must complete before REVIEWER
- REVIEWER must complete before DOCUMENTER
- apex_task_complete can ONLY be called from DOCUMENTER

**Phase Check Code Pattern**:
```
context = apex_task_context(taskId)
current_phase = context.task_data.phase
if current_phase != "EXPECTED_PHASE":
    STOP - wrong phase, cannot proceed
```
</phase-gate-template>

### Phase Execution Template

<phase-execution-template>
FOR EACH PHASE:
1. **GATE CHECK**: Use phase-gate-template to verify you're in correct phase
2. Record checkpoint: apex_task_checkpoint(taskId, "Starting {phase}", confidence)
3. Apply context_pack intelligence per phase mapping (see below)
4. Execute phase-specific actions (see individual phase sections)
5. Record evidence: apex_task_append_evidence per template
6. Transition: apex_task_update({id: taskId, phase: nextPhase, handoff})
</phase-execution-template>

### Pattern Application Template

<pattern-application-template>
When using patterns from context_pack:
- Check trust score: ★★★★☆+ = apply confidently, ★★★☆☆ = apply with caution
- Document usage: # [PATTERN_ID] ★★★★☆ (X uses, Y% success) - From cache
- Track effectiveness for apex_reflect reporting
- Apply high-trust patterns (★★★★☆+) with confidence
- Question lower-trust patterns (<★★★☆☆)
</pattern-application-template>

### Evidence Collection Template

<evidence-collection-template>
Call apex_task_append_evidence with:
- task_id: The taskId
- type: "pattern" | "error" | "decision" | "learning" | "file"
- content: Brief description of what's being recorded
- metadata: Include relevant details (pattern IDs, file paths, error messages)
</evidence-collection-template>

### Subagent Orchestration Template

<subagent-orchestration-template>
<Task subagent_type="{agent_type}" description="{brief_description}">
# {Phase} Mission - {Mental Model}

**Task ID**: {taskId}
**Context**: {phase_specific_context from context_pack}

**Your {Philosophy/Mandate}**:
{Phase-specific mindset and approach}

**Key Priorities**:

1. {Priority 1 specific to phase}
2. {Priority 2 specific to phase}
3. {Priority 3 specific to phase}

**Return**: {Expected structured output}
</Task>
</subagent-orchestration-template>

### Context Pack Intelligence Mapping

<context-pack-mapping>
ARCHITECT: Use context_pack.implementation_patterns + web_research + pattern_cache.architecture + execution_strategy
  - Reference concrete codebase examples from implementation_patterns
  - Apply project conventions from implementation_patterns
  - Validate design against official docs and best practices
  - Apply security considerations from web research
  - Check for deprecated patterns and breaking changes

BUILDER: Use context_pack.implementation_patterns + pattern_cache.implementation + predicted_failures + web_research.avoid_patterns
  - Primary reference: concrete code examples from implementation_patterns.reusable_snippets
  - Follow project_conventions from implementation_patterns
  - Apply APEX patterns from pattern_cache
  - Reference official examples from web research
  - Apply security mitigations from alerts

VALIDATOR: Use context_pack.implementation_patterns.testing_patterns + pattern_cache.testing + parallelization_opportunities
  - Follow testing patterns discovered in codebase
  - Validate against testing best practices from web research

REVIEWER: Use context_pack.implementation_patterns + execution_strategy.recommended_approach + all patterns + web_research.gap_analysis
  - Verify consistency with project_conventions from implementation_patterns
  - Check for inconsistencies flagged by pattern extractor
  - Verify alignment with official recommendations
  - Check for security concerns flagged in web research

DOCUMENTER: Use all context_pack data for reflection and learning capture
  - Document implementation patterns discovered
  - Document external validation and sources
  - Note inconsistencies and resolutions
</context-pack-mapping>

## 1 · Analyse scope from argument

<$ARGUMENTS> ⇒ Can be:

- **Text description**: "implement dark mode toggle" → Create task from description
- **Linear/JIRA ID**: "APE-59" or "PROJ-123" → Fetch from issue tracker
- **Markdown file path**: "T026_feature.md" or ".apex/03_ACTIVE_SPRINTS/S02/T026.md" → Read file
- **Database task ID**: "dS2y_DqSHdRpcLO5GYSIy" → Use existing task
- **Empty**: Use user's current request as task intent

## 2 · Identify or Create Task

**Determine task source and get/create task:**

### If Linear/JIRA ID (e.g., "APE-59"):

1. Use MCP or similar to fetch details
2. Extract title, description, type from issue
3. Infer tags from issue labels, components, or content
4. Call apex_task_create with:
   - intent: Issue title + description
   - type: Inferred from issue (bug, feature, etc.)
   - identifier: The Linear/JIRA ID (e.g., "APE-59")
   - tags: Extracted/inferred tags (e.g., ["api", "performance", "critical"])

### If markdown file path:

1. Use Read tool to get file content
2. Parse frontmatter and content for task details
3. Extract tags from frontmatter or infer from content
4. Call apex_task_create with:
   - intent: Parsed content
   - type: From frontmatter or inferred
   - identifier: Filename without extension (e.g., "T026_feature")
   - tags: From frontmatter or inferred (max 15 tags)

### If database task ID (long alphanumeric):

1. Call apex_task_find to retrieve existing task
2. Use returned task details
3. Skip to intelligence gathering if found

### If text description or empty:

1. Analyze the description to infer relevant tags
2. Call apex_task_create with:
   - intent: The text or user's request
   - type: Inferred from content
   - identifier: Generate a short, descriptive ID (e.g., "dark-mode-toggle")
   - tags: Inferred from description (e.g., ["ui", "frontend", "settings"])

### Task Creation Best Practices

**Always provide all fields to apex_task_create**:

- `identifier`: Short, descriptive kebab-case ID (e.g., "auth-fix", "dark-mode")
- `tags`: Array of relevant categories (max 15, e.g., ["api", "auth", "critical"])
- `type`: Task classification (bug, feature, test, refactor, docs, perf)

**Smart tag inference** - analyze content for: technology, domain, component, priority

<good-example>
Intent: "Fix authentication timeout issue in admin dashboard"
→ identifier: "auth-timeout-fix", type: "bug", tags: ["auth", "admin", "backend"]
</good-example>

**Result**: Store `taskId` and `brief` for all subsequent operations.

## 3 · Optimize and Improve Prompt

**PURPOSE**: Enhance the task's intent/brief for maximum clarity and effectiveness.

### When to Apply Optimization:

- Always when task brief/intent is vague or incomplete
- When Linear/JIRA descriptions need clarification
- When task descriptions need structuring
- Skip only if task already has crystal-clear, well-structured brief

### Intelligent Prompt Rewriting Process

```yaml
optimization_steps:
  1. Clarify_Intent:
    - Extract core objective
    - Identify implicit requirements
    - Resolve ambiguities

  2. Add_Specificity:
    - Define success criteria
    - Add constraints and boundaries
    - Specify expected outputs

  3. Structure_Requirements:
    - Break down complex asks into clear steps
    - Prioritize requirements (must-have vs nice-to-have)
    - Add technical context if missing

  4. Include_Testing:
    - Add test requirements explicitly
    - Define coverage expectations
    - Specify validation criteria
```

### Enhancement Examples

<good-example>
original: "add dark mode"

improved: |
Implement dark mode theme toggle for the application.

Technical Requirements:

- Create theme context/provider for global theme state
- Implement CSS variables or theme system for colors
- Add toggle component in settings/header
- Persist theme preference in localStorage
- Ensure all components support both themes
- Handle system preference detection

Acceptance Criteria:

- Toggle switches between light/dark themes instantly
- Theme preference persists across sessions
- Respects system dark mode preference on first visit
- All UI elements have appropriate dark mode colors
- No contrast/accessibility issues in either theme
- Tests cover theme switching and persistence
  </good-example>

<good-example>
original: "refactor the API"

improved: |
Refactor REST API to improve performance and maintainability.

Scope:

- Analyze current API performance bottlenecks
- Implement consistent error handling patterns
- Add request/response validation middleware
- Standardize endpoint naming conventions
- Optimize database queries (eliminate N+1 problems)
- Add comprehensive API documentation

Constraints:

- Maintain backward compatibility for v1 endpoints
- Zero downtime deployment required
- Complete within current sprint (5 days)

Deliverables:

- Refactored API code with consistent patterns
- Performance improvement metrics (target: 30% faster)
- Updated API documentation
- Migration guide for deprecated endpoints
- Test coverage > 80% for refactored endpoints
  </good-example>

<bad-example>
original: "fix login bug"
improved: "fix the login bug that users reported" # Still lacks specifics!
</bad-example>

### Pattern-Based Enhancement

If patterns are relevant, enhance the prompt with pattern context:

- Identify applicable patterns from task description
- Add pattern references to improved prompt
- Include anti-patterns to avoid
- Reference similar successful tasks

**Store Enhanced Prompt**: Use as working brief for all subsequent steps.

## 4 · Execute Comprehensive Intelligence & Context Assembly

<phase-execution>
**MANDATORY PREREQUISITE CHECK**:

Before starting intelligence gathering:
1. Verify taskId exists from Step 2 (task must be in database)
2. Verify enhanced brief exists from Step 3 (prompt optimization complete)
3. If either missing, STOP - complete task identification first (Steps 1-3)

Intelligence gathering requires a database task with optimized brief.
Do NOT proceed without completing Steps 1-3.
</phase-execution>

Record initial checkpoint:

```
apex_task_checkpoint(taskId, "Starting intelligence gathering phase", confidence)
```

### 🧠 Intelligence Orchestration

<system-reminder>
This phase is CRITICAL - it prevents costly mistakes by uncovering hidden risks, contradictions, and historical failures BEFORE implementation begins.
</system-reminder>

**IMPORTANT**: Read any directly mentioned files FULLY before spawning agents:
- If the user mentions specific files (tickets, docs, JSON), read them FULLY first
- Use the Read tool WITHOUT limit/offset parameters to read entire files
- Read these files yourself in the main context before spawning any sub-tasks
- This ensures you have full context before decomposing the research

### Parallel Intelligence Operations

Deploy multiple research agents concurrently for comprehensive intelligence gathering:

```markdown
# Launch these agents in PARALLEL (single message with multiple Task calls):

# 1. APEX Pattern Intelligence - Uses specialized subagent
<Task subagent_type="apex:intelligence-gatherer" description="APEX pattern discovery and task context">
# APEX Intelligence Mission

**Task ID**: [TASK_ID from step 2]
**Enhanced Brief**: [The optimized brief from step 3]

**Priorities**:
1. Find similar tasks in APEX history
2. Discover high-trust patterns for this task type
3. Identify predicted failures from historical data
4. Generate execution strategy with pattern intelligence
5. Load relevant context with surgical precision

**Key Questions**:
- What similar tasks succeeded/failed and why?
- Which patterns have ★★★★☆+ trust for this context?
- What anti-patterns must we avoid?
- What failures were predicted for similar tasks?

**Return**: Complete context pack with pattern intelligence and execution strategy
</Task>

# 2. Web Research - Uses specialized subagent for external validation
<Task subagent_type="apex:web-researcher" description="Research latest documentation and best practices">
# Web Research Mission

**Task Context**: [Brief description from step 3]
**Technologies/Frameworks**: [Inferred from task description]

**Your mission**: Find authoritative, current information to validate our approach.

**Search for**:
1. **Official Documentation**:
   - Latest API documentation for relevant frameworks/libraries
   - Migration guides and breaking changes
   - Official examples matching our use case
   - Deprecation notices

2. **Best Practices**:
   - Recommended patterns for this type of task
   - Security considerations (especially for auth, API, data handling)
   - Performance optimization guidelines
   - Testing strategies

3. **Community Intelligence**:
   - Recent GitHub issues for similar problems
   - Stack Overflow solutions (2024-2025, highly-voted)
   - Known bugs or gotchas in dependencies
   - Production experience reports

4. **Security & Reliability**:
   - CVEs or security advisories
   - Common pitfalls and edge cases
   - Error handling patterns
   - Production-ready implementations

**Quality filters**:
- Prioritize official docs over blog posts
- Prefer recent content (last 12 months)
- Verify information across multiple sources
- Focus on production-ready solutions

**Return format**:
```yaml
official_docs:
  - url: [URL]
    key_points: [3-5 actionable insights]
    relevance: [How it applies to our task]

best_practices:
  - practice: [Description]
    source: [URL or consensus]
    why_matters: [Impact on our implementation]

security_alerts:
  - issue: [Description]
    severity: [High/Medium/Low]
    mitigation: [What we should do]

avoid_patterns:
  - pattern: [What NOT to do]
    reason: [Why it fails]
    source: [Documentation or experience]
```

**Search strategy**:
1. Official docs for mentioned frameworks/libraries
2. GitHub repos (issues, discussions, recent commits)
3. "[technology] best practices 2024/2025"
4. "[technology] common mistakes production"
5. Security advisories if applicable

**Deliverable**: Synthesized findings that validate or challenge our approach, with source attribution.
</Task>

# 3. Implementation Pattern Extraction - Uses specialized subagent for codebase patterns
<Task subagent_type="apex:implementation-pattern-extractor" description="Extract concrete implementation patterns">
# Pattern Extraction Mission

**Task Context**: [Enhanced brief from step 3]
**Task Type**: [Inferred from task - bug|feature|refactor|test]
**Technologies**: [Inferred from task description]

**Your mission**: Find concrete implementation examples from THIS codebase that directly inform how to implement this task.

**Priorities**:
1. Find how similar features are CURRENTLY implemented (with file:line references)
2. Extract reusable patterns specific to this project
3. Identify project conventions (naming, structure, types, error handling)
4. Flag inconsistencies or variations in approach
5. Find testing patterns for similar features

**Search strategy**:
1. Use Glob to find relevant files (e.g., `**/*auth*.ts`)
2. Use Grep or ripgrep (via Bash) for pattern searches
3. Read complete files for full context
4. Check git history for pattern evolution

**Return format**: Complete YAML with:
- implementation_patterns (primary + alternatives)
- project_conventions (naming, structure, types, error_handling)
- reusable_snippets (with file:line sources and actual code)
- testing_patterns (how similar features are tested)
- inconsistencies_detected (flagged variations with recommendations)
- metadata (confidence, files_analyzed)

**Quality requirements**:
- Every pattern MUST have file:line references
- Include actual code snippets (not pseudocode)
- Identify the dominant/canonical pattern
- Flag inconsistencies honestly
- Include testing patterns

**Deliverable**: Complete YAML with concrete, copy-pasteable examples from THIS codebase.
</Task>

# 4. Systems Analysis
<Task subagent_type="apex:systems-researcher" description="Trace component and dependency flow">
**Scope**: [Components inferred from brief]

Map execution paths, data flow, integration points, and hidden dependencies. Provide file:line references and highlight contracts or invariants we must respect.
</Task>

# 5. Git History Intelligence
<Task subagent_type="apex:git-historian" description="Analyze git history for similar changes">
Scope: [Directories/files]
Window: [e.g., "9 months"]
Focus on regressions, reverts, architectural milestones, churn hotspots, and current maintainers.
</Task>

# 6. Forward-Looking Risk Analysis - Specialized agent
<Task subagent_type="apex:risk-analyst" description="Surface upcoming risks and edge cases">
Inputs: Task brief, context pack snapshot, architecture notes.
Deliver risk matrix, edge-case scenarios, monitoring gaps, and mitigation recommendations.
</Task>
```

**CRITICAL**: Wait for ALL sub-agents to complete before proceeding. Synthesize findings from all sources.

### Intelligence Synthesis

After all agents complete, synthesize findings:

```yaml
synthesis_approach:
  collect_results:
    - APEX patterns and context pack from intelligence-gatherer (abstract cross-project patterns)
    - Web research findings (official docs, best practices, security)
    - Implementation patterns from implementation-pattern-extractor (concrete codebase examples)
    - Systems intelligence from systems-researcher (architecture, dependencies)
    - Git history insights from git-historian (evolution, lessons)
    - Architecture constraints from architecture-validator (requirements, constraints)
    - Forward-looking risks from risk-analyst (edge cases, mitigations)

  prioritize_findings:
    - Live codebase = primary truth source (what actually exists)
    - Implementation patterns = concrete project conventions and working code
    - Official documentation = authoritative reference for frameworks/APIs
    - APEX patterns = proven solutions from cross-project experience
    - Best practices = industry consensus and validation
    - Git history = evolution understanding and lessons learned
    - Architecture = design constraints and requirements
    - Risks = preventive measures to implement

  connect_insights:
    - Validate APEX patterns against actual codebase implementations
    - Cross-reference implementation patterns with official recommendations
    - Verify best practices are actually used in the codebase
    - Identify gaps between current code and APEX/external patterns
    - Flag inconsistencies between codebase patterns and best practices
    - Note security concerns from web research against actual implementation
    - Align proactive risk mitigations with historical failure predictions
    - Flag deprecated patterns or breaking changes
    - Resolve contradictions (priority: codebase reality > official docs > APEX patterns > opinions)
    - Build complete picture for implementation with internal and external validation
    - Update context pack with synthesized intelligence including implementation patterns
```

The synthesized intelligence forms a complete context pack (store as evidence):

### 📦 Context Pack Structure (Reference)

```yaml
context_pack:
  task_analysis:
    id, title, type, complexity, validation_status, current_phase

  web_research:
    official_docs: [urls with key insights and relevance]
    best_practices: [practices with sources and reasoning]
    security_alerts: [issues with severity and mitigation]
    avoid_patterns: [anti-patterns from external sources]
    framework_version: [latest versions and breaking changes]
    gap_analysis: [differences between our code and recommendations]

  implementation_patterns:
    primary_patterns: [patterns with code examples and file:line refs]
    project_conventions: [naming, structure, types, error_handling]
    reusable_snippets: [copy-pasteable code with sources]
    testing_patterns: [how to test similar features]
    inconsistencies: [variations flagged with recommendations]
    confidence: [1-10 based on pattern consistency]
    files_analyzed: [count]

  pattern_cache:
    architecture: [patterns with trust scores]
    implementation: [patterns with trust scores]
    testing: [patterns with trust scores]
    fixes: [patterns with trust scores]
    anti_patterns: [patterns to avoid]

  loaded_context:
    files: [path, tokens, relevance, purpose]
    total_tokens, token_budget

  historical_intelligence:
    similar_tasks: [with learnings]
    system_history: [changes, migrations]
    predicted_failures: [with prevention strategies]

  validation_results:
    requirements_complete, missing_requirements
    ambiguities_resolved, assumptions_verified
    external_validation: [alignment with official docs and best practices]

  execution_strategy:
    recommended_approach, gemini_integration
    parallelization_opportunities
    security_considerations: [from web research]

  metadata:
    intelligence_timestamp, confidence_score, cache_hit_rate
```

### 📊 Display Intelligence Report to User

After receiving the context pack, display a comprehensive intelligence report to the user showing how well APEX intelligence is performing:

```markdown
## 🧠 Intelligence Report for Task: {context_pack.task_analysis.title}

### 📊 Intelligence Performance

- **Cache Hit Rate**: {context_pack.metadata.cache_hit_rate}% (patterns found in cache vs new lookups)
- **Pattern Coverage**: {total_patterns_found} patterns found for this task type
- **Historical Match**: {similar_tasks_count} similar tasks found with {avg_relevance}% relevance
- **Confidence Score**: {context_pack.metadata.confidence_score}/10 (overall intelligence confidence)

### 🌐 Web Research Intelligence

**Official Documentation Validated**:
{for each doc in context_pack.web_research.official_docs:}
- {doc.title}: {doc.key_points[0]} ([source]({doc.url}))

**Best Practices Identified**: {context_pack.web_research.best_practices.length} industry patterns found
{for top 3 best practices:}
- {practice.practice} (Source: {practice.source})

**Security Alerts**: {context_pack.web_research.security_alerts.length} security considerations
{if any high severity:}
⚠️ **High Priority**: {alert.issue} - {alert.mitigation}

**Gap Analysis**:
- ✅ **Aligned with standards**: {aligned_count} patterns validated
- ⚠️ **Needs attention**: {gap_count} areas differ from recommendations
- 🔄 **Deprecated patterns**: {deprecated_count} patterns to update

**External Validation**: {context_pack.validation_results.external_validation}

### 📝 Implementation Patterns from Codebase

**Primary Pattern Identified**:
- {context_pack.implementation_patterns.primary_patterns[0].name}
- Location: `{file:line}`
- Usage: {usage_frequency} ({confidence}/10 confidence)

**Project Conventions**: {context_pack.implementation_patterns.project_conventions.length} conventions discovered
{for top conventions:}
- {convention_category}: {pattern_description}

**Reusable Snippets**: {context_pack.implementation_patterns.reusable_snippets.length} ready-to-use code snippets
- Snippets available with file:line references for adaptation

**Testing Patterns**: {context_pack.implementation_patterns.testing_patterns.length} testing approaches found
- Framework: {primary_test_framework}
- Approach: {testing_pattern_description}

**Inconsistencies Flagged**: {context_pack.implementation_patterns.inconsistencies.length} variations detected
{if any high-impact inconsistencies:}
⚠️ **High Impact**: {inconsistency.area} - {inconsistency.recommendation}

**Pattern Analysis**:
- Files analyzed: {context_pack.implementation_patterns.files_analyzed}
- Confidence: {context_pack.implementation_patterns.confidence}/10
- Coverage: {dominant_pattern_coverage}% of files use primary pattern

### 🎯 Pattern Intelligence

**High-Trust Patterns (★★★★☆+):**
{for each pattern in context_pack.pattern_cache with trust >= 4:}

- {pattern.id} ★{trust_stars} ({pattern.usage_count} uses, {pattern.success_rate}% success)

**Applicable Patterns**: {total_applicable} patterns matched this context
**Anti-patterns Identified**: {context_pack.pattern_cache.anti_patterns.length} internal + {context_pack.web_research.avoid_patterns.length} external patterns to avoid
**Success Prediction**: Based on {similar_task_count} similar tasks with {avg_success_rate}% average success

### 📚 Historical Intelligence

**Similar Tasks Found**: {context_pack.historical_intelligence.similar_tasks.length}
{for top 3 similar tasks:}

- {task.title} ({task.similarity_score}% match) - Outcome: {task.outcome}
  Learning: {task.key_learning}

**Failure Patterns Detected**: {context_pack.historical_intelligence.predicted_failures.length}
{for each predicted failure with >50% probability:}

- {failure.description} ({failure.probability}% likely) → Prevention: {failure.prevention_strategy}

### ⚠️ Risk Analysis

**Complexity Assessment**: {context_pack.task_analysis.complexity}/10
**Validation Status**: {context_pack.validation_results.validation_status}
{if missing_requirements:}
**Missing Requirements**: {list missing requirements}
{if ambiguities:}
**Unresolved Ambiguities**: {list ambiguities}

### 🚀 Execution Strategy

**Recommended Approach**: {context_pack.execution_strategy.recommended_approach}
**Parallelization Opportunities**: {context_pack.execution_strategy.parallelization_opportunities.length} tasks can run concurrently
{if context_pack.execution_strategy.gemini_integration:}
**Gemini Integration**: Recommended for complexity {context_pack.task_analysis.complexity}/10

### 📈 Intelligence Metrics

- **Patterns in Cache**: {total_patterns_in_cache} total patterns available
- **Trust Score Distribution**:
  - ★★★★★: {five_star_count} patterns (100% reliable)
  - ★★★★☆: {four_star_count} patterns (80%+ success)
  - ★★★☆☆: {three_star_count} patterns (60%+ success)
  - ★★☆☆☆: {two_star_count} patterns (learning phase)
- **Context Loading**: {context_pack.loaded_context.files.length} files, {context_pack.loaded_context.total_tokens} tokens ({token_percentage}% of budget)
- **Intelligence Generation Time**: {time_elapsed} seconds

### 💡 Key Insights

{Generate 2-3 key insights based on the intelligence gathered, such as:}

- This task is similar to {previous_task} which succeeded using {pattern}
- High risk of {specific_failure} based on {evidence}
- Pattern {pattern_id} has 100% success rate for this type of task
```

**Implementation Notes for the Intelligence Report**:

1. Extract all metrics from the context_pack returned by intelligence-gatherer
2. Include web research findings with source attribution (URLs)
3. Calculate derived metrics (averages, percentages, counts) from the raw data
4. Format trust scores as star ratings (★) for visual clarity
5. Highlight security alerts and deprecated patterns from web research
6. Show gap analysis between codebase and official recommendations
7. Only show sections with meaningful data (skip empty sections)
8. Highlight critical warnings (validation blocked, high-risk predictions, security issues)
9. Keep the report concise but informative - focus on actionable intelligence

<critical-gate>
VALIDATION GATE: If validation_status is "blocked":
1. Document missing requirements
2. Report to user with actionable next steps
3. STOP execution - do not proceed

If validation_status is "ready":

- Continue to next step
- Context pack contains all validated information
  </critical-gate>

Store context pack as evidence:

```
apex_task_append_evidence(taskId, "decision", "Intelligence context pack generated", {full_context_pack})
```

## 5 · Set status to in_progress

Set initial phase to ARCHITECT:

```
apex_task_update({id: taskId, phase: "ARCHITECT"})
apex_task_append_evidence(taskId, "decision", "Task execution started", {execution_strategy, timestamp})
```

## 6 · Execute ARCHITECT phase

### 🏗️ ARCHITECT: Design Solutions That Last

You are the master planner. Your design decisions ripple through the entire implementation.

**Mental Model**: Think like an archaeologist AND architect - understand WHY before building.

**Your Mission**: Great architecture prevents problems, not just solves them. Future maintainers should thank you for your foresight.

<phase-execution>
**APPLY**: phase-gate-template with EXPECTED_PHASE = "ARCHITECT"

STOP if current phase ≠ ARCHITECT. Proceed ONLY after completing mandatory artifacts.
</phase-execution>

Record checkpoint:

```
apex_task_checkpoint(taskId, "ARCHITECT: Starting mandatory design analysis", 0.3)
```

### 🛑 MANDATORY ARCHITECTURE GATE

**YOU ARE FORBIDDEN TO PROCEED WITHOUT COMPLETING ALL ARTIFACTS**

### ⛔ REQUIRED ARTIFACTS - ZERO TOLERANCE

**You CANNOT write ANY architecture plans without producing:**

1. ✅ **Chain of Thought Analysis**
2. ✅ **Tree of Thought Solutions** (MINIMUM 3)
3. ✅ **Chain of Draft Evolution**
4. ✅ **YAGNI Declaration**
5. ✅ **Pattern Selection Rationale**

**VIOLATION = IMMEDIATE STOP**: If you catch yourself planning without artifacts, STOP and produce them.

---

## 📋 ARTIFACT 1: Chain of Thought Analysis

**First, investigate deeply**:

- WHY does the current implementation exist? (trace its history)
- WHAT problems did previous attempts encounter?
- WHO depends on this that isn't obvious?
- WHERE are the landmines? (what breaks easily?)

### MANDATORY OUTPUT FORMAT:

```yaml
chain_of_thought:
  current_state:
    what_exists:
      - [Component/file]: [Current purpose and state]
      - [Component/file]: [Current purpose and state]
    how_it_got_here:
      - [Git archaeology findings]
      - [Previous implementation attempts]
    dependencies:
      - [What depends on this]
      - [What this depends on]

  problem_decomposition:
    core_problem: [Single sentence]
    sub_problems: 1. [Specific issue needing solution]
      2. [Specific issue needing solution]
      3. [Specific issue needing solution]

  hidden_complexity:
    - [Non-obvious challenge discovered]
    - [Edge case from similar tasks]
    - [Pattern conflict identified]

  success_criteria:
    - [Measurable outcome 1]
    - [Measurable outcome 2]
    - [Measurable outcome 3]
```

**❌ VIOLATION**: "The task needs authentication" (vague)
**✅ COMPLIANT**: See structured format above with specifics

---

## 🌳 ARTIFACT 2: Tree of Thought Solutions

**Ask yourself**: "What patterns have succeeded here before? What would future maintainers thank me for?"

### MANDATORY: Generate EXACTLY 3 complete solutions

```yaml
tree_of_thought:
  solution_A:
    approach: [Concrete approach name]
    description: [2-3 sentences exactly]
    implementation:
      - Step 1: [Specific action]
      - Step 2: [Specific action]
      - Step 3: [Specific action]
    patterns_used: [PAT:IDs from context_pack]
    pros:
      - [Specific advantage]
      - [Specific advantage]
    cons:
      - [Specific disadvantage]
      - [Specific disadvantage]
    complexity: [1-10]
    risk: [LOW|MEDIUM|HIGH]
    time_estimate: [Realistic hours]

  solution_B: [Same structure - MUST be substantially different]

  solution_C: [Same structure - MUST be substantially different]

  comparative_analysis:
    winner: [A|B|C]
    reasoning: |
      [Why this solution wins - 2-3 sentences]
      [Specific evidence from context_pack]
    runner_up: [A|B|C]
    why_not_runner_up: [Specific reason]
```

**❌ VIOLATION**: Two similar solutions with minor variations
**✅ COMPLIANT**: Three fundamentally different architectural approaches

---

## 📝 ARTIFACT 3: Chain of Draft Evolution

**Think**: "How can this design prevent rather than handle errors?"

### MANDATORY: Show thinking evolution through 3 drafts

```yaml
chain_of_draft:
  draft_1_raw:
    core_design: |
      [Initial rough architecture - can be messy]
      [Shows first instinct approach]
    identified_issues:
      - [Problem with draft 1]
      - [Problem with draft 1]

  draft_2_refined:
    core_design: |
      [Refined architecture addressing draft 1 issues]
      [More structured than draft 1]
    improvements:
      - [What got better]
      - [What got better]
    remaining_issues:
      - [Still problematic]

  draft_3_final:
    core_design: |
      [Production-ready architecture]
      [All issues addressed]
    why_this_evolved: |
      [2-3 sentences on evolution]
    patterns_integrated:
      - [Pattern ID]: [How it shaped design]
      - [Pattern ID]: [How it shaped design]
```

---

## 🚫 ARTIFACT 4: YAGNI Declaration

**Remember**: "What edge cases will only appear in production?" Focus on those, exclude everything else.

### MANDATORY: Document what you're NOT implementing

```yaml
yagni_declaration:
  explicitly_excluding:
    - feature: [Feature name]
      why_not: [Specific reason]
      cost_if_included: [Time/complexity cost]

    - feature: [Feature name]
      why_not: [Specific reason]
      cost_if_included: [Time/complexity cost]

  preventing_scope_creep:
    - [Tempting addition]: [Why resisting]
    - [Tempting addition]: [Why resisting]

  future_considerations:
    - [Could add later]: [When it would make sense]
    - [Could add later]: [When it would make sense]

  complexity_budget:
    allocated: [1-10 complexity points]
    used: [Points used by chosen solution]
    reserved: [Points kept in reserve]
```

**❌ VIOLATION**: "Keeping it simple" (vague)
**✅ COMPLIANT**: Specific features excluded with reasons

---

## 🎯 ARTIFACT 5: Pattern Selection Rationale

### MANDATORY: Justify every pattern choice using context pack

```yaml
pattern_selection:
  applying:
    - pattern_id: [PAT:CATEGORY:NAME from context_pack]
      trust_score: [★ rating]
      usage_stats: [X uses, Y% success]
      why_this_pattern: [Specific reason]
      where_applying: [Specific location]

  considering_but_not_using:
    - pattern_id: [PAT:CATEGORY:NAME]
      trust_score: [★ rating]
      why_not: [Specific reason]

  missing_patterns:
    - need: [What pattern we need but don't have]
      workaround: [How we'll handle without it]
```

Use intelligence from:

- `context_pack.implementation_patterns.primary_patterns` - Concrete codebase examples with file:line refs
- `context_pack.implementation_patterns.project_conventions` - Project naming, structure, types
- `context_pack.implementation_patterns.reusable_snippets` - Copy-pasteable code from codebase
- `context_pack.web_research.official_docs` - Official recommendations and examples
- `context_pack.web_research.best_practices` - Industry-validated patterns
- `context_pack.web_research.security_alerts` - Security considerations to address
- `context_pack.web_research.avoid_patterns` - External anti-patterns to avoid
- `context_pack.pattern_cache.architecture` - APEX cross-project patterns
- `context_pack.execution_strategy.recommended_approach` - Recommended strategy
- `context_pack.historical_intelligence.similar_tasks` - Historical patterns

---

## ✅ ARCHITECTURE DECISION RECORD

**Your handoff should answer**: "If BUILDER follows this exactly, what could still go wrong?"

**ONLY AFTER ALL ARTIFACTS COMPLETE:**

```yaml
architecture_decision:
  decision: |
    [Clear statement of chosen architecture]
    Based on Tree of Thought winner: [A|B|C]

  files_to_modify:
    - path: [file]
      purpose: [why changing]
      pattern: [pattern applying]

  files_to_create:
    - path: [file]
      purpose: [why needed]
      pattern: [pattern using]
      test_plan: [how to test this new file]

  sequence: 1. [First implementation step]
    2. [Second implementation step]
    3. [Third implementation step]

  validation_plan:
    - [How to verify step 1]
    - [How to verify step 2]
    - [How to verify step 3]

  potential_failures:
    - [What could still go wrong]
    - [Edge case to watch for]
```

---

## 🔍 SELF-REVIEW CHECKPOINT

**BEFORE TRANSITIONING TO BUILDER:**

```markdown
## Mandatory Architecture Self-Review

☐ Chain of Thought exposed ALL hidden complexity?
☐ Tree of Thought has 3 DIFFERENT solutions?
☐ Chain of Draft shows REAL evolution?
☐ YAGNI explicitly lists 3+ exclusions?
☐ Patterns have trust scores and usage stats?
☐ Architecture decision is CONCRETE?
☐ New files include test_plan specifications?

**If ANY unchecked → STOP and revise**
```

<details>
<summary><strong>Advanced ARCHITECT Features</strong></summary>

### Gemini Collaboration (Complexity ≥ 7)

Use gemini-orchestrator subagent for architecture review:

- Security vulnerabilities assessment
- Performance bottleneck identification
- Edge case discovery
- Alternative approach evaluation

### State Archaeology

Review architectural assumptions from context pack:

- Check context_pack.validation_results.assumptions_verified
- Review context_pack.historical_intelligence.system_history
- Apply anti-patterns from context_pack.pattern_cache.anti_patterns
</details>

### ARCHITECT → BUILDER Handoff

```markdown
## ARCHITECT → BUILDER Handoff

### Chosen Architecture

[From architecture_decision.decision]

### What NOT to Build (YAGNI)

[From yagni_declaration.explicitly_excluding]

### Patterns to Apply

[From pattern_selection.applying]

### Files to Modify/Create

[From architecture_decision.files_to_modify/create]

### Implementation Sequence

[From architecture_decision.sequence]

### Validation at Each Step

[From architecture_decision.validation_plan]

### Watch Out For

[From architecture_decision.potential_failures]
```

Transition to BUILDER:

```
apex_task_update({id: taskId, phase: "BUILDER", handoff: handoff_content})
apex_task_append_evidence(taskId, "pattern", "Architecture artifacts and decisions", {all_artifacts})
```

## 7 · Execute BUILDER phase

### 🔨 BUILDER: Craft Code That Tells a Story

You are the craftsperson. Your code will be read more than written.

**Mental Model**: Each line of code is a decision. Make it deliberately.

**Before writing ANY code, ask**:

1. 📖 Have I absorbed ARCHITECT's warnings and design rationale?
2. 🎯 Do I understand the patterns recommended and why?
3. ⚠️ What failure modes were predicted that I must prevent?
4. 🤔 What assumptions am I making that could be wrong?

**While implementing**:

- Start with the hardest, riskiest parts first
- Reference patterns from context_pack (discovered during intelligence gathering)
- When something feels wrong, it probably is - investigate
- Your code explains itself - comments explain why, not what

**Success looks like**:
Future developers understanding your intent without documentation.

Note: If specs are unclear, return to ARCHITECT phase rather than guess.

<phase-execution>
**APPLY**: phase-gate-template with EXPECTED_PHASE = "BUILDER"

STOP if current phase ≠ BUILDER.
</phase-execution>

Record checkpoint:

```
apex_task_checkpoint(taskId, "Starting implementation phase", 0.5)
```

### 🚨 MANDATORY PATTERN DISCIPLINE

<critical-requirement>
**YOU CANNOT FABRICATE PATTERNS - ONLY USE PATTERNS FROM CONTEXT PACK**

Patterns were discovered during intelligence gathering (Step 4) and are in the context_pack:
- `context_pack.pattern_cache.implementation` - APEX patterns discovered by intelligence-gatherer
- `context_pack.implementation_patterns` - Codebase patterns extracted by pattern-extractor
- `context_pack.web_research.best_practices` - External patterns from research

When implementing:
1. Reference ONLY patterns that exist in the context pack
2. Document which patterns you applied and where
3. In apex_task_complete, claim ONLY patterns that were in the context pack

**VIOLATION EXAMPLE**: Claiming patterns like "bottom-up-refactoring", "sequential-test-validation",
"pydantic-model-first" that were NEVER in the context pack from intelligence gathering

**CONSEQUENCE**: Pattern trust scores become meaningless if patterns are fabricated

**ENFORCEMENT**: Patterns claimed in apex_task_complete must match patterns from context_pack.
No invented pattern names allowed.
</critical-requirement>

### Using Context Pack Intelligence

- **Primary reference**: Concrete code examples from `context_pack.implementation_patterns.reusable_snippets`
- Follow project conventions from `context_pack.implementation_patterns.project_conventions`
- Adapt patterns from `context_pack.implementation_patterns.primary_patterns` (with file:line refs)
- Reference official examples from `context_pack.web_research.official_docs`
- Apply security mitigations from `context_pack.web_research.security_alerts`
- Avoid patterns from `context_pack.web_research.avoid_patterns` and `implementation_patterns.inconsistencies`
- **MUST CALL apex_patterns_lookup**: Apply APEX patterns from `context_pack.pattern_cache.implementation` ONLY after discovering them
- Use failure predictions from `context_pack.historical_intelligence.predicted_failures`
- Reference similar implementations from `context_pack.historical_intelligence.similar_tasks`

### Pattern-Based Implementation

<good-example>
# [PAT:ERROR:HANDLING] ★★★★★ (156 uses, 100% success) - From cache
export const handleError = (error: Error): APIResponse => {
  // Pattern implementation with context-specific adaptations
  if (error instanceof ValidationError) {
    return { status: 400, code: 'VALIDATION_FAILED' };
  }
  // ...
};
</good-example>

### Failure Prevention

Review `context_pack.historical_intelligence.predicted_failures`:

- > 70% probability: Apply prevention automatically
- 50-70%: Apply with caution comment
- <50%: Document risk but proceed

<details>
<summary><strong>Advanced BUILDER Features</strong></summary>

### Parallel File Processing

When modifying multiple similar files:

- Group files by modification type
- Apply same change pattern to group
- Use MultiEdit for single file with multiple changes
- Use parallel Task agents for multiple files

### Gemini Code Generation (Complexity ≥ 6)

For complex algorithms not in patterns:

- Initial generation with context
- Iterative refinement discussion
- Performance optimization review
</details>

### BUILDER Actions

1. Read ARCHITECT handoff carefully
2. Implement using cached patterns (apply per pattern-application-template)
3. Create/modify code following specifications
4. If spec unclear, return to ARCHITECT phase
5. Apply syntax validation before completing

<critical-gate>
SYNTAX VALIDATION GATE: Before completing BUILDER phase
- Run linting (npm run lint, ruff check)
- Check for common errors (double async, missing brackets)
- Fix ALL syntax errors before proceeding
- Do NOT transition to VALIDATOR with syntax errors

PATTERN EVIDENCE GATE: Before transitioning to VALIDATOR
- Review all patterns you intend to claim in apex_task_complete
- Verify each pattern exists in the context_pack from intelligence gathering (Step 4)
- Document pattern IDs with references to context_pack sections where they appear
- No fabricated or invented pattern names allowed
</critical-gate>

### BUILDER → VALIDATOR Handoff

Document files modified and patterns applied.

**MANDATORY BEFORE TRANSITION**:
- Verify all claimed patterns exist in context_pack from intelligence gathering
- Include pattern IDs with context_pack references in handoff documentation

Transition to VALIDATOR:

```
apex_task_update({id: taskId, phase: "VALIDATOR", handoff: handoff_content})
apex_task_append_evidence(taskId, "pattern", "Implementation patterns applied", {patterns_used_from_context_pack})
```

## 8 · Execute VALIDATOR phase

### ✅ VALIDATOR: Guardian of Quality

You are the quality guardian. Every bug you catch saves hours of debugging later.

**Mental Model**: Think like a skeptical user who wants to break things.

**Your Testing Philosophy**:
"Don't just run tests - hunt for failures. Predict what will break,
validate your predictions, and learn from surprises. Every test
failure teaches us something about our assumptions."

**Before running tests, predict**:

- "Based on changes made, what's most likely to break?"
- "What edge cases might BUILDER have missed?"
- "Which integrations are most fragile?"

**After validation, reflect**:
"What surprised me? What patterns emerge? What should we test next time?"

Your thoroughness determines user trust in this software.

<phase-execution>
**APPLY**: phase-gate-template with EXPECTED_PHASE = "VALIDATOR"

STOP if current phase ≠ VALIDATOR.

**Critical distinction**:
- If you came from BUILDER with "all tests passing", that is NOT validation
- Running pytest during BUILDER ≠ VALIDATOR phase execution
- Running tests during BUILDER = verifying your changes work
- Running tests during VALIDATOR = verifying you didn't break anything else
</phase-execution>

<critical-requirement>
**VALIDATOR MUST**:
- Execute full test suite (not individual files)
- Check for regressions across entire codebase
- Validate integration between modified components
- Verify no side effects from changes
- Run linting, formatting, type checking as separate validation steps
</critical-requirement>

Record checkpoint:

```
apex_task_checkpoint(taskId, "Starting validation phase - running tests", 0.7)
```

### Using Context Pack Intelligence

- Apply test patterns from `context_pack.pattern_cache.testing`
- Check if predicted failures occurred
- Use parallelization from `context_pack.execution_strategy.parallelization_opportunities`

### Execute Comprehensive Validation

Use test-validator subagent:

```markdown
<Task subagent_type="apex:test-validator" description="Execute comprehensive validation">
# Validation Mission - Hunt for Failures

**Task ID**: [TASK_ID]
**Modified Files**: [List from BUILDER phase]
**Context Pack Predictions**: [Predicted failures]

**Your Testing Philosophy**:
"Don't just run tests - hunt for failures. Every test failure teaches us something."

**Required Validations**:

- Syntax validation (ESLint, ruff)
- Code formatting (Prettier, ruff format)
- Type checking (TypeScript, mypy)
- Unit test execution
- Integration test execution
- Coverage analysis

**Return**: Structured validation report with predictions vs reality
</Task>
```

### Validation Decision Logic

<critical-gate>
If ANY issues (syntax errors, failing tests):
→ Return to BUILDER phase with detailed issue list

do NOT ignore test failures

If only warnings/formatting issues:
→ Document for REVIEWER phase consideration

If all validations pass:
→ Proceed to REVIEWER phase
</critical-gate>

### VALIDATOR → REVIEWER/BUILDER Handoff

Include complete validation report and categorized issues.

Transition based on results:

```
apex_task_update({id: taskId, phase: next_phase, handoff: handoff_content})
apex_task_append_evidence(taskId, "pattern", "Test patterns and errors", {test_results})
```

## 9 · Execute REVIEWER phase

### 👁️ REVIEWER: The Final Defense

You are the experienced mentor. Your review prevents future regret.

**Mental Model**: Review as if you'll maintain this code for 5 years.

**First, absorb the journey**:

- What did ARCHITECT warn about? (Did BUILDER address it?)
- What patterns were applied? (Did they fit the context?)
- What did VALIDATOR discover? (Are there systemic issues?)

**Ask the hard questions**:

- "What would I do differently with hindsight?"
- "What technical debt are we accepting?"
- "What patterns should we document for next time?"

Your approval means you'd confidently deploy this to production.

<phase-execution>
**APPLY**: phase-gate-template with EXPECTED_PHASE = "REVIEWER"

STOP if current phase ≠ REVIEWER.

**Critical distinction**:
- Passing tests = code works correctly
- Code review = code is production-ready (quality, maintainability, standards)
</phase-execution>

<critical-requirement>
**REVIEWER MUST**:
- Use the superpowers:requesting-code-review skill if available
- OR use quality-reviewer subagent (see below)
- Review code quality against project standards
- Check for technical debt or code smells
- Verify patterns were applied appropriately
- Assess maintainability and clarity
</critical-requirement>

Record checkpoint:

```
apex_task_checkpoint(taskId, "Starting review phase", 0.85)
```

### Execute Comprehensive Review

**MANDATORY**: Use quality-reviewer subagent:

```markdown
<Task subagent_type="apex:quality-reviewer" description="Perform code review">
# Review Mission - The Final Defense

**Task ID**: [TASK_ID]
**Journey Context**:

- ARCHITECT warnings: [From ARCHITECT phase]
- BUILDER decisions: [Implementation choices]
- VALIDATOR discoveries: [Test results]

**Your Review Mandate**:
"You've seen the entire journey. Be the wise mentor who sees what others missed."

**Review Through These Lenses**:

1. Correctness: Does this solve the original problem?
2. Maintainability: Could you understand this in 6 months?
3. Resilience: How does this fail gracefully?
4. Pattern Recognition: What patterns worked/failed?
5. Journey Awareness: Were warnings addressed?

**Return**: Comprehensive review with verdict and actionable feedback
</Task>
```

<details>
<summary><strong>Advanced Review Features</strong></summary>

### Gemini Code Review (Complexity ≥ 5)

Use gemini-orchestrator for collaborative review:

- Logic error detection
- Security vulnerability assessment
- Performance optimization opportunities
- Maintainability improvements
</details>

### Review Decision

- **If approved**: Proceed to DOCUMENTER - make sure to inform user of any specific gaps in the final output
- **If explicitly rejected OR important fixes request**: Return to BUILDER with specific requirements

Transition:

```
apex_task_update({id: taskId, phase: next_phase, handoff: handoff_content})
apex_task_append_evidence(taskId, "pattern", "Final pattern effectiveness", {pattern_assessment})
```

## 10 · Execute DOCUMENTER phase and finalize

### 📝 DOCUMENTER: Transform Experience into Wisdom

You are the organizational memory. Your reflections make everyone better.

**Mental Model**: Every task teaches something. Extract the deep lessons.

**Deep Reflection Framework**:

**What patterns emerged?**

- Which cached patterns proved invaluable?
- What new patterns did we discover?
- Which patterns needed adaptation? Why?

**What surprised us?**

- What took longer than expected? Why?
- What was easier than anticipated? Why?
- What assumptions were wrong?

**What would we do differently?**

- Knowing what we know now, how would we approach this?
- What warning signs did we miss early?
- What patterns should we cache for next time?

**The apex_reflect call is sacred** - it's how the system learns.
Include evidence that would help future tasks avoid our mistakes.

Your documentation is a gift to future implementers facing similar challenges.

<phase-execution>
**APPLY**: phase-gate-template with EXPECTED_PHASE = "DOCUMENTER"

STOP if current phase ≠ DOCUMENTER.

**THIS IS THE ONLY PHASE WHERE apex_task_complete CAN BE CALLED**
</phase-execution>

<critical-requirement>
**🚨 APEX_TASK_COMPLETE IS FORBIDDEN IN ALL PHASES EXCEPT DOCUMENTER 🚨**

**BEFORE CALLING apex_task_complete**:
☐ Current phase is DOCUMENTER (verified via apex_task_context)
☐ You have checkpoints for: ARCHITECT, BUILDER, VALIDATOR, REVIEWER, DOCUMENTER
☐ Documentation files updated (if task affected workflow/architecture)
☐ All patterns claimed exist in context_pack from intelligence gathering

If ANY checkbox is unchecked → DO NOT call apex_task_complete
</critical-requirement>

Final checkpoint:

```
apex_task_checkpoint(taskId, "Completing task and capturing learnings", 0.95)
apex_task_context(taskId) - use response.evidence # Retrieve all evidence for reflection
```

### 📋 Documentation Update Checklist

<critical-requirement>
**SYSTEMATIC DOCUMENTATION COVERAGE**

Before apex_task_complete, identify ALL documentation that needs updates:

**If task modified workflow/architecture/stages**:
- ☐ CLAUDE.md - Check for references to old phase counts, workflow descriptions
- ☐ TOKEN_MANAGEMENT.md - Check for stage references, token allocation tables
- ☐ README.md - Check for workflow summaries, architecture diagrams
- ☐ docs/WORKFLOW.md - Check for phase descriptions (if exists)

**If task modified API/interfaces**:
- ☐ API documentation files
- ☐ OpenAPI/Swagger specs
- ☐ Client library docs

**If task modified CLI commands**:
- ☐ CLI help text
- ☐ docs/COMMANDS.md or similar
- ☐ README usage examples

**If task modified data schemas**:
- ☐ Schema documentation
- ☐ Migration guides
- ☐ Data model diagrams

**SEARCH STRATEGY**:
1. Use Grep to search for references to changed components across all .md files
2. Read each file that mentions the changed component
3. Update stale references
4. Document the updates in evidence

**VIOLATION EXAMPLE FROM SESSION**:
Modified workflow from 5 stages to 4 stages in code, but:
- CLAUDE.md line 98-101 still says "5-stage workflow"
- TOKEN_MANAGEMENT.md still references "5 stages"
- README.md not checked for stale references

**THE FIX**: Systematic grep → read → update → verify cycle
</critical-requirement>

### Complete Task and Reflect

#### Step 1: Complete the task

```
apex_task_complete(taskId, outcome, key_learning, patterns_used)
```

Returns a ReflectionDraft for review.

#### Step 2: Commit Changes

<system-reminder>
CRITICAL: You MUST commit changes BEFORE calling apex_reflect or it will fail!
Git sequence: status → add → commit → verify → reflect
</system-reminder>

```bash
git status --short
git add [relevant files]
git commit -m "Task [TASK_ID]: [Description]"
git log -1 --oneline # Verify commit succeeded
```

#### Step 3: Deep Pattern Reflection

**⏸️ PAUSE**: Take 30-60 seconds to deeply analyze the implementation.

**Reflection Questions**:

- What patterns from the cache worked perfectly?
- What new patterns did we discover?
- What anti-patterns should we avoid?
- What would save 2+ hours next time?

### Call apex_reflect

<reference-section>
## apex_reflect Quick Reference

**Two Formats**: batch_patterns (simple) or claims (full control)

<good-example>
# Simple batch format (RECOMMENDED)
apex_reflect({
  task: { id: "T123", title: "Fix auth bug" },
  outcome: "success",
  batch_patterns: [  # ← ARRAY, not string!
    {
      pattern: "FIX:AUTH:SESSION",
      outcome: "worked-perfectly",
      evidence: "Fixed in auth.ts:234"
    }
  ]
})
</good-example>

<bad-example>
# WRONG: Claims as string
apex_reflect({
  claims: '{"patterns_used": []}'  # ❌ Will fail!
})
</bad-example>

**Trust Update Outcomes**:

- `"worked-perfectly"` = 100% success
- `"worked-with-tweaks"` = 70% success
- `"partial-success"` = 50% success
- `"failed-minor-issues"` = 30% success
- `"failed-completely"` = 0% success

**Full Claims Format** (for complex reflection):

```javascript
apex_reflect({
  task: { id: "T124", title: "Add caching" },
  outcome: "success",
  claims: {  # ← OBJECT, not string!
    patterns_used: [...],
    trust_updates: [...],
    new_patterns: [{
      title: "Pattern Name",
      summary: "Description",
      snippets: [],
      evidence: []
    }],
    anti_patterns: [{
      title: "Anti-pattern Name",  # Required
      reason: "Why this is bad",    # Required
      evidence: []
    }],
    learnings: [{
      assertion: "What you learned",
      evidence: []
    }]
  }
})
```

For detailed examples and troubleshooting, see apex_reflect appendix.
</reference-section>

### Final Report to User

✅ **Result**: [Task title] - [Primary achievement]

📊 **Key Metrics**:

- Complexity: X/10 (predicted vs actual)
- Files: [created], [modified]
- Tests: [pass/fail counts]
- Pattern Intelligence: Cache hit rate X%

💬 **Summary**: [Concise summary of what was done]

📚 **Patterns**:

- Applied: X patterns from cache
- Discovered: Y new patterns
- Reflection: ✅ apex_reflect called

⏭️ **Next steps**: [Follow-up tasks or recommendations]

---

## Appendix: Extended References

<details>
<summary><strong>Complete apex_reflect Documentation</strong></summary>

### Common Errors and Fixes

| Error                              | Fix                                                     |
| ---------------------------------- | ------------------------------------------------------- |
| "Expected object, received string" | Pass claims/batch_patterns as objects, not JSON strings |
| "code_lines" error                 | Use "git_lines" instead                                 |
| Missing SHA                        | Add "sha": "HEAD" for uncommitted files                 |
| Evidence validation fails          | Commit files first, then reflect                        |

### Anti-pattern Structure

```javascript
anti_patterns: [
  {
    title: "Required field name", // NOT pattern_id
    reason: "Required explanation",
    evidence: [], // Optional
  },
];
```

### Evidence Format Rules

```javascript
// Git lines (most common)
{ kind: "git_lines", file: "src/api.ts", sha: "HEAD", start: 45, end: 78 }

// String evidence (auto-converted)
evidence: "Applied in auth.ts:45-78"
```

### Detailed Examples

[Extended examples available but omitted for brevity - use batch format for most cases]

</details>

<details>
<summary><strong>Phase Parallelization Strategies</strong></summary>

### BUILDER Parallelization

- Multiple file modifications
- Test-driven development
- Pattern application across files

### VALIDATOR Parallelization

- Frontend + backend tests (concurrent)
- Unit + integration tests (parallel)
- Linting + formatting + type checking

### Batch Operations

- Group similar changes
- Apply patterns consistently
- Use MultiEdit for single files
- Use parallel Tasks for multiple files

</details>

<details>
<summary><strong>Prompt Optimization Examples</strong></summary>

### Example Transformations

**Vague → Specific**:

- Before: "fix bug"
- After: Detailed requirements with success criteria

**Feature → Structured**:

- Before: "add feature"
- After: Technical requirements with acceptance criteria

**Complex → Organized**:

- Before: "refactor code"
- After: Scoped deliverables with constraints

</details>

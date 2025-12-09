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

**CREATE A TODO LIST** with exactly these 7 items:

1. Analyse scope from argument (what kind of input?)
2. Identify or create task (get it into database)
3. Optimize and improve prompt (enhance clarity and specificity)
4. Execute Comprehensive Intelligence & Context Assembly
5. Evaluate intelligence adequacy (ambiguity detection + technical adequacy)
6. Set status to in_progress (begin phase workflow)
7. Execute phases until task complete

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

### Context Pack Abbreviations (ctx.*)

**Use these shorthand references throughout phases:**
```
ctx.patterns   = context_pack.pattern_cache.{architecture|implementation|testing}
ctx.impl       = context_pack.implementation_patterns.{primary_patterns|conventions|snippets}
ctx.web        = context_pack.web_research.{official_docs|best_practices|security_alerts}
ctx.history    = context_pack.historical_intelligence.{similar_tasks|predicted_failures}
ctx.exec       = context_pack.execution_strategy.{recommended_approach|parallelization}
ctx.systems    = context_pack.systems_analysis.{component_map|execution_flows|invariants}
ctx.git        = context_pack.git_intelligence.{recent_changes|churn_hotspots|ownership}
ctx.risk       = context_pack.risk_analysis.{risk_matrix|edge_cases|mitigations}
ctx.docs       = context_pack.documentation_intelligence.{architecture_context|past_decisions}
```

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

### Enhancement Example

**Before**: "add dark mode"

**After**:
```
Implement dark mode theme toggle.

Technical: theme context, CSS variables, toggle component, localStorage persistence
Acceptance: instant switch, persists across sessions, respects system preference
Tests: theme switching and persistence coverage
```

**Anti-pattern**: "fix login bug" → "fix the login bug that users reported" (still lacks specifics!)

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

### Intelligence Agent Toolbelt

**Philosophy**: Select the RIGHT agents for THIS task. Not all agents every time.

| Agent | When to Use | Key Output |
|-------|-------------|------------|
| **intelligence-gatherer** (MANDATORY) | Every task | pattern_cache, execution_strategy, predicted_failures |
| web-researcher | External tech, security, unfamiliar frameworks | official_docs, security_alerts, best_practices |
| implementation-pattern-extractor | Existing codebase, match conventions | reusable_snippets, project_conventions |
| systems-researcher | Cross-component, architectural impacts | dependency_map, execution_flows, invariants |
| git-historian | Bug investigation, frequently-changed areas | churn_hotspots, regression_history, ownership |
| risk-analyst | Complexity ≥7, production-critical | risk_matrix, edge_cases, mitigations |
| documentation-researcher | Architecture history, past decisions | past_decisions, historical_learnings |

**Spawn format** (all agents use same structure):
```markdown
<Task subagent_type="apex:{agent}" description="{focus}">
**Task ID**: {taskId}
**Brief**: {enhanced brief from step 3}
**Focus**: {what to investigate}
**Return**: {expected output format}
</Task>
```

---

### Selection Decision Matrix

**Use this framework to decide which agents to deploy:**

```yaml
task_analysis:
  involves_external_tech: [yes/no]  # → web-researcher
  modifying_existing_code: [yes/no] # → implementation-pattern-extractor
  cross_component: [yes/no]         # → systems-researcher
  frequently_changed_area: [yes/no] # → git-historian
  complexity: [1-10]                # ≥7 → risk-analyst
  security_sensitive: [yes/no]      # → web-researcher + risk-analyst
  new_feature: [yes/no]             # → implementation-pattern-extractor
  bug_investigation: [yes/no]       # → git-historian + systems-researcher
  needs_historical_context: [yes/no] # → documentation-researcher
  references_architecture: [yes/no]  # → documentation-researcher
  similar_work_exists: [yes/no]      # → documentation-researcher

recommended_agents:
  - apex:intelligence-gatherer  # ALWAYS
  - [agent_2 based on criteria]
  - [agent_3 based on criteria]
  # 2-4 agents total is usually optimal
```

**Selection Examples**:

| Task Type | Key Signals | Agents (+ mandatory intelligence-gatherer) |
|-----------|-------------|---------------------------------------------|
| Security feature (JWT auth) | external_tech, security_sensitive | web-researcher, implementation-pattern-extractor, risk-analyst |
| Bug fix | bug_investigation, complexity ≤4 | git-historian, implementation-pattern-extractor |
| Cross-component refactor | cross_component, complexity 6+ | systems-researcher, implementation-pattern-extractor, git-historian |
| Architecture feature (caching) | references_architecture | documentation-researcher, implementation-pattern-extractor, web-researcher |

**Anti-pattern**: "Add dark mode" → DON'T launch all 7 agents. DO use 2-3 targeted agents.

---

### Execution Protocol

1. **Analyze the task** using the decision matrix above
2. **Select 2-4 agents** (always include intelligence-gatherer)
3. **Launch selected agents in PARALLEL** (single message with multiple Task calls)
4. **Wait for ALL agents to complete** before proceeding
5. **Synthesize findings** from all sources

**Cost-Benefit Guideline**: More agents = more intelligence but higher token cost and latency.
- Simple tasks (complexity ≤4): 2-3 agents
- Medium tasks (complexity 5-6): 3-4 agents
- Complex tasks (complexity ≥7): 4-5 agents

### Intelligence Synthesis

After selected agents complete, synthesize findings:

```yaml
synthesis_approach:
  collect_results:
    # Always present:
    - APEX patterns and context pack from intelligence-gatherer (mandatory baseline)

    # Present if agents were selected:
    - Web research findings (if web-researcher used)
    - Implementation patterns from codebase (if implementation-pattern-extractor used)
    - Systems intelligence (if systems-researcher used)
    - Git history insights (if git-historian used)
    - Forward-looking risks (if risk-analyst used)
    - Documentation intelligence (if documentation-researcher used)

  prioritize_findings:
    1. Live codebase = primary truth source (what actually exists)
    2. Implementation patterns = concrete project conventions and working code
    3. Project documentation = architecture decisions and historical context
    4. Official documentation = authoritative reference for frameworks/APIs
    5. APEX patterns = proven solutions from cross-project experience
    6. Best practices = industry consensus and validation
    7. Git history = evolution understanding and lessons learned
    8. Risks = preventive measures to implement

  connect_insights:
    - Validate APEX patterns against actual codebase (if implementation patterns available)
    - Cross-reference with project documentation (if documentation researcher used)
    - Cross-reference with official docs (if web research available)
    - Verify practices are actually used (if both codebase and web research available)
    - Honor past architectural decisions from project docs (if documentation available)
    - Identify gaps between current code and recommendations
    - Flag inconsistencies and deprecated patterns
    - Note security concerns and risk mitigations
    - Learn from past failures documented in project memory (if documentation available)
    - Resolve contradictions (priority: codebase reality > project docs > official docs > APEX patterns > opinions)
    - Build complete picture for implementation with available intelligence
    - Update context pack with synthesized intelligence
```

The synthesized intelligence forms a complete context pack (store as evidence).

### 📦 Context Pack Structure (Compact Reference)

**Always present** (from intelligence-gatherer):
- `task_analysis`: {id, title, type, complexity, validation_status, current_phase}
- `ctx.patterns`: {architecture, implementation, testing, fixes, anti_patterns} - each with trust scores
- `loaded_context`: {files[], total_tokens, token_budget}
- `ctx.history`: {similar_tasks, system_history, predicted_failures}
- `ctx.exec`: {recommended_approach, gemini_integration, parallelization_opportunities}
- `validation_results`: {requirements_complete, missing_requirements, ambiguities_resolved}
- `metadata`: {intelligence_timestamp, confidence_score, cache_hit_rate}

**Optional** (present if respective agents used):
- `ctx.web`: {official_docs, best_practices, security_alerts, avoid_patterns, gap_analysis}
- `ctx.impl`: {primary_patterns, project_conventions, reusable_snippets, testing_patterns, inconsistencies}
- `ctx.systems`: {component_map, execution_flows, integration_points, invariants}
- `ctx.git`: {recent_changes, churn_hotspots, regression_history, ownership}
- `ctx.risk`: {risk_matrix, edge_cases, monitoring_gaps, mitigations}
- `ctx.docs`: {architecture_context, past_decisions, historical_learnings, conflicts_detected}

**Adequacy assessment** (for Step 4.5):
- `adequacy_assessment`: {ambiguity_detected, ambiguous_areas[], initial_confidence: 0-1, recommendation: clarify_first|adequate|needs_technical_research}

### Initial Ambiguity Assessment

**Before displaying the intelligence report, perform a preliminary ambiguity scan of the gathered intelligence.**

This assessment prepares for Step 4.5 Phase 1 (Ambiguity Detection).

#### Ambiguity Indicators

Scan the task brief and context pack for these red flags:

**Vague Goal Indicators**:
- Task description contains unmeasured terms: "improve", "better", "optimize", "fix", "handle", "enhance"
- Success criteria missing or use relative terms ("faster", "more reliable") without baselines
- No acceptance tests derivable from requirements
- Multiple valid definitions of "done" exist

**Unclear Scope Indicators**:
- Boundary words absent: No mention of what's IN scope and what's OUT
- Component/file targets ambiguous: "the API" (which endpoints?), "authentication" (which aspects?)
- Conflicting signals: Docs say one thing, code suggests another, patterns point a third way
- Scale undefined: All instances or subset? Global or per-feature?

**Technical Choice Indicators**:
- Multiple high-trust patterns found with different approaches (no clear winner)
- Multiple libraries/frameworks exist for same purpose in codebase
- Architecture docs are silent or outdated on this decision
- Recent commits show inconsistent approaches

**Missing Constraint Indicators**:
- Performance-sensitive task but no targets specified
- Breaking change possible but no policy stated
- Security/compliance relevant but requirements undefined
- Migration/transition needed but no strategy given

#### Ambiguity Pre-Check Logic

```typescript
function assessAmbiguity(taskBrief: string, contextPack: ContextPack): AmbiguityAssessment {
  const ambiguities: AmbiguousArea[] = [];

  // Check 1: Vague goals
  const vagueTerms = ["improve", "better", "optimize", "fix", "handle", "enhance", "refactor"];
  const hasVagueTerms = vagueTerms.some(term =>
    taskBrief.toLowerCase().includes(term) &&
    !hasQuantification(taskBrief, term)
  );

  if (hasVagueTerms) {
    ambiguities.push({
      type: "vague_goal",
      description: "Task uses unmeasured improvement terms without specific success criteria",
      impact: "blocking",
      suggested_question: "What measurable outcome defines success for this task?"
    });
  }

  // Check 2: Multiple interpretations
  const multiplePatterns = contextPack.pattern_cache.implementation.length > 2;
  const patternsDisagree = checkPatternConsistency(contextPack.pattern_cache);

  if (multiplePatterns && patternsDisagree) {
    ambiguities.push({
      type: "technical_choice",
      description: `Found ${contextPack.pattern_cache.implementation.length} different implementation patterns with no clear preference`,
      impact: "high",
      suggested_question: "Which implementation approach should this follow?"
    });
  }

  // Check 3: Scope boundaries
  const scopeWords = ["all", "every", "specific", "only", "just", "these"];
  const hasScopeDefinition = scopeWords.some(word => taskBrief.includes(word));

  if (!hasScopeDefinition && taskBrief.split(" ").length < 15) {
    ambiguities.push({
      type: "unclear_scope",
      description: "Task description lacks explicit scope boundaries",
      impact: "high",
      suggested_question: "Which specific components/files/features should be modified?"
    });
  }

  // Check 4: Missing constraints (context-dependent)
  const isPerformanceTask = /performance|slow|fast|latency|speed/.test(taskBrief);
  const hasPerformanceTarget = /\d+ms|\d+s|p95|p99/.test(taskBrief);

  if (isPerformanceTask && !hasPerformanceTarget) {
    ambiguities.push({
      type: "missing_constraint",
      description: "Performance task without quantified target",
      impact: "blocking",
      suggested_question: "What is the target performance metric? (e.g., p95 < 200ms)"
    });
  }

  return {
    ambiguity_detected: ambiguities.length > 0,
    ambiguous_areas: ambiguities,
    initial_confidence: calculateInitialConfidence(contextPack, ambiguities),
    recommendation: ambiguities.some(a => a.impact === "blocking")
      ? "clarify_first"
      : ambiguities.length > 0
        ? "clarify_first"  // Be conservative: any ambiguity requires clarification
        : "adequate"
  };
}
```

#### Store Assessment in Context Pack

Update the context pack with ambiguity assessment:

```javascript
context_pack.adequacy_assessment = {
  ambiguity_detected: boolean,
  ambiguous_areas: [...],
  initial_confidence: score,
  recommendation: "clarify_first" | "adequate" | "needs_technical_research"
};

apex_task_append_evidence(taskId, "decision", "Initial ambiguity assessment", {
  ambiguity_detected: context_pack.adequacy_assessment.ambiguity_detected,
  flagged_ambiguities: context_pack.adequacy_assessment.ambiguous_areas,
  recommendation: context_pack.adequacy_assessment.recommendation
});
```

**This assessment directly feeds into Step 4.5 Phase 1**, allowing the gate to immediately identify and route ambiguous tasks to user clarification.

---

### 📊 Display Intelligence Report to User

After receiving the context pack, display a comprehensive intelligence report structured as:

```markdown
## 🧠 Intelligence Report for Task: {task_title}

### 📊 Baseline Metrics (Always Present)
Agents: {list} | Cache Hit: {%} | Patterns: {count} | Similar Tasks: {count} | Confidence: {X}/10

### 🎯 Pattern Intelligence
High-Trust (★★★★☆+): {pattern_id} ({uses} uses, {%} success)
Applicable: {count} | Anti-patterns: {count} | Success Prediction: {%}

### 📚 Historical Intelligence
Similar Tasks: {top 3 with outcomes and learnings}
Failure Predictions: {>50% probability with prevention strategies}

### 🚀 Execution Strategy
Approach: {recommended} | Parallelization: {count} | Validation: {status}
{if missing/ambiguous: list them}

### Optional Sections (include if agent was used)
- 🌐 ctx.web: Official docs, best practices, security alerts, gap analysis
- 📝 ctx.impl: Primary patterns, conventions, reusable snippets, testing patterns
- 🏗️ ctx.systems: Dependencies, execution flows, integration points, invariants
- 📜 ctx.git: Recent changes, churn hotspots, regressions, ownership
- 📚 ctx.docs: Architecture context, past decisions, historical learnings
- ⚠️ ctx.risk: Risk matrix, edge cases, monitoring gaps

### 📈 Metrics Summary
Patterns: {count} | Trust Distribution: ★★★★★({X}) ★★★★☆({X}) ★★★☆☆({X})
Context: {files} files, {tokens} tokens | Generation: {time}s

### 💡 Key Insights (2-3 actionable insights)
```

**Implementation Notes for the Intelligence Report**:

1. Extract all metrics from the context_pack returned by selected agents
2. Only display sections for agents that were actually used
3. Calculate derived metrics (averages, percentages, counts) from the raw data
4. Format trust scores as star ratings (★) for visual clarity
5. Highlight critical warnings (validation blocked, high-risk predictions, security issues)
6. Keep the report concise but informative - focus on actionable intelligence
7. Clearly indicate which agents were deployed in the "Agents Deployed" line

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

## 4.5 · Evaluate Intelligence Adequacy and Decide

<critical-gate>
**MANDATORY TWO-PHASE EVALUATION - DO NOT SKIP**

This gate ensures we never proceed with ambiguous requirements or insufficient context.

**Core Principle**: Ambiguity is a BLOCKING condition that ONLY users can resolve.
- No code analysis can tell us what the user actually wants
- Always clarify WHAT before researching HOW
- Technical context is irrelevant if requirements are unclear
</critical-gate>

### Phase 1: Ambiguity Detection (MANDATORY FIRST)

**Before evaluating technical adequacy, we MUST ensure the task is unambiguous.**

#### Ambiguity Checklist

Run these checks on the task brief and gathered intelligence:

☐ **Success Criteria Defined**
   - Can we define "done" unambiguously?
   - Are success criteria measurable and specific?
   - Can we derive acceptance tests without guessing?

☐ **Scope Bounded**
   - Are there vague terms without quantification?
     - "improve", "better", "fix", "handle", "optimize" without specifics?
   - Are boundaries clear on what's in/out of scope?
   - Do we know which components/files/features are affected?

☐ **Single Valid Interpretation**
   - Is there only ONE way to satisfy the requirement?
   - Are there conflicting or competing interpretations?
   - If patterns suggest multiple approaches, is preference specified?

☐ **Constraints Explicit**
   - If performance matters: Are targets stated? (e.g., "p95 < 200ms")
   - If breaking changes possible: Is policy clear? (allowed/versioned/forbidden)
   - If security-sensitive: Are requirements defined? (auth, encryption, PII)
   - If integrations involved: Are contracts/APIs specified?

☐ **Technical Decisions Specified** (when multiple valid options exist)
   - If multiple libraries/frameworks possible: Is choice made or constrained?
   - If multiple architectural patterns found: Is preference indicated?
   - If migration/transition needed: Is strategy defined?

#### Phase 1 Decision Logic

```yaml
IF ANY checkbox fails:
  status: AMBIGUOUS
  action: ASK_USER
  reason: "Cannot proceed with ambiguous requirements"

  # Generate structured clarification questions
  questions: formulate_ambiguity_questions(failed_checkboxes)

  # STOP HERE - Do NOT evaluate technical adequacy
  # WAIT for user response
  # UPDATE task brief with clarifications
  # LOOP back to Phase 1 until ALL checkboxes pass

IF ALL checkboxes pass:
  status: UNAMBIGUOUS
  action: PROCEED_TO_PHASE_2
  reason: "Requirements clear, evaluating technical adequacy"
```

#### Ambiguity Question Format

**Template structure** (use for all ambiguity types):
```markdown
## {emoji} Clarification Needed: {Category}

**Current task**: "{task description}"
**Ambiguity**: {what's unclear}

**What we found**: {relevant codebase/intelligence findings}

**Options**:
A) {option} - {tradeoffs: requires, effort, risk, breaking}
B) {option} - {tradeoffs}
C) {option} - {tradeoffs}

**Our recommendation**: Option {X}
**Reasoning**: {why this balances impact and feasibility}

[Choose A/B/C or specify alternative]
```

**Ambiguity categories**:
| Type | Trigger | Example Question |
|------|---------|------------------|
| Vague goal | "improve", "optimize" without metrics | "Target p95 latency: <200ms / <300ms / <500ms?" |
| Unclear scope | Multiple valid interpretations | "Which interpretation: change mechanism / improve quality / add OAuth?" |
| Technical choice | Multiple patterns in codebase | "Which approach: WebSockets / SSE / Polling?" |
| Missing constraint | Performance/breaking changes undefined | "Breaking changes allowed: Yes-v2 / No-backcompat / New-endpoints-only?" |

#### Question Quality Standards

**When formulating ambiguity questions, MUST**:
- Provide context: What we found in the codebase/intelligence gathering
- Offer structured options with implications (not pure free-text)
- Include our analysis and recommendation (with reasoning)
- Batch all ambiguity questions together (max 4 per round)
- Tie each question to a blocked architectural decision

**When formulating ambiguity questions, MUST NOT**:
- Ask questions answerable from codebase (those go to Phase 2 → agents)
- Request information we should infer from patterns
- Ask open-ended "what do you want?" questions
- Mix ambiguity resolution with technical detail discovery

<bad-example>
❌ "Can you provide more details about the authentication system?"
❌ "What should I do here?"
❌ "Tell me about your requirements"
❌ "How fast should this be?"
</bad-example>

<good-example>
✅ "Should login sessions persist across browser restarts? (Yes/No with implications)"
✅ "Which OAuth providers must be supported? (Google/GitHub/Microsoft - multi-select)"
✅ "Target p95 latency: <200ms / <300ms / <500ms? (Current: 450ms)"
✅ "Breaking changes allowed? (Yes - v2 / No - backcompat / New endpoints only)"
</good-example>

#### Phase 1 Completion

After receiving user responses:

1. **Update task brief** with clarifications
   ```
   apex_task_update({id: taskId, intent: enhanced_brief_with_clarifications})
   ```

2. **Document ambiguity resolution**
   ```
   apex_task_append_evidence(taskId, "decision", "Ambiguity resolution", {
     original_ambiguities: [],
     questions_asked: [],
     user_responses: [],
     updated_brief: enhanced_brief
   })
   ```

3. **Re-run Phase 1 checklist**
   - Verify all checkboxes now pass
   - If still ambiguous → Task is fundamentally ill-defined → ESCALATE
   - If clear → Proceed to Phase 2

**Maximum 1 round of ambiguity clarification**: If task is still ambiguous after user response, the task itself is insufficiently defined and should be broken down or refined outside this workflow.

---

### Phase 2: Technical Adequacy Evaluation (ONLY after Phase 1 passes)

<phase-execution>
**PREREQUISITE**: Phase 1 complete with status = UNAMBIGUOUS

Requirements are now clear. Evaluate if we have sufficient technical context to architect a solution.
</phase-execution>

#### Technical Adequacy Checklist

Evaluate the context_pack across 4 dimensions:

**1. Technical Context (30% weight)** - Do we know HOW/WHERE to implement?
   - [ ] Target files/modules identified from codebase
   - [ ] Implementation patterns found (or approach is straightforward)
   - [ ] Integration points understood
   - [ ] Relevant code examples extracted

   **Score**: 0-100 based on completeness

**2. Risk Assessment (20% weight)** - Do we understand failure modes?
   - [ ] Breaking change analysis complete
   - [ ] Performance implications assessed
   - [ ] Security considerations identified
   - [ ] Rollback/mitigation strategy possible

   **Score**: 0-100 based on risk understanding

**3. Dependency Mapping (15% weight)** - Do we know what will be affected?
   - [ ] Direct dependencies mapped (what imports this?)
   - [ ] Consumers identified (what calls this?)
   - [ ] Test impact assessed
   - [ ] Cross-component effects understood

   **Score**: 0-100 based on dependency coverage

**4. Pattern Availability (35% weight)** - Do we have guidance?
   - [ ] High-trust patterns (★★★★☆+) found for this task type
   - [ ] Similar past implementations discovered
   - [ ] Anti-patterns identified (what to avoid)
   - [ ] Failure predictions available

   **Score**: 0-100 based on pattern confidence

**Overall Confidence Score**: Weighted average of 4 dimensions

#### Phase 2 Decision Logic

```yaml
IF confidence >= 80:
  action: PROCEED_TO_ARCHITECT
  status: HIGH_CONFIDENCE
  reasoning: "Strong technical context and proven patterns"

IF confidence >= 65 AND < 80:
  action: PROCEED_TO_ARCHITECT
  status: ADEQUATE_CONFIDENCE
  warnings: [document gaps as assumptions]
  reasoning: "Sufficient context to architect, minor gaps documented"

IF confidence >= 50 AND < 65:
  action: EVALUATE_GAPS
  status: MARGINAL_CONFIDENCE

  # Identify specific gaps
  gaps: identify_technical_gaps(context_pack)

  # Route gaps to recovery
  IF gaps_are_discoverable:
    action: SPAWN_AGENTS
    agents: select_agents_for_gaps(gaps)
    max_rounds: 2
  ELSE:
    action: ASK_USER
    questions: formulate_technical_questions(gaps)

IF confidence < 50:
  action: INSUFFICIENT_CONTEXT
  status: LOW_CONFIDENCE

  # Determine if recoverable
  IF task_has_high_trust_patterns:
    action: SPAWN_AGENTS  # Maybe we missed something
  ELSE:
    action: ESCALATE_TO_USER
    message: "Task is clear but we lack technical context to architect safely"
```

#### Gap Identification and Routing

**Gap Classification**:
```typescript
interface TechnicalGap {
  type: 'pattern_missing' | 'context_incomplete' | 'risk_unknown' | 'dependency_unclear';
  severity: 'blocking' | 'important' | 'minor';
  description: string;
  discoverable: boolean;  // Can agents find this in code/docs?
  agentTypes?: string[];  // Which agents could resolve this
}
```

**Gap-to-Agent Mapping**:
```yaml
pattern_missing:
  - apex:implementation-pattern-extractor (find similar code)
  - apex:pattern-analyst (query pattern cache)

context_incomplete:
  - apex:systems-researcher (trace execution flows)
  - apex:implementation-pattern-extractor (find concrete examples)

risk_unknown:
  - apex:git-historian (find past issues in this area)
  - apex:risk-analyst (forward-looking risk assessment)
  - apex:web-researcher (security advisories, breaking changes)

dependency_unclear:
  - apex:systems-researcher (map dependency graph)
  - apex:git-historian (who touches this code?)
```

**Agent Spawning Strategy**:

When gaps are discoverable, spawn targeted agents:

<good-example>
```markdown
**Identified Gaps**:
1. Implementation pattern for rate limiting unclear (confidence: 45%)
2. Integration with existing middleware unknown (confidence: 50%)

**Recovery Strategy**: Spawn agents

<Task subagent_type="apex:implementation-pattern-extractor" description="Find rate limiting patterns">
**Task ID**: {taskId}
**Focus**: Rate limiting and throttling patterns in codebase

**Extract**:
1. How is rate limiting currently implemented? (search for "rate", "throttle", "limit")
2. What libraries/approaches are used?
3. Where is middleware applied? (global vs. route-specific)
4. Reusable code snippets with file:line references

**Return**: YAML with concrete examples from codebase
</Task>

<Task subagent_type="apex:systems-researcher" description="Map middleware integration">
**Task ID**: {taskId}
**Focus**: Middleware architecture and integration points

**Analyze**:
1. How is middleware currently composed/chained?
2. What's the order of execution?
3. Where would new middleware fit in the pipeline?
4. What contracts/interfaces must be respected?

**Return**: Integration strategy with file:line references
</Task>
```

After agents complete:
1. Merge new intelligence into context_pack
2. Recalculate confidence scores
3. Re-evaluate Phase 2 decision logic
4. If confidence now adequate → PROCEED
5. If still insufficient and round < 2 → Spawn more agents
6. If round >= 2 or no progress → ESCALATE_TO_USER
</good-example>

#### Recovery Loop Controls

**Hard Constraints**: Max 2 rounds, 3 agents/round, 5min timeout | Min 15% confidence gain/round, stop if <10% | Max 15K tokens/agent, 60K total

**Progress Tracking**: RecoveryRound = {round, gaps_targeted, agents_spawned, confidence_before/after, improvement, new_intelligence}

**Stop Conditions**:
- **PROCEED**: confidence ≥65 OR (round ≥2 AND confidence ≥50)
- **ESCALATE**: (round ≥2 AND confidence <50) OR improvement <10% OR no new intelligence

#### Phase 2 Completion

After technical adequacy determined:

1. **Document adequacy assessment**
   ```
   apex_task_append_evidence(taskId, "decision", "Technical adequacy assessment", {
     phase2_scores: {
       technical_context: score,
       risk_assessment: score,
       dependency_mapping: score,
       pattern_availability: score,
       overall_confidence: score
     },
     gaps_remaining: [],
     recovery_rounds: [],
     proceed_decision: "PROCEED" | "INSUFFICIENT"
   })
   ```

2. **If INSUFFICIENT**: Escalate to user
   ```markdown
   ## ⚠️ Insufficient Technical Context

   **Task is clear** (ambiguity resolved in Phase 1)
   **BUT**: We lack sufficient technical context to architect confidently.

   **Attempted Recovery**:
   - Round 1: Spawned [agents], gained [improvements]
   - Round 2: Spawned [agents], gained [improvements]

   **Current Confidence**: {score}/100

   **Remaining Gaps**:
   1. [gap description]
   2. [gap description]

   **Recommendation**:
   - Break this into smaller, more focused tasks, OR
   - Provide architectural guidance on [specific unknowns], OR
   - Accept proceeding with documented assumptions

   **How to proceed?**
   A) Proceed anyway (architect with best effort, document assumptions)
   B) Pause task (need more information)
   C) Break down (split into smaller tasks)
   ```

3. **If PROCEED**: Transition to Step 5

---

### Two-Phase Gate Summary

**Phase 1: Ambiguity Detection** (User-only resolution)
- Checks: Success criteria, scope, interpretations, constraints
- If ambiguous → ASK_USER with structured questions
- If clear → Proceed to Phase 2
- Max 1 clarification round

**Phase 2: Technical Adequacy** (Agent-assisted resolution)
- Scores: Technical context, risk, dependencies, patterns
- If adequate (≥65) → PROCEED to ARCHITECT
- If insufficient → SPAWN_AGENTS for discovery (max 2 rounds)
- If irrecoverable → ESCALATE to user

**Gate Enforcement**:
- Step 5 will verify both phases completed before allowing ARCHITECT transition
- Evidence trail maintained for learning and reflection

## 5 · Set status to in_progress

<phase-execution>
**MANDATORY PREREQUISITE VERIFICATION**

Before setting phase to ARCHITECT, verify TWO-PHASE GATE completed successfully.

**This step CANNOT proceed unless Step 4.5 is complete.**
</phase-execution>

### Two-Phase Gate Verification

Run these verification checks before transitioning to ARCHITECT:

#### Phase 1 Verification (Ambiguity Resolution)

☐ **Ambiguity assessment completed**
   - Step 4.5 Phase 1 executed
   - Ambiguity checklist evaluated

☐ **No ambiguities OR all resolved**
   - If ambiguities detected: User clarification received
   - If ambiguities detected: Task brief updated with user responses
   - If no ambiguities: Verification passed

☐ **Task brief is unambiguous**
   - Success criteria are measurable
   - Scope boundaries are explicit
   - Single valid interpretation exists
   - Constraints are stated (performance/breaking changes/security)
   - Technical choices resolved (if multiple options existed)

☐ **Evidence documented**
   - Ambiguity resolution recorded via apex_task_append_evidence
   - User responses captured (if any clarifications were needed)

#### Phase 2 Verification (Technical Adequacy)

☐ **Technical adequacy evaluated**
   - Step 4.5 Phase 2 executed
   - 4-dimension scoring completed (Technical Context, Risk, Dependencies, Patterns)
   - Overall confidence score calculated

☐ **Confidence threshold met OR gaps accepted**
   - Confidence ≥ 65 (adequate to proceed), OR
   - Confidence 50-64 with recovery attempted and documented, OR
   - User explicitly accepted proceeding with documented gaps

☐ **Context pack contains minimum intelligence**
   - Task analysis present
   - At least 1 agent provided intelligence (intelligence-gatherer minimum)
   - Execution strategy defined
   - Validation results available

☐ **Evidence documented**
   - Technical adequacy scores recorded via apex_task_append_evidence
   - Recovery attempts documented (if any agents spawned in Phase 2)
   - Final confidence score and gaps captured

### Verification Enforcement

<critical-gate>
**IF ANY VERIFICATION CHECKBOX FAILS**:
→ **STOP** - Do NOT set phase to ARCHITECT
→ **RETURN** to Step 4.5
→ **COMPLETE** missing phase(s)
→ **ONLY PROCEED** after all checkboxes pass

**Violation = Major Error**: Proceeding without verification leads to:
- Ambiguous implementations (wrong solution built)
- Insufficient context (architecture fails in validation)
- Wasted time and resources
- Pattern trust score degradation (false success/failure data)
</critical-gate>

### Record Verification Evidence

Document that both phases completed successfully:

```javascript
apex_task_append_evidence(taskId, "decision", "Two-phase gate verification", {
  phase1_ambiguity: {
    detected: boolean,
    resolved: boolean,
    clarifications_from_user: [] | null,
    verification_passed: true
  },
  phase2_technical: {
    confidence_score: number,
    confidence_level: "high" | "adequate" | "marginal",
    gaps_remaining: [],
    recovery_rounds: number,
    verification_passed: true
  },
  overall_gate_status: "PASSED",
  timestamp: ISO-8601
})
```

### Set Phase to ARCHITECT

**Only after verification passes**, set initial phase to ARCHITECT:

```javascript
apex_task_update({id: taskId, phase: "ARCHITECT"})

apex_task_append_evidence(taskId, "decision", "Task execution started", {
  execution_strategy: context_pack.execution_strategy,
  ambiguity_resolution_summary: {...},
  intelligence_confidence: context_pack.adequacy_assessment.initial_confidence,
  adequacy_assessment: "sufficient",
  phases_completed: ["ambiguity_detection", "technical_adequacy"],
  timestamp
})
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

Investigate: WHY exists? WHAT problems before? WHO depends? WHERE are landmines?

**Schema**: `chain_of_thought: {current_state: {what_exists[], how_it_got_here[], dependencies[]}, problem_decomposition: {core_problem, sub_problems[]}, hidden_complexity[], success_criteria[]}`

**❌ VIOLATION**: "The task needs authentication" (vague)
**✅ COMPLIANT**: Structured with component-level specifics

---

## 🌳 ARTIFACT 2: Tree of Thought Solutions

Generate EXACTLY 3 substantially different solutions.

**Schema per solution**: `{approach, description(2-3 sentences), implementation[steps], patterns_used[PAT:IDs], pros[], cons[], complexity: 1-10, risk: LOW|MEDIUM|HIGH, time_estimate}`

**Comparative analysis**: `{winner: A|B|C, reasoning(2-3 sentences with ctx.* evidence), runner_up, why_not_runner_up}`

**❌ VIOLATION**: Two similar solutions with minor variations
**✅ COMPLIANT**: Three fundamentally different architectural approaches

---

## 📝 ARTIFACT 3: Chain of Draft Evolution

Show thinking evolution through 3 drafts. Ask: "How can this design prevent rather than handle errors?"

**Schema**: `chain_of_draft: {draft_1_raw: {core_design, identified_issues[]}, draft_2_refined: {core_design, improvements[], remaining_issues[]}, draft_3_final: {core_design, why_this_evolved, patterns_integrated[]}}`

---

## 🚫 ARTIFACT 4: YAGNI Declaration

Focus on production edge cases, exclude everything else.

**Schema**: `yagni_declaration: {explicitly_excluding: [{feature, why_not, cost_if_included}], preventing_scope_creep: [{temptation, why_resisting}], future_considerations: [{could_add, when_makes_sense}], complexity_budget: {allocated: 1-10, used, reserved}}`

**❌ VIOLATION**: "Keeping it simple" (vague)
**✅ COMPLIANT**: Specific features excluded with reasons

---

## 🎯 ARTIFACT 5: Pattern Selection Rationale

Justify every pattern choice using ctx.* intelligence.

**Schema**: `pattern_selection: {applying: [{pattern_id, trust_score: ★, usage_stats, why_this_pattern, where_applying}], considering_but_not_using: [{pattern_id, trust_score, why_not}], missing_patterns: [{need, workaround}]}`

**Intelligence sources**: ctx.impl (primary_patterns, conventions, snippets), ctx.web (official_docs, best_practices, security_alerts, avoid_patterns), ctx.patterns.architecture, ctx.exec.recommended_approach, ctx.history.similar_tasks

---

## ✅ ARCHITECTURE DECISION RECORD

**Handoff question**: "If BUILDER follows this exactly, what could still go wrong?"

**Schema**: `architecture_decision: {decision(winner: A|B|C), files_to_modify: [{path, purpose, pattern}], files_to_create: [{path, purpose, pattern, test_plan}], sequence[], validation_plan[], potential_failures[]}`

---

## 🔍 SELF-REVIEW CHECKPOINT

☐ Chain of Thought: ALL hidden complexity?  ☐ Tree of Thought: 3 DIFFERENT solutions?
☐ Chain of Draft: REAL evolution?  ☐ YAGNI: 3+ exclusions?  ☐ Patterns: trust scores + stats?
☐ Architecture decision: CONCRETE?  ☐ New files: test_plan included?

**If ANY unchecked → STOP and revise**

### ARCHITECT → BUILDER Handoff

Include: Chosen architecture, YAGNI exclusions, patterns to apply, files to modify/create, implementation sequence, validation steps, failure warnings.

Transition to BUILDER:

```
apex_task_update({id: taskId, phase: "BUILDER", handoff: handoff_content})
apex_task_append_evidence(taskId, "pattern", "Architecture artifacts and decisions", {all_artifacts})
```

## 7 · Execute BUILDER phase

### 🔨 BUILDER: Craft Code That Tells a Story

**Mental Model**: Each line of code is a decision. Your code will be read more than written.

**Before writing ANY code, ask**: (1) Have I absorbed ARCHITECT's warnings? (2) Do I understand the patterns and why? (3) What failure modes must I prevent? (4) What assumptions could be wrong?

**Note**: If specs are unclear, return to ARCHITECT phase rather than guess.

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

**Mental Model**: Think like a skeptical user who wants to break things. Hunt for failures, don't just run tests.

**Before tests, predict**: What's most likely to break? What edge cases were missed? Which integrations are fragile?

**After tests, reflect**: What surprised me? What patterns emerge? What should we test next time?

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

Spawn test-validator with task context and modified files list:

```markdown
<Task subagent_type="apex:test-validator" description="Comprehensive validation">
**Task ID**: [TASK_ID] | **Modified Files**: [from BUILDER] | **Predictions**: [from ctx.history]

**Run**: Syntax (ESLint/ruff) → Formatting → Type check → Unit tests → Integration tests → Coverage

**Return**: Validation report comparing predictions vs reality, categorized issues
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

**Mental Model**: Review as if you'll maintain this code for 5 years. Your approval means you'd deploy to production.

**Absorb the journey**: Did BUILDER address ARCHITECT warnings? Did patterns fit context? Are there systemic issues from VALIDATOR?

**Hard questions**: What would I do differently? What technical debt are we accepting? What patterns to document?

<phase-execution>
**APPLY**: phase-gate-template with EXPECTED_PHASE = "REVIEWER"

STOP if current phase ≠ REVIEWER.

**Critical distinction**:
- Passing tests = code works correctly
- Code review = code is production-ready (quality, maintainability, standards)
</phase-execution>

<critical-requirement>
**REVIEWER MUST**:
- Use 3-agent adversarial review system (Phase 1 + Phase 2 + Synthesis)
- Phase 1: Launch quality-scout AND risk-scout in parallel
- Phase 2: Launch reality-checker to challenge all findings
- Synthesize: Apply confidence adjustment and generate final report
- Review code quality, security, performance, patterns, and journey validation
- Reduce false positives through adversarial challenge process
</critical-requirement>

Record checkpoint:

```
apex_task_checkpoint(taskId, "Starting review phase", 0.85)
```

### Execute Adversarial Review System

**MANDATORY**: Use 3-agent adversarial review (reduces false positives while maintaining thoroughness)

### Phase 1: Parallel Issue Discovery

**CRITICAL**: Launch BOTH agents in a SINGLE message for true parallelism.

```markdown
<Task subagent_type="apex:review:quality-scout" description="Quality and architecture review">
# Quality Scout Mission

**Task ID**: [TASK_ID]
**Journey Context**:
- ARCHITECT warnings: [From ARCHITECT phase]
- BUILDER decisions: [Implementation choices and patterns applied]
- VALIDATOR discoveries: [Test results]

**Your Focus**: Maintainability, patterns, architecture consistency

**Review Lenses**:
1. **Correctness**: Does this solve the original problem completely?
2. **Maintainability**: Clear, readable, understandable in 6 months?
3. **Pattern Consistency**: Were ARCHITECT patterns applied correctly?
4. **Journey Validation**: Were ARCHITECT warnings addressed by BUILDER?

**Return**: YAML with findings, each containing:
```yaml
findings:
  - id: "QUA-001"
    category: "maintainability|correctness|patterns|architecture"
    severity: "critical|high|medium|low"
    confidence: 0.0-1.0
    location: "file:line"
    issue: "Description"
    evidence: "Specific code/behavior"
    suggestion: "How to fix"
```
</Task>

<Task subagent_type="apex:review:risk-scout" description="Security, performance, test review">
# Risk Scout Mission

**Task ID**: [TASK_ID]
**Journey Context**:
- Code changes: [Modified/created files]
- VALIDATOR results: [Test outcomes, coverage]
- Predicted failures: [From intelligence gathering]

**Your Focus**: Production readiness, critical risks

**Review Lenses**:
1. **Security**: Vulnerabilities, input validation, secrets handling
2. **Performance**: Bottlenecks, inefficient algorithms, scaling issues
3. **Test Coverage**: Gaps, edge cases, integration points
4. **Resilience**: Error handling, failure modes, monitoring

**Return**: YAML with findings (same format as Quality Scout)
</Task>
```

**WAIT** for BOTH agents to complete before Phase 2.

---

### Phase 2: Reality Check (Challenge Findings)

Parse YAML from both scouts, then launch challenge agent:

```markdown
<Task subagent_type="apex:review:reality-checker" description="Challenge review findings">
**Task ID**: [TASK_ID] | **Phase 1 Findings**: [YAML from both scouts]
**Journey Context**: ARCHITECT rationale, BUILDER justifications, VALIDATOR evidence, task history

**Mandate**: Challenge EVERY finding to eliminate false positives

**Challenge each finding on**: Code misreading? Mitigating factors? Journey-justified? Evidence quality?

**Determine**: challenge_result (UPHELD|DOWNGRADED|DISMISSED), confidence (0-1), evidence_quality (strong|moderate|weak), action (FIX_NOW|SHOULD_FIX|NOTE|IGNORE), reasoning

**Return**: YAML with challenged findings
</Task>
```

---

### Phase 3: Synthesize Report

After Reality Checker completes, synthesize final review:

**Confidence Adjustment**: `finalConfidence = phase1Confidence × challengeImpact` where UPHELD=1.0, DOWNGRADED=0.6, DISMISSED=0.2

**Action Decision**: <0.3 → IGNORE | critical AND >0.5 → FIX_NOW | high AND >0.6 → FIX_NOW | >0.7 → SHOULD_FIX | else → NOTE

**Generate Structured Report**:

Report sections: ✅ Journey Validation (ARCHITECT/BUILDER/VALIDATOR checks) → 🔴 FIX NOW (critical+high confidence) → 🟡 SHOULD FIX → 📝 NOTES → ✖️ DISMISSED → 📊 Metrics (findings, upheld/downgraded/dismissed, false positive rate)

**Finding format**: `{id, location: file:line, severity, confidence, issue, evidence, challenge_result, fix}`

### Review Decision

**Decision Matrix**:
- **0 FIX_NOW**: APPROVE → DOCUMENTER
- **1-2 FIX_NOW (minor)**: CONDITIONAL → Fix or accept with docs
- **3+ FIX_NOW or critical security**: REJECT → BUILDER

**Handoff**: Include outcome (APPROVED|CONDITIONAL|REJECTED), review summary (findings count, challenge results, false positive rate), FIX_NOW actions, SHOULD_FIX recommendations, accepted trade-offs, journey validation.

Transition:

```
apex_task_update({id: taskId, phase: next_phase, handoff: handoff_content})
apex_task_append_evidence(taskId, "pattern", "Adversarial review results", {
  phase1_findings,
  phase2_challenges,
  final_report,
  false_positive_rate
})
```

## 10 · Execute DOCUMENTER phase and finalize

### 📝 DOCUMENTER: Transform Experience into Wisdom

**Mental Model**: Every task teaches something. Extract the deep lessons.

**Reflection Framework**:
- **Patterns**: Which worked? Which were discovered? Which needed adaptation?
- **Surprises**: What took longer/was easier? What assumptions were wrong?
- **Next time**: How would we approach differently? What warning signs did we miss?

**The apex_reflect call is sacred** - it's how the system learns. Include evidence that helps future tasks avoid our mistakes.

<phase-execution>
**Gate**: phase="DOCUMENTER" (apex_task_complete ONLY allowed here)
</phase-execution>

**BEFORE apex_task_complete** (all must be true):
☐ Current phase is DOCUMENTER (via apex_task_context)
☐ Checkpoints exist for all 5 phases
☐ Documentation updated (if task affected workflow/architecture)
☐ Claimed patterns exist in context_pack from Step 4

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

</reference-section>

### Final Report to User

✅ **Result**: [Task title] - [Primary achievement]
📊 **Metrics**: Complexity X/10, Files modified/created, Tests pass/fail, Cache hit rate
💬 **Summary**: [Concise summary]
📚 **Patterns**: Applied X, Discovered Y, Reflection ✅
⏭️ **Next steps**: [Recommendations]

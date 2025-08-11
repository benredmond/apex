<!-- 
APEX COMPOSED PROMPT FOR NON-CLAUDE AI PLATFORMS
Generated from: src/commands/execute/task.md
This contains the EXACT same content Claude sees, with subagents inlined.
-->

# Execute.Task - Process Tasks with APEX Intelligence

**Domain**: Execution
**Purpose**: Implement tasks using intelligent 5-phase workflow
**Hierarchy**: Works on tasks created by planning phase

## Quick Reference

**When to use**: Implementing any development task (features, bugs, refactors)
**Typical duration**: 1-4 hours depending on complexity
**Complexity**: Adaptive (uses intelligence to determine approach)
**Prerequisites**: Task file in .simone/ directory
**Output**: Completed implementation with tests and documentation

## Core Workflow

**CREATE A TODO LIST** with exactly these 7 items:

1. Analyse scope from argument
2. Identify task file
3. Execute Intelligence Phase
4. Analyse the task and determine current phase
5. Validate task readiness
6. Set status to in_progress
7. Execute phases until task complete

**Note**: TODO items correspond to workflow steps, not section numbers. Some steps have detailed sections, others are quick actions.

**IMPORTANT SUBAGENT RULE**: Subagents MUST NOT create .md files or documentation files in any phase except DOCUMENTER. They should return their analysis as structured text responses only. No reports, no markdown files, no documentation files - just return the information directly.

### Phase Execution Flow (TODO Item 7)

Execute the current phase based on task.current_phase:

- Read the phase section (ARCHITECT, BUILDER, etc.)
- Complete all phase actions
- Phase will update current_phase when done
- Continue with next phase until DOCUMENTER completes

**Phase Progression**: ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER

## 1 · Analyse scope from argument

<$ARGUMENTS> ⇒ Task ID, Sprint ID, or empty (select next open task in current sprint).

## 2 · Identify task file

Search .simone/03_ACTIVE_SPRINTS/, .simone/05_ARCHIVED_SPRINTS/, and .simone/04_GENERAL_TASKS/.
If no open task matches, pause and ask the user how to proceed.

## 3 · Execute Intelligence Phase (runs after task identification)

**INTELLIGENCE PROMPT**: "Analyze this task to predict patterns, complexity, and optimal approach. DO NOT implement, only analyze."

### 3.1 · Gemini Integration Configuration

<details>
<summary><strong>Gemini Integration Details</strong></summary>

**GEMINI USAGE**: Targeted analysis at complexity thresholds for maximum value.

```yaml
gemini_integration:
  command: npx https://github.com/google-gemini/gemini-cli -p "<prompt>"
  benefits:
    - Gives Gemini full context in the codebase
    - More powerful analysis with file awareness
    - Better architectural recommendations

  thresholds_justification:
    - Complexity < 5: Simple tasks, patterns suffice ($0 cost)
    - Complexity 5-6: Gemini review catches edge cases (~$0.05/task)
    - Complexity 7+: Gemini architecture prevents costly mistakes (~$0.10/task)

  usage_rules:
    - ONLY targeted, deep analysis at key decision points
    - Give Gemini deep context when using it
    - When interacting with Gemini, act as a world class prompt engineer
    - ENGAGE IN DIALOGUE: Have back-and-forth discussions with Gemini
    - Continue conversation until reaching consensus or clear action plan
    - Ask follow-up questions based on Gemini's responses
    - Challenge assumptions and explore alternatives together

  parallel_execution_note: |
    - Intelligence operations MUST use parallel Task agents
    - Group by data source to minimize conflicts
    - Aggregate results before display
    - Fall back to sequential if parallel fails

  discussion_guidelines: |
    HAVING PRODUCTIVE DISCUSSIONS WITH GEMINI:

    1. Start with Context:
       - Always provide task context and current thinking
       - Share relevant code snippets or architecture decisions
       - Explain what you've already considered

    2. Iterative Refinement:
       - Don't accept first answer as final
       - Ask "What are the trade-offs of this approach?"
       - Probe with "What edge cases am I missing?"
       - Challenge with "Is there a simpler/better way?"

    3. Collaborative Problem-Solving:
       - Treat Gemini as a peer reviewer
       - Share your concerns and get second opinions
       - Work together to find optimal solutions
       - Build on each other's ideas

    4. Document the Journey:
       - Keep track of key insights from discussion
       - Note why certain approaches were rejected
       - Record consensus decisions and rationale
       - Include important caveats or warnings raised

    5. Know When to Stop:
       - When you have clear, actionable next steps
       - When all major concerns are addressed
       - When further discussion yields diminishing returns
       - When you need to test ideas in practice
```

</details>

**Execute in parallel using Task agents:**

```yaml
parallel_intelligence_analysis:
  - Extract keywords from task argument/description
  - Search for configuration/system change history in completed tasks
  - Pattern match against CONVENTIONS.md and CONVENTIONS.pending.md
  - Gather context according to INTELLIGENCE_TRIGGERS.md
  - Check failures.jsonl for rollback/revert patterns
  - Calculate complexity factors with change history weight
```

### 3.2 · Calculate Complexity Score

**Complexity Scoring (1-10 scale):**

- Base score: 1
- Number of systems involved: +1 per system beyond first
- Authentication/security mentions: +2
- Database/state management: +2
- UI/UX complexity: +1-3 (based on component count)
- Testing requirements: +1
- External API integrations: +2
- Cross-team dependencies: +1

**Gemini Integration Thresholds:**

- Complexity < 5: No Gemini involvement
- Complexity 5-6: Gemini REVIEWER only
- Complexity 7+: Gemini ARCHITECT + REVIEWER

### 3.3 · Load Historical Intelligence (PARALLEL EXECUTION)

**Pattern System Overview:**

```yaml
pattern_format:
  id: "[TYPE:CATEGORY:SPECIFIC]"
  types:
    CMD: Command patterns (git, npm, pytest)
    PAT: Code patterns (async, error handling)
    FIX: Failure fixes (known issues)
    ARCH: Architecture patterns
    PROJ: Project-specific patterns

trust_score:
  initial: 3 stars (★★★☆☆)
  success: ×1.05 (max 5★)
  failure: ×0.85 (min 1★)
  promotion: 3+ uses with 80%+ success → CONVENTIONS.md

pattern_locations:
  active: .simone/CONVENTIONS.md (91 patterns)
  pending: .simone/CONVENTIONS.pending.md (50+ patterns)
  project: .simone/10_KNOWLEDGE/PROJECT_PATTERNS.md
  failures: .simone/09_LEARNING/failures.jsonl
  metadata: .simone/PATTERN_METADATA.json
```

**Execute parallel intelligence gathering:**
Use the specialized intelligence-gatherer subagent for comprehensive analysis:

```markdown
<!-- BEGIN INLINED SUBAGENT: intelligence-gatherer -->

Analyze task [TASK_ID] for:
- Pattern matching from CONVENTIONS.md and CONVENTIONS.pending.md
- System change history (replacements, migrations, rollbacks)
- Hidden dependencies and unstated assumptions
- Implementation archaeology and git history
- Similar tasks and their outcomes
- Predicted failures based on historical data


**intelligence-gatherer Implementation:**

You are executing the intelligence-gatherer subagent role. Your purpose is to orchestrate comprehensive intelligence gathering and context assembly.

Execute these steps in order:

1. **Pattern Discovery**
   - Call apex_patterns_lookup with the task description and context
   - Note all returned patterns with their trust scores and usage counts
   - Identify which patterns are most relevant (score > 0.7)

2. **Similar Task Analysis**
   - Call apex_task_find_similar to find related completed tasks
   - Extract key learnings and implementation approaches from similar tasks
   - Note any failures or issues encountered in similar work

3. **Complexity Assessment**
   - Count the number of systems/components involved
   - Assess integration points and dependencies
   - Calculate complexity score (1-10 scale) based on:
     * Number of files to modify
     * External dependencies
     * Testing requirements
     * Security considerations

4. **Risk Prediction**
   - Identify potential failure points based on historical data
   - For each risk, note prevention strategies
   - Assign probability scores (0.0-1.0) to each risk

5. **Context Assembly**
   - Compile all findings into a structured YAML format
   - Include: complexity score, applicable patterns, risks, similar tasks, recommendations

Return your complete analysis as structured YAML.
<!-- END INLINED SUBAGENT: intelligence-gatherer -->
```

**PARALLELISM NOTE**: The intelligence-gatherer subagent internally executes multiple searches in parallel:

- Pattern searches across convention files (parallel)
- Git history analysis (parallel)
- Task similarity matching (parallel)
- Failure pattern detection (parallel)
- Dependency mapping (parallel)
  This provides the same parallelism benefits as multiple Task agents but with better coordination.

**Intelligence-gatherer subagent will:**

- Execute searches in parallel for efficiency
- Aggregate and deduplicate results
- Prioritize patterns by trust score
- Provide structured intelligence report
- **NO .md FILES**: Return analysis as text response only

**Result Aggregation:**
After parallel execution completes, aggregate results:

1. Merge pattern findings by trust score (highest first)
2. Deduplicate similar patterns
3. Group failures by category
4. Rank similar tasks by relevance score

<details>
<summary><strong>Intelligence Loading Details</strong></summary>

**Note: These operations are now executed in parallel batches above**

```yaml
historical_data_loading:
  - Search 09_LEARNING/TASK_LEARNINGS.md for similar task keywords
  - Extract patterns from CONVENTIONS.md with trust scores
  - Check CONVENTIONS.pending.md for emerging patterns
  - Load project patterns from KNOWLEDGE/PROJECT_PATTERNS.md
  - Search 09_LEARNING/failures.jsonl for error prevention patterns
  - Check PATTERN_METADATA.json for usage statistics
  - Check INTELLIGENCE_TRIGGERS.md for any triggers
  - Distinguish between types: CMD, PAT, FIX, ARCH, PROJ
  - Prioritize by trust score (5★ > 4★ > 3★)
  - Look for similar complexity scores in past tasks
```

</details>

### 3.4 · Display Intelligence Report

```
┌─────────────────────────────────────────────┐
│ 📊 Task Intelligence Report                 │
├─────────────────────────────────────────────┤
│ Complexity: X/10 (factors...)              │
│ Similar Tasks: TXX (Xh), TXX (Xh)          │
│ Pattern Analysis:                           │
│   - Active: 91 patterns (avg ★★★★☆)       │
│   - Pending: 50+ patterns (testing)        │
│   - Relevant: X patterns for this task     │
│ Known Risks: [from 09_LEARNING/failures.jsonl] │
│ Suggested Approach: [based on analysis]    │
│ Gemini Integration: [YES/NO] at phase X    │
└─────────────────────────────────────────────┘
```

### 3.5 · Store Intelligence Context

Create structured intelligence context for phase injection:

```yaml
# === INTELLIGENCE CONTEXT ===
intelligence:
  relevant_patterns:
    - id: PAT:CATEGORY:NAME
      trust: ★★★★☆
      usage_context: "When to apply this pattern"
      code_template: |
        # Pre-filled code template
  similar_tasks:
    - task_id: TX99
      similarity: 0.85
      duration: "2h actual vs 4h estimated"
      key_learnings: ["Use pattern X", "Avoid approach Y"]
      implementation_path: "path/to/similar/implementation.js"
  predicted_failures:
    - pattern: "F001"
      probability: 0.7
      prevention: "Apply FIX:CATEGORY:NAME pattern"
      context: "Occurs when implementing X without Y"
  complexity_factors:
    actual: 6
    reasoning: "Multiple systems + UI complexity"
  recommended_approach: |
    Based on analysis, recommend:
    1. Start with pattern PAT:X:Y from TX99
    2. Pre-apply failure prevention for F001
    3. Use parallel execution for file updates

# ===
```

### 3.6 · Intelligence Display Standards

Present intelligence insights consistently across all phases:

```yaml
display_format:
  inline_hints:
    format: "💡 Intelligence: [insight]"
    example: "💡 Intelligence: TX99 used PAT:UI:TOOLTIP successfully here"

  code_comments:
    format: "// [PATTERN_ID] ★★★★☆ (X uses, Y% success) - Intelligence: [context]"
    example: "// [PAT:TEST:MOCK] ★★★★☆ (45 uses, 92% success) - Intelligence: Similar to TX99 line 125"

  warning_blocks:
    format: |
      ⚠️ INTELLIGENCE WARNING: [Predicted Issue]
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      Probability: X% based on Y similar cases
      Prevention: [Specific action to take]
      Reference: [Task IDs where this occurred]
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 4 · Analyse the task and determine current phase

Read the task file and check:

- `current_phase` in frontmatter (default: ARCHITECT if not present)
- Phase history to understand what's been done
- Any existing handoff documentation

### 4.1 · Determine task type for staged context loading

**STAGED CONTEXT LOADING**: Use the context-loader subagent for intelligent context management:

```markdown
<!-- BEGIN INLINED SUBAGENT: context-loader -->

Classify and load minimal context for task [TASK_ID]:
- Analyze task type based on keywords and description
- Load only relevant files (~20-30k tokens)
- Prepare recommendations for additional context if needed


**context-loader Implementation:**

You are executing the context-loader subagent role. Your purpose is to load minimal, relevant context based on task requirements.

Execute these steps:

1. **Classify Task Type**
   - Analyze keywords and description to determine task category
   - Categories: feature, bug_fix, refactor, test, docs, performance

2. **Prioritize Files**
   - Based on task type, identify most relevant files
   - Use grep to search for related code patterns
   - Rank files by relevance score

3. **Load Context Strategically**
   - Start with highest priority files
   - Track token count as you load
   - Stop before reaching token budget (typically 30k tokens)

4. **Organize Loaded Context**
   - Group by: primary files, supporting files, test files, config files
   - Note relationships between files
   - Identify modification points

Return a structured list of loaded files with relevance scores and purpose.
<!-- END INLINED SUBAGENT: context-loader -->
```

**Context-loader subagent will:**

- Classify task as: test_fix, feature_implementation, bug_fix, refactor, or documentation
- Load appropriate patterns, files, and documentation (in parallel)
- Track token usage to stay within limits
- Provide relevance scores for loaded items
- **NO .md FILES**: Return context summary as text response only

**PARALLELISM**: The subagent loads multiple context sources concurrently:

- Pattern files (CONVENTIONS.md, etc.) - parallel read
- Relevant code files - parallel glob/read
- Documentation - parallel fetch
- Similar task analysis - parallel search

### 4.2 · Execute parallel validation

**CRITICAL CONTEXT VALIDATION:** Leverage parallelism for efficiency:

```markdown
# Execute context validation using parallel approaches:

# Option 1: Use specialized subagents in parallel (ONE message):

<!-- BEGIN INLINED SUBAGENT: context-loader -->

Load requirements and specifications for task [TASK_ID]


**context-loader Implementation:**

You are executing the context-loader subagent role. Your purpose is to load minimal, relevant context based on task requirements.

Execute these steps:

1. **Classify Task Type**
   - Analyze keywords and description to determine task category
   - Categories: feature, bug_fix, refactor, test, docs, performance

2. **Prioritize Files**
   - Based on task type, identify most relevant files
   - Use grep to search for related code patterns
   - Rank files by relevance score

3. **Load Context Strategically**
   - Start with highest priority files
   - Track token count as you load
   - Stop before reaching token budget (typically 30k tokens)

4. **Organize Loaded Context**
   - Group by: primary files, supporting files, test files, config files
   - Note relationships between files
   - Identify modification points

Return a structured list of loaded files with relevance scores and purpose.
<!-- END INLINED SUBAGENT: context-loader -->

<!-- BEGIN INLINED SUBAGENT: intelligence-gatherer -->

Gather targeted codebase context based on task type classification


**intelligence-gatherer Implementation:**

You are executing the intelligence-gatherer subagent role. Your purpose is to orchestrate comprehensive intelligence gathering and context assembly.

Execute these steps in order:

1. **Pattern Discovery**
   - Call apex_patterns_lookup with the task description and context
   - Note all returned patterns with their trust scores and usage counts
   - Identify which patterns are most relevant (score > 0.7)

2. **Similar Task Analysis**
   - Call apex_task_find_similar to find related completed tasks
   - Extract key learnings and implementation approaches from similar tasks
   - Note any failures or issues encountered in similar work

3. **Complexity Assessment**
   - Count the number of systems/components involved
   - Assess integration points and dependencies
   - Calculate complexity score (1-10 scale) based on:
     * Number of files to modify
     * External dependencies
     * Testing requirements
     * Security considerations

4. **Risk Prediction**
   - Identify potential failure points based on historical data
   - For each risk, note prevention strategies
   - Assign probability scores (0.0-1.0) to each risk

5. **Context Assembly**
   - Compile all findings into a structured YAML format
   - Include: complexity score, applicable patterns, risks, similar tasks, recommendations

Return your complete analysis as structured YAML.
<!-- END INLINED SUBAGENT: intelligence-gatherer -->

# Option 2: For quick parallel operations, use standard Task agents:

<Task description="Load API contracts">
Load relevant API specifications and contracts
</Task>

<Task description="Find test patterns">
Search for relevant test patterns and examples
</Task>

<Task description="Check dependencies">
Verify all required dependencies are available
</Task>
```

**REMEMBER**: Always send multiple Task/subagent invocations in ONE message for true parallel execution.

## 5 · Validate task readiness

**VALIDATION PROMPT**: "You are validating task readiness. This is NOT a phase - it's a pre-execution checkpoint. You MUST NOT proceed with execution if critical information is missing."

Before investing time in architecture and implementation, validate the task is ready for execution:

### 5.1 · Task Specification Validation

**Execute validation checks in parallel:**

For validation, execute all three checks in parallel using a single message with multiple Task invocations:

```markdown
# Execute all three validation tasks in ONE message for true parallel execution:

<Task description="Validate task structure">
- Read the task file completely
- Check: Has clear description that explains the goal?
- Check: Contains acceptance criteria (even if high-level)?
- Check: Any "TBD" or "TODO" sections that would block implementation?
- Report: Validation status and any missing elements
</Task>

<Task description="Verify referenced resources">
- Check: Do all mentioned files/components exist?
- Check: Is referenced documentation accessible?
- Check: Are parent tasks (if any) completed?
- Use Glob/Grep to verify file existence
- Report: List of missing resources (if any)
</Task>

<Task description="Assess requirement clarity">
- Analyze: Are success criteria measurable?
- Analyze: Can technical approach be determined?
- Check: Any contradictory requirements?
- Report: Clarity assessment and any ambiguities
</Task>
```

**IMPORTANT**: Send all three Task invocations in a single message to ensure parallel execution.

### 5.2 · Context Availability Check

Verify you have access to necessary context:

- Required codebases/files are accessible
- Any mentioned APIs or services are documented
- Dependencies and their versions are clear
- Test data/credentials (if needed) are available

### 5.3 · Ambiguity Detection and Clarification

Before proceeding with validation decision, check for ambiguous requirements:

**Common Ambiguity Patterns:**

1. **Subjective Analysis** - "analyze/evaluate/assess what you think", "check quality" without criteria
   - Example from T169: "analyze the output to see what you think" → Need specific evaluation criteria
2. **Undefined Terms** - Technical terms or phrases not defined in task context
   - Example from T169: "simple modes" → Which parameter combinations qualify as "simple"?
3. **Missing Output Format** - Analysis/report tasks without specified format
   - Example: "provide analysis" → Should this be a metrics table, narrative report, or bullet points?
4. **Unmeasurable Criteria** - Success metrics without measurement method
   - Example from T169: "quality scores > 0.75" → How is "quality" calculated? What metrics compose it?
5. **Pipeline Assumptions** - Assuming tools/frameworks produce expected output without verification
   - Example from T169: Evaluation framework produced empty metrics {} → Need to verify output capability

**If ambiguities detected:**

```markdown
## ⚠️ Clarification Needed

I found the following ambiguities that need clarification before proceeding:

1. **[Ambiguity Type]**: "[quoted text from task]"
   → [Specific clarifying question]

2. **[Ambiguity Type]**: "[quoted text from task]"
   → [Specific clarifying question]

Please provide clarifications to continue with the task.
```

**Example Questions:**

- Subjective analysis: "What specific criteria should I use to evaluate [X]? (e.g., response naturalness, vocabulary usage, coherence)"
- Undefined terms: "What does '[term]' mean in this context? Please provide specific examples or criteria."
- Missing output: "What format should the [analysis/report] take? (e.g., bullet points, metrics table, narrative summary)"
- Unmeasurable criteria: "How should I measure '[metric]'? What specific calculation or assessment method should I use?"

**After receiving clarifications:**

1. Add to task file:

   ```markdown
   ## Validation Clarifications

   _Added during validation phase to clarify ambiguous requirements:_

   - **[Original ambiguous text]**: [User's clarification]
   - **[Original ambiguous text]**: [User's clarification]
   ```

2. Re-run validation with clarified requirements
3. Continue to validation decision gate

**Real Example - How T169 Would Have Been Handled:**

```markdown
## ⚠️ Clarification Needed

I found the following ambiguities that need clarification before proceeding:

1. **Subjective Analysis**: "analyze the output to see what you think"
   → What specific aspects of the AI responses should I analyze? (e.g., coherence, vocabulary diversity, cultural appropriateness, response length)

2. **Undefined Term**: "simple modes"
   → Which parameter combinations should I test? Please specify exact values for temperature, top_p, etc.

3. **Unmeasurable Criteria**: "quality scores > 0.75"
   → How should quality be calculated? What metrics should compose the quality score?

4. **Missing Output Format**: Task asks for analysis but doesn't specify format
   → What format should the analysis take? (e.g., detailed report with examples, metrics table, comparison chart)

Please provide clarifications to continue with the task.
```

### 5.4 · Validation Decision Gate

**STOP if any of these conditions are true:**

- ❌ Task description provides insufficient context to understand the goal
- ❌ No acceptance criteria defined (even high-level)
- ❌ Critical "TODO" or "TBD" sections that block implementation
- ❌ Referenced files/systems don't exist and are required
- ❌ Contradictory or impossible requirements detected
- ❌ Technical approach cannot be determined from available information
- ❌ Ambiguities remain after clarification request

**If validation fails:**

1. Update task status to "blocked"
2. Document specific missing information in task file:

   ```markdown
   ## Validation Failed - Blocked

   **Missing Requirements:**

   - [ ] Specific item 1
   - [ ] Specific item 2

   **Questions for Task Author:**

   - Question 1?
   - Question 2?
   ```

3. Report to user with actionable next steps
4. STOP execution - do not proceed to ARCHITECT

**If validation passes:**

- Continue to next step (Set status to in_progress)
- Pass validated context forward:
  - Confirmed file/component locations
  - Task type classification from section 4.1
  - List of available resources and APIs
  - Any constraints or special requirements identified
  - Any clarifications received during validation
- This context will enhance the intelligence phase pattern matching

## 6 · Set status to in_progress

- Find out the current local timestamp (YYYY-MM-DD HH:MM)
- Update front-matter to **status: in_progress** and set Updated time
- Update current_phase if needed

**AUTO-TRACKING**: Create a minimal tracking block in the task file:

```yaml
# === TRACKING (remove after complete) ===
decision: [one line - what approach?]
files: [count only, list at completion]
patterns: {id: ✓|⚠|✗}
errors: [only if they occur]
# ===

# Example filled out:
# === TRACKING (remove after complete) ===
decision: Grid-aligned math scale with tiered fonts
files: 9 created, 1 modified
patterns: {PAT:CSS:TAILWIND_V4: ✓, F021: ✓}
errors: none
# ===
```

## 7 · Execute ARCHITECT phase

**PHASE PROMPT**: "You are in ARCHITECT phase. You MUST NOT write implementation code. Focus on research, design, and specifications only. Think hard before answering. DO NOT create any .md files or documentation - only update the task file with your handoff."

<details>
<summary><strong>Advanced ARCHITECT Features</strong></summary>

### Intelligence Injection

Display relevant architecture patterns from intelligence context:

```
📋 Relevant Architecture Patterns:
- [ID] Pattern Name (★★★☆☆ trust) - [Brief description]
- [ID] Pattern Name (★★★★☆ trust) - [Brief description]
```

### Gemini Collaboration (Complexity ≥ 7)

```yaml
gemini_architect:
  trigger: complexity >= 7 OR security_involved
  prompt: |
    Review this architecture plan for:
    - Security vulnerabilities
    - Performance bottlenecks
    - Missing edge cases
    - Better alternatives
  value: Prevents costly refactors later
```

</details>

**If current_phase == ARCHITECT:**

### 🧠 Intelligence Injection Point

Before starting architecture design, review intelligence context:

```yaml
intelligence_review:
  - Display relevant patterns with trust scores and usage contexts
  - Show implementation paths from similar tasks
  - Highlight predicted failure points with prevention strategies
  - Present recommended approach from intelligence analysis
```

**Example display:**

```
┌─────────────────────────────────────────────┐
│ 📊 Intelligence Recommendations             │
├─────────────────────────────────────────────┤
│ Similar Implementation:                     │
│ • TX99 (85% similar) - See path/to/impl   │
│ • Key insight: Used PAT:UI:TOOLTIP_ARROW  │
│                                            │
│ ⚠️ Predicted Issues:                       │
│ • F001: Test mocks (70% probability)       │
│   → Pre-apply FIX:TEST:MOCK pattern       │
│                                            │
│ 🎯 Recommended Patterns:                   │
│ • PAT:UI:COMPONENT (★★★★★) - Auto-apply   │
│ • PAT:TEST:MOCK (★★★★☆) - For testing    │
└─────────────────────────────────────────────┘
```

### 🔍 Mandatory Assumption Verification

**CRITICAL**: Before making ANY architectural decisions, you MUST verify your assumptions about the current state. This gate prevents costly mistakes from proceeding with incorrect assumptions.

#### State Archaeology (What Created Current State)

**Verify architectural assumptions using specialized subagent:**

```markdown
<!-- BEGIN INLINED SUBAGENT: architecture-validator -->

Validate all assumptions for task [TASK_ID]:
- Trace current state origin and change history
- Discover what systems were replaced and why
- Map dependencies and impact radius
- Find previous attempts and failures
- Identify any contradictions or conflicts
- Check for rollback/revert patterns


**architecture-validator Implementation:**

You are executing the architecture-validator subagent role. Your purpose is to validate architectural assumptions and trace system history to prevent incorrect implementations.

Execute these validation steps:

1. **Current State Origin**
   - Search git history for when current implementation was created
   - Identify what it replaced and why
   - Check for reverts or rollbacks in history

2. **Dependency Mapping**
   - Find all files that import/use the current component
   - Identify downstream impacts of changes
   - Check for hidden dependencies

3. **Previous Attempts**
   - Search for similar implementations in history
   - Look for removed/deprecated code
   - Check task history for related failures

4. **Assumption Verification**
   - List all architectural assumptions
   - Provide evidence for each (file:line references)
   - Flag any unverified assumptions as risks

5. **Conflict Detection**
   - Check if proposed changes conflict with existing patterns
   - Identify any anti-patterns that match
   - Verify compatibility with current architecture

Return validation results with evidence for each finding.
<!-- END INLINED SUBAGENT: architecture-validator -->
```

**PARALLELISM WITHIN SUBAGENT**:

- Git archaeology operations (parallel git commands)
- Configuration change searches (parallel grep)
- Dependency mapping (parallel file analysis)
- Task history searches (parallel .simone/ searches)
  All executed concurrently and results aggregated

**Architecture-validator subagent will:**

- Execute comprehensive git archaeology
- Search for configuration changes and migrations
- Verify assumptions with evidence
- Flag critical issues that require stopping
- **NO .md FILES**: Return validation results as text response only

#### Historical Context Verification

```yaml
historical_checks:
  - Previous attempts: "Has this been tried before? What happened?"
  - Failure patterns: "Why is the current solution this way?"
  - Architectural decisions: "What constraints led to current design?"
  - Team preferences: "Are there documented reasons for current choices?"
```

#### Assumption Verification Gate

**Document ALL assumptions with evidence:**

```markdown
## Verified Assumptions

✅ **Assumption**: [Current system uses X]
**Evidence**: Found in <file:line>, implemented in TX123
**History**: Changed from Y to X in TX111 due to [reason]

✅ **Assumption**: [No other systems depend on this]
**Evidence**: Grep found no imports/references
**Verified**: Checked all service files and tests

❌ **Assumption**: [This is the first implementation]
**Evidence**: TX089 previously implemented this
**Correction**: Need to understand why it was removed/changed
```

**MANDATORY VERIFICATION CHECKLIST:**

- [ ] Current state origin traced (what task/commit created it)
- [ ] Change history discovered (what it replaced and why)
- [ ] Dependencies mapped (what will be affected)
- [ ] Previous attempts found (what failed before)
- [ ] Contradictions identified (conflicting requirements/history)

**STOP if you find:**

- 🚨 Current state was created by reverting a previous change
- 🚨 Task asks to implement something previously removed
- 🚨 Hidden dependencies not mentioned in task description
- 🚨 Conflicting architectural decisions in history

**If verification reveals critical context:**

1. Update task with "## Critical Context Discovered" section
2. Revise architectural approach based on findings
3. Document why previous approaches failed
4. Get user confirmation if task fundamentally conflicts with discoveries

5. **Check prior learnings (PARALLEL EXECUTION):**
   For initial research, you can execute multiple quick searches in parallel:

   ```markdown
   # Option A: Use multiple specialized subagents in parallel:

   <!-- BEGIN INLINED SUBAGENT: intelligence-gatherer -->

   Find all relevant patterns for [TASK_ID] architecture design
   

**intelligence-gatherer Implementation:**

You are executing the intelligence-gatherer subagent role. Your purpose is to orchestrate comprehensive intelligence gathering and context assembly.

Execute these steps in order:

1. **Pattern Discovery**
   - Call apex_patterns_lookup with the task description and context
   - Note all returned patterns with their trust scores and usage counts
   - Identify which patterns are most relevant (score > 0.7)

2. **Similar Task Analysis**
   - Call apex_task_find_similar to find related completed tasks
   - Extract key learnings and implementation approaches from similar tasks
   - Note any failures or issues encountered in similar work

3. **Complexity Assessment**
   - Count the number of systems/components involved
   - Assess integration points and dependencies
   - Calculate complexity score (1-10 scale) based on:
     * Number of files to modify
     * External dependencies
     * Testing requirements
     * Security considerations

4. **Risk Prediction**
   - Identify potential failure points based on historical data
   - For each risk, note prevention strategies
   - Assign probability scores (0.0-1.0) to each risk

5. **Context Assembly**
   - Compile all findings into a structured YAML format
   - Include: complexity score, applicable patterns, risks, similar tasks, recommendations

Return your complete analysis as structured YAML.
<!-- END INLINED SUBAGENT: intelligence-gatherer -->

   <!-- BEGIN INLINED SUBAGENT: context-loader -->

   Load architecture documentation and similar implementations
   

**context-loader Implementation:**

You are executing the context-loader subagent role. Your purpose is to load minimal, relevant context based on task requirements.

Execute these steps:

1. **Classify Task Type**
   - Analyze keywords and description to determine task category
   - Categories: feature, bug_fix, refactor, test, docs, performance

2. **Prioritize Files**
   - Based on task type, identify most relevant files
   - Use grep to search for related code patterns
   - Rank files by relevance score

3. **Load Context Strategically**
   - Start with highest priority files
   - Track token count as you load
   - Stop before reaching token budget (typically 30k tokens)

4. **Organize Loaded Context**
   - Group by: primary files, supporting files, test files, config files
   - Note relationships between files
   - Identify modification points

Return a structured list of loaded files with relevance scores and purpose.
<!-- END INLINED SUBAGENT: context-loader -->

   # Option B: Use parallel Task agents for quick searches:

   <Task description="Search established patterns">
   Search PROJECT_PATTERNS.md, CONVENTIONS.md for architecture patterns
   </Task>

   <Task description="Find similar implementations">
   Search codebase for similar architectural approaches
   </Task>
   ```

   **PARALLELISM TIP**: Send multiple Task/subagent invocations in ONE message for true parallel execution.

6. Research existing patterns in codebase
7. Design solution approach avoiding known pitfalls
8. Create specifications
9. **Gemini Architecture Review** (if complexity >= 7):
   Use the gemini-orchestrator subagent for productive discussions:

   ```markdown
   <!-- BEGIN INLINED SUBAGENT: gemini-orchestrator -->

   Facilitate architecture review for task [TASK_ID] (complexity: [X]):
   - Provide comprehensive context and current plan
   - Focus on: security, performance, edge cases, alternatives
   - Guide iterative discussion to consensus
   - Document key insights and decisions
   

**gemini-orchestrator Implementation:**

You are executing the gemini-orchestrator subagent role. Your purpose is to orchestrate productive discussions with Gemini for architecture reviews and complex problem solving.

Facilitate an iterative discussion with Gemini:

1. **Context Setting**
   - Provide Gemini with full task context
   - Share current implementation/design
   - Include pattern cache and intelligence findings
   - State specific areas for review

2. **Initial Analysis Request**
   - Ask Gemini to review for:
     * Logic errors or edge cases
     * Security vulnerabilities  
     * Performance concerns
     * Better alternatives

3. **Iterative Discussion**
   - For each Gemini response:
     * Ask clarifying questions
     * Challenge assumptions
     * Request specific examples
     * Explore trade-offs
   - Continue until consensus reached

4. **Solution Synthesis**
   - Compile agreed-upon improvements
   - Document key decisions made
   - Note any unresolved concerns
   - Create action items

5. **Knowledge Capture**
   - Extract reusable insights
   - Identify new patterns discovered
   - Document decision rationale

Return the complete discussion summary with actionable outcomes.
<!-- END INLINED SUBAGENT: gemini-orchestrator -->
   ```

   **Gemini-orchestrator subagent will:**
   - Set context effectively
   - Ask probing follow-up questions
   - Challenge assumptions
   - Build toward actionable solutions
   - Document the discussion journey
   - **NO .md FILES**: Return discussion summary as text response only

10. Document decisions in handoff section
11. Update phase to BUILDER when complete

**Key outputs:**

- Technical decisions with rationale
- File/API specifications
- Patterns to follow (reference CONVENTIONS.md and others)
- Complete ARCHITECT → BUILDER handoff section

**PATTERN TRACKING**: Update tracking block with patterns selected:

```yaml
# patterns_used: ["ARCH:STATE:FRONTEND", "ARCH:API:STRUCTURE"]
```

**HANDOFF TEMPLATE** (auto-populate what you can):

```markdown
## ARCHITECT → BUILDER Handoff

### Architecture Decision

[REUSE FROM: architecture_decision in tracking block]

### Files to Create/Modify

- [ ] path/to/file1 - purpose
- [ ] path/to/file2 - purpose

### Key Specifications

[Detailed specs here]
```

## 8 · Execute BUILDER phase

**PHASE PROMPT**: "You are in BUILDER phase. You MUST follow the ARCHITECT's specifications exactly. Do not redesign. DO NOT create any .md files or documentation - only implement code."

<details>
<summary><strong>Advanced BUILDER Features</strong></summary>

### Proactive Pattern Application

Before implementing, check pattern trust scores:

```yaml
pattern_application:
  Sources (in priority order): 1. CONVENTIONS.md (active patterns)
    2. PROJECT_PATTERNS.md (domain-specific)
    3. CONVENTIONS.pending.md (testing patterns)

  Decision process:
    - 5★ → Apply with confidence (verify context)
    - 4★ → Apply with verification
    - 3★ → Apply with caution
    - <3★ → Find alternative

  Always include trust comment:
    # [PAT:ERROR:HANDLING] ★★★★★ (156 uses, 100% success)
```

### Failure Prevention System

````yaml
failure_check:
  - Search failures.jsonl before modifications
  - If match found (frequency >= 5):
    ```
    ⚠️ FAILURE PREVENTION ALERT
    ─────────────────────────────────────────
    Pattern: F[ID] - [error description]
    Occurred: [X] times in tasks [T89, T112, ...]

    Root Cause: [detailed cause]
    Prevention: Apply [FIX:CATEGORY:NAME] pattern

    Example fix:
    [show code example from pattern]

    Trust Score: ★★★★☆ (Y uses, Z% success)
    ─────────────────────────────────────────
    ```

### Gemini Code Generation (Complexity ≥ 6)
For complex algorithms or logic not in patterns:

**Interactive Generation Process:**
1. **Initial Request:**
   ```bash
   npx https://github.com/google-gemini/gemini-cli -p "Generate code for: [specific requirements]
   - Language: [language]
   - Constraints: [constraints]
   - Context: [relevant context]"
````

2. **Refinement Discussion:**
   - Review generated code
   - Ask: "What trade-offs did you consider for this implementation?"
   - If concerns: "How could we improve [specific aspect]?"
   - For optimization: "What would be the performance implications of [alternative approach]?"

3. **Iterate Until:**
   - Code meets all requirements
   - Edge cases are handled
   - Performance considerations addressed
   - Style matches project patterns

- Continue dialogue to refine implementation
- Document key decisions from discussion

</details>

**If current_phase == BUILDER:**

### 🧠 Intelligence-Driven Implementation

Before implementing, the intelligence system prepares your workspace:

**1. Auto-Generated Code Templates:**
Based on intelligence analysis, pre-populate files with relevant patterns:

```yaml
template_generation:
  trigger: Pattern confidence > 80% AND trust_score >= ★★★★☆
  process:
    - Match task description to pattern contexts
    - Load code templates from similar successful tasks
    - Pre-fill with pattern code including trust comments
    - Highlight sections requiring customization
```

**Example Auto-Generated Template:**

```javascript
// AUTO-GENERATED FROM: TX99 (85% similar) + PAT:UI:TOOLTIP_ARROW
// CUSTOMIZE: Replace 'ComponentName' and adjust props

import { arrow } from "@floating-ui/react"; // [PAT:IMPORT:FLOATING_UI] ★★★★★

// Intelligence: TX99 used this exact pattern successfully
const TooltipComponent = () => {
  const arrowRef = useRef(null); // [PAT:UI:ARROW_REF] ★★★★★

  // PREDICTED ISSUE: Mock this in tests (F001)
  const { middlewareData } = useFloating({
    middleware: [
      arrow({ element: arrowRef }), // [PAT:UI:ARROW_MIDDLEWARE] ★★★★★
    ],
  });

  // TODO: Customize component logic here
};
```

**2. Failure Prevention Checkpoints:**

```yaml
Before writing code, check predicted failures:
failure_prevention:
  - Issue: [F001 description]
    Prevention: [Pre-applied fix code]
    Confidence: [X%]
```

**3. Similar Implementation Reference:**
Display relevant code from similar tasks in a side panel:

```yaml
reference_panel:
  - File: similar/task/implementation.js
  - Lines: 45-120 (most relevant section)
  - Key differences: [what to adapt]
```

**4. Pre-emptive Error Handling:**
Based on 09_LEARNING/failures.jsonl patterns, automatically add:

```python
# [FIX:ASYNC:SYNC] ★★★★★ (47 uses) - MongoDB is SYNC in this project
# WARNING: Do NOT use await with MongoDB operations
result = collection.find_one({"_id": id})  # No await!

# [FIX:MODULE:IMPORT] ★★★★★ (89 uses) - Import at usage location
from app.services.item_service import ItemService  # Import where used

# [FIX:TEST:MOCK] ★★★★☆ (23 uses) - Mock at test level, not module
@patch('app.services.external_api')
def test_function(mock_api):
    # Mocking pattern that actually works
```

**4. Smart Import Detection:**

```yaml
auto_imports:
  - Based on [PAT:IMPORT:*] patterns from CONVENTIONS.md
  - Common detections:
    * "HTTPException" → "from fastapi import HTTPException"
    * "Depends" → "from fastapi import Depends"
    * "pytest" → "import pytest" # [CMD:TEST:BE] requires PYTHONPATH
    * "capture_event" → "from app.core.analytics import capture_event"
  - Show: "🔧 Auto-imported X modules based on patterns"
  - Track import patterns for success rate
```

**5. Post-Generation Validation:**
After generating any code:

- Run syntax validation on generated content
- Check for known error patterns from failures.jsonl
- Apply automatic fixes for common issues:
  - `async async` → `async`
  - Missing semicolons (if project uses them)
  - Incorrect import syntax
- If unfixable errors found, regenerate the affected section

### FAILURE PRE-EMPTION SYSTEM

**Before ANY file modification, use the failure-predictor subagent:**

```markdown
<!-- BEGIN INLINED SUBAGENT: failure-predictor -->

Analyze planned changes for task [TASK_ID]:
- Operation types: [list operations]
- Files affected: [list files]
- Check against failures.jsonl patterns
- Calculate failure probabilities
- Provide prevention strategies


**failure-predictor Implementation:**

You are executing the failure-predictor subagent role. Your purpose is to predict likely failures based on historical patterns and provide preventive measures.

Execute these prediction steps:

1. **Historical Failure Analysis**
   - Search failure database for similar scenarios
   - Identify patterns with frequency > 3
   - Note root causes and fixes applied

2. **Risk Scoring**
   - For each identified risk:
     * Calculate probability (0.0-1.0)
     * Assess impact (low/medium/high)
     * Determine detection difficulty

3. **Prevention Strategies**
   - For each high-probability risk (>0.5):
     * Provide specific prevention steps
     * Reference successful mitigation patterns
     * Include code examples if available

4. **Early Warning Signs**
   - List symptoms to watch for
   - Provide detection commands/tests
   - Note recovery procedures

Return predictions as structured risk assessment with prevention plans.
<!-- END INLINED SUBAGENT: failure-predictor -->
```

**Failure-predictor subagent will:**

- Match operations against historical failures
- Calculate probability based on frequency and context
- Provide specific FIX patterns to apply
- Show example fixes from successful tasks
- **NO .md FILES**: Return predictions as text response only

**High-Risk Operations Alert:**

```yaml
high_risk_patterns:
  - Modifying authentication → Check F005, F011
  - Async/await changes → Check F002, F013, F089
  - Import modifications → Check F001, F049
  - Redis/cache operations → Check F003, F012
  - Test modifications → Check F006, F013
```

### Standard BUILDER Implementation

1. Read ARCHITECT handoff carefully
2. **With PROACTIVE PATTERNS**: Implementation now includes:
   - Auto-inserted pattern code with trust scores
   - Pre-filled error handling
   - Smart imports already added
   - Failure prevention alerts shown
3. Implement exactly as specified (patterns assist, not replace specs)
4. If spec unclear, document question (don't guess)
   - **If architect buy-in is required or specification needs revision, update phase to ARCHITECT and document the reasons.**
5. Create/modify code following documented patterns
6. Update phase to VALIDATOR when complete

**Key outputs:**

- Implemented code matching specifications
- List of files modified
- Complete BUILDER → VALIDATOR handoff section

**PATTERN TRACKING**: Update tracking with implementation patterns:

```yaml
patterns: {
    "PAT:ASYNC:TEST": ✓, # Worked perfectly
    "CMD:TEST:BE": ⚠, # Needed adjustment
    "FIX:MODULE": ✗, # Didn't work
  }
# Add new patterns to new_patterns list if discovered
```

**PARALLEL EXECUTION STRATEGIES:**

1. **Multiple File Modifications:**

   ```yaml
   parallel_implementation:
     - When updating similar patterns across files (e.g., imports, mocks)
     - Use MultiEdit for batch changes in single file
     - Use parallel Task agents for research across files
   ```

2. **Test-Driven Development:**

   ```yaml
   parallel_testing:
     - Run affected tests while implementing
     - Use separate terminal/Task for continuous test monitoring
     - Batch related test fixes together
   ```

3. **Pattern Application:**
   ```yaml
   pattern_reuse:
     - Check CONVENTIONS for exact patterns to apply
     - Use find/replace for consistent patterns
     - Apply known fixes from similar completed tasks
   ```

### PARALLEL FILE PROCESSING

When modifying multiple similar files, use parallel processing:

1. **Identify Batchable Operations:**

   ```yaml
   batchable_operations:
     - Multiple test files needing same pattern updates
     - Similar component files requiring same changes
     - Multiple API endpoints with same modification
     - Batch import updates across files
   ```

2. **Parallel Execution Pattern:**

   ```yaml
   # Instead of sequential:
   for file in files: modify(file)

   # Use parallel approaches:
   parallel_modifications:
     - Group files by modification type
     - Apply same change pattern to group
     - Use MultiEdit for single file with multiple changes
     - Use parallel Task agents for multiple files
   ```

3. **Parallel Implementation Strategy:**

   ```markdown
   # Execute multiple file modifications in ONE message:

   <Task description="Update test file group 1">
   Apply mock pattern to: Button.test, Input.test, Card.test
   </Task>

   <Task description="Update test file group 2">
   Apply mock pattern to: Form.test, Modal.test, Dialog.test
   </Task>

   <Task description="Fix import patterns">
   Update all import statements across modified files
   </Task>
   ```

4. **Example Implementation:**

   ```yaml
   # For test migration (like T144):
   test_groups:
     simple_components: [Button.test, Input.test, ...]
     complex_components: [ChatWindow.test, ...]

   parallel_execution:
     - Task 1: Migrate all simple_components (parallel)
     - Task 2: Update all imports (MultiEdit batch)
     - Task 3: Fix all mock patterns (parallel)
   ```

5. **Error Handling in Parallel:**
   - Collect all errors before stopping
   - Report which files succeeded/failed
   - Allow partial success with clear reporting
   - Provide rollback strategy if needed

6. **Progress Tracking:**
   ```yaml
   # Update tracking block with parallel progress:
   files: 15 processing (5 complete, 2 failed, 8 pending)
   ```

### SYNTAX VALIDATION GATE

Before completing BUILDER phase, validate all modified files:

1. **Automatic Syntax Check:**

   ```bash
   # For JavaScript/TypeScript files (frontend)
   cd frontend && npx eslint <file>
   # Or use project's lint command
   cd frontend && npm run lint -- <file>

   # For Python files (backend)
   cd backend && ruff check <file>
   # Check for syntax errors specifically
   cd backend && python -m py_compile <file>
   ```

2. **Common Error Detection:**
   - Double async keywords: `/async\s+async/`
   - Missing closing brackets/braces
   - Undefined variables in scope
   - Import syntax errors

3. **If syntax errors found:**
   - Fix immediately before proceeding
   - Add error pattern to tracking block
   - Do NOT transition to VALIDATOR with syntax errors

**SYNTAX CHECK GATE**: Must pass before updating phase to VALIDATOR

**EFFICIENCY TIPS:**

- Run tests as you build to catch issues early
- Use `git status` to auto-populate files_modified list
- If you need design clarification, add to tracking block instead of full phase switch
- Group similar changes and apply them in batches
- When fixing tests, identify common issues and fix all instances at once

## 9 · Execute VALIDATOR phase

**PHASE PROMPT**: "You are in VALIDATOR phase. You MUST run tests AND validate code quality. DO NOT fix code - only document issues. DO NOT create any .md files or reports - document issues in the task file handoff only."

**INTELLIGENCE INJECTION**: Predict likely test failures based on history:

```
⚠️ Predicted Test Risks:
- [Test type] failures likely (60% probability) - Similar to T093
- Common cause: [specific issue]
- Prevention: [specific action]
```

**If current_phase == VALIDATOR:**

### 🧠 Intelligence-Driven Validation

Before running standard tests, check intelligence predictions:

```yaml
predictive_validation:
  - Expected failures: [List from intelligence]
  - Did they occur? [Track prediction accuracy]
  - Prevention effectiveness: [Did pre-applied fixes work?]
```

**Validation Enhancement:**

```
┌─────────────────────────────────────────────┐
│ 🔍 Predictive Validation Results           │
├─────────────────────────────────────────────┤
│ Predicted Issues:                          │
│ ✅ F001: Prevented (mock pattern worked)   │
│ ❌ F023: Occurred (new context)            │
│ ➕ F045: Unexpected (not predicted)        │
│                                            │
│ Intelligence Accuracy: 66% (2/3)           │
│ → Update patterns for F023, F045          │
└─────────────────────────────────────────────┘
```

**Use the test-validator subagent for comprehensive validation:**

```markdown
<!-- BEGIN INLINED SUBAGENT: test-validator -->

Validate all changes for task [TASK_ID]:
- Modified files: [list files]
- Run syntax validation, linting, formatting checks
- Execute unit and integration tests
- Generate coverage report
- Categorize issues by severity


**test-validator Implementation:**

You are executing the test-validator subagent role. Your purpose is to execute comprehensive testing and validation including syntax, linting, and test coverage.

Execute validation in parallel where possible:

1. **Syntax Validation**
   - Check all modified files parse correctly
   - Run language-specific syntax checkers
   - Report any syntax errors with line numbers

2. **Linting & Formatting**
   - Run project linters (eslint, ruff, etc.)
   - Check code formatting standards
   - Note all warnings and errors

3. **Type Checking**
   - Run type checkers if available (TypeScript, mypy)
   - Report type errors with locations
   - Check interface compliance

4. **Test Execution**
   - Run unit tests for modified components
   - Execute integration tests
   - Generate coverage report
   - Run tests in parallel: frontend & backend

5. **Validation Summary**
   - Categorize issues: Critical/Warning/Info
   - Determine pass/fail status
   - Recommend next phase based on results

Return structured validation report with clear pass/fail status.
<!-- END INLINED SUBAGENT: test-validator -->
```

**Test-validator subagent parallelism:**

- Frontend tests + Backend tests (concurrent execution)
- Unit tests + Integration tests (parallel within each)
- Linting + Formatting + Type checking (parallel validation)
- Affected tests run first, then remaining tests
- Results aggregated into structured report
- **NO .md FILES**: Return validation results as text response only

**Example parallel execution inside subagent:**

```bash
# Runs concurrently:
frontend: npm run lint & npm run test & npm run format
backend: ruff check & pytest & mypy
```

4. **Validation Summary:**

   ```markdown
   ## Validation Results

   ### Code Quality

   - Linting: [PASS/FAIL] - X errors, Y warnings
   - Formatting: [PASS/FAIL] - X files need formatting
   - Type Check: [PASS/FAIL] - X type errors
   - Syntax: [PASS/FAIL] - All files parse correctly

   ### Tests

   - Unit Tests: X/Y passing
   - Integration Tests: X/Y passing
   - Coverage: X% (target: Y%)

   ### Issues Found

   1. [Critical] Syntax error in file.js:123
   2. [Warning] Linting error: unused variable
   3. [Info] Code formatting needed in 3 files
   ```

5. **Decision Logic:**
   - **If ANY critical issues (syntax errors, failing tests):**
     → Return to BUILDER phase with detailed issue list
   - **If only warnings/formatting issues:**
     → Document for REVIEWER phase consideration
   - **If all validations pass:**
     → Update phase to REVIEWER

**PARALLEL VALIDATION STRATEGIES:**

1. **Smart Test Execution:**

   ```yaml
   test_strategy:
     - Run affected tests first (based on files_modified)
     - Run unit tests and integration tests in parallel
     - Run frontend and backend tests concurrently
   ```

2. **Batch Analysis:**

   ```yaml
   parallel_analysis:
     - Group similar test failures together
     - Identify common root causes across failures
     - Check for pattern-based issues (e.g., all mock-related)
   ```

3. **Coverage Verification:**
   ```yaml
   coverage_check:
     - Run coverage for modified files specifically
     - Compare against acceptance criteria
     - Identify gaps early
   ```

**Key outputs:**

- Complete validation report
- Categorized issues (Critical/Warning/Info)
- Clear pass/fail status for each check
- Complete VALIDATOR → REVIEWER or VALIDATOR → BUILDER handoff

**PATTERN TRACKING**: Update with test patterns used:

```yaml
# patterns_used: [...existing, "CMD:TEST:COV", "PAT:TEST:ISOLATION"]
# errors_encountered: [...existing, "Test failure - pattern FIX:ASYNC:ACT applied"]
```

**AUTO-HANDOFF**: If all tests pass and acceptance criteria met:

```markdown
## VALIDATOR → REVIEWER Handoff

**Status: AUTO-PASS** ✅

- All tests passing
- Coverage: [X%] (meets target)
- No issues found
  → Proceeding to REVIEWER
```

## 10 · Execute REVIEWER phase

**PHASE PROMPT**: "You are in REVIEWER phase. You are an expert code reviewer. You may only suggest fixes or approve/reject. DO NOT create any .md files or documentation - only update the task file with your review."

YOU MUST USE quality-reviewer SUBAGENT TO PERFORM THE REVIEW

```markdown
<!-- BEGIN INLINED SUBAGENT: quality-reviewer -->

Review implementation for task [TASK_ID]:
- Check against original specifications
- Analyze code quality and patterns
- Identify potential issues
- Suggest improvements
- DO NOT create any .md files or reports - return review as text


**quality-reviewer Implementation:**

You are executing the quality-reviewer subagent role. Your purpose is to perform comprehensive code review following a systematic process.

Execute the 7-step code review process:

1. **Specification Compliance**
   - Verify implementation matches ARCHITECT specifications
   - Check all requirements are addressed
   - Note any deviations with justification

2. **Code Quality Analysis**
   - Check for code smells and anti-patterns
   - Verify naming conventions followed
   - Assess readability and maintainability

3. **Pattern Application**
   - Verify cached patterns were applied correctly
   - Check trust scores of used patterns
   - Identify opportunities for new patterns

4. **Security Review**
   - Check for common vulnerabilities
   - Verify input validation
   - Review authentication/authorization
   - Check for exposed secrets

5. **Performance Assessment**
   - Identify potential bottlenecks
   - Check for N+1 queries
   - Review caching strategy
   - Assess algorithmic complexity

6. **Test Coverage**
   - Verify tests cover new functionality
   - Check edge cases handled
   - Review test quality

7. **Documentation Check**
   - Verify inline documentation adequate
   - Check public API documentation
   - Review changelog updates

Make approval decision: APPROVED, NEEDS_MINOR_FIXES, or REJECTED.
Return detailed review findings with specific line references.
<!-- END INLINED SUBAGENT: quality-reviewer -->
```

**INTELLIGENCE INJECTION**: Focus review on low-trust pattern usage:

```
🔍 Review Focus Areas:
- Low-trust pattern used: [Pattern] (★★☆☆☆) - Verify implementation
- New pattern detected: Consider documenting for future use
```

**If current_phase == REVIEWER:**

### 🧠 Intelligence Effectiveness Review

Evaluate how well intelligence predictions and recommendations performed:

```yaml
intelligence_metrics:
  - Pattern applications: [Which worked, which didn't]
  - Time saved: [Actual vs without intelligence]
  - Prediction accuracy: [% of correct predictions]
  - New patterns discovered: [Patterns to add to system]
```

1. Review implementation against original specs
2. Check code quality and patterns
3. **[COST-OPTIMIZED] Gemini Code Review** (if complexity >= 5):
   Use gemini-orchestrator for the review discussion:

   ```markdown
   <!-- BEGIN INLINED SUBAGENT: gemini-orchestrator -->

   Facilitate code review for task [TASK_ID] (complexity: [X]):
   - Review for: logic errors, security, performance, maintainability
   - Modified files: [list files]
   - Guide discussion to concrete solutions
   - Get Gemini's approval on fixes
   

**gemini-orchestrator Implementation:**

You are executing the gemini-orchestrator subagent role. Your purpose is to orchestrate productive discussions with Gemini for architecture reviews and complex problem solving.

Facilitate an iterative discussion with Gemini:

1. **Context Setting**
   - Provide Gemini with full task context
   - Share current implementation/design
   - Include pattern cache and intelligence findings
   - State specific areas for review

2. **Initial Analysis Request**
   - Ask Gemini to review for:
     * Logic errors or edge cases
     * Security vulnerabilities  
     * Performance concerns
     * Better alternatives

3. **Iterative Discussion**
   - For each Gemini response:
     * Ask clarifying questions
     * Challenge assumptions
     * Request specific examples
     * Explore trade-offs
   - Continue until consensus reached

4. **Solution Synthesis**
   - Compile agreed-upon improvements
   - Document key decisions made
   - Note any unresolved concerns
   - Create action items

5. **Knowledge Capture**
   - Extract reusable insights
   - Identify new patterns discovered
   - Document decision rationale

Return the complete discussion summary with actionable outcomes.
<!-- END INLINED SUBAGENT: gemini-orchestrator -->
   ```

   **For Gemini Review (complexity >= 5):**
   Include intelligence context: "Here's what our pattern system predicted vs what actually happened..."

   **Interactive Review Discussion:**
   - Share pattern predictions with Gemini
   - Ask: "Do you agree with these pattern applications? Any concerns?"
   - Discuss discrepancies between predictions and actual results
   - Collaborate on improving pattern trust scores

   **Decision Matrix:**
   - Both Claude & Gemini approve after discussion → Proceed to DOCUMENTER
   - Minor issues from either → Claude fixes inline, re-review with Gemini
   - Major issues from either → Return to BUILDER with consolidated feedback
   - Disagreement → Continue discussion until consensus or escalate to user

4. Suggest minor improvements only, major improvements can be tackled in a follow-up
5. Make approval decision
   - **If rejected: Return to BUILDER phase with specific requirements and reasons for rejection.**
6. Update phase to DOCUMENTER when approved

**Key outputs:**

- Approval status
- Fixes applied
- Patterns discovered
- Complete REVIEWER → DOCUMENTER handoff section

**PATTERN TRACKING**: Finalize pattern effectiveness using ✓/⚠/✗ notation from tracking block.

## 11 · Execute DOCUMENTER phase and finalize

**PHASE PROMPT**: "You are in DOCUMENTER phase. Update project documentation based on what was learned. Do not modify code. THIS IS THE ONLY PHASE where you should create or update .md files for documentation."

**INTELLIGENCE INJECTION**: Automatically extract and document new patterns:

```
📚 Learning Capture:
- Patterns Used: [ID] Pattern Name (★★★☆☆ → ★★★★☆ effectiveness)
- New Pattern Discovered: [Description] - Add to CONVENTIONS.pending.md
- Time Estimate Update: Expected 3h → Actual 2.5h
- Failure Avoided: [What could have gone wrong based on predictions]
```

**If current_phase == DOCUMENTER:**

1. Read all handoffs to understand full implementation

2. **AUTOMATED USAGE TRACKING AND TRUST SCORE UPDATE:**
   Use the pattern-analyst subagent for pattern lifecycle management:

   ```markdown
   <!-- BEGIN INLINED SUBAGENT: pattern-analyst -->

   Process pattern usage for task [TASK_ID]:
   - Patterns used: [patterns dictionary from tracking]
   - Update usage counts and success rates
   - Adjust trust scores based on effectiveness
   - Check promotion eligibility
   - Document new patterns discovered
   

**pattern-analyst Implementation:**

You are executing the pattern-analyst subagent role. Your purpose is to analyze code patterns using APEX MCP tools and return verified patterns from the database.

Execute pattern analysis:

1. **Pattern Discovery**
   - Call apex_patterns_discover with relevant context
   - Filter patterns by minimum trust score (0.7)
   - Sort by relevance and usage count

2. **Pattern Verification**
   - For each discovered pattern:
     * Call apex_patterns_explain for detailed info
     * Verify applicability to current context
     * Check for conflicts with existing code

3. **Trust Score Analysis**
   - Review historical success rates
   - Check recent usage trends
   - Identify declining patterns

4. **Pattern Recommendations**
   - Rank patterns by fit score
   - Provide implementation guidance
   - Note required adaptations

Return verified patterns with trust scores and implementation notes.
<!-- END INLINED SUBAGENT: pattern-analyst -->
   ```

   **Pattern-analyst subagent will:**
   - Locate patterns across all convention files (parallel search)
   - Update statistics (usage count, success rate) - batch updates
   - Calculate new trust scores (×1.05 for success, ×0.85 for failure)
   - Identify patterns ready for promotion
   - Add new patterns to appropriate locations
   - **NO .md FILES**: Return pattern analysis as text response only

   **PARALLELISM**: The subagent processes multiple patterns concurrently:
   - Searches CONVENTIONS.md, CONVENTIONS.pending.md, PROJECT_PATTERNS.md in parallel
   - Updates multiple pattern statistics simultaneously
   - Batch writes changes back to files

3. **COMPLETE LEARNING DOCUMENTATION:**
   Use the learning-documenter subagent for comprehensive capture:

   ```markdown
   <!-- BEGIN INLINED SUBAGENT: learning-documenter -->

   Document learnings for task [TASK_ID]:
   - Update TASK_LEARNINGS.md
   - Add failures to failures.jsonl
   - Update PATTERN_METADATA.json
   - Promote eligible patterns
   - Create follow-up tasks for outstanding issues
   

**learning-documenter Implementation:**

You are executing the learning-documenter subagent role. Your purpose is to capture task learnings, update pattern metadata, and create follow-up tasks.

Execute documentation tasks:

1. **Learning Extraction**
   - Review all phase handoffs for insights
   - Identify what worked well
   - Note what could be improved
   - Extract reusable knowledge

2. **Pattern Effectiveness**
   - Document which patterns were used
   - Rate effectiveness (worked-perfectly, worked-with-tweaks, failed)
   - Note any required adaptations
   - Identify new pattern opportunities

3. **Failure Documentation**
   - Record any errors encountered
   - Document root causes
   - Note fixes applied
   - Update failure database

4. **Task Metrics**
   - Record actual vs predicted complexity
   - Note actual vs estimated time
   - Document resource usage

5. **Follow-up Creation**
   - Identify outstanding issues
   - Create follow-up task descriptions
   - Link to original task
   - Set appropriate priority

Update TASK_LEARNINGS.md and failures.jsonl with findings.
Create follow-up tasks as needed.
<!-- END INLINED SUBAGENT: learning-documenter -->
   ```

   **Learning-documenter subagent will:**
   - Process all pattern promotions (batch operations)
   - Document new patterns in appropriate locations (parallel writes)
   - Update all learning files concurrently:
     - TASK_LEARNINGS.md
     - failures.jsonl
     - PATTERN_METADATA.json
     - Convention files
   - Create follow-up tasks as needed
   - Update metadata statistics
   - **THIS IS THE ONLY SUBAGENT** that should create/update .md files

   **PARALLELISM**: Updates multiple documentation files simultaneously rather than sequentially

### 🧠 Intelligence System Feedback

Update intelligence system with task outcomes:

```yaml
intelligence_feedback:
  pattern_effectiveness:
    - Update trust scores based on actual usage
    - Document pattern modifications needed
    - Record new pattern variations discovered

  prediction_accuracy:
    - Update failure prediction confidence scores
    - Add new failure patterns to failures.jsonl
    - Adjust complexity calculation factors

  task_similarity:
    - Record actual similarity score vs predicted
    - Update similarity matching algorithms
    - Add this task as reference for future
```

**Auto-generate intelligence update:**

```json
{
  "task_id": "T26_S02",
  "intelligence_accuracy": 0.75,
  "pattern_hits": ["PAT:UI:ARROW", "PAT:TEST:MOCK"],
  "pattern_misses": ["PAT:ANIMATION:SCALE"],
  "new_patterns": ["PAT:UI:FLOATING_UI_ARROW"],
  "time_saved_estimate": "39h (1h actual vs 40h estimated)",
  "key_learning": "Floating-ui patterns need specific mock structure"
}
```

5. **Update 09_LEARNING/TASK_LEARNINGS.md:**

   ```markdown
   ## T[ID] - [Task Title]

   DURATION: Predicted Xh, Actual Yh
   COMPLEXITY: Predicted X, Actual Y

   ### Patterns Used

   - [PAT:ID] ✅/⚠️ Notes on effectiveness

   ### New Discoveries

   - [Description of new pattern or insight]

   ### Errors Encountered

   - [Error] → [Fix applied]

   ### Recommendations for Similar Tasks

   - [Key learnings for future]
   ```

6. **Update 09_LEARNING/failures.jsonl:**

   ```json
   For each error in errors_encountered:
   {"id": "F[next]", "task": "T[ID]", "error": "[error]",
    "cause": "[cause]", "fix": "[fix]", "pattern": "[PAT:ID]",
    "frequency": 1, "last_seen": "[date]", "contexts": ["tags"]}
   ```

7. **Check EVOLUTION_RULES.md:**
   - Patterns with 3+ successes → Promote from pending to main
   - Patterns with multiple failures → Decrease trust score
   - Document any pattern relationships discovered

8. **Update PATTERN_METADATA.json:**

   ```yaml
   metadata_update:
     - Update statistics.total_usage_count (increment by patterns used)
     - Recalculate statistics.average_trust_score
     - Update patterns_by_trust_score distribution
     - Add any promotion_candidates identified above
     - Update recent_activity:
       * patterns_used_today: increment count
       * last_task_completed: current task ID
       * active_learning_sessions: add if multiple patterns used
     - If new patterns discovered:
       * Update statistics.pending_patterns count
       * Update patterns_by_category counts
       * Set pattern_discovery_rate based on frequency
   ```

9. **Create Follow-up Task for Outstanding Issues:**
   Review all phase handoffs, 'Common Gotchas', and any other notes made during this task's execution. Look for any documented:
   - Outstanding issues that were not resolved.
   - Architectural deficits identified.
   - Desirable refactoring or improvements deferred.
   - Any other work items noted for future action.
     If such items exist, create a **new task file** (e.g., in `.simone/03_ACTIVE_SPRINTS/` or `.simone/04_GENERAL_TASKS/`). This new task should:
   - Have a title clearly indicating it's a follow-up (e.g., "Follow-up: Address architectural concerns from TX[Original_Task_ID]").
   - Copy or clearly reference the details of the outstanding issues from this task's notes.
   - Be assigned an appropriate initial phase (e.g., `ARCHITECT` if design is needed, `BUILDER` if it's a straightforward implementation).
   - Be added to the `.simone/00_PROJECT_MANIFEST.md` as a new, open task.

**Final steps - YOU MUST DO THESE:**

- Remove the Phase Tracking block from task file
- Set the Task status to **completed**
- Get current timestamp: `date '+%Y-%m-%dT%H:%M:%S%z'`
- Update task frontmatter with completion time
- **AUTO-RENAME**: `mv T[ID]_*.md TX[ID]_*.md`
- Report end result in the this file and to the user

**Report** the result to the user:

✅ **Result**: [Task title] - [Primary achievement]

📊 **Key Metrics**:

- Complexity Score: X/10 (predicted vs actual)
- Coverage: [before] → [after] (if applicable)
- Files: [created], [modified]
- Tests: [pass/fail counts]
- Duration: [total time] (vs. predicted: [predicted time])
- Risk predictions: [Which risks materialized?]

💬 **Summary**: [Comprehensive yet concise summary of what was done]

📚 **Learning Capture**:

- Patterns Used: [Count] patterns ([list most effective])
- Trust Score Updates: [Which patterns improved/declined]
- New Patterns: [Count] added to CONVENTIONS.pending.md
- Failures Documented: [Count] added to 09_LEARNING/failures.jsonl

⏭️ **Next steps**: [Follow-up task created or recommended actions]

**Suggestions** for the User:

- 🛠️ Commit the changes to git
- 🧹 Use `/clear` to clear the context before starting the next Task
- 📋 Review follow-up task: `T[ID]_*.md` (if created)
  - Document any pattern relationships discovered

7. **Update PATTERN_METADATA.json:**

   ```yaml
   metadata_update:
     - Update statistics.total_usage_count (increment by patterns used)
     - Recalculate statistics.average_trust_score
     - Update patterns_by_trust_score distribution
     - Add any promotion_candidates identified above
     - Update recent_activity:
       * patterns_used_today: increment count
       * last_task_completed: current task ID
       * active_learning_sessions: add if multiple patterns used
     - If new patterns discovered:
       * Update statistics.pending_patterns count
       * Update patterns_by_category counts
       * Set pattern_discovery_rate based on frequency
   ```

8. **Create Follow-up Task for Outstanding Issues:**
   Review all phase handoffs, 'Common Gotchas', and any other notes made during this task's execution. Look for any documented:
   - Outstanding issues that were not resolved.
   - Architectural deficits identified.
   - Desirable refactoring or improvements deferred.
   - Any other work items noted for future action.
     If such items exist, create a **new task file** (e.g., in `.simone/03_ACTIVE_SPRINTS/` or `.simone/04_GENERAL_TASKS/`). This new task should:
   - Have a title clearly indicating it's a follow-up (e.g., "Follow-up: Address architectural concerns from TX[Original_Task_ID]").
   - Copy or clearly reference the details of the outstanding issues from this task's notes.
   - Be assigned an appropriate initial phase (e.g., `ARCHITECT` if design is needed, `BUILDER` if it's a straightforward implementation).
   - Be added to the `.simone/00_PROJECT_MANIFEST.md` as a new, open task.

**Final steps - YOU MUST DO THESE:**

- Remove the Phase Tracking block from task file
- Set the Task status to **completed**
- Get current timestamp: `date '+%Y-%m-%dT%H:%M:%S%z'`
- Update task frontmatter with completion time
- **AUTO-RENAME**: `mv T[ID]_*.md TX[ID]_*.md`
- Report end result in the this file and to the user

**Report** the result to the user:

✅ **Result**: [Task title] - [Primary achievement]

📊 **Key Metrics**:

- Complexity Score: X/10 (predicted vs actual)
- Coverage: [before] → [after] (if applicable)
- Files: [created], [modified]
- Tests: [pass/fail counts]
- Duration: [total time] (vs. predicted: [predicted time])
- Risk predictions: [Which risks materialized?]

💬 **Summary**: [Comprehensive yet concise summary of what was done]

📚 **Learning Capture**:

- Patterns Used: [Count] patterns ([list most effective])
- Trust Score Updates: [Which patterns improved/declined]
- New Patterns: [Count] added to CONVENTIONS.pending.md
- Failures Documented: [Count] added to 09_LEARNING/failures.jsonl

⏭️ **Next steps**: [Follow-up task created or recommended actions]

**Suggestions** for the User:

- 🛠️ Commit the changes to git
- 🧹 Use `/clear` to clear the context before starting the next Task
- 📋 Review follow-up task: `T[ID]_*.md` (if created)

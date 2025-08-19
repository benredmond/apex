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

**Note**: TODO items correspond to workflow steps, not section numbers. The prompt optimization step (after task creation) ensures we work with the clearest, most effective version of the user's intent. The intelligence phase now consolidates all context gathering, validation, and preparation into a single comprehensive step.

**IMPORTANT SUBAGENT RULE**: Subagents MUST NOT create .md files or documentation files in any phase except DOCUMENTER. They should return their analysis as structured text responses only. No reports, no markdown files, no documentation files - just return the information directly.

### Phase Execution Flow (TODO Item 6)

Execute phases sequentially:

- Call apex_task_get_phase to check current phase
- Read the corresponding phase section (ARCHITECT, BUILDER, etc.)
- Complete all phase actions
- Call apex_task_set_phase to transition to next phase
- Continue until DOCUMENTER completes

**Phase Progression**: ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER

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

1. Use mcp**linear-server**get_issue or similar to fetch details
2. Extract title, description, type from issue
3. Call apex_task_create with:
   - intent: Issue title + description
   - type: Inferred from issue
   - identifier: The Linear/JIRA ID

### If markdown file path:

1. Use Read tool to get file content
2. Parse frontmatter and content for task details
3. Call apex_task_create with:
   - intent: Parsed content
   - type: From frontmatter or inferred
   - identifier: Filename without extension

### If database task ID (long alphanumeric):

1. Call apex_task_find to retrieve existing task
2. Use returned task details
3. Skip to intelligence gathering if found

### If text description or empty:

1. Call apex_task_create with:
   - intent: The text or user's request
   - type: Inferred from content
   - identifier: Optional

**Result**: Store `taskId` and `brief` for all subsequent operations.

## 3 · Optimize and Improve Prompt

**PURPOSE**: After creating/identifying the task, enhance the task's intent/brief for maximum clarity, specificity, and effectiveness before proceeding with intelligence gathering and execution.

### Prompt Enhancement Process

**When to Apply Prompt Optimization:**

- Always apply when task brief/intent is vague or incomplete
- Apply when Linear/JIRA descriptions need clarification
- Apply when task descriptions need structuring
- Skip only if task already has a crystal-clear, well-structured brief

### Intelligent Prompt Rewriting

**Use prompt engineering expertise to improve the task's brief/intent:**

```yaml
prompt_enhancement:
  input: "Current task brief/intent from database or creation"

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

    4. Enhance_Context:
      - Include relevant domain knowledge
      - Add APEX-specific patterns if applicable
      - Reference similar completed tasks

    5. Optimize_for_Execution:
      - Format for 5-phase workflow
      - Add measurable acceptance criteria
      - Include testing requirements
```

### Prompt Rewriting Examples

**Example 1: Vague to Specific**

```yaml
original: "fix the bug in authentication"

improved: |
  Fix authentication bug where users cannot log in after password reset.

  Requirements:
  - Diagnose root cause of login failure post-password-reset
  - Fix the authentication flow to handle reset tokens correctly
  - Ensure session persistence after successful reset
  - Add tests for password reset → login flow
  - Verify no regression in normal login flow

  Success Criteria:
  - Users can log in immediately after password reset
  - All authentication tests pass
  - No performance degradation
```

**Example 2: Feature Request Enhancement**

```yaml
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
```

**Example 3: Complex Task Structuring**

```yaml
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
```

### Pattern-Based Enhancement

**If patterns are relevant, enhance the prompt with pattern context:**

```yaml
pattern_enhancement:
  - Identify applicable patterns from task description
  - Add pattern references to improved prompt
  - Include anti-patterns to avoid
  - Reference similar successful tasks

example:
  original: "implement caching"
  pattern_enhanced: |
    Implement caching layer using Redis pattern.

    Apply patterns:
    - [PAT:CACHE:REDIS] for connection management
    - [PAT:CACHE:TTL] for expiration strategies
    - [PAT:ERROR:CACHE_MISS] for fallback handling

    Avoid anti-patterns:
    - No cache stampede issues
    - Prevent memory leaks from unbounded caches
```

### Store Enhanced Prompt

**CRITICAL**: After enhancing the prompt, use it as the working brief for the remainder of execution:

```yaml
enhanced_prompt_storage:
  # The improved prompt becomes the working brief for all subsequent steps
  working_brief: "[Enhanced version of the original task brief]"

  # Document the enhancement for learning
  enhancement_metadata:
    original_length: X tokens
    enhanced_length: Y tokens
    clarity_improvements: [list of clarifications]
    specificity_additions: [list of specifics added]
    patterns_identified: [relevant patterns]
```

**Use the enhanced prompt/brief for:**

- Intelligence gathering in step 4
- All phase executions
- Final reflection and learning capture

### Update Task Brief (Optional)

**If significant improvements were made, consider updating the task in the database:**

```yaml
# Only if the enhancement significantly improves clarity
if enhancement_is_significant:
  apex_task_update:
    id: taskId
    # Update with enhanced brief or add to notes
    # This helps future similar tasks
```

### Quick Enhancement Checklist

✅ **Before proceeding, ensure the enhanced brief has:**

- [ ] Clear, measurable objective
- [ ] Specific requirements and constraints
- [ ] Success criteria defined
- [ ] Technical context included
- [ ] Complexity appropriately scoped
- [ ] Test requirements specified
- [ ] Pattern opportunities identified

**If the original brief is already excellent** (rare but possible):

- Note that no enhancement was needed
- Proceed with original as working brief
- Document why it was already optimal

## 4 · Execute Comprehensive Intelligence & Context Assembly

Record initial checkpoint:

- Call apex_task_checkpoint with:
  - id: taskId
  - message: "Starting intelligence gathering phase"
  - confidence: 0.3

**INTELLIGENCE PROMPT**: "Orchestrate comprehensive intelligence gathering to create a unified context pack containing ALL information needed for task execution based on the task details."

### Overview

This phase consolidates all intelligence gathering, context loading, validation, and preparation into a single comprehensive operation. The output is a "context pack" that serves as the single source of truth for the entire task execution.

### Execute Intelligence Orchestration

**Use the enhanced intelligence-gatherer subagent to orchestrate all operations:**

```markdown
<Task subagent_type="intelligence-gatherer" description="Orchestrate comprehensive intelligence">
Orchestrate complete intelligence gathering and context assembly for task [TASK_ID]:
- Coordinate parallel subagent calls for all intelligence operations
- Gather patterns, context, validation, and historical data
- Calculate complexity and determine execution strategy
- Produce unified context pack for entire task execution
- Display human-readable report and return structured YAML
</Task>
```

**The intelligence-gatherer will:**

1. Execute ALL intelligence operations in parallel using subagents
2. Aggregate and deduplicate all results
3. Calculate complexity score and determine Gemini needs
4. Validate task readiness and resolve ambiguities
5. Generate execution strategy with parallelization opportunities
6. Produce comprehensive context pack

### Context Pack Structure

The intelligence-gatherer returns a complete context pack:

```yaml
# === CONTEXT PACK ===
context_pack:
  task_analysis:
    id: "T26_S02"
    title: "Task title from file"
    type: "feature_implementation|bug_fix|test_fix|refactor|documentation"
    complexity: 6 # 1-10 scale
    validation_status: "ready|blocked"
    current_phase: "ARCHITECT"

  pattern_cache:
    architecture:
      - id: "ARCH:API:REST"
        trust: "★★★★★"
        usage_count: 156
        success_rate: "94%"
    implementation: [patterns]
    testing: [patterns]
    fixes: [patterns]
    anti_patterns: [patterns to avoid]

  loaded_context:
    files:
      - path: "path/to/file"
        tokens: 1200
        relevance: 0.95
        purpose: "API structure reference"
    total_tokens: 24500
    token_budget: 30000

  historical_intelligence:
    similar_tasks: [with learnings]
    system_history: [changes, migrations]
    predicted_failures: [with prevention strategies]

  validation_results:
    requirements_complete: true
    missing_requirements: []
    ambiguities_resolved: []
    assumptions_verified: []

  execution_strategy:
    recommended_approach: "Pattern-based implementation"
    gemini_integration:
      required: true
      phases: ["ARCHITECT", "REVIEWER"]
    parallelization_opportunities: []

  metadata:
    intelligence_timestamp: "2024-01-15T10:30:00"
    confidence_score: 0.85
    cache_hit_rate: "93%"
# ===
```

### Intelligence Display Standards

For any intelligence insights used in subsequent phases:

```yaml
display_format:
  inline_hints:
    format: "💡 Intelligence: [insight from context pack]"

  code_comments:
    format: "// [PATTERN_ID] ★★★★☆ - From context pack"

  warning_blocks:
    format: |
      ⚠️ INTELLIGENCE WARNING: [From context pack]
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      Probability: X% based on historical data
      Prevention: [Specific action]
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Validation Gate

If `context_pack.validation_results.validation_status` is "blocked":

1. Update task status to "blocked"
2. Document missing requirements from validation_results
3. Report to user with actionable next steps
4. STOP execution - do not proceed

If validation_status is "ready":

- Continue to next step (Set status to in_progress)
- The context pack contains all validated information
- All subsequent phases will reference this context pack

### Store Context Pack as Evidence

**CRITICAL**: Store the complete context pack as evidence for future reference:

Call apex_task_append_evidence with:

- task_id: The taskId from step 2
- type: "decision"
- content: "Intelligence context pack generated"
- metadata: Include the full context_pack data

This preserved context pack:

- Serves as reference for all execution phases
- Documents what patterns were available at execution time
- Provides learning data for future similar tasks
- Can be referenced by future intelligence gathering

## 5 · Set status to in_progress

- Set initial phase to ARCHITECT:

Call apex_task_set_phase with:

- task_id: The taskId
- phase: "ARCHITECT"

Then record the start of execution by calling apex_task_append_evidence with:

- task_id: The taskId
- type: "decision"
- content: "Task execution started"
- metadata: Include the execution strategy and context pack timestamp

**AUTO-TRACKING**: Track patterns and errors via evidence collection:

```yaml
# === TRACKING (remove after complete) ===
decision: [from context_pack.execution_strategy.recommended_approach]
context_pack_id: [timestamp from context_pack.metadata.intelligence_timestamp]
context_pack_location: "See ## Intelligence Context Pack section above"
patterns_used: {id: ✓|⚠|✗}  # Track which patterns from context_pack were actually used
predictions_accuracy: {failure_id: occurred|prevented|false_positive}
files: [count only, list at completion]
errors: [only if they occur]
# ===

# Example filled out:
# === TRACKING (remove after complete) ===
decision: Pattern-based tooltip implementation with floating-ui
context_pack_id: 2024-01-15T10:30:00
context_pack_location: "See ## Intelligence Context Pack section above"
patterns_used: {PAT:UI:TOOLTIP: ✓, PAT:TEST:MOCK: ✓, PAT:ERROR:HANDLING: ⚠}
predictions_accuracy: {F001: prevented, F023: false_positive}
files: 9 created, 1 modified
errors: none
# ===
```

## 6 · Execute ARCHITECT phase

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

**Check current phase:**

Call apex_task_get_phase with task_id to get current phase and any handoff.

If phase is "ARCHITECT", proceed with ARCHITECT phase execution.

### 🧠 Using Context Pack Intelligence

Review the context pack from the intelligence phase:

```yaml
# Access patterns from context_pack.pattern_cache.architecture
# Use recommendations from context_pack.execution_strategy
# Apply learnings from context_pack.historical_intelligence.similar_tasks
# Prevent failures using context_pack.historical_intelligence.predicted_failures
```

**The context pack already contains:**

- All relevant architecture patterns with trust scores
- Implementation paths from similar tasks
- Predicted failure points with prevention strategies
- Recommended approach based on comprehensive analysis
- Gemini integration requirements

### 🔍 Mandatory Assumption Verification

**CRITICAL**: Before making ANY architectural decisions, you MUST verify your assumptions about the current state. This gate prevents costly mistakes from proceeding with incorrect assumptions.

#### State Archaeology (What Created Current State)

**Review architectural assumptions from context pack:**

```yaml
# Check context_pack.validation_results.assumptions_verified
# Review context_pack.historical_intelligence.system_history
# Apply anti-patterns from context_pack.pattern_cache.anti_patterns
```

**The context pack already validated:**

- Current state origin and change history
- What systems were replaced and why
- Dependencies and impact radius
- Previous attempts and failures
- Contradictions or conflicts
- Rollback/revert patterns

**If additional verification needed beyond context pack:**
Only then use architecture-validator subagent for specific deep-dive validation.

#### Historical Context Verification

```yaml
historical_checks:
  - Previous attempts: "Has this been tried before? What happened?"
  - Failure patterns: "Why is the current solution this way?"
  - Architectural decisions: "What constraints led to current design?"
  - Team preferences: "Are there documented reasons for current choices?"
  - Pattern conflicts: "Do cached patterns conflict with current architecture?"
```

#### Assumption Verification Gate

**Document ALL assumptions with evidence:**

```markdown
## Verified Assumptions

✅ **Assumption**: [Current system uses X]
**Evidence**: Found in <file:line>, implemented in TX123
**History**: Changed from Y to X in TX111 due to [reason]
**Patterns**: Compatible with PAT:ARCH:X from cache

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
- [ ] Pattern compatibility verified (no anti-pattern conflicts)

**STOP if you find:**

- 🚨 Current state was created by reverting a previous change
- 🚨 Task asks to implement something previously removed
- 🚨 Hidden dependencies not mentioned in task description
- 🚨 Conflicting architectural decisions in history
- 🚨 Cached patterns conflict with discovered constraints

**If verification reveals critical context:**

1. Update task with "## Critical Context Discovered" section
2. Revise architectural approach based on findings
3. Document why previous approaches failed
4. Get user confirmation if task fundamentally conflicts with discoveries

Record any critical discoveries as evidence:

- Call apex_task_append_evidence with type "decision"
- Include discovered conflicts and previous attempts in metadata

5. **Pattern-Based Architecture Design:**
   Use cached architecture patterns from pattern_cache:

   ```yaml
   architecture_design:
     - Review architecture patterns in cache
     - Select primary pattern based on trust score
     - Check for anti-pattern conflicts
     - Document pattern selection rationale
   ```

6. Research existing patterns in codebase
7. Design solution approach avoiding known pitfalls
8. Create specifications
9. **Gemini Architecture Review** (if complexity >= 7):
   Use the gemini-orchestrator subagent for productive discussions:

   ```markdown
   <Task subagent_type="gemini-orchestrator" description="Orchestrate Gemini review">
   Facilitate architecture review for task [TASK_ID] (complexity: [X]):
   - Provide comprehensive context and current plan
   - Share pattern cache and intelligence findings
   - Focus on: security, performance, edge cases, alternatives
   - Guide iterative discussion to consensus
   - Document key insights and decisions
   </Task>
   ```

   **Gemini-orchestrator subagent will:**
   - Set context effectively including patterns
   - Ask probing follow-up questions
   - Challenge assumptions
   - Build toward actionable solutions
   - Document the discussion journey
   - **NO .md FILES**: Return discussion summary as text response only

10. Document decisions in handoff section
11. Update phase to BUILDER when complete:

Call apex_task_set_phase to transition to BUILDER:

- task_id: The taskId
- phase: "BUILDER"
- handoff: The complete ARCHITECT → BUILDER handoff text

**Key outputs:**

- Technical decisions with rationale
- File/API specifications
- Patterns to follow from cache
- Complete ARCHITECT → BUILDER handoff section

**PATTERN TRACKING**: Record patterns selected as evidence:

Record selected patterns by calling apex_task_append_evidence:

- task_id: The taskId
- type: "pattern"
- content: "Architecture patterns selected"
- metadata: List the pattern IDs selected

**HANDOFF TEMPLATE** (auto-populate what you can):

```markdown
## ARCHITECT → BUILDER Handoff

### Architecture Decision

[REUSE FROM: architecture_decision in tracking block]
Based on cached patterns:

- Primary: [ARCH:PATTERN] ★★★★★ (from cache)
- Supporting: [Additional patterns]

### Files to Create/Modify

- [ ] path/to/file1 - purpose
- [ ] path/to/file2 - purpose

### Key Specifications

[Detailed specs here]
```

## 7 · Execute BUILDER phase

**PHASE PROMPT**: "You are in BUILDER phase. You MUST follow the ARCHITECT's specifications exactly. Do not redesign. DO NOT create any .md files or documentation - only implement code."

<details>
<summary><strong>Advanced BUILDER Features</strong></summary>

### Proactive Pattern Application

Before implementing, check pattern trust scores from cache:

```yaml
pattern_application:
  From cache (in priority order): 1. High-trust patterns (★★★★★)
    2. Project-specific patterns
    3. Lower-trust patterns with caution

  Decision process:
    - 5★ → Apply with confidence (verify context)
    - 4★ → Apply with verification
    - 3★ → Apply with caution
    - <3★ → Find alternative

  Always include trust comment:
    # [PAT:ERROR:HANDLING] ★★★★★ (156 uses, 100% success) - From cache
```

### Failure Prevention System

````yaml
failure_check:
  - Check cached FIX patterns before modifications
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
   - Context: [relevant context]
   - Patterns to follow: [from cache]"
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

**Check current phase:**

Call apex_task_get_phase to check current phase.

If phase is "BUILDER":

- Read the handoff from previous phase
- Execute BUILDER phase implementation

### 🧠 Intelligence-Driven Implementation

Record a checkpoint at BUILDER start:

- Call apex_task_checkpoint with taskId
- message: "Starting implementation phase"
- confidence: 0.5

Use patterns and insights from the context pack:

**1. Pattern-Based Code Templates:**
Apply patterns from context_pack.pattern_cache.implementation:

```yaml
# Use patterns from context_pack.pattern_cache.implementation
# Each pattern includes trust score, usage count, and success rate
# Apply high-trust patterns (★★★★☆+) with confidence
# Reference similar implementations from context_pack.historical_intelligence.similar_tasks
```

**Example Pattern Application:**

```
# Example pattern application (not JavaScript):
# [PAT:ERROR:HANDLING] ★★★★★ (156 uses, 100% success) - From cache
# Source: CONVENTIONS.md
# Adapted: Added specific error codes for this service
export const handleError = (error: Error): APIResponse => {
  // Pattern implementation with context-specific adaptations
  if (error instanceof ValidationError) {
    // [PAT:ERROR:VALIDATION_RESPONSE] ★★★★☆ (67 uses, 89% success) - From cache
    return {
      status: 400,
      code: 'VALIDATION_FAILED',
      errors: formatValidationErrors(error)
    };
  }
  // ... rest of pattern implementation
};
```

**2. Failure Prevention Checkpoints:**

```yaml
# Use predicted failures from context_pack.historical_intelligence.predicted_failures
# Each prediction includes probability, prevention strategy, and last occurrence
# Apply FIX patterns from context_pack.pattern_cache.fixes proactively
```

**3. Similar Implementation Reference:**

```yaml
# Reference implementations from context_pack.historical_intelligence.similar_tasks
# Each similar task includes implementation_path and key_learnings
# Adapt patterns based on documented learnings
```

**4. Pre-emptive Error Handling:**
Based on cached FIX patterns, automatically add:

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

### FAILURE PRE-EMPTION SYSTEM

**Use failure predictions from context pack:**

```yaml
# Review context_pack.historical_intelligence.predicted_failures
# Each failure includes pattern ID, probability, and prevention strategy
# Apply prevention strategies proactively based on probability thresholds:
#   - >70% probability: Apply prevention automatically
#   - 50-70%: Apply with caution comment
#   - <50%: Document risk but proceed
```

**High-Risk Operations (from context pack):**
The context pack already identified high-risk patterns and their prevention strategies based on historical data.

### Standard BUILDER Implementation

1. Read ARCHITECT handoff carefully
2. **With CACHED PATTERNS**: Implementation now includes:
   - Pattern code from cache with trust scores
   - Pre-filled error handling from FIX patterns
   - Failure prevention alerts shown
3. Implement exactly as specified (patterns assist, not replace specs)
4. If spec unclear, document question (don't guess)
   - **If architect buy-in is required or specification needs revision, update phase to ARCHITECT and document the reasons.**
5. Create/modify code following cached patterns
6. Update phase to VALIDATOR when complete:

Transition to VALIDATOR phase:

- Call apex_task_set_phase with phase "VALIDATOR"
- Include the BUILDER → VALIDATOR handoff content

**Key outputs:**

- Implemented code matching specifications
- List of files modified
- Complete BUILDER → VALIDATOR handoff section

**PATTERN TRACKING**: Record implementation patterns as evidence:

- Call apex_task_append_evidence with type "pattern"
- Include patterns used and their effectiveness in metadata
- Note which patterns worked, needed adjustment, or failed

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
     - Apply cached patterns consistently
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

3. **Example Implementation:**

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

4. **Error Handling in Parallel:**
   - Collect all errors before stopping
   - Report which files succeeded/failed
   - Allow partial success with clear reporting
   - Provide rollback strategy if needed

5. **Progress Tracking:**
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
   - Record error as evidence:

   Record the error as evidence:
   - Call apex_task_append_evidence with type "error"
   - Include file, error description, and fix in metadata
   - Consider adding to pattern cache if recurring
   - Do NOT transition to VALIDATOR with syntax errors

**SYNTAX CHECK GATE**: Must pass before updating phase to VALIDATOR

**EFFICIENCY TIPS:**

- Run tests as you build to catch issues early
- Use `git status` to auto-populate files_modified list
- If you need design clarification, add to tracking block instead of full phase switch
- Group similar changes and apply them in batches
- When fixing tests, identify common issues and fix all instances at once
- Leverage cached patterns to avoid reinventing solutions

## 8 · Execute VALIDATOR phase

**PHASE PROMPT**: "You are in VALIDATOR phase. You MUST run tests AND validate code quality. DO NOT fix code - only document issues. DO NOT create any .md files or reports - document issues in the task file handoff only."

**INTELLIGENCE INJECTION**: Use test predictions from context pack:

```yaml
# Review context_pack.historical_intelligence.predicted_failures
# Focus on test-related failure patterns
# Apply FIX patterns from context_pack.pattern_cache.fixes
# Reference similar task test outcomes from context_pack.historical_intelligence.similar_tasks
```

**Check current phase:**

Check current phase by calling apex_task_get_phase.

If phase is "VALIDATOR", proceed with validation.

### 🧠 Intelligence-Driven Validation

Record checkpoint at VALIDATOR start:

- Call apex_task_checkpoint
- message: "Starting validation phase - running tests"
- confidence: 0.7

Use test patterns and predictions from context pack:

```yaml
# Apply test patterns from context_pack.pattern_cache.testing
# Check if predicted failures from context_pack occurred
# Track prediction accuracy for learning capture
# Use parallelization opportunities from context_pack.execution_strategy
```

**Use the test-validator subagent for comprehensive validation:**

```markdown
<Task subagent_type="test-validator" description="Execute comprehensive validation">
Validate all changes for task [TASK_ID]:
- Modified files: [list files]
- Run syntax validation, linting, formatting checks
- Execute unit and integration tests
- Generate coverage report
- Check against cached test patterns
- Categorize issues by severity
</Task>
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

   ### Pattern Effectiveness

   - Cached patterns that prevented errors: X
   - New error patterns discovered: Y
   ```

5. **Decision Logic:**
   - **If ANY critical issues (syntax errors, failing tests):**
     → Return to BUILDER phase with detailed issue list
   - **If only warnings/formatting issues:**
     → Document for REVIEWER phase consideration
   - **If all validations pass:**
     → Update phase to REVIEWER:

Transition to REVIEWER phase by calling apex_task_set_phase with phase "REVIEWER".

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
- Pattern effectiveness tracking
- Complete VALIDATOR → REVIEWER or VALIDATOR → BUILDER handoff

**PATTERN TRACKING**: Record test patterns and errors as evidence:

Record test patterns and errors:

- Call apex_task_append_evidence for patterns used
- If errors encountered, record them with type "error"
- Include any fixes applied in metadata

**AUTO-HANDOFF**: If all tests pass and acceptance criteria met:

```markdown
## VALIDATOR → REVIEWER Handoff

**Status: AUTO-PASS** ✅

- All tests passing
- Coverage: [X%] (meets target)
- No issues found
- Cached patterns effective: X/Y
  → Proceeding to REVIEWER
```

## 9 · Execute REVIEWER phase

**PHASE PROMPT**: "You are in REVIEWER phase. You are an expert code reviewer. You may only suggest fixes or approve/reject. DO NOT create any .md files or documentation - only update the task file with your review."

YOU MUST USE quality-reviewer SUBAGENT TO PERFORM THE REVIEW

```markdown
<Task subagent_type="quality-reviewer" description="Perform code review">
Review implementation for task [TASK_ID]:
- Check against original specifications
- Analyze code quality and patterns
- Verify cached patterns were applied correctly
- Identify potential issues
- Suggest improvements
- Check for new patterns to add to cache
- DO NOT create any .md files or reports - return review as text
</Task>
```

**INTELLIGENCE INJECTION**: Focus review using context pack insights:

```yaml
# Review pattern applications from context_pack.pattern_cache
# Check implementation against context_pack.execution_strategy.recommended_approach
# Verify Gemini was used per context_pack.execution_strategy.gemini_integration
# Compare actual implementation with context_pack.historical_intelligence.similar_tasks
```

**Check current phase:**

Check phase with apex_task_get_phase.

If phase is "REVIEWER", proceed with code review.

### 🧠 Intelligence Effectiveness Review

Record checkpoint:

- Call apex_task_checkpoint
- message: "Starting review phase"
- confidence: 0.85

Evaluate how well the context pack performed:

```yaml
# Compare actual outcomes with context_pack predictions
# Calculate: Did we use recommended patterns?
# Measure: Were failure predictions accurate?
# Assess: Was complexity score correct?
# Track: Which patterns from context_pack were most valuable?
```

1. Review implementation against original specs
2. Check code quality and patterns
3. **[COST-OPTIMIZED] Gemini Code Review** (if complexity >= 5):
   Use gemini-orchestrator for the review discussion:

   ```markdown
   <Task subagent_type="gemini-orchestrator" description="Orchestrate Gemini code review">
   Facilitate code review for task [TASK_ID] (complexity: [X]):
   - Review for: logic errors, security, performance, maintainability
   - Modified files: [list files]
   - Share pattern cache effectiveness data
   - Guide discussion to concrete solutions
   - Get Gemini's approval on fixes
   </Task>
   ```

   **For Gemini Review (complexity >= 5):**
   Include pattern context: "Here's which cached patterns worked vs what actually happened..."

   **Interactive Review Discussion:**
   - Share pattern effectiveness with Gemini
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
6. Update phase to DOCUMENTER when approved:

Transition to DOCUMENTER phase:

- Call apex_task_set_phase with:
  - task_id: The taskId
  - phase: "DOCUMENTER"
  - handoff: The REVIEWER → DOCUMENTER handoff content

**Key outputs:**

- Approval status
- Fixes applied
- Patterns discovered
- Pattern effectiveness assessment
- Complete REVIEWER → DOCUMENTER handoff section

**PATTERN TRACKING**: Finalize pattern effectiveness as evidence:

Record final pattern effectiveness:

- Call apex_task_append_evidence with:
  - task_id: The taskId
  - type: "pattern"
  - content: "Final pattern effectiveness assessment"
  - metadata: Include patterns that worked, needed adjustment, or failed

## 10 · Execute DOCUMENTER phase and finalize

**PHASE PROMPT**: "You are in DOCUMENTER phase. Capture learnings and reflect on task execution. Do not modify code. DO NOT create any .md files - all documentation is stored in the database via MCP tools. CRITICAL: You MUST call apex_reflect at the end."

**INTELLIGENCE INJECTION**: Document context pack effectiveness:

```yaml
# Document which patterns from context_pack.pattern_cache were used
# Record accuracy of context_pack.historical_intelligence.predicted_failures
# Compare context_pack.task_analysis.complexity vs actual complexity
# Note context_pack.metadata.cache_hit_rate effectiveness
# Track new patterns discovered beyond context_pack
```

**Check current phase:**

- Call apex_task_get_phase with task_id
- If phase is "DOCUMENTER", proceed with documentation

1. Read all handoffs to understand full implementation

Final checkpoint and evidence retrieval:

- Call apex_task_checkpoint with confidence 0.95
- Call apex_task_get_evidence to retrieve all collected evidence for summary

2. **COMPLETE TASK AND REFLECT - TWO SEPARATE STEPS:**

   **STEP 1 - Complete the task (returns reflection draft):**

   Call apex_task_complete with:
   - id: The taskId
   - outcome: "success", "partial", or "failure"
   - key_learning: Key insight from the implementation
   - patterns_used: List of pattern IDs used

   This returns a ReflectionDraft that you can review and modify.

   **STEP 2 - Deep Pattern Extraction & Reflection (THINK DEEPLY):**

   ### 🧠 ULTRA-DEEP PATTERN REFLECTION PROCESS

   **⏸️ PAUSE HERE: Take 30-60 seconds to deeply analyze the implementation.**

   **Reflection Mindset:**
   - Imagine you'll encounter this exact problem 10 more times
   - What knowledge would save you 2+ hours next time?
   - What subtle insight took you longest to discover?
   - What would you tell yourself at the start if you could?
   - What pattern emerges that isn't immediately obvious?

   **Look for patterns at multiple levels:**

   #### A. Patterns USED from Cache

   For each cached pattern applied, analyze:
   - **Effectiveness Score**: ✓ Perfect / ⚠ Adapted / ✗ Failed
   - **Adaptations Required**: What had to change? Why?
   - **Context Sensitivity**: Did it work because of specific conditions?
   - **Improvement Ideas**: How could the pattern be enhanced?

   #### B. NEW Patterns DISCOVERED (Be Creative!)

   Look beyond the obvious - find the subtle, reusable gems:

   **Code Patterns:**
   - Elegant solutions to tricky problems
   - Creative uses of language features
   - Performance optimizations that worked
   - Clean abstractions or interfaces created
   - Smart error handling approaches
   - Clever test strategies that caught bugs

   **Architecture Patterns:**
   - Module organization that improved clarity
   - Dependency injection techniques
   - State management approaches
   - API design patterns that emerged
   - Service layer abstractions

   **Process Patterns:**
   - Debugging techniques that worked
   - Testing strategies that revealed issues
   - Refactoring sequences that were effective
   - Migration patterns for schema changes

   **Integration Patterns:**
   - Tool combinations that worked well
   - Library usage patterns
   - Configuration patterns
   - Build/deploy optimizations

   #### C. ANTI-PATTERNS Discovered

   Document what DIDN'T work (equally valuable!):
   - Approaches that seemed good but failed
   - Performance bottlenecks discovered
   - Testing strategies that missed bugs
   - Architectural decisions that caused issues
   - Tool limitations encountered

   #### D. LEARNINGS & INSIGHTS

   Meta-patterns and wisdom:
   - "When X condition exists, always check for Y"
   - "Pattern A works better than Pattern B when..."
   - "This type of bug often hides in..."
   - "The root cause was actually..."

   #### E. Pattern Quality Checklist

   Before documenting a pattern, verify:
   - [ ] Is it genuinely reusable in other contexts?
   - [ ] Can you describe it in a single sentence?
   - [ ] Would it save time if encountered again?
   - [ ] Is it non-obvious enough to be valuable?
   - [ ] Does it have clear triggers/conditions for use?

   ### 📝 Pattern Documentation Template

   For each significant pattern discovered:

   ```yaml
   pattern:
     title: "Descriptive Name"
     problem: "What specific problem does this solve?"
     solution: "How does it solve it?"
     when_to_use: "Specific conditions/triggers"
     when_not_to_use: "Anti-conditions"
     example: "Concrete code example"
     trade_offs: "Pros/cons"
     related: "Similar or complementary patterns"
   ```

   ## 🔴 STEP 2.5 - MANDATORY GIT COMMIT (DO NOT SKIP!)

   **⚠️ CRITICAL: You MUST commit changes before apex_reflect or it will fail!**

   ```bash
   # Check what files were modified
   git status --short

   # Stage all changes
   git add -A

   # Create a meaningful commit message
   git commit -m "Task [TASK_ID]: [Brief description of what was done]

   - [Key change 1]
   - [Key change 2]
   - [Key fixes or improvements]
   - Patterns: [List any patterns applied/discovered]

   Co-authored-by: Claude <noreply@anthropic.com>"

   # Verify commit succeeded
   git log -1 --oneline
   ```

   **✅ Commit Checklist:**
   - [ ] All modified files are staged (`git add -A`)
   - [ ] Commit message describes what was done
   - [ ] Commit includes pattern information
   - [ ] Commit succeeded (check with `git log -1`)

   **If commit fails:** Fix any issues before proceeding to apex_reflect!

   **STEP 3 - Call apex_reflect with comprehensive pattern data:**

   ## 🚨 CRITICAL apex_reflect Documentation

   ### ⚠️ IMPORTANT: Pass Parameters as Objects, NOT Strings!

   **The most common error is passing `claims` or `batch_patterns` as JSON strings instead of actual objects/arrays.**

   ### 🔴 CRITICAL: Common apex_reflect Mistakes to Avoid

   #### 1. **Anti-patterns Structure**

   Anti-patterns require `title` and `reason` fields, NOT `pattern_id`:

   ❌ **WRONG**:

   ```javascript
   anti_patterns: [
     {
       pattern_id: "ASYNC_IN_SQLITE", // ❌ Wrong field name
       reason: "Causes failure",
     },
   ];
   ```

   ✅ **CORRECT**:

   ```javascript
   anti_patterns: [
     {
       title: "Async in SQLite Transaction", // ✅ Required field
       reason: "Using async/await inside db.transaction() fails", // ✅ Required field
       evidence: [], // Optional but recommended empty if no specific evidence
     },
   ];
   ```

   #### 2. **Evidence Validation Issues**

   **IMPORTANT**: Even with committed files, evidence validation can fail. The safest approach is to minimize evidence usage:

   ✅ **RECOMMENDED - Minimal Evidence Pattern**:

   ```javascript
   apex_reflect({
     task: { id: "TASK_ID", title: "Task Title" },
     outcome: "success",
     claims: {
       patterns_used: [], // Keep empty to avoid evidence validation issues
       trust_updates: [{ pattern_id: "PAT:ID", outcome: "worked-perfectly" }],
       new_patterns: [
         {
           title: "Pattern Name",
           summary: "Description",
           snippets: [], // Can include code snippets
           evidence: [], // Keep empty to avoid validation
         },
       ],
       anti_patterns: [
         {
           title: "Anti-pattern Name", // NOT pattern_id!
           reason: "Why this is bad",
           evidence: [],
         },
       ],
       learnings: [
         {
           assertion: "What you learned",
           evidence: [], // Keep empty
         },
       ],
     },
   });
   ```

   #### 3. **When You MUST Use Evidence**

   If evidence is required, use string evidence which auto-converts safely:

   ```javascript
   batch_patterns: [
     {
       pattern: "PAT:TEST",
       outcome: "worked-perfectly",
       evidence: "Simple string description", // Safer than git_lines objects
     },
   ];
   ```

   ❌ **WRONG** - This will fail with "Expected object, received string":

   ```javascript
   // DON'T DO THIS - passing claims as a string
   claims: '{"patterns_used": [], "trust_updates": []}';

   // DON'T DO THIS - passing batch_patterns as a string
   batch_patterns: '[{"pattern": "PAT:TEST", "outcome": "worked-perfectly"}]';
   ```

   ✅ **CORRECT** - Pass as actual JavaScript objects/arrays:

   ```javascript
   // DO THIS - claims as an object
   claims: {
     patterns_used: [],
     trust_updates: [],
     new_patterns: [],
     anti_patterns: [],
     learnings: []
   }

   // DO THIS - batch_patterns as an array
   batch_patterns: [
     {
       pattern: "PAT:API:ERROR_HANDLING",
       outcome: "worked-perfectly",
       evidence: "Applied in api.ts:45-78"
     }
   ]
   ```

   ### Two Accepted Formats

   #### Format 1: Traditional Claims (Full Control)

   When calling apex_reflect, use this structure with `claims` as an OBJECT:

   ```javascript
   apex_reflect({
     task: { id: "T28_S02", title: "Implement feature X" },
     outcome: "success",  // success|partial|failure
     claims: {  // ← OBJECT, not a string!
       patterns_used: [...],
       trust_updates: [...],
       new_patterns: [...],
       anti_patterns: [...],
       learnings: [...]
     },
     options: { dry_run: false }
   })
   ```

   #### Format 2: Batch Patterns (Simplified)

   When calling apex_reflect, use this structure with `batch_patterns` as an ARRAY:

   ```javascript
   apex_reflect({
     task: { id: "T28_S02", title: "Implement feature X" },
     outcome: "success",
     batch_patterns: [
       // ← ARRAY, not a string!
       {
         pattern: "PAT:API:ERROR_HANDLING",
         outcome: "worked-perfectly", // See outcome values below
         evidence: "Applied in api.ts:45-78", // String or array
         notes: "Worked without modification",
       },
     ],
   });
   ```

   ### 📌 Evidence Format Rules

   #### ✅ CORRECT Evidence Objects

   ```json
   // Git lines evidence (MOST COMMON)
   {
     "kind": "git_lines",     // ✅ NOT "code_lines"!
     "file": "src/api.ts",
     "sha": "HEAD",           // ✅ Required! Use "HEAD" for uncommitted
     "start": 45,             // ✅ Line numbers required
     "end": 78
   }

   // Commit evidence
   {
     "kind": "commit",
     "sha": "abc123def456789012345678901234567890abcd"  // 40 chars
   }

   // PR evidence
   {
     "kind": "pr",
     "number": 123,
     "repo": "owner/repo"     // Optional
   }

   // CI run evidence
   {
     "kind": "ci_run",
     "id": "run-123",
     "provider": "github-actions"
   }
   ```

   #### ✅ String Evidence (Auto-converted)

   ```json
   // These strings are auto-converted to proper evidence:
   "evidence": "Applied in auth.ts:45-78"
   // Becomes: { kind: "git_lines", file: "reflection-note", sha: "HEAD", start: 1, end: 1 }
   ```

   ### 📊 Trust Update Outcomes

   Use these outcome values for pattern effectiveness:
   - `"worked-perfectly"` = 100% success (α:1.0, β:0.0)
   - `"worked-with-tweaks"` = 70% success (α:0.7, β:0.3)
   - `"partial-success"` = 50% success (α:0.5, β:0.5)
   - `"failed-minor-issues"` = 30% success (α:0.3, β:0.7)
   - `"failed-completely"` = 0% success (α:0.0, β:1.0)

   ### ✅ Complete Working Examples

   #### Example 1: Simple Batch Format (RECOMMENDED)

   When calling apex_reflect, remember to pass `batch_patterns` as an ARRAY, not a string:

   ```javascript
   apex_reflect({
     task: { id: "T123_S02", title: "Fix authentication bug" },
     outcome: "success",
     batch_patterns: [
       // ← This is an ARRAY, not a JSON string!
       {
         pattern: "FIX:AUTH:SESSION",
         outcome: "worked-perfectly",
         evidence: "Fixed session handling in auth.ts:234-256",
       },
       {
         pattern: "PAT:ERROR:BOUNDARY",
         outcome: "worked-with-tweaks",
         evidence: [
           {
             kind: "git_lines",
             file: "src/components/Login.tsx",
             sha: "HEAD",
             start: 45,
             end: 67,
           },
         ],
         notes: "Had to adapt for React 18",
       },
     ],
   });
   ```

   #### Example 2: Full Claims with New Pattern

   When calling apex_reflect, remember to pass `claims` as an OBJECT, not a string:

   ```javascript
   apex_reflect({
     task: { id: "T124_S02", title: "Add caching layer" },
     outcome: "success",
     claims: {
       // ← This is an OBJECT, not a JSON string!
       patterns_used: [
         {
           pattern_id: "PAT:CACHE:REDIS",
           evidence: [
             {
               kind: "git_lines",
               file: "src/cache/redis.ts",
               sha: "HEAD",
               start: 50,
               end: 100,
             },
           ],
           notes: "Redis pattern worked perfectly",
         },
       ],
       trust_updates: [
         {
           pattern_id: "PAT:CACHE:REDIS",
           outcome: "worked-perfectly",
         },
       ],
       new_patterns: [
         {
           title: "Redis Connection Pooling",
           summary: "Efficient connection management",
           snippets: [
             {
               snippet_id: "redis-pool-v1",
               source_ref: {
                 kind: "git_lines",
                 file: "src/cache/pool.ts",
                 sha: "HEAD",
                 start: 1,
                 end: 45,
               },
               language: "typescript",
               code: "export class RedisPool {\n  // implementation\n}",
             },
           ],
           evidence: [
             {
               kind: "git_lines",
               file: "src/cache/pool.ts",
               sha: "HEAD",
               start: 1,
               end: 45,
             },
           ],
         },
       ],
     },
   });
   ```

   #### Example 3: THOUGHTFUL Pattern Discovery (Deep Reflection)

   ```javascript
   apex_reflect({
     task: { id: "T061", title: "Fix test failures" },
     outcome: "success",
     claims: {
       // ← OBJECT, not a string!
       patterns_used: [], // No patterns from cache were used
       trust_updates: [],
       new_patterns: [
         {
           title: "Test Isolation with Skip Flags",
           summary:
             "Add skip flags to prevent background operations during testing",
           snippets: [
             {
               snippet_id: "test-isolation-v1",
               source_ref: {
                 kind: "git_lines",
                 file: "src/service.ts",
                 sha: "HEAD",
                 start: 101,
                 end: 103,
               },
               language: "typescript",
               code: "if (!options.skipPrecompute) {\n  this.precomputeActiveTasks();\n}",
             },
           ],
           evidence: [
             {
               kind: "git_lines",
               file: "tests/service.test.ts",
               sha: "HEAD",
               start: 77,
               end: 78,
             },
           ],
         },
         {
           title: "Async Test Cleanup Pattern",
           summary:
             "Ensure database connections are properly closed in afterEach hooks to prevent test pollution",
           snippets: [
             {
               snippet_id: "async-cleanup-v1",
               source_ref: {
                 kind: "git_lines",
                 file: "tests/setup.ts",
                 sha: "HEAD",
                 start: 45,
                 end: 52,
               },
               language: "typescript",
               code: "afterEach(async () => {\n  await db.close();\n  await cache.flush();\n  jest.clearAllMocks();\n});",
             },
           ],
           evidence: [
             {
               kind: "git_lines",
               file: "tests/setup.ts",
               sha: "HEAD",
               start: 45,
               end: 52,
             },
           ],
         },
         {
           title: "Mock Validation Pattern",
           summary:
             "Validate mock implementations match interface contracts using TypeScript strict checks",
           snippets: [
             {
               snippet_id: "mock-validation-v1",
               source_ref: {
                 kind: "git_lines",
                 file: "tests/mocks/service.mock.ts",
                 sha: "HEAD",
                 start: 12,
                 end: 18,
               },
               language: "typescript",
               code: "// Ensures mock matches interface at compile time\nconst mockService: IService = {\n  method: jest.fn().mockImplementation(async (x) => {\n    // Implementation that matches interface signature\n    return { success: true, data: x };\n  })\n} satisfies IService;",
             },
           ],
           evidence: [
             {
               kind: "git_lines",
               file: "tests/mocks/service.mock.ts",
               sha: "HEAD",
               start: 12,
               end: 18,
             },
           ],
         },
       ],
       anti_patterns: [
         {
           title: "Hardcoded Status Values in SQL",
           reason:
             "Using string literals for status values without constants leads to interface mismatches",
           evidence: [
             {
               kind: "git_lines",
               file: "src/service.ts",
               sha: "HEAD",
               start: 116,
               end: 116,
             },
           ],
         },
         {
           title: "Global Test State Mutation",
           reason:
             "Modifying global state in tests causes flaky failures when tests run in parallel",
           evidence: [
             {
               kind: "git_lines",
               file: "tests/old-test.ts",
               sha: "HEAD",
               start: 23,
               end: 25,
             },
           ],
         },
       ],
       learnings: [
         {
           assertion:
             "Test failures often cascade from improper async cleanup in previous tests",
           evidence: [
             {
               kind: "git_lines",
               file: "tests/debug.log",
               sha: "HEAD",
               start: 1,
               end: 5,
             },
           ],
         },
         {
           assertion:
             "Background processes must be explicitly disabled in test environments",
           evidence: [
             {
               kind: "git_lines",
               file: "src/config/test.config.ts",
               sha: "HEAD",
               start: 8,
               end: 12,
             },
           ],
         },
         {
           assertion:
             "TypeScript 'satisfies' operator prevents mock drift from interfaces",
           evidence: [
             {
               kind: "git_lines",
               file: "tests/mocks/README.md",
               sha: "HEAD",
               start: 15,
               end: 20,
             },
           ],
         },
       ],
     },
   });
   ```

   #### Example 4: Documenting Anti-Patterns

   ```javascript
   apex_reflect({
     task: { id: "T125_S02", title: "Performance optimization" },
     outcome: "partial",
     claims: {
       // ← OBJECT, not a string!
       patterns_used: [],
       trust_updates: [],
       anti_patterns: [
         {
           title: "Synchronous Database Calls in Loop",
           reason: "Causes N+1 query problem, degrades performance",
           evidence: [
             {
               kind: "git_lines",
               file: "src/services/user.ts",
               sha: "HEAD",
               start: 234,
               end: 245,
             },
           ],
         },
       ],
       learnings: [
         {
           assertion: "Always use batch queries for related data",
           evidence: [
             {
               kind: "git_lines",
               file: "src/services/user.ts",
               sha: "HEAD",
               start: 250,
               end: 260,
             },
           ],
         },
       ],
     },
   });
   ```

   ### ❌ Common Mistakes & Auto-Fixes

   The apex_reflect tool automatically fixes these common AI mistakes:

   | Mistake                      | Auto-Fix Applied                  |
   | ---------------------------- | --------------------------------- |
   | `"kind": "code_lines"`       | → `"kind": "git_lines"`           |
   | Missing `sha` field          | → Adds `"sha": "HEAD"`            |
   | Evidence as string in arrays | → Converts to evidence object     |
   | Single-word pattern IDs      | → Adds `:DEFAULT:DEFAULT:DEFAULT` |

   #### ❌ WRONG Examples (But Auto-Fixed!)

   ```json
   // These are WRONG but will be auto-corrected:

   // Wrong: code_lines → Fixed to git_lines
   { "kind": "code_lines", "file": "test.ts", "start": 1, "end": 10 }

   // Wrong: Missing SHA → Fixed by adding "HEAD"
   { "kind": "git_lines", "file": "test.ts", "start": 1, "end": 10 }

   // Wrong: String evidence → Converted to object
   "evidence": ["This pattern worked well"]

   // Wrong: Single-part pattern → Fixed to 4 parts
   "pattern_id": "JWT"  // Becomes: "JWT:DEFAULT:DEFAULT:DEFAULT"
   ```

   ### 🔍 Validation Rules
   1. **Pattern IDs**: Must have 2+ parts (e.g., `PAT:AUTH` or `PAT:AUTH:JWT`)
   2. **SHA Format**: 7-40 hex chars, "HEAD", or branch/tag names
   3. **Line Numbers**: Must be positive integers, start ≤ end
   4. **Evidence Arrays**: Can mix evidence types in one array
   5. **Duplicate Patterns**: Last occurrence wins in batch mode

   ### 💡 Best Practices
   1. **Use Batch Format** for simple reflections - it's cleaner
   2. **Always include evidence** - even a simple string description
   3. **Be specific with outcomes** - helps train the system
   4. **Document failures** - anti-patterns are valuable
   5. **Group related patterns** - process in one reflection
   6. **Think deeply** - Spend time extracting non-obvious patterns
   7. **Look for meta-patterns** - Patterns about when to use patterns

   ### 🎯 Examples of Patterns Often Missed Without Deep Thinking

   **Subtle but Valuable Patterns:**
   - "Always check for X before Y" conditions
   - Order dependencies that aren't obvious
   - Hidden coupling between components
   - Performance patterns that only emerge at scale
   - Error recovery sequences that work
   - Testing patterns that catch edge cases
   - Configuration patterns that prevent issues
   - Migration ordering that prevents data loss
   - Debugging sequences that isolate problems
   - Refactoring patterns that maintain compatibility

   ### 🚀 Minimal Working Example

   ```javascript
   apex_reflect({
     task: { id: "T99", title: "Quick fix" },
     outcome: "success",
     batch_patterns: [
       {
         // ← ARRAY, not a string!
         pattern: "FIX:BUG:NULL_CHECK",
         outcome: "worked-perfectly",
         evidence: "Added null check in utils.ts:45",
       },
     ],
   });
   ```

   ### 🔧 Working Example for Uncommitted Files

   ```javascript
   // WORKAROUND for uncommitted files: Use trust_updates WITHOUT patterns_used
   apex_reflect({
     task: { id: "T100", title: "Feature with uncommitted files" },
     outcome: "success",
     claims: {
       patterns_used: [], // Leave empty to avoid evidence validation
       trust_updates: [
         {
           pattern_id: "PAT:API:ERROR_HANDLING",
           outcome: "worked-perfectly", // Still updates trust scores!
         },
       ],
       new_patterns: [], // Skip new patterns if uncommitted
       learnings: [], // Skip learnings if they reference uncommitted files
     },
   });

   // Alternative: Commit files first, then use full reflection
   // git add . && git commit -m "Work in progress"
   // Then use normal apex_reflect with full evidence
   ```

3. **CAPTURE LEARNING INSIGHTS:**

   After apex_reflect completes, the system automatically:
   - Updates pattern trust scores in the database
   - Records new patterns discovered
   - Tracks anti-patterns to avoid
   - Stores learnings for future reference

   All learning data is now captured through apex_reflect - no separate documentation files needed.

   **The apex_reflect tool automatically:**
   - Processes pattern usage and effectiveness
   - Updates trust scores based on outcomes
   - Stores new patterns in the database
   - Records anti-patterns and learnings
   - All data is persisted in the APEX database, not files

### 🧠 Intelligence System Feedback

Update intelligence system with task outcomes:

```yaml
intelligence_feedback:
  pattern_effectiveness:
    - Document trust score changes from apex.reflect
    - Record pattern modifications needed
    - Note new pattern variations discovered

  prediction_accuracy:
    - Update failure prediction confidence scores
    - Add new failure patterns to documentation
    - Adjust complexity calculation factors

  task_similarity:
    - Record actual similarity score vs predicted
    - Add this task as reference for future
```

**Auto-generate intelligence update:**

```json
{
  "task_id": "T26_S02",
  "intelligence_accuracy": 0.75,
  "pattern_cache_effectiveness": {
    "cache_hit_rate": "93%",
    "patterns_from_cache": 15,
    "new_lookups": 1
  },
  "pattern_hits": ["PAT:UI:ARROW", "PAT:TEST:MOCK"],
  "pattern_misses": ["PAT:ANIMATION:SCALE"],
  "new_patterns": ["PAT:UI:FLOATING_UI_ARROW"],
  "time_saved_estimate": "2h (pattern reuse)",
  "key_learning": "Pattern caching dramatically reduced context switching"
}
```

5. **Create Follow-up Task for Outstanding Issues:**
   Review all phase handoffs and notes for:
   - Outstanding issues that were not resolved
   - Architectural deficits identified
   - Desirable refactoring or improvements deferred
   - Any other work items noted for future action

   If such items exist, create a **new task** with clear reference to original task:

   Call apex_task_create with:
   - intent: "Follow-up: [description of outstanding issues from original task]"
   - type: Appropriate type (refactor, bug, feature, etc.)
   - identifier: Optional reference to original task

**Final steps - YOU MUST DO THESE:**

- Call apex_reflect with complete pattern usage data (CRITICAL)
- Task is automatically marked as completed by apex_task_complete
- No file operations needed - all handled by database
- Report end result to the user

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

📚 **Pattern Intelligence**:

- Cache Hit Rate: X% (Y patterns from cache, Z new lookups)
- Pattern Effectiveness: ↑A improved, ↓B declined via apex.reflect
- New Patterns: C documented via apex.reflect
- Time Saved: ~Xh through pattern reuse
- Reflection: ✅ apex_reflect called with evidence

⏭️ **Next steps**: [Follow-up task created or recommended actions]

**Suggestions** for the User:

- 🛠️ Commit the changes to git
- 🧹 Use `/clear` to clear the context before starting the next Task
- 📋 Review follow-up task (if created)
- 🔄 Pattern updates processed automatically via apex_reflect

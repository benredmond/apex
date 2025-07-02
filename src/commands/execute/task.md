# Execute.Task - Process Tasks with APEX Intelligence
**Domain**: Execution
**Purpose**: Implement tasks using intelligent 5-phase workflow
**Hierarchy**: Works on tasks created by planning phase

## Quick Reference
**When to use**: Implementing any development task (features, bugs, refactors)
**Typical duration**: 1-4 hours depending on complexity
**Complexity**: Adaptive (uses APEX Intelligence to determine approach)
**Prerequisites**: Task file in .apex/ directory
**Output**: Completed implementation with tests and documentation

## Core Workflow

**CREATE A TODO LIST** with exactly these 7 items:

1. Execute Intelligence Phase
2. Analyse scope from argument
3. Identify task file
4. Analyse the task and determine current phase
5. Validate task readiness
6. Set status to in_progress
7. Execute phases until task complete

**Note**: TODO items correspond to workflow steps, not section numbers. Some steps have detailed sections, others are quick actions.

### Phase Execution Flow (TODO Item 7)

Execute the current phase based on task.current_phase:
- Read the phase section (ARCHITECT, BUILDER, etc.)
- Complete all phase actions
- Phase will update current_phase when done
- Continue with next phase until DOCUMENTER completes

**Phase Progression**: ARCHITECT → BUILDER → VALIDATOR → REVIEWER → DOCUMENTER

## 1 · Execute Intelligence Phase (runs before task identification)

**INTELLIGENCE PROMPT**: "Analyze this task to predict patterns, complexity, and optimal approach. DO NOT implement, only analyze."

### 1.1 · Gemini Integration Configuration

<details>
<summary><strong>Gemini Integration Details</strong></summary>

**GEMINI USAGE**: Targeted analysis at complexity thresholds for maximum value.

```yaml
gemini_integration:
  command: gemini -p "<prompt>"
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
```

</details>

### 1.2 · Intelligence Analysis Components

Run these analyses in parallel using Task agents:

```yaml
parallel_intelligence_operations:
  - pattern_search:
      sources: [CONVENTIONS.md, KNOWLEDGE/*.md]
      match_criteria: [domain, technology, task_type]
      
  - failure_check:
      source: failures.jsonl
      relevance_threshold: 0.7
      
  - complexity_analysis:
      factors: [scope, dependencies, unknowns, risk]
      output: complexity_score (1-10)
      
  - historical_learnings:
      source: TASK_LEARNINGS.md
      similar_task_threshold: 0.8
```

## 2 · Phase-Based Execution

### ARCHITECT Phase

**Purpose**: Design the solution with deep understanding

**Actions**:
1. Analyze requirements and constraints
2. Research similar implementations in codebase
3. Design component structure
4. Plan integration points
5. Document architectural decisions

**Deliverables**:
- Architectural design document
- Component breakdown
- Integration plan
- Risk assessment

### BUILDER Phase

**Purpose**: Implement according to architectural design

**Actions**:
1. Create/modify files following design
2. Implement core functionality
3. Add error handling
4. Ensure code follows patterns
5. Self-review while building

**Deliverables**:
- Working implementation
- Follows established patterns
- Proper error handling
- Clean, documented code

### VALIDATOR Phase

**Purpose**: Ensure implementation works correctly

**Actions**:
1. Write comprehensive tests
2. Run existing test suite
3. Test edge cases
4. Verify integration points
5. Performance validation

**Deliverables**:
- Unit tests
- Integration tests
- All tests passing
- Performance metrics

### REVIEWER Phase

**Purpose**: Ensure code quality and standards

**Actions**:
1. Code quality review
2. Pattern compliance check
3. Security review
4. Documentation review
5. Suggest improvements

**Deliverables**:
- Code review summary
- Improvement suggestions
- Security clearance
- Documentation complete

### DOCUMENTER Phase

**Purpose**: Capture learnings and update knowledge base

**Actions**:
1. Update task documentation
2. Extract new patterns
3. Record failures/issues
4. Update knowledge base
5. Create handoff notes

**Deliverables**:
- Task completion summary
- New patterns documented
- Knowledge base updated
- Handoff documentation

## 3 · Task Completion

After all phases complete:

1. Update task status to 'completed'
2. Generate completion summary
3. Extract patterns for CONVENTIONS.pending.md
4. Update TASK_LEARNINGS.md
5. Prepare for finalization phase

## Example Usage

```bash
# Simple task
/apex execute.task T001

# Complex task with Gemini assistance
/apex execute.task T047  # Complexity >= 5 triggers Gemini

# Resume interrupted task
/apex execute.task T023 --resume
```

## Best Practices

1. **Trust the Intelligence**: Let pattern recognition guide approach
2. **Phase Discipline**: Complete each phase fully before moving on
3. **Document Everything**: Future tasks benefit from current learnings
4. **Fail Fast**: If blocked, document why and seek help
5. **Pattern First**: Always check for existing patterns before creating new solutions
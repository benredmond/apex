---
id: T065
status: open
sprint: current
complexity: 6
estimated_hours: 2
parent_task: T060_S01
---

# Implement extractNewPatterns Functionality

## Context
This task addresses the TODO comment identified in T060_S01 task completion integration:
- TaskService.complete() has TODO for automatic pattern extraction
- Need to extract common patterns from task evidence for promotion
- Automatic pattern discovery from completed task evidence

## Acceptance Criteria
- [ ] Implement extractNewPatterns() method in TaskService or ReflectionService
- [ ] Extract patterns from task evidence (files_modified, decisions, patterns_used)
- [ ] Identify recurring patterns across multiple completed tasks
- [ ] Generate pattern drafts for common code patterns, architectural decisions
- [ ] Integration with existing pattern promotion workflow
- [ ] Unit tests covering pattern extraction logic
- [ ] Performance target: <500ms for pattern extraction per task

## Technical Approach
- Analyze task evidence for recurring patterns
- Use AST parsing for code pattern extraction
- Identify architectural patterns from decisions
- Generate pattern drafts with appropriate trust scores
- Queue patterns for validation and potential promotion

## Files to Modify
- `src/storage/repositories/task-repository.ts` - Implement extractNewPatterns TODO
- `src/intelligence/pattern-manager.ts` - Pattern extraction logic
- `tests/storage/repositories/task-repository.test.ts` - Test coverage

## Success Metrics
- Automatic pattern extraction from task completion
- Generated pattern drafts integrate with existing workflow
- Performance meets <500ms target
- Test coverage >90% for new functionality
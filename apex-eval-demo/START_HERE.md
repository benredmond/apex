# Evaluation Instructions

## Your Task

You are participating in a development task evaluation. Please follow these instructions carefully.

## Process

1. **Start Logging**
   Create a metrics entry in `metrics.log` with your start time:
   ```json
   {
     "task": "[current_task_id]",
     "start": "[ISO timestamp]",
     "status": "in_progress"
   }
   ```

2. **Read the Task**
   Your task is in: `tasks/task1_validation.md`
   
   Read it carefully and understand:
   - Current state of the code
   - Requirements to implement
   - Validation criteria (tests that must pass)

3. **Implement the Solution**
   - Modify the necessary files to meet requirements
   - Focus on making the validation tests pass
   - Maintain existing functionality (don't break other features)

4. **Validate Your Work**
   Run the validation suite:
   ```bash
   npm test validation/test_task1.js
   ```
   
   Keep working until ALL tests pass.

5. **Complete Logging**
   Update `metrics.log` with completion data:
   ```json
   {
     "task": "[task_id]",
     "start": "[start_time]",
     "end": "[end_time]",
     "duration_seconds": [calculated],
     "test_results": {
       "total": [number],
       "passed": [number],
       "failed": [number]
     },
     "errors_encountered": [
       {
         "type": "[error_type]",
         "description": "[what went wrong]",
         "fix_time_seconds": [estimate]
       }
     ],
     "implementation_notes": "[any relevant notes]"
   }
   ```

## Important Guidelines

- **Don't modify the test files** - They are the ground truth
- **Run tests frequently** - This helps catch issues early
- **Log accurately** - This data is used for evaluation
- **Fix all test failures** - The task isn't complete until all tests pass
- **Preserve existing functionality** - Don't break working features

## Available Tasks

Start with Task 1, then proceed to others if time permits:

1. `tasks/task1_validation.md` - Add input validation (Complexity: 3/10)
2. `tasks/task2_tracing.md` - Implement distributed tracing (Complexity: 6/10)  
3. `tasks/task3_race_condition.md` - Fix race condition (Complexity: 7/10)

## Success Criteria

Your implementation is successful when:
- ✅ All validation tests pass
- ✅ No existing tests are broken
- ✅ Metrics are logged accurately
- ✅ Code follows existing patterns in the codebase

Begin with reading `tasks/task1_validation.md` and understanding what needs to be implemented.
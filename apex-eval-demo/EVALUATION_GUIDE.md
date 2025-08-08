# How to Run APEX Evaluation with Claude Code

## 🎯 Evaluation Overview

This evaluation measures Claude's performance on real coding tasks with and without APEX tools. The key is that **validation is automated through tests** - there's no ambiguity about whether the task is complete.

## 📋 Setup for Each Run

### 1. Baseline Run (No APEX)
```bash
# Start fresh Claude Code instance
# Open the apex-eval-demo folder
# Give Claude the START_HERE.md file
```

Claude will:
1. Read the task in `tasks/task1_validation.md`
2. Implement the solution in `services/auth/index.js`
3. Run `npm test validation/test_task1.js` to validate
4. Keep working until all tests pass
5. Log metrics to `metrics.log`

### 2. APEX Run
```bash
# Start fresh Claude Code instance
# Open the apex-eval-demo folder  
# Give Claude the START_HERE.md file
# Tell Claude to use APEX tools (apex_patterns_lookup, etc.)
```

Claude will additionally:
- Use `apex_patterns_lookup` to find relevant patterns
- Log pattern cache hits
- Follow APEX workflow phases
- Complete faster with fewer errors

## 🧪 How Validation Works

### The Tests Are Ground Truth

Each task has a corresponding test file that checks:
- **Functional requirements** (does it work?)
- **Error handling** (correct error codes?)
- **Non-functional requirements** (headers present?)
- **No regressions** (original functionality intact?)

Example from Task 1:
```javascript
// validation/test_task1.js checks:
✓ Invalid email → 400 with code 'INVALID_EMAIL'
✓ Weak password → 400 with code 'WEAK_PASSWORD'  
✓ Rate limit headers present
✓ Rate limiting actually works
✓ Original login still succeeds
```

### Success = All Tests Green

The task is **objectively complete** when:
```bash
npm test validation/test_task1.js

✓ Email Validation (3 tests)
✓ Password Validation (4 tests)
✓ MFA Code Validation (3 tests)
✓ Rate Limiting Headers (4 tests)
✓ Original Functionality (3 tests)

Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
```

## 📊 What Gets Measured

### Automatic Metrics (from tests)
- **Time to completion** - When do all tests pass?
- **Number of attempts** - How many test runs before success?
- **Error types** - What mistakes were made?
- **Test coverage** - How complete is the solution?

### APEX-Specific Metrics
- **Pattern cache hits** - How many patterns were reused?
- **Patterns effectiveness** - Did they work first try?
- **Pitfall avoidance** - Were common mistakes avoided?
- **Time saved** - How much faster with patterns?

### Manual Observations
- Code quality and organization
- Security considerations
- Performance implications
- How well Claude follows instructions

## 📈 Expected Results

### Without APEX (Baseline)
- 10-15 minutes to complete Task 1
- 3-5 test failures before success
- Manual implementation of validation
- May miss edge cases initially
- Likely to hit common pitfalls

### With APEX
- 5-8 minutes to complete Task 1
- 0-2 test failures before success
- Reuses validation patterns
- Handles edge cases from patterns
- Avoids known pitfalls

## 🔄 Running Multiple Tasks

After Task 1, proceed to more complex tasks:

1. **Task 1** (Complexity 3/10): Input validation
   - Good baseline test
   - Clear requirements
   - Simple patterns

2. **Task 2** (Complexity 6/10): Distributed tracing
   - More complex patterns
   - Multiple file changes
   - Service coordination

3. **Task 3** (Complexity 7/10): Race condition
   - Requires deep understanding
   - Complex async patterns
   - Hard to get right without patterns

## 📝 Collecting Results

After each run, check:

1. **metrics.log** - Claude's self-reported metrics
2. **Test output** - Actual pass/fail results
3. **Git diff** - What code was actually changed
4. **Conversation length** - How much back-and-forth

## 🎯 Key Insights to Look For

### Pattern Effectiveness
- Which patterns were most useful?
- How much code was reused vs written?
- Were the patterns applied correctly?

### Error Prevention
- What mistakes were avoided with APEX?
- How many fewer test failures?
- Better handling of edge cases?

### Time Efficiency
- Raw time difference
- Time saved on debugging
- Fewer iterations needed

### Code Quality
- Is APEX code cleaner/more consistent?
- Better error handling?
- More complete implementation?

## 🏁 Determining Success

The evaluation demonstrates APEX value if:

✅ **Significant time reduction** (>40% faster)
✅ **Fewer errors** (>60% reduction)
✅ **Higher first-try success** (tests pass sooner)
✅ **Better code quality** (follows patterns)
✅ **Scales with complexity** (bigger gains on harder tasks)

## 💡 Tips for Clean Evaluation

1. **Fresh start each time** - Clear context between runs
2. **Don't help Claude** - Let it figure things out
3. **Note struggles** - Where does it get stuck?
4. **Time everything** - Use actual wall clock time
5. **Save conversations** - For later analysis

## 🚀 Ready to Start?

1. Open `apex-eval-demo` in Claude Code
2. Start with `START_HERE.md`
3. Watch Claude work through the task
4. Compare baseline vs APEX performance
5. Document the dramatic improvement!

The beauty of this evaluation is that **the tests don't lie** - either they pass or they don't. This gives us objective, reproducible metrics for APEX's effectiveness.
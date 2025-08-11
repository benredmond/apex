# Execute.ApexInit - Initialize APEX Pattern Database from Codebase

**Domain**: Execution
**Purpose**: Discover and extract NEW patterns from codebase to seed APEX database
**Hierarchy**: One-time initialization to bootstrap pattern intelligence
**Complexity**: Adaptive based on codebase size

## Quick Reference

**When to use**: First-time APEX setup or pattern database refresh
**Typical duration**: 5-30 minutes depending on codebase size
**Prerequisites**: APEX installed and initialized (`apex init` completed)
**Output**: Populated pattern database with discovered patterns

## Core Workflow

**CREATE A TODO LIST** with these items:

1. Verify APEX installation and database
2. Analyze codebase structure and technology stack
3. Discover patterns using specialized subagent
4. Validate and categorize discovered patterns
5. Seed database and generate report

## 1 · Verify APEX Installation

Check that APEX is properly installed and initialized:

```bash
# Check APEX installation
which apex || echo "APEX not found"

# Check database exists
ls -la patterns.db 2>/dev/null || echo "Database not found"

# Check if patterns table exists
sqlite3 patterns.db "SELECT COUNT(*) FROM patterns;" 2>/dev/null || echo "Patterns table not found"
```

**If APEX not initialized:**
```bash
npx @benredmond/apex init
```

## 2 · Analyze Codebase Structure

Use systems-researcher to understand the project deeply:

<Task subagent_type="systems-researcher" description="Deep codebase analysis">
Perform comprehensive codebase analysis to understand:

1. **Technology Stack**:
   - Primary languages and frameworks
   - Build tools and package managers
   - Testing frameworks
   - Database technologies

2. **Architecture Patterns**:
   - Overall architecture style (monolithic, microservices, etc.)
   - Layer organization (controllers, services, repositories)
   - Communication patterns between components
   - State management approaches

3. **Code Organization**:
   - Directory structure patterns
   - Module organization
   - Naming conventions
   - Import/export patterns

4. **Common Patterns**:
   - How errors are typically handled
   - Authentication/authorization implementations
   - Data validation approaches
   - API design patterns
   - Database query patterns
   - Caching strategies
   - Testing strategies

Return a detailed analysis that will guide pattern discovery.
</Task>

## 3 · Pattern Discovery Subagent

### Pattern Discovery Using Specialized Subagent

Use the pattern-discovery subagent to discover NEW, reusable patterns from the codebase:

<Task subagent_type="pattern-discovery" description="Discover new patterns from codebase">
Analyze the entire codebase to discover NEW, reusable patterns that developers can apply in future work. Look for:

## 1. Recurring Code Structures
Analyze the codebase for code that appears multiple times with slight variations:
- Similar function structures
- Repeated error handling approaches
- Common validation patterns
- Consistent API endpoint structures
- Database query patterns
- Test setup/teardown patterns

## 2. Clever Solutions
Identify elegant or clever solutions to common problems:
- Performance optimizations
- Clean abstractions
- Elegant error handling
- Smart caching strategies
- Efficient data transformations
- Creative uses of language features

## 3. Project-Specific Conventions
Find patterns unique to this project that should be followed:
- Custom middleware patterns
- Project-specific decorators/annotations
- Unique architectural decisions
- Custom utility functions that solve common needs
- Consistent approaches to async operations

## 4. Integration Patterns
Discover how external services/libraries are integrated:
- API client patterns
- Database connection patterns
- Third-party service wrappers
- Authentication flows
- File upload/download patterns
- WebSocket/real-time patterns

## 5. Testing Patterns
Extract valuable testing approaches:
- Mock/stub creation patterns
- Test data builders
- Integration test setups
- E2E test patterns
- Performance test patterns

## Discovery Process:
1. Scan multiple files of the same type (e.g., all controllers, all services)
2. Identify common structures and approaches
3. Extract the generalizable pattern
4. Create a reusable template/snippet
5. Document when and how to use it

## Output Format:
For each discovered pattern, provide:

```yaml
pattern:
  suggested_id: "PAT:DOMAIN:DESCRIPTIVE_NAME"  # Generate appropriate ID
  title: "Human-friendly pattern name"
  problem: "What problem does this pattern solve?"
  solution: "How does this pattern solve it?"
  when_to_use: "Specific conditions when this pattern applies"
  when_not_to_use: "When to avoid this pattern"
  implementation:
    code: |
      // Generalized, reusable code template
      // With placeholders for variable parts
    language: "javascript"
  examples:
    - file: "path/to/example1.js"
      lines: "45-67"
      description: "How it's used for user authentication"
    - file: "path/to/example2.js"
      lines: "23-45"
      description: "How it's used for API validation"
  frequency: 5  # How many times this pattern appears
  confidence: 0.8  # How confident you are this is a valuable pattern
  category: "error_handling|api|database|testing|auth|etc"
```

Focus on patterns that:
- Appear at least 3 times in the codebase
- Solve a real problem
- Are not obvious/trivial
- Would save time if reused
- Represent best practices in this codebase
</Task>

## 4 · Advanced Pattern Discovery

Run multiple specialized discovery agents in parallel:

### Code Pattern Discovery
<Task subagent_type="pattern-discovery" description="Discover code patterns">
Focus on discovering patterns in application code:
- Controller patterns (how endpoints are structured)
- Service layer patterns (business logic organization)
- Repository patterns (data access approaches)
- Utility patterns (common helper functions)
- Validation patterns (input validation approaches)
- Error handling patterns (try/catch structures)
- Async patterns (Promise handling, async/await usage)

Scan src/, lib/, app/ directories for recurring patterns.
Return discovered patterns in the specified YAML format.
</Task>

### Test Pattern Discovery
<Task subagent_type="pattern-discovery" description="Discover test patterns">
Focus on discovering patterns in test files:
- Test structure patterns (describe/it organization)
- Mock creation patterns
- Test data factory patterns
- Assertion patterns
- Setup/teardown patterns
- Integration test patterns
- E2E test patterns

Scan test/, spec/, __tests__/ directories.
Return discovered patterns in the specified YAML format.
</Task>

### Configuration Pattern Discovery
<Task subagent_type="pattern-discovery" description="Discover configuration patterns">
Focus on discovering patterns in configuration:
- Environment variable patterns
- Config file structures
- Build configuration patterns
- Deployment patterns
- CI/CD pipeline patterns
- Docker/containerization patterns
- Database migration patterns

Scan config/, .github/, scripts/ directories.
Return discovered patterns in the specified YAML format.
</Task>

## 5 · Pattern Validation and Enhancement

After discovery, validate and enhance patterns:

```javascript
// Pattern validation criteria
function validatePattern(pattern) {
  const criteria = {
    hasCode: pattern.implementation?.code?.length > 0,
    hasMultipleExamples: pattern.examples?.length >= 2,
    highFrequency: pattern.frequency >= 3,
    highConfidence: pattern.confidence >= 0.6,
    hasProblemStatement: pattern.problem?.length > 0,
    hasSolutionDescription: pattern.solution?.length > 0,
    hasUsageGuidance: pattern.when_to_use?.length > 0
  };
  
  const score = Object.values(criteria).filter(Boolean).length;
  return {
    isValid: score >= 5,
    score,
    criteria
  };
}

// Enhance pattern with metadata
function enhancePattern(pattern) {
  return {
    ...pattern,
    id: pattern.suggested_id,
    trust_score: 0.5, // Initial trust for discovered patterns
    trust_alpha: 1.0,
    trust_beta: 1.0,
    usage: {
      successes: 0,
      failures: 0
    },
    tags: [
      'discovered',
      'codebase',
      pattern.category,
      new Date().toISOString().split('T')[0] // date tag
    ],
    metadata: {
      discovered_by: 'apex_init',
      discovery_date: new Date().toISOString(),
      codebase_examples: pattern.examples.length,
      frequency_count: pattern.frequency,
      discovery_confidence: pattern.confidence
    }
  };
}
```

## 6 · Database Seeding

Use synchronous SQLite operations to insert discovered patterns:

```javascript
// [PAT:dA0w9N1I9-4m] ★★☆☆☆ - SQLite operations MUST be synchronous
const Database = require('better-sqlite3');
const db = new Database('patterns.db');

// Prepare insert statement
const insertPattern = db.prepare(`
  INSERT OR REPLACE INTO patterns (
    id, schema_version, pattern_version, title, summary,
    problem, solution, snippets, applicability, deprecation,
    usage, trust_score, trust_alpha, trust_beta,
    created_at, updated_at, created_by, tags,
    keywords, domain, technology, related_patterns,
    metadata
  ) VALUES (
    @id, '1.0.0', '1.0.0', @title, @summary,
    @problem, @solution, @snippets, @applicability, NULL,
    @usage, @trust_score, @trust_alpha, @trust_beta,
    datetime('now'), datetime('now'), 'apex_init', @tags,
    @keywords, @domain, @technology, '[]',
    @metadata
  )
`);

// Batch insert using transaction
const insertPatterns = db.transaction((patterns) => {
  for (const pattern of patterns) {
    // Build snippets from implementation
    const snippets = [{
      label: pattern.title,
      language: pattern.implementation.language,
      code: pattern.implementation.code,
      children: pattern.examples.map(ex => ({
        label: ex.description,
        language: pattern.implementation.language,
        code: `// Example from ${ex.file}:${ex.lines}`,
        source_ref: {
          kind: 'git_lines',
          file: ex.file,
          sha: 'HEAD',
          start: parseInt(ex.lines.split('-')[0]),
          end: parseInt(ex.lines.split('-')[1])
        }
      }))
    }];
    
    // Extract keywords
    const keywords = [
      ...pattern.title.toLowerCase().split(/\s+/),
      ...pattern.problem.toLowerCase().split(/\s+/),
      pattern.category
    ].filter(k => k.length > 2).join(',');
    
    // Determine domain from category
    const domain = pattern.category || 'general';
    const technology = pattern.implementation.language || 'multi';
    
    // Build applicability rules
    const applicability = {
      when_to_use: pattern.when_to_use,
      when_not_to_use: pattern.when_not_to_use,
      frequency: pattern.frequency,
      confidence: pattern.confidence
    };
    
    insertPattern.run({
      id: pattern.id,
      title: pattern.title,
      summary: pattern.solution,
      problem: pattern.problem,
      solution: pattern.solution,
      snippets: JSON.stringify(snippets),
      usage: JSON.stringify(pattern.usage),
      trust_score: pattern.trust_score,
      trust_alpha: pattern.trust_alpha,
      trust_beta: pattern.trust_beta,
      tags: JSON.stringify(pattern.tags),
      keywords: keywords,
      domain: domain,
      technology: technology,
      applicability: JSON.stringify(applicability),
      metadata: JSON.stringify(pattern.metadata)
    });
  }
});

// Execute transaction
try {
  const validPatterns = discoveredPatterns
    .map(enhancePattern)
    .filter(p => validatePattern(p).isValid);
    
  insertPatterns(validPatterns);
  console.log(`✅ Inserted ${validPatterns.length} discovered patterns`);
} catch (error) {
  console.error('❌ Database insertion failed:', error);
}
```

## 7 · Generate Discovery Report

After pattern discovery and seeding:

```markdown
## APEX Pattern Discovery Report

### Discovery Summary
- **Codebase analyzed**: [project name]
- **Files scanned**: [count]
- **Patterns discovered**: [count]
- **Patterns validated**: [count]
- **Patterns inserted**: [count]

### Discovered Patterns by Category
- Error Handling: [count] patterns
- API Design: [count] patterns
- Database: [count] patterns
- Testing: [count] patterns
- Authentication: [count] patterns
- Validation: [count] patterns
- Other: [count] patterns

### High-Value Discoveries (Confidence > 0.8)
1. **[Pattern Title]** (appears [N] times)
   - Problem: [What it solves]
   - Confidence: [score]
   - Examples: [list of files]

2. **[Pattern Title]** (appears [N] times)
   - Problem: [What it solves]
   - Confidence: [score]
   - Examples: [list of files]

### Pattern Statistics
- Average frequency: [X] occurrences per pattern
- Average confidence: [X]%
- Most common category: [category]
- Unique solutions discovered: [count]

### Notable Discoveries
[Highlight 3-5 most interesting or valuable patterns discovered]

### Next Steps
1. Review discovered patterns: `apex patterns list --tag discovered`
2. Test pattern effectiveness in real development
3. Use `apex reflect` to update trust scores based on usage
4. Patterns will evolve and improve through the trust system
```

## 8 · Pattern Discovery Strategies

### Cross-File Analysis
Compare similar files to find patterns:
```javascript
// Example: Find common controller patterns
const controllers = glob.sync('**/*Controller.{js,ts}');
const patterns = analyzeCommonStructures(controllers);
```

### Statistical Pattern Detection
Use frequency analysis to find patterns:
```javascript
function findFrequentPatterns(files) {
  const codeBlocks = {};
  
  for (const file of files) {
    const ast = parseFile(file);
    const structures = extractStructures(ast);
    
    for (const structure of structures) {
      const normalized = normalizeStructure(structure);
      const hash = hashStructure(normalized);
      
      codeBlocks[hash] = codeBlocks[hash] || {
        pattern: normalized,
        files: [],
        count: 0
      };
      
      codeBlocks[hash].files.push(file);
      codeBlocks[hash].count++;
    }
  }
  
  // Return patterns that appear 3+ times
  return Object.values(codeBlocks)
    .filter(p => p.count >= 3)
    .sort((a, b) => b.count - a.count);
}
```

### Semantic Pattern Recognition
Look for semantic patterns beyond syntax:
```javascript
// Example: Find error handling patterns
function findErrorPatterns(code) {
  const patterns = [];
  
  // Look for try-catch patterns
  const tryCatchPattern = /try\s*{([^}]+)}\s*catch\s*\(([^)]+)\)\s*{([^}]+)}/g;
  
  // Look for Promise error handling
  const promisePattern = /\.catch\s*\(([^)]+)\s*=>\s*{([^}]+)}/g;
  
  // Look for error middleware
  const middlewarePattern = /\(err,\s*req,\s*res,\s*next\)\s*=>\s*{([^}]+)}/g;
  
  // Extract and generalize patterns
  // ...
  
  return patterns;
}
```

## 9 · Quality Metrics

Track pattern quality metrics:

```yaml
quality_metrics:
  discovery_coverage:
    files_analyzed: 500
    files_with_patterns: 234
    coverage_percentage: 46.8
  
  pattern_quality:
    high_confidence: 15  # > 0.8
    medium_confidence: 23  # 0.6-0.8
    low_confidence: 8  # < 0.6
  
  pattern_distribution:
    single_file: 5  # Patterns only in one file (might be too specific)
    few_files: 18  # 2-5 files
    many_files: 23  # 6+ files (highly reusable)
  
  code_coverage:
    total_lines: 50000
    lines_in_patterns: 3500
    pattern_coverage: 7%
```

## Security and Performance

### Security Measures
1. **Skip sensitive files**:
   ```javascript
   const SKIP_PATTERNS = [
     /\.env/, /\.key$/, /\.pem$/, /password/i,
     /secret/i, /credential/i, /private/i
   ];
   ```

2. **Sanitize discovered code**:
   - Remove hardcoded credentials
   - Replace sensitive data with placeholders
   - Skip patterns containing secrets

### Performance Optimization
1. **Progressive discovery**:
   - Start with most common file types
   - Process in batches of 50 files
   - Show progress updates

2. **Caching**:
   - Cache AST parsing results
   - Store intermediate discoveries
   - Resume if interrupted

3. **Memory management**:
   - Stream large files
   - Clear caches periodically
   - Limit pattern size to 10KB

## Examples of Discoverable Patterns

### Example 1: API Endpoint Pattern
```yaml
pattern:
  suggested_id: "PAT:API:EXPRESS_CRUD"
  title: "Express CRUD Endpoint Pattern"
  problem: "Need consistent structure for CRUD endpoints"
  solution: "Standardized async handler with error handling"
  implementation:
    code: |
      router.post('/:resource', asyncHandler(async (req, res) => {
        const validated = await validateInput(req.body, schema);
        const result = await service.create(validated);
        res.status(201).json({
          success: true,
          data: result
        });
      }));
  frequency: 12
  confidence: 0.9
```

### Example 2: Test Setup Pattern
```yaml
pattern:
  suggested_id: "PAT:TEST:INTEGRATION_SETUP"
  title: "Integration Test Setup Pattern"
  problem: "Need consistent test database setup/teardown"
  solution: "Transactional test wrapper with automatic cleanup"
  implementation:
    code: |
      beforeEach(async () => {
        await db.transaction.start();
        testContext = await createTestContext();
      });
      
      afterEach(async () => {
        await db.transaction.rollback();
        await testContext.cleanup();
      });
  frequency: 8
  confidence: 0.85
```

## Usage

```bash
# Run pattern discovery on current project
/apex_init

# Discover patterns in specific directory
/apex_init src/

# After discovery, explore patterns
apex patterns list --tag discovered
apex patterns explain PAT:API:EXPRESS_CRUD

# Use discovered patterns in development
# They will evolve based on real-world usage
```
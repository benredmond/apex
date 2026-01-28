# APEX Pattern Schema Documentation

## Overview

The APEX Pattern Schema provides a structured format for documenting and validating patterns across your development workflow. Patterns can be stored as YAML or JSON files and are validated using Zod schemas with TypeScript-first design.

## Schema Version

Current schema version: **0.3.0**

## Pattern Types

APEX supports seven pattern types:

1. **CODEBASE** - Project-wide patterns and conventions
2. **LANG** - Language/implementation patterns  
3. **ANTI** - Anti-patterns to avoid
4. **FAILURE** - Known failure patterns
5. **POLICY** - Organizational policies
6. **TEST** - Testing patterns
7. **MIGRATION** - Migration strategies

## Pattern Structure

### Required Fields

Every pattern must include these fields:

```yaml
schema_version: "0.3.0"          # Schema version (use current)
pattern_version: "1.0.0"         # Pattern version (semver)
id: "ORG.TEAM:TYPE:CATEGORY:NAME" # Namespaced ID
type: "LANG"                     # One of the 7 types
title: "Short descriptive title"
summary: "Brief explanation of the pattern"
trust_score: 0.8                 # 0.0 to 1.0
created_at: "2024-01-01T00:00:00Z"
updated_at: "2024-01-01T00:00:00Z"
```

### Pattern ID Format

Pattern IDs follow a namespaced format:
```
ORG.TEAM:TYPE:CATEGORY:NAME
```

Examples:
- `ACME.PLT:LANG:RATELIMIT:REDIS`
- `MYCO.WEB:ANTI:SECURITY:PLAINTEXT`
- `TECH.API:FAILURE:ASYNC:TIMEOUT`

Rules:
- Only uppercase letters, numbers, dots, underscores, colons, and hyphens
- Organization and team separated by dot
- Type, category, and name separated by colons

### Common Optional Fields

#### Scope
Defines where the pattern applies:

```yaml
scope:
  languages: ["javascript", "typescript"]
  frameworks: ["express@^4 || ^5", "fastapi@^0.100"]
  repos: ["org/*", "specific-repo"]
  paths: ["src/**/*.ts", "!**/*.test.ts"]
  task_types: ["feature", "bugfix"]
  envs: ["production", "staging"]
```

#### Snippets
Code examples with metadata:

```yaml
snippets:
  - label: "Example implementation"
    language: "typescript"
    code: |
      // Your code here
    source_ref:
      kind: "git_lines"
      file: "src/example.ts"
      sha: "abc123"
      start: 10
      end: 25
```

#### Evidence
References to support the pattern:

```yaml
evidence:
  - kind: "pr"
    number: 1234
    repo: "org/repo"
  - kind: "issue" 
    id: "JIRA-123"
    system: "jira"
  - kind: "commit"
    sha: "abc123def456"
```

#### Usage Tracking

```yaml
usage:
  successes: 45
  failures: 2
  last_used_at: "2025-01-15T10:30:00Z"
```

### Type-Specific Fields

#### LANG Patterns

```yaml
plan_steps: ["Step 1", "Step 2"]
when_to_use: ["Scenario 1", "Scenario 2"]
when_not_to_use: ["Scenario 3", "Scenario 4"]
tests:
  suggestions:
    - name: "Test name"
      type: "unit"
      target_file: "tests/example.test.ts"
```

#### FAILURE Patterns

```yaml
signature: "Error message pattern to match"
mitigations: ["PAT:FIX:PATTERN1", "PAT:FIX:PATTERN2"]
```

#### POLICY Patterns

```yaml
rules:
  key1: value1
  nested:
    key2: value2
```

## Validation

### CLI Usage

Validate pattern files using the APEX CLI:

```bash
# Validate a single file
apex pattern-lint path/to/pattern.yaml

# Validate multiple files
apex pattern-lint "apex/patterns/**/*.yaml"

# Verbose output
apex pattern-lint pattern.yaml --verbose
```

### Programmatic Usage

```typescript
import { validatePatternFile } from '@benredmond/apex';

const result = await validatePatternFile('pattern.yaml');
if (result.valid) {
  console.log('Pattern is valid:', result.data);
} else {
  console.error('Validation errors:', result.errors);
}
```

## Migration Guide

### From Markdown Patterns

Existing patterns in CONVENTIONS.md can be migrated:

1. Extract pattern content
2. Create YAML file with appropriate type
3. Convert star ratings to trust scores (★ = 0.2)
4. Add required timestamps
5. Validate with `apex pattern-lint`

### Trust Score Conversion

- ★☆☆☆☆ = 0.2
- ★★☆☆☆ = 0.4  
- ★★★☆☆ = 0.6
- ★★★★☆ = 0.8
- ★★★★★ = 1.0

## Best Practices

1. **Version Management**
   - Use semantic versioning for pattern_version
   - Increment patch for minor updates
   - Increment minor for new fields/sections
   - Increment major for breaking changes

2. **Evidence Quality**
   - Always include evidence for ANTI and FAILURE patterns
   - Reference specific commits, PRs, or issues
   - Provide context in the notes field

3. **Snippet Guidelines**
   - Keep snippets focused and concise
   - Include both problematic and fixed versions
   - Add source references when possible
   - Limit to 200 lines total per pattern

4. **Trust Score Guidelines**
   - Start new patterns at 0.6 (★★★☆☆)
   - Increase by 5% per successful use
   - Decrease by 15% per failure
   - Cap at 1.0, floor at 0.2

## File Organization

Recommended structure:
```
apex/
  patterns/
    CODEBASE/
      error-handling.yaml
      logging-standards.yaml
    LANG/
      async-patterns.yaml
      api-design.yaml
    ANTI/
      security-issues.yaml
    FAILURE/
      common-test-failures.yaml
    POLICY/
      code-review.yaml
    TEST/
      integration-patterns.yaml
    MIGRATION/
      database-migrations.yaml
    examples/
      *.yaml
```

## Deprecation

Mark patterns as deprecated:

```yaml
deprecated:
  reason: "Causes memory leaks in production"
  replaced_by: "ORG.TEAM:LANG:CACHE:REDIS"
```

## Future Extensions

Use `x_meta` for forward compatibility:

```yaml
x_meta:
  custom_field: "value"
  analytics:
    views: 150
    shares: 23
```
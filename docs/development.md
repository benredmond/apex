# APEX Development Guide

This guide provides detailed information for developing and contributing to APEX.

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [TypeScript Migration](#typescript-migration)
3. [Docker Development](#docker-development)
4. [Testing Strategy](#testing-strategy)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Release Process](#release-process)

## Environment Setup

### Prerequisites

- Node.js 16.0.0 or higher
- npm (comes with Node.js)
- Docker (optional, for containerized development)
- Git

### Initial Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/benredmond/apex.git
   cd apex
   ```

2. **Run the setup script:**
   ```bash
   ./scripts/dev.sh setup
   ```

   This will:
   - Install npm dependencies
   - Build Docker images
   - Run TypeScript type checking
   - Execute the test suite

### Development Scripts

APEX includes a comprehensive development script at `scripts/dev.sh`:

```bash
# Setup development environment
./scripts/dev.sh setup

# Start development mode (Docker)
./scripts/dev.sh dev

# Run tests locally
./scripts/dev.sh test

# Run tests in Docker
./scripts/dev.sh test:docker

# TypeScript type checking
./scripts/dev.sh type-check

# Lint code
./scripts/dev.sh lint

# Format code
./scripts/dev.sh format

# Build project
./scripts/dev.sh build

# Clean up
./scripts/dev.sh clean
```

## TypeScript Migration

APEX is undergoing a gradual migration to TypeScript to improve type safety and developer experience.

### Migration Strategy

1. **Incremental Adoption**: TypeScript is configured with `allowJs: true`
2. **Non-blocking**: Type errors don't fail CI (warnings only)
3. **New Code**: Write new features in TypeScript when possible
4. **Gradual Conversion**: Convert existing files as they're modified

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowJs": true,
    "strict": false,
    // ... see tsconfig.json for full config
  }
}
```

### Adding Types

1. **Type Definitions**: Add to `src/types/index.d.ts`
2. **Module Types**: Create `*.d.ts` files alongside modules
3. **Third-party Types**: Install `@types/*` packages as needed

### Type Checking

```bash
# Check types
npm run type-check

# Watch mode
npm run type-check:watch
```

## Docker Development

Docker provides a consistent development environment across different machines.

### Docker Images

APEX uses a multi-stage Dockerfile:

1. **dependencies**: Production dependencies only
2. **dev-dependencies**: All dependencies
3. **development**: Full development environment
4. **builder**: TypeScript compilation
5. **production**: Minimal production image

### Docker Compose Services

```yaml
services:
  apex-dev:      # Development environment with hot reloading
  apex-cli:      # Production CLI for testing
  # apex-docs:   # Future documentation site
```

### Using Docker

```bash
# Start development environment
docker-compose up apex-dev

# Run CLI in Docker
docker-compose run --rm apex-cli init

# Run specific command
docker-compose run --rm apex-dev npm test

# Build images
docker-compose build
```

### Volume Mounts

- Source code is mounted for hot reloading
- node_modules is preserved in container
- .apex directory is mounted for persistence

## Testing Strategy

### Test Structure

```
tests/
├── pattern-manager.test.js    # Unit tests
├── integration/              # Integration tests
├── fixtures/                 # Test fixtures
└── helpers/                  # Test utilities
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm test -- --coverage

# Specific test file
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/pattern-manager.test.js
```

### Test Guidelines

1. **Unit Tests**: Test individual functions/classes
2. **Integration Tests**: Test command workflows
3. **Coverage Target**: Maintain >80% coverage
4. **ES Modules**: Tests use experimental VM modules flag
5. **Mocking**: Use temporary directories for file operations

### Writing Tests

```javascript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('Feature', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `apex-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('should work correctly', async () => {
    // Test implementation
  });
});
```

## CI/CD Pipeline

### GitHub Actions Workflows

1. **ci.yml**: Main CI pipeline
   - Matrix testing (Node 16, 18, 20)
   - Linting and formatting
   - TypeScript type checking
   - Test execution with coverage
   - Example validation
   - Documentation checking

2. **publish.yml**: NPM publishing
   - Triggered on release creation
   - Publishes to npm registry

3. **security.yml**: Security scanning
   - Dependency auditing
   - CodeQL analysis
   - Docker image scanning

### CI Features

- **Caching**: Dependencies cached for faster builds
- **Matrix Testing**: Tests across multiple Node versions
- **Coverage**: Reports to Codecov
- **Security**: Automated vulnerability scanning
- **Dependencies**: Dependabot for updates

### Adding CI Jobs

```yaml
jobs:
  new-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20.x'
          cache: 'npm'
      - run: npm ci
      - run: npm run your-command
```

## Release Process

### Version Management

APEX follows semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Release Commands

```bash
# Patch release (0.0.X)
npm run release:patch

# Minor release (0.X.0)
npm run release:minor

# Major release (X.0.0)
npm run release:major
```

### Release Checklist

1. **Update Version**: Update version in package.json
2. **Update Changelog**: Document changes
3. **Run Tests**: Ensure all tests pass
4. **Type Check**: No TypeScript errors
5. **Create Tag**: `git tag v0.X.X`
6. **Push Tag**: `git push origin v0.X.X`
7. **Create Release**: GitHub UI or CLI
8. **Verify NPM**: Check package on npmjs.com

### Pre-release Testing

```bash
# Create a dry-run package
npm pack --dry-run

# Test package locally
npm pack
npm install -g apex-0.X.X.tgz
apex --version
```

## Development Tips

### ES Modules

APEX uses ES modules throughout:

```javascript
// ✅ Correct
import fs from 'fs-extra';
import { PatternManager } from './pattern-manager.js';

// ❌ Incorrect
const fs = require('fs-extra');
```

### File Extensions

Always include `.js` extension in imports:

```javascript
// ✅ Correct
import { utils } from './utils.js';

// ❌ Incorrect
import { utils } from './utils';
```

### Async/Await

Prefer async/await over callbacks:

```javascript
// ✅ Correct
async function readFile(path) {
  try {
    const content = await fs.readFile(path, 'utf-8');
    return content;
  } catch (error) {
    console.error('Read error:', error);
  }
}

// ❌ Avoid callbacks
function readFile(path, callback) {
  fs.readFile(path, 'utf-8', callback);
}
```

### Error Handling

Use structured error handling:

```javascript
class ApexError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'ApexError';
    this.code = code;
    this.details = details;
  }
}

// Usage
throw new ApexError('Pattern not found', 'PATTERN_NOT_FOUND', { patternId });
```

## Troubleshooting

### Common Issues

1. **ES Module Errors**
   - Ensure `"type": "module"` in package.json
   - Use `.js` extensions in imports
   - Run tests with experimental flag

2. **TypeScript Errors**
   - Run `npm run type-check` to see errors
   - Check tsconfig.json configuration
   - Ensure @types packages are installed

3. **Docker Issues**
   - Verify Docker daemon is running
   - Check port conflicts
   - Clear Docker cache: `docker system prune`

4. **Test Failures**
   - Clear test cache: `jest --clearCache`
   - Check for timing issues
   - Verify file permissions

### Getting Help

- Check existing [GitHub Issues](https://github.com/benredmond/apex/issues)
- Ask in [Discussions](https://github.com/benredmond/apex/discussions)
- Review [CONTRIBUTING.md](../CONTRIBUTING.md)

## Next Steps

- Explore the [Architecture Guide](./architecture.md)
- Read about [Pattern Development](./patterns.md)
- Learn about [APEX Intelligence](./intelligence.md)
- Check [API Documentation](./api.md)
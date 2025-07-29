# Contributing to APEX

Thank you for your interest in contributing to APEX! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/apex.git`
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature`

## Development Setup

### Quick Start

```bash
# Install dependencies
npm install

# Run the development setup script
./scripts/dev.sh setup
```

### Manual Setup

```bash
# Install dependencies
npm install

# Run TypeScript type check
npm run type-check

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint

# Format code
npm run format

# Build project
npm run build
```

### Docker Development

APEX includes Docker support for consistent development environments:

```bash
# Build Docker images
./scripts/dev.sh build:docker

# Run tests in Docker
./scripts/dev.sh test:docker

# Start development environment
./scripts/dev.sh dev

# Run APEX CLI in Docker
./scripts/dev.sh cli init
```

### TypeScript Migration

APEX is gradually migrating to TypeScript. New code should be written in TypeScript when possible:

- Use `.ts` extension for new files
- Add type definitions to `src/types/`
- Run `npm run type-check` to validate types
- TypeScript errors are currently non-blocking in CI

## Contributing Patterns

APEX thrives on community-contributed patterns. To contribute a pattern:

### 1. Document the Pattern

Add to `src/templates/CONVENTIONS.pending.md`:

```markdown
[TYPE:CATEGORY:SPECIFIC] ★★★☆☆ (0 uses, 0% success) @tags
```code
// Your pattern code here
```
CONTEXT: When to use this pattern
PREVENTS: What errors/issues this prevents
SEE_ALSO: [RELATED:PATTERN:ID]
```

### 2. Pattern Types

- **CMD**: Command patterns (build, test, run commands)
- **PAT**: Code patterns (implementation patterns)
- **FIX**: Fix patterns (error → solution mappings)
- **ARCH**: Architecture patterns (design decisions)

### 3. Testing Patterns

Before submitting, test your pattern:
1. Use it in at least 3 different scenarios
2. Document success rate
3. Note any edge cases or failures

## Contributing Code

### Code Standards

- Use ES modules (`import`/`export`)
- Follow ESLint configuration
- Add TypeScript types for new code
- Add JSDoc comments for public APIs
- Write tests for new features
- Follow existing patterns in the codebase

### Testing

- Unit tests required for all new features
- Integration tests for command workflows
- Maintain >80% code coverage
- Test with multiple Node.js versions (16, 18, 20)

### Commit Messages

Follow conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `test:` Test additions/changes
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

Example: `feat: add gemini integration for complex tasks`

## Pull Request Process

1. **Open an Issue First**: Discuss the change you wish to make
2. **Update Documentation**: Keep README and docs in sync
3. **Add Tests**: Include tests for new functionality
4. **Update Examples**: If applicable, update example projects
5. **Pass CI**: Ensure all tests and linting pass
6. **Request Review**: Tag maintainers for review

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Examples updated (if applicable)
- [ ] Lint and tests pass
- [ ] Commit messages follow convention
- [ ] PR description explains changes

## Reporting Issues

### Bug Reports

Include:
- APEX version (`apex --version`)
- Node.js version (`node --version`)
- Operating system
- npm/pnpm version
- TypeScript version (if applicable)
- Steps to reproduce
- Expected vs actual behavior
- Error messages/stack traces
- Relevant `.apex/` directory structure

### Feature Requests

Include:
- Use case description
- Proposed solution
- Alternative solutions considered
- Impact on existing features

## Architecture Decisions

Major changes require an Architecture Decision Record (ADR):

1. Create `docs/adr/NNNN-title.md`
2. Follow the template:
   - Status (proposed/accepted/rejected)
   - Context
   - Decision
   - Consequences

## Community

- **Discussions**: Use GitHub Discussions for questions
- **Discord**: Join our Discord for real-time chat
- **Blog**: Share your APEX success stories

## Recognition

Contributors are recognized in:
- README.md contributors section
- Release notes
- Annual contributor spotlight

## Code of Conduct

We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/). Please read and adhere to it.

## Questions?

- Check existing issues and discussions
- Ask in Discord
- Email: apex@example.com

Thank you for contributing to APEX Intelligence! 🚀
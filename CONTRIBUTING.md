# Contributing to DBAgent

Thank you for your interest in contributing to DBAgent! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project follows a Code of Conduct. By participating, you are expected to uphold this code:

- **Be respectful** and inclusive
- **Be collaborative** and constructive
- **Be patient** with newcomers
- **Focus on what is best** for the community

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues. When creating a bug report, include:

- **Clear description** of the issue
- **Steps to reproduce** the behavior
- **Expected behavior** vs actual behavior
- **Environment details** (OS, Node.js version, database type, LLM provider)
- **Relevant logs** or error messages

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear title** describing the enhancement
- **Provide detailed description** of the proposed functionality
- **Explain why** this enhancement would be useful
- **Include examples** of how it would work

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following our design principles
3. **Add tests** if you've added code that should be tested
4. **Ensure the test suite passes** (`npm test`)
5. **Update documentation** if needed
6. **Commit your changes** with clear commit messages

#### Design Principles

Follow these core principles when contributing:

1. **LLM-First Decision Making**

   - Ask: "Can the LLM handle this decision?"
   - If yes, let the LLM decide (no hardcoding)
   - Only hardcode safety constraints

2. **Transparency**

   - Users should see generated SQL
   - Show LLM reasoning when helpful
   - Log decision-making steps

3. **Safety First**

   - All queries must be read-only
   - Validate before execution
   - Enforce timeouts

4. **Modularity**

   - Single responsibility per service
   - Clean interfaces between modules
   - Testable components

5. **Database Agnostic**
   - Support multiple databases
   - LLM handles syntax differences
   - Unified client interface

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/DBAgent.git
cd DBAgent

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your test database and LLM credentials

# Build the project
npm run build

# Run tests
npm test

# Start development
npm run watch  # Watch mode for auto-rebuild
npm run web    # Test with web interface
```

### Code Style

- **TypeScript strict mode** - No `any` types without reason
- **Async/await** - Prefer over raw promises
- **Error handling** - Always handle errors gracefully
- **Logging** - Use logger for debug info
- **Comments** - Explain why, not what (code should be self-documenting)
- **Naming** - Clear, descriptive variable/function names

### Testing Guidelines

- **Write unit tests** for new functions
- **Write integration tests** for new features
- **All tests must pass** before submitting PR
- **Coverage should not decrease**
- **Test both success and error cases**

Example test structure:

```typescript
import { describe, it, expect } from "vitest";

describe("MyFeature", () => {
  it("should handle normal case", () => {
    // Test implementation
  });

  it("should handle edge case", () => {
    // Test implementation
  });

  it("should throw on invalid input", () => {
    // Test implementation
  });
});
```

### Commit Messages

Follow conventional commits format:

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(query-generator): Add support for window functions

Implements PostgreSQL window functions support in query generation.
LLM now understands OVER() clauses and partition ordering.

Closes #123
```

```
fix(query-safety): Prevent false positives on string literals

Enhanced keyword detection to strip string literals before checking.
This prevents queries like SELECT 'insert data' from being blocked.

Fixes #456
```

### Documentation

- **Update README.md** if adding user-facing features
- **Add JSDoc comments** for public APIs
- **Update examples** if behavior changes
- **Keep inline comments** clear and helpful

### Adding New Features

When adding a new feature, consider:

1. **Is it LLM-first?** - Does it leverage LLM intelligence?
2. **Is it safe?** - Does it maintain read-only guarantees?
3. **Is it tested?** - Are there unit and integration tests?
4. **Is it documented?** - Is usage clear to users?
5. **Is it modular?** - Does it fit the service architecture?

### Adding New Database Support

To add support for a new database type:

1. **Update `db-client.ts`** with new database type
2. **Implement schema introspection** for the new database
3. **Add syntax rules** for query generation
4. **Create parameterization logic** (e.g., `?` vs `$1`)
5. **Add tests** for the new database type
6. **Update documentation** with setup guide
7. **Add to configuration** in `.env.example`

### Adding New LLM Provider

To add support for a new LLM provider:

1. **Update `llm-client.ts`** with new provider
2. **Implement provider-specific client** (OpenAI-compatible or custom)
3. **Add configuration** to `.env.example`
4. **Update provider comparison** table in README
5. **Add setup guide** to documentation
6. **Test with real API** (or mock in tests)

### Review Process

1. **Create Pull Request** with clear description
2. **Wait for review** - maintainers will review your PR
3. **Address feedback** - make requested changes
4. **Tests must pass** - CI checks must be green
5. **Get approval** - at least one maintainer approval needed
6. **Merge** - maintainers will merge when ready

### Questions?

If you have questions about contributing:

- Open a GitHub Discussion
- Check existing Issues and PRs
- Read the README.md thoroughly

## Recognition

Contributors will be:

- Listed in the README.md acknowledgments
- Credited in release notes
- Appreciated by the community! 🎉

Thank you for contributing to DBAgent! 💚


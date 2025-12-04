# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- GitHub Actions CI/CD workflow
- Docker container support
- Additional database backends (MongoDB, Redis)
- Streaming query results
- Query result caching
- Multi-database federation

## [2.0.0] - 2025-12-04

### Added

- **Multi-Database Support**: PostgreSQL, MySQL, and SQLite
- **Service Architecture**: Refactored into 7 modular service components
- **Comprehensive Testing**: 54 tests (38 unit, 16 integration) - all passing
- **Enhanced Web Chatbot**: Conversation memory with context retention
- **Database-Specific Syntax**: Automatic adaptation for each database type
- **Schema Caching**: TTL-based caching for performance optimization
- **Query Safety**: Enhanced read-only enforcement with string literal stripping
- **Error Hints**: Database-specific error messages and troubleshooting
- **Unified Documentation**: Consolidated all docs into single comprehensive README
- **Service Modules**:
  - Schema Service - Schema management with caching
  - Analysis Planner - LLM-driven query planning
  - Query Generator - Database-specific SQL generation
  - Query Executor - Safe execution with timeouts
  - Result Formatter - LLM-powered result presentation
  - Query Planner - Pipeline orchestrator
  - Query Safety - Safety enforcement utilities

### Changed

- **Architecture**: Monolithic → Modular service-based architecture
- **Documentation**: 14 markdown files → 1 comprehensive README.md
- **Database Client**: Unified interface across PostgreSQL, MySQL, SQLite
- **Configuration**: Enhanced `.env.example` with all options documented

### Fixed

- Query safety false positives on SQL string literals
- PostgreSQL case sensitivity handling in query generation
- Config NaN port issue with conditional assignment
- TypeScript type safety in schema service

### Improved

- Code organization and maintainability (62% reduction in main file size)
- Test coverage with comprehensive unit and integration tests
- Error messages with context-aware hints
- Performance with schema caching
- Developer experience with better logging and debugging

## [1.0.0] - 2025-11-15

### Added

- **Multi-LLM Support**: OpenAI, Azure OpenAI, Grok, Gemini, Ollama
- **Web Chatbot Interface**: Browser-based chat UI with Socket.IO
- **Interactive CLI Client**: Command-line interface for direct interaction
- **MCP Server Mode**: Integration with Claude Desktop and other MCP clients
- **PostgreSQL Support**: Full PostgreSQL database support
- **LLM-Driven Pipeline**: 6-step intelligent query flow
  1. Query Need Analysis
  2. Metadata Retrieval
  3. Structure Analysis
  4. SQL Generation
  5. Safe Execution
  6. Result Formatting
- **Safety Features**:
  - Read-only query enforcement
  - Query timeouts
  - Parameterized queries
  - Keyword filtering
- **MCP Tools**:
  - `query_database` - Natural language queries
  - `analyze_schema` - Schema analysis
- **Sample Database**: Docker Compose setup with test data
- **Documentation**:
  - README.md with quick start
  - USAGE.md with detailed guides
  - ARCHITECTURE.md with system design
  - WEB-CHATBOT.md with interface guide

### Features

- Natural language to SQL conversion
- Schema introspection and caching
- LLM-powered result formatting
- Multi-provider LLM support
- Environment-based configuration
- Structured logging with Pino

## [0.1.0] - 2025-11-01 (Initial Prototype)

### Added

- Basic MCP server implementation
- OpenAI integration for query generation
- PostgreSQL connection support
- Simple schema retrieval
- Command-line interface
- Basic documentation

---

## Version History Summary

- **v2.0.0** (2025-12-04): Multi-database support, service architecture, comprehensive testing
- **v1.0.0** (2025-11-15): Multi-LLM support, web chatbot, MCP integration
- **v0.1.0** (2025-11-01): Initial prototype

## Links

- [Repository](https://github.com/your-org/DBAgent)
- [Issues](https://github.com/your-org/DBAgent/issues)
- [Discussions](https://github.com/your-org/DBAgent/discussions)


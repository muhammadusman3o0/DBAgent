# DBAgent - Multi-Database LLM Query System

> Intelligent natural language database queries powered by LLMs with comprehensive safety controls and multi-database support.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-54%20passing-brightgreen)](#testing)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage Modes](#usage-modes)
- [Multi-Database Support](#multi-database-support)
- [LLM Providers](#llm-providers)
- [Service Modules](#service-modules)
- [Security & Safety](#security--safety)
- [Testing](#testing)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

## Overview

DBAgent is a Model Context Protocol (MCP) server that uses **Large Language Models for ALL decision-making**. No hardcoded heuristics, patterns, or regex - pure LLM intelligence for schema analysis, query generation, and result formatting.

**Supports Multiple Databases**: PostgreSQL, MySQL, SQLite  
**Supports Multiple LLM Providers**: OpenAI, Azure OpenAI, Grok (xAI), Google Gemini, and Ollama (local models)

### Design Philosophy

This server is built on the principle that **every decision should be made by the LLM**:

- **Schema Understanding**: LLM analyzes database structure and relationships
- **Query Generation**: Natural language → SQL conversion entirely by LLM
- **Safety Validation**: LLM-aware query safety checks
- **Result Formatting**: LLM presents data in natural, contextual language
- **Error Handling**: LLM interprets errors and provides helpful guidance

**No pattern matching. No hardcoded templates. Just intelligent, context-aware AI.**

## Key Features

### Core Capabilities

✅ **Natural Language Queries** - "Show me users who spent over $1000"  
✅ **Multi-Database Support** - PostgreSQL, MySQL, SQLite with unified interface  
✅ **Multi-LLM Support** - OpenAI, Azure, Grok, Gemini, Ollama  
✅ **Schema Analysis** - Intelligent understanding of table relationships  
✅ **Database-Specific Syntax** - Automatic adaptation for each database type  
✅ **Safety Controls** - Read-only queries, timeouts, parameterization  
✅ **Smart Formatting** - LLM-powered result presentation  
✅ **Schema Caching** - Performance optimization with TTL  
✅ **Error Recovery** - Database-specific error hints  
✅ **Web Interface** - Chat UI with conversation memory  
✅ **Test Coverage** - 54 tests covering safety and integration

### LLM Pipeline (6 Steps)

DBAgent follows an intelligent 6-step flow for every query:

```
┌─────────────────────────────────────────────┐
│  1. Query Need Analysis                     │
│     Determine if database access required   │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  2. Metadata Retrieval                      │
│     Fetch schema with caching               │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  3. Structure Analysis                      │
│     Understand relationships and data model │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  4. SQL Generation                          │
│     Create database-appropriate query       │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  5. Safe Execution                          │
│     Run with safety checks and timeout      │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  6. Result Formatting                       │
│     Present in natural language             │
└─────────────────────────────────────────────┘
```

**Key Principle**: No hardcoded rules. At each step, the LLM makes intelligent decisions based on what it learned in previous steps.

## Quick Start

```bash
# 1. Clone and install
git clone <your-repo-url>
cd DBAgent
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your database and LLM provider settings

# 3. Start PostgreSQL (if using Docker)
docker compose up -d

# 4. Build the project
npm run build

# 5. Choose your mode:

# Option A: Web chatbot (recommended for beginners)
npm run web
# Open http://localhost:3000 in your browser

# Option B: Interactive CLI client
npm run test:interactive

# Option C: MCP server (configure with Claude Desktop or other MCP clients)
# See MCP Configuration section below
```

### Minimal Configuration

**For local development with Ollama (free):**

```bash
# .env
DB_TYPE=postgres
DATABASE_URL=postgres://postgres:password@localhost:5432/postgres
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama2
```

**For production with OpenAI:**

```bash
# .env
DB_TYPE=postgres
DATABASE_URL=postgres://user:pass@host:5432/db
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────┐
│              MCP Transport Layer (index.ts)          │
│  - Server setup & request handlers                  │
│  - Tool definitions (query_database, analyze_schema)│
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────┐
│           Query Planner (Orchestrator)               │
│  - Coordinates 6-step LLM pipeline                  │
│  - Manages service dependencies                     │
└──────────────────┬──────────────────────────────────┘
                   │
      ┌────────────┼────────────┬────────────┐
      │            │            │            │
┌─────▼─────┐ ┌───▼────┐ ┌─────▼────┐ ┌────▼────┐
│  Schema   │ │Analysis│ │  Query   │ │  Query  │
│  Service  │ │Planner │ │Generator │ │Executor │
└───────────┘ └────────┘ └──────────┘ └─────────┘
      │            │           │            │
      └────────────┴───────────┴────────────┘
                   │
      ┌────────────┴────────────┐
      │                         │
┌─────▼──────┐         ┌────────▼────────┐
│ DB Client  │         │   LLM Client    │
│ (Multi-DB) │         │ (Multi-Provider)│
└────────────┘         └─────────────────┘
```

### Database-Aware Query Generation

DBAgent is intelligent about database-specific syntax. **Same natural language request → Different SQL syntax, all correct!**

**PostgreSQL**:

```sql
SELECT "userId", "firstName"
FROM public.users
WHERE created_at > NOW() - INTERVAL '7 days'
  AND status = $1
LIMIT 100
```

**MySQL**:

```sql
SELECT userId, firstName
FROM users
WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND status = ?
LIMIT 100
```

**SQLite**:

```sql
SELECT userid, firstname
FROM users
WHERE created_at > datetime('now', '-7 days')
  AND status = ?
LIMIT 100
```

The LLM receives **database-specific syntax rules** and generates the appropriate query for your database type automatically!

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- One of: PostgreSQL, MySQL, or SQLite database
- LLM provider account (OpenAI, Google, etc.) OR Ollama for local usage

### Install Dependencies

```bash
npm install
```

### Build TypeScript

```bash
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

#### Database Configuration

Choose **ONE** database type:

**PostgreSQL** (default):

```bash
DB_TYPE=postgres
DATABASE_URL=postgres://user:password@localhost:5432/mydb

# OR use individual settings:
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=myuser
POSTGRES_PASSWORD=mypassword
POSTGRES_DB=mydb
```

**MySQL**:

```bash
DB_TYPE=mysql
DATABASE_URL=mysql://root:password@localhost:3306/testdb

# OR:
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DB=testdb
```

**SQLite**:

```bash
DB_TYPE=sqlite
SQLITE_FILE=./database.sqlite
```

#### LLM Provider Configuration

Choose **ONE** LLM provider:

**OpenAI** (Recommended for production):

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # or gpt-4, gpt-3.5-turbo
```

**Azure OpenAI**:

```bash
LLM_PROVIDER=azure
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4
```

**Grok (xAI)**:

```bash
LLM_PROVIDER=grok
GROK_API_KEY=your-xai-key
GROK_MODEL=grok-beta
```

**Google Gemini** (Free tier available):

```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-1.5-flash  # or gemini-pro
```

**Ollama** (Local/Free):

```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2  # or mistral, codellama, phi
```

#### Optional Settings

```bash
# Performance
MAX_ROWS=100                      # Max rows per query (1-1000)
SCHEMA_CACHE_TTL_SECONDS=300      # Schema cache lifetime
MAX_EXECUTION_MS=30000            # Query timeout (ms)

# LLM Tuning
LLM_TEMPERATURE=0.1               # Creativity (0.0-2.0)
LLM_MAX_TOKENS=2000               # Max response length

# Web Server
WEB_PORT=3000                     # Web chatbot port

# Logging
LOG_LEVEL=info                    # trace, debug, info, warn, error
```

## Usage Modes

DBAgent supports **three distinct usage modes**:

### 1. Web Chatbot (Recommended)

Modern browser-based interface with **conversation memory**:

```bash
npm run web
# Open http://localhost:3000
```

**Features:**

- 💬 Chat interface with message history
- 🧠 Remembers conversation context across queries
- ⚡ Real-time typing indicators
- 🎨 Beautiful, responsive UI
- 🗑️ Clear history button
- 🔄 Automatic reconnection

**Example conversation:**

```
You: Show me all tables
Bot: The database contains: customers, orders, products, order_items

You: How many customers?
     👆 Bot remembers you asked about tables
Bot: There are 150 customers in the database

You: Show top 5 by spending
     👆 Bot knows context of "customers" and "spending"
Bot: Here are the top 5 customers by total spending:
     1. John Doe - $2,450.00
     2. Jane Smith - $1,890.00
     ...
```

The chatbot maintains the **last 10 messages** as context, enabling natural follow-up questions!

### 2. MCP Server (Standard Mode)

For integration with Claude Desktop, IDEs, and other MCP clients:

**Claude Desktop Configuration:**

1. Locate config file:

   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. Add server configuration (use **absolute paths**):

```json
{
  "mcpServers": {
    "dbagent": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/DBAgent/build/index.js"],
      "env": {
        "DATABASE_URL": "postgres://localhost/mydb",
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

3. Restart Claude Desktop

**Available MCP Tools:**

- `query_database` - Execute natural language queries
- `analyze_schema` - Get LLM-powered schema analysis

**MCP Resources:**

- `db://schema/public` - Schema information
- `db://schema/{name}` - Custom schema info

**Usage in Claude:**

```
Use the dbagent tool to show me all customers

Use the dbagent tool to find orders from last week

Use the dbagent tool to analyze the database schema
```

### 3. Interactive CLI Client

Direct command-line interaction:

```bash
npm run test:interactive
```

```
🚀 Starting DBAgent Interactive Client...

✓ LLM configured: openai (gpt-4)
✓ Connected to PostgreSQL

Query> show me all tables

💬 Response:
The database contains:
- customers
- orders
- products
- order_items

Query> find top 5 customers by revenue

💬 Response:
Here are the top 5 customers by total revenue:
1. John Doe - $2,450.00 (5 orders)
2. Jane Smith - $1,890.00 (3 orders)
3. Bob Wilson - $1,200.00 (4 orders)
...

Query> exit
👋 Goodbye!
```

**Other Scripts:**

```bash
npm run test:mcp-agent   # Advanced interactive with debugging
npm run test:smoke       # Automated smoke tests
```

## Multi-Database Support

### Database Comparison

| Feature           | PostgreSQL | MySQL       | SQLite      |
| ----------------- | ---------- | ----------- | ----------- |
| Server Required   | Yes        | Yes         | No          |
| Schema Support    | ✅ Full    | ✅ DB-level | ⚠️ Single   |
| JSON Columns      | ✅ JSONB   | ✅ JSON     | ⚠️ Limited  |
| Concurrent Writes | ✅ High    | ✅ Good     | ⚠️ Single   |
| Parameter Syntax  | `$1, $2`   | `?, ?`      | `?, ?`      |
| Case Sensitivity  | ✅ Yes     | ⚠️ Depends  | ❌ No       |
| Best For          | Production | Web Apps    | Dev/Testing |

### Database-Specific Features

#### PostgreSQL

- ✅ Full schema support (public, custom schemas)
- ✅ JSON/JSONB columns with operators
- ✅ Array types
- ✅ Advanced data types (UUID, INET, etc.)
- ✅ Foreign key introspection
- ✅ Case-sensitive identifiers
- ✅ Concurrent read/write

**Quick Setup:**

```bash
docker compose up -d
DB_TYPE=postgres npm run web
```

**PostgreSQL-Specific Syntax:**

```sql
-- Schema prefix required
SELECT * FROM public.users

-- Case-sensitive column names (use quotes)
SELECT "userId", "firstName" FROM users

-- PostgreSQL functions
WHERE created_at > NOW() - INTERVAL '7 days'

-- JSONB operators
WHERE metadata @> '{"active": true}'
```

#### MySQL

- ✅ Multiple database support
- ✅ JSON columns with functions
- ✅ Full-text search
- ✅ Auto-increment columns
- ✅ Foreign key constraints
- ⚠️ Case sensitivity varies by OS

**Quick Setup:**

```bash
docker run -d -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=testdb \
  mysql:8

DB_TYPE=mysql npm run web
```

**MySQL-Specific Syntax:**

```sql
-- Database prefix (no schema concept)
SELECT * FROM testdb.users

-- Backticks for reserved words
SELECT `order`, `user` FROM `orders`

-- MySQL functions
WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)

-- JSON functions
WHERE JSON_EXTRACT(metadata, '$.active') = true
```

#### SQLite

- ✅ Single-file database
- ✅ No server required
- ✅ Perfect for development
- ✅ Cross-platform
- ✅ Zero configuration
- ⚠️ Limited concurrent writes
- ⚠️ No separate user authentication

**Quick Setup:**

```bash
sqlite3 database.sqlite < db/init.sql
DB_TYPE=sqlite npm run web
```

**SQLite-Specific Syntax:**

```sql
-- No schema prefix
SELECT * FROM users

-- Case-insensitive
SELECT userid, firstname FROM users

-- SQLite functions
WHERE created_at > datetime('now', '-7 days')

-- PRAGMA for schema info
PRAGMA table_info(users);
```

### Switching Databases

Simply update `.env` and restart - **no code changes needed**:

```bash
# Switch from PostgreSQL to MySQL
DB_TYPE=mysql
DATABASE_URL=mysql://root:password@localhost/testdb

# Rebuild and restart
npm run build
npm run web
```

The LLM automatically adapts query generation to the new database type!

### Migration Between Databases

1. Export data from current database
2. Update `.env` with new database type
3. Import data to new database
4. Restart DBAgent

No code changes required - the unified interface handles everything!

## LLM Providers

### Provider Comparison

| Provider     | Cost   | Speed  | Quality   | Privacy       | Offline | Setup Difficulty |
| ------------ | ------ | ------ | --------- | ------------- | ------- | ---------------- |
| OpenAI       | $$$    | Fast   | Excellent | Cloud         | No      | Easy             |
| Azure OpenAI | $$$    | Fast   | Excellent | Private Cloud | No      | Medium           |
| Grok         | $$     | Fast   | Very Good | Cloud         | No      | Easy             |
| Gemini       | Free/$ | Fast   | Good      | Cloud         | No      | Easy             |
| Ollama       | Free   | Medium | Good      | Local         | Yes     | Medium           |

### Provider Setup Guides

#### OpenAI

**Best for:** Production use, highest quality

1. Get API key: https://platform.openai.com/api-keys
2. Set in `.env`:
   ```bash
   LLM_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini  # or gpt-4, gpt-3.5-turbo
   ```
3. **Cost:** ~$0.03/query (gpt-4), ~$0.001/query (gpt-3.5-turbo)

#### Ollama (Local/Free)

**Best for:** Privacy, offline use, no API costs

1. Install:

   ```bash
   # macOS
   brew install ollama

   # Linux
   curl https://ollama.ai/install.sh | sh

   # Windows
   # Download from https://ollama.ai
   ```

2. Pull a model:

   ```bash
   ollama pull llama2
   # Other options: mistral, codellama, phi, gemma
   ```

3. Start Ollama (if not running):

   ```bash
   ollama serve
   ```

4. Configure:
   ```bash
   LLM_PROVIDER=ollama
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=llama2
   ```

**Advantages:**

- Completely free
- No API key needed
- Works offline
- Privacy-preserving (data never leaves your machine)

**Disadvantages:**

- Requires local compute (GPU recommended)
- Slower than cloud APIs
- May have lower quality on complex queries

#### Google Gemini

**Best for:** Free tier, good quality

1. Get API key: https://makersuite.google.com/app/apikey
2. Configure:
   ```bash
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=your-key
   GEMINI_MODEL=gemini-1.5-flash  # or gemini-pro
   ```
3. **Free tier:** 60 requests/minute

#### Azure OpenAI

**Best for:** Enterprise deployments, private cloud

1. Set up Azure OpenAI resource
2. Configure:
   ```bash
   LLM_PROVIDER=azure
   AZURE_OPENAI_API_KEY=your-key
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_DEPLOYMENT=gpt-4
   AZURE_OPENAI_API_VERSION=2024-02-15-preview
   ```

#### Grok (xAI)

**Best for:** Latest models, competitive with GPT-4

1. Get API key from https://x.ai/api
2. Configure:
   ```bash
   LLM_PROVIDER=grok
   GROK_API_KEY=your-xai-key
   GROK_MODEL=grok-beta
   ```

## Service Modules

DBAgent uses a **modular service architecture** for maintainability and testability:

### 1. Schema Service (`src/services/schema-service.ts`)

**Responsibility:** Schema information management

- Schema retrieval from database
- Metadata caching with TTL
- LLM-friendly formatting
- Multi-database support

**Key Methods:**

- `getSchemaInformation(schema)` - Get cached or fresh schema
- `formatSchemaForLLM(schema)` - Format for LLM consumption
- `getAllDatabaseMetadata()` - Retrieve all schema info

### 2. Analysis Planner (`src/services/analysis-planner.ts`)

**Responsibility:** LLM-driven query planning

- Determine if query is needed
- Analyze data structure
- Identify relevant tables
- Understand relationships

**Key Methods:**

- `determineIfQueryNeeded(request)` - Query necessity check
- `analyzeDataStructure(request, schema)` - Relationship analysis

### 3. Query Generator (`src/services/query-generator.ts`)

**Responsibility:** SQL generation

- Natural language → SQL conversion
- Database-specific syntax rules
- Parameterized query creation
- JOIN optimization

**Key Methods:**

- `generateQuery(request, analysis, schema)` - Create SQL
- `getDatabaseSyntaxRules()` - Get DB-specific rules

### 4. Query Executor (`src/services/query-executor.ts`)

**Responsibility:** Safe query execution

- Safety validation
- Query execution with timeout
- Error handling
- Database-specific error hints

**Key Methods:**

- `execute(sql, parameters)` - Run query safely
- `getDatabaseErrorHint(error)` - Context-aware error messages

### 5. Result Formatter (`src/services/result-formatter.ts`)

**Responsibility:** Result presentation

- LLM-powered formatting
- Natural language responses
- Complete data display
- Fallback formatting

**Key Methods:**

- `formatResults(results, request, sql)` - Format with LLM
- `formatResultsFallback(results)` - Fallback formatter

### 6. Query Planner (`src/services/query-planner.ts`)

**Responsibility:** Pipeline orchestration

- Coordinates all services
- Manages 6-step flow
- Handles errors gracefully
- Ensures proper flow execution

**Key Methods:**

- `processRequest(request, schema, maxRows)` - Execute pipeline
- `formatResults(results, request)` - Format final output

### 7. Query Safety (`src/services/query-safety.ts`)

**Responsibility:** Safety enforcement

- Read-only validation
- Keyword detection
- String literal stripping (prevents false positives)
- Timeout utilities

**Key Functions:**

- `enforceReadOnly(sql)` - Validate query safety
- `withQueryTimeout(promise, timeout)` - Add timeout

## Security & Safety

### Read-Only Enforcement

All queries are validated before execution:

```typescript
// ❌ Forbidden Operations
INSERT, UPDATE, DELETE, DROP, ALTER, GRANT,
REVOKE, TRUNCATE, CREATE, EXEC, EXECUTE

// ✅ Allowed Operations
SELECT (with explicit LIMIT clause)
```

**Smart Detection:** String literals are stripped before checking:

```sql
-- ✅ ALLOWED (keyword in string)
SELECT 'insert this data' FROM users

-- ❌ BLOCKED (actual insert)
INSERT INTO users VALUES (...)
```

### Query Timeout

Prevents long-running queries:

```bash
MAX_EXECUTION_MS=30000  # 30 seconds default
```

Configurable timeout ensures queries don't hang indefinitely.

### Parameterized Queries

**Database-specific parameterization prevents SQL injection:**

- PostgreSQL: `$1, $2, $3`
- MySQL/SQLite: `?, ?, ?`

The LLM generates queries with proper parameter placeholders automatically.

### Schema Caching

**Performance optimization with TTL:**

```bash
SCHEMA_CACHE_TTL_SECONDS=300  # 5 minutes default
```

Schema information is cached to reduce database queries. Cache automatically invalidates after TTL expires.

### Connection Security

- ✅ Passwords not logged
- ✅ Connection strings parsed safely
- ✅ Environment-based configuration
- ✅ No credentials in code

### Row Limits

All queries enforce maximum row limits:

```bash
MAX_ROWS=100  # Default, configurable 1-1000
```

Prevents overwhelming responses and resource exhaustion.

## Testing

DBAgent includes comprehensive test coverage with **54 passing tests**:

### Run All Tests

```bash
npm test
```

**Test Suite:**

- ✅ 38 unit tests (query safety module)
- ✅ 16 integration tests (end-to-end pipeline)
- ✅ 54 total tests - **all passing**

### Unit Tests

```bash
npm test tests/unit/query-safety.test.ts
```

**Coverage:**

- Read-only enforcement (25 tests)
  - Blocks dangerous keywords
  - Allows safe SELECT queries
  - Handles edge cases
  - String literal stripping
- Query timeout handling (6 tests)
  - Timeout enforcement
  - Promise cancellation
  - Error handling
- Safety error types (4 tests)
  - Custom error classes
  - Error messages
- Integration scenarios (3 tests)
  - Real-world queries
  - Complex SQL

### Integration Tests

```bash
npm test tests/integration/smoke.test.ts
```

**Coverage:**

- Schema service integration (5 tests)
  - Schema retrieval
  - Caching behavior
  - LLM formatting
- Query executor integration (7 tests)
  - Safe execution
  - Error handling
  - Timeout management
- Safety module integration (2 tests)
  - End-to-end safety
  - Parameterization
- Pipeline simulation (2 tests)
  - Complete workflow
  - Service coordination

### Manual Testing

```bash
# Run smoke test
npm run test:smoke

# Interactive testing
npm run test:interactive

# Web interface testing
npm run web
```

### Test Infrastructure

- **Framework:** Vitest
- **Database:** In-memory SQLite for integration tests
- **Coverage:** All core safety and execution paths
- **CI Ready:** Tests can run in CI/CD pipelines

## Development

### Project Structure

```
DBAgent/
├── src/
│   ├── index.ts              # MCP transport layer
│   ├── config.ts             # Configuration management
│   ├── db-client.ts          # Multi-database client
│   ├── llm-client.ts         # Multi-LLM client
│   ├── logger.ts             # Structured logging
│   └── services/
│       ├── analysis-planner.ts    # Query planning
│       ├── query-executor.ts      # Safe execution
│       ├── query-generator.ts     # SQL generation
│       ├── query-planner.ts       # Orchestrator
│       ├── query-safety.ts        # Safety utils
│       ├── result-formatter.ts    # Result formatting
│       └── schema-service.ts      # Schema management
├── tests/
│   ├── unit/
│   │   └── query-safety.test.ts   # Unit tests
│   └── integration/
│       └── smoke.test.ts          # Integration tests
├── scripts/
│   ├── interactive-client.ts      # CLI client
│   ├── mcp-agent.ts              # Advanced client
│   ├── mcp-smoke.ts              # Smoke tests
│   └── web-chatbot.ts            # Web server
├── public/                        # Web interface
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── db/
│   └── init.sql                   # Sample schema
└── docker-compose.yml             # PostgreSQL setup
```

### Development Workflow

```bash
# 1. Make code changes in src/
vim src/services/query-planner.ts

# 2. Build TypeScript
npm run build

# 3. Run tests
npm test

# 4. Test with web chatbot (easiest way)
npm run web

# 5. Test with MCP client
# Configure in Claude Desktop, restart

# 6. Commit changes
git add .
git commit -m "Add feature"
```

### Watch Mode

Auto-rebuild on file changes:

```bash
npm run watch
```

### Code Quality

```bash
# Type check
npx tsc --noEmit

# Run all checks
npm run build && npm test
```

### Adding New Features

**Follow LLM-first principles:**

1. **Can the LLM handle this decision?** → Let it
2. **Does it need hardcoding?** → Only for safety
3. **Add tests** → Unit + integration
4. **Update docs** → Keep README current
5. **Maintain modularity** → Single responsibility

### Debugging

Enable detailed logging:

```bash
LOG_LEVEL=debug npm run web
```

Check logs in:

- Terminal output (web/CLI modes)
- Claude Desktop logs (MCP mode)
  - macOS: `~/Library/Logs/Claude/`
  - Windows: `%APPDATA%\Claude\logs\`

## Troubleshooting

### Common Issues

#### "LLM not configured"

**Problem:** Server starts but LLM features don't work

**Solution:**

```bash
# 1. Check .env exists
ls -la .env

# 2. Verify LLM_PROVIDER is set
grep LLM_PROVIDER .env

# 3. Check corresponding API key
grep OPENAI_API_KEY .env  # or GEMINI, GROK, etc.

# 4. Rebuild
npm run build
```

#### Database Connection Failed

**PostgreSQL:**

```bash
# Test connection manually
psql "$DATABASE_URL"

# Check Docker container
docker compose ps
docker compose logs postgres

# Verify connection string format
# Correct: postgres://user:pass@host:port/database
# Wrong: postgresql://... (use postgres://)
```

**MySQL:**

```bash
# Test connection
mysql -h 127.0.0.1 -u root -p -e "SELECT VERSION();"

# Check Docker container
docker ps | grep mysql
docker logs mysql-container
```

**SQLite:**

```bash
# Check file exists
ls -la database.sqlite

# Test file access
sqlite3 database.sqlite "SELECT sqlite_version();"
```

#### Column Does Not Exist (PostgreSQL)

**Problem:** Error: `column "userId" does not exist`

**Cause:** PostgreSQL is case-sensitive

**Solution:** The LLM learns to use quotes from database-specific syntax rules:

```sql
SELECT "userId" FROM users  -- ✓ Correct
SELECT userId FROM users    -- ✗ Error
```

If the LLM generates incorrect syntax, check that `DB_TYPE=postgres` is set correctly.

#### Query Timeout

**Problem:** Queries taking too long

**Solutions:**

1. **Increase timeout:**

   ```bash
   MAX_EXECUTION_MS=60000  # 60 seconds
   ```

2. **Optimize queries:**

   - Use smaller `maxRows` parameter
   - Add indexes to database
   - Limit query complexity

3. **Try faster LLM model:**
   ```bash
   OPENAI_MODEL=gpt-3.5-turbo  # Faster than gpt-4
   ```

#### Ollama Connection Refused

**Problem:** "Failed to connect to Ollama at http://localhost:11434"

**Solution:**

```bash
# 1. Check if Ollama is running
curl http://localhost:11434/api/tags

# 2. Start Ollama
ollama serve

# 3. Verify model is pulled
ollama list

# 4. Pull model if missing
ollama pull llama2

# 5. Test with simple query
ollama run llama2 "Hello"
```

#### MCP Client Can't Find Server

**Problem:** Claude Desktop doesn't show DBAgent tools

**Solutions:**

1. **Use absolute paths** in config:

   ```json
   // ✓ Correct
   "args": ["/Users/you/DBAgent/build/index.js"]

   // ✗ Wrong
   "args": ["./build/index.js"]
   "args": ["~/DBAgent/build/index.js"]
   ```

2. **Verify build exists:**

   ```bash
   ls -la /path/to/DBAgent/build/index.js
   ```

3. **Check environment variables:**

   - All required vars set in MCP config
   - DATABASE_URL is correct
   - LLM_PROVIDER matches API key

4. **Restart Claude Desktop** after config changes

5. **Check Claude logs:**
   - macOS: `~/Library/Logs/Claude/`
   - Look for connection errors or startup failures

#### Web Chatbot Issues

**Problem:** Blank page at http://localhost:3000

**Solutions:**

```bash
# 1. Check build completed
npm run build

# 2. Verify public/ directory exists
ls -la public/

# 3. Check correct port
grep WEB_PORT .env

# 4. Clear browser cache
# Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
```

**Problem:** "Disconnected" status in UI

**Solutions:**

1. Check server is running in terminal
2. Verify no errors in server logs
3. Check browser console for errors (F12)
4. Restart the server: `npm run web`

#### Slow Responses

**Common causes:**

1. **Large result sets**

   - Reduce `MAX_ROWS` or use `maxRows` parameter
   - Add database indexes

2. **Complex queries**

   - Simplify natural language request
   - Try faster LLM model

3. **Ollama on CPU**
   - Use smaller model: `ollama pull phi`
   - Consider cloud LLM for production

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
LOG_LEVEL=debug npm run web
```

This shows:

- Database connection details
- LLM provider information
- Query generation steps
- Safety check results
- Execution timing

## API Reference

### MCP Tools

#### `query_database`

Execute natural language database query.

**Parameters:**

- `request` (string, required): Natural language description of what you want
- `schema` (string, optional): Database schema name (default: "public")
- `maxRows` (number, optional): Maximum rows to return (1-1000, default: 100)

**Example:**

```json
{
  "request": "Show me customers who spent over $1000 last month",
  "schema": "public",
  "maxRows": 50
}
```

**Returns:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 12 customers who spent over $1000 last month:\n\n1. John Doe - $2,450.00 (5 orders)\n2. Jane Smith - $1,890.00 (3 orders)\n..."
    },
    {
      "type": "text",
      "text": "SQL Query:\nSELECT c.name, SUM(o.amount) as total\nFROM customers c\nJOIN orders o ON c.id = o.customer_id\n..."
    }
  ]
}
```

#### `analyze_schema`

Get LLM-powered analysis of database schema.

**Parameters:**

- `schema` (string, optional): Database schema name (default: "public")
- `question` (string, optional): Specific question about the schema

**Example:**

```json
{
  "schema": "public",
  "question": "What are the main entity relationships in this database?"
}
```

**Returns:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "The database follows an e-commerce pattern:\n\n- customers table: Central entity storing customer data\n- orders table: Links to customers via customer_id foreign key\n- products table: Inventory and pricing information\n- order_items: Junction table connecting orders to products\n\nKey relationships:\n- One customer → many orders (1:N)\n- One order → many order items (1:N)\n- One product → many order items (1:N)\n\nIndexes exist on all foreign keys for query performance."
    }
  ]
}
```

### Web API (Chatbot Mode)

When running `npm run web`, the server exposes an HTTP API:

#### POST `/chat`

Send a message to the chatbot with conversation context.

**Request:**

```json
{
  "message": "Show me all customers",
  "sessionId": "unique-session-id"
}
```

**Response:**

```json
{
  "response": "Found 150 customers in the database...",
  "sql": "SELECT * FROM customers LIMIT 100",
  "rowCount": 100,
  "data": [...]
}
```

The server maintains conversation history per `sessionId` for context-aware responses.

### Service Module APIs

#### SchemaService

```typescript
class SchemaService {
  getSchemaInformation(schema: string): Promise<SchemaInfo>;
  formatSchemaForLLM(schema: string): Promise<string>;
  getAllDatabaseMetadata(): Promise<DatabaseMetadata>;
}
```

#### QueryExecutor

```typescript
class QueryExecutor {
  execute(sql: string, parameters: any[]): Promise<QueryResult>;
  getDatabaseErrorHint(error: Error): string;
}
```

#### QuerySafety

```typescript
function enforceReadOnly(sql: string): void;
function withQueryTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T>;
```

## Examples

### Basic Queries

**Simple selection:**

```
Request: "Show me all users"

Generated SQL (PostgreSQL):
SELECT * FROM public.users LIMIT 100

Response:
Found 100 users in the database. Here are the first 10:
1. John Doe (john@example.com) - Active
2. Jane Smith (jane@example.com) - Active
...
```

**Filtered query:**

```
Request: "Find active users created this week"

Generated SQL (PostgreSQL):
SELECT * FROM public.users
WHERE status = $1
  AND created_at > NOW() - INTERVAL '7 days'
LIMIT 100

Parameters: ["active"]

Response:
Found 12 active users created in the last 7 days:
1. Alice Johnson - Created 2 days ago
2. Bob Wilson - Created 4 days ago
...
```

### Aggregation Queries

**Group by:**

```
Request: "Count orders by status"

Generated SQL:
SELECT status, COUNT(*) as count
FROM public.orders
GROUP BY status
ORDER BY count DESC
LIMIT 100

Response:
Order counts by status:
- Completed: 450 orders
- Pending: 120 orders
- Shipped: 85 orders
- Cancelled: 23 orders
```

**Aggregation with filter:**

```
Request: "Show me average order value by month for this year"

Generated SQL:
SELECT
  DATE_TRUNC('month', created_at) as month,
  AVG(total_amount) as avg_value,
  COUNT(*) as order_count
FROM public.orders
WHERE created_at >= DATE_TRUNC('year', NOW())
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC
LIMIT 100

Response:
Average order values by month in 2025:
- December: $156.50 (45 orders)
- November: $142.30 (67 orders)
- October: $138.90 (82 orders)
...
```

### Complex Joins

**Multiple JOINs:**

```
Request: "Find customers who placed more than 5 orders with total value over $1000"

Generated SQL:
SELECT
  c.customer_id,
  c.name,
  c.email,
  COUNT(o.order_id) as order_count,
  SUM(o.total_amount) as total_spent
FROM public.customers c
INNER JOIN public.orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.name, c.email
HAVING COUNT(o.order_id) > 5
   AND SUM(o.total_amount) > 1000
ORDER BY total_spent DESC
LIMIT 100

Response:
Found 8 high-value customers:

1. John Doe (john@example.com)
   - 12 orders, $2,450.00 total

2. Jane Smith (jane@example.com)
   - 8 orders, $1,890.00 total

3. Bob Wilson (bob@example.com)
   - 7 orders, $1,200.00 total
...
```

**Three-way JOIN:**

```
Request: "Show me the top 10 products by revenue with customer count"

Generated SQL:
SELECT
  p.product_id,
  p.name,
  p.price,
  SUM(oi.quantity * oi.unit_price) as revenue,
  COUNT(DISTINCT o.customer_id) as customer_count,
  SUM(oi.quantity) as units_sold
FROM public.products p
INNER JOIN public.order_items oi ON p.product_id = oi.product_id
INNER JOIN public.orders o ON oi.order_id = o.order_id
GROUP BY p.product_id, p.name, p.price
ORDER BY revenue DESC
LIMIT 10

Response:
Top 10 products by revenue:

1. Premium Widget ($49.99)
   - Revenue: $12,450.00
   - Customers: 234
   - Units sold: 249

2. Deluxe Gadget ($39.99)
   - Revenue: $8,890.00
   - Customers: 198
   - Units sold: 222
...
```

### Schema Analysis

**General overview:**

```
Request: "Explain the database structure"

Response:
This database implements an e-commerce system with the following structure:

**Core Entities:**
- `customers` - Customer account information
- `products` - Product catalog with pricing
- `orders` - Order records linking customers to purchases
- `order_items` - Junction table for order line items

**Relationships:**
- customers ↔ orders: One-to-many via customer_id
- orders ↔ order_items: One-to-many via order_id
- products ↔ order_items: One-to-many via product_id

**Data Patterns:**
- Customers can place multiple orders
- Each order contains multiple products
- Products can appear in many orders
- Soft delete pattern (status column instead of DELETE)

**Indexes:**
All foreign keys are indexed for query performance.
```

**Specific question:**

```
Request: "Are there any data quality issues in this database?"

Response:
Analysis of potential data quality issues:

**Found Issues:**
1. Missing foreign keys:
   - order_items.product_id lacks proper constraint

2. Nullable columns that shouldn't be:
   - customers.email should be NOT NULL
   - orders.total_amount allows NULL

3. Orphaned records:
   - 5 order_items reference deleted products
   - 2 orders have no associated customer

**Recommendations:**
- Add foreign key constraints with ON DELETE CASCADE
- Make email column required
- Clean up orphaned order_items
- Consider implementing soft deletes for products
```

### Database-Specific Examples

**PostgreSQL JSON query:**

```
Request: "Find users with active status in their metadata JSON"

Generated SQL:
SELECT
  user_id,
  name,
  metadata
FROM public.users
WHERE metadata @> '{"status": "active"}'::jsonb
LIMIT 100

Response:
Found 45 users with active status in metadata...
```

**MySQL full-text search:**

```
Request: "Search products containing 'widget' in name or description"

Generated SQL:
SELECT
  product_id,
  name,
  description,
  MATCH(name, description) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
FROM products
WHERE MATCH(name, description) AGAINST(? IN NATURAL LANGUAGE MODE)
ORDER BY relevance DESC
LIMIT 100

Parameters: ["widget", "widget"]

Response:
Found 12 products matching 'widget':
1. Premium Widget Kit (relevance: 2.45)
2. Widget Accessories Pack (relevance: 1.89)
...
```

### Web Chatbot Conversation

**Example multi-turn conversation:**

```
You: Show me all tables
Bot: The database contains 4 tables:
     - customers
     - orders
     - products
     - order_items

You: How many customers?
     👆 Bot remembers we're talking about database tables
Bot: There are 150 customers in the database.

You: Show me the top 5 by total spending
     👆 Bot knows context: "customers" and "spending"
Bot: Here are the top 5 customers by total spending:

     1. John Doe - $2,450.00 (12 orders)
     2. Jane Smith - $1,890.00 (8 orders)
     3. Bob Wilson - $1,200.00 (7 orders)
     4. Alice Johnson - $980.00 (5 orders)
     5. Charlie Brown - $875.00 (6 orders)

You: What did John order?
     👆 Bot remembers John Doe from previous response
Bot: John Doe's order history:

     1. Order #1234 - $245.00 - Premium Widget Kit
     2. Order #1256 - $189.00 - Deluxe Gadget Set
     3. Order #1289 - $312.00 - Professional Tools
     ...

     Total: 12 orders, $2,450.00

You: Clear history
Bot: Conversation history cleared. Starting fresh!

You: Show top products
     👆 New context, John Doe forgotten
Bot: Top 10 products by revenue:
     1. Premium Widget Kit - $12,450.00
     ...
```

The chatbot maintains **context across messages** using conversation history, enabling natural follow-up questions!

## Contributing

Contributions are welcome! Please follow these guidelines:

### Design Principles

1. **LLM-First Decision Making**

   - Ask: "Can the LLM handle this decision?"
   - If yes, let the LLM decide (no hardcoding)
   - Only hardcode safety constraints

2. **Transparency**

   - User should see generated SQL
   - Show LLM reasoning when helpful
   - Log decision-making steps

3. **Safety First**

   - All queries must be read-only
   - Validate before execution
   - Enforce timeouts

4. **Modularity**

   - Single responsibility per service
   - Clean interfaces
   - Testable components

5. **Database Agnostic**
   - Support multiple databases
   - LLM handles syntax differences
   - Unified client interface

### Development Process

1. **Fork the repository**

   ```bash
   git clone https://github.com/your-username/DBAgent.git
   cd DBAgent
   ```

2. **Create feature branch**

   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make changes**

   - Follow existing code structure
   - Add JSDoc comments
   - Keep functions focused

4. **Add tests**

   ```bash
   # Add unit tests for new functions
   vim tests/unit/my-feature.test.ts

   # Add integration tests if needed
   vim tests/integration/my-feature.test.ts
   ```

5. **Run test suite**

   ```bash
   npm test
   ```

6. **Build and verify**

   ```bash
   npm run build
   npm run web  # Test manually
   ```

7. **Commit changes**

   ```bash
   git add .
   git commit -m "feat: Add amazing feature

   - Detailed description of changes
   - Why this change is needed
   - How it works"
   ```

8. **Push to fork**

   ```bash
   git push origin feature/amazing-feature
   ```

9. **Open Pull Request**
   - Describe changes clearly
   - Reference related issues
   - Include test results
   - Add screenshots if UI changed

### Code Style

- **TypeScript strict mode** - No `any` types without reason
- **Async/await** - Prefer over raw promises
- **Error handling** - Always handle errors gracefully
- **Logging** - Use logger for debug info
- **Comments** - Explain why, not what
- **Naming** - Clear, descriptive variable/function names

### Testing Requirements

- **Unit tests** for new functions
- **Integration tests** for new features
- **All tests must pass** before PR
- **Coverage** should not decrease

### Documentation

- **Update README** if adding features
- **Add JSDoc comments** for public APIs
- **Update examples** if behavior changes
- **Keep changelog** updated

## License

MIT License

Copyright (c) 2025 DBAgent Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Acknowledgments

Built with ❤️ using:

- **[Model Context Protocol](https://github.com/modelcontextprotocol)** - MCP SDK for tool integration
- **[OpenAI](https://openai.com/)** - GPT models for intelligent query generation
- **[PostgreSQL](https://www.postgresql.org/)** - Robust relational database
- **[MySQL](https://www.mysql.com/)** - Popular open-source database
- **[SQLite](https://www.sqlite.org/)** - Lightweight embedded database
- **[node-postgres](https://node-postgres.com/)** - PostgreSQL client for Node.js
- **[mysql2](https://github.com/sidorares/node-mysql2)** - MySQL client with promise support
- **[sqlite3](https://github.com/TryGhost/node-sqlite3)** - SQLite bindings for Node.js
- **[Vitest](https://vitest.dev/)** - Fast unit test framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript

## Support & Community

- **Bug Reports**: [GitHub Issues](https://github.com/your-repo/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **Documentation**: This README + inline code docs
- **Questions**: Open a discussion on GitHub

## Changelog

### v2.0.0 - Multi-Database & Refactoring (December 2025)

**Major Features:**

- ✨ Added MySQL and SQLite support alongside PostgreSQL
- ♻️ Refactored monolithic code into service modules
- ✅ Added comprehensive test suite (54 tests, all passing)
- 📝 Unified all documentation into single README
- 🎨 Enhanced web chatbot with conversation memory

**Improvements:**

- 🐛 Fixed query safety false positives on string literals
- ⚡ Improved schema caching performance
- 🔒 Enhanced read-only enforcement
- 📊 Added database-specific error hints
- 🧪 Comprehensive test coverage

**Service Modules Created:**

- `schema-service.ts` - Schema management with caching
- `analysis-planner.ts` - LLM-driven query planning
- `query-generator.ts` - Database-specific SQL generation
- `query-executor.ts` - Safe execution with timeouts
- `result-formatter.ts` - LLM-powered result presentation
- `query-planner.ts` - Pipeline orchestrator
- `query-safety.ts` - Safety enforcement utilities

**Documentation:**

- Consolidated 14+ markdown files into single README
- Added comprehensive examples section
- Improved troubleshooting guide
- Updated architecture diagrams

### v1.0.0 - Initial Release (November 2025)

- 🎉 PostgreSQL support
- 🤖 Multi-LLM provider support (OpenAI, Azure, Grok, Gemini, Ollama)
- 🔒 Read-only safety enforcement
- 📊 Web chatbot interface
- 🔧 MCP protocol implementation
- 📖 Basic documentation

---

**Built with TypeScript, MCP, and LLM intelligence**

_Remember: This server is designed to be intelligent, not scripted. Every interaction leverages LLM understanding rather than pattern matching._

**Enjoy intelligent database querying! 🚀**


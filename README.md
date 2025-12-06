## DBAgent

DBAgent is an LLM-powered MCP server that translates natural language queries into safe, read-only SQL across PostgreSQL, MySQL, and SQLite.

Topics: TypeScript • Node.js • LLM • MCP • PostgreSQL • MySQL • SQLite

### Modes & Run Commands

1. Web Chatbot

   - Build: npm run build
   - Run: npm run web
   - Visit: http://localhost:3000

2. MCP Server

   - Build: npm run build
   - Run: node build/index.js (or run via an MCP client)
   - Ensure environment variables (DATABASE_URL and LLM provider settings) are set

3. Interactive CLI

   - Build: npm run build
   - Run: npm run test:interactive

### Minimal Setup

- Copy example env: cp .env.example .env and update DB and LLM settings

Example .env entries:

```
DB_TYPE=postgres
DATABASE_URL=postgres://user:pass@host:5432/db
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```


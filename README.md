git clone <your-repo-url>
cd DBAgent
npm install
docker compose up -d
npm run web
git add .
git commit -m "Add feature"
grep LLM_PROVIDER .env
grep OPENAI_API_KEY .env # or GEMINI, GROK, etc.
docker compose ps
docker compose logs postgres
docker ps | grep mysql
docker logs mysql-container

# DBAgent

Intelligent natural language database queries using Large Language Models (LLMs). Supports PostgreSQL, MySQL, SQLite, and multiple LLM providers (OpenAI, Azure, Grok, Gemini, Ollama).

## Quick Start

```bash
git clone <your-repo-url>
cd DBAgent
npm install
cp .env.example .env # Edit .env for your DB and LLM
npm run build
npm run web # Visit http://localhost:3000
```

## Minimal .env Example

```
DB_TYPE=postgres
DATABASE_URL=postgres://user:pass@host:5432/db
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## License

MIT License 3. **Try faster LLM model:**

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


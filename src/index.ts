#!/usr/bin/env node

/**
 * PostgreSQL MCP Server - LLM-Driven Architecture
 *
 * This server uses LLMs for ALL decision-making:
 * - Schema analysis and understanding
 * - Query generation from natural language
 * - Error interpretation and recovery
 * - Result formatting and presentation
 *
 * Supports multiple LLM providers: OpenAI, Azure OpenAI, Grok, Gemini, Ollama
 * No hardcoded heuristics or pattern matching - pure LLM intelligence.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { CONFIG } from "./config.js";
import {
  createDatabaseClient,
  DatabaseInputConfig,
  UnifiedDatabaseClient,
} from "./db-client.js";
import {
  createLLMClient,
  LLMResponse,
  UnifiedLLMClient,
} from "./llm-client.js";
import { logger } from "./logger.js";
import {
  enforceReadOnly,
  QuerySafetyError,
  withQueryTimeout,
} from "./services/query-safety.js";

// ==================== Global State ====================

let dbClient: UnifiedDatabaseClient | null = null;
let llmClient: UnifiedLLMClient | null = null;

type SchemaCacheEntry = {
  schema: any;
  fetchedAt: number;
};

const schemaCacheTtlMs = CONFIG.server.schemaCacheTtlSeconds * 1000;
const cachedSchemas: Map<string, SchemaCacheEntry> = new Map();

function resolveDatabaseInputConfig(): DatabaseInputConfig {
  const db = CONFIG.database;

  if (db.url) {
    return {
      type: db.type,
      url: db.url,
      user: db.user,
      password: db.password,
    };
  }

  if (db.type === "sqlite") {
    return {
      type: "sqlite",
      filename: db.sqliteFile || "./database.sqlite",
    };
  }

  return {
    type: db.type,
    host: db.host,
    port: db.port,
    database: db.name,
    user: db.user,
    password: db.password,
  };
}

const databaseInputConfig = resolveDatabaseInputConfig();

// ==================== Database Connection ====================

async function ensureConnected(): Promise<void> {
  if (!dbClient) {
    dbClient = createDatabaseClient(databaseInputConfig);
    await dbClient.connect();
    const dbType = dbClient.getDatabaseType();
    const dbName = dbClient.getDatabaseName();
    logger.info({ dbType, dbName }, "Database connected");
  }
}

async function disconnect(): Promise<void> {
  if (dbClient) {
    await dbClient.disconnect();
    dbClient = null;
  }
}

// ==================== LLM Setup ====================

function initializeLLMClient(): void {
  if (!llmClient) {
    llmClient = createLLMClient();
    if (llmClient) {
      logger.info(
        { provider: llmClient.getProviderInfo() },
        "LLM client initialized"
      );
    } else {
      logger.warn(
        "LLM client not available. Set LLM provider configuration in environment"
      );
    }
  }
}

function isLLMAvailable(): boolean {
  return llmClient !== null;
}

// ==================== LLM Interaction ====================

// LLMResponse type is imported from llm-client.ts

async function askLLM(
  systemPrompt: string,
  userPrompt: string,
  temperature?: number,
  maxTokens?: number
): Promise<LLMResponse> {
  if (!llmClient) {
    return {
      success: false,
      content: "",
      error:
        "LLM is not configured. Please set LLM_PROVIDER and corresponding API keys in your .env file.",
    };
  }

  const resolvedTemperature = temperature ?? CONFIG.llm.temperature;
  const resolvedMaxTokens = maxTokens ?? CONFIG.llm.maxTokens;
  const resolvedTopP = CONFIG.llm.topP;

  return await llmClient.chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    {
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
      topP: resolvedTopP,
    }
  );
}

// ==================== Schema Discovery ====================

async function getSchemaInformation(
  schemaName: string = "public"
): Promise<any> {
  const cacheKey = `schema:${schemaName}`;
  const cached = cachedSchemas.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < schemaCacheTtlMs) {
    return cached.schema;
  }

  if (cached) {
    cachedSchemas.delete(cacheKey);
  }

  await ensureConnected();
  if (!dbClient) throw new Error("Database not connected");

  // Use the unified database client's schema method
  const schema = await dbClient.getSchemaInformation(schemaName);
  cachedSchemas.set(cacheKey, { schema, fetchedAt: Date.now() });
  return schema;
}

async function formatSchemaForLLM(schemaName: string): Promise<string> {
  const schema = await getSchemaInformation(schemaName);

  let formatted = `Database Schema: ${schemaName}\n\n`;

  const tableNames = Object.keys(schema.tables);
  if (tableNames.length === 0) {
    formatted += "No tables found in this schema.\n";
    return formatted;
  }

  for (const tableName of tableNames.sort()) {
    const table = schema.tables[tableName];
    formatted += `Table: ${tableName}\n`;

    for (const col of table.columns) {
      const pk = col.isPrimaryKey ? " [PRIMARY KEY]" : "";
      const nullable = col.nullable ? " NULL" : " NOT NULL";
      const extra = col.maxLength ? `(${col.maxLength})` : "";
      formatted += `  - ${col.name}: ${col.type}${extra}${nullable}${pk}\n`;
    }

    formatted += "\n";
  }

  return formatted;
}

// ==================== Query Execution with LLM ====================

// ==================== Step 1: Determine if DB Query is Needed ====================

async function determineIfQueryNeeded(request: string): Promise<{
  needsQuery: boolean;
  reasoning: string;
}> {
  if (!isLLMAvailable()) {
    return {
      needsQuery: true,
      reasoning: "LLM unavailable, assuming database query is needed",
    };
  }

  const systemPrompt = `You are an intelligent assistant that determines whether a user request requires querying a database or not.

Return ONLY a JSON object with this structure:
{
  "needsQuery": true/false,
  "reasoning": "brief explanation"
}

Requests that NEED database queries:
- Asking for specific data (users, orders, products, etc.)
- Counting, aggregating, or analyzing data
- Looking up records or information
- Listing tables, columns, schema structure, or other metadata
- Finding patterns or trends in data
- Any request containing words like "table", "tables", "column", "columns", "schema", "structure", "metadata", or "describe" when the user expects actual database details

Requests that DON'T need database queries:
- General questions about capabilities
- High-level schema discussions that don't require actual metadata (e.g., "what does a primary key do?")
- Help or documentation requests
- Configuration questions

Never respond with needsQuery:false when the user asks to show, list, describe, or inspect database tables or columns.`;

  const userPrompt = `User request: "${request}"

Does this request require querying the database for data? Return JSON only.`;

  const llmResponse = await askLLM(systemPrompt, userPrompt, 0, 300);

  if (!llmResponse.success) {
    return {
      needsQuery: true,
      reasoning: "Could not determine, assuming query needed",
    };
  }

  try {
    let jsonText = llmResponse.content.trim();
    if (jsonText.startsWith("```")) {
      const lines = jsonText.split("\n");
      jsonText = lines.slice(1, -1).join("\n");
      if (jsonText.startsWith("json")) {
        jsonText = jsonText.slice(4).trim();
      }
    }

    const result = JSON.parse(jsonText);
    return {
      needsQuery: result.needsQuery === true,
      reasoning: result.reasoning || "No reasoning provided",
    };
  } catch (error) {
    return {
      needsQuery: true,
      reasoning: "Parse error, assuming query needed",
    };
  }
}

// ==================== Step 2: Get All Tables and Columns ====================

async function getAllDatabaseMetadata(
  schemaName: string = "public"
): Promise<string> {
  await ensureConnected();
  if (!dbClient) throw new Error("Database not connected");

  // Use the unified database client's schema method
  const schema = await dbClient.getSchemaInformation(schemaName);

  let metadata = `DATABASE SCHEMA: ${schema.schemaName}\n\n`;
  metadata += `TABLES AND COLUMNS:\n`;
  metadata += `==================\n\n`;

  for (const [tableName, tableInfo] of Object.entries(schema.tables)) {
    metadata += `Table: ${tableName}\n`;
    metadata += `Columns:\n`;

    for (const col of tableInfo.columns) {
      const pk = col.isPrimaryKey ? " [PRIMARY KEY]" : "";
      const nullable = col.nullable ? " NULL" : " NOT NULL";
      const maxLen = col.maxLength ? `(${col.maxLength})` : "";
      const precision = col.precision
        ? `(${col.precision}${col.scale ? `,${col.scale}` : ""})`
        : "";
      metadata += `  - ${col.name}: ${col.type}${maxLen}${precision}${nullable}${pk}\n`;
    }
    metadata += `\n`;
  }

  // Note: Foreign key information could be added here if needed
  // For now, we focus on basic table and column information

  return metadata;
}

// ==================== Step 3: Understand Data Structure and Relationships ====================

async function analyzeDataStructure(
  metadata: string,
  userRequest: string
): Promise<{
  understanding: string;
  relevantTables: string[];
  relationships: string[];
}> {
  if (!isLLMAvailable()) {
    throw new Error("LLM is required for data structure analysis");
  }

  await ensureConnected();
  const dbType = dbClient?.getDatabaseType() || "postgres";

  const systemPrompt = `You are a database expert analyzing schema structure to understand how to answer user queries.

DATABASE TYPE: ${dbType.toUpperCase()}

Your task:
1. Examine the provided database schema
2. Understand how data is stored across tables
3. Identify relationships between tables (primary keys, foreign keys, implicit relationships)
4. Determine which tables and relationships are relevant to the user's request
5. Keep in mind this is a ${dbType.toUpperCase()} database when considering data types and constraints

Return ONLY a JSON object:
{
  "understanding": "Detailed explanation of data structure and how it relates to the request",
  "relevantTables": ["table1", "table2"],
  "relationships": ["description of key relationships needed"]
}`;

  const userPrompt = `${metadata}

User Request: "${userRequest}"

Analyze this schema and explain:
1. How the data is organized
2. What relationships exist between tables
3. Which tables/relationships are needed to answer the user's request

Return JSON only.`;

  const llmResponse = await askLLM(systemPrompt, userPrompt, 0.1, 1500);

  if (!llmResponse.success) {
    throw new Error(`Schema analysis failed: ${llmResponse.error}`);
  }

  try {
    let jsonText = llmResponse.content.trim();
    if (jsonText.startsWith("```")) {
      const lines = jsonText.split("\n");
      jsonText = lines.slice(1, -1).join("\n");
      if (jsonText.startsWith("json")) {
        jsonText = jsonText.slice(4).trim();
      }
    }

    const analysis = JSON.parse(jsonText);
    return {
      understanding: analysis.understanding || "",
      relevantTables: analysis.relevantTables || [],
      relationships: analysis.relationships || [],
    };
  } catch (error) {
    throw new Error(
      `Failed to parse schema analysis: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ==================== Step 4: Generate Query Based on Understanding ====================

async function generateQueryFromUnderstanding(
  userRequest: string,
  metadata: string,
  analysis: {
    understanding: string;
    relevantTables: string[];
    relationships: string[];
  },
  maxRows: number
): Promise<{
  sql: string;
  parameters: any[];
  explanation: string;
}> {
  if (!isLLMAvailable()) {
    throw new Error("LLM is required for query generation");
  }

  await ensureConnected();
  const dbType = dbClient?.getDatabaseType() || "postgres";
  const dbName = dbClient?.getDatabaseName() || "database";

  // Database-specific syntax rules
  const dbSyntaxRules = {
    postgres: `
DATABASE TYPE: PostgreSQL

PostgreSQL-Specific Syntax Rules:
- Use $1, $2, $3 for parameterized queries (NOT ?)
- PostgreSQL is case-sensitive: wrap mixed-case identifiers in double quotes
  * CORRECT: SELECT "userId", "firstName" FROM users
  * WRONG: SELECT userId FROM users (fails with "column userid does not exist")
- Include schema name: public.table_name
- String concatenation: column1 || ' ' || column2
- Current timestamp: NOW() or CURRENT_TIMESTAMP
- Date functions: DATE_TRUNC(), AGE(), EXTRACT()
- JSON operators: ->, ->>, @>, ? (if using JSONB columns)
- Array types: ARRAY[...], ANY(...), ALL(...)`,

    mysql: `
DATABASE TYPE: MySQL

MySQL-Specific Syntax Rules:
- Use ? for parameterized queries (NOT $1, $2)
- MySQL identifier rules: backticks for reserved words/special chars
  * Use: \`table\`, \`column\` for reserved words
  * Generally case-insensitive on Windows, case-sensitive on Linux
- Database name: ${dbName}.table_name (no schema concept like PostgreSQL)
- String concatenation: CONCAT(column1, ' ', column2)
- Current timestamp: NOW() or CURRENT_TIMESTAMP
- Date functions: DATE_FORMAT(), DATEDIFF(), DATE_ADD()
- JSON functions: JSON_EXTRACT(), JSON_CONTAINS() (MySQL 5.7+)
- LIMIT syntax: LIMIT ${maxRows}`,

    sqlite: `
DATABASE TYPE: SQLite

SQLite-Specific Syntax Rules:
- Use ? for parameterized queries (NOT $1, $2)
- SQLite is case-insensitive for identifiers (but preserve case)
- No schema name needed: just table_name
- String concatenation: column1 || ' ' || column2
- Current timestamp: datetime('now') or strftime()
- Date functions: date(), time(), julianday(), strftime()
- Limited ALTER TABLE support
- No native JSON type (stored as TEXT, use json_extract())
- LIMIT syntax: LIMIT ${maxRows}`,
  };

  const syntaxGuide =
    dbSyntaxRules[dbType as keyof typeof dbSyntaxRules] ||
    dbSyntaxRules.postgres;

  const systemPrompt = `You are an expert SQL query generator. Based on your understanding of the database structure and relationships, create an optimized SQL query.

${syntaxGuide}

CRITICAL RULES:
1. ONLY generate SELECT queries - no INSERT, UPDATE, DELETE, DROP, ALTER, GRANT, REVOKE, or TRUNCATE
2. Always include explicit LIMIT clause (max ${maxRows} rows)
3. Use proper JOINs based on the relationships you identified
4. Use database-appropriate parameterized query syntax (see above)
5. Follow the database-specific syntax rules for ${dbType.toUpperCase()}
6. Return ONLY valid JSON:
   {
     "sql": "SELECT ... FROM ... JOIN ... WHERE ... LIMIT ...",
     "parameters": [value1, value2, ...],
     "explanation": "Explanation of the query logic"
   }

NO additional text or markdown - just the JSON object.`;

  const userPrompt = `DATABASE SCHEMA:
${metadata}

YOUR ANALYSIS:
Understanding: ${analysis.understanding}
Relevant Tables: ${analysis.relevantTables.join(", ")}
Key Relationships: ${analysis.relationships.join("; ")}

USER REQUEST: "${userRequest}"

Based on your analysis, generate the optimal SQL query to answer this request.
- Use appropriate JOINs based on relationships
- Select only needed columns
- Apply LIMIT ${maxRows}
- Return JSON only`;

  const llmResponse = await askLLM(systemPrompt, userPrompt, 0, 1200);

  if (!llmResponse.success) {
    throw new Error(`Query generation failed: ${llmResponse.error}`);
  }

  try {
    let jsonText = llmResponse.content.trim();
    if (jsonText.startsWith("```")) {
      const lines = jsonText.split("\n");
      jsonText = lines.slice(1, -1).join("\n");
      if (jsonText.startsWith("json")) {
        jsonText = jsonText.slice(4).trim();
      }
    }

    const queryData = JSON.parse(jsonText);

    if (!queryData.sql) {
      throw new Error("LLM did not provide a SQL query");
    }

    return {
      sql: queryData.sql,
      parameters: queryData.parameters || [],
      explanation: queryData.explanation || "",
    };
  } catch (error) {
    throw new Error(
      `Failed to parse query response: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ==================== Step 5: Execute Query ====================

interface QueryResult {
  success: boolean;
  rowCount: number;
  rows: any[];
  error?: string;
  explanation?: string;
  queryExecuted: boolean;
}

async function executeDatabaseQuery(
  sql: string,
  parameters: any[],
  explanation: string
): Promise<QueryResult> {
  try {
    enforceReadOnly(sql);
  } catch (error) {
    if (error instanceof QuerySafetyError) {
      return {
        success: false,
        rowCount: 0,
        rows: [],
        error: error.message,
        queryExecuted: false,
      };
    }
    throw error;
  }

  await ensureConnected();
  if (!dbClient) {
    return {
      success: false,
      rowCount: 0,
      rows: [],
      error: "Database not connected",
      queryExecuted: false,
    };
  }

  try {
    const result = await withQueryTimeout(
      dbClient.query(sql, parameters),
      CONFIG.safety.maxExecutionMs
    );

    return {
      success: true,
      rowCount: result.rowCount || 0,
      rows: result.rows,
      explanation,
      queryExecuted: true,
    };
  } catch (error) {
    if (error instanceof QuerySafetyError) {
      return {
        success: false,
        rowCount: 0,
        rows: [],
        error: error.message,
        queryExecuted: false,
      };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    const dbType = dbClient?.getDatabaseType() || "postgres";

    // Database-specific error hints
    let hint = "";

    if (dbType === "postgres") {
      // Check if it's a column name case sensitivity issue
      const columnNotFoundMatch = errorMessage.match(
        /column "([^"]+)" does not exist/i
      );
      if (columnNotFoundMatch) {
        const columnName = columnNotFoundMatch[1];
        // If the column name is lowercase but the schema shows camelCase, suggest quoting
        if (
          columnName === columnName.toLowerCase() &&
          columnName !== columnName.toUpperCase()
        ) {
          hint = `\n\nHint: PostgreSQL requires double quotes around column names with mixed case (e.g., "${
            columnName.charAt(0).toUpperCase() + columnName.slice(1)
          }"). The generated query may need to quote column names.`;
        }
      }
    } else if (dbType === "mysql") {
      // MySQL-specific error hints
      if (errorMessage.includes("Unknown column")) {
        hint =
          "\n\nHint: Check column name spelling and case. MySQL may be case-sensitive depending on the OS.";
      } else if (
        errorMessage.includes("You have an error in your SQL syntax")
      ) {
        hint =
          "\n\nHint: MySQL syntax error. Check for reserved words that may need backticks.";
      }
    } else if (dbType === "sqlite") {
      // SQLite-specific error hints
      if (errorMessage.includes("no such column")) {
        hint = "\n\nHint: Column not found. Check column name spelling.";
      } else if (errorMessage.includes("no such table")) {
        hint =
          "\n\nHint: Table not found. SQLite doesn't use schema prefixes (just use table_name, not public.table_name).";
      }
    }

    return {
      success: false,
      rowCount: 0,
      rows: [],
      error: `Query execution failed: ${errorMessage}${hint}`,
      queryExecuted: false,
    };
  }
}

// ==================== Complete Flow: Process User Request ====================

async function processUserRequest(
  request: string,
  schemaName: string = "public",
  maxRows: number = CONFIG.server.maxRows
): Promise<QueryResult> {
  if (!isLLMAvailable()) {
    return {
      success: false,
      rowCount: 0,
      rows: [],
      error:
        "LLM is required for intelligent query processing but is not configured.",
      queryExecuted: false,
    };
  }

  try {
    logger.info(
      { step: 1, request },
      "Determining if database query is needed"
    );
    const queryCheck = await determineIfQueryNeeded(request);
    logger.info({
      step: 1,
      needsQuery: queryCheck.needsQuery,
      reasoning: queryCheck.reasoning,
    });

    if (!queryCheck.needsQuery) {
      // Use LLM to generate a friendly conversational response
      const response = await askLLM(
        "You are a helpful AI assistant. Respond naturally and conversationally to user messages.",
        request,
        0.7,
        200
      );

      return {
        success: true,
        rowCount: 0,
        rows: [],
        explanation: response.success ? response.content : queryCheck.reasoning,
        queryExecuted: false,
      };
    }

    logger.info(
      { step: 2, schema: schemaName },
      "Retrieving database metadata"
    );
    const metadata = await getAllDatabaseMetadata(schemaName);
    logger.debug({ schema: schemaName, metadata }, "Schema metadata retrieved");

    logger.info(
      { step: 3, schema: schemaName },
      "Analyzing data structure and relationships"
    );
    const analysis = await analyzeDataStructure(metadata, request);
    logger.info({
      step: 3,
      understandingPreview: analysis.understanding.substring(0, 100),
      relevantTables: analysis.relevantTables,
    });

    logger.info({ step: 4, request }, "Generating SQL based on analysis");
    const queryData = await generateQueryFromUnderstanding(
      request,
      metadata,
      analysis,
      maxRows
    );
    logger.info(
      { step: 4, preview: queryData.sql.substring(0, 120) },
      "SQL generated"
    );

    logger.info({ step: 5 }, "Executing generated query");
    const result = await executeDatabaseQuery(
      queryData.sql,
      queryData.parameters,
      queryData.explanation
    );
    logger.info({
      step: 5,
      success: result.success,
      rowCount: result.rowCount,
      error: result.error,
    });

    return result;
  } catch (error) {
    logger.error({ err: error, request }, "Request processing failed");
    return {
      success: false,
      rowCount: 0,
      rows: [],
      error: `Request processing failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      queryExecuted: false,
    };
  }
}

// ==================== Result Formatting with LLM ====================

async function formatResultsWithLLM(
  request: string,
  queryResult: QueryResult
): Promise<string> {
  if (!isLLMAvailable()) {
    // Fallback: simple formatting without LLM
    if (!queryResult.success) {
      return `Error: ${queryResult.error}`;
    }

    if (!queryResult.queryExecuted) {
      return queryResult.explanation || "No database query was executed.";
    }

    if (queryResult.rowCount === 0) {
      return "No results found.";
    }

    return `Found ${
      queryResult.rowCount
    } row(s).\n\nSample data:\n${JSON.stringify(
      queryResult.rows.slice(0, 3),
      null,
      2
    )}`;
  }

  if (!queryResult.queryExecuted) {
    // Already generated a conversational response without touching the DB
    return queryResult.explanation || "No database query was executed.";
  }

  const systemPrompt = `You are a helpful data analyst assistant. Your task is to present database query results in a clear, natural language format that directly answers the user's question.

CRITICAL RULES - NEVER VIOLATE THESE:
- You MUST present ALL results in COMPLETE detail
- NEVER say things like "showing X out of Y rows" or "sample of the results"
- NEVER truncate, summarize, or omit any data
- Display EVERY SINGLE row that was returned
- If there are 20 rows, show all 20 rows
- If there are 100 rows, show all 100 rows
- The user expects comprehensive, complete information - not samples or summaries

Formatting:
- Use clear numbered lists or tables
- Make it readable but show everything
- Highlight interesting patterns or insights AFTER showing all data`;

  let userPrompt = `User asked: "${request}"\n\n`;

  if (!queryResult.success) {
    userPrompt += `The query failed with error: ${queryResult.error}\n\nProvide a helpful explanation of what went wrong and suggestions.`;
  } else if (queryResult.rowCount === 0) {
    userPrompt += `The query succeeded but returned no results.\n\nExplain this in a natural, helpful way.`;
  } else {
    userPrompt += `The query returned ${queryResult.rowCount} row(s).\n\n`;

    if (queryResult.explanation) {
      userPrompt += `Query explanation: ${queryResult.explanation}\n\n`;
    }

    // Include ALL data
    userPrompt += `Complete results (all ${queryResult.rowCount} rows):\n`;
    userPrompt += JSON.stringify(queryResult.rows, null, 2);
    userPrompt += `\n\nIMPORTANT: Present ALL ${queryResult.rowCount} rows in your response. Do not say "sample" or "showing X out of Y". List every single row with its details.`;
  }

  const llmResponse = await askLLM(systemPrompt, userPrompt, 0.1, 4000);

  if (!llmResponse.success) {
    // Fallback to basic formatting
    if (!queryResult.success) {
      return `Error: ${queryResult.error}`;
    }
    return `Found ${queryResult.rowCount} results. (LLM formatting unavailable: ${llmResponse.error})`;
  }

  return llmResponse.content;
}

// ==================== MCP Server Setup ====================

const server = new Server(
  {
    name: "postgres-mcp",
    version: "2.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// ==================== Resources ====================

async function listSchemas(): Promise<string[]> {
  await ensureConnected();
  if (!dbClient) return ["public"];

  const dbType = dbClient.getDatabaseType();

  try {
    if (dbType === "postgres") {
      const result = await dbClient.query(
        `SELECT schema_name 
         FROM information_schema.schemata 
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY schema_name`
      );
      return result.rows.map((row) => row.schema_name);
    } else if (dbType === "mysql") {
      const result = await dbClient.query(
        `SELECT schema_name 
         FROM information_schema.schemata 
         WHERE schema_name NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
         ORDER BY schema_name`
      );
      return result.rows.map((row) => row.SCHEMA_NAME || row.schema_name);
    } else {
      // SQLite uses a single schema called "main"
      return ["main"];
    }
  } catch (error) {
    logger.error({ err: error }, "Error listing schemas");
    return ["public"];
  }
}

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const schemas = await listSchemas();

    const resources = schemas.map((schemaName) => ({
      uri: `db://schema/${schemaName}`,
      mimeType: "application/json",
      name: `Schema: ${schemaName}`,
      description: `Database schema information for ${schemaName}`,
    }));

    return { resources };
  } catch (error) {
    return { resources: [] };
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const match = uri.match(/^db:\/\/schema\/(.+)$/);

  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const schemaName = match[1];
  const schemaInfo = await getSchemaInformation(schemaName);

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(schemaInfo, null, 2),
      },
    ],
  };
});

// ==================== Tools ====================

const QueryRequestSchema = z.object({
  request: z
    .string()
    .describe("Natural language description of what data you want to query"),
  schema: z
    .string()
    .optional()
    .default("public")
    .describe("Database schema to query (default: public)"),
  maxRows: z
    .number()
    .min(1)
    .max(1000)
    .optional()
    .default(CONFIG.server.maxRows)
    .describe(
      `Maximum number of rows to return (default: ${CONFIG.server.maxRows})`
    ),
});

const SchemaAnalysisSchema = z.object({
  schema: z
    .string()
    .optional()
    .default("public")
    .describe("Database schema to analyze (default: public)"),
  question: z
    .string()
    .optional()
    .describe("Optional specific question about the schema"),
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_database",
        description:
          "Execute a natural language query against the PostgreSQL database. The LLM will analyze your request, understand the schema, generate appropriate SQL, execute it safely, and format the results in natural language. All intelligence is LLM-driven with no hardcoded patterns.",
        inputSchema: {
          type: "object",
          properties: {
            request: {
              type: "string",
              description:
                "Describe what data you want in natural language (e.g., 'show me all active users', 'count orders by status', 'find customers who spent over $1000')",
            },
            schema: {
              type: "string",
              description: "Database schema to query (default: public)",
              default: "public",
            },
            maxRows: {
              type: "number",
              description: `Maximum rows to return (1-1000, default: ${CONFIG.server.maxRows})`,
              default: CONFIG.server.maxRows,
              minimum: 1,
              maximum: 1000,
            },
          },
          required: ["request"],
        },
      },
      {
        name: "analyze_schema",
        description:
          "Get intelligent analysis of database schema using LLM. Can answer questions about table relationships, data types, naming conventions, potential issues, or provide general schema overview. Purely LLM-driven analysis.",
        inputSchema: {
          type: "object",
          properties: {
            schema: {
              type: "string",
              description: "Database schema to analyze (default: public)",
              default: "public",
            },
            question: {
              type: "string",
              description:
                "Optional specific question (e.g., 'what are the main entity relationships?', 'are there any data quality concerns?', 'explain the user authentication tables')",
            },
          },
          required: [],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "query_database") {
      const {
        request: userRequest,
        schema,
        maxRows,
      } = QueryRequestSchema.parse(args);

      // Execute the complete 5-step flow
      const queryResult = await processUserRequest(
        userRequest,
        schema,
        maxRows
      );

      // Step 6: Format results using LLM in natural language
      const formattedResponse = await formatResultsWithLLM(
        userRequest,
        queryResult
      );

      return {
        content: [
          {
            type: "text",
            text: formattedResponse,
          },
          {
            type: "text",
            text: `\n\n---\nRaw Data (${
              queryResult.rowCount
            } rows):\n${JSON.stringify(queryResult.rows, null, 2)}`,
          },
        ],
      };
    }

    if (name === "analyze_schema") {
      const { schema, question } = SchemaAnalysisSchema.parse(args);

      if (!isLLMAvailable()) {
        throw new Error(
          "Schema analysis requires LLM but OpenAI is not configured."
        );
      }

      // Get comprehensive schema information with relationships
      const schemaContext = await getAllDatabaseMetadata(schema);

      // Ask LLM to analyze
      const systemPrompt = `You are an expert database architect and data analyst. Analyze database schemas to provide insights about structure, relationships, design patterns, potential issues, and recommendations.

Provide clear, actionable insights that help developers understand and work with the database effectively.`;

      let userPrompt = schemaContext + "\n\n";

      if (question) {
        userPrompt += `User question: ${question}\n\nProvide a detailed answer based on the schema above.`;
      } else {
        userPrompt += `Provide a comprehensive analysis of this schema including:
- Overview of main entities and their purposes
- Key relationships between tables
- Data modeling patterns used
- Any potential design concerns or recommendations
- Suggestions for queries or analytics`;
      }

      const llmResponse = await askLLM(systemPrompt, userPrompt, 0.2, 2000);

      if (!llmResponse.success) {
        throw new Error(`Schema analysis failed: ${llmResponse.error}`);
      }

      return {
        content: [
          {
            type: "text",
            text: llmResponse.content,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
      );
    }
    throw error;
  }
});

// ==================== Main ====================

async function main() {
  logger.info("Starting PostgreSQL MCP Server (Multi-LLM Architecture)...");

  // Initialize LLM client if configured
  initializeLLMClient();

  if (isLLMAvailable()) {
    logger.info({ provider: llmClient?.getProviderInfo() }, "LLM ready");
  } else {
    logger.warn("LLM not configured - LLM features will be unavailable");
    logger.warn(
      "Set LLM_PROVIDER and corresponding API keys in your environment"
    );
    logger.warn("Supported providers: openai, azure, grok, gemini, ollama");
  }

  // Test database connection
  try {
    await ensureConnected();
    const result = await dbClient?.query("SELECT version()");
    logger.info(
      {
        dbVersion: result?.rows[0].version,
      },
      "Database connection verified"
    );
  } catch (error) {
    logger.error(
      { err: error },
      "Database connection failed. Check DB_* or POSTGRES_* environment variables"
    );
    process.exit(1);
  }

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP Server ready on stdio");
}

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  await disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down...");
  await disconnect();
  process.exit(0);
});

main().catch((error) => {
  logger.fatal({ err: error }, "Fatal error during startup");
  process.exit(1);
});


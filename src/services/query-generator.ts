/**
 * Query Generator Service
 *
 * Generates SQL queries from natural language using LLM intelligence.
 * Handles database-specific syntax and parameterization.
 */

import { CONFIG } from "../config.js";
import { LLMResponse, UnifiedLLMClient } from "../llm-client.js";
import { logger } from "../logger.js";
import { DataStructureAnalysis } from "./analysis-planner.js";

export interface GeneratedQuery {
  sql: string;
  parameters: any[];
  explanation: string;
}

export class QueryGenerator {
  constructor(private llmClient: UnifiedLLMClient | null) {}

  /**
   * Ask LLM a question with system and user prompts
   */
  private async askLLM(
    systemPrompt: string,
    userPrompt: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMResponse> {
    if (!this.llmClient) {
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

    return await this.llmClient.chat(
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

  /**
   * Parse JSON from LLM response, handling markdown code blocks
   */
  private parseJSONFromLLM(content: string): any {
    let jsonText = content.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith("```")) {
      const lines = jsonText.split("\n");
      jsonText = lines.slice(1, -1).join("\n");
      if (jsonText.startsWith("json")) {
        jsonText = jsonText.slice(4).trim();
      }
    }

    return JSON.parse(jsonText);
  }

  /**
   * Get database-specific syntax rules
   */
  private getDatabaseSyntaxRules(
    dbType: string,
    dbName: string,
    maxRows: number
  ): string {
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

    return (
      dbSyntaxRules[dbType as keyof typeof dbSyntaxRules] ||
      dbSyntaxRules.postgres
    );
  }

  /**
   * Generate SQL query from user request and analysis
   */
  async generateQuery(
    userRequest: string,
    metadata: string,
    analysis: DataStructureAnalysis,
    dbType: string,
    dbName: string,
    maxRows: number
  ): Promise<GeneratedQuery> {
    if (!this.llmClient) {
      throw new Error("LLM is required for query generation");
    }

    const syntaxGuide = this.getDatabaseSyntaxRules(dbType, dbName, maxRows);

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

    const llmResponse = await this.askLLM(systemPrompt, userPrompt, 0, 1200);

    if (!llmResponse.success) {
      throw new Error(`Query generation failed: ${llmResponse.error}`);
    }

    try {
      const queryData = this.parseJSONFromLLM(llmResponse.content);

      if (!queryData.sql) {
        throw new Error("LLM did not provide a SQL query");
      }

      logger.info(
        { sqlPreview: queryData.sql.substring(0, 100) },
        "Generated SQL query"
      );

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
}


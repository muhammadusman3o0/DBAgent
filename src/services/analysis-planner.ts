/**
 * Analysis Planner Service
 *
 * Handles LLM-driven analysis and planning:
 * - Determines if a database query is needed
 * - Analyzes data structure and relationships
 * - Plans query execution strategy
 */

import { CONFIG } from "../config.js";
import { LLMResponse, UnifiedLLMClient } from "../llm-client.js";
import { logger } from "../logger.js";

export interface QueryNeedAnalysis {
  needsQuery: boolean;
  reasoning: string;
}

export interface DataStructureAnalysis {
  understanding: string;
  relevantTables: string[];
  relationships: string[];
}

export class AnalysisPlanner {
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
   * Determine if a user request requires querying the database
   */
  async determineIfQueryNeeded(request: string): Promise<QueryNeedAnalysis> {
    if (!this.llmClient) {
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

    const llmResponse = await this.askLLM(systemPrompt, userPrompt, 0, 300);

    if (!llmResponse.success) {
      return {
        needsQuery: true,
        reasoning: "Could not determine, assuming query needed",
      };
    }

    try {
      const result = this.parseJSONFromLLM(llmResponse.content);
      return {
        needsQuery: result.needsQuery === true,
        reasoning: result.reasoning || "No reasoning provided",
      };
    } catch (error) {
      logger.warn({ error }, "Failed to parse query need analysis");
      return {
        needsQuery: true,
        reasoning: "Parse error, assuming query needed",
      };
    }
  }

  /**
   * Analyze database structure and relationships for query planning
   */
  async analyzeDataStructure(
    metadata: string,
    userRequest: string,
    dbType: string
  ): Promise<DataStructureAnalysis> {
    if (!this.llmClient) {
      throw new Error("LLM is required for data structure analysis");
    }

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

    const llmResponse = await this.askLLM(systemPrompt, userPrompt, 0.1, 1500);

    if (!llmResponse.success) {
      throw new Error(`Schema analysis failed: ${llmResponse.error}`);
    }

    try {
      const analysis = this.parseJSONFromLLM(llmResponse.content);
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

  /**
   * Generate a conversational response without database query
   */
  async generateConversationalResponse(request: string): Promise<string> {
    if (!this.llmClient) {
      return "I don't have enough information to answer that question.";
    }

    const response = await this.askLLM(
      "You are a helpful AI assistant. Respond naturally and conversationally to user messages.",
      request,
      0.7,
      200
    );

    return response.success
      ? response.content
      : "I'm unable to process that request right now.";
  }
}


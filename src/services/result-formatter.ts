/**
 * Result Formatter Service
 *
 * Formats query results using LLM for natural language presentation.
 * Handles both successful and error results.
 */

import { CONFIG } from "../config.js";
import { LLMResponse, UnifiedLLMClient } from "../llm-client.js";
import { logger } from "../logger.js";

export interface QueryResult {
  success: boolean;
  rowCount: number;
  rows: any[];
  error?: string;
  explanation?: string;
  queryExecuted: boolean;
}

export class ResultFormatter {
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
   * Format query results with LLM for natural language presentation
   */
  async formatResults(
    request: string,
    queryResult: QueryResult
  ): Promise<string> {
    if (!this.llmClient) {
      return this.formatResultsFallback(queryResult);
    }

    // If no query was executed, return the explanation directly
    if (!queryResult.queryExecuted) {
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

    const llmResponse = await this.askLLM(systemPrompt, userPrompt, 0.1, 4000);

    if (!llmResponse.success) {
      logger.warn(
        { error: llmResponse.error },
        "LLM formatting failed, using fallback"
      );
      return this.formatResultsFallback(queryResult);
    }

    return llmResponse.content;
  }

  /**
   * Fallback formatting without LLM
   */
  private formatResultsFallback(queryResult: QueryResult): string {
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

  /**
   * Format raw data for display (as secondary content)
   */
  formatRawData(queryResult: QueryResult): string {
    return `\n\n---\nRaw Data (${queryResult.rowCount} rows):\n${JSON.stringify(
      queryResult.rows,
      null,
      2
    )}`;
  }
}


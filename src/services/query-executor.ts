/**
 * Query Executor Service
 *
 * Executes database queries with safety checks and timeout enforcement.
 * Integrates with query-safety module for read-only enforcement.
 */

import { CONFIG } from "../config.js";
import { UnifiedDatabaseClient } from "../db-client.js";
import { logger } from "../logger.js";
import {
  enforceReadOnly,
  QuerySafetyError,
  withQueryTimeout,
} from "./query-safety.js";

export interface QueryResult {
  success: boolean;
  rowCount: number;
  rows: any[];
  error?: string;
  explanation?: string;
  queryExecuted: boolean;
}

export class QueryExecutor {
  constructor(private dbClient: UnifiedDatabaseClient) {}

  /**
   * Execute a database query with safety checks and timeout
   */
  async execute(
    sql: string,
    parameters: any[],
    explanation: string
  ): Promise<QueryResult> {
    // Safety check: enforce read-only
    try {
      enforceReadOnly(sql);
    } catch (error) {
      if (error instanceof QuerySafetyError) {
        logger.warn(
          { sql, error: error.message },
          "Query rejected by safety check"
        );
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

    const dbType = this.dbClient.getDatabaseType();

    try {
      logger.info(
        { dbType, sqlPreview: sql.substring(0, 100) },
        "Executing query"
      );

      const result = await withQueryTimeout(
        this.dbClient.query(sql, parameters),
        CONFIG.safety.maxExecutionMs
      );

      logger.info({ rowCount: result.rowCount }, "Query executed successfully");

      return {
        success: true,
        rowCount: result.rowCount || 0,
        rows: result.rows,
        explanation,
        queryExecuted: true,
      };
    } catch (error) {
      if (error instanceof QuerySafetyError) {
        logger.warn({ error: error.message }, "Query timeout");
        return {
          success: false,
          rowCount: 0,
          rows: [],
          error: error.message,
          queryExecuted: false,
        };
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const hint = this.getDatabaseErrorHint(errorMessage, dbType);

      logger.error(
        { error: errorMessage, dbType, hint },
        "Query execution failed"
      );

      return {
        success: false,
        rowCount: 0,
        rows: [],
        error: `Query execution failed: ${errorMessage}${hint}`,
        queryExecuted: false,
      };
    }
  }

  /**
   * Get database-specific error hints
   */
  private getDatabaseErrorHint(errorMessage: string, dbType: string): string {
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
          return `\n\nHint: PostgreSQL requires double quotes around column names with mixed case (e.g., "${
            columnName.charAt(0).toUpperCase() + columnName.slice(1)
          }"). The generated query may need to quote column names.`;
        }
      }
    } else if (dbType === "mysql") {
      // MySQL-specific error hints
      if (errorMessage.includes("Unknown column")) {
        return "\n\nHint: Check column name spelling and case. MySQL may be case-sensitive depending on the OS.";
      } else if (
        errorMessage.includes("You have an error in your SQL syntax")
      ) {
        return "\n\nHint: MySQL syntax error. Check for reserved words that may need backticks.";
      }
    } else if (dbType === "sqlite") {
      // SQLite-specific error hints
      if (errorMessage.includes("no such column")) {
        return "\n\nHint: Column not found. Check column name spelling.";
      } else if (errorMessage.includes("no such table")) {
        return "\n\nHint: Table not found. SQLite doesn't use schema prefixes (just use table_name, not public.table_name).";
      }
    }

    return "";
  }
}


/**
 * Schema Service
 *
 * Handles all schema-related operations including:
 * - Schema information retrieval and caching
 * - Schema formatting for LLM consumption
 * - Database metadata extraction
 */

import { CONFIG } from "../config.js";
import { UnifiedDatabaseClient } from "../db-client.js";
import { logger } from "../logger.js";

type SchemaCacheEntry = {
  schema: any;
  fetchedAt: number;
};

export class SchemaService {
  private schemaCacheTtlMs: number;
  private cachedSchemas: Map<string, SchemaCacheEntry> = new Map();

  constructor(
    private dbClient: UnifiedDatabaseClient,
    cacheTtlSeconds: number = CONFIG.server.schemaCacheTtlSeconds
  ) {
    this.schemaCacheTtlMs = cacheTtlSeconds * 1000;
  }

  /**
   * Get schema information with caching
   */
  async getSchemaInformation(schemaName: string = "public"): Promise<any> {
    const cacheKey = `schema:${schemaName}`;
    const cached = this.cachedSchemas.get(cacheKey);

    if (cached && Date.now() - cached.fetchedAt < this.schemaCacheTtlMs) {
      logger.debug({ schemaName }, "Using cached schema");
      return cached.schema;
    }

    if (cached) {
      logger.debug({ schemaName }, "Cache expired, refreshing schema");
      this.cachedSchemas.delete(cacheKey);
    }

    logger.info({ schemaName }, "Fetching schema information from database");
    const schema = await this.dbClient.getSchemaInformation(schemaName);
    this.cachedSchemas.set(cacheKey, { schema, fetchedAt: Date.now() });

    return schema;
  }

  /**
   * Format schema for LLM consumption (brief format)
   */
  async formatSchemaForLLM(schemaName: string): Promise<string> {
    const schema = await this.getSchemaInformation(schemaName);

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

  /**
   * Get comprehensive database metadata for LLM analysis
   */
  async getAllDatabaseMetadata(schemaName: string = "public"): Promise<string> {
    const schema = await this.getSchemaInformation(schemaName);

    let metadata = `DATABASE SCHEMA: ${schema.schemaName}\n\n`;
    metadata += `TABLES AND COLUMNS:\n`;
    metadata += `==================\n\n`;

    for (const [tableName, tableInfo] of Object.entries(schema.tables) as [
      string,
      any
    ][]) {
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

    return metadata;
  }

  /**
   * Clear cache for a specific schema or all schemas
   */
  clearCache(schemaName?: string): void {
    if (schemaName) {
      const cacheKey = `schema:${schemaName}`;
      this.cachedSchemas.delete(cacheKey);
      logger.info({ schemaName }, "Schema cache cleared");
    } else {
      this.cachedSchemas.clear();
      logger.info("All schema caches cleared");
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; schemas: string[] } {
    const schemas = Array.from(this.cachedSchemas.keys()).map((key) =>
      key.replace("schema:", "")
    );
    return {
      entries: this.cachedSchemas.size,
      schemas,
    };
  }
}


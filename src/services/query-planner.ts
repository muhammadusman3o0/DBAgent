/**
 * Query Planner Service
 *
 * Orchestrates the complete query processing pipeline:
 * 1. Determine if query is needed
 * 2. Get schema metadata
 * 3. Analyze data structure
 * 4. Generate SQL query
 * 5. Execute query
 * 6. Format results
 */

import { CONFIG } from "../config.js";
import { UnifiedDatabaseClient } from "../db-client.js";
import { UnifiedLLMClient } from "../llm-client.js";
import { logger } from "../logger.js";
import { AnalysisPlanner } from "./analysis-planner.js";
import { QueryExecutor, QueryResult } from "./query-executor.js";
import { QueryGenerator } from "./query-generator.js";
import { ResultFormatter } from "./result-formatter.js";
import { SchemaService } from "./schema-service.js";

export class QueryPlanner {
  private schemaService: SchemaService;
  private analysisPlanner: AnalysisPlanner;
  private queryGenerator: QueryGenerator;
  private queryExecutor: QueryExecutor;
  private resultFormatter: ResultFormatter;

  constructor(
    private dbClient: UnifiedDatabaseClient,
    private llmClient: UnifiedLLMClient | null
  ) {
    this.schemaService = new SchemaService(dbClient);
    this.analysisPlanner = new AnalysisPlanner(llmClient);
    this.queryGenerator = new QueryGenerator(llmClient);
    this.queryExecutor = new QueryExecutor(dbClient);
    this.resultFormatter = new ResultFormatter(llmClient);
  }

  /**
   * Check if LLM is available
   */
  isLLMAvailable(): boolean {
    return this.llmClient !== null;
  }

  /**
   * Process user request through complete pipeline
   */
  async processRequest(
    request: string,
    schemaName: string = "public",
    maxRows: number = CONFIG.server.maxRows
  ): Promise<QueryResult> {
    if (!this.isLLMAvailable()) {
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
      // Step 1: Determine if database query is needed
      logger.info(
        { step: 1, request },
        "Determining if database query is needed"
      );
      const queryCheck = await this.analysisPlanner.determineIfQueryNeeded(
        request
      );
      logger.info({
        step: 1,
        needsQuery: queryCheck.needsQuery,
        reasoning: queryCheck.reasoning,
      });

      if (!queryCheck.needsQuery) {
        // Generate conversational response without database query
        const response =
          await this.analysisPlanner.generateConversationalResponse(request);
        return {
          success: true,
          rowCount: 0,
          rows: [],
          explanation: response,
          queryExecuted: false,
        };
      }

      // Step 2: Retrieve database metadata
      logger.info(
        { step: 2, schema: schemaName },
        "Retrieving database metadata"
      );
      const metadata = await this.schemaService.getAllDatabaseMetadata(
        schemaName
      );
      logger.debug({ schema: schemaName }, "Schema metadata retrieved");

      // Step 3: Analyze data structure and relationships
      logger.info(
        { step: 3, schema: schemaName },
        "Analyzing data structure and relationships"
      );
      const dbType = this.dbClient.getDatabaseType();
      const analysis = await this.analysisPlanner.analyzeDataStructure(
        metadata,
        request,
        dbType
      );
      logger.info({
        step: 3,
        understandingPreview: analysis.understanding.substring(0, 100),
        relevantTables: analysis.relevantTables,
      });

      // Step 4: Generate SQL based on analysis
      logger.info({ step: 4, request }, "Generating SQL based on analysis");
      const dbName = this.dbClient.getDatabaseName();
      const queryData = await this.queryGenerator.generateQuery(
        request,
        metadata,
        analysis,
        dbType,
        dbName,
        maxRows
      );
      logger.info(
        { step: 4, preview: queryData.sql.substring(0, 120) },
        "SQL generated"
      );

      // Step 5: Execute generated query
      logger.info({ step: 5 }, "Executing generated query");
      const result = await this.queryExecutor.execute(
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

  /**
   * Format query results with LLM
   */
  async formatResults(
    request: string,
    queryResult: QueryResult
  ): Promise<string> {
    return this.resultFormatter.formatResults(request, queryResult);
  }

  /**
   * Format raw data for display
   */
  formatRawData(queryResult: QueryResult): string {
    return this.resultFormatter.formatRawData(queryResult);
  }

  /**
   * Get schema service for direct access
   */
  getSchemaService(): SchemaService {
    return this.schemaService;
  }
}


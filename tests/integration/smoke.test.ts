/**
 * Integration Smoke Tests
 *
 * Basic smoke tests for service integration and pipeline coordination
 */

// Provide minimal environment variables for config loading
process.env.MAX_ROWS = process.env.MAX_ROWS || "100";
process.env.SCHEMA_CACHE_TTL = process.env.SCHEMA_CACHE_TTL || "300";
process.env.DB_TYPE = process.env.DB_TYPE || "sqlite";
process.env.DB_PORT = process.env.DB_PORT || "5432";
process.env.LLM_MAX_TOKENS = process.env.LLM_MAX_TOKENS || "2000";
process.env.LLM_TOP_P = process.env.LLM_TOP_P || "0.95";
process.env.LLM_TEMPERATURE = process.env.LLM_TEMPERATURE || "0.1";
process.env.MAX_EXECUTION_MS = process.env.MAX_EXECUTION_MS || "10000";
process.env.WEB_PORT = process.env.WEB_PORT || "3000";
process.env.SQLITE_FILE = process.env.SQLITE_FILE || ":memory:";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabaseClient,
  UnifiedDatabaseClient,
} from "../../src/db-client";
import { QueryExecutor } from "../../src/services/query-executor";
import { enforceReadOnly } from "../../src/services/query-safety";
import { SchemaService } from "../../src/services/schema-service";

describe("Integration Smoke Tests", () => {
  let dbClient: UnifiedDatabaseClient;
  let schemaService: SchemaService;
  let queryExecutor: QueryExecutor;

  beforeAll(async () => {
    // Create in-memory SQLite for testing
    dbClient = createDatabaseClient({
      type: "sqlite",
      filename: ":memory:",
    });

    await dbClient.connect();

    // Create test schema
    await dbClient.query(
      `CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        active INTEGER DEFAULT 1
      )`
    );

    await dbClient.query(
      `CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        total REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`
    );

    // Insert test data
    await dbClient.query(
      `INSERT INTO users (id, name, email, active) VALUES 
        (1, 'Alice', 'alice@example.com', 1),
        (2, 'Bob', 'bob@example.com', 1),
        (3, 'Charlie', 'charlie@example.com', 0)`
    );

    await dbClient.query(
      `INSERT INTO orders (user_id, total) VALUES 
        (1, 99.99),
        (1, 149.50),
        (2, 59.99)`
    );

    // Initialize services
    schemaService = new SchemaService(dbClient);
    queryExecutor = new QueryExecutor(dbClient);
  });

  afterAll(async () => {
    await dbClient.disconnect();
  });

  describe("SchemaService Integration", () => {
    it("retrieves schema information", async () => {
      const schema = await schemaService.getSchemaInformation("main");

      expect(schema).toBeDefined();
      expect(schema.tables).toBeDefined();
      expect(schema.tables.users).toBeDefined();
      expect(schema.tables.orders).toBeDefined();
    });

    it("formats schema for LLM", async () => {
      const formatted = await schemaService.formatSchemaForLLM("main");

      expect(formatted).toContain("Database Schema: main");
      expect(formatted).toContain("Table: users");
      expect(formatted).toContain("Table: orders");
      expect(formatted).toContain("id:");
      expect(formatted).toContain("name:");
    });

    it("gets comprehensive metadata", async () => {
      const metadata = await schemaService.getAllDatabaseMetadata("main");

      expect(metadata).toContain("DATABASE SCHEMA: main");
      expect(metadata).toContain("TABLES AND COLUMNS:");
      expect(metadata).toContain("users");
      expect(metadata).toContain("orders");
    });

    it("caches schema information", async () => {
      const stats1 = schemaService.getCacheStats();
      expect(stats1.entries).toBeGreaterThan(0);

      // Access cached schema
      const schema = await schemaService.getSchemaInformation("main");
      expect(schema).toBeDefined();

      const stats2 = schemaService.getCacheStats();
      expect(stats2.entries).toBe(stats1.entries);
    });

    it("clears cache", () => {
      schemaService.clearCache("main");
      const stats = schemaService.getCacheStats();
      expect(stats.entries).toBe(0);
    });
  });

  describe("QueryExecutor Integration", () => {
    it("executes valid SELECT query", async () => {
      const result = await queryExecutor.execute(
        "SELECT * FROM users WHERE active = 1 LIMIT 10",
        [],
        "Get active users"
      );

      expect(result.success).toBe(true);
      expect(result.queryExecuted).toBe(true);
      expect(result.rowCount).toBe(2);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe("Alice");
    });

    it("executes query with parameters", async () => {
      const result = await queryExecutor.execute(
        "SELECT * FROM users WHERE id = ? LIMIT 10",
        [1],
        "Get user by ID"
      );

      expect(result.success).toBe(true);
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].email).toBe("alice@example.com");
    });

    it("executes JOIN query", async () => {
      const result = await queryExecutor.execute(
        `SELECT users.name, orders.total 
         FROM users 
         JOIN orders ON users.id = orders.user_id 
         WHERE users.active = 1 
         LIMIT 10`,
        [],
        "Get orders for active users"
      );

      expect(result.success).toBe(true);
      expect(result.rowCount).toBe(3);
    });

    it("rejects INSERT query", async () => {
      const result = await queryExecutor.execute(
        "INSERT INTO users (name, email) VALUES ('Eve', 'eve@example.com')",
        [],
        "Try to insert"
      );

      expect(result.success).toBe(false);
      expect(result.queryExecuted).toBe(false);
      expect(result.error).toContain("Only SELECT statements are permitted");
    });

    it("rejects UPDATE query", async () => {
      const result = await queryExecutor.execute(
        "UPDATE users SET active = 0 WHERE id = 1",
        [],
        "Try to update"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Only SELECT statements are permitted");
    });

    it("rejects DELETE query", async () => {
      const result = await queryExecutor.execute(
        "DELETE FROM users WHERE id = 1",
        [],
        "Try to delete"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Only SELECT statements are permitted");
    });

    it("handles query execution errors gracefully", async () => {
      const result = await queryExecutor.execute(
        "SELECT * FROM non_existent_table LIMIT 10",
        [],
        "Query non-existent table"
      );

      expect(result.success).toBe(false);
      expect(result.queryExecuted).toBe(false);
      expect(result.error).toContain("execution failed");
    });
  });

  describe("Safety Module Integration", () => {
    it("enforces read-only on real queries", () => {
      expect(() =>
        enforceReadOnly("SELECT * FROM users WHERE active = 1")
      ).not.toThrow();

      expect(() => enforceReadOnly("UPDATE users SET active = 0")).toThrow(
        "Only SELECT statements are permitted"
      );
    });

    it("validates queries before execution", async () => {
      // This should pass safety check but fail on execution (table doesn't exist)
      const result = await queryExecutor.execute(
        "SELECT * FROM missing_table LIMIT 10",
        [],
        "Test missing table"
      );

      expect(result.success).toBe(false);
      expect(result.queryExecuted).toBe(false);
    });
  });

  describe("End-to-End Pipeline Simulation", () => {
    it("completes basic read pipeline", async () => {
      // 1. Get schema
      const schema = await schemaService.getSchemaInformation("main");
      expect(schema).toBeDefined();

      // 2. Execute query based on schema
      const result = await queryExecutor.execute(
        "SELECT name, email FROM users WHERE active = 1 LIMIT 10",
        [],
        "Get active user details"
      );

      expect(result.success).toBe(true);
      expect(result.queryExecuted).toBe(true);
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it("handles complex analytical query", async () => {
      const result = await queryExecutor.execute(
        `SELECT 
          users.name,
          COUNT(orders.id) as order_count,
          SUM(orders.total) as total_spent
         FROM users
         LEFT JOIN orders ON users.id = orders.user_id
         WHERE users.active = 1
         GROUP BY users.id, users.name
         LIMIT 10`,
        [],
        "Aggregate user orders"
      );

      expect(result.success).toBe(true);
      expect(result.rowCount).toBe(2);
      expect(result.rows[0]).toHaveProperty("order_count");
      expect(result.rows[0]).toHaveProperty("total_spent");
    });
  });
});


/**
 * Unified Database Client
 *
 * Provides a single interface to interact with multiple database types:
 * - PostgreSQL
 * - MySQL
 * - SQLite
 */

import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { Database, open } from "sqlite";
import sqlite3 from "sqlite3";
import { logger } from "./logger.js";

// ==================== Types ====================

export type DatabaseType = "postgres" | "mysql" | "sqlite";

export interface DatabaseConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  filename?: string; // For SQLite
}

export type DatabaseInputConfig = Partial<DatabaseConfig> & { url?: string };

export interface QueryResult {
  rows: any[];
  rowCount: number;
  fields?: any[];
}

export interface SchemaInfo {
  schemaName: string;
  tables: Record<string, TableInfo>;
}

export interface TableInfo {
  columns: ColumnInfo[];
  primaryKeys?: string[];
  foreignKeys?: ForeignKeyInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  isPrimaryKey?: boolean;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

export interface ForeignKeyInfo {
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

// ==================== Configuration Parser ====================

export function buildDatabaseConfig(
  input?: DatabaseInputConfig
): DatabaseConfig {
  const envType = (process.env.DB_TYPE || "postgres").toLowerCase();
  const type = (input?.type || envType) as DatabaseType;
  const url = input?.url || process.env.DATABASE_URL;

  if (url) {
    try {
      const parsed = new URL(url);
      const protocol = parsed.protocol.replace(":", "");
      const derivedType: DatabaseType =
        protocol === "postgresql" ? "postgres" : (protocol as DatabaseType);
      return {
        type: input?.type || derivedType,
        host: input?.host || parsed.hostname,
        port:
          input?.port || parseInt(parsed.port || getDefaultPort(derivedType)),
        database: input?.database || parsed.pathname.slice(1),
        user: input?.user || parsed.username,
        password: input?.password || parsed.password,
      };
    } catch (error) {
      logger.error({ err: error, url }, "Failed to parse database url");
    }
  }

  if (type === "sqlite") {
    return {
      type: "sqlite",
      filename:
        input?.filename || process.env.SQLITE_FILE || "./database.sqlite",
    };
  }

  return {
    type,
    host: input?.host || process.env.DB_HOST || "localhost",
    port: input?.port || parseInt(process.env.DB_PORT || getDefaultPort(type)),
    database:
      input?.database ||
      process.env.DB_NAME ||
      process.env.POSTGRES_DB ||
      "postgres",
    user:
      input?.user || process.env.DB_USER || process.env.POSTGRES_USER || "root",
    password:
      input?.password ||
      process.env.DB_PASSWORD ||
      process.env.POSTGRES_PASSWORD ||
      "",
  };
}

function getDefaultPort(type: string): string {
  switch (type) {
    case "postgres":
    case "postgresql":
      return "5432";
    case "mysql":
      return "3306";
    default:
      return "5432";
  }
}

// ==================== Unified Database Client ====================

export class UnifiedDatabaseClient {
  private config: DatabaseConfig;
  private pgClient: PgClient | null = null;
  private mysqlConnection: mysql.Connection | null = null;
  private sqliteDb: Database | null = null;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    switch (this.config.type) {
      case "postgres":
        this.pgClient = new PgClient({
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
          user: this.config.user,
          password: this.config.password,
        });
        await this.pgClient.connect();
        break;

      case "mysql":
        this.mysqlConnection = await mysql.createConnection({
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
          user: this.config.user,
          password: this.config.password,
        });
        break;

      case "sqlite":
        this.sqliteDb = await open({
          filename: this.config.filename!,
          driver: sqlite3.Database,
        });
        break;

      default:
        throw new Error(`Unsupported database type: ${this.config.type}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pgClient) {
      await this.pgClient.end();
      this.pgClient = null;
    }
    if (this.mysqlConnection) {
      await this.mysqlConnection.end();
      this.mysqlConnection = null;
    }
    if (this.sqliteDb) {
      await this.sqliteDb.close();
      this.sqliteDb = null;
    }
  }

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    switch (this.config.type) {
      case "postgres":
        if (!this.pgClient) throw new Error("PostgreSQL not connected");
        const pgResult = await this.pgClient.query(sql, params);
        return {
          rows: pgResult.rows,
          rowCount: pgResult.rowCount || 0,
          fields: pgResult.fields,
        };

      case "mysql":
        if (!this.mysqlConnection) throw new Error("MySQL not connected");
        const [mysqlRows, mysqlFields] = await this.mysqlConnection.execute(
          sql,
          params
        );
        return {
          rows: Array.isArray(mysqlRows) ? mysqlRows : [],
          rowCount: Array.isArray(mysqlRows) ? mysqlRows.length : 0,
          fields: mysqlFields,
        };

      case "sqlite":
        if (!this.sqliteDb) throw new Error("SQLite not connected");
        const sqliteRows = await this.sqliteDb.all(sql, params);
        return {
          rows: sqliteRows,
          rowCount: sqliteRows.length,
        };

      default:
        throw new Error(`Unsupported database type: ${this.config.type}`);
    }
  }

  async getSchemaInformation(
    schemaName: string = "public"
  ): Promise<SchemaInfo> {
    switch (this.config.type) {
      case "postgres":
        return this.getPostgresSchema(schemaName);
      case "mysql":
        return this.getMySQLSchema(schemaName);
      case "sqlite":
        return this.getSQLiteSchema();
      default:
        throw new Error(`Unsupported database type: ${this.config.type}`);
    }
  }

  private async getPostgresSchema(schemaName: string): Promise<SchemaInfo> {
    const tablesResult = await this.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schemaName]
    );

    const schema: SchemaInfo = {
      schemaName,
      tables: {},
    };

    for (const row of tablesResult.rows) {
      const tableName = row.table_name;

      const columnsResult = await this.query(
        `SELECT 
          column_name, data_type, is_nullable, column_default,
          character_maximum_length, numeric_precision, numeric_scale
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schemaName, tableName]
      );

      const pkResult = await this.query(
        `SELECT a.attname
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [`${schemaName}.${tableName}`]
      );

      const primaryKeys = pkResult.rows.map((r) => r.attname);

      schema.tables[tableName] = {
        columns: columnsResult.rows.map((col) => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === "YES",
          default: col.column_default,
          isPrimaryKey: primaryKeys.includes(col.column_name),
          maxLength: col.character_maximum_length,
          precision: col.numeric_precision,
          scale: col.numeric_scale,
        })),
        primaryKeys,
      };
    }

    return schema;
  }

  private async getMySQLSchema(schemaName: string): Promise<SchemaInfo> {
    const dbName = schemaName === "public" ? this.config.database : schemaName;

    const tablesResult = await this.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = ? AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [dbName]
    );

    const schema: SchemaInfo = {
      schemaName: dbName!,
      tables: {},
    };

    for (const row of tablesResult.rows) {
      const tableName = row.TABLE_NAME || row.table_name;

      const columnsResult = await this.query(
        `SELECT 
          column_name, data_type, is_nullable, column_default, column_key,
          character_maximum_length, numeric_precision, numeric_scale
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?
         ORDER BY ordinal_position`,
        [dbName, tableName]
      );

      const primaryKeys = columnsResult.rows
        .filter((col) => (col.COLUMN_KEY || col.column_key) === "PRI")
        .map((col) => col.COLUMN_NAME || col.column_name);

      schema.tables[tableName] = {
        columns: columnsResult.rows.map((col) => ({
          name: col.COLUMN_NAME || col.column_name,
          type: col.DATA_TYPE || col.data_type,
          nullable: (col.IS_NULLABLE || col.is_nullable) === "YES",
          default: col.COLUMN_DEFAULT || col.column_default,
          isPrimaryKey: (col.COLUMN_KEY || col.column_key) === "PRI",
          maxLength:
            col.CHARACTER_MAXIMUM_LENGTH || col.character_maximum_length,
          precision: col.NUMERIC_PRECISION || col.numeric_precision,
          scale: col.NUMERIC_SCALE || col.numeric_scale,
        })),
        primaryKeys,
      };
    }

    return schema;
  }

  private async getSQLiteSchema(): Promise<SchemaInfo> {
    const tablesResult = await this.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );

    const schema: SchemaInfo = {
      schemaName: "main",
      tables: {},
    };

    for (const row of tablesResult.rows) {
      const tableName = row.name;

      const columnsResult = await this.query(`PRAGMA table_info(${tableName})`);

      const primaryKeys = columnsResult.rows
        .filter((col) => col.pk > 0)
        .map((col) => col.name);

      schema.tables[tableName] = {
        columns: columnsResult.rows.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.notnull === 0,
          default: col.dflt_value,
          isPrimaryKey: col.pk > 0,
        })),
        primaryKeys,
      };
    }

    return schema;
  }

  async getVersion(): Promise<string> {
    switch (this.config.type) {
      case "postgres":
        const pgResult = await this.query("SELECT version()");
        return pgResult.rows[0].version;

      case "mysql":
        const mysqlResult = await this.query("SELECT VERSION() as version");
        return `MySQL ${mysqlResult.rows[0].version}`;

      case "sqlite":
        const sqliteResult = await this.query(
          "SELECT sqlite_version() as version"
        );
        return `SQLite ${sqliteResult.rows[0].version}`;

      default:
        return "Unknown";
    }
  }

  getDatabaseType(): string {
    return this.config.type;
  }

  getDatabaseName(): string {
    return this.config.database || this.config.filename || "unknown";
  }
}

// ==================== Helper Functions ====================

export function createDatabaseClient(
  override?: DatabaseInputConfig
): UnifiedDatabaseClient {
  const config = buildDatabaseConfig(override);
  logger.info({ dbType: config.type }, "Initializing database client");
  return new UnifiedDatabaseClient(config);
}


import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

type EnvRecord = Record<string, string | undefined>;

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized)
    ? true
    : ["0", "false", "no", "n", "off"].includes(normalized)
    ? false
    : fallback;
};

const number = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const AppConfigSchema = z.object({
  server: z.object({
    logLevel: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    maxRows: z.number().int().min(1).max(1000).default(100),
    schemaCacheTtlSeconds: z.number().int().min(10).max(3600).default(300),
  }),
  database: z.object({
    type: z.enum(["postgres", "mysql", "sqlite"]).default("postgres"),
    url: z.string().optional(),
    host: z.string().optional(),
    port: z.number().optional(),
    name: z.string().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    sqliteFile: z.string().optional(),
  }),
  llm: z.object({
    provider: z
      .enum(["openai", "azure", "grok", "gemini", "ollama"])
      .default("openai"),
    temperature: z.number().min(0).max(2).default(0.1),
    maxTokens: z.number().int().min(256).max(4096).default(2000),
    topP: z.number().min(0).max(1).default(0.95),
  }),
  safety: z.object({
    readOnly: z.boolean().default(true),
    maxExecutionMs: z.number().int().min(100).max(30000).default(10000),
  }),
  web: z.object({
    port: z.number().int().min(1).max(65535).default(3000),
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

let cachedConfig: AppConfig | null = null;

const resolveDatabaseUrl = (env: EnvRecord): string | undefined => {
  return env.DATABASE_URL || env.POSTGRES_URL || env.MYSQL_URL;
};

function buildRawConfig(env: EnvRecord) {
  return {
    server: {
      logLevel: (env.LOG_LEVEL as LogLevel) || "info",
      maxRows: number(env.MAX_ROWS, 100),
      schemaCacheTtlSeconds: number(env.SCHEMA_CACHE_TTL, 300),
    },
    database: {
      type: (env.DB_TYPE || "postgres") as AppConfig["database"]["type"],
      url: resolveDatabaseUrl(env),
      host: env.DB_HOST || env.POSTGRES_HOST,
      // Only set port if an environment value exists; avoid passing NaN to the schema
      port:
        env.DB_PORT || env.POSTGRES_PORT
          ? number(env.DB_PORT || env.POSTGRES_PORT, NaN)
          : undefined,
      name: env.DB_NAME || env.POSTGRES_DB,
      user: env.DB_USER || env.POSTGRES_USER,
      password: env.DB_PASSWORD || env.POSTGRES_PASSWORD,
      sqliteFile: env.SQLITE_FILE,
    },
    llm: {
      provider: (env.LLM_PROVIDER || "openai") as AppConfig["llm"]["provider"],
      temperature: number(env.LLM_TEMPERATURE, 0.1),
      maxTokens: number(env.LLM_MAX_TOKENS, 2000),
      topP: number(env.LLM_TOP_P, 0.95),
    },
    safety: {
      readOnly: bool(env.SAFETY_READ_ONLY, true),
      maxExecutionMs: number(env.MAX_EXECUTION_MS, 10000),
    },
    web: {
      port: number(env.WEB_PORT, 3000),
    },
  };
}

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  if (cachedConfig && !overrides) {
    return cachedConfig;
  }

  const raw = buildRawConfig(process.env);
  const parsed = AppConfigSchema.safeParse(raw);

  if (!parsed.success) {
    const reason = parsed.error.errors.map((err) => err.message).join("; ");
    throw new Error(`Invalid configuration: ${reason}`);
  }

  const merged = overrides ? { ...parsed.data, ...overrides } : parsed.data;

  if (!overrides) {
    cachedConfig = merged;
  }

  return merged;
}

export const CONFIG = loadConfig();


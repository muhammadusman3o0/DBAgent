import pino from "pino";
import { CONFIG } from "./config.js";

const redactPaths = [
  "env.OPENAI_API_KEY",
  "env.AZURE_OPENAI_API_KEY",
  "env.GROK_API_KEY",
  "env.GEMINI_API_KEY",
  "env.DB_PASSWORD",
  "env.POSTGRES_PASSWORD",
];

const enablePretty = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: CONFIG.server.logLevel,
  redact: {
    paths: redactPaths,
    censor: "[redacted]",
  },
  transport: enablePretty
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "hostname,pid",
        },
      }
    : undefined,
});

export type Logger = typeof logger;


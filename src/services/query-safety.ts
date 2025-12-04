import { CONFIG } from "../config.js";
import { logger } from "../logger.js";

const READ_ONLY_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "GRANT",
  "REVOKE",
  "TRUNCATE",
  "CREATE",
];

const DISALLOWED_PREFIXES = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "WITH",
  "BEGIN",
  "CALL",
  "DO",
];

const keywordRegexCache = new Map<string, RegExp>();

const getRegex = (keyword: string): RegExp => {
  if (!keywordRegexCache.has(keyword)) {
    keywordRegexCache.set(keyword, new RegExp(`\\b${keyword}\\b`, "i"));
  }
  return keywordRegexCache.get(keyword)!;
};

export class QuerySafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuerySafetyError";
  }
}

export function enforceReadOnly(sql: string): void {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    throw new QuerySafetyError(
      "Only SELECT statements are permitted. Please rephrase your request as a read-only query."
    );
  }

  for (const prefix of DISALLOWED_PREFIXES) {
    if (upper.startsWith(prefix) && prefix !== "SELECT" && prefix !== "WITH") {
      throw new QuerySafetyError(
        `Query rejected because it begins with '${prefix}'. Only read-only queries are allowed.`
      );
    }
  }

  // To avoid false positives, strip out string literals and comments before checking
  const stripLiteralsAndComments = (input: string) =>
    input
      // remove block comments /* ... */
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      // remove line comments -- ...\n
      .replace(/--.*$/gm, " ")
      // remove single-quoted strings
      .replace(/'([^']|\\')*'/g, " '")
      // remove double-quoted strings
      .replace(/"([^"]|\\")*"/g, ' "');

  const sanitized = stripLiteralsAndComments(sql);

  for (const keyword of READ_ONLY_KEYWORDS) {
    if (getRegex(keyword).test(sanitized)) {
      throw new QuerySafetyError(
        `Query rejected: contains forbidden keyword '${keyword}'. Only SELECT statements are permitted.`
      );
    }
  }
}

export async function withQueryTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = CONFIG.safety.maxExecutionMs
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      logger.warn(
        { timeoutMs },
        "Query execution exceeded configured timeout; cancelling promise"
      );
      reject(
        new QuerySafetyError(
          `Query timed out after ${timeoutMs}ms. Please refine your request or lower the row count.`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}


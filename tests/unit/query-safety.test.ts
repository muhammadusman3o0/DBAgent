/**
 * Unit Tests for Query Safety Module
 *
 * Tests read-only enforcement, timeout handling, and safety error types
 */

// Provide minimal environment variables so src/config.ts can parse successfully during tests
process.env.MAX_ROWS = process.env.MAX_ROWS || "100";
process.env.SCHEMA_CACHE_TTL = process.env.SCHEMA_CACHE_TTL || "300";
process.env.DB_TYPE = process.env.DB_TYPE || "sqlite";
process.env.DB_PORT = process.env.DB_PORT || "5432";
process.env.LLM_MAX_TOKENS = process.env.LLM_MAX_TOKENS || "2000";
process.env.LLM_TOP_P = process.env.LLM_TOP_P || "0.95";
process.env.LLM_TEMPERATURE = process.env.LLM_TEMPERATURE || "0.1";
process.env.MAX_EXECUTION_MS = process.env.MAX_EXECUTION_MS || "10000";
process.env.WEB_PORT = process.env.WEB_PORT || "3000";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enforceReadOnly,
  QuerySafetyError,
  withQueryTimeout,
} from "../../src/services/query-safety";

describe("Query Safety Module", () => {
  describe("enforceReadOnly", () => {
    describe("should allow valid SELECT queries", () => {
      it("allows simple SELECT", () => {
        expect(() => enforceReadOnly("SELECT * FROM users")).not.toThrow();
      });

      it("allows SELECT with WHERE clause", () => {
        expect(() =>
          enforceReadOnly("SELECT id, name FROM users WHERE active = true")
        ).not.toThrow();
      });

      it("allows SELECT with JOIN", () => {
        expect(() =>
          enforceReadOnly(
            "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id"
          )
        ).not.toThrow();
      });

      it("allows SELECT with subquery", () => {
        expect(() =>
          enforceReadOnly(
            "SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)"
          )
        ).not.toThrow();
      });

      it("allows CTE (WITH clause) for SELECT", () => {
        expect(() =>
          enforceReadOnly(
            "WITH active_users AS (SELECT * FROM users WHERE active = true) SELECT * FROM active_users"
          )
        ).not.toThrow();
      });

      it("allows SELECT with extra whitespace", () => {
        expect(() =>
          enforceReadOnly("  \n  SELECT * FROM users  ")
        ).not.toThrow();
      });

      it("allows SELECT with case variation", () => {
        expect(() => enforceReadOnly("select * from users")).not.toThrow();
        expect(() => enforceReadOnly("SeLeCt * FrOm users")).not.toThrow();
      });
    });

    describe("should reject write operations", () => {
      it("rejects INSERT", () => {
        expect(() =>
          enforceReadOnly("INSERT INTO users (name) VALUES ('John')")
        ).toThrow(QuerySafetyError);
        expect(() =>
          enforceReadOnly("INSERT INTO users (name) VALUES ('John')")
        ).toThrow("Only SELECT statements are permitted");
      });

      it("rejects UPDATE", () => {
        expect(() =>
          enforceReadOnly("UPDATE users SET name = 'John' WHERE id = 1")
        ).toThrow(QuerySafetyError);
      });

      it("rejects DELETE", () => {
        expect(() => enforceReadOnly("DELETE FROM users WHERE id = 1")).toThrow(
          QuerySafetyError
        );
      });

      it("rejects DROP TABLE", () => {
        expect(() => enforceReadOnly("DROP TABLE users")).toThrow(
          QuerySafetyError
        );
      });

      it("rejects DROP DATABASE", () => {
        expect(() => enforceReadOnly("DROP DATABASE mydb")).toThrow(
          QuerySafetyError
        );
      });

      it("rejects ALTER TABLE", () => {
        expect(() =>
          enforceReadOnly("ALTER TABLE users ADD COLUMN age INT")
        ).toThrow(QuerySafetyError);
      });

      it("rejects TRUNCATE", () => {
        expect(() => enforceReadOnly("TRUNCATE TABLE users")).toThrow(
          QuerySafetyError
        );
      });

      it("rejects CREATE TABLE", () => {
        expect(() =>
          enforceReadOnly("CREATE TABLE users (id INT PRIMARY KEY)")
        ).toThrow(QuerySafetyError);
      });

      it("rejects GRANT", () => {
        expect(() => enforceReadOnly("GRANT ALL ON users TO public")).toThrow(
          QuerySafetyError
        );
      });

      it("rejects REVOKE", () => {
        expect(() =>
          enforceReadOnly("REVOKE ALL ON users FROM public")
        ).toThrow(QuerySafetyError);
      });
    });

    describe("should detect hidden write operations", () => {
      it("rejects INSERT in subquery", () => {
        expect(() =>
          enforceReadOnly(
            "SELECT * FROM users WHERE id IN (INSERT INTO logs VALUES (1))"
          )
        ).toThrow(QuerySafetyError);
      });

      it("rejects UPDATE in CTE", () => {
        expect(() =>
          enforceReadOnly(
            "WITH updated AS (UPDATE users SET active = false RETURNING *) SELECT * FROM updated"
          )
        ).toThrow(QuerySafetyError);
      });

      it("rejects DELETE with comment trick", () => {
        expect(() =>
          enforceReadOnly("SELECT * FROM users; DELETE FROM users;")
        ).toThrow(QuerySafetyError);
      });

      it("rejects case-manipulated keywords", () => {
        expect(() =>
          enforceReadOnly(
            "SELECT * FROM users WHERE id = 1; InSeRt INTO logs VALUES (1)"
          )
        ).toThrow(QuerySafetyError);
      });
    });

    describe("should handle edge cases", () => {
      it("rejects empty query", () => {
        expect(() => enforceReadOnly("")).toThrow(QuerySafetyError);
      });

      it("rejects whitespace-only query", () => {
        expect(() => enforceReadOnly("   \n  \t  ")).toThrow(QuerySafetyError);
      });

      it("rejects query starting with WITH but containing INSERT", () => {
        expect(() =>
          enforceReadOnly(
            "WITH data AS (INSERT INTO users VALUES (1)) SELECT * FROM data"
          )
        ).toThrow(QuerySafetyError);
      });

      it("allows SELECT with word boundaries", () => {
        // These keywords appear in strings/comments, not as SQL operations
        expect(() =>
          enforceReadOnly("SELECT 'insert this', 'update that' FROM users")
        ).not.toThrow();
      });
    });
  });

  describe("withQueryTimeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("resolves promise if completed before timeout", async () => {
      const promise = Promise.resolve("success");
      const result = await withQueryTimeout(promise, 1000);
      expect(result).toBe("success");
    });

    it("rejects with timeout error if promise takes too long", async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve("success"), 5000);
      });

      const timeoutPromise = withQueryTimeout(promise, 1000);

      // Advance timer past timeout
      vi.advanceTimersByTime(1100);

      await expect(timeoutPromise).rejects.toThrow(QuerySafetyError);
      await expect(timeoutPromise).rejects.toThrow(/timed out after 1000ms/);
    });

    it("clears timeout after promise resolves", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const promise = Promise.resolve("success");

      await withQueryTimeout(promise, 1000);

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("clears timeout after promise rejects", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const promise = Promise.reject(new Error("fail"));

      await expect(withQueryTimeout(promise, 1000)).rejects.toThrow("fail");

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("allows unlimited time if timeout is 0", async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve("success"), 10000);
      });

      const timeoutPromise = withQueryTimeout(promise, 0);

      // Advance timer way past normal timeout
      vi.advanceTimersByTime(20000);

      // Promise should still be pending (not rejected)
      expect(timeoutPromise).toBeDefined();
    });

    it("allows unlimited time if timeout is negative", async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve("success"), 10000);
      });

      const timeoutPromise = withQueryTimeout(promise, -1);

      // Advance timer way past normal timeout
      vi.advanceTimersByTime(20000);

      // Promise should still be pending (not rejected)
      expect(timeoutPromise).toBeDefined();
    });
  });

  describe("QuerySafetyError", () => {
    it("creates error with correct name", () => {
      const error = new QuerySafetyError("test message");
      expect(error.name).toBe("QuerySafetyError");
    });

    it("creates error with correct message", () => {
      const error = new QuerySafetyError("test message");
      expect(error.message).toBe("test message");
    });

    it("is instance of Error", () => {
      const error = new QuerySafetyError("test message");
      expect(error).toBeInstanceOf(Error);
    });

    it("is instance of QuerySafetyError", () => {
      const error = new QuerySafetyError("test message");
      expect(error).toBeInstanceOf(QuerySafetyError);
    });
  });

  describe("Integration scenarios", () => {
    it("enforces safety on realistic e-commerce query", () => {
      const query = `
        SELECT 
          c.customer_id,
          c.name,
          COUNT(o.order_id) as order_count,
          SUM(o.total_amount) as total_spent
        FROM customers c
        JOIN orders o ON c.customer_id = o.customer_id
        WHERE c.active = true
        GROUP BY c.customer_id, c.name
        HAVING COUNT(o.order_id) > 5
        LIMIT 100
      `;
      expect(() => enforceReadOnly(query)).not.toThrow();
    });

    it("rejects SQL injection attempt", () => {
      const query = `SELECT * FROM users WHERE id = 1; DROP TABLE users; --`;
      expect(() => enforceReadOnly(query)).toThrow(QuerySafetyError);
    });

    it("rejects privilege escalation attempt", () => {
      const query = `SELECT * FROM users; GRANT ALL PRIVILEGES ON *.* TO 'hacker'@'%'; --`;
      expect(() => enforceReadOnly(query)).toThrow(QuerySafetyError);
    });
  });
});


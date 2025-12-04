#!/usr/bin/env tsx
import { CONFIG } from "../src/config.js";
import { DatabaseConfig, UnifiedDatabaseClient } from "../src/db-client.js";
import { createLLMClient } from "../src/llm-client.js";
import { QueryPlanner } from "../src/services/query-planner.js";

console.log("🧪 DBAgent Real-World Testing with Azure OpenAI\n");
console.log("=".repeat(70));

const tests = [
  "Show me all customers",
  "Find active customers",
  "Count orders by status",
  "Show me the top 5 customers by total spending",
  "Which products are most popular based on order quantity?",
  "Show orders from the last 10 days",
];

async function main() {
  const dbConfig: DatabaseConfig = {
    type: CONFIG.database.type as any,
    filename: CONFIG.database.sqliteFile,
  };

  const db = new UnifiedDatabaseClient(dbConfig);
  await db.connect();
  console.log(`✅ Connected to ${db.getDatabaseType()}\n`);

  const llm = createLLMClient();
  const planner = new QueryPlanner(db, llm);
  console.log(
    `✅ LLM: ${CONFIG.llm.provider} | Available: ${planner.isLLMAvailable()}\n`
  );
  console.log("=".repeat(70));

  let success = 0;
  let failed = 0;

  for (const query of tests) {
    console.log(`\n🔍 Query: "${query}"`);
    console.log("-".repeat(70));
    try {
      const start = Date.now();
      const result = await planner.processRequest(query, "main", 100);
      const time = Date.now() - start;

      if (!result.success) {
        console.log(`❌ Failed: ${result.error}`);
        failed++;
        continue;
      }

      console.log(`✅ Success | Rows: ${result.rowCount} | Time: ${time}ms`);
      if (result.explanation) {
        console.log(`💬 ${result.explanation.substring(0, 150)}...`);
      }
      success++;
    } catch (err: any) {
      console.log(`❌ Error: ${err.message}`);
      failed++;
    }
  }

  await db.disconnect();
  console.log("\n" + "=".repeat(70));
  console.log(
    `📊 Results: ${success}/${tests.length} passed (${(
      (success / tests.length) *
      100
    ).toFixed(0)}%)`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);


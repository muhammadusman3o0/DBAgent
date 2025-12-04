#!/usr/bin/env tsx
/**
 * MCP Server Integration Test
 * Simulates MCP tool calls without actual server transport
 */

import { CONFIG } from "../src/config.js";
import { DatabaseConfig, UnifiedDatabaseClient } from "../src/db-client.js";
import { createLLMClient } from "../src/llm-client.js";
import { QueryPlanner } from "../src/services/query-planner.js";

console.log("🧪 Testing DBAgent as MCP Server (Simulated)\n");
console.log("=".repeat(70));

const testQueries = [
  "How many customers do we have?",
  "Show me active customers",
  "List all products",
  "What orders are pending?",
];

async function testMCP() {
  try {
    // Initialize
    console.log("\n📦 Initializing MCP Server Components...");
    const dbConfig: DatabaseConfig = {
      type: CONFIG.database.type as any,
      filename: CONFIG.database.sqliteFile,
    };
    const db = new UnifiedDatabaseClient(dbConfig);
    await db.connect();
    const llm = createLLMClient();
    const planner = new QueryPlanner(db, llm);

    console.log(`✅ Database: ${db.getDatabaseType()}`);
    console.log(`✅ LLM: ${CONFIG.llm.provider}`);
    console.log(`✅ MCP Tool Ready: query_database`);

    // Simulate MCP Tool Calls
    console.log("\n🔍 Simulating MCP Tool Calls:");
    console.log("=".repeat(70));

    let success = 0;
    let failed = 0;

    for (const query of testQueries) {
      console.log(`\n💬 MCP Call: query_database(question="${query}")`);
      console.log("-".repeat(70));

      try {
        const start = Date.now();

        // Simulate MCP tool call
        const result = await planner.processRequest(query, "main", 100);

        const time = Date.now() - start;

        if (result.success) {
          console.log(
            `✅ MCP Response | Rows: ${result.rowCount} | Time: ${time}ms`
          );
          if (result.explanation) {
            console.log(`💬 ${result.explanation.substring(0, 120)}...`);
          }
          success++;
        } else {
          console.log(`❌ MCP Error: ${result.error}`);
          failed++;
        }
      } catch (error: any) {
        console.log(`❌ Exception: ${error.message}`);
        failed++;
      }
    }

    await db.disconnect();

    // Summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 MCP Server Test Results:");
    console.log(`   ✅ Successful: ${success}/${testQueries.length}`);
    console.log(`   ❌ Failed: ${failed}/${testQueries.length}`);
    console.log(
      `   Success Rate: ${((success / testQueries.length) * 100).toFixed(0)}%`
    );
    console.log("\n✅ MCP Server Test Complete!");

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n❌ Test Failed:");
    console.error(error);
    process.exit(1);
  }
}

testMCP();


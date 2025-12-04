#!/usr/bin/env tsx
/**
 * Web UI Integration Test
 * Tests the web chatbot interface programmatically
 */

import { CONFIG } from "../src/config.js";
import { DatabaseConfig, UnifiedDatabaseClient } from "../src/db-client.js";
import { createLLMClient } from "../src/llm-client.js";
import { QueryPlanner } from "../src/services/query-planner.js";

console.log("🧪 Testing DBAgent Web UI (Simulated)\n");
console.log("=".repeat(70));

const testConversation = [
  "Hello! What can you tell me about this database?",
  "How many customers are in the database?",
  "Show me the top 3 customers by spending",
  "What products do we have?",
  "List pending orders",
];

async function testWebUI() {
  try {
    // Initialize backend
    console.log("\n🌐 Initializing Web Backend...");
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
    console.log(`✅ Web Server: Ready (simulation mode)`);

    // Simulate web chat conversation
    console.log("\n💬 Simulating Web Chat Conversation:");
    console.log("=".repeat(70));

    let success = 0;
    let failed = 0;

    for (let i = 0; i < testConversation.length; i++) {
      const message = testConversation[i];
      console.log(
        `\n👤 User [${i + 1}/${testConversation.length}]: ${message}`
      );
      console.log("-".repeat(70));

      try {
        const start = Date.now();

        // Simulate web API call
        const result = await planner.processRequest(message, "main", 100);

        const time = Date.now() - start;

        if (result.success) {
          console.log(
            `🤖 Assistant: ${
              result.explanation || "(Query executed successfully)"
            }`
          );
          console.log(`📊 Data: ${result.rowCount} rows | ⏱️ ${time}ms`);

          // Show sample data if available
          if (result.rows.length > 0) {
            console.log(
              `📄 Sample: ${JSON.stringify(result.rows[0]).substring(0, 80)}...`
            );
          }

          success++;
        } else {
          console.log(`🤖 Assistant: Sorry, I encountered an error.`);
          console.log(`❌ Error: ${result.error}`);
          failed++;
        }
      } catch (error: any) {
        console.log(`🤖 Assistant: Sorry, something went wrong.`);
        console.log(`❌ Exception: ${error.message}`);
        failed++;
      }
    }

    await db.disconnect();

    // Summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 Web UI Test Results:");
    console.log(
      `   ✅ Successful Interactions: ${success}/${testConversation.length}`
    );
    console.log(
      `   ❌ Failed Interactions: ${failed}/${testConversation.length}`
    );
    console.log(
      `   Success Rate: ${((success / testConversation.length) * 100).toFixed(
        0
      )}%`
    );
    console.log("\n💡 To test the actual Web UI:");
    console.log("   1. Run: npm run web");
    console.log("   2. Open: http://localhost:3000");
    console.log("   3. Chat with the database!\n");
    console.log("✅ Web UI Test Complete!");

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n❌ Test Failed:");
    console.error(error);
    process.exit(1);
  }
}

testWebUI();


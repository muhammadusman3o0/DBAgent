#!/usr/bin/env tsx
/**
 * Terminal/CLI Agent Test
 * Tests interactive terminal mode
 */

import { CONFIG } from "../src/config.js";
import { DatabaseConfig, UnifiedDatabaseClient } from "../src/db-client.js";
import { createLLMClient } from "../src/llm-client.js";
import { QueryPlanner } from "../src/services/query-planner.js";

console.log("🧪 Testing DBAgent as Terminal/CLI Agent\n");
console.log("=".repeat(70));

const testCommands = [
  "help",
  "how many orders do we have?",
  "find customers who spent more than 1000",
  "show me all products",
];

async function testCLI() {
  try {
    // Initialize
    console.log("\n💻 Initializing Terminal Agent...");
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
    console.log(`✅ CLI Mode: Ready`);

    // Simulate terminal session
    console.log("\n⌨️  Simulating Terminal Session:");
    console.log("=".repeat(70));

    let success = 0;
    let failed = 0;

    for (let i = 0; i < testCommands.length; i++) {
      const command = testCommands[i];
      console.log(`\n$ dbagent> ${command}`);
      console.log("-".repeat(70));

      try {
        const start = Date.now();

        // Handle special commands
        if (command === "help") {
          console.log("DBAgent - Natural Language Database Interface");
          console.log("Commands:");
          console.log("  - Ask any question about your data");
          console.log("  - Type 'exit' to quit");
          success++;
          continue;
        }

        // Process as natural language query
        const result = await planner.processRequest(command, "main", 100);
        const time = Date.now() - start;

        if (result.success) {
          if (result.explanation) {
            console.log(result.explanation);
          }
          if (result.rowCount > 0) {
            console.log(`\n📊 ${result.rowCount} row(s) returned`);
            // Show first 3 rows
            const displayRows = result.rows.slice(0, 3);
            displayRows.forEach((row, idx) => {
              console.log(`${idx + 1}. ${JSON.stringify(row)}`);
            });
            if (result.rowCount > 3) {
              console.log(`... and ${result.rowCount - 3} more row(s)`);
            }
          }
          console.log(`⏱️  Query time: ${time}ms`);
          success++;
        } else {
          console.log(`❌ Error: ${result.error}`);
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
    console.log("📊 Terminal Agent Test Results:");
    console.log(`   ✅ Successful Commands: ${success}/${testCommands.length}`);
    console.log(`   ❌ Failed Commands: ${failed}/${testCommands.length}`);
    console.log(
      `   Success Rate: ${((success / testCommands.length) * 100).toFixed(0)}%`
    );
    console.log("\n💡 To test the actual Terminal Agent:");
    console.log("   Run: npm run dev");
    console.log("   Or: npx tsx scripts/interactive-client.ts\n");
    console.log("✅ Terminal Agent Test Complete!");

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n❌ Test Failed:");
    console.error(error);
    process.exit(1);
  }
}

testCLI();


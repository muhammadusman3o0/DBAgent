import { spawn } from "child_process";
import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("🚀 Starting PostgreSQL MCP Interactive Client...\n");

const serverProcess = spawn("node", ["build/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
});

let messageId = 1;

serverProcess.stdout.on("data", (data) => {
  try {
    const response = JSON.parse(data.toString());

    // Extract and display natural language response
    if (response.result?.content) {
      console.log("\n💬 Response:");
      for (const item of response.result.content) {
        if (
          item.type === "text" &&
          item.text &&
          !item.text.includes("Raw Data")
        ) {
          console.log(item.text);
        }
      }
    } else if (response.error) {
      console.log("\n❌ Error:", response.error.message);
    } else {
      console.log("\n📄 Server:", JSON.stringify(response, null, 2));
    }
  } catch (e) {
    const output = data.toString().trim();
    if (
      output &&
      !output.startsWith("[dotenv") &&
      !output.startsWith("Starting") &&
      !output.startsWith("✓")
    ) {
      console.log("\n📄", output);
    }
  }
});

serverProcess.on("close", (code) => {
  console.log(`\n❌ Server process exited with code ${code}`);
  process.exit(code || 0);
});

function sendRequest(method: string, params: any) {
  const request = {
    jsonrpc: "2.0",
    id: messageId++,
    method,
    params,
  };
  serverProcess.stdin.write(JSON.stringify(request) + "\n");
}

async function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  // Initialize
  console.log("📡 Initializing connection...");
  sendRequest("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "interactive-client",
      version: "1.0.0",
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // List available tools
  console.log("\n📋 Listing available tools...");
  sendRequest("tools/list", {});

  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log("\n✨ Ready for queries! Type 'exit' to quit.\n");

  while (true) {
    const query = await prompt("Query> ");

    if (query.toLowerCase() === "exit") {
      console.log("👋 Goodbye!");
      serverProcess.kill();
      rl.close();
      break;
    }

    if (!query.trim()) continue;

    console.log("\n🔍 Sending query...");
    sendRequest("tools/call", {
      name: "query_database",
      arguments: {
        request: query,
        schema: "public",
        maxRows: 100,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

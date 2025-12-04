#!/usr/bin/env tsx
import express from "express";
import { createServer } from "http";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import { fileURLToPath } from "url";
import { CONFIG } from "../src/config.js";
import { DatabaseConfig, UnifiedDatabaseClient } from "../src/db-client.js";
import { createLLMClient } from "../src/llm-client.js";
import { QueryPlanner } from "../src/services/query-planner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer);

const PORT = process.env.WEB_PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// Initialize database and LLM
let db: UnifiedDatabaseClient;
let planner: QueryPlanner;

async function initializeBackend() {
  const dbConfig: DatabaseConfig = {
    type: CONFIG.database.type as any,
    filename: CONFIG.database.sqliteFile,
  };

  db = new UnifiedDatabaseClient(dbConfig);
  await db.connect();

  const llm = createLLMClient();
  planner = new QueryPlanner(db, llm);

  console.log(`✅ Database: ${db.getDatabaseType()}`);
  console.log(`✅ LLM: ${CONFIG.llm.provider}`);
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("chat:message", async (data: { message: string }) => {
    const { message } = data;

    if (!message || !message.trim()) {
      return;
    }

    // Emit user message confirmation
    socket.emit("chat:user-message", { message, timestamp: Date.now() });
    socket.emit("chat:typing", { isTyping: true });

    try {
      const result = await planner.processRequest(message, "main", 100);

      socket.emit("chat:typing", { isTyping: false });

      if (result.success) {
        let response =
          result.explanation || `Query returned ${result.rowCount} row(s)`;

        // If we have data, include it in the response
        if (result.rowCount > 0 && result.rows.length > 0) {
          response += "\n\n📊 **Results:**\n";

          // Get column names from first row
          const columns = Object.keys(result.rows[0]);

          // Show up to 20 rows in a formatted table
          const displayRows = result.rows.slice(0, 20);

          // Create simple text table
          displayRows.forEach((row, idx) => {
            response += `\n${idx + 1}. `;
            const values = columns.map((col) => {
              const val = row[col];
              return `${col}: ${
                val !== null && val !== undefined ? val : "NULL"
              }`;
            });
            response += values.join(", ");
          });

          if (result.rowCount > 20) {
            response += `\n\n... and ${result.rowCount - 20} more row(s)`;
          }

          response += `\n\n**Total:** ${result.rowCount} row(s)`;
        }

        socket.emit("chat:bot-message", {
          message: response,
          timestamp: Date.now(),
        });
      } else {
        socket.emit("chat:error", {
          error: result.error || "Query failed",
        });
      }
    } catch (error: any) {
      socket.emit("chat:typing", { isTyping: false });
      socket.emit("chat:error", {
        error: error.message || "An error occurred",
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down web server...");
  if (db) {
    await db.disconnect();
  }
  httpServer.close(() => {
    process.exit(0);
  });
});

// Start server
initializeBackend()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`🌐 Web Chatbot Server running at http://localhost:${PORT}`);
      console.log(
        `\nOpen http://localhost:${PORT} in your browser to start chatting!\n`
      );
    });
  })
  .catch((error) => {
    console.error("Failed to initialize backend:", error);
    process.exit(1);
  });


import { spawn } from "child_process";
import express from "express";
import { createServer } from "http";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer);

const PORT = process.env.WEB_PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// Store conversation history per session
const conversationHistory = new Map<
  string,
  Array<{
    role: string;
    content: string;
    timestamp: number;
  }>
>();

// MCP server process management
let mcpServerProcess: any = null;
let messageId = 1;

function startMCPServer() {
  if (mcpServerProcess) {
    mcpServerProcess.kill();
  }

  mcpServerProcess = spawn("node", ["build/index.js"], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  mcpServerProcess.on("close", (code: number) => {
    console.error(`MCP server exited with code ${code}`);
    // Restart after a delay
    setTimeout(() => {
      console.log("Restarting MCP server...");
      startMCPServer();
    }, 2000);
  });

  return mcpServerProcess;
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Initialize conversation history for this session
  if (!conversationHistory.has(socket.id)) {
    conversationHistory.set(socket.id, []);
  }

  // Start MCP server if not running
  if (!mcpServerProcess) {
    startMCPServer();
  }

  // Initialize MCP connection
  setTimeout(() => {
    sendMCPRequest(socket, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "web-chatbot",
        version: "1.0.0",
      },
    });
  }, 500);

  // Handle chat messages
  socket.on("chat:message", async (data: { message: string }) => {
    const { message } = data;

    if (!message || !message.trim()) {
      return;
    }

    // Add user message to history
    const history = conversationHistory.get(socket.id) || [];
    history.push({
      role: "user",
      content: message,
      timestamp: Date.now(),
    });
    conversationHistory.set(socket.id, history);

    // Emit user message confirmation
    socket.emit("chat:user-message", { message, timestamp: Date.now() });

    // Send typing indicator
    socket.emit("chat:typing", { isTyping: true });

    // Build context from history
    const context = buildContextFromHistory(history);

    // Send query to MCP server
    sendMCPQuery(socket, message, context);
  });

  // Handle clear history
  socket.on("chat:clear", () => {
    conversationHistory.set(socket.id, []);
    socket.emit("chat:cleared");
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    // Keep history for potential reconnection (cleanup after 1 hour)
    setTimeout(() => {
      conversationHistory.delete(socket.id);
    }, 3600000);
  });
});

function buildContextFromHistory(
  history: Array<{ role: string; content: string }>
) {
  // Include last 10 messages for context
  const recentHistory = history.slice(-10);

  if (recentHistory.length <= 1) {
    return "";
  }

  const contextMessages = recentHistory.slice(0, -1).map((msg) => {
    if (msg.role === "user") {
      return `User asked: "${msg.content}"`;
    } else {
      return `Assistant responded with information about: ${msg.content.slice(
        0,
        100
      )}...`;
    }
  });

  return `Previous conversation context:\n${contextMessages.join(
    "\n"
  )}\n\nCurrent question:`;
}

function sendMCPRequest(socket: any, method: string, params: any) {
  if (!mcpServerProcess) {
    socket.emit("chat:error", { error: "MCP server not running" });
    return;
  }

  const request = {
    jsonrpc: "2.0",
    id: messageId++,
    method,
    params,
  };

  mcpServerProcess.stdin.write(JSON.stringify(request) + "\n");
}

function sendMCPQuery(socket: any, query: string, context: string) {
  if (!mcpServerProcess) {
    socket.emit("chat:error", { error: "MCP server not running" });
    return;
  }

  // Combine context with current query
  const fullRequest = context ? `${context}\n${query}` : query;

  const request = {
    jsonrpc: "2.0",
    id: messageId++,
    method: "tools/call",
    params: {
      name: "query_database",
      arguments: {
        request: fullRequest,
        schema: "public",
        maxRows: 100,
      },
    },
  };

  // Set up response handler
  const responseHandler = (data: Buffer) => {
    try {
      const response = JSON.parse(data.toString());

      if (response.result?.content) {
        let botMessage = "";

        for (const item of response.result.content) {
          if (item.type === "text" && item.text) {
            // Skip raw data sections, focus on natural language response
            if (
              !item.text.includes("Raw Data") &&
              !item.text.includes("```json")
            ) {
              botMessage += item.text + "\n";
            }
          }
        }

        botMessage = botMessage.trim();

        if (botMessage) {
          // Add to conversation history
          const history = conversationHistory.get(socket.id) || [];
          history.push({
            role: "assistant",
            content: botMessage,
            timestamp: Date.now(),
          });
          conversationHistory.set(socket.id, history);

          // Send response to client
          socket.emit("chat:typing", { isTyping: false });
          socket.emit("chat:bot-message", {
            message: botMessage,
            timestamp: Date.now(),
          });
        }

        // Remove this listener after handling
        mcpServerProcess.stdout.off("data", responseHandler);
      } else if (response.error) {
        socket.emit("chat:typing", { isTyping: false });
        socket.emit("chat:error", {
          error: response.error.message || "Query failed",
        });
        mcpServerProcess.stdout.off("data", responseHandler);
      }
    } catch (e) {
      // Ignore parsing errors for non-JSON output (like server logs)
    }
  };

  mcpServerProcess.stdout.on("data", responseHandler);
  mcpServerProcess.stdin.write(JSON.stringify(request) + "\n");

  // Timeout after 30 seconds
  setTimeout(() => {
    mcpServerProcess.stdout.off("data", responseHandler);
    socket.emit("chat:typing", { isTyping: false });
  }, 30000);
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down web server...");
  if (mcpServerProcess) {
    mcpServerProcess.kill();
  }
  httpServer.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  if (mcpServerProcess) {
    mcpServerProcess.kill();
  }
  httpServer.close(() => {
    process.exit(0);
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🌐 Web Chatbot Server running at http://localhost:${PORT}`);
  console.log(`🚀 MCP Server starting...`);
  console.log(`📝 Chat history will be maintained per session`);
  console.log(
    `\nOpen http://localhost:${PORT} in your browser to start chatting!\n`
  );
});


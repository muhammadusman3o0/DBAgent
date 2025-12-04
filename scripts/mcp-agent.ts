import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ToolContent = { type: string; text?: string };

type SchemaIntrospection = {
  schema: string;
  tables: Record<
    string,
    {
      name: string;
      columns: Array<{ name: string; dataType: string }>;
      primaryKeyColumns: string[];
      foreignKeys: Array<{
        column: string;
        referencedTable: string;
        referencedColumn: string;
      }>;
    }
  >;
};

type RespondPayload = {
  summary: string;
  diagnostics: {
    tables: Array<{ name: string; reason: string }>;
    filters: Array<{
      table: string;
      column: string;
      operator: string;
      value: unknown;
    }>;
  };
  query: string;
  params: unknown[];
  limit: number;
  rowCount: number;
  rows: Array<Record<string, unknown>>;
};

function pickTextContent(content: ToolContent[] | undefined): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const texts: string[] = [];
  for (const item of content) {
    if (item && typeof item === "object" && item.type === "text") {
      if (typeof item.text === "string") {
        texts.push(item.text);
      }
    }
  }
  return texts;
}

function formatSchemaSummary(result: SchemaIntrospection): string {
  const tableSummaries = Object.values(result.tables).map((table) => {
    const columnList = table.columns.map((column) => column.name).join(", ");
    const pkList = table.primaryKeyColumns.join(", ") || "(none)";
    const fkList =
      table.foreignKeys
        .map(
          (fk) => `${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}`
        )
        .join(", ") || "(none)";
    return `- ${table.name}\n  Columns: ${columnList}\n  Primary key: ${pkList}\n  Foreign keys: ${fkList}`;
  });

  return `Schema: ${result.schema}\nTables:\n${tableSummaries.join("\n")}`;
}

function logDebug(message: string, details?: unknown): void {
  if (details === undefined) {
    console.log(`[debug] ${message}`);
  } else {
    console.log(`[debug] ${message}`, details);
  }
}

async function renderMindmap(client: Client, schema: string): Promise<void> {
  try {
    logDebug("Calling schema_mindmap", { schema });
    const mindmapResult = await client.callTool({
      name: "schema_mindmap",
      arguments: {
        schema,
      },
    });
    logDebug("schema_mindmap result", mindmapResult);

    const texts = pickTextContent(
      mindmapResult.content as ToolContent[] | undefined
    );
    if (texts.length > 0) {
      console.log(texts[0]);
    } else {
      console.log(mindmapResult);
    }
  } catch (error) {
    console.error("Failed to build schema mindmap:", error);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Set DATABASE_URL before running the MCP agent.");
    process.exit(1);
  }

  const client = new Client({ name: "postgres-mcp-agent", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["./build/index.js"],
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stderr: "inherit",
  });

  const rl = createInterface({ input, output });

  let currentSchema = "public";
  let currentLimit = 100;
  let currentPreview = 3;

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    console.log("Connected to postgres-mcp.");
    console.log(
      "Available tools:",
      tools.tools.map((tool) => tool.name).join(", ")
    );
    console.log(
      "Commands: :exit, :schema [name], :limit [n], :preview [n], :map [schema]"
    );
    console.log(
      "Mindmap output is generated automatically for the active schema."
    );
    console.log("Debug logging is enabled by default.");
    console.log("Enter a natural-language request to query the database.\n");

    await renderMindmap(client, currentSchema);

    for (;;) {
      let promptInput: string;
      try {
        promptInput = await rl.question(
          `schema=${currentSchema} limit=${currentLimit} > `
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("\nReceived interrupt. Exiting.");
          break;
        }
        throw error;
      }

      const line = promptInput.trim();
      if (!line) {
        continue;
      }

      if (line === ":exit" || line === ":quit") {
        break;
      }

      if (line.startsWith(":schema")) {
        const [, schemaArg] = line.split(/\s+/, 2);
        if (schemaArg) {
          currentSchema = schemaArg;
          console.log(`Schema set to ${currentSchema}.`);
          await renderMindmap(client, currentSchema);
        } else {
          console.log(`Current schema: ${currentSchema}`);
        }
        continue;
      }

      if (line.startsWith(":limit")) {
        const [, limitArg] = line.split(/\s+/, 2);
        const parsed = limitArg ? Number.parseInt(limitArg, 10) : NaN;
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 1000) {
          currentLimit = parsed;
          console.log(`Row limit set to ${currentLimit}.`);
        } else {
          console.log("Provide an integer between 1 and 1000.");
        }
        continue;
      }

      if (line.startsWith(":preview")) {
        const [, previewArg] = line.split(/\s+/, 2);
        const parsed = previewArg ? Number.parseInt(previewArg, 10) : NaN;
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 10) {
          currentPreview = parsed;
          console.log(`Preview rows set to ${currentPreview}.`);
        } else {
          console.log("Provide an integer between 1 and 10.");
        }
        continue;
      }

      if (line.startsWith(":map")) {
        const [, schemaArg] = line.split(/\s+/, 2);
        const targetSchema = schemaArg?.length ? schemaArg : currentSchema;
        try {
          logDebug("Calling schema_introspect", {
            schema: targetSchema,
          });
          const introspectResult = await client.callTool({
            name: "schema_introspect",
            arguments: {
              schema: targetSchema,
            },
          });
          logDebug("schema_introspect result", introspectResult);
          const texts = pickTextContent(
            introspectResult.content as ToolContent[] | undefined
          );
          const payloadText = texts.find((text) => text.trim().startsWith("{"));
          if (!payloadText) {
            console.log(
              "Schema introspection did not return JSON. Raw response:"
            );
            console.log(texts.join("\n"));
            continue;
          }
          const parsed = JSON.parse(payloadText) as SchemaIntrospection;
          console.log(formatSchemaSummary(parsed));
        } catch (error) {
          console.error("Failed to load schema map:", error);
        }
        continue;
      }

      try {
        logDebug("Calling respond_to_request", {
          request: line,
          schema: currentSchema,
          limit: currentLimit,
          previewRows: currentPreview,
        });
        const respondResult = await client.callTool({
          name: "respond_to_request",
          arguments: {
            request: line,
            schema: currentSchema,
            limit: currentLimit,
            previewRows: currentPreview,
          },
        });
        logDebug("respond_to_request result", respondResult);

        if ("isError" in respondResult && respondResult.isError) {
          const texts = pickTextContent(
            respondResult.content as ToolContent[] | undefined
          );
          if (texts.length > 0) {
            console.error(texts.join("\n"));
          } else {
            console.error("Tool returned an error without additional context.");
          }
          continue;
        }

        const texts = pickTextContent(
          respondResult.content as ToolContent[] | undefined
        );
        const summary = texts[0];
        const jsonText = texts.find((text) => text !== summary);

        if (summary) {
          console.log("\nSummary:\n" + summary);
        }

        if (jsonText) {
          try {
            JSON.parse(jsonText) as RespondPayload;
          } catch (error) {
            console.warn(
              "Unable to parse structured payload. Raw text:\n",
              jsonText
            );
          }
        }
        console.log("");
      } catch (error) {
        console.error("Request failed:", error);
      }
    }
  } finally {
    rl.close();
    await transport.close();
  }
}

main().catch((error) => {
  console.error("Fatal MCP agent error:", error);
  process.exit(1);
});

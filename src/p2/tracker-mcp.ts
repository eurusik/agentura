import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadTasks, searchTasks } from "./tracker.ts";

/**
 * A minimal MCP server: it advertises tools (name + description + input schema),
 * and Claude Code calls them over stdin/stdout. Read-only on purpose.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = process.env.TRACKER_DIR ?? path.resolve(here, "../../tracker/tasks");

const server = new McpServer({ name: "tracker", version: "0.1.0" });

server.registerTool(
  "search_tasks",
  {
    title: "Search tasks",
    description:
      "Find tasks in the team tracker by label and/or status. Returns id, title, labels and status.",
    inputSchema: {
      label: z.string().optional().describe("Label to filter by, e.g. 'mini-agent'"),
      status: z.enum(["todo", "in_progress", "review", "done"]).optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ label, status }) => {
    const found = searchTasks(await loadTasks(TASKS_DIR), { label, status });
    const lines = found.map((t) => `${t.id} [${t.status}] ${t.title} (labels: ${t.labels.join(", ")})`);
    return { content: [{ type: "text", text: lines.join("\n") || "no tasks found" }] };
  },
);

server.registerTool(
  "get_task",
  {
    title: "Get task",
    description: "Get the full description of one task by its id, e.g. 'T-2'.",
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ id }) => {
    const task = (await loadTasks(TASKS_DIR)).find((t) => t.id === id);
    if (!task) return { content: [{ type: "text", text: `task ${id} not found` }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
// Never console.log here: stdout is the protocol channel. Use console.error for debug output.
console.error(`[tracker-mcp] serving ${TASKS_DIR}`);

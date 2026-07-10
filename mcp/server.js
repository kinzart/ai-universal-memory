// Optional MCP server exposing AI Universal Memory as tools/resources for
// any MCP-capable client (Claude Desktop, Claude Code, etc.). Not required
// for the primary workflow (SessionStart hook + AGENTS.md/CLAUDE.md +
// Skill already work without MCP) — this is an extra integration point.
// Requires @modelcontextprotocol/sdk, imported lazily so the base package
// stays zero-dependency.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { ProjectMemory } from "../src/core.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const memory = new ProjectMemory(process.env.CLAUDE_PROJECT_DIR || process.cwd());

const server = new Server(
  { name: "ai-universal-memory", version: pkg.version },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "memory_brief", description: "Compact, cheap digest of project memory.", inputSchema: { type: "object", properties: {} } },
    { name: "memory_read", description: "Full human-readable memory summary.", inputSchema: { type: "object", properties: {} } },
    {
      name: "memory_log",
      description: "Log an event to project memory.",
      inputSchema: {
        type: "object",
        properties: { summary: { type: "string" }, agent: { type: "string" }, action: { type: "string" }, status: { type: "string" } },
        required: ["summary"]
      }
    },
    {
      name: "memory_decision",
      description: "Record a project decision.",
      inputSchema: { type: "object", properties: { text: { type: "string" }, agent: { type: "string" } }, required: ["text"] }
    },
    {
      name: "memory_todo",
      description: "Record a pending task.",
      inputSchema: { type: "object", properties: { text: { type: "string" }, agent: { type: "string" } }, required: ["text"] }
    },
    {
      name: "memory_risk",
      description: "Record a project risk.",
      inputSchema: { type: "object", properties: { text: { type: "string" }, agent: { type: "string" }, severity: { type: "string" } }, required: ["text"] }
    },
    {
      name: "memory_fact",
      description: "Record a fact with a confidence status.",
      inputSchema: {
        type: "object",
        properties: {
          fact: { type: "string" },
          status: { type: "string", enum: ["confirmed", "probable", "needs_validation"] },
          source: { type: "string" },
          confidence: { type: "number" },
          agent: { type: "string" }
        },
        required: ["fact"]
      }
    },
    { name: "memory_handoff", description: "Regenerate the full handoff document.", inputSchema: { type: "object", properties: {} } },
    {
      name: "memory_todo_done",
      description: "Mark a pending task as done by id.",
      inputSchema: { type: "object", properties: { id: { type: "string" }, agent: { type: "string" } }, required: ["id"] }
    },
    {
      name: "memory_risk_resolve",
      description: "Resolve an open risk by id.",
      inputSchema: { type: "object", properties: { id: { type: "string" }, agent: { type: "string" } }, required: ["id"] }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const a = request.params.arguments || {};
  const text = (t) => ({ content: [{ type: "text", text: t }] });

  switch (name) {
    case "memory_brief": return text(memory.brief());
    case "memory_read": return text(memory.readSummary());
    case "memory_log":
      memory.log({ agent: a.agent || "mcp-agent", action: a.action || "note", status: a.status || "done", summary: a.summary });
      return text("Logged.");
    case "memory_decision": {
      const d = memory.addDecision(a.text, { agent: a.agent || "mcp-agent" });
      return text(d ? "Decision saved." : "Nothing to save — text was empty.");
    }
    case "memory_todo": {
      const t = memory.addTodo(a.text, { agent: a.agent || "mcp-agent" });
      return text(t ? `Todo saved (${t.id}).` : "Nothing to save — text was empty.");
    }
    case "memory_todo_done": {
      const t = memory.completeTodo(a.id, { agent: a.agent || "mcp-agent" });
      return text(t ? `Todo marked done (${t.id}).` : `Todo not found: ${a.id}`);
    }
    case "memory_risk": {
      const r = memory.addRisk(a.text, { agent: a.agent || "mcp-agent", severity: a.severity || "medium" });
      return text(r ? `Risk saved (${r.id}).` : "Nothing to save — text was empty.");
    }
    case "memory_risk_resolve": {
      const r = memory.resolveRisk(a.id, { agent: a.agent || "mcp-agent" });
      return text(r ? `Risk resolved (${r.id}).` : `Risk not found: ${a.id}`);
    }
    case "memory_fact": {
      const f = memory.addFact({ fact: a.fact, status: a.status || "needs_validation", source: a.source || null, confidence: a.confidence ?? 0.5, agent: a.agent || "mcp-agent" });
      return text(f ? "Fact saved." : "Nothing to save — fact was empty.");
    }
    case "memory_handoff":
      return text(memory.generateHandoff());
    default:
      return text("Unknown tool.");
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: "memory://brief", name: "Memory Brief" },
    { uri: "memory://summary", name: "Memory Summary" },
    { uri: "memory://handoff", name: "AI Handoff" }
  ]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const md = (text) => ({ contents: [{ uri, mimeType: "text/markdown", text }] });

  if (uri === "memory://brief") return md(memory.brief());
  if (uri === "memory://summary") return md(memory.readSummary());
  if (uri === "memory://handoff") return md(memory.generateHandoff());
  return { contents: [{ uri, mimeType: "text/plain", text: "Unknown resource." }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);

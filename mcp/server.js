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
import { ProjectMemory } from "../src/core.js";

const memory = new ProjectMemory(process.env.CLAUDE_PROJECT_DIR || process.cwd());

const server = new Server(
  { name: "ai-universal-memory", version: "0.1.0" },
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
    { name: "memory_handoff", description: "Regenerate the full handoff document.", inputSchema: { type: "object", properties: {} } }
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
    case "memory_decision":
      memory.addDecision(a.text, { agent: a.agent || "mcp-agent" });
      return text("Decision saved.");
    case "memory_todo": {
      const t = memory.addTodo(a.text, { agent: a.agent || "mcp-agent" });
      return text(`Todo saved (${t.id}).`);
    }
    case "memory_risk": {
      const r = memory.addRisk(a.text, { agent: a.agent || "mcp-agent", severity: a.severity || "medium" });
      return text(`Risk saved (${r.id}).`);
    }
    case "memory_fact":
      memory.addFact({ fact: a.fact, status: a.status || "needs_validation", source: a.source || null, confidence: a.confidence ?? 0.5, agent: a.agent || "mcp-agent" });
      return text("Fact saved.");
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

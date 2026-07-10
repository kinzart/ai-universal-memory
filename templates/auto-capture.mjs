#!/usr/bin/env node
// AI Universal Memory — PostToolUse auto-capture.
// Reads the hook payload from stdin and appends ONE compact line to
// .memory/events.jsonl. No LLM, no state writes, no derived regeneration,
// no lock — designed to cost ~0ms and never block the agent. Turn-level
// consolidation happens once, in session-stop.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectMemory } from "./engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, "..", "..");

try {
  const memory = new ProjectMemory(root);
  if (!memory.isInitialized()) process.exit(0);
  if (memory.config().auto_capture === false) process.exit(0);

  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const tool = payload.tool_name || "tool";
  const input = payload.tool_input || {};

  let target = input.file_path || input.notebook_path || "";
  if (tool === "Bash") target = (input.command || "").split("\n")[0].slice(0, 80);
  if (target.startsWith(root)) target = target.slice(root.length + 1);

  const summary = target ? `${tool}: ${target}` : tool;

  // Noise control: collapse consecutive identical actions (15 edits on the
  // same file become 1 line).
  const last = memory.lastEvents(1)[0];
  if (last && last.action === "auto" && last.summary === summary) process.exit(0);

  memory.appendEvent({
    time: new Date().toISOString(),
    agent: "claude-code",
    action: "auto",
    status: "done",
    summary,
    session: String(payload.session_id || "").slice(0, 8) || null
  });
} catch {
  // Telemetry must never break the agent.
}
process.exit(0);

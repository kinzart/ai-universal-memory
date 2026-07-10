#!/usr/bin/env node
// AI Universal Memory — Stop hook. Consolidates the turn: if auto-captured
// events exist for this session, writes ONE human-grade summary line (which
// files were touched) and regenerates BRIEF.md + handoff.md exactly once —
// instead of on every single edit.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectMemory } from "./engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, "..", "..");

try {
  const memory = new ProjectMemory(root);
  if (!memory.isInitialized()) process.exit(0);

  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const session = String(payload.session_id || "").slice(0, 8);

  const autos = memory
    .lastEvents(500)
    .filter(e => e.action === "auto" && e.session === session);

  if (autos.length) {
    const files = [...new Set(autos.map(e => e.summary.replace(/^\w+: /, "")))];
    const head = files.slice(0, 5).join(", ");
    const more = files.length > 5 ? ` +${files.length - 5} more` : "";
    memory.log({
      agent: "claude-code",
      action: "note",
      status: "done",
      summary: `Session ${session}: ${autos.length} auto-captured action(s) across ${files.length} target(s) — ${head}${more}`
    });
  } else {
    memory.regenerate();
  }
} catch {
  // Non-fatal by design.
}
process.exit(0);

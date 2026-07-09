#!/usr/bin/env node
// AI Universal Memory — Claude Code SessionStart hook.
// Prints a small, capped digest as additionalContext so every new session
// automatically and obligatorily sees project memory WITHOUT burning tokens
// on the full history. Full history stays opt-in (.memory/events.jsonl).

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ProjectMemory } from "./engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, "..", "..");

function output(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext
    }
  }));
}

try {
  const memory = new ProjectMemory(root);

  if (!memory.isInitialized()) {
    output("AI Universal Memory is not initialized in this project yet. Run: npx ai-universal-memory init");
    process.exit(0);
  }

  const brief = memory.brief();
  output(brief);
} catch (err) {
  // Never fail a session start over a memory hiccup.
  output(`AI Universal Memory hook error (non-fatal): ${err && err.message ? err.message : String(err)}`);
}

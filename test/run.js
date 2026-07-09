#!/usr/bin/env node
// Minimal smoke test, no test framework dependency: exercises the full
// path (init -> log/decision/todo/risk/fact -> installers -> doctor) in a
// throwaway temp directory and asserts the important invariants.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { ProjectMemory } from "../src/core.js";
import { installAll, doctor, mergeBlock } from "../src/installers.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aum-test-"));
console.log(`Using temp project: ${root}`);

function must(cond, msg) {
  assert.ok(cond, msg);
  console.log(`ok - ${msg}`);
}

const memory = new ProjectMemory(root);
must(!memory.isInitialized(), "not initialized before init()");

memory.init({ projectName: "Test Project" });
must(memory.isInitialized(), "initialized after init()");
must(fs.existsSync(path.join(root, ".memory", "BRIEF.md")), "BRIEF.md created");
must(fs.existsSync(path.join(root, ".memory", "handoff.md")), "handoff.md created");

memory.log({ agent: "claude-code", action: "note", summary: "did a thing" });
memory.addDecision("Use file-based memory", { agent: "claude-code" });
const todo = memory.addTodo("write more tests", { agent: "claude-code" });
memory.completeTodo(todo.id, { agent: "claude-code" });
const risk = memory.addRisk("flaky CI", { agent: "claude-code", severity: "low" });
memory.resolveRisk(risk.id, { agent: "claude-code" });
memory.addFact({ fact: "Node >= 18 required", status: "confirmed", source: "package.json", agent: "claude-code" });

const state = JSON.parse(fs.readFileSync(path.join(root, ".memory", "state.json"), "utf8"));
must(state.engines_seen.includes("claude-code"), "engines_seen tracks agent");

const brief = memory.brief();
must(brief.length <= 950, `brief stays capped (${brief.length} chars)`);
must(brief.includes("Test Project"), "brief mentions project name");

const events = memory.lastEvents(100);
must(events.length >= 6, `events recorded (${events.length})`);

// installers: idempotent block merge
installAll(root, { engines: ["claude", "agents", "cursor"] });
const agentsMdOnce = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
installAll(root, { engines: ["claude", "agents", "cursor"] });
const agentsMdTwice = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
must(
  (agentsMdTwice.match(/ai-universal-memory:start/g) || []).length === 1,
  "AGENTS.md block merge is idempotent (no duplicate blocks)"
);
must(agentsMdOnce.length > 0, "AGENTS.md non-empty after install");

must(fs.existsSync(path.join(root, ".memory", "tools", "engine.mjs")), "engine vendored");
must(fs.existsSync(path.join(root, ".claude", "skills", "ai-universal-memory", "SKILL.md")), "skill installed");

const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude", "settings.json"), "utf8"));
must(
  settings.hooks.SessionStart.some(g => g.hooks.some(h => h.command.includes("session-start.mjs"))),
  "SessionStart hook wired"
);

const checks = doctor(root);
const failed = checks.filter(c => !c.ok);
must(failed.length === 0, `doctor reports all green (${failed.map(f => f.name).join(", ") || "none failed"})`);

// mergeBlock preserves unrelated content
const custom = path.join(root, "CUSTOM.md");
fs.writeFileSync(custom, "# My notes\n\nSomething important I wrote.\n");
mergeBlock(custom, "<!-- ai-universal-memory:start -->\ninjected\n<!-- ai-universal-memory:end -->");
const customContent = fs.readFileSync(custom, "utf8");
must(customContent.includes("Something important I wrote."), "mergeBlock preserves existing content");
must(customContent.includes("injected"), "mergeBlock adds the block");

fs.rmSync(root, { recursive: true, force: true });
console.log("\nAll good.");

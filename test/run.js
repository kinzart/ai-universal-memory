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
import { runBootstrap } from "../templates/bootstrap.mjs";

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

// --- bootstrap scan: a fresh init should never leave memory truly empty ---

const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "aum-test-bootstrap-"));
fs.writeFileSync(path.join(root2, "package.json"), JSON.stringify({
  name: "demo-app",
  version: "1.2.3",
  description: "A demo app used only for testing the bootstrap scan.",
  scripts: { build: "tsc", test: "node test.js" }
}, null, 2));
fs.writeFileSync(path.join(root2, "README.md"), "# Demo App\n\nThis app does the thing it's supposed to do, reliably.\n");
fs.mkdirSync(path.join(root2, "nested-app"), { recursive: true });
fs.writeFileSync(path.join(root2, "nested-app", "package.json"), JSON.stringify({ name: "nested-app" }, null, 2));

const memory2 = new ProjectMemory(root2);
memory2.init({ projectName: "Bootstrap Test" });
runBootstrap(memory2, root2);

const facts2 = JSON.parse(fs.readFileSync(path.join(root2, ".memory", "facts.json"), "utf8"));
const allFacts = [...facts2.confirmed, ...facts2.probable, ...facts2.needs_validation].map(f => f.fact);

must(allFacts.some(f => f.includes("demo-app@1.2.3")), "bootstrap captured root package.json name/version");
must(allFacts.some(f => f.includes("build") && f.includes("test")), "bootstrap captured npm scripts");
must(allFacts.some(f => f.includes("does the thing it's supposed to do")), "bootstrap captured README description");
must(allFacts.some(f => f.includes("nested-app/package.json")), "bootstrap flagged the extra nested package.json");
must(allFacts.some(f => f.toLowerCase().includes("no .git directory")), "bootstrap noted the missing git repo");

const brief2 = memory2.brief();
must(brief2.length <= 950, `bootstrapped brief still stays capped (${brief2.length} chars)`);

fs.rmSync(root2, { recursive: true, force: true });

console.log("\nAll good.");

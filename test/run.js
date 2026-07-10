// AI Universal Memory — test suite. Zero test-framework dependency:
// uses Node's built-in test runner. Run with: node --test test/
// or: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { ProjectMemory } from "../src/core.js";
import { installAll, doctor, mergeBlock, installClaudeHook } from "../src/installers.js";
import { runBootstrap } from "../templates/bootstrap.mjs";

const BIN = path.resolve("bin/aum.js");

function tmpProject(name = "aum-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// --- core engine ------------------------------------------------------------

test("init creates the expected .memory/ files", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  assert.equal(m.isInitialized(), false);
  m.init({ projectName: "Test Project" });
  assert.equal(m.isInitialized(), true);
  for (const f of ["BRIEF.md", "handoff.md", "state.json", "facts.json", "events.jsonl", "config.json", ".gitignore"]) {
    assert.ok(fs.existsSync(path.join(root, ".memory", f)), `${f} should exist`);
  }
});

test("init is idempotent and never wipes existing data", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  m.addTodo("keep me", { agent: "test" });
  m.init(); // re-run
  const todos = readJson(path.join(root, ".memory", "todo.json"));
  assert.equal(todos.length, 1);
  assert.equal(todos[0].text, "keep me");
});

test("completeTodo and resolveRisk return null on an unknown id", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  assert.equal(m.completeTodo("nope"), null);
  assert.equal(m.resolveRisk("nope"), null);
});

test("addDecision/addTodo/addRisk/addFact return null on empty input", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  assert.equal(m.addDecision(""), null);
  assert.equal(m.addTodo(""), null);
  assert.equal(m.addRisk(""), null);
  assert.equal(m.addFact({ fact: "" }), null);
});

test("registrars (fact/todo/risk/decision) do not clobber last_summary", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  m.log({ agent: "t", action: "note", summary: "real work happened" });
  m.addFact({ fact: "sky is blue", status: "confirmed", agent: "t" });
  m.addDecision("use JWT", { agent: "t" });
  m.addTodo("ship it", { agent: "t" });
  const state = readJson(path.join(root, ".memory", "state.json"));
  assert.equal(state.last_summary, "real work happened");
});

test("engines_seen tracks distinct agents across mutators", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  m.log({ agent: "claude-code", summary: "did a thing" });
  m.addDecision("use file-based memory", { agent: "codex" });
  const state = readJson(path.join(root, ".memory", "state.json"));
  assert.ok(state.engines_seen.includes("claude-code"));
  assert.ok(state.engines_seen.includes("codex"));
});

test("brief respects brief_max_chars even with heavy input", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  for (let i = 0; i < 30; i++) m.log({ agent: "t", summary: "x".repeat(200) });
  assert.ok(Array.from(m.brief()).length <= 900);
});

test("truncate never mangles multi-byte code points (emoji stay intact)", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  const emoji = "🎉".repeat(500) + " end";
  m.log({ agent: "t", summary: emoji });
  const brief = m.brief();
  // every codepoint that appears must be a full, valid emoji — no lone surrogates
  assert.ok(!/�/.test(brief), "no replacement character from a broken surrogate pair");
});

test("search finds facts, decisions, todos and events", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  m.addDecision("Use JWT over sessions", { agent: "t" });
  m.addFact({ fact: "JWT secret lives in env", status: "confirmed", agent: "t" });
  const hits = m.search("jwt");
  assert.ok(hits.length >= 2);
  assert.ok(hits.some(h => h.kind === "decision"));
  assert.ok(hits.some(h => h.kind.startsWith("fact:")));
});

test("search returns nothing for an empty term rather than everything", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  m.addDecision("something", { agent: "t" });
  assert.deepEqual(m.search(""), []);
});

test("compact rotates old events into snapshots/ without deleting them", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  for (let i = 0; i < 10; i++) m.log({ agent: "t", summary: `evt ${i}` });
  const before = m.lastEvents(1000).length;
  const { rotated, kept } = m.compact({ keep: 2 });
  assert.equal(kept, 2);
  assert.equal(rotated, before - 2);
  assert.equal(m.lastEvents(1000).length, 2);
  const snapshots = fs.readdirSync(path.join(root, ".memory", "snapshots"));
  assert.ok(snapshots.some(f => f.endsWith(".jsonl")));
});

test("20 concurrent writers (separate processes) lose nothing and leave valid JSON", async () => {
  const root = tmpProject();
  new ProjectMemory(root).init();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      new Promise((res, rej) =>
        execFile("node", [BIN, "log", `evt ${i}`, "--agent", `a${i}`, "--path", root],
          (err) => (err ? rej(err) : res()))
      )
    )
  );
  const lines = fs.readFileSync(path.join(root, ".memory", "events.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.filter(l => l.includes('"summary":"evt ')).length, 20);
  const state = readJson(path.join(root, ".memory", "state.json")); // must parse cleanly
  assert.equal(new Set(state.engines_seen).size, state.engines_seen.length); // no dupes
  for (let i = 0; i < 20; i++) assert.ok(state.engines_seen.includes(`a${i}`), `a${i} present`);
});

// --- bootstrap scan -----------------------------------------------------

test("bootstrap scan seeds real facts on a fresh project", () => {
  const root = tmpProject("aum-test-bootstrap-");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: "demo-app",
    version: "1.2.3",
    description: "A demo app used only for testing the bootstrap scan.",
    scripts: { build: "tsc", test: "node test.js" }
  }, null, 2));
  fs.writeFileSync(path.join(root, "README.md"), "# Demo App\n\nThis app does the thing it's supposed to do, reliably.\n");
  fs.mkdirSync(path.join(root, "nested-app"));
  fs.writeFileSync(path.join(root, "nested-app", "package.json"), JSON.stringify({ name: "nested-app" }, null, 2));

  const m = new ProjectMemory(root);
  m.init({ projectName: "Bootstrap Test" });
  runBootstrap(m, root);

  const facts = readJson(path.join(root, ".memory", "facts.json"));
  const all = [...facts.confirmed, ...facts.probable, ...facts.needs_validation].map(f => f.fact);

  assert.ok(all.some(f => f.includes("demo-app@1.2.3")));
  assert.ok(all.some(f => f.includes("build") && f.includes("test")));
  assert.ok(all.some(f => f.includes("does the thing it's supposed to do")));
  assert.ok(all.some(f => f.includes("nested-app/package.json")));
  assert.ok(all.some(f => f.toLowerCase().includes("no .git directory")));
  assert.ok(Array.from(m.brief()).length <= 900);
});

test("bootstrap scan flags a .git directory that isn't a real repo", () => {
  const root = tmpProject("aum-test-brokengit-");
  fs.mkdirSync(path.join(root, ".git"));
  const m = new ProjectMemory(root);
  m.init();
  runBootstrap(m, root);
  const risks = readJson(path.join(root, ".memory", "risks.json"));
  assert.ok(risks.some(r => r.text.includes("not a valid, initialized git repository")));
});

// --- installers ---------------------------------------------------------

test("mergeBlock preserves existing content and replaces only the marked block", () => {
  const root = tmpProject();
  const f = path.join(root, "CLAUDE.md");
  fs.writeFileSync(f, "# My rules\nkeep this\n");
  mergeBlock(f, "<!-- ai-universal-memory:start -->\nv1\n<!-- ai-universal-memory:end -->");
  mergeBlock(f, "<!-- ai-universal-memory:start -->\nv2\n<!-- ai-universal-memory:end -->");
  const out = fs.readFileSync(f, "utf8");
  assert.ok(out.includes("keep this"));
  assert.ok(out.includes("v2"));
  assert.ok(!out.includes("v1"));
});

test("installAll block merge is idempotent — no duplicate blocks on re-install", () => {
  const root = tmpProject();
  new ProjectMemory(root).init();
  installAll(root, { engines: ["claude", "agents", "cursor"] });
  installAll(root, { engines: ["claude", "agents", "cursor"] });
  const agentsMd = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.equal((agentsMd.match(/ai-universal-memory:start/g) || []).length, 1);
});

test("claude hook uses $CLAUDE_PROJECT_DIR, never an absolute path", () => {
  const root = tmpProject();
  installClaudeHook(root);
  const settings = readJson(path.join(root, ".claude", "settings.json"));
  const cmd = settings.hooks.SessionStart[0].hooks[0].command;
  assert.ok(cmd.includes("$CLAUDE_PROJECT_DIR"));
  assert.ok(!cmd.includes(root));
});

test("re-installing migrates an old absolute-path hook to the portable form", () => {
  const root = tmpProject();
  new ProjectMemory(root).init();
  const settingsPath = path.join(root, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: `node "${root}/.memory/tools/session-start.mjs"` }] }] }
  }, null, 2));
  installClaudeHook(root);
  const settings = readJson(settingsPath);
  const cmd = settings.hooks.SessionStart[0].hooks[0].command;
  assert.ok(cmd.includes("$CLAUDE_PROJECT_DIR"));
  assert.ok(!cmd.includes(root));
});

test("doctor reports all green after a full install", () => {
  const root = tmpProject();
  new ProjectMemory(root).init();
  installAll(root, { engines: ["claude", "agents", "cursor"] });
  const checks = doctor(root);
  const failed = checks.filter(c => !c.ok);
  assert.deepEqual(failed, []);
});

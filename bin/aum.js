#!/usr/bin/env node
// AI Universal Memory — CLI. Bootstraps and manages `.memory/` in any
// project so any AI engine (or human) can read/write persistent, portable
// project memory. Run via `npx ai-universal-memory <command>` or, once
// installed, `aum <command>`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PACKAGE_ROOT,
  installAll,
  doctor as runDoctor
} from "../src/installers.js";
import { runBootstrap } from "../templates/bootstrap.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function flag(name, fallback = null) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function textFromArgs(start = 1) {
  const out = [];
  for (let i = start; i < args.length; i++) {
    if (args[i].startsWith("--")) { i++; continue; }
    out.push(args[i]);
  }
  return out.join(" ").trim();
}

const root = path.resolve(flag("--path", process.cwd()));
const cmd = args[0] || "help";

function pkgVersion() {
  try {
    const raw = fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8");
    return JSON.parse(raw).version;
  } catch {
    return "0.0.0";
  }
}

async function loadEngineClass() {
  const localEngine = path.join(root, ".memory", "tools", "engine.mjs");
  if (fs.existsSync(localEngine)) {
    const mod = await import(pathToFileURL(localEngine).href);
    return mod.ProjectMemory;
  }
  const mod = await import("../src/core.js");
  return mod.ProjectMemory;
}

function parseEngines() {
  const raw = flag("--engines", "claude,agents,cursor");
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function help() {
  console.log(`AI Universal Memory v${pkgVersion()}

Portable project memory for any AI engine or human. Zero-dependency data
layer, vendored into every project so it keeps working without this
package installed.

  npx ai-universal-memory init [--engines claude,agents,cursor] [--name X] [--no-scan]
      Create .memory/ and wire up the requested engines. Safe to re-run.
      On first init, also scans the project (package.json, README, top-level
      structure, git status — all local, no network) and seeds real facts
      so the memory isn't empty on day one. Use --no-scan to skip that.

  npx ai-universal-memory install [--engines claude,agents,cursor]
      (Re)install engine integrations without touching existing data.

  npx ai-universal-memory doctor
      Check what's installed and report anything missing.

  npx ai-universal-memory brief
      Print the compact digest (what gets auto-injected at session start).

  npx ai-universal-memory read
      Print the full human-readable summary.

  npx ai-universal-memory context
      Print .memory/README.md — the instructions for any AI or human.

  npx ai-universal-memory log "what happened" --agent "claude-code"
  npx ai-universal-memory decision "decision text" --agent "claude-code"
  npx ai-universal-memory todo "todo text" --agent "claude-code"
  npx ai-universal-memory todo-done <id>
  npx ai-universal-memory risk "risk text" --severity medium --agent "..."
  npx ai-universal-memory risk-resolve <id>
  npx ai-universal-memory fact "fact text" --status confirmed --source "..." --agent "..."
  npx ai-universal-memory handoff
  npx ai-universal-memory last [n]
  npx ai-universal-memory search "term" [--limit 25]
      Search events, facts, decisions, todos and risks for a term.
  npx ai-universal-memory compact [--keep 200]
      Rotate old events.jsonl entries into .memory/snapshots/ (nothing
      is deleted, just moved out of the way — still auditable).

  npx ai-universal-memory mcp
      Start an MCP server exposing memory as tools/resources (requires
      @modelcontextprotocol/sdk — installed on demand if missing).

All commands accept --path <dir> to target a project other than the
current directory.
`);
}

async function main() {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") return help();
  if (cmd === "version" || cmd === "--version" || cmd === "-v") return console.log(pkgVersion());

  if (cmd === "init") {
    const ProjectMemory = (await import("../src/core.js")).ProjectMemory;
    const memory = new ProjectMemory(root);
    const alreadyInitialized = memory.isInitialized();
    memory.init({ projectName: flag("--name") });

    let scanned = false;
    if (!alreadyInitialized && !hasFlag("--no-scan")) {
      try {
        runBootstrap(memory, root);
        scanned = true;
      } catch (err) {
        console.error(`(non-fatal) project scan failed: ${err && err.message ? err.message : err}`);
      }
    }

    const results = installAll(root, { engines: parseEngines() });
    console.log(`${alreadyInitialized ? "Memory already existed — re-synced" : "Memory initialized"} in ${path.join(root, ".memory")}`);
    console.log("Installed:", Object.keys(results).filter(k => results[k]).join(", "));
    if (scanned) console.log("Scanned the project (package.json, README, structure, git) and seeded initial facts — see: npx ai-universal-memory read");
    console.log("\nNext: open this project in Claude Code — memory loads automatically.");
    console.log("Or run: npx ai-universal-memory read");
    return;
  }

  if (cmd === "install") {
    const engines = parseEngines();
    const results = installAll(root, { engines });
    console.log("Installed:", Object.keys(results).filter(k => results[k]).join(", "));
    return;
  }

  if (cmd === "doctor") {
    const checks = runDoctor(root);
    let allOk = true;
    for (const c of checks) {
      console.log(`${c.ok ? "✅" : "❌"} ${c.name}`);
      if (!c.ok) allOk = false;
    }
    if (!allOk) {
      if (hasFlag("--fix")) {
        console.log("\nFixing missing pieces...");
        installAll(root, { engines: parseEngines() });
        console.log("Re-run doctor to confirm.");
      } else {
        console.log("\nSome pieces are missing. Run: npx ai-universal-memory install   (or add --fix here)");
      }
    } else {
      console.log("\nAll good.");
    }
    return;
  }

  const ProjectMemory = await loadEngineClass();
  const memory = new ProjectMemory(root);

  if (cmd !== "context" && !memory.isInitialized()) {
    console.error(`Memory not initialized in ${root}. Run: npx ai-universal-memory init`);
    process.exit(1);
  }

  switch (cmd) {
    case "read":
      console.log(memory.readSummary());
      break;
    case "brief":
      console.log(memory.brief());
      break;
    case "context": {
      const p = fs.existsSync(path.join(root, ".memory", "README.md"))
        ? path.join(root, ".memory", "README.md")
        : path.join(PACKAGE_ROOT, "templates", "memory-readme.md");
      console.log(fs.readFileSync(p, "utf8"));
      break;
    }
    case "log": {
      const summary = textFromArgs();
      if (!summary) { console.error("Nothing to log — pass a summary: aum log \"what happened\""); process.exit(1); }
      memory.log({ agent: flag("--agent", "unknown"), action: flag("--action", "note"), status: flag("--status", "done"), summary });
      console.log("Logged.");
      break;
    }
    case "decision": {
      const d = memory.addDecision(textFromArgs(), { agent: flag("--agent", "unknown") });
      if (!d) { console.error("Nothing to save — pass decision text: aum decision \"...\""); process.exit(1); }
      console.log("Decision saved.");
      break;
    }
    case "todo": {
      const t = memory.addTodo(textFromArgs(), { agent: flag("--agent", "unknown") });
      if (!t) { console.error("Nothing to save — pass todo text: aum todo \"...\""); process.exit(1); }
      console.log(`Todo saved (${t.id}).`);
      break;
    }
    case "todo-done": {
      const t = memory.completeTodo(args[1], { agent: flag("--agent", "unknown") });
      if (!t) {
        console.error(`Todo not found: ${args[1] || "(no id given)"}. Run: brief or read to see ids.`);
        process.exit(1);
      }
      console.log(`Todo marked done (${t.id}).`);
      break;
    }
    case "risk": {
      const r = memory.addRisk(textFromArgs(), { agent: flag("--agent", "unknown"), severity: flag("--severity", "medium") });
      if (!r) { console.error("Nothing to save — pass risk text: aum risk \"...\""); process.exit(1); }
      console.log(`Risk saved (${r.id}).`);
      break;
    }
    case "risk-resolve": {
      const r = memory.resolveRisk(args[1], { agent: flag("--agent", "unknown") });
      if (!r) {
        console.error(`Risk not found: ${args[1] || "(no id given)"}. Run: brief or read to see ids.`);
        process.exit(1);
      }
      console.log(`Risk resolved (${r.id}).`);
      break;
    }
    case "fact": {
      const f = memory.addFact({ fact: textFromArgs(), status: flag("--status", "needs_validation"), source: flag("--source", null), confidence: Number(flag("--confidence", "0.5")), agent: flag("--agent", "unknown") });
      if (!f) { console.error("Nothing to save — pass fact text: aum fact \"...\""); process.exit(1); }
      console.log("Fact saved.");
      break;
    }
    case "handoff":
      memory.generateHandoff();
      console.log("Handoff updated: .memory/handoff.md");
      break;
    case "last":
      console.log(memory.lastEvents(Number(args[1] || 30)).map(e => JSON.stringify(e)).join("\n"));
      break;
    case "search": {
      const term = textFromArgs();
      const results = memory.search(term, { limit: Number(flag("--limit", "25")) });
      if (!results.length) {
        console.log(`No matches for "${term}".`);
        break;
      }
      for (const r of results) {
        const id = r.id ? ` (${r.id})` : "";
        console.log(`[${r.kind}]${id} ${String(r.time).slice(0, 16)} ${r.agent} — ${r.text}`);
      }
      break;
    }
    case "compact": {
      const { rotated, kept } = memory.compact({ keep: Number(flag("--keep", "200")) });
      console.log(`Rotated ${rotated} event(s) to .memory/snapshots/, kept ${kept}.`);
      break;
    }
    case "mcp": {
      try {
        await import("../mcp/server.js");
      } catch (err) {
        console.error("MCP server needs @modelcontextprotocol/sdk. Install it with:");
        console.error("  npm i @modelcontextprotocol/sdk");
        console.error(String(err && err.message ? err.message : err));
        process.exit(1);
      }
      break;
    }
    default:
      console.log(`Unknown command: ${cmd}\n`);
      help();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

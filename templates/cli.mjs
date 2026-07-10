#!/usr/bin/env node
// AI Universal Memory — vendored local CLI.
// Lives inside .memory/tools/ so it keeps working forever, even without
// the npm package installed or internet access. Talks to engine.mjs only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectMemory } from "./engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// project root = two levels up from .memory/tools/
const root = path.resolve(__dirname, "..", "..");

const args = process.argv.slice(2);
const cmd = args[0] || "help";

function arg(name, fallback = null) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

function textFromArgs(start = 1) {
  const out = [];
  for (let i = start; i < args.length; i++) {
    if (args[i].startsWith("--")) { i++; continue; }
    out.push(args[i]);
  }
  return out.join(" ").trim();
}

const memory = new ProjectMemory(root);

function help() {
  console.log(`AI Universal Memory (local)

  node .memory/tools/cli.mjs read              full human summary
  node .memory/tools/cli.mjs brief             compact digest (what gets auto-injected)
  node .memory/tools/cli.mjs log "text" --agent "name"
  node .memory/tools/cli.mjs decision "text" --agent "name"
  node .memory/tools/cli.mjs todo "text" --agent "name"
  node .memory/tools/cli.mjs todo-done <id>
  node .memory/tools/cli.mjs risk "text" --agent "name" --severity medium
  node .memory/tools/cli.mjs risk-resolve <id>
  node .memory/tools/cli.mjs fact "text" --status confirmed --source "..." --agent "name"
  node .memory/tools/cli.mjs handoff            regenerate handoff.md
  node .memory/tools/cli.mjs last [n]
  node .memory/tools/cli.mjs search "term" [--limit 25]
  node .memory/tools/cli.mjs compact [--keep 200]
  node .memory/tools/cli.mjs auto on|off|status
`);
}

async function main() {
  if (!memory.isInitialized() && cmd !== "help") {
    console.error("Memory not initialized in this project. Run: npx ai-universal-memory init");
    process.exit(1);
  }

  switch (cmd) {
    case "help":
      help();
      break;
    case "read":
      console.log(memory.readSummary());
      break;
    case "brief":
      console.log(memory.brief());
      break;
    case "log": {
      const summary = textFromArgs();
      if (!summary) { console.error("Nothing to log — pass a summary: cli.mjs log \"what happened\""); process.exit(1); }
      memory.log({ agent: arg("--agent", "unknown"), action: arg("--action", "note"), status: arg("--status", "done"), summary });
      console.log("Logged.");
      break;
    }
    case "decision": {
      const d = memory.addDecision(textFromArgs(), { agent: arg("--agent", "unknown") });
      if (!d) { console.error("Nothing to save — pass decision text: cli.mjs decision \"...\""); process.exit(1); }
      console.log("Decision saved.");
      break;
    }
    case "todo": {
      const t = memory.addTodo(textFromArgs(), { agent: arg("--agent", "unknown") });
      if (!t) { console.error("Nothing to save — pass todo text: cli.mjs todo \"...\""); process.exit(1); }
      console.log(`Todo saved (${t.id}).`);
      break;
    }
    case "todo-done": {
      const t = memory.completeTodo(args[1], { agent: arg("--agent", "unknown") });
      if (!t) {
        console.error(`Todo not found: ${args[1] || "(no id given)"}. Run: brief or read to see ids.`);
        process.exit(1);
      }
      console.log(`Todo marked done (${t.id}).`);
      break;
    }
    case "risk": {
      const r = memory.addRisk(textFromArgs(), { agent: arg("--agent", "unknown"), severity: arg("--severity", "medium") });
      if (!r) { console.error("Nothing to save — pass risk text: cli.mjs risk \"...\""); process.exit(1); }
      console.log(`Risk saved (${r.id}).`);
      break;
    }
    case "risk-resolve": {
      const r = memory.resolveRisk(args[1], { agent: arg("--agent", "unknown") });
      if (!r) {
        console.error(`Risk not found: ${args[1] || "(no id given)"}. Run: brief or read to see ids.`);
        process.exit(1);
      }
      console.log(`Risk resolved (${r.id}).`);
      break;
    }
    case "fact": {
      const f = memory.addFact({ fact: textFromArgs(), status: arg("--status", "needs_validation"), source: arg("--source", null), confidence: Number(arg("--confidence", "0.5")), agent: arg("--agent", "unknown") });
      if (!f) { console.error("Nothing to save — pass fact text: cli.mjs fact \"...\""); process.exit(1); }
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
      const results = memory.search(term, { limit: Number(arg("--limit", "25")) });
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
      const { rotated, kept } = memory.compact({ keep: Number(arg("--keep", "200")) });
      console.log(`Rotated ${rotated} event(s) to .memory/snapshots/, kept ${kept}.`);
      break;
    }
    case "auto": {
      const mode = (args[1] || "").toLowerCase();
      if (!["on", "off", "status"].includes(mode)) {
        console.error("Usage: cli.mjs auto on|off|status");
        process.exit(1);
      }
      const cfgPath = path.join(root, ".memory", "config.json");
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      if (mode === "status") {
        console.log(`auto_capture: ${cfg.auto_capture !== false}`);
        break;
      }
      cfg.auto_capture = mode === "on";
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
      console.log(`auto_capture set to ${cfg.auto_capture}.`);
      break;
    }
    default:
      console.log(`Unknown command: ${cmd}`);
      help();
  }
}

main();

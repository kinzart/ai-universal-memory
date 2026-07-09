#!/usr/bin/env node
// AI Universal Memory — vendored local CLI.
// Lives inside .memory/tools/ so it keeps working forever, even without
// the npm package installed or internet access. Talks to engine.mjs only.

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
    case "log":
      memory.log({ agent: arg("--agent", "unknown"), action: arg("--action", "note"), status: arg("--status", "done"), summary: textFromArgs() });
      console.log("Logged.");
      break;
    case "decision":
      memory.addDecision(textFromArgs(), { agent: arg("--agent", "unknown") });
      console.log("Decision saved.");
      break;
    case "todo":
      { const t = memory.addTodo(textFromArgs(), { agent: arg("--agent", "unknown") }); console.log(`Todo saved (${t.id}).`); }
      break;
    case "todo-done":
      memory.completeTodo(args[1], { agent: arg("--agent", "unknown") });
      console.log("Todo marked done.");
      break;
    case "risk":
      { const r = memory.addRisk(textFromArgs(), { agent: arg("--agent", "unknown"), severity: arg("--severity", "medium") }); console.log(`Risk saved (${r.id}).`); }
      break;
    case "risk-resolve":
      memory.resolveRisk(args[1], { agent: arg("--agent", "unknown") });
      console.log("Risk resolved.");
      break;
    case "fact":
      memory.addFact({ fact: textFromArgs(), status: arg("--status", "needs_validation"), source: arg("--source", null), confidence: Number(arg("--confidence", "0.5")), agent: arg("--agent", "unknown") });
      console.log("Fact saved.");
      break;
    case "handoff":
      memory.generateHandoff();
      console.log("Handoff updated: .memory/handoff.md");
      break;
    case "last":
      console.log(memory.lastEvents(Number(args[1] || 30)).map(e => JSON.stringify(e)).join("\n"));
      break;
    default:
      console.log(`Unknown command: ${cmd}`);
      help();
  }
}

main();

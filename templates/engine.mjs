// AI Universal Memory — core engine.
// Zero dependencies. Pure Node fs/path. Vendored into every project's
// .memory/tools/ folder so memory keeps working even without the npm
// package installed, offline, forever, across any AI engine or human.

import fs from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = 1;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(file) {
  return fs.existsSync(file);
}

function read(file, fallback = "") {
  if (!exists(file)) return fallback;
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, "utf8");
}

function readJson(file, fallback) {
  try {
    if (!exists(file)) return fallback;
    const raw = read(file);
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  write(file, JSON.stringify(data, null, 2) + "\n");
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function truncate(str, max) {
  if (!str) return "";
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}

export class ProjectMemory {
  constructor(root = process.cwd()) {
    this.root = root;
    this.dir = path.join(root, ".memory");
    this.eventsFile = path.join(this.dir, "events.jsonl");
    this.stateFile = path.join(this.dir, "state.json");
    this.factsFile = path.join(this.dir, "facts.json");
    this.decisionsJsonFile = path.join(this.dir, "decisions.json");
    this.decisionsMdFile = path.join(this.dir, "decisions.md");
    this.todoJsonFile = path.join(this.dir, "todo.json");
    this.todoMdFile = path.join(this.dir, "todo.md");
    this.risksJsonFile = path.join(this.dir, "risks.json");
    this.risksMdFile = path.join(this.dir, "risks.md");
    this.handoffFile = path.join(this.dir, "handoff.md");
    this.briefFile = path.join(this.dir, "BRIEF.md");
    this.configFile = path.join(this.dir, "config.json");
    this.evidenceDir = path.join(this.dir, "evidence");
    this.snapshotsDir = path.join(this.dir, "snapshots");
  }

  isInitialized() {
    return exists(this.stateFile);
  }

  config() {
    return readJson(this.configFile, {
      schema_version: SCHEMA_VERSION,
      project_name: path.basename(this.root),
      created_at: new Date().toISOString(),
      brief_max_chars: 900,
      brief_max_events: 5,
      brief_max_pending: 5,
      brief_max_risks: 3
    });
  }

  init({ projectName } = {}) {
    ensureDir(this.dir);
    ensureDir(this.evidenceDir);
    ensureDir(this.snapshotsDir);

    if (!exists(this.configFile)) {
      writeJson(this.configFile, {
        schema_version: SCHEMA_VERSION,
        project_name: projectName || path.basename(this.root),
        created_at: new Date().toISOString(),
        brief_max_chars: 900,
        brief_max_events: 5,
        brief_max_pending: 5,
        brief_max_risks: 3
      });
    }

    if (!exists(this.stateFile)) {
      writeJson(this.stateFile, {
        status: "initialized",
        current_phase: "setup",
        last_agent: null,
        last_action: "init",
        last_summary: "Project memory initialized.",
        last_updated: new Date().toISOString(),
        engines_seen: []
      });
    }

    if (!exists(this.factsFile)) {
      writeJson(this.factsFile, { confirmed: [], probable: [], needs_validation: [] });
    }
    if (!exists(this.decisionsJsonFile)) writeJson(this.decisionsJsonFile, []);
    if (!exists(this.todoJsonFile)) writeJson(this.todoJsonFile, []);
    if (!exists(this.risksJsonFile)) writeJson(this.risksJsonFile, []);
    if (!exists(this.eventsFile)) write(this.eventsFile, "");
    if (!exists(this.decisionsMdFile)) write(this.decisionsMdFile, "# Decisions\n\n");
    if (!exists(this.todoMdFile)) write(this.todoMdFile, "# Todo\n\n");
    if (!exists(this.risksMdFile)) write(this.risksMdFile, "# Risks\n\n");

    const isFirstInit = !exists(this.handoffFile);
    if (isFirstInit) {
      this.log({
        agent: "ai-universal-memory",
        action: "init",
        status: "done",
        summary: "Project memory initialized."
      });
    } else {
      this._regenerateDerived();
    }
  }

  // ---- events / state ----------------------------------------------------

  log({ agent = "unknown", action = "note", status = "done", summary = "", next = [], error = null }) {
    ensureDir(this.dir);

    const event = {
      time: new Date().toISOString(),
      agent,
      action,
      status,
      summary,
      next,
      error
    };

    fs.appendFileSync(this.eventsFile, JSON.stringify(event) + "\n", "utf8");

    const state = readJson(this.stateFile, {});
    const enginesSeen = new Set(state.engines_seen || []);
    if (agent && agent !== "unknown") enginesSeen.add(agent);

    writeJson(this.stateFile, {
      ...state,
      status,
      last_agent: agent,
      last_action: action,
      last_summary: summary,
      last_updated: event.time,
      engines_seen: Array.from(enginesSeen)
    });

    this._regenerateDerived();
    return event;
  }

  setPhase(phase) {
    const state = readJson(this.stateFile, {});
    writeJson(this.stateFile, { ...state, current_phase: phase, last_updated: new Date().toISOString() });
    this._regenerateDerived();
  }

  lastEvents(limit = 30) {
    const lines = read(this.eventsFile, "").trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map(l => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  // ---- decisions -----------------------------------------------------------

  addDecision(text, { agent = "unknown" } = {}) {
    if (!text) return null;
    const decisions = readJson(this.decisionsJsonFile, []);
    const item = { id: newId(), text, agent, created_at: new Date().toISOString() };
    decisions.push(item);
    writeJson(this.decisionsJsonFile, decisions);
    this._renderDecisionsMd(decisions);
    this.log({ agent, action: "decision", summary: text });
    return item;
  }

  _renderDecisionsMd(decisions) {
    const body = decisions
      .map(d => `## ${d.created_at}\n\n${d.text}\n\n_by ${d.agent}_\n`)
      .join("\n");
    write(this.decisionsMdFile, `# Decisions\n\n${body || "No decisions yet.\n"}`);
  }

  // ---- todo ------------------------------------------------------------

  addTodo(text, { agent = "unknown" } = {}) {
    if (!text) return null;
    const todos = readJson(this.todoJsonFile, []);
    const item = { id: newId(), text, done: false, agent, created_at: new Date().toISOString(), done_at: null };
    todos.push(item);
    writeJson(this.todoJsonFile, todos);
    this._renderTodoMd(todos);
    this.log({ agent, action: "todo", summary: text });
    return item;
  }

  completeTodo(id, { agent = "unknown" } = {}) {
    const todos = readJson(this.todoJsonFile, []);
    const item = todos.find(t => t.id === id);
    if (!item) return null;
    item.done = true;
    item.done_at = new Date().toISOString();
    writeJson(this.todoJsonFile, todos);
    this._renderTodoMd(todos);
    this.log({ agent, action: "todo_done", summary: item.text });
    return item;
  }

  _renderTodoMd(todos) {
    const pending = todos.filter(t => !t.done);
    const done = todos.filter(t => t.done);
    const lines = [
      "# Todo",
      "",
      ...pending.map(t => `- [ ] (${t.id}) ${t.text}`),
      "",
      "## Done",
      "",
      ...done.map(t => `- [x] (${t.id}) ${t.text}`)
    ];
    write(this.todoMdFile, lines.join("\n") + "\n");
  }

  // ---- risks -------------------------------------------------------------

  addRisk(text, { agent = "unknown", severity = "medium" } = {}) {
    if (!text) return null;
    const risks = readJson(this.risksJsonFile, []);
    const item = { id: newId(), text, severity, agent, resolved: false, created_at: new Date().toISOString(), resolved_at: null };
    risks.push(item);
    writeJson(this.risksJsonFile, risks);
    this._renderRisksMd(risks);
    this.log({ agent, action: "risk", summary: text });
    return item;
  }

  resolveRisk(id, { agent = "unknown" } = {}) {
    const risks = readJson(this.risksJsonFile, []);
    const item = risks.find(r => r.id === id);
    if (!item) return null;
    item.resolved = true;
    item.resolved_at = new Date().toISOString();
    writeJson(this.risksJsonFile, risks);
    this._renderRisksMd(risks);
    this.log({ agent, action: "risk_resolved", summary: item.text });
    return item;
  }

  _renderRisksMd(risks) {
    const open = risks.filter(r => !r.resolved);
    const resolved = risks.filter(r => r.resolved);
    const lines = [
      "# Risks",
      "",
      ...open.map(r => `- [${r.severity}] (${r.id}) ${r.text}`),
      "",
      "## Resolved",
      "",
      ...resolved.map(r => `- (${r.id}) ${r.text}`)
    ];
    write(this.risksMdFile, lines.join("\n") + "\n");
  }

  // ---- facts -------------------------------------------------------------

  addFact({ fact, status = "needs_validation", source = null, confidence = 0.5, agent = "unknown" }) {
    if (!fact) return null;
    const facts = readJson(this.factsFile, { confirmed: [], probable: [], needs_validation: [] });
    const item = { id: newId(), fact, source, confidence, agent, created_at: new Date().toISOString() };

    const bucket = ["confirmed", "probable", "needs_validation"].includes(status) ? status : "needs_validation";
    facts[bucket].push(item);
    writeJson(this.factsFile, facts);
    this.log({ agent, action: "fact", summary: fact });
    return item;
  }

  // ---- derived views -------------------------------------------------------

  readSummary() {
    const state = readJson(this.stateFile, {});
    const facts = readJson(this.factsFile, { confirmed: [], probable: [], needs_validation: [] });
    const todos = readJson(this.todoJsonFile, []).filter(t => !t.done);
    const risks = readJson(this.risksJsonFile, []).filter(r => !r.resolved);
    const cfg = this.config();

    return `# AI Universal Memory — ${cfg.project_name}

Status: ${state.status || "unknown"}
Phase: ${state.current_phase || "unknown"}
Last updated: ${state.last_updated || "never"}
Engines seen: ${(state.engines_seen || []).join(", ") || "none yet"}

Last summary:
${state.last_summary || "No summary yet."}

Pending (${todos.length}):
${todos.map(t => `- (${t.id}) ${t.text}`).join("\n") || "- Nothing pending."}

Open risks (${risks.length}):
${risks.map(r => `- [${r.severity}] ${r.text}`).join("\n") || "- No open risks."}

Confirmed facts:
${facts.confirmed.map(f => `- ${f.fact}`).join("\n") || "- No confirmed facts."}
`;
  }

  brief() {
    const cfg = this.config();
    const state = readJson(this.stateFile, {});
    const todos = readJson(this.todoJsonFile, []).filter(t => !t.done).slice(0, cfg.brief_max_pending);
    const risks = readJson(this.risksJsonFile, []).filter(r => !r.resolved).slice(0, cfg.brief_max_risks);
    const events = this.lastEvents(cfg.brief_max_events);

    const lines = [
      `AI-UNIVERSAL-MEMORY BRIEF — ${cfg.project_name}`,
      `Status: ${state.status || "unknown"} | Phase: ${state.current_phase || "unknown"} | Updated: ${(state.last_updated || "").slice(0, 16)}`,
      `Last: ${truncate(state.last_summary || "none", 160)}`,
      todos.length ? `Pending: ${todos.map(t => truncate(t.text, 60)).join(" · ")}` : "Pending: none",
      risks.length ? `Risks: ${risks.map(r => truncate(r.text, 50)).join(" · ")}` : "Risks: none",
      events.length ? `Recent: ${events.map(e => `[${e.agent}] ${truncate(e.summary, 50)}`).join(" | ")}` : "",
      `Full memory: .memory/handoff.md — full log: .memory/events.jsonl — do not read those unless you need deep history.`
    ].filter(Boolean);

    return truncate(lines.join("\n"), cfg.brief_max_chars);
  }

  generateHandoff() {
    const state = readJson(this.stateFile, {});
    const facts = readJson(this.factsFile, { confirmed: [], probable: [], needs_validation: [] });
    const todos = readJson(this.todoJsonFile, []);
    const risks = readJson(this.risksJsonFile, []);
    const cfg = this.config();

    const pending = todos.filter(t => !t.done);
    const openRisks = risks.filter(r => !r.resolved);

    const md = `# AI Handoff — ${cfg.project_name}

> The AI does not remember. The project remembers.
> Read this file first. It is the entry point for any AI or human picking up this project.

## Current State

- Status: ${state.status || "unknown"}
- Phase: ${state.current_phase || "unknown"}
- Last updated: ${state.last_updated || "never"}
- Last agent: ${state.last_agent || "none"}
- Last action: ${state.last_action || "none"}
- Engines seen on this project: ${(state.engines_seen || []).join(", ") || "none yet"}

## Last Summary

${state.last_summary || "No summary yet."}

## Pending Work (${pending.length})

${pending.map(t => `- [ ] (${t.id}) ${t.text}`).join("\n") || "- Nothing pending."}

## Open Risks (${openRisks.length})

${openRisks.map(r => `- [${r.severity}] (${r.id}) ${r.text}`).join("\n") || "- No open risks."}

## Confirmed Facts

${facts.confirmed.map(f => `- ${f.fact}${f.source ? ` — source: ${f.source}` : ""}`).join("\n") || "- No confirmed facts."}

## Probable Facts

${facts.probable.map(f => `- ${f.fact} (confidence ${f.confidence})`).join("\n") || "- No probable facts."}

## Needs Validation

${facts.needs_validation.map(f => `- ${f.fact}`).join("\n") || "- Nothing waiting for validation."}

## Latest Events

\`\`\`jsonl
${this.lastEvents(20).map(e => JSON.stringify(e)).join("\n")}
\`\`\`

## Full History

See \`.memory/events.jsonl\` (append-only) and \`.memory/decisions.md\`.

## Required Behavior For The Next AI Or Human

1. Read \`.memory/BRIEF.md\` first (cheap, always).
2. If you need more, read this file.
3. Only read \`.memory/events.jsonl\` in full if you need deep history.
4. Continue from the current state — do not restart from scratch.
5. Register actions, decisions, risks and facts as you go (see \`.memory/README.md\`).
6. Mark uncertain facts as \`needs_validation\`, never as confirmed.
7. This file and BRIEF.md are regenerated automatically — do not hand-edit them.
`;

    write(this.handoffFile, md);
    return md;
  }

  _regenerateDerived() {
    write(this.briefFile, this.brief() + "\n");
    this.generateHandoff();
  }
}

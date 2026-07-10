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

// Atomic write: never leave a half-written JSON file on disk if the
// process dies mid-write. Same-filesystem rename is atomic on every OS
// Node supports.
function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameWithRetry(tmp, file);
}

// Windows can transiently refuse a rename onto an existing file with EPERM
// (antivirus/Defender briefly scanning the just-written temp file, or a
// reader that hasn't released its handle yet) even though nothing in this
// process is misusing the file. POSIX rename doesn't have this failure
// mode. A short retry-with-backoff clears it without weakening the
// cross-process lock that already serializes our own writers.
function renameWithRetry(tmp, dest, { retries = 8, delayMs = 15 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      fs.renameSync(tmp, dest);
      return;
    } catch (err) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(err.code) || i === retries - 1) {
        try { fs.rmSync(tmp, { force: true }); } catch { /* best effort cleanup */ }
        throw err;
      }
      sleepSync(delayMs);
    }
  }
}

// Cross-process mutex via mkdir, which is atomic-exclusive on every OS —
// no dependency needed. Guards read-modify-write races on state.json and
// friends when multiple agents/subagents touch the same project at once.
const LOCK_STALE_MS = 10_000;

function sleepSync(ms) {
  // Atomics.wait blocks the calling thread for real (Node allows this on
  // the main thread, unlike browsers) — a real sleep, not a busy loop.
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}

function withLock(memoryDir, fn, { retries = 100, delayMs = 25 } = {}) {
  ensureDir(memoryDir); // parent must exist before we can mkdir the lock inside it
  const lockDir = path.join(memoryDir, ".lock");

  for (let i = 0; i < retries; i++) {
    try {
      fs.mkdirSync(lockDir);
      try {
        return fn();
      } finally {
        fs.rmSync(lockDir, { recursive: true, force: true });
      }
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      try {
        const age = Date.now() - fs.statSync(lockDir).mtimeMs;
        if (age > LOCK_STALE_MS) {
          fs.rmSync(lockDir, { recursive: true, force: true }); // steal a lock left by a crashed process
          continue;
        }
      } catch {
        // lock vanished between our check and now — just retry
      }
      sleepSync(delayMs);
    }
  }
  throw new Error(`Could not acquire .memory lock after ${retries} attempts.`);
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function truncate(str, max) {
  if (!str) return "";
  const chars = Array.from(str); // splits by code points, not UTF-16 units — keeps emoji/accents intact
  if (chars.length <= max) return str;
  return chars.slice(0, max - 1).join("").trimEnd() + "…";
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
    return withLock(this.dir, () => {
      ensureDir(this.dir);
      ensureDir(this.evidenceDir);
      ensureDir(this.snapshotsDir);

      if (!exists(path.join(this.dir, ".gitignore"))) {
        write(path.join(this.dir, ".gitignore"), ".lock/\n");
      }

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
        this._logUnlocked({
          agent: "ai-universal-memory",
          action: "init",
          status: "done",
          summary: "Project memory initialized."
        });
      } else {
        this._regenerateDerived();
      }
    });
  }

  // ---- events / state ----------------------------------------------------

  log(entry) {
    return withLock(this.dir, () => this._logUnlocked(entry));
  }

  // Only call this while already holding the lock (from within a withLock
  // callback) — it never acquires one itself, to avoid deadlocking against
  // the non-reentrant mkdir-based mutex.
  _logUnlocked({ agent = "unknown", action = "note", status = "done", summary = "", next = [], error = null, touchSummary = true }) {
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

    const patch = {
      ...state,
      last_agent: agent,
      last_action: action,
      last_updated: event.time,
      engines_seen: Array.from(enginesSeen)
    };
    // Only real work ("note", the default action, and "init") should own
    // the headline status/last_summary — registering a fact/todo/risk/
    // decision shouldn't make it look like that was "the last thing done".
    if (touchSummary) {
      patch.status = status;
      patch.last_summary = summary;
    }
    writeJson(this.stateFile, patch);

    this._regenerateDerived();
    return event;
  }

  setPhase(phase) {
    return withLock(this.dir, () => {
      const state = readJson(this.stateFile, {});
      writeJson(this.stateFile, { ...state, current_phase: phase, last_updated: new Date().toISOString() });
      this._regenerateDerived();
    });
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
    return withLock(this.dir, () => {
      const decisions = readJson(this.decisionsJsonFile, []);
      const item = { id: newId(), text, agent, created_at: new Date().toISOString() };
      decisions.push(item);
      writeJson(this.decisionsJsonFile, decisions);
      this._renderDecisionsMd(decisions);
      this._logUnlocked({ agent, action: "decision", summary: text, touchSummary: false });
      return item;
    });
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
    return withLock(this.dir, () => {
      const todos = readJson(this.todoJsonFile, []);
      const item = { id: newId(), text, done: false, agent, created_at: new Date().toISOString(), done_at: null };
      todos.push(item);
      writeJson(this.todoJsonFile, todos);
      this._renderTodoMd(todos);
      this._logUnlocked({ agent, action: "todo", summary: text, touchSummary: false });
      return item;
    });
  }

  completeTodo(id, { agent = "unknown" } = {}) {
    return withLock(this.dir, () => {
      const todos = readJson(this.todoJsonFile, []);
      const item = todos.find(t => t.id === id);
      if (!item) return null;
      item.done = true;
      item.done_at = new Date().toISOString();
      writeJson(this.todoJsonFile, todos);
      this._renderTodoMd(todos);
      this._logUnlocked({ agent, action: "todo_done", summary: item.text, touchSummary: false });
      return item;
    });
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
    return withLock(this.dir, () => {
      const risks = readJson(this.risksJsonFile, []);
      const item = { id: newId(), text, severity, agent, resolved: false, created_at: new Date().toISOString(), resolved_at: null };
      risks.push(item);
      writeJson(this.risksJsonFile, risks);
      this._renderRisksMd(risks);
      this._logUnlocked({ agent, action: "risk", summary: text, touchSummary: false });
      return item;
    });
  }

  resolveRisk(id, { agent = "unknown" } = {}) {
    return withLock(this.dir, () => {
      const risks = readJson(this.risksJsonFile, []);
      const item = risks.find(r => r.id === id);
      if (!item) return null;
      item.resolved = true;
      item.resolved_at = new Date().toISOString();
      writeJson(this.risksJsonFile, risks);
      this._renderRisksMd(risks);
      this._logUnlocked({ agent, action: "risk_resolved", summary: item.text, touchSummary: false });
      return item;
    });
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
    return withLock(this.dir, () => {
      const facts = readJson(this.factsFile, { confirmed: [], probable: [], needs_validation: [] });
      const item = { id: newId(), fact, source, confidence, agent, created_at: new Date().toISOString() };

      const bucket = ["confirmed", "probable", "needs_validation"].includes(status) ? status : "needs_validation";
      facts[bucket].push(item);
      writeJson(this.factsFile, facts);
      this._logUnlocked({ agent, action: "fact", summary: fact, touchSummary: false });
      return item;
    });
  }

  // ---- search --------------------------------------------------------------

  search(term, { limit = 25 } = {}) {
    const q = String(term || "").trim().toLowerCase();
    if (!q) return [];
    const hit = (s) => typeof s === "string" && s.toLowerCase().includes(q);
    const out = [];

    for (const e of this.lastEvents(10000)) {
      if (hit(e.summary)) out.push({ kind: "event", time: e.time, agent: e.agent, text: e.summary });
    }
    const facts = readJson(this.factsFile, { confirmed: [], probable: [], needs_validation: [] });
    for (const bucket of ["confirmed", "probable", "needs_validation"]) {
      for (const f of facts[bucket]) {
        if (hit(f.fact) || hit(f.source)) out.push({ kind: `fact:${bucket}`, time: f.created_at, agent: f.agent, text: f.fact });
      }
    }
    for (const d of readJson(this.decisionsJsonFile, [])) {
      if (hit(d.text)) out.push({ kind: "decision", time: d.created_at, agent: d.agent, text: d.text });
    }
    for (const t of readJson(this.todoJsonFile, [])) {
      if (hit(t.text)) out.push({ kind: t.done ? "todo:done" : "todo:pending", id: t.id, time: t.created_at, agent: t.agent, text: t.text });
    }
    for (const r of readJson(this.risksJsonFile, [])) {
      if (hit(r.text)) out.push({ kind: r.resolved ? "risk:resolved" : "risk:open", id: r.id, time: r.created_at, agent: r.agent, text: r.text });
    }

    out.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    return out.slice(-limit);
  }

  // ---- compact ---------------------------------------------------------------

  compact({ keep = 200 } = {}) {
    return withLock(this.dir, () => {
      const lines = read(this.eventsFile, "").trim().split("\n").filter(Boolean);
      if (lines.length <= keep) return { rotated: 0, kept: lines.length };
      const cutoff = lines.length - keep;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      ensureDir(this.snapshotsDir);
      write(path.join(this.snapshotsDir, `events-${stamp}.jsonl`), lines.slice(0, cutoff).join("\n") + "\n");
      write(this.eventsFile, lines.slice(cutoff).join("\n") + "\n");
      this._regenerateDerived();
      return { rotated: cutoff, kept: keep };
    });
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

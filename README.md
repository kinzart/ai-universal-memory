# AI Universal Memory

[![npm version](https://img.shields.io/npm/v/ai-universal-memory.svg)](https://www.npmjs.com/package/ai-universal-memory)
[![CI](https://github.com/kinzart/ai-universal-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/kinzart/ai-universal-memory/actions/workflows/ci.yml)
![zero dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Portable, zero-dependency project memory for any AI coding engine — or
human — picking up where the last one left off.

> The AI does not remember. The project remembers.

```bash
npx ai-universal-memory init
```

(A terminal demo — `init` → log a decision/todo → `brief` — is scripted
in `demo.tape`; render it yourself with [vhs](https://github.com/charmbracelet/vhs)
via `vhs demo.tape` if you want the GIF locally.)

That's it. Your project now has a `.memory/` folder that any AI (Claude
Code, Cursor, ChatGPT, Gemini, a local model) or any human can read and
update, forever, without needing this package installed again.

## The problem

Every AI coding session starts from zero. Switch from Claude to Cursor,
open a new chat, hand the project to a teammate, or come back in three
weeks — and all the context, decisions and open threads are gone unless
you re-explain them. Chat history isn't memory: it's not portable, not
searchable, not owned by the project, and disappears the moment you
change tools.

## What already exists (and why this is different)

Before building this we looked at what's out there:

- **MCP's official memory server** (knowledge-graph based) and projects
  like **mem0** / **agentmemory** — good at long-term semantic recall
  ("the user prefers X"), but not built around a readable, auditable,
  git-committed project state with decisions/risks/handoff.
- **Claude Code's `CLAUDE.md` / Skills**, and the emerging **`AGENTS.md`**
  convention — great for *instructions*, but they're static text, not a
  place to log events, pending work, or facts with confidence levels.
- **OpenAI Agents SDK sessions** and similar — session-scoped, not
  project-scoped, and tied to one vendor's runtime.

None of these gave us a memory that is: **file-based** (so it's just git,
no server or account), **auditable** (you can read exactly what happened
and why), **engine-agnostic** (works the same whether the actor is
Claude, GPT, Gemini, or a person), and **token-cheap by construction**
(the automatic read is a few hundred characters, not your whole history).
That's the gap this project fills.

|                              | CLAUDE.md / AGENTS.md | MCP memory server | mem0 / cloud memory | **ai-universal-memory** |
|------------------------------|:----------------------:|:------------------:|:--------------------:|:-------------------------:|
| Lives in git, auditable      | ✅ (static)            | ❌                  | ❌                    | ✅                        |
| Logs events/decisions        | ❌                     | partial             | ✅                    | ✅                        |
| Works offline, no account    | ✅                     | ❌                  | ❌                    | ✅                        |
| Engine-agnostic               | partial                | MCP clients only    | own SDK               | ✅ (the file is the API) |
| Token cost per session        | whole file             | per call             | per call               | ~150–220 tokens, fixed   |
| Survives without the package  | ✅                     | ❌                  | ❌                    | ✅ (vendored engine)     |

## claude-mem vs this

[claude-mem](https://github.com/thedotmack/claude-mem) is excellent at
what it does: automatic, AI-compressed memory for *you*, on *your*
machine. This project solves a different problem: memory that belongs
to the *project* and travels with it. They can coexist in the same
setup.

|                                  | claude-mem                           | ai-universal-memory                 |
|----------------------------------|---------------------------------------|--------------------------------------|
| Where memory lives               | SQLite in `~/.claude-mem/`            | `.memory/` inside the repo, in git  |
| Travels to a teammate on clone?  | No — their instance starts empty      | Yes — `git clone` ships the memory  |
| Auditable in a PR diff?          | No (database + vectors)               | Yes (readable markdown/json)        |
| Stack                            | Node 20+, Bun, Chroma, worker daemon  | Zero dependencies, plain files      |
| Survives uninstall?              | No                                    | Yes — vendored engine               |
| Capture cost                     | LLM calls to compress                 | Zero tokens by construction         |
| Semantic (vector) search         | Yes                                   | No — plain-text `aum search`        |
| Automatic capture                | Yes (lifecycle hooks)                 | Yes (PostToolUse/Stop, no LLM)      |

## How it works

`npx ai-universal-memory init` creates:

```
.memory/
  BRIEF.md          ← capped digest (~900 chars), always current
  handoff.md         ← full status: state, pending work, risks, facts
  state.json          ← status/phase pointer
  facts.json           ← confirmed / probable / needs_validation, with sources
  decisions.json + .md  ← append-only decision log
  todo.json + .md        ← pending/completed tasks
  risks.json + .md        ← open/resolved risks
  events.jsonl              ← append-only activity log
  tools/engine.mjs            ← the zero-dependency engine itself, vendored
  tools/cli.mjs                 ← local CLI — works with no internet, no npm
  tools/session-start.mjs         ← Claude Code auto-read hook target
  tools/auto-capture.mjs            ← PostToolUse hook: 1 line per tool call, no LLM
  tools/session-stop.mjs              ← Stop hook: consolidates the turn once
```

Plus, non-destructively (existing content is preserved, merged via marker
comments):

- `CLAUDE.md` / `AGENTS.md` — a short block telling any agent to read
  `.memory/BRIEF.md` first.
- `.claude/skills/ai-universal-memory/SKILL.md` — a Claude Code Skill.
- `.claude/settings.json` — a `SessionStart` hook so **Claude Code reads
  the brief automatically, every session, without being asked** — plus
  `PostToolUse`/`Stop` hooks for zero-discipline auto-capture (below).
- `.cursor/rules/ai-universal-memory.mdc` — same idea for Cursor.

### Progressive disclosure: three layers

Nothing is read automatically beyond a fixed, small budget — going
deeper is always the agent's choice, never forced:

- **Layer 1 — `BRIEF.md`.** ~150–220 tokens (capped at ~900 characters,
  configurable via `.memory/config.json`'s `brief_max_chars`), injected
  automatically on every session start. Current status, last real
  summary, top pending items, top risks, last few non-noise events.
- **Layer 2 — `handoff.md`.** Full current state — pending work, open
  risks, confirmed/probable/needs-validation facts, recent raw events.
  Read on demand when Layer 1 isn't enough.
- **Layer 3 — `events.jsonl`.** The complete append-only history. Read
  only when the agent decides it actually needs deep context — via
  `aum search` for a specific term, or the tail of the file directly.

Read Layer 1 always; escalate to Layer 2 or 3 only if you need to.

### Automatic capture, without an LLM

The biggest risk to any memory system is the agent forgetting to
update it. `aum init` wires two more hooks by default (Claude Code
only, for now):

- **`PostToolUse`** appends one compact line per `Write`/`Edit`/
  `MultiEdit`/`NotebookEdit`/`Bash` call to `events.jsonl` — no LLM
  call, no lock, no state write, designed to cost ~0ms. Repeated edits
  to the same file collapse into one line instead of spamming the log.
- **`Stop`** runs once per turn: if the turn produced auto-captured
  events, it writes one human-readable summary ("Session abc123: 14
  actions across 5 files — a.js, b.php, …") and regenerates `BRIEF.md`/
  `handoff.md` exactly once, instead of on every single edit.

Auto-captured events stay out of `BRIEF.md`'s `Recent:` line (that's
the Stop-hook summary's job) but remain fully auditable in
`events.jsonl` and `handoff.md`. One line per action, one summary per
turn, all of it plain text in your git history — no LLM calls, no
compression, no vector store.

Turn it off per-project with `aum init --no-auto-capture`, or any time
with `aum auto off` / `aum auto on` / `aum auto status` (also available
as `node .memory/tools/cli.mjs auto ...` without the package installed).

### Memory is never empty on day one

`aum init` also runs a one-time, local-only project scan the first time
it runs: root `package.json` (name, version, description, scripts),
a summary of `README.md`, the top-level directory layout, a flag if there
are multiple `package.json` files (possible monorepo/duplicate app
roots), and a git status check — including catching a `.git` folder that
exists but isn't actually a valid, initialized repository. These become
real `facts`/`risks`/`todos`, not placeholders. Nothing leaves your
machine and nothing is read over the network. Skip it with
`aum init --no-scan`.

This exists because an empty memory and no memory look the same to a
fresh AI session: both mean "explore the codebase from scratch." The
scan makes sure day one already has something worth handing off.

### Why it survives without this package

`aum init` doesn't just point your project at a dependency — it
**vendors** the engine itself (`templates/engine.mjs`) into
`.memory/tools/`. That copy has zero dependencies and never phones home.
Delete `node_modules`, lose internet, uninstall this package — memory
keeps working, because the project owns its own copy, the same way a
vendored git hook does.

## Everyday use

```bash
# from any engine, any agent, any human — --agent names who's acting
node .memory/tools/cli.mjs log "Refactored auth middleware" --agent "claude-code"
node .memory/tools/cli.mjs decision "Use JWT over sessions" --agent "cursor"
node .memory/tools/cli.mjs todo "Write migration script" --agent "human:you"
node .memory/tools/cli.mjs todo-done <id>
node .memory/tools/cli.mjs risk "Rate limiter untested under load" --severity high
node .memory/tools/cli.mjs risk-resolve <id>
node .memory/tools/cli.mjs fact "API is deployed on Vercel" --status confirmed --source "vercel.json"
node .memory/tools/cli.mjs brief
node .memory/tools/cli.mjs read
```

`state.json.engines_seen` and every event's `agent` field track exactly
which engines and people have touched the project — that's the "hand off
from one AI to another, or one human to another, just by switching
engine" part.

## CLI (this package)

```bash
npx ai-universal-memory init [--engines claude,agents,cursor] [--name "My Project"] [--no-scan] [--no-auto-capture]
npx ai-universal-memory install [--engines claude,agents,cursor] [--no-auto-capture]   # re-sync integrations only
npx ai-universal-memory doctor [--fix]                              # check what's wired up
npx ai-universal-memory brief | read | context
npx ai-universal-memory log | decision | todo | todo-done | risk | risk-resolve | fact | handoff | last
npx ai-universal-memory search "term" [--limit 25]                   # search events/facts/decisions/todos/risks
npx ai-universal-memory compact [--keep 200]                          # rotate old events into .memory/snapshots/
npx ai-universal-memory auto on|off|status                            # toggle zero-LLM auto-capture
npx ai-universal-memory mcp                                          # optional MCP server
```

All commands accept `--path <dir>` to target a project other than the
current directory.

## Optional: MCP server

For MCP-capable clients (Claude Desktop, others), `npx ai-universal-memory mcp`
exposes `memory_brief`, `memory_read`, `memory_log`, `memory_decision`,
`memory_todo`, `memory_todo_done`, `memory_risk`, `memory_risk_resolve`,
`memory_fact`, `memory_search`, `memory_handoff` as tools. This is an
extra integration point — the primary workflow (hook + CLAUDE.md/
AGENTS.md + Skill) already works without it.

## Using it in a new or existing project

```bash
cd your-project
npx ai-universal-memory init
```

Re-run any time — it's idempotent: existing data is never overwritten,
existing `CLAUDE.md`/`AGENTS.md` content is preserved, only the marked
memory block is added or updated.

Commit `.memory/` like any other project file. That's what makes it
travel with the project across machines, engines and people.

## Uninstall

Nothing here needs an uninstaller script — it's all plain files:

```bash
rm -rf .memory .claude/skills/ai-universal-memory .cursor/rules/ai-universal-memory.mdc
```

Then remove the two marked blocks (between `<!-- ai-universal-memory:start -->`
and `<!-- ai-universal-memory:end -->`) from `AGENTS.md` and `CLAUDE.md`
if you added them, and the `SessionStart`/`PostToolUse`/`Stop` hook
entries from `.claude/settings.json` (the ones whose commands mention
`session-start.mjs`, `auto-capture.mjs`, or `session-stop.mjs`) if you
no longer want them. Nothing else on your system was touched.

## Roadmap

- evidence attachments linked to facts/decisions
- VS Code extension, dashboard
- more engine installers (Windsurf, Zed, JetBrains AI)

## License

MIT

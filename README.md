# AI Universal Memory

Portable, zero-dependency project memory for any AI coding engine — or
human — picking up where the last one left off.

> The AI does not remember. The project remembers.

```bash
npx ai-universal-memory init
```

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

## How it works

`npx ai-universal-memory init` creates:

```
.memory/
  BRIEF.md          ← capped digest (~700 chars), always current
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
```

Plus, non-destructively (existing content is preserved, merged via marker
comments):

- `CLAUDE.md` / `AGENTS.md` — a short block telling any agent to read
  `.memory/BRIEF.md` first.
- `.claude/skills/ai-universal-memory/SKILL.md` — a Claude Code Skill.
- `.claude/settings.json` — a `SessionStart` hook so **Claude Code reads
  the brief automatically, every session, without being asked**.
- `.cursor/rules/ai-universal-memory.mdc` — same idea for Cursor.

### Why this never burns tokens

The only thing read *automatically* is `BRIEF.md` — capped at ~900
characters (roughly 150–220 tokens): current status, last summary, top
pending items, top risks, last few events. Full history
(`events.jsonl`, `handoff.md`) is always available but never force-fed —
an agent reads it only when it decides it actually needs more depth.

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
npx ai-universal-memory init [--engines claude,agents,cursor] [--name "My Project"] [--no-scan]
npx ai-universal-memory install [--engines claude,agents,cursor]   # re-sync integrations only
npx ai-universal-memory doctor [--fix]                              # check what's wired up
npx ai-universal-memory brief | read | context
npx ai-universal-memory log | decision | todo | todo-done | risk | risk-resolve | fact | handoff | last
npx ai-universal-memory mcp                                          # optional MCP server
```

All commands accept `--path <dir>` to target a project other than the
current directory.

## Optional: MCP server

For MCP-capable clients (Claude Desktop, others), `npx ai-universal-memory mcp`
exposes `memory_brief`, `memory_read`, `memory_log`, `memory_decision`,
`memory_todo`, `memory_risk`, `memory_fact`, `memory_handoff` as tools.
This is an extra integration point — the primary workflow (hook +
CLAUDE.md/AGENTS.md + Skill) already works without it.

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

## Roadmap

- `aum search` over events/facts
- snapshot/diff between two points in time
- evidence attachments linked to facts/decisions
- VS Code extension, dashboard
- more engine installers (Windsurf, Zed, JetBrains AI)

## License

MIT

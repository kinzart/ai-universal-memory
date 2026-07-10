# .memory/ — AI Universal Memory

This folder is a portable, engine-agnostic project memory. Any AI (Claude,
GPT, Gemini, Cursor, a local model) or any human can read and update it —
there is nothing here that depends on one vendor or one chat session.

Core rule: **the AI does not remember. The project remembers.**

## Progressive disclosure: read this first, cheaply

Three layers — read Layer 1 always, escalate only if you need to:

- **Layer 1 — `BRIEF.md`.** A small, always-current digest (a few
  hundred characters). Read this before anything else. Regenerated
  automatically.
- **Layer 2 — `handoff.md`.** The full picture: state, pending work,
  risks, facts, recent events. Read this when `BRIEF.md` isn't enough.
- **Layer 3 — `events.jsonl`.** The complete append-only history. Only
  read this in full (or `node .memory/tools/cli.mjs search "term"`)
  when you need deep history; it can get long.

## Files

| File | What it is |
|---|---|
| `BRIEF.md` | capped digest, auto-injected at session start for supported engines |
| `handoff.md` | full human/AI-readable status report |
| `state.json` | current status/phase pointer |
| `facts.json` | confirmed / probable / needs_validation facts, with source + confidence |
| `decisions.json` + `decisions.md` | append-only decision log |
| `todo.json` + `todo.md` | pending/completed tasks |
| `risks.json` + `risks.md` | open/resolved risks |
| `events.jsonl` | append-only activity log, one JSON object per line |
| `config.json` | brief size limits, project name |
| `evidence/` | drop files here that back a fact or decision |
| `snapshots/` | optional point-in-time exports |
| `tools/engine.mjs` | zero-dependency memory engine (the implementation) |
| `tools/cli.mjs` | local CLI, works without the npm package installed |
| `tools/session-start.mjs` | Claude Code SessionStart hook target |
| `tools/auto-capture.mjs` | Claude Code PostToolUse hook — 1 line/action, no LLM |
| `tools/session-stop.mjs` | Claude Code Stop hook — consolidates the turn once |

## Updating memory (any engine, any human)

```bash
node .memory/tools/cli.mjs log "what happened" --agent "claude-code"
node .memory/tools/cli.mjs decision "decision text" --agent "claude-code"
node .memory/tools/cli.mjs todo "pending task" --agent "claude-code"
node .memory/tools/cli.mjs todo-done <id>
node .memory/tools/cli.mjs risk "risk text" --severity medium --agent "claude-code"
node .memory/tools/cli.mjs risk-resolve <id>
node .memory/tools/cli.mjs fact "fact text" --status confirmed --source "..." --agent "claude-code"
node .memory/tools/cli.mjs handoff
node .memory/tools/cli.mjs search "term"
node .memory/tools/cli.mjs auto on|off|status
```

On Claude Code, routine `Write`/`Edit`/`Bash` calls are already
auto-captured (no LLM, one line per action, one summary per turn) via
the `PostToolUse`/`Stop` hooks — that doesn't replace logging
meaningful decisions/risks/facts yourself.

Use `--agent` to name whoever is acting: `claude-code`, `cursor`,
`chatgpt-web`, `gemini`, `human:yourname`. This is how the memory tracks
handoffs across AI engines and humans — `state.json.engines_seen` and the
event log both keep a record of who touched the project.

## Rules for any AI working in this project

1. Read `.memory/BRIEF.md` first — it's cheap, always.
2. Only read `handoff.md` or the full `events.jsonl` if you need more depth.
3. Continue from the current state; do not restart from scratch.
4. Log meaningful actions, decisions, risks and facts as you go.
5. Never promote an assumption to `confirmed` — use `needs_validation` or
   `probable` and cite a source when you can.
6. `BRIEF.md` and `handoff.md` are generated — don't hand-edit them, edit
   via the CLI above so they stay in sync.
7. Commit `.memory/` to git like any other project file. That's what makes
   the memory travel with the project across machines, engines and people.

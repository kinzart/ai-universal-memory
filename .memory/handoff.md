# AI Handoff — AI Universal Memory

> The AI does not remember. The project remembers.
> Read this file first. It is the entry point for any AI or human picking up this project.

## Current State

- Status: done
- Phase: setup
- Last updated: 2026-07-09T23:24:53.076Z
- Last agent: claude-code
- Last action: note
- Engines seen on this project: ai-universal-memory, claude-code

## Last Summary

Fixed package.json bin paths (npm was silently dropping bin entries with a leading ./ prefix during publish) via npm pkg fix

## Pending Work (4)

- [ ] (mre3wgn9cfwr) Create the GitHub repo kinzart/ai-universal-memory and push
- [ ] (mre3wgpz7kgm) Publish 0.1.0 to npm (npm publish --access public) once repo is pushed
- [ ] (mre3wgs83gpu) Add more engine installers: Windsurf, Zed, JetBrains AI Assistant
- [ ] (mre3wguf40lh) Consider aum search / snapshot diff commands

## Open Risks (0)

- No open risks.

## Confirmed Facts

- npm package name 'ai-universal-memory' was unclaimed as of 2026-07-09. — source: npm view ai-universal-memory (404)

## Probable Facts

- No probable facts.

## Needs Validation

- Nothing waiting for validation.

## Latest Events

```jsonl
{"time":"2026-07-09T22:56:38.943Z","agent":"ai-universal-memory","action":"init","status":"done","summary":"Project memory initialized.","next":[],"error":null}
{"time":"2026-07-09T22:56:52.599Z","agent":"claude-code","action":"note","status":"done","summary":"Built the full project: vendored zero-dep engine, CLI, Claude Code SessionStart hook, AGENTS.md/CLAUDE.md installers, Cursor rule, optional MCP server, smoke tests, CI.","next":[],"error":null}
{"time":"2026-07-09T22:56:52.693Z","agent":"claude-code","action":"decision","status":"done","summary":"Vendor the engine into .memory/tools/ of every target project (not just depend on the npm package), so memory keeps working offline and forever, even without ai-universal-memory installed.","next":[],"error":null}
{"time":"2026-07-09T22:56:52.782Z","agent":"claude-code","action":"decision","status":"done","summary":"Automatic context injection uses a capped ~900 char BRIEF.md via a Claude Code SessionStart hook, not the full history, to keep token cost near zero on every session start.","next":[],"error":null}
{"time":"2026-07-09T22:56:52.881Z","agent":"claude-code","action":"decision","status":"done","summary":"AGENTS.md/CLAUDE.md/.claude/settings.json are merged via marker comments / JSON merge, never overwritten, so existing project instructions and hooks survive re-installs.","next":[],"error":null}
{"time":"2026-07-09T22:56:52.974Z","agent":"claude-code","action":"fact","status":"done","summary":"npm package name 'ai-universal-memory' was unclaimed as of 2026-07-09.","next":[],"error":null}
{"time":"2026-07-09T22:56:53.063Z","agent":"claude-code","action":"todo","status":"done","summary":"Create the GitHub repo kinzartmusica/ai-universal-memory and push","next":[],"error":null}
{"time":"2026-07-09T22:56:53.161Z","agent":"claude-code","action":"todo","status":"done","summary":"Publish 0.1.0 to npm (npm publish --access public) once repo is pushed","next":[],"error":null}
{"time":"2026-07-09T22:56:53.241Z","agent":"claude-code","action":"todo","status":"done","summary":"Add more engine installers: Windsurf, Zed, JetBrains AI Assistant","next":[],"error":null}
{"time":"2026-07-09T22:56:53.321Z","agent":"claude-code","action":"todo","status":"done","summary":"Consider aum search / snapshot diff commands","next":[],"error":null}
{"time":"2026-07-09T23:21:39.241Z","agent":"claude-code","action":"note","status":"done","summary":"Corrected GitHub username from placeholder kinzartmusica to actual authenticated account kinzart across package.json, LICENSE and .memory/","next":[],"error":null}
{"time":"2026-07-09T23:24:53.076Z","agent":"claude-code","action":"note","status":"done","summary":"Fixed package.json bin paths (npm was silently dropping bin entries with a leading ./ prefix during publish) via npm pkg fix","next":[],"error":null}
```

## Full History

See `.memory/events.jsonl` (append-only) and `.memory/decisions.md`.

## Required Behavior For The Next AI Or Human

1. Read `.memory/BRIEF.md` first (cheap, always).
2. If you need more, read this file.
3. Only read `.memory/events.jsonl` in full if you need deep history.
4. Continue from the current state — do not restart from scratch.
5. Register actions, decisions, risks and facts as you go (see `.memory/README.md`).
6. Mark uncertain facts as `needs_validation`, never as confirmed.
7. This file and BRIEF.md are regenerated automatically — do not hand-edit them.

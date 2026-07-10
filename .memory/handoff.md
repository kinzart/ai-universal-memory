# AI Handoff — AI Universal Memory

> The AI does not remember. The project remembers.
> Read this file first. It is the entry point for any AI or human picking up this project.

## Current State

- Status: done
- Phase: setup
- Last updated: 2026-07-10T01:34:15.829Z
- Last agent: claude-code
- Last action: release
- Engines seen on this project: ai-universal-memory, claude-code

## Last Summary

Published and verified ai-universal-memory@0.4.0 end-to-end: CI green on all 9 os/node combos, npm publish with provenance succeeded via CI, and a fresh npx install from the public registry correctly wires auto-capture (PostToolUse/Stop hooks) alongside everything from 0.1-0.3.

## Pending Work (4)

- [ ] (mre3wgs83gpu) Add more engine installers: Windsurf, Zed, JetBrains AI Assistant
- [ ] (mre3wguf40lh) Consider aum search / snapshot diff commands
- [ ] (mre87l4ia09l) Render demo.gif with vhs on a machine where headless Chrome works, or find an alternative renderer
- [ ] (mre87l6u8qb3) Consider a GitHub social preview image (1280x640) — no reliable CLI/API path found, likely needs the web UI

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
{"time":"2026-07-09T23:24:53.076Z","agent":"claude-code","action":"note","status":"done","summary":"Fixed package.json bin paths (npm was silently dropping bin entries with a leading ./ prefix during publish) via npm pkg fix","next":[],"error":null}
{"time":"2026-07-09T23:36:53.826Z","agent":"claude-code","action":"note","status":"done","summary":"Published ai-universal-memory@0.1.0 to npm and verified npx ai-universal-memory init works end-to-end from the public registry (fresh tmp dir, all doctor checks green).","next":[],"error":null}
{"time":"2026-07-09T23:36:59.786Z","agent":"claude-code","action":"todo_done","status":"done","summary":"Create the GitHub repo kinzart/ai-universal-memory and push","next":[],"error":null}
{"time":"2026-07-09T23:36:59.886Z","agent":"claude-code","action":"todo_done","status":"done","summary":"Publish 0.1.0 to npm (npm publish --access public) once repo is pushed","next":[],"error":null}
{"time":"2026-07-09T23:52:36.040Z","agent":"claude-code","action":"validation","status":"done","summary":"Real-world validation: installed on a second, unrelated project (Agente de Produção Artística) via npx from the public registry. First session logged real facts/risks/todos about that codebase; a completely fresh third session recalled all of it via the SessionStart hook + AGENTS.md/CLAUDE.md, with no re-exploration of the code. Confirms cross-session, low-token handoff works end-to-end in practice, not just in the smoke test.","next":[],"error":null}
{"time":"2026-07-10T00:04:48.189Z","agent":"claude-code","action":"feature","status":"done","summary":"Added templates/bootstrap.mjs: a one-time local project scan on first init (package.json, README, top-level structure, git status) that seeds real facts/risks/todos instead of leaving memory empty on day one. Reproduced and verified it catches the exact 'empty .git' issue found on the Agente de Produção Artística test.","next":[],"error":null}
{"time":"2026-07-10T00:04:48.295Z","agent":"claude-code","action":"decision","status":"done","summary":"Keep bootstrap.mjs package-only (not vendored into target projects) since only 'aum init' calls it and the vendored local CLI has no init command — avoids adding unused code to every project's .memory/tools/.","next":[],"error":null}
{"time":"2026-07-10T00:10:08.559Z","agent":"unknown","action":"todo","status":"done","summary":"Add more engine installers: Windsurf, Zed, JetBrains AI Assistant","next":[],"error":null}
{"time":"2026-07-10T00:10:08.651Z","agent":"claude-code","action":"release","status":"done","summary":"Published and verified ai-universal-memory@0.2.0 end-to-end from the public npm registry: fresh npx install auto-scans a synthetic project and correctly seeds package/README/structure/git facts with no manual logging needed.","next":[],"error":null}
{"time":"2026-07-10T00:10:31.951Z","agent":"claude-code","action":"todo_done","status":"done","summary":"Add more engine installers: Windsurf, Zed, JetBrains AI Assistant","next":[],"error":null}
{"time":"2026-07-10T00:10:32.052Z","agent":"claude-code","action":"note","status":"done","summary":"Closed duplicate todo mre6io8e79f8 (accidental re-add) — original is mre3wgs83gpu, still open.","next":[],"error":null}
{"time":"2026-07-10T00:41:33.118Z","agent":"claude-code","action":"fix","status":"done","summary":"Executed MISSAO-AUM-v0.3.md phase P0 (6 confirmed bugs from external audit of v0.2.0): portable SessionStart hook via $CLAUDE_PROJECT_DIR with auto-migration of old installs, todo-done/risk-resolve now exit 1 on unknown id instead of lying, atomic writeJson + mkdir-based cross-process lock around every mutator (verified with 20 concurrent writers, zero lost events), touchSummary flag so fact/todo/risk/decision no longer clobber state.last_summary, MCP server version now reads package.json + gained memory_todo_done/memory_risk_resolve tools, README 700/900 char inconsistency fixed. All P0 acceptance criteria pass.","next":[],"error":null}
{"time":"2026-07-10T00:41:33.215Z","agent":"claude-code","action":"todo_done","status":"done","summary":"Add more engine installers: Windsurf, Zed, JetBrains AI Assistant","next":[],"error":null}
{"time":"2026-07-10T00:44:52.056Z","agent":"claude-code","action":"feature","status":"done","summary":"Executed MISSAO-AUM-v0.3.md phase P1: aum search across events/facts/decisions/todos/risks (CLI + MCP), aum compact rotating old events.jsonl into snapshots/ without deleting anything, and unicode-safe truncate (code points, not UTF-16 units) so emoji don't get mangled in BRIEF.md. Updated README roadmap and CHANGELOG.","next":[],"error":null}
{"time":"2026-07-10T00:57:30.455Z","agent":"claude-code","action":"release","status":"done","summary":"Executed MISSAO-AUM-v0.3.md phase P2: rewrote test suite on node:test (19 tests, was ad-hoc script), fixed CI to actually trigger (was on branch 'main', repo uses 'master') plus full os/node matrix and e2e smoke test, wired --provenance into the tag-triggered publish workflow, added src/core.d.ts (validated with real tsc --strict, zero errors) and 'types' field, README got badges/comparison table/uninstall section (demo.gif not rendered — vhs+ttyd got installed and hung on headless Chrome in this environment; demo.tape is committed for anyone to render locally), added CONTRIBUTING.md/SECURITY.md/issue templates, and 8 GitHub topics. Bumped to 0.3.0. All mission acceptance criteria pass.","next":[],"error":null}
{"time":"2026-07-10T00:57:30.548Z","agent":"claude-code","action":"todo","status":"done","summary":"Render demo.gif with vhs on a machine where headless Chrome works, or find an alternative renderer","next":[],"error":null}
{"time":"2026-07-10T00:57:30.632Z","agent":"claude-code","action":"todo","status":"done","summary":"Consider a GitHub social preview image (1280x640) — no reliable CLI/API path found, likely needs the web UI","next":[],"error":null}
{"time":"2026-07-10T01:12:05.133Z","agent":"claude-code","action":"fix","status":"done","summary":"CI's first real run caught a genuine bug on windows-latest+node18: writeJson's atomic rename could throw EPERM under concurrent writes (Windows Defender/handle-release quirk, not a locking bug). Fixed with a short retry-with-backoff around fs.renameSync for EPERM/EBUSY/EACCES, plus a regression test that mocks fs.renameSync to fail twice then succeed. Shipping as 0.3.1.","next":[],"error":null}
{"time":"2026-07-10T01:30:26.660Z","agent":"claude-code","action":"feature","status":"done","summary":"Executed the P1.0 delta from the updated mission file: zero-LLM auto-capture via PostToolUse/Stop hooks (auto-capture.mjs, session-stop.mjs), engine appendEvent()/regenerate() primitives, aum auto on|off|status, --no-auto-capture flag, dedupe of consecutive identical edits, brief filtering of auto events. Plus README additions: claude-mem vs this comparison table, and 'progressive disclosure: three layers' terminology applied consistently across README/.memory/README.md/claude-block.md/agents-block.md/SKILL.md. 26/26 tests passing. Bumped to 0.4.0.","next":[],"error":null}
{"time":"2026-07-10T01:34:15.829Z","agent":"claude-code","action":"release","status":"done","summary":"Published and verified ai-universal-memory@0.4.0 end-to-end: CI green on all 9 os/node combos, npm publish with provenance succeeded via CI, and a fresh npx install from the public registry correctly wires auto-capture (PostToolUse/Stop hooks) alongside everything from 0.1-0.3.","next":[],"error":null}
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

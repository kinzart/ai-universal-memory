# Changelog

## 0.3.0 (unreleased)

Fixes 6 bugs found by an external audit of the published v0.2.0 tarball,
plus the roadmap features that unlock treating memory as consultable
rather than just append-only, plus repo credibility infra.

### Fixed

- **Portable SessionStart hook.** `aum init`/`install` now write
  `node "$CLAUDE_PROJECT_DIR/.memory/tools/session-start.mjs"` instead
  of baking in an absolute path from whoever ran `init`. The old
  absolute path gets committed to git and silently breaks the
  "automatic memory" hook on every other machine or clone — exactly
  the failure mode this project exists to prevent. Re-running
  `aum install` auto-migrates old installs. `doctor` now checks for
  hook portability specifically.
- `todo-done`/`risk-resolve` exit 1 with a clear error on an unknown
  id instead of silently reporting success — a wrong exit code here
  means an agent believes it closed a task it didn't. The same
  "empty input is an error" treatment now applies to `log`/`decision`/
  `todo`/`risk`/`fact`. Fixed in both `bin/aum.js` and the vendored
  `templates/cli.mjs`.
- Atomic `writeJson` (write to a temp file, then rename) and a
  zero-dependency cross-process lock (mkdir-based mutex with
  stale-lock recovery after 10s) around every mutator, so concurrent
  agents/subagents touching the same project can't corrupt
  `state.json` or lose updates. Verified with 20 concurrent `aum log`
  calls: zero lost events, valid JSON throughout.
- `log()` gained a `touchSummary` flag: only real work (`action:
  "note"`/`"init"`) updates `state.last_summary` now. Registering a
  fact/todo/risk/decision no longer overwrites "what was last
  actually done" in the headline summary.
- MCP server version now reads `package.json` instead of a hardcoded
  `"0.1.0"`, and gained `memory_todo_done`/`memory_risk_resolve` tools
  (it could create tasks/risks but not close them).
- `truncate()` now splits on code points instead of UTF-16 units, so
  emoji and combined accents in a summary don't get mangled mid-glyph
  when `BRIEF.md` truncates.
- Fixed a doc inconsistency: `BRIEF.md` is ~900 chars everywhere now
  (matches `brief_max_chars` in `config.json`), documented as
  configurable.

### Added

- `aum search "term" [--limit 25]` — searches events, facts,
  decisions, todos and risks for a term, across `bin/aum.js`, the
  vendored `templates/cli.mjs`, and the MCP server (`memory_search`).
- `aum compact [--keep 200]` — rotates old `events.jsonl` entries into
  `.memory/snapshots/<timestamp>.jsonl`. Nothing is deleted, only
  moved, so history stays complete and auditable while keeping the
  live log small.

## 0.2.0

- `aum init` now runs a one-time, local-only bootstrap scan on a brand-new
  project (`templates/bootstrap.mjs`): reads root `package.json`
  (name/version/description/scripts), summarizes `README.md`, lists
  top-level entries, flags extra/nested `package.json` files, and checks
  git status — including the "`.git` exists but isn't a real repo" case.
  Seeds real `facts`/`risks`/`todos` so a project's memory is never empty
  on day one. No network calls. Skip with `aum init --no-scan`.

## 0.1.0

- Initial release: `.memory/` data layer, vendored zero-dependency engine
  and CLI, Claude Code SessionStart hook, Skill, CLAUDE.md/AGENTS.md
  block installers, Cursor rule installer, optional MCP server, `doctor`
  command.

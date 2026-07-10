# Changelog

## 0.4.0

Competitive response to claude-mem (85k+ stars): it captures everything
automatically via lifecycle hooks but stores memory in SQLite on the
user's machine — not in the repo, not in git, not in a PR diff, gone on
uninstall. This release keeps our flank (git-native, team memory, zero
infra) while closing the automatic-capture gap.

### Added

- **Zero-LLM auto-capture.** `aum init` now wires two more Claude Code
  hooks by default: `PostToolUse` (`.memory/tools/auto-capture.mjs`)
  appends one compact line per `Write`/`Edit`/`MultiEdit`/
  `NotebookEdit`/`Bash` call straight to `events.jsonl` — no LLM call,
  no lock, no state write, ~0ms, and consecutive identical actions
  collapse into one line. `Stop` (`.memory/tools/session-stop.mjs`)
  runs once per turn, writes a single human-readable summary ("Session
  abc123: 14 actions across 5 files — a.js, b.php, …"), and regenerates
  `BRIEF.md`/`handoff.md` exactly once instead of on every edit.
  Auto-captured events stay out of `BRIEF.md`'s `Recent:` line (that's
  the turn summary's job) but remain fully auditable in `events.jsonl`
  and `handoff.md`. Toggle with `aum init --no-auto-capture`, or any
  time with `aum auto on|off|status` (also on the vendored local CLI).
  New engine primitives: `appendEvent()` (fast, unlocked, single-line
  append) and `regenerate()` (public, locked `BRIEF.md`/`handoff.md`
  refresh). `doctor` gained checks for both new hooks and their
  portability.
- README: a **"claude-mem vs this"** section — honest positioning
  against the category leader (different problem: project memory in
  git vs. personal memory in SQLite; they can coexist).
- Named the existing `BRIEF.md` → `handoff.md` → `events.jsonl`
  architecture **"progressive disclosure: three layers"** and applied
  the vocabulary consistently in the README, `.memory/README.md`,
  `templates/claude-block.md`, `templates/agents-block.md`, and the
  Claude Code Skill — so the agent itself understands the cost model
  ("read Layer 1 always, escalate only if needed").

## 0.3.1

Caught by the new CI matrix on its very first real run (windows-latest,
Node 18) — exactly the kind of bug the matrix exists to catch:

- `writeJson`'s atomic rename could fail with `EPERM` on Windows under
  concurrent writes (Defender/AV briefly scanning the just-written temp
  file, or a reader that hasn't released its handle yet — a known
  Windows filesystem quirk, not a bug in our locking). Added a short
  retry-with-backoff around the rename specifically for
  `EPERM`/`EBUSY`/`EACCES`. Regression test simulates the failure by
  patching `fs.renameSync`.

## 0.3.0

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

### Infra / credibility

- Real test suite on Node's built-in `node:test` runner (19 tests,
  `npm test` / `node --test test/run.js`), covering the P0 fixes
  (lock/atomicity with 20 real concurrent processes, hook portability,
  touchSummary), the P1 features (search, compact, unicode-safe
  truncate), and the bootstrap scan. `test/` stays out of the
  published tarball.
- CI now runs the matrix that actually matters for a tool that touches
  hooks, `path.sep`, and atomic renames: ubuntu + windows + macos ×
  Node 18/20/22, plus an end-to-end smoke test (`init` → `doctor` →
  `todo` → `brief` in a throwaway project). Also fixed CI never having
  actually run: it was configured to trigger on `main`, this repo's
  default branch is `master`.
- `npm publish` now runs with `--provenance` from the tag-triggered
  GitHub Actions workflow (OIDC-based, can't be done from a local
  `npm publish`).
- Added `src/core.d.ts` with the full `ProjectMemory` public API,
  wired via `"types"` in `package.json`. Type-checked with `tsc --strict`.
- README: badges (npm version, CI status, zero-dependencies, MIT),
  a comparison table against CLAUDE.md/AGENTS.md/MCP-memory/mem0, an
  Uninstall section, and a `demo.tape` script for rendering a terminal
  GIF with vhs.
- `CONTRIBUTING.md`, `SECURITY.md`, GitHub issue templates, and GitHub
  repo topics (`claude-code`, `mcp`, `ai-agents`, `agent-memory`,
  `context-engineering`, `cursor`, `developer-tools`, `cli`).

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

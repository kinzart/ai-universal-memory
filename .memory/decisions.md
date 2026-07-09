# Decisions

## 2026-07-09T22:56:52.691Z

Vendor the engine into .memory/tools/ of every target project (not just depend on the npm package), so memory keeps working offline and forever, even without ai-universal-memory installed.

_by claude-code_

## 2026-07-09T22:56:52.781Z

Automatic context injection uses a capped ~900 char BRIEF.md via a Claude Code SessionStart hook, not the full history, to keep token cost near zero on every session start.

_by claude-code_

## 2026-07-09T22:56:52.878Z

AGENTS.md/CLAUDE.md/.claude/settings.json are merged via marker comments / JSON merge, never overwritten, so existing project instructions and hooks survive re-installs.

_by claude-code_

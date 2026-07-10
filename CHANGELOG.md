# Changelog

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

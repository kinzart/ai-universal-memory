# Contributing

## Ground rules

1. **Zero dependencies** in the engine, the vendored CLI, and the
   SessionStart hook (`templates/engine.mjs`, `templates/cli.mjs`,
   `templates/session-start.mjs`). Nothing here may `import` a package
   outside Node's standard library. The optional MCP server
   (`mcp/server.js`) is the one exception, and it stays optional.
2. **`templates/engine.mjs` is the source of truth.** It's vendored
   into every project's `.memory/tools/` on `init`. `src/core.js` only
   re-exports it — never add logic there instead.
3. **`bin/aum.js` and `templates/cli.mjs` are mirrors.** Any command
   fix or addition in one needs the same fix in the other, since one
   is the npx-installed CLI and the other is the durable, vendored,
   works-without-the-package copy that ships to every user's project.
4. **Backward compatible schema.** A `.memory/` folder created by an
   older version must keep working without a manual migration. If you
   need to change a file's shape, read the old shape and write the new
   one — don't assume every field already exists.
5. **Installers are idempotent and never destroy user data.**
   `AGENTS.md`/`CLAUDE.md` get a marked block merged in; everything
   else in those files is preserved. `.claude/settings.json` gets a
   hook merged into whatever's already there.

## Running tests

```bash
npm test
```

Zero test-framework dependency — uses Node's built-in `node:test`
runner (`test/run.js`). `test/` is intentionally excluded from the
published npm package (see `files` in `package.json`); it's dev-only.

## Making a change

1. Fix or add the behavior in `templates/engine.mjs` (and the CLI
   mirrors if it's a command).
2. Add a test in `test/run.js` that would have caught the bug or
   exercises the new feature.
3. Add an entry to `CHANGELOG.md`.
4. Commit with a `fix:`/`feat:`/`test:`/`docs:`/`ci:` prefix.

## Reporting a bug

Open an issue with: what you ran, what you expected, what happened,
and — if it's memory-state related — the relevant bits of
`.memory/state.json` or `.memory/events.jsonl` (redact anything
sensitive first; that file is a project's own history, not ours).

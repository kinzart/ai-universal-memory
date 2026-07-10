<!-- ai-universal-memory:start -->
## Project memory (AI Universal Memory)

This project persists memory in `.memory/`, read via progressive
disclosure — read Layer 1 always, escalate only if you need to:

- **Layer 1 — `.memory/BRIEF.md`.** Injected automatically at the start
  of every session via a `SessionStart` hook — you should already have
  it above. Cheap, always current.
- **Layer 2 — `.memory/handoff.md`.** Full current state. Read on demand
  if Layer 1 isn't enough.
- **Layer 3 — `.memory/events.jsonl`.** Full history. Read (or
  `node .memory/tools/cli.mjs search "term"`) only if you need deep
  context.

Routine edits (`Write`/`Edit`/`Bash`) are auto-captured by `PostToolUse`/
`Stop` hooks — no LLM, one line per action, one summary per turn. That
does **not** replace logging meaningful work yourself:

```bash
node .memory/tools/cli.mjs log "what you did" --agent "claude-code"
node .memory/tools/cli.mjs decision "decision taken" --agent "claude-code"
node .memory/tools/cli.mjs todo "what's left" --agent "claude-code"
```

Full docs: `.memory/README.md`. The `ai-universal-memory` Skill covers
the same ground in more detail. Rule: the AI does not remember, the
project remembers.
<!-- ai-universal-memory:end -->

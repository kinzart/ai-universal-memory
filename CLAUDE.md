<!-- ai-universal-memory:start -->
## Project memory (AI Universal Memory)

This project persists memory in `.memory/`. A short digest from
`.memory/BRIEF.md` is injected automatically at the start of every
session via a `SessionStart` hook — you should already have it above.
If it's missing, or you need more depth, read in this order and stop as
soon as you have enough:

1. `.memory/BRIEF.md`
2. `.memory/handoff.md`
3. `.memory/events.jsonl` (tail only, only if you need deep history)

After meaningful work, log it so the next session (any engine, any
human) picks up correctly:

```bash
node .memory/tools/cli.mjs log "what you did" --agent "claude-code"
node .memory/tools/cli.mjs decision "decision taken" --agent "claude-code"
node .memory/tools/cli.mjs todo "what's left" --agent "claude-code"
```

Full docs: `.memory/README.md`. The `ai-universal-memory` Skill covers
the same ground in more detail. Rule: the AI does not remember, the
project remembers.
<!-- ai-universal-memory:end -->

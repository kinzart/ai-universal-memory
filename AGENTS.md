<!-- ai-universal-memory:start -->
## Project memory (AI Universal Memory)

This project persists memory in `.memory/` — state, decisions, pending
tasks, risks and facts that survive across sessions, AI engines, and
humans. Read it via progressive disclosure — go deeper only if you need to:

- **Layer 1 — `.memory/BRIEF.md`.** Read this before doing anything else
  (it's short, cheap to read).
- **Layer 2 — `.memory/handoff.md`.** Full current state — read on demand.
- **Layer 3 — `.memory/events.jsonl`.** Full history — read (or
  `node .memory/tools/cli.mjs search "term"`) only if you need deep context.

After doing meaningful work, log it:

```bash
node .memory/tools/cli.mjs log "what you did" --agent "<your-name>"
node .memory/tools/cli.mjs decision "decision taken" --agent "<your-name>"
node .memory/tools/cli.mjs todo "what's left" --agent "<your-name>"
node .memory/tools/cli.mjs handoff
```

Full docs: `.memory/README.md`. Rule: the AI does not remember, the
project remembers.
<!-- ai-universal-memory:end -->

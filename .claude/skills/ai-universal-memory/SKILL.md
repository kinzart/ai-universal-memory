---
name: ai-universal-memory
description: Use this skill at the start of any work in this project, and whenever picking up work another AI or human session left off — reading/writing project state, decisions, pending tasks, risks, or facts that need to survive across sessions, engines, or people. Also use before ending a work session to record what happened.
---

# AI Universal Memory

This project keeps a portable memory in `.memory/`. It survives across
chat sessions, across AI engines (Claude, GPT, Gemini, Cursor, ...), and
across humans. Full docs: `.memory/README.md`.

Core rule: **the AI does not remember. The project remembers.**

## Before doing any work: progressive disclosure, three layers

A short digest is usually already injected automatically at session start
(`.memory/BRIEF.md`). Read Layer 1 always; escalate only if you need to:

1. **Layer 1 — `.memory/BRIEF.md`** (cheap, a few hundred characters,
   auto-injected). If you don't see it, read it now.
2. **Layer 2 — `.memory/handoff.md`** (full current state). Read on
   demand if Layer 1 isn't enough.
3. **Layer 3 — `.memory/events.jsonl`** (full history). Read the tail,
   or `node .memory/tools/cli.mjs search "term"`, only if you need deep
   history.

```bash
node .memory/tools/cli.mjs brief
node .memory/tools/cli.mjs read
node .memory/tools/cli.mjs last 30
node .memory/tools/cli.mjs search "term"
```

## While working

Routine edits (`Write`/`Edit`/`Bash`) are already auto-captured by
`PostToolUse`/`Stop` hooks — one line per action, no LLM, consolidated
into one summary per turn. That does **not** replace logging meaningful
decisions, pending work, risks and facts yourself as you go — don't wait
until the end, and don't skip it because "the chat has it": the chat is
not memory, `.memory/` is.

```bash
node .memory/tools/cli.mjs log "what you did" --agent "claude-code"
node .memory/tools/cli.mjs decision "decision taken" --agent "claude-code"
node .memory/tools/cli.mjs todo "what's left" --agent "claude-code"
node .memory/tools/cli.mjs risk "important risk" --agent "claude-code"
node .memory/tools/cli.mjs fact "confirmed fact" --status confirmed --source "..." --agent "claude-code"
```

## Rules

- Do not rely on chat history as the source of truth — `.memory/` is.
- Do not overwrite or delete existing memory; append/log instead.
- Never mark an assumption as `confirmed` — use `needs_validation` or
  `probable`, and cite a source when you have one.
- `BRIEF.md` and `handoff.md` are auto-generated; edit via the CLI, not
  by hand, so they stay in sync.
- Keep entries short and specific — this file is read by machines and
  humans, both benefit from concision.

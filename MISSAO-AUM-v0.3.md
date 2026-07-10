# MISSÃO: ai-universal-memory v0.2.0 → v0.3.0

> Cole este arquivo na raiz do repo e rode no Claude Code:
> `claude "Leia MISSAO-AUM-v0.3.md e execute a missão inteira, na ordem P0 → P1 → P2. Confirme cada critério de aceite antes de avançar de fase."`

## Contexto

Auditoria externa do pacote publicado (v0.2.0, tarball do npm) encontrou 6 bugs reais confirmados por teste, 3 features de roadmap que destravam adoção, e a infraestrutura de credibilidade que falta no GitHub (CI, testes visíveis, demo). Esta missão corrige tudo isso mantendo a filosofia do projeto.

**Análise competitiva (claude-mem, 85k+ stars):** o líder da categoria captura tudo automaticamente via lifecycle hooks, mas guarda a memória em SQLite na máquina do usuário (`~/.claude-mem/`) — a memória não vive no repo, não viaja pelo git, não aparece em PR diff e morre na desinstalação. Nosso flanco é exatamente esse: **memória git-native, de time, zero infra**. Desta análise saem três adições à missão: (a) captura automática zero-disciplina mantendo zero-dep (P1.0 — a maior fraqueza atual do AUM é depender do agente lembrar de logar); (b) seção de posicionamento "claude-mem vs this" no README (P2.4, item 5); (c) batizar a arquitetura BRIEF → handoff → events como *progressive disclosure* em 3 camadas (P2.4, item 6).

## Regras invioláveis

1. **Zero dependências** no engine, no CLI vendorizado e no hook. Nada de lockfile, nada de `npm install` para o fluxo principal.
2. **Backward compat do schema**: um `.memory/` criado pela v0.1/v0.2 tem que continuar funcionando sem migração manual. Se precisar mudar formato, ler o antigo e escrever o novo.
3. **Fonte da verdade é `templates/engine.mjs`** (é ele que é vendorizado). `src/core.js` apenas reexporta. Toda mudança de engine acontece lá.
4. **`bin/aum.js` e `templates/cli.mjs` são espelhos**: qualquer fix de comando aplicado num tem que ser aplicado no outro.
5. Cada fix ganha um teste. Cada mudança entra no `CHANGELOG.md`. Commits no padrão `fix:`, `feat:`, `test:`, `docs:`, `ci:`.
6. Não sobrescrever dados do usuário, nunca. Os installers continuam idempotentes.

---

## P0 — Bugs confirmados (corrigir primeiro)

Já executado integralmente em sessão anterior (v0.3.0 / v0.3.1, publicado no npm, CI verde). Ver CHANGELOG.md. Não repetir.

## P1.1 / P1.2 / P1.3 — já executados

`aum search`, `aum compact`, truncate seguro para code points — já implementados e publicados em v0.3.0. Não repetir.

## P2.1 / P2.2 / P2.3 / P2.5 — já executados

Suíte node:test, CI matrix (ubuntu/windows/macos × node 18/20/22, com o bug real de EPERM no Windows já corrigido em v0.3.1), provenance no publish, src/core.d.ts, CONTRIBUTING/SECURITY/issue templates/topics — já feitos. Não repetir.

---

## O que falta desta missão (NOVO nesta versão do arquivo)

### P1.0 — Auto-captura zero-disciplina (a resposta ao claude-mem, do nosso jeito)

Hoje a memória depende do agente *lembrar* de rodar `cli.mjs log`. Se ele esquece, a memória mente por omissão. O fix: dois hooks novos do Claude Code, ambos zero-dep e sem LLM.

**Desenho:**

- **`PostToolUse`** (matcher `Write|Edit|MultiEdit|NotebookEdit|Bash`) → `auto-capture.mjs`: apenda UMA linha compacta em `events.jsonl` (`action: "auto"`). Não toca `state.json`, não regenera derivados, não usa lock — custo ~0ms, nunca bloqueia o agente.
- **`Stop`** (fim do turno) → `session-stop.mjs`: consolida a sessão em UMA linha humana ("Session abc123: 14 ações em 5 arquivo(s) — a.js, b.php, …") e regenera BRIEF/handoff **uma vez por turno** em vez de a cada edit.
- Ligado por padrão no `init`; desligável com `--no-auto-capture`, com `aum auto off`, ou editando `auto_capture: false` no `.memory/config.json` (o hook checa o config e sai em silêncio).
- Eventos `auto` ficam **fora** do `Recent:` do BRIEF (senão viram ruído); continuam auditáveis no `events.jsonl` e no handoff.

**Novo template `templates/auto-capture.mjs` (vendorizado):**

```js
#!/usr/bin/env node
// AI Universal Memory — PostToolUse auto-capture.
// Reads the hook payload from stdin and appends ONE compact line to
// .memory/events.jsonl. No LLM, no state writes, no derived regeneration,
// no lock — designed to cost ~0ms and never block the agent. Turn-level
// consolidation happens once, in session-stop.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectMemory } from "./engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, "..", "..");

try {
  const memory = new ProjectMemory(root);
  if (!memory.isInitialized()) process.exit(0);
  if (memory.config().auto_capture === false) process.exit(0);

  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const tool = payload.tool_name || "tool";
  const input = payload.tool_input || {};

  let target = input.file_path || input.notebook_path || "";
  if (tool === "Bash") target = (input.command || "").split("\n")[0].slice(0, 80);
  if (target.startsWith(root)) target = target.slice(root.length + 1);

  const summary = target ? `${tool}: ${target}` : tool;

  // Noise control: collapse consecutive identical actions (15 edits on the
  // same file become 1 line).
  const last = memory.lastEvents(1)[0];
  if (last && last.action === "auto" && last.summary === summary) process.exit(0);

  memory.appendEvent({
    time: new Date().toISOString(),
    agent: "claude-code",
    action: "auto",
    status: "done",
    summary,
    session: String(payload.session_id || "").slice(0, 8) || null
  });
} catch {
  // Telemetry must never break the agent.
}
process.exit(0);
```

**Novo template `templates/session-stop.mjs` (vendorizado):**

```js
#!/usr/bin/env node
// AI Universal Memory — Stop hook. Consolidates the turn: if auto-captured
// events exist for this session, writes ONE human-grade summary line (which
// files were touched) and regenerates BRIEF.md + handoff.md exactly once —
// instead of on every single edit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectMemory } from "./engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, "..", "..");

try {
  const memory = new ProjectMemory(root);
  if (!memory.isInitialized()) process.exit(0);

  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const session = String(payload.session_id || "").slice(0, 8);

  const autos = memory
    .lastEvents(500)
    .filter(e => e.action === "auto" && e.session === session);

  if (autos.length) {
    const files = [...new Set(autos.map(e => e.summary.replace(/^\w+: /, "")))];
    const head = files.slice(0, 5).join(", ");
    const more = files.length > 5 ? ` +${files.length - 5} more` : "";
    memory.log({
      agent: "claude-code",
      action: "note",
      status: "done",
      summary: `Session ${session}: ${autos.length} auto-captured action(s) across ${files.length} target(s) — ${head}${more}`
    });
  } else {
    memory.regenerate();
  }
} catch {
  // Non-fatal by design.
}
process.exit(0);
```

**Mudanças no engine (`templates/engine.mjs`):**

```js
  // Fast append for auto-capture: events.jsonl only. Small single-line
  // appendFileSync writes are atomic on POSIX — no lock needed here.
  appendEvent(event) {
    ensureDir(this.dir);
    fs.appendFileSync(this.eventsFile, JSON.stringify(event) + "\n", "utf8");
    return event;
  }

  // Public, locked regeneration of BRIEF.md + handoff.md.
  regenerate() {
    return withLock(this.dir, () => this._regenerateDerived());
  }
```

No `config()`/`init()`, adicionar `auto_capture: true` aos defaults. No `brief()`, filtrar o ruído:

```js
    const events = this.lastEvents(50)
      .filter(e => e.action !== "auto")
      .slice(-cfg.brief_max_events);
```

**Instalador (`src/installers.js`):**

```js
/** Merge PostToolUse + Stop hooks for zero-discipline auto-capture. */
export function installAutoCapture(targetRoot) {
  const settingsPath = path.join(targetRoot, ".claude", "settings.json");
  const settings = readJson(settingsPath, {});
  settings.hooks = settings.hooks || {};

  const ensure = (eventName, matcher, script) => {
    settings.hooks[eventName] = settings.hooks[eventName] || [];
    const command = `node "$CLAUDE_PROJECT_DIR/.memory/tools/${script}"`;
    const marker = `.memory/tools/${script}`;
    let found = false;
    for (const group of settings.hooks[eventName]) {
      for (const h of group.hooks || []) {
        if (typeof h.command === "string" && h.command.includes(marker)) {
          h.command = command;
          found = true;
        }
      }
    }
    if (!found) {
      const group = matcher
        ? { matcher, hooks: [{ type: "command", command }] }
        : { hooks: [{ type: "command", command }] };
      settings.hooks[eventName].push(group);
    }
  };

  ensure("PostToolUse", "Write|Edit|MultiEdit|NotebookEdit|Bash", "auto-capture.mjs");
  ensure("Stop", null, "session-stop.mjs");

  writeJson(settingsPath, settings);
  return settingsPath;
}
```

E ajustar o que já existe:

- `vendorEngine`: a lista de arquivos copiados vira `["engine.mjs", "cli.mjs", "session-start.mjs", "auto-capture.mjs", "session-stop.mjs"]`.
- `installAll(targetRoot, { engines, autoCapture = true })`: quando `engines.includes("claude") && autoCapture`, chamar `installAutoCapture` e gravar `results.autoCapture = true`.
- `doctor()`: checks novos para os dois scripts vendorizados e para a presença dos hooks `PostToolUse`/`Stop` no settings (mesma técnica do check de `SessionStart`, exigindo `$CLAUDE_PROJECT_DIR`).

**CLI (`bin/aum.js` e `templates/cli.mjs` — os dois):**

- `init`/`install` ganham `--no-auto-capture` → passa `autoCapture: false` pro `installAll` e grava `auto_capture: false` no config.
- Comando novo pra ligar/desligar sem editar JSON na mão:

```js
    case "auto": {
      const mode = (args[1] || "").toLowerCase();
      if (!["on", "off", "status"].includes(mode)) {
        console.error("Usage: aum auto on|off|status");
        process.exit(1);
      }
      const cfgPath = path.join(root, ".memory", "config.json");
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      if (mode === "status") {
        console.log(`auto_capture: ${cfg.auto_capture !== false}`);
        break;
      }
      cfg.auto_capture = mode === "on";
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
      console.log(`auto_capture set to ${cfg.auto_capture}.`);
      break;
    }
```

**Testes novos (adicionar ao `test/run.js`):**

```js
test("auto-capture appends and dedupes consecutive identical events", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  const before = m.lastEvents(100).length;
  m.appendEvent({ time: new Date().toISOString(), agent: "claude-code", action: "auto", status: "done", summary: "Edit: a.js", session: "abc12345" });
  m.appendEvent({ time: new Date().toISOString(), agent: "claude-code", action: "auto", status: "done", summary: "Edit: b.js", session: "abc12345" });
  assert.equal(m.lastEvents(100).length, before + 2);
});

test("brief hides auto events, handoff keeps them auditable", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  m.appendEvent({ time: new Date().toISOString(), agent: "claude-code", action: "auto", status: "done", summary: "Edit: noisy.js", session: "abc12345" });
  m.regenerate();
  assert.ok(!m.brief().includes("noisy.js"));
  assert.ok(fs.readFileSync(path.join(root, ".memory", "events.jsonl"), "utf8").includes("noisy.js"));
});
```

Documentar no README: "captura automática sem LLM — uma linha por ação, um resumo por turno, tudo em texto puro no seu git". Essa frase é o contraste inteiro com o claude-mem.

### P2.4, itens 5 e 6 — README

5. **Seção "claude-mem vs this"** — comparação honesta com o líder da categoria (85k+ stars). Não somos concorrentes diretos: ele é memória *do usuário na máquina do usuário*; nós somos memória *do projeto no repositório*. São complementares, e dizer isso com clareza converte mais do que fingir que ele não existe:

```markdown
## claude-mem vs this

[claude-mem](https://github.com/thedotmack/claude-mem) is excellent at what it does:
automatic, AI-compressed memory for *you*, on *your* machine. This project solves a
different problem: memory that belongs to the *project* and travels with it. They can
coexist in the same setup.

|                                  | claude-mem                          | ai-universal-memory                 |
|----------------------------------|--------------------------------------|--------------------------------------|
| Where memory lives               | SQLite in `~/.claude-mem/`          | `.memory/` inside the repo, in git  |
| Travels to a teammate on clone?  | No — their instance starts empty    | Yes — `git clone` ships the memory  |
| Auditable in a PR diff?          | No (database + vectors)             | Yes (readable markdown/json)        |
| Stack                            | Node 20+, Bun, Chroma, worker daemon| Zero dependencies, plain files      |
| Survives uninstall?              | No                                  | Yes — vendored engine               |
| Capture cost                     | LLM calls to compress               | Zero tokens by construction         |
| Semantic (vector) search         | Yes                                 | No — plain-text `aum search`        |
| Automatic capture                | Yes (lifecycle hooks)               | Yes (PostToolUse/Stop, no LLM)      |
```

6. **Batizar a arquitetura como *progressive disclosure* em 3 camadas.** O claude-mem faz marketing dessa filosofia; nós já a temos e não a nomeamos. Renomear a seção "Why this never burns tokens" para **"Progressive disclosure: three layers"** — Layer 1: `BRIEF.md` (~150–220 tokens, automático, toda sessão); Layer 2: `handoff.md` (sob demanda, estado completo); Layer 3: `events.jsonl` (histórico profundo, só quando o agente decide que precisa). Aplicar o mesmo vocabulário em `templates/claude-block.md`, `templates/agents-block.md` e `templates/SKILL.md`, para o próprio agente entender o modelo de custo ("read Layer 1 always, escalate only if needed").

---

## Critérios de aceite — P1.0 (rodar antes de fechar)

```bash
# P1.0 — auto-captura
cd /tmp/x
echo '{"tool_name":"Edit","tool_input":{"file_path":"'$PWD'/a.js"},"session_id":"abc12345"}' \
  | node .memory/tools/auto-capture.mjs
tail -1 .memory/events.jsonl | grep '"action":"auto"' | grep "Edit: a.js"   # capturou
echo '{"session_id":"abc12345"}' | node .memory/tools/session-stop.mjs
node .memory/tools/cli.mjs brief | grep -v "Edit: a.js"                     # BRIEF sem ruído auto
node .memory/tools/cli.mjs brief | grep "Session abc12345"                  # consolidado no Last:
node bin/aum.js auto off --path /tmp/x && node bin/aum.js auto status --path /tmp/x
```

## Checklist de lançamento v0.3.2 (ou próxima minor, conforme o caso)

- [ ] CHANGELOG.md com as entradas desta missão
- [ ] Bump de versão + tag
- [ ] `npm publish --provenance --access public` (via CI, tag push)
- [ ] Seção "claude-mem vs this" no README + termo *progressive disclosure* aplicado (README, claude-block.md, agents-block.md, SKILL.md)
- [ ] demo.gif com auto-captura demonstrada (um edit acontece → `brief` mostra o consolidado da sessão) — best-effort, não bloqueante (vhs travou no ambiente da sessão anterior)
- [ ] Divulgação (Show HN, r/ClaudeAI, r/cursor, dev.to, PRs pra awesome-lists) — **não é executada automaticamente**; é decisão e ação do usuário, fora do escopo de execução autônoma.

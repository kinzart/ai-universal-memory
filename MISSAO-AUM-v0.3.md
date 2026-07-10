# MISSÃO: ai-universal-memory v0.2.0 → v0.3.0

> Cole este arquivo na raiz do repo e rode no Claude Code:
> `claude "Leia MISSAO-AUM-v0.3.md e execute a missão inteira, na ordem P0 → P1 → P2. Confirme cada critério de aceite antes de avançar de fase."`

## Contexto

Auditoria externa do pacote publicado (v0.2.0, tarball do npm) encontrou 6 bugs reais confirmados por teste, 3 features de roadmap que destravam adoção, e a infraestrutura de credibilidade que falta no GitHub (CI, testes visíveis, demo). Esta missão corrige tudo isso mantendo a filosofia do projeto.

## Regras invioláveis

1. **Zero dependências** no engine, no CLI vendorizado e no hook. Nada de lockfile, nada de `npm install` para o fluxo principal.
2. **Backward compat do schema**: um `.memory/` criado pela v0.1/v0.2 tem que continuar funcionando sem migração manual. Se precisar mudar formato, ler o antigo e escrever o novo.
3. **Fonte da verdade é `templates/engine.mjs`** (é ele que é vendorizado). `src/core.js` apenas reexporta. Toda mudança de engine acontece lá.
4. **`bin/aum.js` e `templates/cli.mjs` são espelhos**: qualquer fix de comando aplicado num tem que ser aplicado no outro.
5. Cada fix ganha um teste. Cada mudança entra no `CHANGELOG.md`. Commits no padrão `fix:`, `feat:`, `test:`, `docs:`, `ci:`.
6. Não sobrescrever dados do usuário, nunca. Os installers continuam idempotentes.

---

## P0 — Bugs confirmados (corrigir primeiro)

### P0.1 — Hook com caminho absoluto quebra a portabilidade (o produto É portabilidade)

**Evidência:** `aum init` gera em `.claude/settings.json`:

```json
{ "type": "command", "command": "node \"/home/claude/testproj/.memory/tools/session-start.mjs\"" }
```

Esse arquivo vai pro git. Na máquina do colega, o path não existe → o hook morre silenciosamente e a memória "automática" nunca carrega. Claude Code expande `$CLAUDE_PROJECT_DIR` em comandos de hook — é exatamente para isso que a variável existe (e o `session-start.mjs` já lê `process.env.CLAUDE_PROJECT_DIR`).

**Fix em `src/installers.js` → `installClaudeHook`:**

```js
export function installClaudeHook(targetRoot) {
  const settingsPath = path.join(targetRoot, ".claude", "settings.json");
  const settings = readJson(settingsPath, {});

  // Portable across machines: Claude Code expands $CLAUDE_PROJECT_DIR at runtime.
  const command = `node "$CLAUDE_PROJECT_DIR/.memory/tools/session-start.mjs"`;

  settings.hooks = settings.hooks || {};
  settings.hooks.SessionStart = settings.hooks.SessionStart || [];

  const marker = ".memory/tools/session-start.mjs";
  let found = false;
  for (const group of settings.hooks.SessionStart) {
    if (!Array.isArray(group.hooks)) continue;
    for (const h of group.hooks) {
      if (typeof h.command === "string" && h.command.includes(marker)) {
        h.command = command; // auto-migrates old absolute-path installs
        found = true;
      }
    }
  }

  if (!found) {
    settings.hooks.SessionStart.push({ hooks: [{ type: "command", command }] });
  }

  writeJson(settingsPath, settings);
  return settingsPath;
}
```

Bônus: como o loop já substitui comandos que contêm o marker, **rodar `aum install` migra instalações antigas sozinho**. Documentar isso no CHANGELOG.

**E no `doctor()` (installers.js), trocar o check do hook por um que pega regressão:**

```js
  const settings = readJson(path.join(targetRoot, ".claude", "settings.json"), {});
  const hookCmd = ((settings.hooks || {}).SessionStart || [])
    .flatMap(g => g.hooks || [])
    .map(h => h.command || "")
    .find(c => c.includes("session-start.mjs")) || "";
  checks.push({ name: ".claude/settings.json SessionStart hook", ok: Boolean(hookCmd) });
  checks.push({
    name: "SessionStart hook is portable ($CLAUDE_PROJECT_DIR, no absolute path)",
    ok: hookCmd.includes("$CLAUDE_PROJECT_DIR")
  });
```

### P0.2 — Falha silenciosa em `todo-done` e `risk-resolve`

**Evidência:** `node .memory/tools/cli.mjs todo-done id-inexistente` imprime `Todo marked done.` e sai com exit 0. Para um agente de IA isso é veneno: ele acredita que fechou a tarefa e segue em frente com a memória mentindo.

**Fix em `bin/aum.js` E em `templates/cli.mjs` (os dois!):**

```js
    case "todo-done": {
      const t = memory.completeTodo(args[1], { agent: flag("--agent", "unknown") });
      if (!t) {
        console.error(`Todo not found: ${args[1] || "(no id given)"}. Run: brief or read to see ids.`);
        process.exit(1);
      }
      console.log(`Todo marked done (${t.id}).`);
      break;
    }
    case "risk-resolve": {
      const r = memory.resolveRisk(args[1], { agent: flag("--agent", "unknown") });
      if (!r) {
        console.error(`Risk not found: ${args[1] || "(no id given)"}. Run: brief or read to see ids.`);
        process.exit(1);
      }
      console.log(`Risk resolved (${r.id}).`);
      break;
    }
```

Aplicar o mesmo princípio nos outros comandos de escrita: se `addTodo`/`addRisk`/`addDecision`/`addFact` retornarem `null` (texto vazio), imprimir erro claro e `exit 1`.

### P0.3 — Corrida de escrita em `state.json` e nos derivados (BRIEF/handoff)

**Evidência:** 10 `log` em paralelo → `events.jsonl` sobrevive (append pequeno é atômico no Linux), mas `state.json` é read-modify-write sem lock (last-write-wins pode perder `engines_seen`) e `_regenerateDerived()` reescreve `BRIEF.md`/`handoff.md` concorrentemente. Com subagents do Claude Code rodando em paralelo — cenário comum — isso é roleta: pode corromper JSON no meio de um `writeFileSync` interrompido ou perder estado.

**Fix em `templates/engine.mjs` — escrita atômica + lock zero-dep:**

```js
// --- atomic write: never leave a half-written JSON on disk -----------------
function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file); // rename on same fs is atomic
}

// --- cross-process lock via mkdir (atomic on every OS), zero deps ----------
const LOCK_STALE_MS = 10_000;

function sleepSync(ms) {
  // Atomics.wait is allowed on Node's main thread — a real sleep, no busy loop.
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}

function withLock(memoryDir, fn, { retries = 100, delayMs = 25 } = {}) {
  const lockDir = path.join(memoryDir, ".lock");
  for (let i = 0; i < retries; i++) {
    try {
      fs.mkdirSync(lockDir);
      try {
        return fn();
      } finally {
        fs.rmSync(lockDir, { recursive: true, force: true });
      }
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      // Steal stale locks left by a crashed process.
      try {
        const age = Date.now() - fs.statSync(lockDir).mtimeMs;
        if (age > LOCK_STALE_MS) {
          fs.rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch { /* lock vanished between checks — just retry */ }
      sleepSync(delayMs);
    }
  }
  throw new Error(`Could not acquire .memory lock after ${retries} attempts.`);
}
```

Depois, envolver **todo método mutador** com o lock. Padrão a aplicar em `log`, `setPhase`, `addDecision`, `addTodo`, `completeTodo`, `addRisk`, `resolveRisk`, `addFact` e no `init`:

```js
  log(entry) {
    return withLock(this.dir, () => this._logUnlocked(entry));
  }

  _logUnlocked({ agent = "unknown", action = "note", status = "done", summary = "", next = [], error = null, touchSummary = true }) {
    // ...corpo atual do log() vem para cá...
  }
```

Atenção: métodos mutadores que hoje chamam `this.log(...)` internamente (ex.: `addTodo` → `log`) passam a chamar `this._logUnlocked(...)` para não dar deadlock (o lock não é reentrante).

`.lock` deve ser ignorado: adicionar `tools/../.lock` não — simplesmente criar `.memory/.gitignore` no init com o conteúdo:

```
.lock/
```

### P0.4 — `fact`/`todo`/`risk`/`decision` poluem o `last_summary` do estado

**Evidência:** depois de `fact "Deploy é na Vercel"`, o BRIEF mostra `Last: Deploy é na Vercel` — o "último trabalho" do projeto virou o último fato cadastrado. O campo mais nobre do handoff perde o significado.

**Fix:** `log()` ganha `touchSummary` (já previsto na assinatura acima). Só `action: "note"` (e o `init`) atualizam `status`/`last_summary`; os registradores passam `touchSummary: false`:

```js
  // dentro de _logUnlocked, na hora de gravar o state:
  const patch = {
    ...state,
    last_agent: agent,
    last_action: action,
    last_updated: event.time,
    engines_seen: Array.from(enginesSeen)
  };
  if (touchSummary) {
    patch.status = status;
    patch.last_summary = summary;
  }
  writeJson(this.stateFile, patch);
```

```js
  // nos registradores:
  this._logUnlocked({ agent, action: "decision", summary: text, touchSummary: false });
  this._logUnlocked({ agent, action: "todo", summary: text, touchSummary: false });
  this._logUnlocked({ agent, action: "todo_done", summary: item.text, touchSummary: false });
  this._logUnlocked({ agent, action: "risk", summary: text, touchSummary: false });
  this._logUnlocked({ agent, action: "risk_resolved", summary: item.text, touchSummary: false });
  this._logUnlocked({ agent, action: "fact", summary: fact, touchSummary: false });
```

Todos continuam aparecendo em `Recent:` do BRIEF (vêm de `events.jsonl`), e todos e riscos já têm linhas próprias. O `Last:` volta a significar "último trabalho real".

### P0.5 — Versão do MCP server hardcoded em "0.1.0"

**Fix em `mcp/server.js`:**

```js
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const server = new Server(
  { name: "ai-universal-memory", version: pkg.version },
  { capabilities: { tools: {}, resources: {} } }
);
```

E, já que está no arquivo: o MCP **não expõe** `todo-done` nem `risk-resolve` — o agente via MCP consegue criar tarefa mas não fechar. Adicionar as duas tools:

```js
    {
      name: "memory_todo_done",
      description: "Mark a pending task as done by id.",
      inputSchema: { type: "object", properties: { id: { type: "string" }, agent: { type: "string" } }, required: ["id"] }
    },
    {
      name: "memory_risk_resolve",
      description: "Resolve an open risk by id.",
      inputSchema: { type: "object", properties: { id: { type: "string" }, agent: { type: "string" } }, required: ["id"] }
    },
```

```js
    case "memory_todo_done": {
      const t = memory.completeTodo(a.id, { agent: a.agent || "mcp-agent" });
      return text(t ? `Todo marked done (${t.id}).` : `Todo not found: ${a.id}`);
    }
    case "memory_risk_resolve": {
      const r = memory.resolveRisk(a.id, { agent: a.agent || "mcp-agent" });
      return text(r ? `Risk resolved (${r.id}).` : `Risk not found: ${a.id}`);
    }
```

### P0.6 — README promete `~700 chars` num lugar e `~900` no outro

No diagrama da árvore o BRIEF diz `~700 chars`; no texto, `~900`. O código usa `brief_max_chars: 900`. Padronizar tudo em **900** (e mencionar que é configurável via `.memory/config.json`).

---

## P1 — Features que destravam adoção

### P1.1 — `aum search` (primeiro item do roadmap; é o que falta pra memória ser consultável)

**Engine (`templates/engine.mjs`), novo método:**

```js
  search(term, { limit = 25 } = {}) {
    const q = String(term || "").trim().toLowerCase();
    if (!q) return [];
    const hit = (s) => typeof s === "string" && s.toLowerCase().includes(q);
    const out = [];

    for (const e of this.lastEvents(10000)) {
      if (hit(e.summary)) out.push({ kind: "event", time: e.time, agent: e.agent, text: e.summary });
    }
    const facts = readJson(this.factsFile, { confirmed: [], probable: [], needs_validation: [] });
    for (const bucket of ["confirmed", "probable", "needs_validation"]) {
      for (const f of facts[bucket]) {
        if (hit(f.fact) || hit(f.source)) out.push({ kind: `fact:${bucket}`, time: f.created_at, agent: f.agent, text: f.fact });
      }
    }
    for (const d of readJson(this.decisionsJsonFile, [])) {
      if (hit(d.text)) out.push({ kind: "decision", time: d.created_at, agent: d.agent, text: d.text });
    }
    for (const t of readJson(this.todoJsonFile, [])) {
      if (hit(t.text)) out.push({ kind: t.done ? "todo:done" : "todo:pending", id: t.id, time: t.created_at, agent: t.agent, text: t.text });
    }
    for (const r of readJson(this.risksJsonFile, [])) {
      if (hit(r.text)) out.push({ kind: r.resolved ? "risk:resolved" : "risk:open", id: r.id, time: r.created_at, agent: r.agent, text: r.text });
    }

    out.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    return out.slice(-limit);
  }
```

**CLI (`bin/aum.js` e `templates/cli.mjs`):**

```js
    case "search": {
      const term = textFromArgs();
      const results = memory.search(term, { limit: Number(flag("--limit", "25")) });
      if (!results.length) {
        console.log(`No matches for "${term}".`);
        break;
      }
      for (const r of results) {
        const id = r.id ? ` (${r.id})` : "";
        console.log(`[${r.kind}]${id} ${String(r.time).slice(0, 16)} ${r.agent} — ${r.text}`);
      }
      break;
    }
```

**MCP:** tool `memory_search` com `{ term, limit }`, retornando as linhas formatadas.

### P1.2 — `aum compact` (o `events.jsonl` hoje cresce para sempre)

Rotaciona o histórico antigo para `snapshots/` (a pasta já existe e está vazia desde o init — dar uso a ela):

```js
  compact({ keep = 200 } = {}) {
    return withLock(this.dir, () => {
      const lines = read(this.eventsFile, "").trim().split("\n").filter(Boolean);
      if (lines.length <= keep) return { rotated: 0, kept: lines.length };
      const cutoff = lines.length - keep;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      write(path.join(this.snapshotsDir, `events-${stamp}.jsonl`), lines.slice(0, cutoff).join("\n") + "\n");
      write(this.eventsFile, lines.slice(cutoff).join("\n") + "\n");
      this._regenerateDerived();
      return { rotated: cutoff, kept: keep };
    });
  }
```

CLI: `aum compact [--keep 200]` imprimindo `Rotated N events to .memory/snapshots/, kept M.` Nada é apagado — só movido, continua auditável e commitável.

### P1.3 — `truncate` seguro para emoji/acentos combinados

`str.slice()` corta no meio de surrogate pairs (💡 vira lixo no BRIEF). Trocar por corte por code points:

```js
function truncate(str, max) {
  if (!str) return "";
  const chars = Array.from(str); // splits by code points, not UTF-16 units
  if (chars.length <= max) return str;
  return chars.slice(0, max - 1).join("").trimEnd() + "…";
}
```

---

## P2 — Infra de credibilidade (o que transforma "pacote" em "projeto que se estrela")

### P2.1 — Suíte de testes real (zero-dep, `node:test`)

Criar `test/run.js` (o `package.json` já aponta pra ele e hoje ele não existe — `npm test` quebra). Usar `node --test` sem framework. Cobertura mínima:

```js
// test/run.js — zero-dep test suite. Run: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execFile } from "node:child_process";
import { ProjectMemory } from "../src/core.js";
import { mergeBlock, installClaudeHook } from "../src/installers.js";

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aum-test-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "t", version: "1.0.0" }));
  return dir;
}

test("init is idempotent and never wipes data", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  m.addTodo("keep me", { agent: "test" });
  m.init(); // re-run
  const todos = JSON.parse(fs.readFileSync(path.join(root, ".memory", "todo.json"), "utf8"));
  assert.equal(todos.length, 1);
});

test("completeTodo returns null on unknown id", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  assert.equal(m.completeTodo("nope"), null);
});

test("mergeBlock preserves existing content and replaces only the marked block", () => {
  const root = tmpProject();
  const f = path.join(root, "CLAUDE.md");
  fs.writeFileSync(f, "# My rules\nkeep this\n");
  mergeBlock(f, "<!-- ai-universal-memory:start -->\nv1\n<!-- ai-universal-memory:end -->");
  mergeBlock(f, "<!-- ai-universal-memory:start -->\nv2\n<!-- ai-universal-memory:end -->");
  const out = fs.readFileSync(f, "utf8");
  assert.ok(out.includes("keep this"));
  assert.ok(out.includes("v2"));
  assert.ok(!out.includes("v1"));
});

test("claude hook uses $CLAUDE_PROJECT_DIR, never an absolute path", () => {
  const root = tmpProject();
  installClaudeHook(root);
  const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude", "settings.json"), "utf8"));
  const cmd = settings.hooks.SessionStart[0].hooks[0].command;
  assert.ok(cmd.includes("$CLAUDE_PROJECT_DIR"));
  assert.ok(!cmd.includes(root));
});

test("brief respects brief_max_chars", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  for (let i = 0; i < 30; i++) m.log({ agent: "t", summary: "x".repeat(200) });
  assert.ok(Array.from(m.brief()).length <= 900);
});

test("registrars do not clobber last_summary", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  m.log({ agent: "t", action: "note", summary: "real work happened" });
  m.addFact({ fact: "sky is blue", status: "confirmed", agent: "t" });
  const state = JSON.parse(fs.readFileSync(path.join(root, ".memory", "state.json"), "utf8"));
  assert.equal(state.last_summary, "real work happened");
});

test("20 concurrent writers lose nothing", async () => {
  const root = tmpProject();
  new ProjectMemory(root).init();
  const cli = path.resolve("bin/aum.js");
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      new Promise((res, rej) =>
        execFile("node", [cli, "log", `evt ${i}`, "--agent", `a${i}`, "--path", root],
          (err) => (err ? rej(err) : res()))
      )
    )
  );
  const lines = fs.readFileSync(path.join(root, ".memory", "events.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.filter(l => l.includes("evt ")).length, 20);
  JSON.parse(fs.readFileSync(path.join(root, ".memory", "state.json"), "utf8")); // must be valid JSON
});

test("search finds facts, decisions, todos and events", () => {
  const root = tmpProject();
  const m = new ProjectMemory(root);
  m.init();
  m.addDecision("Use JWT over sessions", { agent: "t" });
  m.addFact({ fact: "JWT secret lives in env", status: "confirmed", agent: "t" });
  const hits = m.search("jwt");
  assert.ok(hits.length >= 2);
});
```

`package.json`: `"test": "node --test test/"`. A pasta `test/` fica **fora** de `files` (repo only — o tarball continua enxuto).

### P2.2 — CI no GitHub Actions

Criar `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
      - name: e2e smoke — init + doctor on a clean project
        shell: bash
        run: |
          mkdir -p /tmp/smoke && cd /tmp/smoke
          echo '{"name":"smoke","version":"1.0.0"}' > package.json
          node "$GITHUB_WORKSPACE/bin/aum.js" init --no-scan
          node "$GITHUB_WORKSPACE/bin/aum.js" doctor
          node .memory/tools/cli.mjs todo "smoke todo" --agent ci
          node .memory/tools/cli.mjs brief
```

A matriz com **Windows** importa de verdade: o projeto mexe com `path.sep`, hooks e rename atômico — é onde bug de portabilidade aparece.

### P2.3 — Publicação com provenance + types

- Publicar com `npm publish --provenance --access public` via workflow de release (gera o selo de procedência no npm — sinal de confiança barato).
- Criar `src/core.d.ts` com a interface pública de `ProjectMemory` (métodos e shapes de retorno) e apontar `"types": "src/core.d.ts"` no `package.json`. Autocomplete no editor é meio caminho pra estrela de dev.

### P2.4 — README que converte visita em estrela

1. **GIF demo no topo** (nada vende memória como ver o BRIEF aparecer). Gerar com [vhs](https://github.com/charmbracelet/vhs) usando este tape:

```tape
# demo.tape — render: vhs demo.tape
Output demo.gif
Set FontSize 15
Set Width 1000
Set Height 560
Set Theme "Catppuccin Mocha"
Type "npx ai-universal-memory init"
Enter
Sleep 4s
Type "node .memory/tools/cli.mjs todo 'Ship v0.3' --agent claude-code"
Enter
Sleep 1.5s
Type "node .memory/tools/cli.mjs decision 'Vendored engine over npm dependency' --agent claude-code"
Enter
Sleep 1.5s
Type "node .memory/tools/cli.mjs brief"
Enter
Sleep 5s
```

2. **Badges** logo abaixo do título: npm version, CI status, `zero dependencies`, license MIT.
3. **Tabela comparativa** (a seção "What already exists" em prosa é boa, mas tabela escaneia em 5 segundos):

```markdown
|                            | CLAUDE.md / AGENTS.md | MCP memory server | mem0 / cloud memory | **ai-universal-memory** |
|----------------------------|:---------------------:|:-----------------:|:-------------------:|:-----------------------:|
| Vive no git, auditável     | ✅ (estático)         | ❌                | ❌                  | ✅                      |
| Registra eventos/decisões  | ❌                    | parcial           | ✅                  | ✅                      |
| Funciona offline, sem conta| ✅                    | ❌                | ❌                  | ✅                      |
| Agnóstico de engine        | parcial               | só MCP            | SDK próprio         | ✅ (arquivo é a API)    |
| Custo de tokens por sessão | todo o arquivo        | por chamada       | por chamada         | ~150–220 tokens fixos   |
| Sobrevive sem o pacote     | ✅                    | ❌                | ❌                  | ✅ (engine vendorizado) |
```

4. Corrigir a inconsistência 700/900 (P0.6) e adicionar seção **"Uninstall"** (apagar `.memory/`, remover blocos marcados, remover hook) — projeto que ensina a sair passa confiança pra entrar.

### P2.5 — Higiene de repo

- `CONTRIBUTING.md` curto (como rodar testes, regra do zero-dep, engine.mjs é a fonte).
- Templates de issue (bug / feature) e `SECURITY.md` de 5 linhas.
- **Adicionar topics no repo GitHub** (hoje está vazio): `claude-code`, `mcp`, `ai-agents`, `agent-memory`, `context-engineering`, `cursor`, `developer-tools`, `cli`.
- Social preview image (1280×640) — é o que aparece quando o link roda no X/Discord/Reddit.

---

## Critérios de aceite (rodar antes de fechar cada fase)

```bash
# P0
npm test                                              # tudo verde
grep -r "$HOME" .claude/settings.json && exit 1 || true   # nenhum path absoluto em projeto de teste
node bin/aum.js todo-done nao-existe --path /tmp/x; test $? -eq 1   # exit code correto

# P1
node bin/aum.js search "jwt" --path /tmp/x            # retorna hits formatados
node bin/aum.js compact --keep 5 --path /tmp/x        # rotaciona para snapshots/

# P2
npm pack --dry-run                                    # tarball sem test/, com types
# CI verde em ubuntu + windows + macos, node 18/20/22
```

E o teste de fogo final: rodar `aum init` num projeto real, abrir no Claude Code em **outra máquina** (ou apagar e reclonar), e confirmar que o BRIEF carrega sozinho na primeira sessão.

## Checklist de lançamento v0.3.0

- [ ] CHANGELOG.md com todas as entradas desta missão
- [ ] Bump para 0.3.0 + tag `v0.3.0`
- [ ] `npm publish --provenance --access public`
- [ ] demo.gif no README + badges + tabela comparativa
- [ ] Topics no GitHub + social preview
- [ ] Divulgação: Show HN, r/ClaudeAI, r/cursor, dev.to (post "por que memória de projeto tem que viver no git"), PR para as listas awesome-claude-code e awesome-mcp-servers

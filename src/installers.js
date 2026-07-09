// Idempotent installers: never destroy what's already in a target project.
// AGENTS.md / CLAUDE.md get a marked block merged in (existing content is
// preserved). .claude/settings.json gets a hook entry merged into whatever
// hooks/permissions already exist. Everything else we fully own (the skill
// file, the vendored engine) is safe to overwrite because it's ours.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(__dirname, "..");
const TEMPLATES = path.join(PACKAGE_ROOT, "templates");

const BLOCK_START = "<!-- ai-universal-memory:start -->";
const BLOCK_END = "<!-- ai-universal-memory:end -->";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(p) {
  return fs.existsSync(p);
}

function readText(p) {
  return exists(p) ? fs.readFileSync(p, "utf8") : "";
}

function writeText(p, content) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, "utf8");
}

function readJson(p, fallback) {
  try {
    if (!exists(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(p, data) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function toSlash(p) {
  return p.split(path.sep).join("/");
}

/** Merge a marked block into a file, preserving everything else. */
export function mergeBlock(filePath, block) {
  const blockTrimmed = block.trim();
  let content = readText(filePath);

  if (content.includes(BLOCK_START) && content.includes(BLOCK_END)) {
    const startIdx = content.indexOf(BLOCK_START);
    const endIdx = content.indexOf(BLOCK_END) + BLOCK_END.length;
    content = content.slice(0, startIdx) + blockTrimmed + content.slice(endIdx);
  } else if (content.trim().length === 0) {
    content = blockTrimmed + "\n";
  } else {
    content = content.replace(/\s*$/, "") + "\n\n" + blockTrimmed + "\n";
  }

  writeText(filePath, content);
  return filePath;
}

/** Vendor the zero-dependency engine + CLI + hook into <target>/.memory/tools/ */
export function vendorEngine(targetRoot) {
  const toolsDir = path.join(targetRoot, ".memory", "tools");
  ensureDir(toolsDir);

  for (const file of ["engine.mjs", "cli.mjs", "session-start.mjs"]) {
    fs.copyFileSync(path.join(TEMPLATES, file), path.join(toolsDir, file));
  }

  fs.copyFileSync(
    path.join(TEMPLATES, "memory-readme.md"),
    path.join(targetRoot, ".memory", "README.md")
  );

  return toolsDir;
}

export function installSkill(targetRoot) {
  const dest = path.join(targetRoot, ".claude", "skills", "ai-universal-memory", "SKILL.md");
  ensureDir(path.dirname(dest));
  fs.copyFileSync(path.join(TEMPLATES, "SKILL.md"), dest);
  return dest;
}

export function installAgentsMd(targetRoot) {
  const dest = path.join(targetRoot, "AGENTS.md");
  const block = readText(path.join(TEMPLATES, "agents-block.md"));
  mergeBlock(dest, block);
  return dest;
}

export function installClaudeMd(targetRoot) {
  const dest = path.join(targetRoot, "CLAUDE.md");
  const block = readText(path.join(TEMPLATES, "claude-block.md"));
  mergeBlock(dest, block);
  return dest;
}

export function installCursorRule(targetRoot) {
  const dest = path.join(targetRoot, ".cursor", "rules", "ai-universal-memory.mdc");
  const body = `---
description: AI Universal Memory — read .memory/BRIEF.md before working, log actions/decisions/todos/risks as you go.
alwaysApply: true
---

${readText(path.join(TEMPLATES, "agents-block.md")).replace(BLOCK_START, "").replace(BLOCK_END, "").trim()}
`;
  writeText(dest, body);
  return dest;
}

/** Merge a SessionStart hook into .claude/settings.json without touching anything else there. */
export function installClaudeHook(targetRoot) {
  const settingsPath = path.join(targetRoot, ".claude", "settings.json");
  const settings = readJson(settingsPath, {});

  const hookScript = toSlash(path.join(targetRoot, ".memory", "tools", "session-start.mjs"));
  const command = `node "${hookScript}"`;

  settings.hooks = settings.hooks || {};
  settings.hooks.SessionStart = settings.hooks.SessionStart || [];

  const marker = ".memory/tools/session-start.mjs";
  let found = false;
  for (const group of settings.hooks.SessionStart) {
    if (!Array.isArray(group.hooks)) continue;
    for (const h of group.hooks) {
      if (typeof h.command === "string" && h.command.includes(marker)) {
        h.command = command;
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

export function installAll(targetRoot, { engines = ["claude", "agents", "cursor"] } = {}) {
  const results = {};
  vendorEngine(targetRoot);
  results.vendored = true;

  if (engines.includes("claude")) {
    results.skill = installSkill(targetRoot);
    results.claudeMd = installClaudeMd(targetRoot);
    results.claudeHook = installClaudeHook(targetRoot);
  }
  if (engines.includes("agents")) {
    results.agentsMd = installAgentsMd(targetRoot);
  }
  if (engines.includes("cursor")) {
    results.cursorRule = installCursorRule(targetRoot);
  }

  return results;
}

export function doctor(targetRoot) {
  const checks = [];

  const memoryDir = path.join(targetRoot, ".memory");
  checks.push({ name: ".memory/ data dir", ok: exists(memoryDir) });
  checks.push({ name: ".memory/state.json", ok: exists(path.join(memoryDir, "state.json")) });
  checks.push({ name: ".memory/BRIEF.md", ok: exists(path.join(memoryDir, "BRIEF.md")) });
  checks.push({ name: ".memory/tools/engine.mjs (vendored)", ok: exists(path.join(memoryDir, "tools", "engine.mjs")) });
  checks.push({ name: ".memory/tools/cli.mjs (vendored)", ok: exists(path.join(memoryDir, "tools", "cli.mjs")) });
  checks.push({ name: ".memory/tools/session-start.mjs (vendored)", ok: exists(path.join(memoryDir, "tools", "session-start.mjs")) });

  const claudeMd = readText(path.join(targetRoot, "CLAUDE.md"));
  checks.push({ name: "CLAUDE.md has memory block", ok: claudeMd.includes(BLOCK_START) });

  const agentsMd = readText(path.join(targetRoot, "AGENTS.md"));
  checks.push({ name: "AGENTS.md has memory block", ok: agentsMd.includes(BLOCK_START) });

  checks.push({ name: ".claude/skills/ai-universal-memory/SKILL.md", ok: exists(path.join(targetRoot, ".claude", "skills", "ai-universal-memory", "SKILL.md")) });

  const settings = readJson(path.join(targetRoot, ".claude", "settings.json"), {});
  const hookInstalled = Boolean(
    settings.hooks &&
    settings.hooks.SessionStart &&
    settings.hooks.SessionStart.some(g => (g.hooks || []).some(h => (h.command || "").includes("session-start.mjs")))
  );
  checks.push({ name: ".claude/settings.json SessionStart hook", ok: hookInstalled });

  checks.push({ name: ".cursor/rules/ai-universal-memory.mdc", ok: exists(path.join(targetRoot, ".cursor", "rules", "ai-universal-memory.mdc")) });

  return checks;
}

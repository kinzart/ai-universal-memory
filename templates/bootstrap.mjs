// AI Universal Memory — first-init project bootstrap.
// Runs once, only on a brand-new `aum init`, so a project never starts
// from a truly empty BRIEF.md. Purely local: reads package.json, README,
// top-level directory names and git status via the local `git` binary if
// present. No network calls, nothing leaves the machine. Best-effort and
// defensive throughout — a scan failure never breaks `init`.
//
// This lives in the package only (not vendored into target projects):
// it's an init-time concern, not something the durable local CLI needs.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".memory", ".claude", ".cursor",
  "dist", "build", "out", ".next", ".nuxt", ".venv", "venv",
  "__pycache__", ".cache", "coverage", ".turbo", ".vercel"
]);

const MAX_SCANNED_ENTRIES = 5000;

function safeRead(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function findPackageJsons(root, maxDepth = 3) {
  const found = [];
  let visited = 0;

  function walk(dir, depth) {
    if (depth > maxDepth || visited > MAX_SCANNED_ENTRIES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (visited++ > MAX_SCANNED_ENTRIES) return;
      if (IGNORE_DIRS.has(e.name)) continue;
      if (e.isDirectory()) {
        walk(path.join(dir, e.name), depth + 1);
      } else if (e.isFile() && e.name === "package.json") {
        found.push(path.join(dir, "package.json"));
      }
    }
  }

  walk(root, 0);
  return found;
}

function topLevelEntries(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(e => !IGNORE_DIRS.has(e.name) && !e.name.startsWith("."))
      .map(e => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
  } catch {
    return [];
  }
}

function readmeSummary(root) {
  for (const name of ["README.md", "Readme.md", "readme.md"]) {
    const raw = safeRead(path.join(root, name));
    if (!raw) continue;
    let para = "";
    for (const rawLine of raw.split("\n")) {
      const line = rawLine.trim();
      if (!line) {
        if (para) break;
        continue;
      }
      if (line.startsWith("#") || line.startsWith("[![") || line.startsWith("![")) continue;
      para += (para ? " " : "") + line;
      if (para.length > 240) break;
    }
    if (para) return { file: name, text: para.slice(0, 300) };
  }
  return null;
}

function gitAvailable() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function gitInfo(root) {
  const hasGitDir = fs.existsSync(path.join(root, ".git"));
  if (!hasGitDir) return { present: false };
  if (!gitAvailable()) return { present: true, checked: false };

  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "ignore" });
  } catch {
    return { present: true, checked: true, valid: false };
  }

  const tryCmd = (args) => {
    try {
      return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return null;
    }
  };

  return {
    present: true,
    checked: true,
    valid: true,
    branch: tryCmd(["branch", "--show-current"]) || null,
    commitCount: Number(tryCmd(["rev-list", "--count", "HEAD"])) || 0,
    remote: tryCmd(["remote", "get-url", "origin"])
  };
}

export function runBootstrap(memory, root) {
  const agent = "ai-universal-memory";

  const rootPkgRaw = safeRead(path.join(root, "package.json"));
  if (rootPkgRaw) {
    try {
      const pkg = JSON.parse(rootPkgRaw);
      const id = [pkg.name, pkg.version].filter(Boolean).join("@") || "(unnamed package)";
      const desc = pkg.description ? ` — ${pkg.description}` : "";
      memory.addFact({ fact: `Root package: ${id}${desc}`, status: "confirmed", source: "package.json", agent });

      const scripts = pkg.scripts ? Object.keys(pkg.scripts) : [];
      if (scripts.length) {
        memory.addFact({ fact: `Root npm scripts: ${scripts.join(", ")}`, status: "confirmed", source: "package.json#scripts", agent });
      }
    } catch {
      // malformed package.json — not our problem to fix here
    }
  }

  const otherPkgs = findPackageJsons(root, 3).filter(p => p !== path.join(root, "package.json"));
  if (otherPkgs.length) {
    const rel = otherPkgs.map(p => path.relative(root, p).split(path.sep).join("/")).slice(0, 15);
    memory.addFact({
      fact: `Additional package.json found besides the root one: ${rel.join(", ")}. There may be more than one app/module root here — confirm which is active before editing.`,
      status: "needs_validation",
      source: "init directory scan",
      agent
    });
  }

  const readme = readmeSummary(root);
  if (readme) {
    memory.addFact({ fact: `Project description (from ${readme.file}): ${readme.text}`, status: "confirmed", source: readme.file, agent });
  }

  const entries = topLevelEntries(root);
  if (entries.length) {
    memory.addFact({ fact: `Top-level entries: ${entries.join(", ")}`, status: "confirmed", source: "init directory scan", agent });
  }

  const git = gitInfo(root);
  if (!git.present) {
    memory.addFact({ fact: "No .git directory at project root — not under git version control yet, or the repo lives elsewhere.", status: "confirmed", source: "init git check", agent });
  } else if (git.checked === false) {
    // .git exists but the git binary isn't available to inspect it — say nothing rather than guess.
  } else if (!git.valid) {
    memory.addRisk("A .git folder exists at the project root but is not a valid, initialized git repository (git commands fail here) — work may not be version-controlled.", { agent, severity: "medium" });
    memory.addTodo("Investigate the .git folder at project root: run `git init` for real here, or remove it if versioning lives elsewhere.", { agent });
  } else {
    const parts = [];
    if (git.branch) parts.push(`branch ${git.branch}`);
    if (typeof git.commitCount === "number") parts.push(`${git.commitCount} commit(s)`);
    if (git.remote) parts.push(`remote ${git.remote}`);
    memory.addFact({ fact: `Git repo detected${parts.length ? " — " + parts.join(", ") : ""}.`, status: "confirmed", source: "init git check", agent });
  }
}
